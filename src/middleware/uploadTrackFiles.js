const multer = require('multer');

// memory storage to upload buffers to Supabase directly
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 152 * 1024 * 1024 }, // 152MB default for tracks/videos
});

// expect fields: cover (file, required for create), video (file, optional), audio (file, optional)
module.exports = upload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
]);
