const { listAlbumsUser } = require('../../models/albumModel');

function parsePagination(query) {
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const page = Math.max(0, Number(query.page) || 0);
    const offset = page * limit;
    return { limit, page, offset };
}

// For now both endpoints return any published albums with standard pagination.
// Later we can plug in recommendations or trending signals.
async function madeForYou(req, res) {
    const { limit, page, offset } = parsePagination(req.query);
    const { items, total } = await listAlbumsUser({ limit, offset });
    res.json({ items, total, page, limit });
}

async function trending(req, res) {
    const { limit, page, offset } = parsePagination(req.query);
    const { items, total } = await listAlbumsUser({ limit, offset });
    res.json({ items, total, page, limit });
}

module.exports = { madeForYou, trending };
