const multer = require('multer');

// memory storage to upload buffers to Supabase directly
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB default
});

module.exports = upload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'avatar', maxCount: 1 },
]);
