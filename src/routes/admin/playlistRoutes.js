const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/admin/playlistsController');
const uploadCover = require('../../middleware/uploadCover');

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', uploadCover, ctrl.create);
router.patch('/:id', uploadCover, ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
