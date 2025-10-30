const { supabase, supabaseAdmin } = require('../db/config');
const { getBlobSasUrl, isAbsoluteUrl } = require('../utils/azureSas');
const { isUUID, validateAudioExts, validateArtistRoles } = require('../utils/validators');
const { toNum } = require('../utils/typeConversions');

const table = 'tracks';

function client() {
    return supabaseAdmin || supabase;
}

// helpers are imported from validators/typeConversions

function sanitizeInsert(payload = {}) {
    const out = {};

    const title = typeof payload.title === 'string' ? payload.title.trim() : null;
    if (!title) throw new Error('title is required');
    out.title = title;

    // album_id required (UUID)
    if (!isUUID(payload.album_id)) throw new Error('album_id (UUID) is required');
    out.album_id = payload.album_id;

    out.video_url = typeof payload.video_url === 'string' && payload.video_url.trim() ? payload.video_url.trim() : null;

    out.lyrics_url = typeof payload.lyrics_url === 'string' && payload.lyrics_url.trim() ? payload.lyrics_url.trim() : null;

    // duration required integer >= 0
    const duration = toNum(payload.duration, null);
    if (duration === null || duration < 0) throw new Error('duration is required and must be a non-negative integer');
    out.duration = Math.trunc(duration);

    out.play_count = Math.max(0, Math.trunc(toNum(payload.play_count, 0)));

    out.is_explicit = typeof payload.is_explicit === 'boolean' ? payload.is_explicit : !!payload.is_explicit;

    out.likes_count = Math.max(0, Math.trunc(toNum(payload.likes_count, 0)));

    out.popularity_score = toNum(payload.popularity_score) || 0;

    out.is_published = !!payload.is_published;

    out.created_at = new Date().toISOString();
    out.updated_at = new Date().toISOString();

    return out;
}

function sanitizeUpdate(payload = {}) {
    const out = {};
    if (payload.title !== undefined) {
        const title = typeof payload.title === 'string' ? payload.title.trim() : '';
        if (!title) throw new Error('title cannot be empty');
        out.title = title;
    }
    if (payload.album_id !== undefined) {
        if (!isUUID(payload.album_id)) throw new Error('album_id must be a valid UUID');
        out.album_id = payload.album_id;
    }
    if (payload.lyrics_url !== undefined) out.lyrics_url = typeof payload.lyrics_url === 'string' ? payload.lyrics_url.trim() : null;
    if (payload.video_url !== undefined) out.video_url = typeof payload.video_url === 'string' ? payload.video_url.trim() : null;
    if (payload.duration !== undefined) {
        const d = toNum(payload.duration, null);
        if (d === null || d < 0) throw new Error('duration is invalid');
        out.duration = Math.trunc(d);
    }
    if (payload.play_count !== undefined) out.play_count = Math.max(0, Math.trunc(toNum(payload.play_count, 0)));
    if (payload.is_explicit !== undefined) out.is_explicit = !!payload.is_explicit;
    if (payload.likes_count !== undefined) out.likes_count = Math.max(0, Math.trunc(toNum(payload.likes_count, 0)));
    if (payload.popularity_score !== undefined) out.popularity_score = toNum(payload.popularity_score) || 0;
    if (payload.is_published !== undefined) out.is_published = !!payload.is_published;

    return out;
}

async function listTracks({ limit = 20, offset = 0, q } = {}) {
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;

    // include artists and audio variants
    let qb = client()
        .from(table)
        .select(`
            track_id, title, album_id, lyrics_url, duration, play_count, is_explicit, likes_count, popularity_score, created_at, updated_at, video_url, is_published,
            track_artists:track_artists!track_artists_track_id_fkey(
                role,
                artists:artists!track_artists_artist_id_fkey(
                    artist_id,
                    users:users!artists_artist_id_fkey(user_id, name, avatar_url)
                )
            ),
            track_audios:track_audios!audio_info_track_id_fkey(
                id, ext, bitrate, path, created_at
            )
        `, { count: 'exact' })
        .order('created_at', { ascending: false });
    if (q) qb = qb.ilike('title', `%${q}%`);

    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    const toSignedAudio = (a) => {
        try {
            const p = a.path;
            const url = isAbsoluteUrl(p) ? p : getBlobSasUrl(p);
            return { id: a.id, ext: a.ext, bitrate: a.bitrate, path: url, created_at: a.created_at };
        } catch (e) {
            return { id: a.id, ext: a.ext, bitrate: a.bitrate, path: a.path, created_at: a.created_at };
        }
    };

    const items = (data || []).map(row => ({
        track_id: row.track_id,
        title: row.title,
        album_id: row.album_id,
        lyrics_url: row.lyrics_url,
        duration: row.duration,
        play_count: row.play_count,
        is_explicit: row.is_explicit,
        likes_count: row.likes_count,
        popularity_score: row.popularity_score,
        created_at: row.created_at,
        updated_at: row.updated_at,
        video_url: row.video_url,
        is_published: row.is_published,
        artists: (row.track_artists || []).map(ta => ({
            artist_id: ta?.artists?.artist_id || null,
            role: ta?.role || null,
            name: ta?.artists?.users?.name || null,
            avatar_url: ta?.artists?.users?.avatar_url || null,
        })),
        audios: (row.track_audios || []).map(toSignedAudio),
    }));
    return { items, total: count };
}

