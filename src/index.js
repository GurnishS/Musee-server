require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const createError = require('http-errors');

const { supabase } = require('./db/config');

const app = express();

// Security & utils
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Basic rate limit
app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 1000,
        standardHeaders: true,
        legacyHeaders: false,
    })
);
// Healthcheck using Supabase JS client
async function supabaseHealth() {
    try {
        // Try a lightweight query on any small table (e.g., 'tracks')
        const { data, error } = await supabase.from('tracks').select('track_id').limit(1);
        if (error) {
            console.error('Supabase health check failed:', error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error('Supabase health check error:', err.message);
        return false;
    }
}

// Express route
app.get(['/health', '/healthz'], async (req, res) => {
    const dbOk = await supabaseHealth();
    res.status(dbOk ? 200 : 500).json({
        status: dbOk ? 'ok' : 'error',
        env: process.env.NODE_ENV || 'development',
        db: dbOk ? 'ok' : 'error',
    });
});


// API routers (wire up when implemented)
try {
    const adminRoutes = require('./routes/adminRoutes');
    app.use('/api/admin', adminRoutes);
} catch (e) {
    console.warn('Admin routes not mounted:', e?.message || e);
}

try {
    const userRoutes = require('./routes/userRoutes');
    if (typeof userRoutes === 'function' || userRoutes?.stack) {
        app.use('/api/user', userRoutes);
    } else {
        console.warn('User routes not mounted: export is not a router');
    }
} catch (e) {
    console.warn('User routes not mounted:', e?.message || e);
}

// 404 handler
app.use((req, res, next) => {
    next(createError(404, 'Not Found'));
});

// Error handler
app.use((err, req, res, next) => {
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    if (process.env.NODE_ENV !== 'production') {
        console.error(err);
    }
    res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Musee API listening on port ${PORT}`);
});

module.exports = app;

