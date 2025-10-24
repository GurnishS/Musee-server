const multer = require('multer');

// Use memory storage so we can upload the buffer to Supabase storage directly
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 1 * 1024 * 1024 }, // 1MB
});

module.exports = upload.single('avatar');
