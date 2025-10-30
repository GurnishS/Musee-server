const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/user/tracksController');
const artistsCtrl = require('../../controllers/user/trackArtistsController');
const uploadTrackFiles = require('../../middleware/uploadTrackFiles');
const normalizeArrayFields = require('../../middleware/normalizeArrayFields');
const streamingCtrl = require('../../controllers/user/streamingController');

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
// HLS streaming (SAS rewrite)
router.get('/:id/hls/master.m3u8', streamingCtrl.getHlsMaster);
router.get('/:id/hls/v:bitrate/index.m3u8', streamingCtrl.getHlsVariant);
router.post('/', uploadTrackFiles, normalizeArrayFields, ctrl.create);
router.patch('/:id', uploadTrackFiles, normalizeArrayFields, ctrl.update);
router.delete('/:id', ctrl.remove);

// Track artists management (owner-only)
router.post('/:id/artists', artistsCtrl.addArtist);
router.patch('/:id/artists/:artistId', artistsCtrl.updateArtist);
router.delete('/:id/artists/:artistId', artistsCtrl.removeArtist);

module.exports = router;
