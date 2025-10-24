const createError = require('http-errors');
const { listArtists, getArtist, createArtist, updateArtist, deleteArtist } = require('../../models/artistModel');
const { updateUser } = require('../../models/userModel');
const { supabase, supabaseAdmin } = require('../../db/config');
const mime = require('mime-types');

// bucket to use for covers (override with env if needed)
const COVERS_BUCKET = process.env.SUPABASE_COVERS_BUCKET || 'covers';

async function uploadCoverToStorage(artistId, file) {
    if (!file) return null;
    const client = supabaseAdmin || supabase;
    if (!client || !client.storage) return null;
    const ext = mime.extension(file.mimetype) || 'jpg';
    const path = `artists/${artistId}.${ext}`;
    try {
        const { error: upErr } = await client.storage.from(COVERS_BUCKET).upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
        if (upErr) {
            console.warn('Supabase storage upload error (cover):', upErr.message || upErr);
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
        console.warn('Cover upload failed:', e?.message || e);
        return null;
    }
}

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
    const payload = { ...req.body };
    // Expect artist_id to be provided and match a user_id
    const artist = await createArtist(payload);
    // Update user_type to 'artist' for the corresponding user
    try {
        if (artist?.artist_id) {
            await updateUser(artist.artist_id, { user_type: 'artist' });
        }
    } catch (e) {
        // Log but don't fail creation
        console.warn('Failed to update user_type to artist:', e?.message || e);
    }
    // If a cover file was provided, upload it and update the artist record with the cover URL
    if (req.file) {
        const coverUrl = await uploadCoverToStorage(artist.artist_id, req.file);
        if (coverUrl) {
            const updated = await updateArtist(artist.artist_id, { cover_url: coverUrl });
            return res.status(201).json(updated);
        }
    }

    res.status(201).json(artist);
}

async function update(req, res) {
    const { id } = req.params;
    const payload = { ...req.body };
    if (req.file) {
        const coverUrl = await uploadCoverToStorage(id, req.file);
        if (coverUrl) payload.cover_url = coverUrl;
    }
    const item = await updateArtist(id, payload);
    res.json(item);
}

async function remove(req, res) {
    const { id } = req.params;
    await deleteArtist(id);
    // Optionally downgrade user_type to 'listener' -- leave as-is for now
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
