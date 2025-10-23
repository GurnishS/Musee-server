module.exports = function authAdmin(req, res, next) {
    // TODO: Verify Supabase JWT and admin role/claims.
    // Temporary pass-through to unblock development.
    return next();
};
