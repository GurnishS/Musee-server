const { supabase, supabaseAdmin } = require('../db/config');

const table = 'playlists';

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
    return d.toISOString().slice(0, 10);
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
    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null;
    if (!name) throw new Error('name is required');
    out.name = name;

    if (payload.creator_id !== undefined && payload.creator_id !== null) {
        if (!isUUID(payload.creator_id)) throw new Error('creator_id must be a UUID');
        out.creator_id = payload.creator_id;
    }

    if (payload.is_public !== undefined) out.is_public = Boolean(payload.is_public);
    if (payload.description !== undefined) out.description = typeof payload.description === 'string' ? payload.description.trim() : null;

    const genres = toTextArray(payload.genres);
    if (genres !== undefined) out.genres = genres;

    out.likes_count = Math.max(0, Math.trunc(toNum(payload.likes_count, 0)));
    out.total_tracks = Math.max(0, Math.trunc(toNum(payload.total_tracks, 0)));
    out.play_count = Math.max(0, Math.trunc(toNum(payload.play_count, 0)));

    const track_ids = toUUIDArray(payload.track_ids);
    if (track_ids !== undefined) out.track_ids = track_ids;

    if (payload.duration !== undefined) out.duration = toNum(payload.duration);

    out.created_at = new Date().toISOString();
    out.updated_at = new Date().toISOString();

    return out;
}

function sanitizeUpdate(payload = {}) {
    const out = {};
    if (payload.name !== undefined) {
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        if (!name) throw new Error('name cannot be empty');
        out.name = name;
    }
    if (payload.creator_id !== undefined) {
        if (payload.creator_id !== null && !isUUID(payload.creator_id)) throw new Error('creator_id must be a UUID or null');
        out.creator_id = payload.creator_id;
    }
    if (payload.is_public !== undefined) out.is_public = Boolean(payload.is_public);
    if (payload.description !== undefined) out.description = typeof payload.description === 'string' ? payload.description.trim() : payload.description;

    const genres = toTextArray(payload.genres);
    if (genres !== undefined) out.genres = genres;

    if (payload.likes_count !== undefined) out.likes_count = Math.max(0, Math.trunc(toNum(payload.likes_count, 0)));
    if (payload.total_tracks !== undefined) out.total_tracks = Math.max(0, Math.trunc(toNum(payload.total_tracks, 0)));
    if (payload.play_count !== undefined) out.play_count = Math.max(0, Math.trunc(toNum(payload.play_count, 0)));

    const track_ids = toUUIDArray(payload.track_ids);
    if (track_ids !== undefined) out.track_ids = track_ids;

    if (payload.duration !== undefined) out.duration = toNum(payload.duration);

    return out;
}

async function listPlaylists({ limit = 20, offset = 0, q } = {}) {
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;
    let qb = client().from(table).select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (q) qb = qb.ilike('name', `%${q}%`);
    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    return { items: data, total: count };
}

async function getPlaylist(playlist_id) {
    const { data, error } = await client().from(table).select('*').eq('playlist_id', playlist_id).maybeSingle();
    if (error) throw error;
    return data;
}

async function createPlaylist(payload) {
    const input = sanitizeInsert(payload);
    const { data, error } = await client().from(table).insert(input).select('*').single();
    if (error) throw error;
    return data;
}

async function updatePlaylist(playlist_id, payload) {
    const input = sanitizeUpdate(payload);
    const { data, error } = await client().from(table).update({ ...input, updated_at: new Date().toISOString() }).eq('playlist_id', playlist_id).select('*').single();
    if (error) throw error;
    return data;
}

async function deletePlaylist(playlist_id) {
    const { error } = await client().from(table).delete().eq('playlist_id', playlist_id);
    if (error) throw error;
}

async function listPlaylistsUser({ limit = 20, offset = 0, q } = {}) {
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;
    let qb = client().from(table).select('playlist_id, creator_id, cover_url, genres, duration, total_tracks', { count: 'exact' }).eq('is_public', true).order('created_at', { ascending: false });
    if (q) qb = qb.ilike('name', `%${q}%`);
    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    return { items: data, total: count };
}

async function getPlaylistUser(playlist_id) {
    const { data, error } = await client().from(table).select('playlist_id, creator_id, cover_url, genres, duration, total_tracks, track_ids').eq('playlist_id', playlist_id).eq('is_public', true).maybeSingle();
    if (error) throw error;

    tracks = [];

    for (const track_id of data.track_ids) {
        const { data: trackRow, error: trackErr } = await client().from('tracks').select('*').eq('track_id', track_id).maybeSingle();
        if (trackErr) throw trackErr;
        if (trackRow) tracks.push(trackRow);
    }
    data.tracks = tracks;
    return data;
}

module.exports = { listPlaylists, getPlaylist, createPlaylist, updatePlaylist, deletePlaylist, getPlaylistUser, listPlaylistsUser };
