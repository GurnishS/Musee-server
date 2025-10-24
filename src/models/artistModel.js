const { supabase, supabaseAdmin } = require('../db/config');

const table = 'artists';

function client() {
    return supabaseAdmin || supabase;
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
    // payload must include artist_id which should match users.user_id
    const { data, error } = await client().from(table).insert(payload).select('*').single();
    if (error) throw error;
    return data;
}

async function updateArtist(artist_id, payload) {
    const { data, error } = await client().from(table).update({ ...payload, updated_at: new Date().toISOString() }).eq('artist_id', artist_id).select('*').single();
    if (error) throw error;
    return data;
}

async function deleteArtist(artist_id) {
    const { error } = await client().from(table).delete().eq('artist_id', artist_id);
    if (error) throw error;
}

module.exports = { listArtists, getArtist, createArtist, updateArtist, deleteArtist };
