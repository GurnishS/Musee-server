const { supabase, supabaseAdmin } = require('../db/config');
const mime = require('mime-types');

const AVATAR_BUCKET = process.env.SUPABASE_AVATAR_BUCKET || 'avatars';

async function uploadAvatarToStorage(userId, file) {
    if (!file) return null;
    // prefer admin client for uploads (bypass RLS / private buckets)
    const client = supabaseAdmin || supabase;
    if (!client || !client.storage) return null;
    const ext = mime.extension(file.mimetype) || 'jpg';
    const path = `users/${userId}.${ext}`;
    try {
        // upload buffer directly; upsert true to replace existing avatar
        const { error: upErr } = await client.storage.from(AVATAR_BUCKET).upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
        if (upErr) {
            console.warn('Supabase storage upload error:', upErr.message || upErr);
            return null;
        }

        // Try public URL first (different supabase-js versions return either data.publicUrl or publicURL)
        const publicResp = client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
        const publicData = publicResp?.data || publicResp;
        const publicUrl = publicData?.publicUrl || publicData?.publicURL;
        if (publicUrl) return publicUrl;

        // Fallback: if admin client supports signed URL, create one (expires in 1 hour)
        if (client === supabaseAdmin && client.storage && typeof client.storage.from === 'function') {
            try {
                const { data: signed, error: signErr } = await client.storage.from(AVATAR_BUCKET).createSignedUrl(path, 60 * 60);
                if (!signErr && (signed?.signedURL || signed?.signedUrl)) return signed.signedURL || signed.signedUrl;
            } catch (e) {
                // ignore
            }
        }

        // If we get here, return path as fallback
        return `/${path}`;
    } catch (e) {
        console.warn('Avatar upload failed:', e?.message || e);
        return null;
    }
}

module.exports = { uploadAvatarToStorage };
