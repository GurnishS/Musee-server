const createError = require('http-errors');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');
const { supabase, supabaseAdmin } = require('../../db/config');
const { processAudioBuffer } = require('../../middleware/processAudio');
const { listTracks, getTrack, createTrack, updateTrack, deleteTrack } = require('../../models/trackModel');

// buckets
const COVERS_BUCKET = process.env.SUPABASE_COVERS_BUCKET || 'covers';
const VIDEOS_BUCKET = process.env.SUPABASE_VIDEOS_BUCKET || 'videoes';

async function uploadToBucket(bucket, path, file) {
    if (!file) return null;
    const client = supabaseAdmin || supabase;
    if (!client || !client.storage) return null;
    try {
        const { error: upErr } = await client.storage.from(bucket).upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
        if (upErr) {
            console.warn('Supabase storage upload error:', upErr.message || upErr);
            return null;
        }
        const publicResp = client.storage.from(bucket).getPublicUrl(path);
        const publicData = publicResp?.data || publicResp;
        const publicUrl = publicData?.publicUrl || publicData?.publicURL;
        if (publicUrl) return publicUrl;

        if (client === supabaseAdmin && client.storage && typeof client.storage.from === 'function') {
            try {
                const { data: signed, error: signErr } = await client.storage.from(bucket).createSignedUrl(path, 60 * 60);
                if (!signErr && (signed?.signedURL || signed?.signedUrl)) return signed.signedURL || signed.signedUrl;
            } catch (e) {
                // ignore
            }
        }
        return `/${path}`;
    } catch (e) {
        console.warn('Upload failed:', e?.message || e);
        return null;
    }
}

function getFileFromReq(req, field) {
    if (!req.files) return null;
    const arr = req.files[field];
    if (!arr || !arr.length) return null;
    return arr[0];
}

async function list(req, res) {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const page = Math.max(0, Number(req.query.page) || 0);
    const q = req.query.q || undefined;
    const offset = page * limit;
    const { items, total } = await listTracks({ limit, offset, q });
    res.json({ items, total, page, limit });
}

async function getOne(req, res) {
    const { id } = req.params;
    const item = await getTrack(id);
    if (!item) throw createError(404, 'Track not found');
    res.json(item);
}

async function create(req, res) {
    // expect form-data fields and files
    const body = { ...req.body };

    // ensure cover file present
    const coverFile = getFileFromReq(req, 'cover');
    if (!coverFile) throw createError(400, 'cover file is required');
    // create or use provided track_id so we can name files deterministically
    const trackId = (body.track_id && typeof body.track_id === 'string') ? body.track_id : uuidv4();
    body.track_id = trackId;

    // upload cover
    const coverExt = mime.extension(coverFile.mimetype) || 'jpg';
    const coverPath = `tracks/${trackId}.${coverExt}`;
    const coverUrl = await uploadToBucket(COVERS_BUCKET, coverPath, coverFile);
    if (!coverUrl) throw createError(500, 'failed to upload cover');
    body.cover_url = coverUrl;

    // optional video file
    const videoFile = getFileFromReq(req, 'video');
    if (videoFile) {
        const videoExt = mime.extension(videoFile.mimetype) || 'mp4';
        const videoPath = `tracks/${trackId}.${videoExt}`;
        const videoUrl = await uploadToBucket(VIDEOS_BUCKET, videoPath, videoFile);
        if (videoUrl) body.video_url = videoUrl;
    }

    // initially create track without audio_files and is_published=false
    body.audio_files = null;
    body.is_published = false;
    const created = await createTrack(body);

    // if audio file present, process it now using the canonical created.track_id
    const audioFile = getFileFromReq(req, 'audio');
    if (audioFile) {
        try {
            const audioResult = await processAudioBuffer(audioFile, created.track_id);
            const updated = await updateTrack(created.track_id, { audio_files: audioResult.files, is_published: true });
            return res.status(201).json(updated);
        } catch (e) {
            console.error('Audio processing failed after track creation:', e?.message || e);
            // return created record but indicate processing failed
            return res.status(500).json({ error: 'Audio processing failed', track: created });
        }
    }

    // no audio to process — return created (not published)
    res.status(201).json(created);
}

async function update(req, res) {
    const { id } = req.params;
    const body = { ...req.body };

    // cover - optional on update but if provided, upload and update cover_url
    const coverFile = getFileFromReq(req, 'cover');
    if (coverFile) {
        const coverExt = mime.extension(coverFile.mimetype) || 'jpg';
        const coverPath = `tracks/${id}.${coverExt}`;
        const coverUrl = await uploadToBucket(COVERS_BUCKET, coverPath, coverFile);
        if (coverUrl) body.cover_url = coverUrl;
    }

    // video - optional
    const videoFile = getFileFromReq(req, 'video');
    if (videoFile) {
        const videoExt = mime.extension(videoFile.mimetype) || 'mp4';
        const videoPath = `tracks/${id}.${videoExt}`;
        const videoUrl = await uploadToBucket(VIDEOS_BUCKET, videoPath, videoFile);
        if (videoUrl) body.video_url = videoUrl;
    }

    // audio_files TODO
    const audioFile = getFileFromReq(req, 'audio');
    if (audioFile) {
        try {
            const audioResult = await processAudioBuffer(audioFile, id);
            body.audio_files = audioResult.files;
            body.is_published = true;
        } catch (e) {
            console.error('Audio processing failed during update:', e?.message || e);
            // continue and update other fields, do not set is_published
        }
    }

    const updated = await updateTrack(id, body);
    res.json(updated);
}

async function remove(req, res) {
    const { id } = req.params;
    await deleteTrack(id);
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
