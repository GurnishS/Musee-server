const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/user/regionsController');

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);

module.exports = router;
