const createError = require('http-errors');
const { listUsersPublic, getUserPublic, getUser, updateUser, deleteUser } = require('../../models/userModel');
const { uploadUserAvatarToStorage, deleteUserAvatarFromStorage} = require('../../utils/supabaseStorage');

async function list(req, res) {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const page = Math.max(0, Number(req.query.page) || 0);
    const q = req.query.q || undefined;
    const offset = page * limit;
    const { items, total } = await listUsersPublic({ limit, offset, q });
    res.json({ items, total, page, limit });
}

async function getOne(req, res) {
    const { id } = req.params;
    const item = await getUserPublic(id);
    if (!item) throw createError(404, 'User not found');
    res.json(item);
}

async function getMe(req, res) {
    const user_info = await getUser(req.user.id);
    return res.json(user_info);
}

async function update(req, res) {
    const { id } = req.params;
    // Only allow a user to update their own record
    if (!req.user || req.user.id !== id) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    // Whitelist fields that users can update about themselves
    const allowed = new Set(['name', 'settings', 'playlists']);
    const payload = {};
    for (const key of Object.keys(req.body || {})) {
        if (allowed.has(key)) payload[key] = req.body[key];
    }

    // Handle avatar upload separately
    if (req.file) {
        const avatarPath = await uploadUserAvatarToStorage(id, req.file);
        if (avatarPath) payload.avatar_url = avatarPath;
    }

    const item = await updateUser(id, payload);
    res.json(item);
}

async function remove(req, res) {
    const { id } = req.params;
    if (!req.user || req.user.id !== id) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    const user_info = await getUser(id);
    if (!user_info) {
        return res.status(404).json({ message: 'User not found' });
    }
    await deleteUserAvatarFromStorage(id, user_info.avatar_url);
    await deleteUser(id);
    res.status(204).send();
}

module.exports = { list, getOne, getMe, update, remove };
