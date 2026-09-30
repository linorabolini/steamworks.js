//! Workshop callbacks missing from the JavaScript binding. Match the pinned
//! SDK's layouts and serialize every 64-bit identifier as a decimal string.

use std::{ffi::c_void, mem::size_of, ptr};

use serde::Serialize;
use steamworks::{sys, Callback};

#[derive(Debug, Serialize)]
pub(crate) struct DownloadItemResult {
    app_id: u32,
    published_file_id: String,
    result: i32,
}

// SAFETY: ID and SIZE come from this SDK callback; fields are read using its
// layout. Unaligned reads accommodate the SDK's platform-specific packing.
unsafe impl Callback for DownloadItemResult {
    const ID: i32 = sys::DownloadItemResult_t_k_iCallback as i32;
    const SIZE: i32 = size_of::<sys::DownloadItemResult_t>() as i32;

    unsafe fn from_raw(raw: *mut c_void) -> Self {
        let event = raw.cast::<sys::DownloadItemResult_t>();
        Self {
            app_id: ptr::addr_of!((*event).m_unAppID).read_unaligned(),
            published_file_id: ptr::addr_of!((*event).m_nPublishedFileId)
                .read_unaligned()
                .to_string(),
            // Read the integer ABI representation so future EResult values do
            // not require constructing an unknown Rust enum discriminant.
            result: ptr::addr_of!((*event).m_eResult)
                .cast::<i32>()
                .read_unaligned(),
        }
    }
}

#[derive(Debug, Serialize)]
pub(crate) struct ItemInstalled {
    app_id: u32,
    published_file_id: String,
    legacy_content: String,
    manifest_id: String,
}

// SAFETY: The callback ID, size and field layout are those of ItemInstalled_t.
unsafe impl Callback for ItemInstalled {
    const ID: i32 = sys::ItemInstalled_t_k_iCallback as i32;
    const SIZE: i32 = size_of::<sys::ItemInstalled_t>() as i32;

    unsafe fn from_raw(raw: *mut c_void) -> Self {
        let event = raw.cast::<sys::ItemInstalled_t>();
        Self {
            app_id: ptr::addr_of!((*event).m_unAppID).read_unaligned(),
            published_file_id: ptr::addr_of!((*event).m_nPublishedFileId)
                .read_unaligned()
                .to_string(),
            legacy_content: ptr::addr_of!((*event).m_hLegacyContent)
                .read_unaligned()
                .to_string(),
            manifest_id: ptr::addr_of!((*event).m_unManifestID)
                .read_unaligned()
                .to_string(),
        }
    }
}

#[derive(Debug, Serialize)]
pub(crate) struct UserSubscribedItemsListChanged {
    app_id: u32,
}

// SAFETY: The callback ID, size and field layout match the pinned SDK type.
unsafe impl Callback for UserSubscribedItemsListChanged {
    const ID: i32 = sys::UserSubscribedItemsListChanged_t_k_iCallback as i32;
    const SIZE: i32 = size_of::<sys::UserSubscribedItemsListChanged_t>() as i32;

    unsafe fn from_raw(raw: *mut c_void) -> Self {
        let event = raw.cast::<sys::UserSubscribedItemsListChanged_t>();
        Self {
            app_id: ptr::addr_of!((*event).m_nAppID).read_unaligned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn download_preserves_full_item_id_and_native_result() {
        for (result, code) in [
            (sys::EResult::k_EResultOK, 1),
            (sys::EResult::k_EResultAccessDenied, 15),
        ] {
            let mut event = sys::DownloadItemResult_t {
                m_unAppID: 480,
                m_nPublishedFileId: u64::MAX,
                m_eResult: result,
            };
            let decoded = unsafe {
                DownloadItemResult::from_raw((&mut event as *mut sys::DownloadItemResult_t).cast())
            };
            assert_eq!(
                serde_json::to_value(decoded).unwrap(),
                json!({
                    "app_id": 480,
                    "published_file_id": "18446744073709551615",
                    "result": code,
                })
            );
        }
    }

    #[test]
    fn download_keeps_unknown_result_codes() {
        // Use deliberately unaligned raw storage, without constructing a Rust
        // SDK struct that contains an invalid enum discriminant.
        let mut bytes = vec![0u8; size_of::<sys::DownloadItemResult_t>() + 1];
        let event = unsafe { bytes.as_mut_ptr().add(1) }.cast::<sys::DownloadItemResult_t>();
        unsafe {
            ptr::addr_of_mut!((*event).m_unAppID).write_unaligned(480);
            ptr::addr_of_mut!((*event).m_nPublishedFileId).write_unaligned(42);
            ptr::addr_of_mut!((*event).m_eResult)
                .cast::<i32>()
                .write_unaligned(2047);
        }
        let decoded = unsafe { DownloadItemResult::from_raw(event.cast()) };
        assert_eq!(decoded.result, 2047);
        assert_eq!(decoded.app_id, 480);
        assert_eq!(decoded.published_file_id, "42");
    }

    #[test]
    fn installation_preserves_all_identifiers_above_js_integer_precision() {
        let mut event = sys::ItemInstalled_t {
            m_unAppID: 480,
            m_nPublishedFileId: 9_007_199_254_740_993,
            m_hLegacyContent: u64::MAX,
            m_unManifestID: 9_007_199_254_740_995,
        };
        let decoded =
            unsafe { ItemInstalled::from_raw((&mut event as *mut sys::ItemInstalled_t).cast()) };
        assert_eq!(
            serde_json::to_value(decoded).unwrap(),
            json!({
                "app_id": 480,
                "published_file_id": "9007199254740993",
                "legacy_content": "18446744073709551615",
                "manifest_id": "9007199254740995",
            })
        );
    }

    #[test]
    fn subscription_change_identifies_the_app() {
        let mut event = sys::UserSubscribedItemsListChanged_t { m_nAppID: 480 };
        let decoded = unsafe {
            UserSubscribedItemsListChanged::from_raw(
                (&mut event as *mut sys::UserSubscribedItemsListChanged_t).cast(),
            )
        };
        assert_eq!(
            serde_json::to_value(decoded).unwrap(),
            json!({ "app_id": 480 })
        );
    }

    #[test]
    fn workshop_callbacks_match_sdk_abi_and_keep_existing_enum_values() {
        use crate::api::callback::callback::SteamCallback;

        assert_eq!(SteamCallback::PersonaStateChange as u32, 0);
        assert_eq!(SteamCallback::MicroTxnAuthorizationResponse as u32, 9);
        assert_eq!(SteamCallback::DownloadItemResult as u32, 10);
        assert_eq!(SteamCallback::ItemInstalled as u32, 11);
        assert_eq!(SteamCallback::UserSubscribedItemsListChanged as u32, 12);
        assert_eq!(DownloadItemResult::ID, 3406);
        assert_eq!(ItemInstalled::ID, 3405);
        assert_eq!(UserSubscribedItemsListChanged::ID, 3418);
        assert_eq!(
            DownloadItemResult::SIZE as usize,
            size_of::<sys::DownloadItemResult_t>()
        );
        assert_eq!(
            ItemInstalled::SIZE as usize,
            size_of::<sys::ItemInstalled_t>()
        );
        assert_eq!(
            UserSubscribedItemsListChanged::SIZE as usize,
            size_of::<sys::UserSubscribedItemsListChanged_t>()
        );
        assert_eq!(size_of::<sys::EResult>(), size_of::<i32>());
    }
}