async function getTrack(track_id) {
    const { data, error } = await client()
        .from(table)
        .select(`
            track_id, title, album_id, lyrics_url, duration, play_count, is_explicit, likes_count, popularity_score, created_at, updated_at, video_url, is_published,
            track_artists:track_artists!track_artists_track_id_fkey(
                role,
                artists:artists!track_artists_artist_id_fkey(
                    artist_id,
                    users:users!artists_artist_id_fkey(user_id, name, avatar_url)
                )
            ),
            track_audios:track_audios!audio_info_track_id_fkey(
                id, ext, bitrate, path, created_at
            )
        `)
        .eq('track_id', track_id)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
        track_id: data.track_id,
        title: data.title,
        album_id: data.album_id,
        lyrics_url: data.lyrics_url,
        duration: data.duration,
        play_count: data.play_count,
        is_explicit: data.is_explicit,
        likes_count: data.likes_count,
        popularity_score: data.popularity_score,
        created_at: data.created_at,
        updated_at: data.updated_at,
        video_url: data.video_url,
        is_published: data.is_published,
        artists: (data.track_artists || []).map(ta => ({
            artist_id: ta?.artists?.artist_id || null,
            role: ta?.role || null,
            name: ta?.artists?.users?.name || null,
            avatar_url: ta?.artists?.users?.avatar_url || null,
        })),
        audios: (data.track_audios || []).map(a => {
            try {
                const p = a.path;
                const url = isAbsoluteUrl(p) ? p : getBlobSasUrl(p);
                return { id: a.id, ext: a.ext, bitrate: a.bitrate, path: url, created_at: a.created_at };
            } catch (e) {
                return { id: a.id, ext: a.ext, bitrate: a.bitrate, path: a.path, created_at: a.created_at };
            }
        }),
    };
}

async function createTrack(payload) {
    const input = sanitizeInsert(payload);
    const { data, error } = await client().from(table).insert(input).select('*').single();
    if (error) throw error;
    return data;
}

async function updateTrack(track_id, payload) {
    const input = sanitizeUpdate(payload);
    const { data, error } = await client().from(table).update({ ...input, updated_at: new Date().toISOString() }).eq('track_id', track_id).select('*').single();
    if (error) throw error;
    return data;
}

async function deleteTrack(track_id) {
    const { error } = await client().from(table).delete().eq('track_id', track_id);
    if (error) throw error;
}

async function listTracksUser({ limit = 20, offset = 0, q } = {}) {
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;

    let qb = client()
        .from(table)
        .select(`
            track_id, title, duration, created_at,
            track_artists:track_artists!track_artists_track_id_fkey(
                artists:artists!track_artists_artist_id_fkey(
                    artist_id,
                    users:users!artists_artist_id_fkey(name, avatar_url)
                )
            )
        `, { count: 'exact' })
        .eq('is_published', true)
        .order('created_at', { ascending: false });
    if (q) qb = qb.ilike('title', `%${q}%`);

    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    const items = (data || []).map(row => ({
        track_id: row.track_id,
        title: row.title,
        duration: row.duration,
        created_at: row.created_at,
        artists: (row.track_artists || []).map(ta => ({
            artist_id: ta?.artists?.artist_id || null,
            name: ta?.artists?.users?.name || null,
            avatar_url: ta?.artists?.users?.avatar_url || null,
        })),
    }));
    return { items, total: count };
}

async function getTrackUser(track_id) {
    const { data, error } = await client()
        .from(table)
        .select(`
            track_id, title, album_id, duration, play_count, is_explicit, likes_count, created_at,
            track_artists:track_artists!track_artists_track_id_fkey(
                artists:artists!track_artists_artist_id_fkey(
                    artist_id,
                    users:users!artists_artist_id_fkey(name, avatar_url)
                )
            ),
            track_audios:track_audios!audio_info_track_id_fkey(
                ext, bitrate, path
            )
        `)
        .eq('track_id', track_id)
        .eq('is_published', true)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
        track_id: data.track_id,
        title: data.title,
        album_id: data.album_id,
        duration: data.duration,
        play_count: data.play_count,
        is_explicit: data.is_explicit,
        likes_count: data.likes_count,
        created_at: data.created_at,
        artists: (data.track_artists || []).map(ta => ({
            artist_id: ta?.artists?.artist_id || null,
            name: ta?.artists?.users?.name || null,
            avatar_url: ta?.artists?.users?.avatar_url || null,
        })),
        audios: (data.track_audios || []).map(a => {
            try {
                const p = a.path;
                const url = isAbsoluteUrl(p) ? p : getBlobSasUrl(p);
                return { ext: a.ext, bitrate: a.bitrate, path: url };
            } catch (e) {
                return { ext: a.ext, bitrate: a.bitrate, path: a.path };
            }
        }),
    };
}

module.exports = { listTracks, getTrack, createTrack, updateTrack, deleteTrack, listTracksUser, getTrackUser };
