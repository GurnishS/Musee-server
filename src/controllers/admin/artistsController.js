const createError = require('http-errors');
const { listArtists, getArtist, createArtist, updateArtist, deleteArtist, sanitizeArtistInsert } = require('../../models/artistModel');
const { createUser, updateUser, sanitizeUserInsert } = require('../../models/userModel');
const { uploadUserAvatarToStorage, uploadArtistCoverToStorage } = require('../../utils/supabaseStorage');

async function list(req, res) {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const page = Math.max(0, Number(req.query.page) || 0);
    const q = req.query.q || undefined;
    const offset = page * limit;
    const { items, total } = await listArtists({ limit, offset, q });
    res.json({ items, total, page, limit });
}

async function getOne(req, res) {
    const { id } = req.params;
    const item = await getArtist(id);
    if (!item) throw createError(404, 'Artist not found');
    res.json(item);
}

async function create(req, res) {
    // Sanitize inputs BEFORE any DB operations
    const body = { ...req.body };
    const artist_id = req.body.artist_id;
    if (!artist_id) {
        const userInput = sanitizeUserInsert(body);
        //Create user
        const authUser = await createUser(userInput);
        // 1a) If avatar file provided, upload and set on user
        const avatarFile = req.files?.avatar?.[0];
        if (avatarFile) {
            const avatarUrl = await uploadUserAvatarToStorage(authUser.id, avatarFile);
            if (avatarUrl) {
                try { await updateUser(authUser.id, { avatar_url: avatarUrl }); } catch { }
            }
        }
        body.artist_id = authUser.user_id;
    }
    const artistInput = sanitizeArtistInsert(body);

    // Create artist with the new user id
    const artist = await createArtist({ ...artistInput });

    // Upload cover if provided and update
    const coverFile = req.files?.cover?.[0] || req.file;
    if (coverFile) {
        const coverUrl = await uploadArtistCoverToStorage(artist.artist_id, coverFile);
        if (coverUrl) {
            const updated = await updateArtist(artist.artist_id, { cover_url: coverUrl });
            return res.status(201).json(updated);
        }
    }

    return res.status(201).json(artist);
}

async function update(req, res) {
    const { id } = req.params;
    const payload = { ...req.body };
    if (req.file) {
        const coverUrl = await uploadArtistCoverToStorage(id, req.file);
        if (coverUrl) payload.cover_url = coverUrl;
    }
    const item = await updateArtist(id, payload);
    res.json(item);
}

async function remove(req, res) {
    const { id } = req.params;
    const artist = await getArtist(id);
    if (!artist) {
        return res.status(404).json({ message: 'Artist not found' });
    }
    await deleteArtistCoverFromStorage(id, artist.cover_url);
    await deleteArtist(id);
    // Optionally downgrade user_type to 'listener' -- leave as-is for now
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
