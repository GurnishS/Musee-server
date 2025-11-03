const { supabaseAdmin } = require("../db/config");

function generateRandomPassword() {
    // Generate a random 12-character password
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+[]{}|;:,.<>?';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

async function createAuthUser(name, email, password) {
    // create auth user (normal user) and mark email as confirmed
    const authRes = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password ? password : generateRandomPassword(),
        user_metadata: { name: name },
        email_confirm: true
    });
    if (authRes.error) throw authRes.error;
    const createdUser = authRes.data?.user ?? authRes.user ?? authRes.data;
    if (!createdUser || !createdUser.id) throw new Error('failed to create auth user');
    return createdUser;
}

async function deleteAuthUser(user_id) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (error) throw error;
    return true;
}


module.exports = {
    createAuthUser,
    deleteAuthUser
}