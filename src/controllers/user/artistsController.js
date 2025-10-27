const createError = require('http-errors');
const mime = require('mime-types');
const { supabase, supabaseAdmin } = require('../../db/config');
const {
    getArtist,
    createArtist,
    updateArtist,
    deleteArtist,
    listArtistsUser,
    getArtistUser,
} = require('../../models/artistModel');
const { updateUser } = require('../../models/userModel');
const { uploadArtistCoverToStorage } = require('../../utils/supabaseStorage');


// --- sanitization helpers for user-owned artist ops ---
function isUUID(v) {
    return typeof v === 'string' && /^[0-9a-fA-F-]{36}$/.test(v);
}
function toNum(v, def = null) {
    if (v === undefined || v === null || v === '') return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

function sanitizeArtistCreateInput(body = {}) {
    const out = {};
    // bio, cover_url
    if (body.bio !== undefined) out.bio = typeof body.bio === 'string' ? body.bio.trim() : '';
    if (body.cover_url !== undefined) out.cover_url = typeof body.cover_url === 'string' ? body.cover_url.trim() : body.cover_url;

    // genres: accept array or CSV string
    if (Array.isArray(body.genres)) {
        out.genres = body.genres.map(String);
    } else if (typeof body.genres === 'string') {
        const t = body.genres.trim();
        out.genres = t ? (t.includes(',') ? t.split(',').map(s => s.trim()).filter(Boolean) : [t]) : [];
    }

    // debut_year: required
    const debut = toNum(body.debut_year, null);
    if (debut === null || !Number.isFinite(debut) || Math.trunc(debut) <= 0) {
        throw createError(400, 'debut_year is required and must be a positive number');
    }
    out.debut_year = Math.trunc(debut);

    // is_verified: ignore on user create (server sets false by default)
    if (body.is_verified !== undefined) {
        out.is_verified = body.is_verified === true || body.is_verified === 'true';
    }

    // region_id: required UUID
    if (!isUUID(body.region_id)) throw createError(400, 'region_id (UUID) is required');
    out.region_id = body.region_id;

    // date_of_birth: pass through
    if (body.date_of_birth !== undefined) out.date_of_birth = body.date_of_birth;

    // social_links: object or JSON string
    if (body.social_links !== undefined) {
        if (typeof body.social_links === 'string') {
            try { out.social_links = JSON.parse(body.social_links); }
            catch { throw createError(400, 'social_links must be valid JSON'); }
        } else if (body.social_links && typeof body.social_links === 'object') {
            out.social_links = body.social_links;
        } else {
            throw createError(400, 'social_links must be an object');
        }
    }

    return out;
}

function sanitizeArtistUpdateInput(body = {}) {
    const out = {};
    if (body.bio !== undefined) out.bio = typeof body.bio === 'string' ? body.bio.trim() : body.bio;
    if (body.cover_url !== undefined) out.cover_url = typeof body.cover_url === 'string' ? body.cover_url.trim() : body.cover_url;
    if (body.genres !== undefined) {
        if (Array.isArray(body.genres)) out.genres = body.genres.map(String);
        else if (typeof body.genres === 'string') {
            const t = body.genres.trim();
            out.genres = t ? (t.includes(',') ? t.split(',').map(s => s.trim()).filter(Boolean) : [t]) : [];
        } else throw createError(400, 'genres must be an array or CSV string');
    }
    if (body.debut_year !== undefined) {
        const v = Math.trunc(toNum(body.debut_year, 0));
        if (!Number.isFinite(v) || v <= 0) throw createError(400, 'debut_year must be a positive number');
        out.debut_year = v;
    }
    if (body.is_verified !== undefined) out.is_verified = body.is_verified === true || body.is_verified === 'true';
    if (body.region_id !== undefined) {
        if (body.region_id !== null && !isUUID(body.region_id)) throw createError(400, 'region_id must be a UUID or null');
        out.region_id = body.region_id;
    }
    if (body.date_of_birth !== undefined) out.date_of_birth = body.date_of_birth;
    if (body.social_links !== undefined) {
        if (typeof body.social_links === 'string') {
            try { out.social_links = JSON.parse(body.social_links); }
            catch { throw createError(400, 'social_links must be valid JSON'); }
        } else if (body.social_links && typeof body.social_links === 'object') {
            out.social_links = body.social_links;
        } else throw createError(400, 'social_links must be an object');
    }
    return out;
}

// GET /api/user/artists?limit=&page=&q=
async function list(req, res) {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const page = Math.max(0, Number(req.query.page) || 0);
    const q = req.query.q || undefined;
    const offset = page * limit;
    const { items, total } = await listArtistsUser({ limit, offset, q });
    res.json({ items, total, page, limit });
}

// GET /api/user/artists/:id
async function getOne(req, res) {
    const { id } = req.params;
    const item = await getArtistUser(id);
    if (!item) throw createError(404, 'Artist not found');
    res.json(item);
}

// POST /api/user/artists  -> current user becomes artist
async function create(req, res) {
    const userId = req.user?.id;
    if (!userId) throw createError(401, 'Unauthorized');

    // Prevent duplicate creation
    const existing = await getArtist(userId);
    if (existing) throw createError(409, 'Artist profile already exists');

    // Sanitize artist inputs BEFORE any DB calls
    const body = { ...req.body };
    const artistInput = sanitizeArtistCreateInput(body);

    // Create artist referencing current user
    let artist = await createArtist({ ...artistInput, artist_id: userId });

    // Upload cover if provided and update
    if (req.file) {
        const coverUrl = await uploadArtistCoverToStorage(userId, req.file);
        if (coverUrl) {
            artist = await updateArtist(userId, { cover_url: coverUrl });
        }
    }

    // Update user_type -> 'artist'
    try { await updateUser(userId, { user_type: 'artist' }); } catch { }

    return res.status(201).json(artist);
}

// PATCH /api/user/artists/:id  -> only own id
async function update(req, res) {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) throw createError(401, 'Unauthorized');
    if (id !== userId) throw createError(403, 'Forbidden');

    const body = { ...req.body };
    const payload = sanitizeArtistUpdateInput(body);
    if (req.file) {
        const coverUrl = await uploadArtistCoverToStorage(userId, req.file);
        if (coverUrl) payload.cover_url = coverUrl;
    }

    const item = await updateArtist(userId, payload);
    res.json(item);
}

// DELETE /api/user/artists/:id  -> only own id; set user_type back to listener
async function remove(req, res) {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) throw createError(401, 'Unauthorized');
    if (id !== userId) throw createError(403, 'Forbidden');

    await deleteArtist(userId);
    try { await updateUser(userId, { user_type: 'listener' }); } catch { }
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
