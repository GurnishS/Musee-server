const createError = require('http-errors');
const { listUsers, getUser, createUser, updateUser, deleteUser } = require('../../models/userModel');
const { supabase, supabaseAdmin } = require('../../db/config');
const mime = require('mime-types');
// bucket to use for avatars (override with env if needed)
const AVATAR_BUCKET = process.env.SUPABASE_AVATAR_BUCKET || 'avatars';

async function uploadAvatarToStorage(userId, file) {
    if (!file) return null;
    // prefer admin client for uploads (bypass RLS / private buckets)
    const client = supabaseAdmin || supabase;
    if (!client || !client.storage) return null;
    const ext = mime.extension(file.mimetype) || 'jpg';
    const path = `users/${userId}.${ext}`;
    try {
        // upload buffer directly; upsert true to replace existing avatar
        const { error: upErr } = await client.storage.from(AVATAR_BUCKET).upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
        if (upErr) {
            console.warn('Supabase storage upload error:', upErr.message || upErr);
            return null;
        }

        // Try public URL first (different supabase-js versions return either data.publicUrl or publicURL)
        const publicResp = client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
        const publicData = publicResp?.data || publicResp;
        const publicUrl = publicData?.publicUrl || publicData?.publicURL;
        if (publicUrl) return publicUrl;

        // Fallback: if admin client supports signed URL, create one (expires in 1 hour)
        if (client === supabaseAdmin && client.storage && typeof client.storage.from === 'function') {
            try {
                const { data: signed, error: signErr } = await client.storage.from(AVATAR_BUCKET).createSignedUrl(path, 60 * 60);
                if (!signErr && (signed?.signedURL || signed?.signedUrl)) return signed.signedURL || signed.signedUrl;
            } catch (e) {
                // ignore
            }
        }

        // If we get here, return path as fallback
        return `/${path}`;
    } catch (e) {
        console.warn('Avatar upload failed:', e?.message || e);
        return null;
    }
}

async function list(req, res) {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const page = Math.max(0, Number(req.query.page) || 0);
    const q = req.query.q || undefined;
    const offset = page * limit;
    const { items, total } = await listUsers({ limit, offset, q });
    res.json({ items, total, page, limit });
}

async function getOne(req, res) {
    const { id } = req.params;
    const item = await getUser(id);
    if (!item) throw createError(404, 'User not found');
    res.json(item);
}

async function create(req, res) {
    // req.file may be provided by multer
    const payload = { ...req.body };
    // create user record first to ensure user_id exists
    const user = await createUser(payload);
    // upload avatar if file present
    if (req.file) {
        const avatarPath = await uploadAvatarToStorage(user.user_id, req.file);
        if (avatarPath) {
            const updated = await updateUser(user.user_id, { avatar_url: avatarPath });
            return res.status(201).json(updated);
        }
    }
    res.status(201).json(user);
}

async function update(req, res) {
    const { id } = req.params;
    const payload = { ...req.body };
    if (req.file) {
        const avatarPath = await uploadAvatarToStorage(id, req.file);
        if (avatarPath) payload.avatar_url = avatarPath;
    }
    const item = await updateUser(id, payload);
    res.json(item);
}

async function remove(req, res) {
    const { id } = req.params;
    await deleteUser(id);
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
