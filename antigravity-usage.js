#!/usr/bin/env node

/**
 * antigravity-usage CLI v2.0
 * 
 * Real implementation — no mocks, no fabricated data.
 * Queries actual Ollama and Gemini API endpoints.
 * Tracks usage via local JSON log (usage-store).
 * Supports seamless handoff between models.
 * 
 * Usage:
 *   node antigravity-usage.js                     Auto-detect method, show usage
 *   node antigravity-usage.js --all               Usage for all accounts
 *   node antigravity-usage.js --method local      Force local (Ollama)
 *   node antigravity-usage.js --method google     Force cloud (Gemini)
 *   node antigravity-usage.js --all-models        List all available models
 *   node antigravity-usage.js --json              JSON output
 *   node antigravity-usage.js --status            Full system health check
 *   node antigravity-usage.js --handoff           Generate a handoff packet for model switch
 *   node antigravity-usage.js --version           Print version
 */

const local = require('./lib/providers/local');
const google = require('./lib/providers/google');
const usageStore = require('./lib/usage-store');
const handoff = require('./lib/handoff');

// ========================================
// 1. Argument Parsing
// ========================================
const args = process.argv.slice(2);
const flags = {
    all: false,
    allModels: false,
    method: null,  // null = auto-detect
    json: false,
    version: false,
    status: false,
    handoffGen: false
};

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
        case '--all': flags.all = true; break;
        case '--all-models': flags.allModels = true; break;
        case '--json': flags.json = true; break;
        case '--version': flags.version = true; break;
        case '--status': flags.status = true; break;
        case '--handoff': flags.handoffGen = true; break;
        case '--method':
            flags.method = args[++i];
            if (!['local', 'google'].includes(flags.method)) {
                emit_error('--method must be "local" or "google"');
                process.exit(1);
            }
            break;
        default:
            emit_error(`Unknown flag: ${arg}`);
            process.exit(1);
    }
}

// ========================================
// 2. Version
// ========================================
if (flags.version) {
    console.log('antigravity-usage v2.0.0');
    process.exit(0);
}

// ========================================
// 3. Output Helpers (JSON or Human)
// ========================================
function emit(data) {
    if (flags.json) {
        console.log(JSON.stringify(data, null, 2));
    } else {
        // Data is already printed by the caller in human mode
    }
}

function emit_error(msg) {
    if (flags.json) {
        console.error(JSON.stringify({ error: msg }));
    } else {
        console.error(`\x1b[31m✖ Error:\x1b[0m ${msg}`);
    }
}

// ========================================
// 4. Method Selection (Auto-detect: Local → Cloud)
// ========================================
async function detectMethod() {
    if (flags.method) return flags.method;

    const localHealth = await local.healthCheck();
    if (localHealth.alive) return 'local';

    const googleHealth = await google.healthCheck();
    if (googleHealth.alive) return 'google';

    return null; // Neither is available
}

