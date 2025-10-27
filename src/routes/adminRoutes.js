const express = require('express');
const router = express.Router();

const authAdmin = require('../middleware/authAdmin');
const plansRoutes = require('./admin/planRoutes');
const usersRoutes = require('./admin/usersRoutes');
const artistsRoutes = require('./admin/artistRoutes');
const tracksRoutes = require('./admin/trackRoutes');
const albumsRoutes = require('./admin/albumRoutes');
const playlistsRoutes = require('./admin/playlistRoutes');
const countriesRoutes = require('./admin/countryRoutes');
const regionsRoutes = require('./admin/regionRoutes');

router.use(authAdmin);
router.use('/plans', plansRoutes);
router.use('/users', usersRoutes);
router.use('/artists', artistsRoutes);
router.use('/tracks', tracksRoutes);
router.use('/albums', albumsRoutes);
router.use('/playlists', playlistsRoutes);
router.use('/countries', countriesRoutes);
router.use('/regions', regionsRoutes);

module.exports = router;
