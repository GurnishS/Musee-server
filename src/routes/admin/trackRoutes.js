const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/admin/tracksController');
const uploadTrackFiles = require('../../middleware/uploadTrackFiles');
const processAudio = require('../../middleware/processAudio');
const normalizeArrayFields = require('../../middleware/normalizeArrayFields');

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', uploadTrackFiles, processAudio,normalizeArrayFields, ctrl.create);
router.patch('/:id', normalizeArrayFields, uploadTrackFiles, processAudio, ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
