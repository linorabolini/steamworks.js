// One private Workshop item, with a persistent ID and known downloaded bytes.
// Usage: node test/workshop-private-item.js prepare|revise|upload|verify|exercise APP_ID PROJECT_DIR
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const [operation, appText, folder] = process.argv.slice(2);
const appId = Number(appText);
const project = folder && path.resolve(folder);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let state;

function save() {
    const target = path.join(project, 'project.json');
    fs.writeFileSync(`${target}.tmp`, JSON.stringify(state, null, 2) + '\n');
    fs.renameSync(`${target}.tmp`, target);
}

function previewPng() {
    function chunk(type, data) {
        const body = Buffer.concat([Buffer.from(type), data]);
        let crc = 0xffffffff;
        for (const byte of body) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
        const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
        return Buffer.concat([length, body, checksum]);
    }
    const size = 256;
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header[8] = 8;
    header[9] = 2; // RGB
    const pixels = Buffer.alloc(size * (1 + size * 3));
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const at = y * (1 + size * 3) + 1 + x * 3;
            const gold = x > 64 && x < 192 && y > 64 && y < 192;
            pixels[at] = gold ? 240 : 24;
            pixels[at + 1] = gold ? 190 : 48;
            pixels[at + 2] = gold ? 60 : 80;
        }
    }
    return Buffer.concat([
        Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
    ]);
}

