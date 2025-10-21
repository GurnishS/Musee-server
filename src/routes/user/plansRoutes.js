const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/user/plansController');

// Public/read-only routes for plans
router.get('/', ctrl.list);

router.get('/:id', ctrl.getOne);

module.exports = router;
