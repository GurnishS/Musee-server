const createError = require('http-errors');
const { listCountries, getCountry} = require('../../models/countryModel');

async function list(req, res) {
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const page = Math.max(0, Number(req.query.page) || 0);
    const q = req.query.q || undefined;
    const offset = page * limit;
    const { items, total } = await listCountries({ limit, offset, q });
    res.json({ items, total, page, limit });
}

async function getOne(req, res) {
    const { id } = req.params;
    const item = await getCountry(id);
    if (!item) throw createError(404, 'Country not found');
    res.json(item);
}

module.exports = { list, getOne};
