const { supabase, supabaseAdmin } = require('../db/config');

const table = 'users';

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
    // user_id required (references auth.users.id)
    if (!isUUID(payload.user_id)) throw new Error('user_id (UUID) is required');
    out.user_id = payload.user_id;

    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) throw new Error('name is required');
    out.name = name;

    out.subscription_type = typeof payload.subscription_type === 'string' && payload.subscription_type.trim()
        ? payload.subscription_type.trim()
        : 'free';

    if (payload.plan_id !== undefined && payload.plan_id !== null) {
        if (!isUUID(payload.plan_id)) throw new Error('plan_id must be a UUID');
        out.plan_id = payload.plan_id;
    }

    out.avatar_url = typeof payload.avatar_url === 'string' && payload.avatar_url.trim()
        ? payload.avatar_url.trim()
        : '/avatars/users/default_avatar.png';

    if (payload.playlists !== undefined) {
        if (!Array.isArray(payload.playlists)) throw new Error('playlists must be an array');
        out.playlists = payload.playlists.map(String);
    }

    out.favorites = (payload.favorites && typeof payload.favorites === 'object') ? payload.favorites : {};

    out.followers_count = Math.max(0, Math.trunc(toNum(payload.followers_count, 0)));
    out.followings_count = Math.max(0, Math.trunc(toNum(payload.followings_count, 0)));

    out.last_login_at = toDate(payload.last_login_at);

    out.settings = (payload.settings && typeof payload.settings === 'object') ? payload.settings : {};

    out.created_at = new Date().toISOString();
    out.updated_at = new Date().toISOString();

    out.user_type = typeof payload.user_type === 'string' && payload.user_type.trim() ? payload.user_type.trim() : 'listener';

    return out;
}

function sanitizeUpdate(payload = {}) {
    const out = {};
    if (payload.name !== undefined) {
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        if (!name) throw new Error('name cannot be empty');
        out.name = name;
    }
    if (payload.subscription_type !== undefined) {
        out.subscription_type = typeof payload.subscription_type === 'string' ? payload.subscription_type.trim() : payload.subscription_type;
    }
    if (payload.plan_id !== undefined) {
        if (payload.plan_id !== null && !isUUID(payload.plan_id)) throw new Error('plan_id must be a UUID or null');
        out.plan_id = payload.plan_id;
    }
    if (payload.avatar_url !== undefined) {
        out.avatar_url = typeof payload.avatar_url === 'string' ? payload.avatar_url.trim() : payload.avatar_url;
    }
    if (payload.playlists !== undefined) {
        if (!Array.isArray(payload.playlists)) throw new Error('playlists must be an array');
        out.playlists = payload.playlists.map(String);
    }
    if (payload.favorites !== undefined) {
        if (!(payload.favorites && typeof payload.favorites === 'object')) throw new Error('favorites must be an object');
        out.favorites = payload.favorites;
    }
    if (payload.followers_count !== undefined) {
        out.followers_count = Math.max(0, Math.trunc(toNum(payload.followers_count, 0)));
    }
    if (payload.followings_count !== undefined) {
        out.followings_count = Math.max(0, Math.trunc(toNum(payload.followings_count, 0)));
    }
    if (payload.last_login_at !== undefined) {
        out.last_login_at = toDate(payload.last_login_at);
    }
    if (payload.settings !== undefined) {
        if (!(payload.settings && typeof payload.settings === 'object')) throw new Error('settings must be an object');
        out.settings = payload.settings;
    }
    if (payload.user_type !== undefined) {
        out.user_type = typeof payload.user_type === 'string' ? payload.user_type.trim() : payload.user_type;
    }
    return out;
}

async function listUsers({ limit = 20, offset = 0, q } = {}) {
    // Supabase/PostgREST v2 uses range(start, end) for pagination instead of offset()
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;

    // Build base query
    let qb = client().from(table).select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (q) {
        // simple text search on name
        qb = qb.ilike('name', `%${q}%`);
    }

    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    return { items: data, total: count };
}

async function getUser(user_id) {
    const { data, error } = await client().from(table).select('*').eq('user_id', user_id).maybeSingle();
    if (error) throw error;
    return data;
}

async function createUser(payload) {
    const input = sanitizeInsert(payload);
    const { data, error } = await client().from(table).insert(input).select('*').single();
    if (error) throw error;
    return data;
}

async function updateUser(user_id, payload) {
    const input = sanitizeUpdate(payload);
    const { data, error } = await client().from(table).update({ ...input, updated_at: new Date().toISOString() }).eq('user_id', user_id).select('*').single();
    if (error) throw error;
    return data;
}

async function deleteUser(user_id) {
    const { error } = await client().from(table).delete().eq('user_id', user_id);
    if (error) throw error;
}

module.exports = { listUsers, getUser, createUser, updateUser, deleteUser };
