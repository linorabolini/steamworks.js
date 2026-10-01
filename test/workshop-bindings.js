// Checks the built addon without initializing Steam or changing subscriptions.
const assert = require('node:assert/strict');
const steamworks = require('../index.js');

const expected = {
    PersonaStateChange: 0,
    SteamServersConnected: 1,
    SteamServersDisconnected: 2,
    SteamServerConnectFailure: 3,
    LobbyDataUpdate: 4,
    LobbyChatUpdate: 5,
    P2PSessionRequest: 6,
    P2PSessionConnectFail: 7,
    GameLobbyJoinRequested: 8,
    MicroTxnAuthorizationResponse: 9,
    DownloadItemResult: 10,
    ItemInstalled: 11,
    UserSubscribedItemsListChanged: 12,
};

for (const [name, value] of Object.entries(expected)) {
    assert.equal(steamworks.SteamCallback[name], value, name);
}
assert.equal(typeof steamworks.init, 'function');
console.log('Built addon loaded; existing and Workshop callback values verified.');
