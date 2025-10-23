const createError = require('http-errors');
const { listUsers, getUser, createUser, updateUser, deleteUser } = require('../../models/userModel');

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
    const item = await createUser(req.body);
    res.status(201).json(item);
}

async function update(req, res) {
    const { id } = req.params;
    const item = await updateUser(id, req.body);
    res.json(item);
}

async function remove(req, res) {
    const { id } = req.params;
    await deleteUser(id);
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
