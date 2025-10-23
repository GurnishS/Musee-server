const { supabase, supabaseAdmin } = require('../db/config');

const table = 'users';

function client() {
    return supabaseAdmin || supabase;
}

async function listUsers({ limit = 20, offset = 0, q } = {}) {
    let query = client().from(table).select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(limit).offset(offset);
    if (q) {
        // simple text search on name
        query = query.ilike('name', `%${q}%`);
    }
    const { data, error, count } = await query;
    if (error) throw error;
    return { items: data, total: count };
}

async function getUser(user_id) {
    const { data, error } = await client().from(table).select('*').eq('user_id', user_id).maybeSingle();
    if (error) throw error;
    return data;
}

async function createUser(payload) {
    const { data, error } = await client().from(table).insert(payload).select('*').single();
    if (error) throw error;
    return data;
}

async function updateUser(user_id, payload) {
    const { data, error } = await client().from(table).update({ ...payload, updated_at: new Date().toISOString() }).eq('user_id', user_id).select('*').single();
    if (error) throw error;
    return data;
}

async function deleteUser(user_id) {
    const { error } = await client().from(table).delete().eq('user_id', user_id);
    if (error) throw error;
}

module.exports = { listUsers, getUser, createUser, updateUser, deleteUser };
