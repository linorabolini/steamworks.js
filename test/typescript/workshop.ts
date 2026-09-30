import { Client, SteamCallback } from '../..';

// Compile-only coverage of register() inference. No Steam session is started.
export function registerWorkshopCallbacks(client: Client) {
    return [
        client.callback.register(SteamCallback.DownloadItemResult, event => {
            const appId: number = event.app_id;
            const itemId: string = event.published_file_id;
            const result: number = event.result;
            // @ts-expect-error uint64 callback IDs must not be JavaScript numbers.
            const unsafeId: number = event.published_file_id;
            void [appId, itemId, result, unsafeId];
        }),
        client.callback.register(SteamCallback.ItemInstalled, event => {
            const appId: number = event.app_id;
            const itemId: string = event.published_file_id;
            const legacyContent: string = event.legacy_content;
            const manifestId: string = event.manifest_id;
            // @ts-expect-error installation events do not provide a download result.
            const result: number = event.result;
            void [appId, itemId, legacyContent, manifestId, result];
        }),
        client.callback.register(SteamCallback.UserSubscribedItemsListChanged, event => {
            const appId: number = event.app_id;
            // @ts-expect-error reconcile subscriptions instead of expecting an item ID.
            const itemId: string = event.published_file_id;
            void [appId, itemId];
        }),
    ];
}
