const { supabase, supabaseAdmin } = require('../db/config');

const table = 'users';

function client() {
    return supabaseAdmin;
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

function generateStrongPassword() {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
    let password = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        password += charset.charAt(Math.floor(Math.random() * n));
    }
    return password;
}

function sanitizeInsert(payload = {}) {
    const out = {};
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) throw new Error('name is required');
    out.name = name;

    const email = typeof payload.email === 'string' ? payload.email.trim() : '';
    if (!email) throw new Error('email is required');
    out.email = email;

    const password = typeof payload.password === 'string' ? payload.password.trim() : generateStrongPassword();
    if (!password) throw new Error('password is required');
    out.password = password;

    return out;
}

function sanitizeUpdate(payload = {}) {
    const out = {};
    if (payload.name !== undefined) {
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        if (!name) throw new Error('name cannot be empty');
        out.name = name;
    }
    if (payload.email !== undefined) {
        const email = typeof payload.email === 'string' ? payload.email.trim() : '';
        if (!email) throw new Error('email cannot be empty');
        out.email = email;
    }
    if (payload.subscription_type !== undefined) {
        out.subscription_type = typeof payload.subscription_type === 'string' ? payload.subscription_type.trim() : payload.subscription_type;
    }
    if (payload.plan_id !== undefined) {
        if (payload.plan_id !== null && !isUUID(payload.plan_id)) throw new Error('plan_id must be a UUID or null');
        out.plan_id = payload.plan_id;
    }
    if (payload.avatar_url !== undefined) {
        out.avatar_url = typeof payload.avatar_url === 'string' ? payload.avatar_url.trim() : 'https://xvpputhovrhgowfkjhfv.supabase.co/storage/v1/object/public/avatars/users/default_avatar.png';
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
    // create auth user (normal user) and mark email as confirmed
    const authRes = await client().auth.admin.createUser({
        email: input.email,
        password: input.password,
        user_metadata: { name: input.name },
        email_confirm: true
    });
    if (authRes.error) throw authRes.error;
    const createdUser = authRes.data?.user ?? authRes.user ?? authRes.data;
    if (!createdUser || !createdUser.id) throw new Error('failed to create auth user');

    //Supabase triggers automatically create corresponding profile in "users" table

    return createdUser;
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

//user functions
async function listUsersPublic({ limit = 20, offset = 0, q } = {}) {
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;

    // Only return public/basic fields for user-facing endpoints
    let qb = client().from(table).select('user_id, name, avatar_url', { count: 'exact' }).order('created_at', { ascending: false });
    if (q) qb = qb.ilike('name', `%${q}%`);

    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    return { items: data, total: count };
}

async function getUserPublic(user_id) {
    const { data, error } = await client().from(table).select('user_id, name, followers_count, following_count, avatar_url, playlists').eq('user_id', user_id).maybeSingle();
    if (error) throw error;
    return data;
}

module.exports = { listUsers, listUsersPublic, getUser, getUserPublic, createUser, updateUser, deleteUser };
