COVERS_BUCKET = process.env.COVERS_BUCKET || 'covers';
AVATARS_BUCKET = process.env.AVATARS_BUCKET || 'avatars';
VIDEOS_BUCKET = process.env.VIDEOS_BUCKET || 'videos';

function deleteArtistFiles(artistId, coverUrl) {
    if (!artistId) return Promise.resolve();
    const client = supabaseAdmin || supabase;
    if (!client || !client.storage) return Promise.resolve();
    const path = coverUrl.split('/object/public/covers/')[1];
    return client.storage.from(COVERS_BUCKET).remove([path])
        .then(({ error }) => {
            if (error) {
                console.warn('Failed to delete artist files:', error.message || error);
            }
        })
        .catch(err => {
            console.warn('Error deleting artist files:', err.message || err);
        });
}

function deleteTrackFiles(trackId, coverUrl, videoUrl) {
    if (!trackId) return Promise.resolve();
    const client = supabaseAdmin || supabase;
    if (!client || !client.storage) return Promise.resolve();
    const coverPath = coverUrl.split('/object/public/covers/')[1];
    const videoPath = videoUrl ? videoUrl.split('/object/public/videos/')[1] : null;
    client.storage.from(COVERS_BUCKET).remove([coverPath])
        .then(({ error }) => {
            if (error) {
                console.warn('Failed to delete track cover:', error.message || error);
            }
        })
        .catch(err => {
            console.warn('Error deleting track cover:', err.message || err);
        });
    if (videoPath) client.storage.from(VIDEOS_BUCKET).remove([videoPath])
        .then(({ error }) => {
            if (error) {
                console.warn('Failed to delete track files:', error.message || error);
            }
        })
        .catch(err => {
            console.warn('Error deleting track files:', err.message || err);
        });
    return Promise.resolve();
}

module.exports = {
    deleteArtistFiles,
    deleteTrackFiles,
};