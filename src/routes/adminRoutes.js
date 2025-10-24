const express = require('express');
const router = express.Router();

const authAdmin = require('../middleware/authAdmin');
const plansRoutes = require('./admin/planRoutes');
const usersRoutes = require('./admin/usersRoutes');
const artistsRoutes = require('./admin/artistRoutes');
const tracksRoutes = require('./admin/trackRoutes');

router.use(authAdmin);
router.use('/plans', plansRoutes);
router.use('/users', usersRoutes);
router.use('/artists', artistsRoutes);
router.use('/tracks', tracksRoutes);

module.exports = router;
