const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/user/queueController');

// Queue operations
router.get('/', ctrl.getQueue);
router.post('/add', ctrl.addToQueue);
router.delete('/:track_id', ctrl.removeFromQueue);
router.post('/reorder', ctrl.reorderQueue);
router.post('/clear', ctrl.clearQueue);
router.post('/play', ctrl.playTrack);

module.exports = router;
