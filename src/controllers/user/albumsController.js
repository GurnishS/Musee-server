const createError = require('http-errors');
const { listAlbumsUser, getAlbumUser, createAlbum, updateAlbum, deleteAlbum, getAlbum } = require('../../models/albumModel');
const { uploadAlbumCoverToStorage, deleteAlbumCoverFromStorage } = require('../../utils/supabaseStorage');

function filterAllowedFields(payload) {
    // Whitelist fields that users can update about themselves
    const allowed = new Set(['title', 'description', 'genres', 'is_published']);
    const out = {};
    for (const key of Object.keys(payload || {})) {
        if (allowed.has(key)) out[key] = payload[key];
    }

    return out;
}

async function list(req, res) {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const page = Math.max(0, Number(req.query.page) || 0);
    const q = req.query.q || undefined;
    const offset = page * limit;
    const { items, total } = await listAlbumsUser({ limit, offset, q });
    res.json({ items, total, page, limit });
}

async function getOne(req, res) {
    const { id } = req.params;
    const item = await getAlbumUser(id);
    if (!item) throw createError(404, 'Album not found');
    res.json(item);
}

async function create(req, res) {
    // Create first to get album_id, then upload cover if present
    const payload = filterAllowedFields({ ...req.body });

    const album = await createAlbum(payload);
    if (req.file) {
        const coverUrl = await uploadAlbumCoverToStorage(album.album_id, req.file);
        if (coverUrl) {
            const updated = await updateAlbum(album.album_id, { cover_url: coverUrl });
            return res.status(201).json(updated);
        }
    }
    res.status(201).json(album);
}

async function update(req, res) {
    const { id } = req.params;
    const payload = filterAllowedFields({ ...req.body });

    const album = await getAlbum(id);

    if (!album) throw createError(404, 'Album not found');

    if (req.user.user_id != album.artist_id) {
        throw createError(403, 'Forbidden');
    }

    if (req.file) {
        const coverUrl = await uploadAlbumCoverToStorage(id, req.file);
        if (coverUrl) payload.cover_url = coverUrl;
    }
    const item = await updateAlbum(id, payload);
    res.json(item);
}

async function remove(req, res) {
    const { id } = req.params;

    const album = await getAlbum(id);

    if (!album) throw createError(404, 'Album not found');

    if (req.user.user_id != album.artist_id) {
        throw createError(403, 'Forbidden');
    }

    await deleteAlbumCoverFromStorage(album.album_id, album.cover_url);

    await deleteAlbum(id);
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
