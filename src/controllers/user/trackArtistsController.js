const createError = require('http-errors');
const { isUUID, validateArtistRoles } = require('../../utils/validators');
const { getTrack } = require('../../models/trackModel');
const { getAlbum } = require('../../models/albumModel');
const { addTrackArtist, updateTrackArtistByPair, deleteTrackArtistByPair } = require('../../models/trackArtistsModel');

async function ensureOwner(req, track) {
    const userId = req.user?.id;
    if (!userId) throw createError(401, 'Unauthorized');
    const album = await getAlbum(track.album_id);
    if (!album) throw createError(404, 'Album not found');
    const isOwner = (album.artists || []).some(a => a.artist_id === userId && a.role === 'owner');
    if (!isOwner) throw createError(403, 'Forbidden');
    return { album };
}

function isAlbumOwner(album, artist_id) {
    return (album.artists || []).some(a => a.artist_id === artist_id && a.role === 'owner');
}

async function addArtist(req, res) {
    const track_id = req.params.id;
    const { artist_id, role } = req.body || {};
    if (!isUUID(track_id)) throw createError(400, 'invalid track_id');
    if (!isUUID(artist_id)) throw createError(400, 'invalid artist_id');
    const r = (role || 'viewer').toString();
    if (!validateArtistRoles(r)) throw createError(400, 'invalid role');
    const track = await getTrack(track_id);
    if (!track) throw createError(404, 'Track not found');
    const { album } = await ensureOwner(req, track);
    // Owners can add any artist with role; album owners can be added only as owner (but they should already be auto-linked)
    const finalRole = isAlbumOwner(album, artist_id) ? 'owner' : r;
    const linked = await addTrackArtist(track_id, artist_id, finalRole);
    res.status(201).json(linked);
}

async function updateArtist(req, res) {
    const track_id = req.params.id;
    const artist_id = req.params.artistId;
    const { role } = req.body || {};
    if (!isUUID(track_id) || !isUUID(artist_id)) throw createError(400, 'invalid ids');
    if (!validateArtistRoles(role)) throw createError(400, 'invalid role');
    const track = await getTrack(track_id);
    if (!track) throw createError(404, 'Track not found');
    const { album } = await ensureOwner(req, track);
    // Prevent downgrading album owners
    if (isAlbumOwner(album, artist_id) && role !== 'owner') {
        throw createError(400, 'cannot change role of album owner');
    }
    const updated = await updateTrackArtistByPair(track_id, artist_id, role);
    if (!updated) throw createError(404, 'Artist not linked to track');
    res.json(updated);
}

async function removeArtist(req, res) {
    const track_id = req.params.id;
    const artist_id = req.params.artistId;
    if (!isUUID(track_id) || !isUUID(artist_id)) throw createError(400, 'invalid ids');
    const track = await getTrack(track_id);
    if (!track) throw createError(404, 'Track not found');
    const { album } = await ensureOwner(req, track);
    // Prevent removing album owners from tracks
    if (isAlbumOwner(album, artist_id)) {
        throw createError(400, 'cannot remove album owner from track');
    }
    await deleteTrackArtistByPair(track_id, artist_id);
    res.status(204).send();
}

module.exports = { addArtist, updateArtist, removeArtist };