const express = require('express');
const router = express.Router();

const authAdmin = require('../middleware/authAdmin');
const plansRoutes = require('./user/planRoutes');
const usersRoutes = require('./userRoutes');

router.use(authAdmin);
router.use('/plans', plansRoutes);
router.use('/users', usersRoutes);

module.exports = router;
