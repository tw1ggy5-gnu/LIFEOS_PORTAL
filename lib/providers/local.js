/**
 * local.js — Local LLM Provider (Ollama)
 * 
 * Connects to Ollama at http://127.0.0.1:11434
 * If Ollama is not running, every method returns a clear error — never fake data.
 */

const http = require('http');

const OLLAMA_BASE = 'http://127.0.0.1:11434';
const HEALTH_TIMEOUT_MS = 2000;

function request(urlPath, opts = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, OLLAMA_BASE);
        const reqOpts = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: opts.method || 'GET',
            timeout: opts.timeout || 5000,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(reqOpts, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(body)); }
                    catch { resolve(body); }
                } else {
                    reject(new Error(`Ollama ${res.statusCode}: ${body}`));
                }
            });
        });

        req.on('error', (e) => reject(new Error(`Ollama unreachable: ${e.message}`)));
        req.on('timeout', () => { req.destroy(); reject(new Error('Ollama connection timed out')); });

        if (opts.body) req.write(JSON.stringify(opts.body));
        req.end();
    });
}

/**
 * Check if Ollama is running and responsive.
 * @returns {Promise<{alive: boolean, version?: string, error?: string}>}
 */
async function healthCheck() {
    try {
        const resp = await request('/', { timeout: HEALTH_TIMEOUT_MS });
        return { alive: true, version: typeof resp === 'string' ? resp.trim() : 'unknown' };
    } catch (e) {
        return { alive: false, error: e.message };
    }
}

/**
 * List all models currently available in Ollama.
 * @returns {Promise<Array<{id, provider, size, family, quantization, modified}>>}
 */
async function getModels() {
    const data = await request('/api/tags');
    if (!data.models || !Array.isArray(data.models)) return [];

    return data.models.map(m => ({
        id: m.name,
        provider: 'local',
        size: m.size,
        family: m.details?.family || 'unknown',
        quantization: m.details?.quantization_level || 'unknown',
        parameterSize: m.details?.parameter_size || 'unknown',
        modified: m.modified_at
    }));
}

/**
 * Get the currently running model (if any).
 * @returns {Promise<Array>}
 */
async function getRunningModels() {
    try {
        const data = await request('/api/ps');
        return data.models || [];
    } catch {
        return [];
    }
}

module.exports = { healthCheck, getModels, getRunningModels, OLLAMA_BASE };
