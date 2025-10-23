module.exports = function authUser(req, res, next) {
    // TODO: Verify Supabase JWT and user role/claims.
    // Temporary pass-through to unblock development.
    return next();
}