const createError = require('http-errors');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');
const { supabase, supabaseAdmin } = require('../../db/config');
const { processAudioBuffer } = require('../../utils/processAudio');
const { listTracks, getTrack, createTrack, updateTrack, deleteTrack } = require('../../models/trackModel');
const { uploadTrackCoverToStorage, uploadTrackVideoToStorage, deleteTrackVideoFromStorage, deleteTrackCoverFromStorage } = require('../../utils/supabaseStorage');

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

    // initially create track without files and is_published=false
    body.audio_files = null;
    body.is_published = false;
    var result;
    const created = await createTrack(body);

    result = created;

    // if audio file present, process it now using the canonical created.track_id
    const audioFile = getFileFromReq(req, 'audio');
    if (audioFile) {
        try {
            const audioResult = await processAudioBuffer(audioFile, created.track_id);
            const updated = await updateTrack(created.track_id, { audio_files: audioResult.files, is_published: true });
            result = updated;
        } catch (e) {
            console.error('Audio processing failed after track creation:', e?.message || e);
            // return created record but indicate processing failed
            return res.status(500).json({ error: 'Audio processing failed', track: created });
        }
    }

    // if cover image present, upload it
    const cover = getFileFromReq(req, 'cover');
    if (cover) {
        const coverUrl = await uploadTrackCoverToStorage(created.track_id, cover);
        if (coverUrl) {
            result = await updateTrack(created.track_id, { cover_url: coverUrl });
        }
    }

    // if video is present, upload it
    const video = getFileFromReq(req, 'video');
    if (video) {
        const videoUrl = await uploadTrackVideoToStorage(created.track_id, video);
        if (videoUrl) {
            result = await updateTrack(created.track_id, { video_url: videoUrl });
        }
    }

    // no audio to process — return created (not published)
    res.status(201).json(result);
}

async function update(req, res) {
    const { id } = req.params;
    const body = { ...req.body };

    var result;

    result = await updateTrack(id, body);

    // if audio file present, process it now using the canonical created.track_id
    const audioFile = getFileFromReq(req, 'audio');
    if (audioFile) {
        try {
            const audioResult = await processAudioBuffer(audioFile, id);
            const updated = await updateTrack(id, { audio_files: audioResult.files, is_published: true });
            result = updated;
        } catch (e) {
            console.error('Audio processing failed after track creation:', e?.message || e);
            // return created record but indicate processing failed
            return res.status(500).json({ error: 'Audio processing failed', track: created });
        }
    }

    // if cover image present, upload it
    const cover = getFileFromReq(req, 'cover');
    if (cover) {
        const coverUrl = await uploadTrackCoverToStorage(id, cover);
        if (coverUrl) {
            result = await updateTrack(id, { cover_url: coverUrl });
        }
    }

    // if video is present, upload it
    const video = getFileFromReq(req, 'video');
    if (video) {
        const videoUrl = await uploadTrackVideoToStorage(id, video);
        if (videoUrl) {
            result = await updateTrack(id, { video_url: videoUrl });
        }
    }

    res.json(result);
}

async function remove(req, res) {
    const { id } = req.params;
    const track = await getTrack(id);
    if (!track) throw createError(404, 'Track not found');
    await deleteTrackVideoFromStorage(track.track_id, track.video_url)
    await deleteTrackCoverFromStorage(track.track_id, track.cover_url)
    //TODO delete audio files
    await deleteTrack(id);
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
