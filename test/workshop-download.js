// Live download smoke test. Does not upload, delete or subscribe to an item.
// Usage: node test/workshop-download.js <appId> <itemId> [timeoutMs]
const { init, SteamCallback } = require('../index.js');

async function main() {
    const appId = Number(process.argv[2]);
    const itemIdText = process.argv[3];
    const timeoutMs = Number(process.argv[4] || 120000);
    if (!Number.isInteger(appId) || appId <= 0 || appId > 0xffffffff ||
        !itemIdText || !/^[1-9][0-9]*$/.test(itemIdText) ||
        !Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 0x7fffffff) {
        throw new Error('Usage: node test/workshop-download.js <appId> <itemId> [timeoutMs]');
    }
    const itemId = BigInt(itemIdText);
    if (itemId > 0xffffffffffffffffn) throw new Error('itemId exceeds uint64');

    const client = init(appId);
    const handles = [];
    let timer;
    const cleanup = () => {
        clearTimeout(timer);
        handles.forEach(handle => handle.disconnect());
    };
    const interrupted = () => {
        cleanup();
        process.exit(130);
    };
    process.once('SIGINT', interrupted);

    try {
        await new Promise((resolve, reject) => {
            handles.push(client.callback.register(SteamCallback.DownloadItemResult, event => {
                if (event.app_id !== appId || event.published_file_id !== itemIdText) return;
                console.log('Download completion:', event);
                if (event.result === 1) resolve();
                else reject(new Error(`Steam download failed with EResult ${event.result}`));
            }));
            handles.push(client.callback.register(SteamCallback.ItemInstalled, event => {
                if (event.app_id === appId && event.published_file_id === itemIdText) {
                    console.log('Installation:', event);
                }
            }));
            handles.push(client.callback.register(SteamCallback.UserSubscribedItemsListChanged, event => {
                if (event.app_id === appId) console.log('Subscriptions changed for this app.');
            }));
            timer = setTimeout(() => reject(new Error('Timed out waiting for DownloadItemResult')), timeoutMs);
            if (!client.workshop.download(itemId, true)) reject(new Error('Steam rejected the download request'));
        });

        // Access install information only after the matching successful result.
        const info = client.workshop.installInfo(itemId);
        if (!info) throw new Error('Download completed but install information is unavailable');
        console.log('Installed content:', info);
    } finally {
        cleanup();
        process.removeListener('SIGINT', interrupted);
    }
}

main().then(
    () => process.exit(0),
    error => {
        console.error(error.message);
        process.exit(1);
    }
);
