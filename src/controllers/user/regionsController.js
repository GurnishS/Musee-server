const createError = require('http-errors');
const { listRegions, getRegion } = require('../../models/regionModel');

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

module.exports = { list, getOne};
