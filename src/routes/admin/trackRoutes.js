const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/admin/tracksController');
const uploadTrackFiles = require('../../middleware/uploadTrackFiles');
const processAudio = require('../../middleware/processAudio');
const normalizeArrayFields = require('../../middleware/normalizeArrayFields');
const workflow = require('../../controllers/admin/trackWorkflow');

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
// create flow: upload files -> normalize arrays -> create DB row -> process audio using track_id -> finalize (update audio_files + publish)
router.post('/', uploadTrackFiles, normalizeArrayFields, workflow.createRecord, processAudio.processAndUploadAudio, workflow.finalizeCreate);
// update: keep existing order (normalize then upload/process then controller)
router.patch('/:id', normalizeArrayFields, uploadTrackFiles, processAudio.processAndUploadAudio, ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
