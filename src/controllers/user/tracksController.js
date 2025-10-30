const createError = require('http-errors');
const { processAudioBuffer } = require('../../utils/processAudio');
const { listTracks, getTrack, createTrack, updateTrack, deleteTrack, listTracksUser, getTrackUser } = require('../../models/trackModel');
const { getAlbum } = require('../../models/albumModel');
const { addTrackArtist } = require('../../models/trackArtistsModel');
const { addTrackAudio, deleteAudiosForTrack } = require('../../models/trackAudiosModel');
const { uploadTrackCoverToStorage, uploadTrackVideoToStorage, deleteTrackVideoFromStorage, deleteTrackCoverFromStorage } = require('../../utils/supabaseStorage');
const { fi } = require('zod/locales');

function filterAllowedFields(payload) {
    // Whitelist fields that users can set on tracks
    const allowed = new Set(['title', 'album_id', 'duration', 'lyrics_url', 'is_explicit', 'is_published']);
    const out = {};
    for (const key of Object.keys(payload || {})) {
        if (allowed.has(key)) out[key] = payload[key];
    }

    return out;
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
    const { items, total } = await listTracksUser({ limit, offset, q });
    res.json({ items, total, page, limit });
}

async function getOne(req, res) {
    const { id } = req.params;
    const item = await getTrackUser(id);
    if (!item) throw createError(404, 'Track not found');
    res.json(item);
}

async function create(req, res) {
    // expect form-data fields and files
    const body = filterAllowedFields({ ...req.body });

    // authorization: only album owners can create tracks under that album
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!body.album_id) return res.status(400).json({ error: 'album_id is required' });
    const album = await getAlbum(body.album_id);
    if (!album) return res.status(404).json({ error: 'Album not found' });
    const isOwner = (album.artists || []).some(a => a.artist_id === userId && a.role === 'owner');
    if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

    // Validate required files
    const audioFileRequired = getFileFromReq(req, 'audio');
    const coverFileRequired = getFileFromReq(req, 'cover');
    if (!audioFileRequired || !coverFileRequired) {
        return res.status(400).json({ error: 'audio and cover files are required' });
    }

    // initially create track without audio and is_published=false
    body.is_published = false;
    var result;
    const created = await createTrack(body);

    result = created;

    // if audio file present, process it now using the canonical created.track_id
    const audioFile = audioFileRequired;
    if (audioFile) {
        try {
            const audioResult = await processAudioBuffer(audioFile, created.track_id);
            // persist audio variants into track_audios
            for (const [key, url] of Object.entries(audioResult.files || {})) {
                const [kbPart, extPart] = key.split('_');
                const bitrate = Number.parseInt(kbPart.replace('k', ''), 10);
                const ext = extPart.toLowerCase();
                await addTrackAudio(created.track_id, ext, bitrate, url);
            }
            // link creator as owner artist on the track for future authorization
            try { await addTrackArtist(created.track_id, userId, 'owner'); } catch (e) { /* ignore duplicate*/ }
            result = await updateTrack(created.track_id, { is_published: true });
        } catch (e) {
            console.error('Audio processing failed after track creation:', e?.message || e);
            // return created record but indicate processing failed
            return res.status(500).json({ error: 'Audio processing failed', track: created });
        }
    }

    // if cover image present, upload it
    const cover = coverFileRequired;
    if (cover) {
        const coverUrl = await uploadTrackCoverToStorage(created.track_id, cover);
        if (!coverUrl) {
            return res.status(500).json({ error: 'Cover upload failed', track_id: created.track_id });
        }
        result = await updateTrack(created.track_id, { cover_url: coverUrl });
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
    const body = filterAllowedFields({ ...req.body });

    var result;
    // authorization: only album owners can update tracks under that album
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const current = await getTrack(id);
    if (!current) return res.status(404).json({ error: 'Track not found' });
    const album = await getAlbum(current.album_id);
    if (!album) return res.status(404).json({ error: 'Album not found' });
    const isOwner = (album.artists || []).some(a => a.artist_id === userId && a.role === 'owner');
    if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

    result = await updateTrack(id, body);

    // if audio file present, process it and update track_audios
    const audioFile = getFileFromReq(req, 'audio');
    if (audioFile) {
        try {
            const audioResult = await processAudioBuffer(audioFile, id);
            await deleteAudiosForTrack(id);
            for (const [key, url] of Object.entries(audioResult.files || {})) {
                const [kbPart, extPart] = key.split('_');
                const bitrate = Number.parseInt(kbPart.replace('k', ''), 10);
                const ext = extPart.toLowerCase();
                await addTrackAudio(id, ext, bitrate, url);
            }
            result = await updateTrack(id, { is_published: true });
        } catch (e) {
            console.error('Audio processing failed during update:', e?.message || e);
            return res.status(500).json({ error: 'Audio processing failed', track_id: id });
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
    // authorization: only album owners can delete tracks under that album
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const track = await getTrack(id);
    if (!track) throw createError(404, 'Track not found');
    const album = await getAlbum(track.album_id);
    if (!album) throw createError(404, 'Album not found');
    const isOwner = (album.artists || []).some(a => a.artist_id === userId && a.role === 'owner');
    if (!isOwner) throw createError(403, 'Forbidden');
    await deleteTrackVideoFromStorage(track.track_id, track.video_url)
    await deleteTrackCoverFromStorage(track.track_id, track.cover_url)
    // delete audio DB rows
    await deleteAudiosForTrack(id);
    await deleteTrack(id);
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
