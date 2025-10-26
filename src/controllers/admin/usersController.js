const createError = require('http-errors');
const { listUsers, getUser, createUser, updateUser, deleteUser } = require('../../models/userModel');
const { uploadAvatarToStorage } = require('../../utils/supabaseStorage');

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
