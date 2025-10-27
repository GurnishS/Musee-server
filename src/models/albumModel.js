const { supabase, supabaseAdmin } = require('../db/config');

const table = 'albums';

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

function toDateOnly(v) {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function toInterval(v) {
    // Accept seconds number or ISO 8601 duration string, else null
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) {
        // convert seconds to Postgres interval like '123 seconds'
        return `${Math.trunc(v)} seconds`;
    }
    if (typeof v === 'string') return v.trim();
    return null;
}

function toTextArray(val) {
    if (val === undefined) return undefined;
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') {
        const t = val.trim();
        if (!t) return [];
        return t.includes(',') ? t.split(',').map(s => s.trim()).filter(Boolean) : [t];
    }
    return [];
}

function toUUIDArray(val) {
    if (val === undefined) return undefined;
    const arr = Array.isArray(val) ? val : (typeof val === 'string' ? (val.trim() ? (val.includes(',') ? val.split(',') : [val]) : []) : []);
    return arr.map(s => String(s).trim()).filter(isUUID);
}

function sanitizeInsert(payload = {}) {
    const out = {};
    // Allow creating an "empty" album with default title
    const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : 'Untitled Album';
    out.title = title;

    if (payload.artist_id !== undefined && payload.artist_id !== null) {
        if (!isUUID(payload.artist_id)) throw new Error('artist_id must be a UUID');
        out.artist_id = payload.artist_id;
    }

    if (payload.release_date !== undefined) out.release_date = toDateOnly(payload.release_date);
    if (payload.description !== undefined) out.description = typeof payload.description === 'string' ? payload.description.trim() : null;
    if (payload.cover_url !== undefined) out.cover_url = typeof payload.cover_url === 'string' ? payload.cover_url.trim() : null;

    const genres = toTextArray(payload.genres);
    if (genres !== undefined) out.genres = genres;

    out.total_tracks = Math.max(0, Math.trunc(toNum(payload.total_tracks, 0)));
    out.likes_count = Math.max(0, Math.trunc(toNum(payload.likes_count, 0)));
    out.play_count = Math.max(0, Math.trunc(toNum(payload.play_count, 0)));

    const track_ids = toUUIDArray(payload.track_ids);
    if (track_ids !== undefined) out.track_ids = track_ids;

    if (payload.duration !== undefined) out.duration = toInterval(payload.duration);

    if (payload.is_published !== undefined) out.is_published = Boolean(payload.is_published);

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
    if (payload.artist_id !== undefined) {
        if (payload.artist_id !== null && !isUUID(payload.artist_id)) throw new Error('artist_id must be a UUID or null');
        out.artist_id = payload.artist_id;
    }
    if (payload.release_date !== undefined) out.release_date = toDateOnly(payload.release_date);
    if (payload.description !== undefined) out.description = typeof payload.description === 'string' ? payload.description.trim() : payload.description;
    if (payload.cover_url !== undefined) out.cover_url = typeof payload.cover_url === 'string' ? payload.cover_url.trim() : payload.cover_url;

    const genres = toTextArray(payload.genres);
    if (genres !== undefined) out.genres = genres;

    if (payload.total_tracks !== undefined) out.total_tracks = Math.max(0, Math.trunc(toNum(payload.total_tracks, 0)));
    if (payload.likes_count !== undefined) out.likes_count = Math.max(0, Math.trunc(toNum(payload.likes_count, 0)));
    if (payload.play_count !== undefined) out.play_count = Math.max(0, Math.trunc(toNum(payload.play_count, 0)));

    const track_ids = toUUIDArray(payload.track_ids);
    if (track_ids !== undefined) out.track_ids = track_ids;

    if (payload.duration !== undefined) out.duration = toInterval(payload.duration);

    if (payload.is_published !== undefined) out.is_published = Boolean(payload.is_published);

    return out;
}

async function listAlbums({ limit = 20, offset = 0, q } = {}) {
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;
    let qb = client().from(table).select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (q) qb = qb.ilike('title', `%${q}%`);
    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    return { items: data, total: count };
}

async function getAlbum(album_id) {
    const { data, error } = await client().from(table).select('*').eq('album_id', album_id).maybeSingle();
    if (error) throw error;
    return data;
}

async function createAlbum(payload) {
    const input = sanitizeInsert(payload);
    const { data, error } = await client().from(table).insert(input).select('*').single();
    if (error) throw error;
    return data;
}

async function updateAlbum(album_id, payload) {
    const input = sanitizeUpdate(payload);
    const { data, error } = await client().from(table).update({ ...input, updated_at: new Date().toISOString() }).eq('album_id', album_id).select('*').single();
    if (error) throw error;
    return data;
}

async function deleteAlbum(album_id) {
    const { error } = await client().from(table).delete().eq('album_id', album_id);
    if (error) throw error;
}

async function listAlbumsPublic({ limit = 20, offset = 0, q } = {}) {
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;
    let qb = client().from(table).select('*', { count: 'exact'}).eq('is_published', true).order('created_at', { ascending: false });
    if (q) qb = qb.ilike('title', `%${q}%`);
    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    return { items: data, total: count };
}

async function getAlbumPublic(album_id) {
    const { data, error } = await client().from(table).select('*').eq('album_id', album_id).eq('is_published', true).maybeSingle();
    if (error) throw error;
    return data;
}

module.exports = { listAlbums, getAlbum, createAlbum, updateAlbum, deleteAlbum, listAlbumsPublic, getAlbumPublic };
