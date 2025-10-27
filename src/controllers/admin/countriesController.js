const createError = require('http-errors');
const { listCountries, getCountry, createCountry, updateCountry, deleteCountry } = require('../../models/countryModel');

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

async function create(req, res) {
    const payload = { ...req.body };
    const item = await createCountry(payload);
    res.status(201).json(item);
}

async function update(req, res) {
    const { id } = req.params;
    const payload = { ...req.body };
    const item = await updateCountry(id, payload);
    res.json(item);
}

async function remove(req, res) {
    const { id } = req.params;
    await deleteCountry(id);
    res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
