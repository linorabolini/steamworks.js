[![Build Status](https://github.com/ceifa/steamworks.js/actions/workflows/publish.yml/badge.svg)](https://github.com/ceifa/steamworks.js/actions/workflows/publish.yml)
[![npm](https://img.shields.io/npm/v/steamworks.js.svg)](https://npmjs.com/package/steamworks.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chat](https://img.shields.io/discord/663831597690257431?label=chat&logo=discord)](https://discord.gg/H6B7UE7fMY)

# Steamworks.js

A modern implementation of the Steamworks SDK for HTML/JS and NodeJS based applications.

## Why

I used [greenworks](https://github.com/greenheartgames/greenworks) for a long time and it's great, but I gave up for the following reasons.

* It's not being maintained anymore.
* It's not up to date.
* It's not context-aware.
* You have to build the binaries by yourself.
* Don't have typescript definitions.
* The API it's not trustful.
* The API implement callbacks instead of return flags or promises.
* I hate C++.

## API

```js
const steamworks = require('steamworks.js')

// You can pass an appId, or don't pass anything and use a steam_appid.txt file
const client = steamworks.init(480)

// Print Steam username
console.log(client.localplayer.getName())

// Tries to activate an achievement
if (client.achievement.activate('ACHIEVEMENT')) {
    // ...
}
```

You can refer to the [declarations file](./client.d.ts) to check the API support and get more detailed documentation of each function.

## Workshop callbacks

This fork adds `DownloadItemResult`, `ItemInstalled`, and
`UserSubscribedItemsListChanged` to `SteamCallback`. Existing callback enum
values are preserved. The SDK and Rust dependency revisions remain unchanged.

New Workshop callback payloads keep all 64-bit IDs as **decimal strings**,
including `published_file_id`, `legacy_content`, and `manifest_id`. Convert
them with `BigInt(value)` when calling a native Workshop method. Existing
callback payloads are unchanged. See `callbacks.d.ts` for their types.

Register before downloading, filter by both app and item, and retain/disconnect
the callback handle:

```js
const { init, SteamCallback } = require('steamworks.js');
const appId = 480; // Replace with your game's App ID.
const itemId = 1234567890n; // Replace with an accessible item for that app.
const client = init(appId);

const handle = client.callback.register(SteamCallback.DownloadItemResult, event => {
    if (event.app_id !== appId || event.published_file_id !== itemId.toString()) return;
    handle.disconnect();
    if (event.result !== 1) {
        console.error('Download failed:', event.result);
        return;
    }
    console.log(client.workshop.installInfo(itemId));
});

if (!client.workshop.download(itemId, true)) {
    handle.disconnect();
    throw new Error('Steam rejected the download request');
}
```

`download()` returning `true` means the request was accepted. Wait for the
matching successful completion before accessing content, including content
that was already installed. Apply an application timeout and disconnect on
shutdown. `ItemInstalled` can trigger revalidation of installed content;
`UserSubscribedItemsListChanged` identifies the app whose subscriptions should
be reconciled. Callbacks use the existing client and callback pump.

Offline validation after building:

```sh
npm run build
npm run test:workshop
```

For a live test, configure Workshop for your own App ID, run Steam with an
entitled account, and use an existing accessible item:

```sh
node test/workshop-download.js APP_ID ITEM_ID
```

The smoke test requests a download but does not upload, delete, or permanently
subscribe. It filters events, enforces a timeout, and disconnects handles. A
successful offline build does not establish live Workshop or overlay behavior.

## Installation

To use steamworks.js you don't have to build anything, just install it from npm:

```sh
$: npm i steamworks.js
```

### Electron

Steamworks.js is a native module and cannot be used by default in the renderer process. To enable the usage of native modules on the renderer process, the following configurations should be made on `main.js`:

```js
const mainWindow = new BrowserWindow({
    // ...
    webPreferences: {
        // ...
        contextIsolation: false,
        nodeIntegration: true
    }
})
```

To make the steam overlay working, call the `electronEnableSteamOverlay` on the end of your `main.js` file:

```js
require('steamworks.js').electronEnableSteamOverlay()
```

For the production build, copy the relevant distro files from `sdk/redistributable_bin/{YOUR_DISTRO}` into the root of your build. If you are using electron-forge, look for [#75](https://github.com/ceifa/steamworks.js/issues/75).


## How to build

> You **only** need to build if you are going to change something on steamworks.js code, if you are looking to just consume the library or use it in your game, refer to the [installation section](#installation).

Make sure you have the latest [node.js](https://nodejs.org/en/), [Rust](https://www.rust-lang.org/tools/install) and [Clang](https://rust-lang.github.io/rust-bindgen/requirements.html). We also need [Steam](https://store.steampowered.com/about/) installed and running.

Install dependencies with `npm install` and then run `npm run build:debug` to build the library.

There is no way to build for all targets easily. The good news is that you don't need to. You can develop and test on your current target, and open a PR. When the code is merged to main, a github action will build for all targets and publish a new version.

### Testing Electron

Go to the [test/electron](./test/electron) directory. There, you can run `npm install` and then `npm start` to run the Electron app.

Click "activate overlay" to test the overlay.
