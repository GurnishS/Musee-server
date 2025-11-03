const { supabase, supabaseAdmin } = require('../db/config');
const { isUUID } = require('../utils/validators');

const table = 'followers';
const usersTable = 'users';

function client() {
    return supabaseAdmin || supabase;
}

function assertUUID(id, fieldName) {
    if (!isUUID(id)) throw new Error(`${fieldName} must be a UUID`);
}

async function ensureUserExists(user_id) {
    const { data, error } = await client().from(usersTable).select('user_id').eq('user_id', user_id).maybeSingle();
    if (error) throw error;
    return !!data;
}

async function isFollowing(follower_id, following_id) {
    assertUUID(follower_id, 'follower_id');
    assertUUID(following_id, 'following_id');
    const { data, error } = await client()
        .from(table)
        .select('follower_id')
        .eq('follower_id', follower_id)
        .eq('following_id', following_id)
        .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116: Results contain 0 rows
    return !!data;
}

async function followUser(follower_id, following_id) {
    assertUUID(follower_id, 'follower_id');
    assertUUID(following_id, 'following_id');
    if (follower_id === following_id) {
        const err = new Error('Cannot follow yourself');
        err.status = 400;
        throw err;
    }

    // Validate target exists (let FK also protect at DB level)
    const exists = await ensureUserExists(following_id);
    if (!exists) {
        const err = new Error('Target user not found');
        err.status = 404;
        throw err;
    }

    // Insert; ignore if already following (composite PK enforces uniqueness)
    const { error } = await client().from(table).insert({ follower_id, following_id });
    if (error) {
        // Unique violation -> treat as idempotent success
        // Postgres unique_violation: 23505; Supabase exposes error.code
        if (error.code !== '23505') throw error;
    }

    // Recalculate counters for both users
    await Promise.all([
        recalcCountsForUser(follower_id),
        recalcCountsForUser(following_id),
    ]);
    return { ok: true };
}

async function unfollowUser(follower_id, following_id) {
    assertUUID(follower_id, 'follower_id');
    assertUUID(following_id, 'following_id');
    if (follower_id === following_id) return { ok: true }; // idempotent

    const { error } = await client()
        .from(table)
        .delete()
        .eq('follower_id', follower_id)
        .eq('following_id', following_id);
    if (error) throw error;

    // Recalculate counters for both users
    await Promise.all([
        recalcCountsForUser(follower_id),
        recalcCountsForUser(following_id),
    ]);
    return { ok: true };
}

async function listFollowers(user_id, { limit = 20, offset = 0 } = {}) {
    assertUUID(user_id, 'user_id');
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;

    // First fetch follower ids with pagination and total count
    const { data, error, count } = await client()
        .from(table)
        .select('follower_id, created_at', { count: 'exact' })
        .eq('following_id', user_id)
        .order('created_at', { ascending: false })
        .range(start, end);
    if (error) throw error;

    const ids = (data || []).map(r => r.follower_id);
    let users = [];
    if (ids.length) {
        const { data: usersData, error: usersErr } = await client()
            .from(usersTable)
            .select('user_id, name, avatar_url')
            .in('user_id', ids);
        if (usersErr) throw usersErr;
        // Preserve order by created_at desc using the ids array order
        const map = new Map(usersData.map(u => [u.user_id, u]));
        users = ids.map(id => map.get(id)).filter(Boolean);
    }
    return { items: users, total: count };
}

async function listFollowing(user_id, { limit = 20, offset = 0 } = {}) {
    assertUUID(user_id, 'user_id');
    const start = Math.max(0, Number(offset) || 0);
    const l = Math.max(1, Math.min(100, Number(limit) || 20));
    const end = start + l - 1;

    const { data, error, count } = await client()
        .from(table)
        .select('following_id, created_at', { count: 'exact' })
        .eq('follower_id', user_id)
        .order('created_at', { ascending: false })
        .range(start, end);
    if (error) throw error;

    const ids = (data || []).map(r => r.following_id);
    let users = [];
    if (ids.length) {
        const { data: usersData, error: usersErr } = await client()
            .from(usersTable)
            .select('user_id, name, avatar_url, user_type')
            .in('user_id', ids);
        if (usersErr) throw usersErr;
        const map = new Map(usersData.map(u => [u.user_id, u]));
        users = ids.map(id => map.get(id)).filter(Boolean);
    }
    return { items: users, total: count };
}

async function recalcCountsForUser(user_id) {
    assertUUID(user_id, 'user_id');
    // followers_count = rows where following_id = user_id
    const f1 = client()
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('following_id', user_id);
    // followings_count = rows where follower_id = user_id
    const f2 = client()
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', user_id);

    const [{ count: followersCount, error: e1 }, { count: followingsCount, error: e2 }] = await Promise.all([f1, f2]);
    if (e1) throw e1;
    if (e2) throw e2;

    const { error } = await client()
        .from(usersTable)
        .update({ followers_count: followersCount || 0, followings_count: followingsCount || 0, updated_at: new Date().toISOString() })
        .eq('user_id', user_id);
    if (error) throw error;
    return { followers_count: followersCount || 0, followings_count: followingsCount || 0 };
}

module.exports = {
    isFollowing,
    followUser,
    unfollowUser,
    listFollowers,
    listFollowing,
    recalcCountsForUser,
};
