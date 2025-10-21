const { supabase, supabaseAdmin } = require('../db/config');

// Lightweight validation/coercion to avoid zod CJS issues
const BILLING_CYCLES = new Set(['monthly', 'yearly', 'lifetime']);

function toBool(v, def) {
    if (v === undefined || v === null) return def;
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
    return def;
}

function toNum(v, def) {
    if (v === undefined || v === null || v === '') return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

function sanitizeInsert(payload = {}) {
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) throw new Error('name is required');

    const price = toNum(payload.price, NaN);
    if (!(price >= 0)) throw new Error('price must be a non-negative number');

    const currency = (typeof payload.currency === 'string' && payload.currency.trim()) || 'INR';
    const billing_cycleRaw = typeof payload.billing_cycle === 'string' ? payload.billing_cycle.toLowerCase() : 'monthly';
    const billing_cycle = BILLING_CYCLES.has(billing_cycleRaw) ? billing_cycleRaw : 'monthly';

    const features = (payload.features && typeof payload.features === 'object' && !Array.isArray(payload.features)) ? payload.features : {};
    const max_devices = Math.max(1, Math.trunc(toNum(payload.max_devices, 1)) || 1);
    const is_active = toBool(payload.is_active, true);

    return { name, price, currency, billing_cycle, features, max_devices, is_active };
}

function sanitizeUpdate(payload = {}) {
    const out = {};
    if (payload.name !== undefined) {
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        if (!name) throw new Error('name cannot be empty');
        out.name = name;
    }
    if (payload.price !== undefined) {
        const price = toNum(payload.price, NaN);
        if (!(price >= 0)) throw new Error('price must be a non-negative number');
        out.price = price;
    }
    if (payload.currency !== undefined) {
        const currency = typeof payload.currency === 'string' ? payload.currency.trim() : '';
        if (!currency) throw new Error('currency cannot be empty');
        out.currency = currency;
    }
    if (payload.billing_cycle !== undefined) {
        const bc = typeof payload.billing_cycle === 'string' ? payload.billing_cycle.toLowerCase() : '';
        if (!BILLING_CYCLES.has(bc)) throw new Error('billing_cycle must be one of: monthly, yearly, lifetime');
        out.billing_cycle = bc;
    }
    if (payload.features !== undefined) {
        if (!(payload.features && typeof payload.features === 'object' && !Array.isArray(payload.features))) {
            throw new Error('features must be an object');
        }
        out.features = payload.features;
    }
    if (payload.max_devices !== undefined) {
        const md = Math.trunc(toNum(payload.max_devices, NaN));
        if (!(md >= 1)) throw new Error('max_devices must be an integer >= 1');
        out.max_devices = md;
    }
    if (payload.is_active !== undefined) {
        out.is_active = toBool(payload.is_active, true);
    }
    return out;
}

const table = 'plans';

function client() {
    // Use admin client if available to bypass RLS for admin routes
    return supabaseAdmin || supabase;
}

async function listPlans() {
    const { data, error } = await client()
        .from(table)
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

async function getPlan(plan_id) {
    const { data, error } = await client()
        .from(table)
        .select('*')
        .eq('plan_id', plan_id)
        .maybeSingle();
    if (error) throw error;
    return data;
}

async function createPlan(payload) {
    const input = sanitizeInsert(payload);
    const { data, error } = await client()
        .from(table)
        .insert(input)
        .select('*')
        .single();
    if (error) throw error;
    return data;
}

async function updatePlan(plan_id, payload) {
    const input = sanitizeUpdate(payload);
    const { data, error } = await client()
        .from(table)
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('plan_id', plan_id)
        .select('*')
        .single();
    if (error) throw error;
    return data;
}

async function deletePlan(plan_id) {
    const { error } = await client().from(table).delete().eq('plan_id', plan_id);
    if (error) throw error;
}

module.exports = {
    listPlans,
    getPlan,
    createPlan,
    updatePlan,
    deletePlan,
};