function prepare() {
    fs.mkdirSync(path.join(project, 'content'), { recursive: true });
    const stateFile = path.join(project, 'project.json');
    if (fs.existsSync(stateFile)) {
        state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        validate();
        console.log('Reusing prepared project; item ID:', state.itemId || '(not created)');
        return;
    }
    const probe = Buffer.from(JSON.stringify({
        purpose: 'Steam Workshop private download smoke test',
        appId, marker: crypto.randomUUID(),
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(project, 'content', 'probe.json'), probe);
    fs.writeFileSync(path.join(project, 'preview.png'), previewPng());
    state = { schemaVersion: 1, appId, itemId: null, phase: 'prepared',
        sha256: hash(probe), createdAt: new Date().toISOString() };
    save();
    console.log('Prepared private test content at', project);
    console.log('Expected SHA-256:', state.sha256);
}

function validate() {
    if (state.schemaVersion !== 1 || state.appId !== appId) throw new Error('Project App ID/schema mismatch');
    if (hash(fs.readFileSync(path.join(project, 'content', 'probe.json'))) !== state.sha256) {
        throw new Error('Local probe changed; preserve the known test content');
    }
    if (state.itemId && !/^[1-9][0-9]*$/.test(state.itemId)) throw new Error('Invalid stored item ID');
    if (state.itemId && BigInt(state.itemId) > 0xffffffffffffffffn) throw new Error('Item ID exceeds uint64');
}

function revise() {
    const file = path.join(project, 'content', 'probe.json');
    const probe = JSON.parse(fs.readFileSync(file, 'utf8'));
    probe.revision = (probe.revision || 1) + 1;
    const bytes = Buffer.from(JSON.stringify(probe, null, 2) + '\n');
    fs.writeFileSync(file, bytes);
    state.previousSha256 = state.sha256;
    state.sha256 = hash(bytes);
    state.phase = 'revised';
    delete state.verifiedAt;
    save();
    console.log('Prepared revision', probe.revision, 'for existing item', state.itemId);
}

async function upload() {
    if (!state.itemId && state.phase === 'creating') {
        throw new Error('Previous item creation has an unknown outcome. Inspect your Workshop before creating another item.');
    }
    const client = require('../index.js').init(appId);
    const watchdog = setTimeout(() => {
        console.error('Timed out. The operation may still complete on Steam; saved project state is retained.');
        process.exit(1);
    }, 180000);
    try {
        if (!state.itemId) {
            state.phase = 'creating';
            save();
            let result;
            try { result = await client.workshop.createItem(appId); }
            catch (error) { state.phase = 'create-failed'; save(); throw error; }
            state.itemId = result.itemId.toString();
            state.phase = 'created';
            state.needsToAcceptAgreement = result.needsToAcceptAgreement;
            save(); // Retain the ID before uploading or handling an agreement.
            console.log('Created item:', state.itemId);
        }
        state.phase = 'uploading';
        save();
        const details = {
            title: 'Workshop bridge private smoke test',
            description: 'Developer-only verification of upload, download callbacks, and installed file bytes. This is a test fixture, not a playable tile pack.',
            changeNote: 'Private native bridge smoke test',
            contentPath: path.join(project, 'content'),
            previewPath: path.join(project, 'preview.png'),
            visibility: client.workshop.UgcItemVisibility.Private,
        };
        let result;
        try { result = await client.workshop.updateItem(BigInt(state.itemId), details, appId); }
        catch (error) {
            state.phase = 'upload-failed';
            state.lastError = error.message;
            save();
            throw error;
        }
        state.phase = 'uploaded';
        delete state.lastError;
        state.needsToAcceptAgreement = result.needsToAcceptAgreement;
        state.uploadedAt = new Date().toISOString();
        save();
        console.log('Uploaded with Private visibility:', state.itemId);
        console.log('Item page:', `https://steamcommunity.com/sharedfiles/filedetails/?id=${state.itemId}`);
        if (state.needsToAcceptAgreement) {
            console.log('Steam requests Workshop agreement acceptance. The account owner must complete it.');
            process.exitCode = 2;
        }
    } finally { clearTimeout(watchdog); }
}

function verify() {
    if (!state.itemId) throw new Error('No uploaded item ID in this project');
    // Run only after the matching successful DownloadItemResult from the smoke script.
    const client = require('../index.js').init(appId);
    const info = client.workshop.installInfo(BigInt(state.itemId));
    if (!info) throw new Error('Installed content is unavailable');
    const actual = hash(fs.readFileSync(path.join(info.folder, 'probe.json')));
    if (actual !== state.sha256) throw new Error('Downloaded content does not match the uploaded probe');
    state.verifiedAt = new Date().toISOString();
    state.installedFolder = info.folder;
    save();
    console.log('Downloaded bytes match SHA-256:', actual);
    console.log('Installed folder:', info.folder);
}

async function exercise() {
    if (!state.itemId || state.phase !== 'uploaded') throw new Error('Upload the current revision before exercising it');
    const { init, SteamCallback } = require('../index.js');
    const client = init(appId);
    const itemId = BigInt(state.itemId);
    const wasSubscribed = client.workshop.getSubscribedItems().includes(itemId);
    const handles = [];
    const subscriptions = [];
    let installed;
    let timer;
    let resolveDownload, rejectDownload;
    const downloaded = new Promise((resolve, reject) => { resolveDownload = resolve; rejectDownload = reject; });
    // Subscribe before initiating the download; consume the Promise immediately
    // so a synchronous request failure cannot leave an unhandled rejection.
    downloaded.catch(() => {});
    const settleEvents = () => new Promise(resolve => setTimeout(resolve, 500));
    async function restoreSubscription() {
        if (!wasSubscribed && client.workshop.getSubscribedItems().includes(itemId)) {
            await client.workshop.unsubscribe(itemId);
            await settleEvents();
        }
    }
    const interrupted = async () => {
        try { await restoreSubscription(); }
        finally { process.exit(130); }
    };
    process.once('SIGINT', interrupted);
    try {
        handles.push(client.callback.register(SteamCallback.DownloadItemResult, event => {
            if (event.app_id !== appId || event.published_file_id !== state.itemId) return;
            console.log('Download completion:', event);
            if (event.result === 1) resolveDownload(event);
            else rejectDownload(new Error(`Steam download failed with EResult ${event.result}`));
        }));
        handles.push(client.callback.register(SteamCallback.ItemInstalled, event => {
            if (event.app_id !== appId || event.published_file_id !== state.itemId) return;
            installed = event;
            console.log('Installation:', event);
        }));
        handles.push(client.callback.register(SteamCallback.UserSubscribedItemsListChanged, event => {
            if (event.app_id !== appId) return;
            subscriptions.push(event);
            console.log('Subscription change:', event);
        }));
        timer = setTimeout(() => rejectDownload(new Error('Download callback timed out')), 120000);
        if (!wasSubscribed) await client.workshop.subscribe(itemId);
        if (!client.workshop.download(itemId, true)) throw new Error('Steam rejected download');
        const completion = await downloaded;
        await settleEvents();
        const info = client.workshop.installInfo(itemId);
        if (!info || hash(fs.readFileSync(path.join(info.folder, 'probe.json'))) !== state.sha256) {
            throw new Error('Installed content does not match the current uploaded revision');
        }
        await restoreSubscription();
        state.verifiedAt = new Date().toISOString();
        state.liveResults = { runtime: process.versions.electron ? `Electron ${process.versions.electron}` : `Node ${process.versions.node}`,
            completion, installed: installed || null, subscriptionChanges: subscriptions.length,
            subscriptionRestored: client.workshop.getSubscribedItems().includes(itemId) === wasSubscribed,
            sha256: state.sha256, installedFolder: info.folder };
        save();
        console.log('Live results:', JSON.stringify(state.liveResults, null, 2));
        if (!state.liveResults.subscriptionRestored) throw new Error('Subscription state was not restored');
    } finally {
        clearTimeout(timer);
        await restoreSubscription();
        handles.forEach(handle => handle.disconnect());
        process.removeListener('SIGINT', interrupted);
    }
}

async function main() {
    if (!['prepare', 'revise', 'upload', 'verify', 'exercise'].includes(operation) || !project ||
        !Number.isInteger(appId) || appId < 1 || appId > 0xffffffff) {
        throw new Error('Usage: node test/workshop-private-item.js prepare|revise|upload|verify|exercise APP_ID PROJECT_DIR');
    }
    if (operation === 'prepare') return prepare();
    state = JSON.parse(fs.readFileSync(path.join(project, 'project.json'), 'utf8'));
    validate();
    if (operation === 'upload') await upload();
    else if (operation === 'exercise') await exercise();
    else if (operation === 'revise') revise();
    else verify();
}

main().then(
    () => process.exit(process.exitCode || 0),
    error => { console.error(error.message); process.exit(1); },
);
