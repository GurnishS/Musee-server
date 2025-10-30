const createError = require('http-errors');
const { listPlaylists, getPlaylist, createPlaylist, updatePlaylist, deletePlaylist, listPlaylistsUser, getPlaylistUser } = require('../../models/playlistModel');
const { addPlaylistTrack, removePlaylistTrack } = require('../../models/playlistTracksModel');
const { uploadPlaylistCoverToStorage, deletePlaylistCoverFromStorage } = require('../../utils/supabaseStorage');

function filterAllowedFields(payload) {
    // Whitelist fields that users can set on playlists
    const allowed = new Set(['name', 'description', 'genres', 'is_public']);
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
    const { items, total } = await listPlaylistsUser({ limit, offset, q });
    res.json({ items, total, page, limit });
}

async function getOne(req, res) {
    const { id } = req.params;
    const item = await getPlaylistUser(id);
    if (!item) throw createError(404, 'Playlist not found');
    res.json(item);
}

async function create(req, res) {
    const payload = filterAllowedFields({ ...req.body });
    // set creator_id from auth user if available
    if (req.user && req.user.id) payload.creator_id = req.user.id;
    const playlist = await createPlaylist(payload);
    if (req.file) {
        const coverUrl = await uploadPlaylistCoverToStorage(playlist.playlist_id, req.file);
        if (coverUrl) {
            const updated = await updatePlaylist(playlist.playlist_id, { cover_url: coverUrl });
            return res.status(201).json(updated);
        }
    }
    res.status(201).json(playlist);
}

async function update(req, res) {
    const { id } = req.params;
    // ownership check
    const existing = await getPlaylist(id);
    if (!existing) throw createError(404, 'Playlist not found');
    if (existing.creator_id && req.user && existing.creator_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const payload = filterAllowedFields({ ...req.body });
    if (req.file) {
        const coverUrl = await uploadPlaylistCoverToStorage(id, req.file);
        if (coverUrl) payload.cover_url = coverUrl;
    }
    const item = await updatePlaylist(id, payload);
    res.json(item);
}

async function remove(req, res) {
    const { id } = req.params;
    const playlist = await getPlaylist(id);
    if (!playlist) throw createError(404, 'Playlist not found');
    if (playlist.creator_id && req.user && playlist.creator_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await deletePlaylistCoverFromStorage(playlist.playlist_id, playlist.cover_url);
    await deletePlaylist(id);
    res.status(204).send();
}

// Add a track to a playlist (owner only)
async function addTrack(req, res) {
    const { id } = req.params; // playlist_id
    const { track_id } = req.body;
    const playlist = await getPlaylist(id);
    if (!playlist) throw createError(404, 'Playlist not found');
    if (playlist.creator_id && req.user && playlist.creator_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    if (!track_id) return res.status(400).json({ error: 'track_id is required' });
    await addPlaylistTrack(id, track_id);
    const updated = await getPlaylist(id);
    res.status(200).json(updated);
}

// Remove a track from a playlist (owner only)
async function removeTrack(req, res) {
    const { id, trackId } = req.params; // playlist_id, trackId
    const playlist = await getPlaylist(id);
    if (!playlist) throw createError(404, 'Playlist not found');
    if (playlist.creator_id && req.user && playlist.creator_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await removePlaylistTrack(id, trackId);
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove, addTrack, removeTrack };
