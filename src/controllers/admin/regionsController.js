const createError = require('http-errors');
const { listRegions, getRegion, createRegion, updateRegion, deleteRegion } = require('../../models/regionModel');

async function list(req, res) {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const page = Math.max(0, Number(req.query.page) || 0);
    const q = req.query.q || undefined;
    const country_id = req.query.country_id || undefined;
    const offset = page * limit;
    const { items, total } = await listRegions({ limit, offset, q, country_id });
    res.json({ items, total, page, limit });
}

async function getOne(req, res) {
    const { id } = req.params;
    const item = await getRegion(id);
    if (!item) throw createError(404, 'Region not found');
    res.json(item);
}

async function create(req, res) {
    const payload = { ...req.body };
    const item = await createRegion(payload);
    res.status(201).json(item);
}

async function update(req, res) {
    const { id } = req.params;
    const payload = { ...req.body };
    const item = await updateRegion(id, payload);
    res.json(item);
}

async function remove(req, res) {
    const { id } = req.params;
    await deleteRegion(id);
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
