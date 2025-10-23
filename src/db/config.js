const { createClient } = require('@supabase/supabase-js');
const { BlobServiceClient } = require('@azure/storage-blob');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
    throw new Error('Missing SUPABASE_URL in environment');
}
if (!SUPABASE_ANON_KEY) {
    console.warn('Warning: SUPABASE_ANON_KEY is not set. Public operations may fail.');
}

// Client for user-facing operations
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || '');

// Optional elevated client for backend jobs
const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

// Azure Blob
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
let blobServiceClient;
if (connectionString) {
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
} else {
    const account = process.env.AZURE_STORAGE_ACCOUNT;
    const key = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    if (account && key) {
        const connStr = `DefaultEndpointsProtocol=https;AccountName=${account};AccountKey=${key};EndpointSuffix=core.windows.net`;
        blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
    } else {
        console.warn('Azure Blob Storage not configured. Set AZURE_STORAGE_CONNECTION_STRING or account/key.');
    }
}

const containerName = process.env.AZURE_STORAGE_CONTAINER || 'media';

module.exports = {
    supabase,
    supabaseAdmin,
    blobServiceClient,
    containerName,
};

