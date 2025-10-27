const express = require('express');
const router = express.Router();

const authUser = require('../middleware/authUser');
const plansRoutes = require('./user/planRoutes');
const usersRoutes = require('./user/userRoutes');
const artistsRoutes = require('./user/artistRoutes');
const countriesRoutes = require('./user/countryRoutes');
const regionsRoutes = require('./user/regionRoutes');


router.use(authUser);
router.use('/plans', plansRoutes);
router.use('/users', usersRoutes);
router.use('/artists', artistsRoutes);
router.use('/countries', countriesRoutes);
router.use('/regions', regionsRoutes);

module.exports = router;
