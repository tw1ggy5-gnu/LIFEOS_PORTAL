/**
 * handoff.js — Seamless context serialization for model switching.
 * 
 * Generates a portable context packet that ANY model (Local LLM, Claude, Gemini, GPT)
 * can ingest to continue work without re-explaining.
 * 
 * Packet format is plain text with structured headers — universally parseable.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HANDOFF_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'handoffs');

/**
 * Generate a handoff context packet.
 * @param {Object} opts
 * @param {string} opts.fromModel - Which model/provider generated this context
 * @param {string} opts.toModel - Which model/provider will receive it (or 'any')
 * @param {string} opts.projectName - Current project being worked on
 * @param {string} opts.currentTask - What was being done
 * @param {string} opts.progressSummary - What has been achieved so far
 * @param {string[]} opts.nextSteps - Remaining steps
 * @param {string[]} [opts.filesList] - Key files involved
 * @param {string} [opts.codeContext] - Relevant code snippet if applicable
 * @returns {string} Path to the saved handoff file
 */
function generateHandoff(opts) {
    const timestamp = new Date().toISOString();
    const id = `handoff-${Date.now()}`;

    const packet = `
===== LIFEOS HANDOFF PACKET =====
ID: ${id}
Timestamp: ${timestamp}
From: ${opts.fromModel}
To: ${opts.toModel || 'any'}
Project: ${opts.projectName}

--- CURRENT TASK ---
${opts.currentTask}

--- PROGRESS SO FAR ---
${opts.progressSummary}

--- NEXT STEPS ---
${(opts.nextSteps || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

${opts.filesList ? `--- KEY FILES ---\n${opts.filesList.map(f => `- ${f}`).join('\n')}` : ''}

${opts.codeContext ? `--- CODE CONTEXT ---\n\`\`\`\n${opts.codeContext}\n\`\`\`` : ''}

--- INSTRUCTIONS FOR RECEIVING MODEL ---
You are continuing work from another AI model. Do NOT re-explain what has been done.
Read the progress summary above and pick up from the NEXT STEPS section.
If anything is unclear, ask the user for clarification before proceeding.
Do NOT fabricate data or results. If you cannot verify something, say so.
================================
`.trim();

    // Save to disk
    if (!fs.existsSync(HANDOFF_DIR)) fs.mkdirSync(HANDOFF_DIR, { recursive: true });
    const filePath = path.join(HANDOFF_DIR, `${id}.md`);
    fs.writeFileSync(filePath, packet, 'utf-8');

    return { id, filePath, packet };
}

/**
 * Load a handoff packet by ID or latest.
 * @param {string} [handoffId] - Specific ID, or omit for latest
 * @returns {string|null} The packet text, or null if none found
 */
function loadHandoff(handoffId) {
    if (!fs.existsSync(HANDOFF_DIR)) return null;

    if (handoffId) {
        const filePath = path.join(HANDOFF_DIR, `${handoffId}.md`);
        if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf-8');
        return null;
    }

    // Get latest
    const files = fs.readdirSync(HANDOFF_DIR)
        .filter(f => f.startsWith('handoff-') && f.endsWith('.md'))
        .sort()
        .reverse();

    if (files.length === 0) return null;
    return fs.readFileSync(path.join(HANDOFF_DIR, files[0]), 'utf-8');
}

/**
 * List all available handoff packets.
 * @returns {Array<{id, file, timestamp}>}
 */
function listHandoffs() {
    if (!fs.existsSync(HANDOFF_DIR)) return [];
    return fs.readdirSync(HANDOFF_DIR)
        .filter(f => f.startsWith('handoff-') && f.endsWith('.md'))
        .map(f => ({
            id: f.replace('.md', ''),
            file: path.join(HANDOFF_DIR, f),
            timestamp: new Date(parseInt(f.replace('handoff-', '').replace('.md', ''))).toISOString()
        }))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

module.exports = { generateHandoff, loadHandoff, listHandoffs, HANDOFF_DIR };
