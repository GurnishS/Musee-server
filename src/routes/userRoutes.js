const express = require('express');
const router = express.Router();

const authAdmin = require('../middleware/authUser');
const plansRoutes = require('./user/planRoutes');
const usersRoutes = require('./user/userRoutes');

//router.use(authUser);
router.use('/plans', plansRoutes);
router.use('/users', usersRoutes);

module.exports = router;