// ========================================
// 5. Command: --status (Full System Health)
// ========================================
async function cmdStatus() {
    const [localHealth, googleHealth] = await Promise.all([
        local.healthCheck(),
        google.healthCheck()
    ]);

    const usageSummary = usageStore.summarize();
    const handoffs = handoff.listHandoffs();

    const report = {
        local: {
            status: localHealth.alive ? 'ONLINE' : 'OFFLINE',
            endpoint: local.OLLAMA_BASE,
            ...localHealth
        },
        google: {
            status: googleHealth.alive ? 'ONLINE' : 'OFFLINE',
            account: googleHealth.account || null,
            authType: googleHealth.authType || null,
            ...googleHealth
        },
        usage: {
            totalEventsLogged: usageSummary.totalEvents,
            totalTokens: usageSummary.totalTokens,
            storePath: usageSummary.storePath
        },
        handoffs: {
            count: handoffs.length,
            latest: handoffs[0]?.timestamp || null,
            dir: handoff.HANDOFF_DIR
        }
    };

    if (flags.json) {
        emit(report);
    } else {
        console.log('\n\x1b[36m═══════════════════════════════════════\x1b[0m');
        console.log('\x1b[1m  ANTIGRAVITY SYSTEM STATUS\x1b[0m');
        console.log('\x1b[36m═══════════════════════════════════════\x1b[0m\n');

        // Local
        const localIcon = localHealth.alive ? '\x1b[32m●\x1b[0m' : '\x1b[31m●\x1b[0m';
        console.log(`  ${localIcon} Local LLM (Ollama)    ${localHealth.alive ? '\x1b[32mONLINE\x1b[0m' : '\x1b[31mOFFLINE\x1b[0m'}`);
        console.log(`    Endpoint: ${local.OLLAMA_BASE}`);
        if (localHealth.version) console.log(`    Version:  ${localHealth.version}`);
        if (localHealth.error) console.log(`    Reason:   \x1b[33m${localHealth.error}\x1b[0m`);

        console.log('');

        // Google
        const googleIcon = googleHealth.alive ? '\x1b[32m●\x1b[0m' : '\x1b[31m●\x1b[0m';
        console.log(`  ${googleIcon} Google Cloud (Gemini) ${googleHealth.alive ? '\x1b[32mONLINE\x1b[0m' : '\x1b[31mOFFLINE\x1b[0m'}`);
        if (googleHealth.account) console.log(`    Account:  ${googleHealth.account}`);
        if (googleHealth.authType) console.log(`    Auth:     ${googleHealth.authType}`);
        if (googleHealth.error) console.log(`    Reason:   \x1b[33m${googleHealth.error}\x1b[0m`);

        console.log('');

        // Usage
        console.log(`  📊 Usage Log`);
        console.log(`    Events:   ${usageSummary.totalEvents}`);
        console.log(`    Tokens:   ${usageSummary.totalTokens.toLocaleString()}`);
        console.log(`    Store:    ${usageSummary.storePath}`);

        console.log('');

        // Handoffs
        console.log(`  🔄 Handoff Packets: ${handoffs.length}`);
        if (handoffs[0]) console.log(`    Latest:   ${handoffs[0].timestamp}`);

        console.log('\n\x1b[36m═══════════════════════════════════════\x1b[0m\n');
    }
}

// ========================================
// 6. Command: --all-models
// ========================================
async function cmdModels() {
    const method = await detectMethod();
    let models = [];
    let errors = [];

    // If --all or auto-detect, try both
    const tryLocal = !flags.method || flags.method === 'local';
    const tryGoogle = !flags.method || flags.method === 'google';

    if (tryLocal) {
        try {
            const localModels = await local.getModels();
            models.push(...localModels);
        } catch (e) {
            errors.push({ provider: 'local', error: e.message });
        }
    }

    if (tryGoogle) {
        try {
            const googleModels = await google.getModels();
            models.push(...googleModels);
        } catch (e) {
            errors.push({ provider: 'google', error: e.message });
        }
    }

    if (flags.json) {
        emit({ models, errors: errors.length > 0 ? errors : undefined });
    } else {
        if (models.length === 0) {
            console.log('\n  No models available from any provider.');
            errors.forEach(e => console.log(`  \x1b[33m⚠ ${e.provider}: ${e.error}\x1b[0m`));
            return;
        }

        console.log('\n\x1b[36m═══ Available Models ═══\x1b[0m\n');

        // Group by provider
        const byProvider = {};
        models.forEach(m => {
            if (!byProvider[m.provider]) byProvider[m.provider] = [];
            byProvider[m.provider].push(m);
        });

        for (const [provider, pModels] of Object.entries(byProvider)) {
            const icon = provider === 'local' ? '💻' : '☁️';
            console.log(`  ${icon} ${provider.toUpperCase()} (${pModels.length} models)`);
            console.log('  ' + '─'.repeat(50));
            pModels.forEach(m => {
                const extra = m.parameterSize ? ` [${m.parameterSize}]` : '';
                const tokens = m.inputTokenLimit ? ` (${m.inputTokenLimit} in / ${m.outputTokenLimit} out)` : '';
                console.log(`    ${m.id}${extra}${tokens}`);
            });
            console.log('');
        }

        if (errors.length > 0) {
            errors.forEach(e => console.log(`  \x1b[33m⚠ ${e.provider}: ${e.error}\x1b[0m`));
        }
    }
}

