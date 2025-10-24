const multer = require('multer');

// Use memory storage so we can upload the buffer to Supabase storage directly
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

module.exports = upload.single('cover');
