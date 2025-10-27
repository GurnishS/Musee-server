const createError = require('http-errors');
const { listAlbums, getAlbum, createAlbum, updateAlbum, deleteAlbum } = require('../../models/albumModel');
const { uploadAlbumCoverToStorage, deleteAlbumCoverFromStorage } = require('../../utils/supabaseStorage');

async function list(req, res) {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const page = Math.max(0, Number(req.query.page) || 0);
    const q = req.query.q || undefined;
    const offset = page * limit;
    const { items, total } = await listAlbums({ limit, offset, q });
    res.json({ items, total, page, limit });
}

async function getOne(req, res) {
    const { id } = req.params;
    const item = await getAlbum(id);
    if (!item) throw createError(404, 'Album not found');
    res.json(item);
}

async function create(req, res) {
    // Create first to get album_id, then upload cover if present
    const payload = { ...req.body };
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
    const payload = { ...req.body };
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
    if (!album) {
        return res.status(404).json({ message: 'Album not found' });
    }
    await deleteAlbumCoverFromStorage(id, album.cover_url);
    await deleteAlbum(id);
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