// ========================================
// 7. Command: Default (Usage Summary)
// ========================================
async function cmdUsage() {
    const summary = usageStore.summarize({
        provider: flags.method || undefined
    });

    if (flags.json) {
        emit(summary);
    } else {
        console.log('\n\x1b[36m═══ Usage Summary ═══\x1b[0m\n');

        if (summary.totalEvents === 0) {
            console.log('  No usage events recorded yet.');
            console.log(`  Usage log: ${summary.storePath}`);
            console.log('');
            console.log('  \x1b[33mℹ Usage is tracked when API calls are made through the LIFEOS system.\x1b[0m');
            console.log('  \x1b[33m  Run with --status to check system connectivity.\x1b[0m');
        } else {
            console.log(`  Total Calls:         ${summary.totalEvents}`);
            console.log(`  Total Input Tokens:  ${summary.totalInputTokens.toLocaleString()}`);
            console.log(`  Total Output Tokens: ${summary.totalOutputTokens.toLocaleString()}`);
            console.log(`  Total Tokens:        ${summary.totalTokens.toLocaleString()}`);
            console.log('');

            if (summary.breakdown.length > 0) {
                console.log('  \x1b[36mBreakdown by Model:\x1b[0m');
                console.log('  ' + '─'.repeat(60));
                summary.breakdown.forEach(b => {
                    const icon = b.provider === 'local' ? '💻' : '☁️';
                    console.log(`    ${icon} ${b.model.padEnd(25)} ${b.calls} calls | ${b.inputTokens.toLocaleString()} in | ${b.outputTokens.toLocaleString()} out`);
                });
            }
        }
        console.log('');
    }
}

// ========================================
// 8. Command: --handoff
// ========================================
async function cmdHandoff() {
    const result = handoff.generateHandoff({
        fromModel: 'antigravity/gemini',
        toModel: 'any',
        projectName: 'LIFEOS_PORTAL',
        currentTask: 'Building the antigravity-usage CLI and RPG dashboard system',
        progressSummary: [
            'Dashboard v4.9 built with Vampire System RPG integration',
            'Quest engine with daily/weekly/epic tasks implemented',
            'CLI tool with real Ollama and Gemini API providers created',
            'Usage store (JSON log) implemented for honest tracking',
            'Handoff protocol created for model-to-model context transfer'
        ].join('\n'),
        nextSteps: [
            'Connect dashboard to live usage data from usage_log.json',
            'Set up Ollama on ASUS TUF and verify local model listing',
            'Build the Raspberry Pi automation cron scripts',
            'Integrate Samsung Health / Google Fit data into the stat engine',
            'Build skill trees and class progression system'
        ],
        filesList: [
            'LIFEOS_PORTAL/dashboard.html',
            'LIFEOS_PORTAL/antigravity-usage.js',
            'LIFEOS_PORTAL/lib/providers/local.js',
            'LIFEOS_PORTAL/lib/providers/google.js',
            'LIFEOS_PORTAL/lib/usage-store.js',
            'LIFEOS_PORTAL/lib/handoff.js'
        ]
    });

    if (flags.json) {
        emit({ id: result.id, filePath: result.filePath });
    } else {
        console.log(`\n\x1b[32m✔ Handoff packet generated:\x1b[0m ${result.filePath}`);
        console.log(`  ID: ${result.id}`);
        console.log('\n  Paste the contents of this file into any other model to continue work.\n');
    }
}

// ========================================
// 9. Main Dispatch
// ========================================
async function main() {
    try {
        if (flags.status) return await cmdStatus();
        if (flags.allModels) return await cmdModels();
        if (flags.handoffGen) return await cmdHandoff();
        return await cmdUsage();
    } catch (e) {
        emit_error(e.message);
        process.exit(1);
    }
}

main();
