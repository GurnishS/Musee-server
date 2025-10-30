const createError = require('http-errors');
const { isUUID, validateArtistRoles } = require('../../utils/validators');
const { getTrack } = require('../../models/trackModel');
const { addTrackArtist, updateTrackArtistByPair, deleteTrackArtistByPair } = require('../../models/trackArtistsModel');

async function addArtist(req, res) {
    const track_id = req.params.id;
    const { artist_id, role } = req.body || {};
    if (!isUUID(track_id)) throw createError(400, 'invalid track_id');
    if (!isUUID(artist_id)) throw createError(400, 'invalid artist_id');
    const r = (role || 'viewer').toString();
    if (!validateArtistRoles(r)) throw createError(400, 'invalid role');
    const track = await getTrack(track_id);
    if (!track) throw createError(404, 'Track not found');
    const linked = await addTrackArtist(track_id, artist_id, r);
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
    await deleteTrackArtistByPair(track_id, artist_id);
    res.status(204).send();
}

module.exports = { addArtist, updateArtist, removeArtist };