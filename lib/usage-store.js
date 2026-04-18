/**
 * usage-store.js — Persistent local usage tracker.
 * 
 * Stores usage events in a JSON append log at:
 *   ~/.gemini/antigravity/usage_log.json
 * 
 * This is the ONLY source of truth for usage data.
 * No fabrication. If nothing is logged, nothing is reported.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const STORE_PATH = path.join(os.homedir(), '.gemini', 'antigravity', 'usage_log.json');

/**
 * Read all usage events from the log file.
 * Returns [] if the file doesn't exist yet.
 */
function readLog() {
    try {
        if (!fs.existsSync(STORE_PATH)) return [];
        const raw = fs.readFileSync(STORE_PATH, 'utf-8').trim();
        if (!raw) return [];
        return JSON.parse(raw);
    } catch (e) {
        console.error(`[usage-store] Corrupt or unreadable log at ${STORE_PATH}: ${e.message}`);
        return [];
    }
}

/**
 * Append a single usage event to the log.
 * @param {Object} event - Must contain at minimum:
 *   { provider, model, inputTokens, outputTokens, timestamp }
 */
function logEvent(event) {
    const required = ['provider', 'model', 'inputTokens', 'outputTokens'];
    for (const key of required) {
        if (event[key] === undefined) {
            throw new Error(`[usage-store] Missing required field: ${key}`);
        }
    }

    const entry = {
        ...event,
        timestamp: event.timestamp || new Date().toISOString()
    };

    const log = readLog();
    log.push(entry);

    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(STORE_PATH, JSON.stringify(log, null, 2), 'utf-8');
    return entry;
}

/**
 * Summarize usage by provider & model.
 * @param {Object} opts
 * @param {string} [opts.provider] - Filter to a specific provider ('local'|'google')
 * @param {string} [opts.since] - ISO date string to filter events after
 * @returns {Object} Summary with totals and per-model breakdown
 */
function summarize(opts = {}) {
    let log = readLog();

    if (opts.provider) {
        log = log.filter(e => e.provider === opts.provider);
    }
    if (opts.since) {
        const sinceDate = new Date(opts.since);
        log = log.filter(e => new Date(e.timestamp) >= sinceDate);
    }

    const byModel = {};
    let totalInput = 0;
    let totalOutput = 0;

    for (const entry of log) {
        const key = `${entry.provider}/${entry.model}`;
        if (!byModel[key]) {
            byModel[key] = { provider: entry.provider, model: entry.model, inputTokens: 0, outputTokens: 0, calls: 0 };
        }
        byModel[key].inputTokens += entry.inputTokens;
        byModel[key].outputTokens += entry.outputTokens;
        byModel[key].calls += 1;
        totalInput += entry.inputTokens;
        totalOutput += entry.outputTokens;
    }

    return {
        totalEvents: log.length,
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        totalTokens: totalInput + totalOutput,
        breakdown: Object.values(byModel),
        storePath: STORE_PATH
    };
}

module.exports = { readLog, logEvent, summarize, STORE_PATH };
