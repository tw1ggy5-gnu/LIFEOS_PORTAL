/**
 * google.js — Google/Gemini Cloud Provider
 * 
 * Auth strategy (in priority order):
 *   1. GEMINI_API_KEY env var (simplest)
 *   2. OAuth token from ~/.gemini/oauth_creds.json (Antigravity's own auth)
 * 
 * If neither is available, returns a clear error — never fabricates.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const GEMINI_API_BASE = 'generativelanguage.googleapis.com';
const OAUTH_CREDS_PATH = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
const GOOGLE_ACCOUNTS_PATH = path.join(os.homedir(), '.gemini', 'google_accounts.json');

/**
 * Resolve the best available auth credential.
 * @returns {{type: string, value: string}|null}
 */
function resolveAuth() {
    // Priority 1: Explicit API key
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (apiKey) return { type: 'api_key', value: apiKey };

    // Priority 2: OAuth token from Antigravity's own creds
    try {
        if (fs.existsSync(OAUTH_CREDS_PATH)) {
            const raw = fs.readFileSync(OAUTH_CREDS_PATH, 'utf-8');
            const creds = JSON.parse(raw);
            if (creds.access_token) {
                // Check if token is expired
                if (creds.expiry_date && Date.now() > creds.expiry_date) {
                    return { type: 'oauth_expired', value: null, refreshToken: creds.refresh_token || null };
                }
                return { type: 'oauth', value: creds.access_token };
            }
        }
    } catch (e) {
        // Fall through
    }

    return null;
}

/**
 * Get the active Google account email.
 * @returns {string|null}
 */
function getActiveAccount() {
    try {
        if (fs.existsSync(GOOGLE_ACCOUNTS_PATH)) {
            const data = JSON.parse(fs.readFileSync(GOOGLE_ACCOUNTS_PATH, 'utf-8'));
            return data.active || null;
        }
    } catch { }
    return null;
}

/**
 * Make an authenticated HTTPS request to the Gemini API.
 */
function request(urlPath, auth, opts = {}) {
    return new Promise((resolve, reject) => {
        let fullPath = urlPath;
        if (auth.type === 'api_key') {
            const sep = fullPath.includes('?') ? '&' : '?';
            fullPath += `${sep}key=${auth.value}`;
        }

        const reqOpts = {
            hostname: GEMINI_API_BASE,
            port: 443,
            path: fullPath,
            method: opts.method || 'GET',
            timeout: opts.timeout || 10000,
            headers: { 'Content-Type': 'application/json' }
        };

        if (auth.type === 'oauth') {
            reqOpts.headers['Authorization'] = `Bearer ${auth.value}`;
        }

        const req = https.request(reqOpts, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(body)); }
                    catch { resolve(body); }
                } else {
                    reject(new Error(`Gemini API ${res.statusCode}: ${body.substring(0, 300)}`));
                }
            });
        });

        req.on('error', (e) => reject(new Error(`Gemini API unreachable: ${e.message}`)));
        req.on('timeout', () => { req.destroy(); reject(new Error('Gemini API request timed out')); });
        req.end();
    });
}

/**
 * Health check — can we authenticate and reach the API?
 * @returns {Promise<{alive: boolean, account?: string, authType?: string, error?: string}>}
 */
async function healthCheck() {
    const auth = resolveAuth();
    if (!auth || !auth.value) {
        return {
            alive: false,
            error: auth?.type === 'oauth_expired'
                ? 'OAuth token expired. Re-authenticate in Antigravity.'
                : 'No credentials found. Set GEMINI_API_KEY or authenticate via Antigravity.'
        };
    }

    try {
        // Lightweight call: list 1 model to verify auth works
        await request('/v1beta/models?pageSize=1', auth, { timeout: 5000 });
        return { alive: true, account: getActiveAccount(), authType: auth.type };
    } catch (e) {
        return { alive: false, error: e.message };
    }
}

/**
 * List all available Gemini models.
 * @returns {Promise<Array<{id, provider, displayName, inputTokenLimit, outputTokenLimit, supportedMethods}>>}
 */
async function getModels() {
    const auth = resolveAuth();
    if (!auth || !auth.value) throw new Error('No valid Google credentials available.');

    const data = await request('/v1beta/models', auth);
    if (!data.models || !Array.isArray(data.models)) return [];

    return data.models.map(m => ({
        id: m.name?.replace('models/', '') || m.name,
        provider: 'google',
        displayName: m.displayName || m.name,
        inputTokenLimit: m.inputTokenLimit || null,
        outputTokenLimit: m.outputTokenLimit || null,
        supportedMethods: m.supportedGenerationMethods || []
    }));
}

module.exports = { healthCheck, getModels, resolveAuth, getActiveAccount };
