const { supabase, supabaseAdmin } = require('../db/config');

const table = 'regions';

function client() {
    return supabaseAdmin || supabase;
}

function isUUID(v) {
    return typeof v === 'string' && /^[0-9a-fA-F-]{36}$/.test(v);
}

function isValidRegionCode(v) {
    return typeof v === 'string' && /^[A-Z]{2}-[A-Z0-9]{1,8}$/i.test(v.trim());
}

function sanitizeInsert(payload = {}) {
    const out = {};
    const code = typeof payload.code === 'string' ? payload.code.trim() : '';
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    const country_id = payload.country_id;
    if (!code) throw new Error('code is required');
    if (!isValidRegionCode(code)) throw new Error('code format is invalid');
    if (!name) throw new Error('name is required');
    if (!isUUID(country_id)) throw new Error('country_id (UUID) is required');
    out.code = code;
    out.name = name;
    out.country_id = country_id;
    out.created_at = new Date().toISOString();
    return out;
}

function sanitizeUpdate(payload = {}) {
    const out = {};
    if (payload.code !== undefined) {
        const code = typeof payload.code === 'string' ? payload.code.trim() : '';
        if (!code) throw new Error('code cannot be empty');
        if (!isValidRegionCode(code)) throw new Error('code format is invalid');
        out.code = code;
    }
    if (payload.name !== undefined) {
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        if (!name) throw new Error('name cannot be empty');
        out.name = name;
    }
    if (payload.country_id !== undefined) {
        if (payload.country_id !== null && !isUUID(payload.country_id)) throw new Error('country_id must be a UUID or null');
        out.country_id = payload.country_id;
    }
    return out;
}

async function listRegions({ limit = 20, offset = 0, q, country_id } = {}) {
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;
    let qb = client().from(table).select('*', { count: 'exact' }).order('code', { ascending: true });
    if (q) qb = qb.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
    if (country_id) qb = qb.eq('country_id', country_id);
    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    return { items: data, total: count };
}

async function getRegion(region_id) {
    const { data, error } = await client().from(table).select('*').eq('region_id', region_id).maybeSingle();
    if (error) throw error;
    return data;
}

async function createRegion(payload) {
    const input = sanitizeInsert(payload);
    const { data, error } = await client().from(table).insert(input).select('*').single();
    if (error) throw error;
    return data;
}

async function updateRegion(region_id, payload) {
    const input = sanitizeUpdate(payload);
    const { data, error } = await client().from(table).update(input).eq('region_id', region_id).select('*').single();
    if (error) throw error;
    return data;
}

async function deleteRegion(region_id) {
    const { error } = await client().from(table).delete().eq('region_id', region_id);
    if (error) throw error;
}

//user functions
async function listRegionsUser({ limit = 20, offset = 0, q, country_id } = {}) {
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;
    let qb = client().from(table).select('region_id, country_id, code, name', { count: 'exact' }).order('code', { ascending: true });
    if (q) qb = qb.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
    if (country_id) qb = qb.eq('country_id', country_id);
    const { data, error, count } = await qb.range(start, end);
    if (error) throw error;
    return { items: data, total: count };
}

async function getRegionUser(region_id) {
    const { data, error } = await client().from(table).select('region_id, country_id, code, name').eq('region_id', region_id).maybeSingle();
    if (error) throw error;
    return data;
}

module.exports = { listRegions, getRegion, createRegion, updateRegion, deleteRegion, listRegionsUser, getRegionUser };
