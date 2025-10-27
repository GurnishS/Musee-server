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

    out.bio = typeof payload.bio === 'string' ? payload.bio.trim() : '';
    out.cover_url = typeof payload.cover_url === 'string' && payload.cover_url.trim() ? payload.cover_url.trim() : 'https://xvpputhovrhgowfkjhfv.supabase.co/storage/v1/object/public/covers/artists/default_cover.png';

    out.genres = Array.isArray(payload.genres) ? payload.genres.map(String) : [];

    const debut_year = toNum(payload.debut_year, null);
    if (!debut_year) throw new Error('debut_year is required');
    out.debut_year = debut_year;

    out.is_verified = typeof payload.is_verified === 'boolean' ? payload.is_verified : false;

    out.monthly_listeners = typeof payload.monthly_listeners === 'number' ? Math.max(0, Math.trunc(payload.monthly_listeners)) : 0;

    const region_id = isUUID(payload.region_id) ? payload.region_id : null;
    if (!region_id) throw new Error('region_id is invalid or not provided');
    out.region_id = region_id;

    out.date_of_birth = toDate(payload.date_of_birth);

    // social_links: optional object, default {}
    out.social_links = (payload.social_links && typeof payload.social_links === 'object') ? payload.social_links : {};

    out.created_at = new Date().toISOString();
    out.updated_at = new Date().toISOString();

    return out;
}

function sanitizeUpdate(payload = {}) {
    const out = {};
    if (payload.bio !== undefined) out.bio = typeof payload.bio === 'string' ? payload.bio.trim() : payload.bio;
    if (payload.cover_url !== undefined) out.cover_url = typeof payload.cover_url === 'string' ? payload.cover_url.trim() : payload.cover_url;

    if (payload.genres !== undefined) {
        if (!Array.isArray(payload.genres)) throw new Error('genres must be an array');
        out.genres = payload.genres.map(String);
    }

    if (payload.debut_year !== undefined) {
        const v = Math.trunc(Number(payload.debut_year));
        if (!Number.isFinite(v) || v <= 0) throw new Error('debut_year must be a positive number');
        out.debut_year = v;
    }

    if (payload.is_verified !== undefined) out.is_verified = Boolean(payload.is_verified);

    if (payload.monthly_listeners !== undefined) {
        out.monthly_listeners = Math.max(0, Math.trunc(toNum(payload.monthly_listeners, 0)));
    }

    if (payload.region_id !== undefined) {
        if (payload.region_id !== null && !isUUID(payload.region_id)) throw new Error('region_id must be a UUID or null');
        out.region_id = payload.region_id;
    }

    if (payload.date_of_birth !== undefined) {
        out.date_of_birth = toDate(payload.date_of_birth);
    }

    if (payload.social_links !== undefined) {
        if (!(payload.social_links && typeof payload.social_links === 'object')) throw new Error('social_links must be an object');
        out.social_links = payload.social_links;
    }
    return out;
}

async function listArtists({ limit = 20, offset = 0, q } = {}) {
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;

    // Join artists with users and fetch all columns from both (users nested)
    let qb = client()
        .from(table)
        .select('*, users:users!artists_artist_id_fkey(*)', { count: 'exact' })
        .order('created_at', { ascending: false });
    if (q) qb = qb.ilike('bio', `%${q}%`);

    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    return { items: data, total: count };
}

async function getArtist(artist_id) {
    const { data, error } = await client()
        .from(table)
        .select('*, users:users!artists_artist_id_fkey(*)')
        .eq('artist_id', artist_id)
        .maybeSingle();
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

//public functions
async function listArtistsUser({ limit = 20, offset = 0, q } = {}) {
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;

    // Join artists with users to expose public profile fields from users
    // Select only public fields
    let qb = client()
        .from(table)
        .select(
            `artist_id, cover_url, bio, genres, debut_year, is_verified, monthly_listeners,
             users:users!artists_artist_id_fkey(name, avatar_url)`,
            { count: 'exact' }
        )
        .order('created_at', { ascending: false });

    if (q) {
        // Search in artist bio or user name
        qb = qb.or(`bio.ilike.%${q}%,users.name.ilike.%${q}%`);
    }

    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;

    // Flatten nested users fields
    const items = (data || []).map(row => ({
        artist_id: row.artist_id,
        name: row.users?.name || null,
        avatar_url: row.users?.avatar_url || null,
        cover_url: row.cover_url,
        bio: row.bio,
        genres: row.genres,
        debut_year: row.debut_year,
        is_verified: row.is_verified,
        monthly_listeners: row.monthly_listeners,
    }));

    return { items, total: count };
}

async function getArtistUser(artist_id) {
    const { data, error } = await client()
        .from(table)
        .select(
            `artist_id, cover_url, bio, genres, debut_year, is_verified, monthly_listeners,
             users:users!artists_artist_id_fkey(name, avatar_url)`
        )
        .eq('artist_id', artist_id)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
        artist_id: data.artist_id,
        name: data.users?.name || null,
        avatar_url: data.users?.avatar_url || null,
        cover_url: data.cover_url,
        bio: data.bio,
        genres: data.genres,
        debut_year: data.debut_year,
        is_verified: data.is_verified,
        monthly_listeners: data.monthly_listeners,
    };
}

module.exports = { listArtists, getArtist, createArtist, updateArtist, deleteArtist, listArtistsUser, getArtistUser };
