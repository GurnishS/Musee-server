const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/user/tracksController');
const uploadTrackFiles = require('../../middleware/uploadTrackFiles');
const normalizeArrayFields = require('../../middleware/normalizeArrayFields');

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', uploadTrackFiles, normalizeArrayFields, ctrl.create);
router.patch('/:id', uploadTrackFiles, normalizeArrayFields, ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
