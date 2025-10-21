const createError = require('http-errors');
const { listPlans, getPlan } = require('../../models/planModel');

// GET /api/user/plans
async function list(req, res) {
    const items = await listPlans();
    // Only expose active plans to users
    const onlyActive = Array.isArray(items)
        ? items.filter((p) => p?.is_active !== false)
        : [];
    res.json({ items: onlyActive });
}

// GET /api/user/plans/:id
async function getOne(req, res) {
    const { id } = req.params;
    const item = await getPlan(id);
    if (!item || item?.is_active === false) throw createError(404, 'Plan not found');
    res.json(item);
}

module.exports = { list, getOne };
