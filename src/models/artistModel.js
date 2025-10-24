const { supabase, supabaseAdmin } = require('../db/config');

const table = 'artists';

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
    // artist_id required (references users.user_id)
    if (!isUUID(payload.artist_id)) throw new Error('artist_id (UUID) is required');
    out.artist_id = payload.artist_id;

    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) throw new Error('name is required');
    out.name = name;

    out.bio = typeof payload.bio === 'string' ? payload.bio.trim() : '';
    out.website = typeof payload.website === 'string' ? payload.website.trim() : null;
    out.cover_url = typeof payload.cover_url === 'string' && payload.cover_url.trim() ? payload.cover_url.trim() : null;

    out.social = (payload.social && typeof payload.social === 'object') ? payload.social : {};

    out.followers_count = Math.max(0, Math.trunc(toNum(payload.followers_count, 0)));

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
    if (payload.bio !== undefined) out.bio = typeof payload.bio === 'string' ? payload.bio.trim() : payload.bio;
    if (payload.website !== undefined) out.website = typeof payload.website === 'string' ? payload.website.trim() : payload.website;
    if (payload.cover_url !== undefined) out.cover_url = typeof payload.cover_url === 'string' ? payload.cover_url.trim() : payload.cover_url;
    if (payload.social !== undefined) {
        if (!(payload.social && typeof payload.social === 'object')) throw new Error('social must be an object');
        out.social = payload.social;
    }
    if (payload.followers_count !== undefined) out.followers_count = Math.max(0, Math.trunc(toNum(payload.followers_count, 0)));
    return out;
}

async function listArtists({ limit = 20, offset = 0, q } = {}) {
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;

    let qb = client().from(table).select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (q) qb = qb.ilike('bio', `%${q}%`);

    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    return { items: data, total: count };
}

async function getArtist(artist_id) {
    const { data, error } = await client().from(table).select('*').eq('artist_id', artist_id).maybeSingle();
    if (error) throw error;
    return data;
}

async function createArtist(payload) {
    const input = sanitizeInsert(payload);
    const { data, error } = await client().from(table).insert(input).select('*').single();
    if (error) throw error;
    return data;
}

async function updateArtist(artist_id, payload) {
    const input = sanitizeUpdate(payload);
    const { data, error } = await client().from(table).update({ ...input, updated_at: new Date().toISOString() }).eq('artist_id', artist_id).select('*').single();
    if (error) throw error;
    return data;
}

async function deleteArtist(artist_id) {
    const { error } = await client().from(table).delete().eq('artist_id', artist_id);
    if (error) throw error;
}

module.exports = { listArtists, getArtist, createArtist, updateArtist, deleteArtist };
