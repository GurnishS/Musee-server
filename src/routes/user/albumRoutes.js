const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/user/albumsController');
const uploadCover = require('../../middleware/uploadCover');

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', uploadCover, ctrl.create);
router.patch('/:id', uploadCover, ctrl.update);
router.delete('/:id', ctrl.remove);

// Manage artists on an album (owner only)
router.post('/:id/artists', ctrl.addArtist);
router.patch('/:id/artists/:artistId', ctrl.updateArtist);
router.delete('/:id/artists/:artistId', ctrl.removeArtist);

module.exports = router;
