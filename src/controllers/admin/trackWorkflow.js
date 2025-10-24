const createError = require('http-errors');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');
const { supabase, supabaseAdmin } = require('../../db/config');
const { createTrack, updateTrack } = require('../../models/trackModel');

const COVERS_BUCKET = process.env.SUPABASE_COVERS_BUCKET || 'covers';
const VIDEOS_BUCKET = process.env.SUPABASE_VIDEOS_BUCKET || 'videoes';

async function uploadToBucket(bucket, path, file) {
    if (!file) return null;
    const client = supabaseAdmin || supabase;
    if (!client || !client.storage) return null;
    const { error: upErr } = await client.storage.from(bucket).upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
    if (upErr) {
        console.warn('Supabase storage upload error:', upErr.message || upErr);
        return null;
    }
    const publicResp = client.storage.from(bucket).getPublicUrl(path);
    const publicData = publicResp?.data || publicResp;
    return publicData?.publicUrl || publicData?.publicURL || `/${path}`;
}

function getFileFromReq(req, field) {
    if (!req.files) return null;
    const arr = req.files[field];
    if (!arr || !arr.length) return null;
    return arr[0];
}

// Create track record (minimal) and attach created object to req.createdTrack
async function createRecord(req, res, next) {
    try {
        const body = { ...req.body };

        // ensure cover file present
        const coverFile = getFileFromReq(req, 'cover');
        if (!coverFile) throw createError(400, 'cover file is required');

        // provisional track id
        const trackId = (body.track_id && typeof body.track_id === 'string') ? body.track_id : uuidv4();
        body.track_id = trackId;

        // upload cover (so cover_url available before DB create)
        const coverExt = mime.extension(coverFile.mimetype) || 'jpg';
        const coverPath = `tracks/${trackId}.${coverExt}`;
        const coverUrl = await uploadToBucket(COVERS_BUCKET, coverPath, coverFile);
        if (!coverUrl) throw createError(500, 'failed to upload cover');
        body.cover_url = coverUrl;

        // optional video
        const videoFile = getFileFromReq(req, 'video');
        if (videoFile) {
            const videoExt = mime.extension(videoFile.mimetype) || 'mp4';
            const videoPath = `tracks/${trackId}.${videoExt}`;
            const videoUrl = await uploadToBucket(VIDEOS_BUCKET, videoPath, videoFile);
            if (videoUrl) body.video_url = videoUrl;
        }

        // create initial track row: audio_files null, is_published false
        body.audio_files = null;
        body.is_published = false;
        const created = await createTrack(body);
        req.createdTrack = created;
        // ensure future middlewares see canonical id
        req.body = req.body || {};
        req.body.track_id = created.track_id;
        next();
    } catch (e) {
        next(e);
    }
}

// finalize: after audio processing (req.audioInfo set), update track with audio_files and set is_published true
async function finalizeCreate(req, res, next) {
    try {
        const created = req.createdTrack;
        if (!created) return next(createError(500, 'Missing created track context'));

        if (req.audioInfo && req.audioInfo.files) {
            const updated = await updateTrack(created.track_id, { audio_files: req.audioInfo.files, is_published: true });
            return res.status(201).json(updated);
        }

        // no audio processed — return created (not published)
        return res.status(201).json(created);
    } catch (e) {
        next(e);
    }
}

module.exports = { createRecord, finalizeCreate };
