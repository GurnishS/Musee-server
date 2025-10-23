const express = require('express');
const router = express.Router();

const authAdmin = require('../middleware/authUser');
const plansRoutes = require('./user/plansRoutes');

//router.use(authUser);
router.use('/plans', plansRoutes);

module.exports = router;
