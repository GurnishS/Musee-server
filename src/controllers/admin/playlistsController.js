const createError = require('http-errors');
const { listPlaylists, getPlaylist, createPlaylist, updatePlaylist, deletePlaylist } = require('../../models/playlistModel');
const { supabase, supabaseAdmin } = require('../../db/config');
const mime = require('mime-types');

const COVERS_BUCKET = process.env.SUPABASE_COVERS_BUCKET || 'covers';

async function uploadCoverToStorage(playlistId, file) {
    if (!file) return null;
    const client = supabaseAdmin || supabase;
    if (!client || !client.storage) return null;
    const ext = mime.extension(file.mimetype) || 'jpg';
    const path = `playlists/${playlistId}.${ext}`;
    try {
        const { error: upErr } = await client.storage.from(COVERS_BUCKET).upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
        if (upErr) {
            console.warn('Supabase storage upload error (playlist cover):', upErr.message || upErr);
            return null;
        }

        const publicResp = client.storage.from(COVERS_BUCKET).getPublicUrl(path);
        const publicData = publicResp?.data || publicResp;
        const publicUrl = publicData?.publicUrl || publicData?.publicURL;
        if (publicUrl) return publicUrl;

        if (client === supabaseAdmin && client.storage && typeof client.storage.from === 'function') {
            try {
                const { data: signed, error: signErr } = await client.storage.from(COVERS_BUCKET).createSignedUrl(path, 60 * 60);
                if (!signErr && (signed?.signedURL || signed?.signedUrl)) return signed.signedURL || signed.signedUrl;
            } catch (e) {
                // ignore
            }
        }

        return `/${path}`;
    } catch (e) {
        console.warn('Playlist cover upload failed:', e?.message || e);
        return null;
    }
}

async function list(req, res) {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const page = Math.max(0, Number(req.query.page) || 0);
    const q = req.query.q || undefined;
    const offset = page * limit;
    const { items, total } = await listPlaylists({ limit, offset, q });
    res.json({ items, total, page, limit });
}

async function getOne(req, res) {
    const { id } = req.params;
    const item = await getPlaylist(id);
    if (!item) throw createError(404, 'Playlist not found');
    res.json(item);
}

async function create(req, res) {
    const payload = { ...req.body };
    const playlist = await createPlaylist(payload);
    if (req.file) {
        const coverUrl = await uploadCoverToStorage(playlist.playlist_id, req.file);
        if (coverUrl) {
            const updated = await updatePlaylist(playlist.playlist_id, { cover_url: coverUrl });
            return res.status(201).json(updated);
        }
    }
    res.status(201).json(playlist);
}

async function update(req, res) {
    const { id } = req.params;
    const payload = { ...req.body };
    if (req.file) {
        const coverUrl = await uploadCoverToStorage(id, req.file);
        if (coverUrl) payload.cover_url = coverUrl;
    }
    const item = await updatePlaylist(id, payload);
    res.json(item);
}

async function remove(req, res) {
    const { id } = req.params;
    await deletePlaylist(id);
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
