const { supabase, supabaseAdmin } = require('../db/config');
const { v4: uuidv4 } = require('uuid');

const table = 'tracks';

function client() {
    return supabaseAdmin || supabase;
}

// helpers
function isUUID(v) {
    return typeof v === 'string' && /^[0-9a-fA-F-]{36}$/.test(v);
}

function toNum(v, def) {
    if (v === undefined || v === null || v === '') return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

function toDate(v) {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

function sanitizeInsert(payload = {}) {
    const out = {};

    const title = typeof payload.title === 'string' ? payload.title.trim() : null;
    if (!title) throw new Error('title is required');
    out.title = title;

    // artist_ids: optional array of UUIDs
    if (payload.artist_ids !== undefined && payload.artist_ids !== null) {
        if (!Array.isArray(payload.artist_ids)) throw new Error('artist_ids must be an array');
        out.artist_ids = payload.artist_ids.map(String);
    }

    out.album_id = payload.album_id !== undefined ? payload.album_id : null;

    out.release_date = payload.release_date ? toDate(payload.release_date) : null;

    out.genres = Array.isArray(payload.genres) ? payload.genres.map(String) : [];

    // audio_files intentionally left for later (TODO)
    out.audio_files = payload.audio_files || null;

    out.cover_url = typeof payload.cover_url === 'string' && payload.cover_url.trim() ? payload.cover_url.trim() : 'https://xvpputhovrhgowfkjhfv.supabase.co/storage/v1/object/public/covers/tracks/default_track_cover.png';

    out.video_url = typeof payload.video_url === 'string' && payload.video_url.trim() ? payload.video_url.trim() : null;

    out.duration = payload.duration !== undefined ? payload.duration : null;

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
    if (payload.artist_ids !== undefined) {
        if (!Array.isArray(payload.artist_ids)) throw new Error('artist_ids must be an array');
        out.artist_ids = payload.artist_ids.map(String);
    }
    if (payload.album_id !== undefined) out.album_id = payload.album_id;
    if (payload.release_date !== undefined) out.release_date = toDate(payload.release_date);
    if (payload.genres !== undefined) out.genres = Array.isArray(payload.genres) ? payload.genres.map(String) : payload.genres;
    if (payload.audio_files !== undefined) out.audio_files = payload.audio_files;
    if (payload.duration !== undefined) out.duration = payload.duration;
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

    let qb = client().from(table).select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (q) qb = qb.ilike('title', `%${q}%`);

    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    return { items: data, total: count };
}

async function getTrack(track_id) {
    const { data, error } = await client().from(table).select('*').eq('track_id', track_id).maybeSingle();
    if (error) throw error;
    return data;
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

    let qb = client().from(table).select('track_id, title, cover_url', { count: 'exact' }).eq('is_published', true).order('created_at', { ascending: false });
    if (q) qb = qb.ilike('title', `%${q}%`);

    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    return { items: data, total: count };
}

async function getTrackUser(track_id) {
    const { data, error } = await client().from(table).select('track_id, title, cover_url, artist_ids, album_id, release_date, genres, audio_files, duration, play_count, is_explicit, likes_count').eq('track_id', track_id).eq('is_published', true).maybeSingle();
    if (error) throw error;
    return data;
}

module.exports = { listTracks, getTrack, createTrack, updateTrack, deleteTrack, listTracksUser, getTrackUser };
