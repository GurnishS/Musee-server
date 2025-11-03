const express = require('express');
const router = express.Router();

const ctrl = require('../../controllers/user/followersController');

// Status must come before dynamic :id to avoid route conflicts
router.get('/status/:id', ctrl.status);

// Follow / Unfollow a user by ID
router.post('/:id', ctrl.follow);
router.delete('/:id', ctrl.unfollow);

// Lists for the authenticated user
router.get('/followers', ctrl.myFollowers);
router.get('/following', ctrl.myFollowing);

module.exports = router;
