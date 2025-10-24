const express = require('express');
const router = express.Router();

const authAdmin = require('../middleware/authAdmin');
const plansRoutes = require('./admin/planRoutes');
const usersRoutes = require('./admin/userRoutes');

router.use(authAdmin);
router.use('/plans', plansRoutes);
router.use('/users', usersRoutes);

module.exports = router;
