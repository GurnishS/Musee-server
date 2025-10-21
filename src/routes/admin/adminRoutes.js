const express = require('express');
const router = express.Router();

const authAdmin = require('../../middleware/authAdmin');
const plansRoutes = require('./planRoutes');

router.use(authAdmin);
router.use('/plans', plansRoutes);

module.exports = router;
