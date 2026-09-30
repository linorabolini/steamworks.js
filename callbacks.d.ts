import client = require('./client')

export const enum ChatMemberStateChange {
    /** This user has joined or is joining the lobby. */
    Entered,
    /** This user has left or is leaving the lobby. */
    Left,
    /** User disconnected without leaving the lobby first. */
    Disconnected,
    /** The user has been kicked. */
    Kicked,
    /** The user has been kicked and banned. */
    Banned,
}

/** IDs are decimal strings so native JSON conversion cannot lose uint64 precision. */
export interface WorkshopDownloadItemResult {
    app_id: number
    published_file_id: string
    /** Steam EResult: 1 means success; unknown future result codes are preserved. */
    result: number
}

export interface WorkshopItemInstalled {
    app_id: number
    published_file_id: string
    legacy_content: string
    manifest_id: string
}

export interface WorkshopUserSubscribedItemsListChanged {
    app_id: number
}

export interface CallbackReturns {
    [client.callback.SteamCallback.DownloadItemResult]: WorkshopDownloadItemResult
    [client.callback.SteamCallback.ItemInstalled]: WorkshopItemInstalled
    [client.callback.SteamCallback.UserSubscribedItemsListChanged]: WorkshopUserSubscribedItemsListChanged
    [client.callback.SteamCallback.PersonaStateChange]: {
        steam_id: bigint
        flags: { bits: number }
    }
    [client.callback.SteamCallback.SteamServersConnected]: {}
    [client.callback.SteamCallback.SteamServersDisconnected]: {
        reason: number
    }
    [client.callback.SteamCallback.SteamServerConnectFailure]: {
        reason: number
        still_retrying: boolean
    }
    [client.callback.SteamCallback.LobbyDataUpdate]: {
        lobby: bigint
        member: bigint
        success: boolean
    }
    [client.callback.SteamCallback.LobbyChatUpdate]: {
        lobby: bigint
        user_changed: bigint
        making_change: bigint
        member_state_change: ChatMemberStateChange
    }
    [client.callback.SteamCallback.P2PSessionRequest]: {
        remote: bigint
    }
    [client.callback.SteamCallback.P2PSessionConnectFail]: {
        remote: bigint
        error: number
    }
    [client.callback.SteamCallback.GameLobbyJoinRequested]: {
        lobby_steam_id: bigint
        friend_steam_id: bigint
    }
    [client.callback.SteamCallback.MicroTxnAuthorizationResponse]: {
        app_id: number
        order_id: number | bigint
        authorized: boolean
    }
}
