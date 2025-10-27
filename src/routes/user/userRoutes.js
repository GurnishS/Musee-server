const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/user/usersController');
const uploadAvatar = require('../../middleware/uploadAvatar');

router.get('/me', ctrl.getMe);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.patch('/:id', uploadAvatar, ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;