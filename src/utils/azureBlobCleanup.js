const { supabase, supabaseAdmin, blobServiceClient, containerName } = require('../db/config');

/**
 * Delete HLS and progressive audio blobs for tracks that no longer exist in the DB.
 * Scans Azure Blob Storage under prefixes:
 *  - hls/track_<track_id>/...
 *  - audio/track_<track_id>_...
 * Compares <track_id> against Supabase `tracks.track_id` and deletes blobs whose track_id is missing.
 *
 * @param {Object} opts
 * @param {boolean} [opts.dryRun=false] If true, only logs, does not delete.
 * @param {number} [opts.concurrency=10] Concurrent delete operations.
 * @param {{log:Function,warn:Function,error:Function}} [opts.logger=console]
 * @returns {Promise<{deleted:number, examined:number, missingTrackIds:Set<string>, prefixesDeleted:number}>}
 */
async function cleanOrphanedTrackBlobs(opts = {}) {
    const dryRun = !!opts.dryRun;
    const concurrency = Math.max(1, Number(opts.concurrency) || 10);
    const logger = opts.logger || console;

    if (!blobServiceClient) throw new Error('Azure Blob Storage not configured');
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // 1) Load all existing track_ids from DB
    const existingIds = await fetchAllTrackIds();
    logger.log(`[cleanup] Loaded ${existingIds.size} existing track_ids from DB`);

    // 2) Walk blobs under hls/ and audio/ and decide which to delete
    const deleteList = [];
    let examined = 0;
    const missingTrackIds = new Set();

    // Helper to maybe queue a deletion
    const consider = (blobName, trackId) => {
        examined++;
        if (!trackId) return; // cannot determine -> ignore
        if (existingIds.has(trackId)) return; // keep
        missingTrackIds.add(trackId);
        deleteList.push(blobName);
    };

    // HLS: hls/track_<uuid>/...
    const hlsPrefix = 'hls/';
    for await (const item of containerClient.listBlobsFlat({ prefix: hlsPrefix })) {
        const name = item.name; // e.g., hls/track_<id>/v96/index.m3u8
        const m = name.match(/^hls\/track_([0-9a-fA-F-]{36})\//);
        if (m) consider(name, m[1]);
    }

    // Audio: audio/track_<uuid>_... (mp3/ogg)
    const audioPrefix = 'audio/';
    for await (const item of containerClient.listBlobsFlat({ prefix: audioPrefix })) {
        const name = item.name; // e.g., audio/track_<id>_160k.mp3
        const m = name.match(/^audio\/track_([0-9a-fA-F-]{36})_/);
        if (m) consider(name, m[1]);
    }

    logger.log(`[cleanup] Examined ${examined} blobs. Orphan blobs to delete: ${deleteList.length}. Distinct missing tracks: ${missingTrackIds.size}`);

    // 3) Delete with limited concurrency
    let deleted = 0;
    if (!dryRun && deleteList.length) {
        let idx = 0;
        async function worker() {
            while (idx < deleteList.length) {
                const i = idx++;
                const blobName = deleteList[i];
                try {
                    await containerClient.deleteBlob(blobName);
                    deleted++;
                } catch (e) {
                    logger.warn(`[cleanup] Failed to delete ${blobName}: ${e?.message || e}`);
                }
            }
        }
        const workers = Array.from({ length: Math.min(concurrency, deleteList.length) }, () => worker());
        await Promise.all(workers);
    }

    if (dryRun) logger.log('[cleanup] Dry run complete. No blobs were deleted.');
    else logger.log(`[cleanup] Deleted ${deleted} orphan blobs.`);

    return { deleted, examined, missingTrackIds, prefixesDeleted: 0 };
}

async function fetchAllTrackIds() {
    const client = supabaseAdmin || supabase;
    const pageSize = 1000;
    let from = 0;
    let to = from + pageSize - 1;
    const out = new Set();

    while (true) {
        const { data, error } = await client
            .from('tracks')
            .select('track_id')
            .range(from, to);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const row of data) out.add(row.track_id);
        if (data.length < pageSize) break;
        from += pageSize;
        to = from + pageSize - 1;
    }
    return out;
}

/**
 * Remove all .ogg progressive variants under audio/ regardless of track presence.
 * Keeps only MP3 files. Useful after deciding to drop OGG outputs.
 * @param {Object} opts
 * @param {boolean} [opts.dryRun=false]
 * @param {number} [opts.concurrency=10]
 * @param {{log:Function,warn:Function,error:Function}} [opts.logger=console]
 * @returns {Promise<{deleted:number, examined:number}>}
 */
async function purgeOggVariants(opts = {}) {
    const dryRun = !!opts.dryRun;
    const concurrency = Math.max(1, Number(opts.concurrency) || 10);
    const logger = opts.logger || console;
    if (!blobServiceClient) throw new Error('Azure Blob Storage not configured');
    const containerClient = blobServiceClient.getContainerClient(containerName);

    const audioPrefix = 'audio/';
    const oggBlobs = [];
    let examined = 0;
    for await (const item of containerClient.listBlobsFlat({ prefix: audioPrefix })) {
        examined++;
        if (item.name.endsWith('.ogg')) oggBlobs.push(item.name);
    }
    logger.log(`[purgeOgg] Found ${oggBlobs.length} .ogg blobs (examined ${examined}).`);
    let deleted = 0;
    if (!dryRun && oggBlobs.length) {
        let idx = 0;
        async function worker() {
            while (idx < oggBlobs.length) {
                const i = idx++;
                const blobName = oggBlobs[i];
                try {
                    await containerClient.deleteBlob(blobName);
                    deleted++;
                } catch (e) {
                    logger.warn(`[purgeOgg] Failed to delete ${blobName}: ${e?.message || e}`);
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(concurrency, oggBlobs.length) }, () => worker()));
    }
    if (dryRun) logger.log('[purgeOgg] Dry run only. No deletions performed.');
    else logger.log(`[purgeOgg] Deleted ${deleted} .ogg blobs.`);
    return { deleted, examined };
}

module.exports = { cleanOrphanedTrackBlobs, purgeOggVariants };
