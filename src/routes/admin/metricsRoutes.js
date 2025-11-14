const express = require('express');
const router = express.Router();

const { getUsage } = require('../../controllers/admin/metricsController');

router.get('/', getUsage);

module.exports = router;
