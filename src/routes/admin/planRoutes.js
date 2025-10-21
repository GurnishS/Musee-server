const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/admin/plansController');

// GET /api/admin/plans
router.get('/', ctrl.list);

// GET /api/admin/plans/:id
router.get('/:id', ctrl.getOne);

// POST /api/admin/plans
router.post('/', ctrl.create);

// PATCH /api/admin/plans/:id
router.patch('/:id', ctrl.update);

// DELETE /api/admin/plans/:id
router.delete('/:id', ctrl.remove);

module.exports = router;
