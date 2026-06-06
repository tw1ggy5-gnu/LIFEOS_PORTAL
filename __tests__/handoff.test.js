'use strict';

jest.mock('fs');

const fs = require('fs');
const path = require('path');
const os = require('os');

const HANDOFF_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'handoffs');

// Require once — module and test share the same mocked fs instance
const handoff = require('../lib/handoff');

beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
});

// ─── generateHandoff ────────────────────────────────────────────────────────

describe('generateHandoff', () => {
    const baseOpts = {
        fromModel: 'gemini-pro',
        toModel: 'llama3',
        projectName: 'LIFEOS',
        currentTask: 'Refactor the RPG engine',
        progressSummary: 'Extracted addXP into a pure function',
        nextSteps: ['Write tests', 'Update dashboard']
    };

    it('returns an object with id, filePath, and packet', () => {
        const result = handoff.generateHandoff(baseOpts);
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('filePath');
        expect(result).toHaveProperty('packet');
    });

    it('packet contains all header fields', () => {
        const { packet } = handoff.generateHandoff(baseOpts);
        expect(packet).toContain('From: gemini-pro');
        expect(packet).toContain('To: llama3');
        expect(packet).toContain('Project: LIFEOS');
        expect(packet).toContain('Refactor the RPG engine');
        expect(packet).toContain('Extracted addXP into a pure function');
    });

    it('numbers nextSteps starting from 1', () => {
        const { packet } = handoff.generateHandoff(baseOpts);
        expect(packet).toContain('1. Write tests');
        expect(packet).toContain('2. Update dashboard');
    });

    it('defaults toModel to "any" when omitted', () => {
        const { packet } = handoff.generateHandoff({ ...baseOpts, toModel: undefined });
        expect(packet).toContain('To: any');
    });

    it('omits KEY FILES section when filesList is not provided', () => {
        const { packet } = handoff.generateHandoff(baseOpts);
        expect(packet).not.toContain('KEY FILES');
    });

    it('includes KEY FILES section when filesList is provided', () => {
        const { packet } = handoff.generateHandoff({
            ...baseOpts,
            filesList: ['lib/handoff.js', 'assets/rpg_engine.js']
        });
        expect(packet).toContain('KEY FILES');
        expect(packet).toContain('- lib/handoff.js');
        expect(packet).toContain('- assets/rpg_engine.js');
    });

    it('omits CODE CONTEXT section when codeContext is not provided', () => {
        const { packet } = handoff.generateHandoff(baseOpts);
        expect(packet).not.toContain('CODE CONTEXT');
    });

    it('includes CODE CONTEXT section when codeContext is provided', () => {
        const { packet } = handoff.generateHandoff({ ...baseOpts, codeContext: 'function addXP() {}' });
        expect(packet).toContain('CODE CONTEXT');
        expect(packet).toContain('function addXP() {}');
    });

    it('saves the packet to disk under HANDOFF_DIR', () => {
        handoff.generateHandoff(baseOpts);
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining(HANDOFF_DIR),
            expect.any(String),
            'utf-8'
        );
    });

    it('creates HANDOFF_DIR when it does not exist', () => {
        handoff.generateHandoff(baseOpts);
        expect(fs.mkdirSync).toHaveBeenCalledWith(HANDOFF_DIR, { recursive: true });
    });
});

// ─── loadHandoff ────────────────────────────────────────────────────────────

describe('loadHandoff', () => {
    it('returns null when HANDOFF_DIR does not exist', () => {
        expect(handoff.loadHandoff()).toBeNull();
    });

    it('returns null when a specific ID file does not exist', () => {
        // dir exists, but the specific file does not
        fs.existsSync.mockImplementation((p) => p === HANDOFF_DIR);
        expect(handoff.loadHandoff('handoff-9999999')).toBeNull();
    });

    it('returns file content when a specific ID is found', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('PACKET CONTENT');
        expect(handoff.loadHandoff('handoff-123')).toBe('PACKET CONTENT');
    });

    it('returns the most recent packet when no ID is given', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue(['handoff-1000.md', 'handoff-3000.md', 'handoff-2000.md']);
        fs.readFileSync.mockReturnValue('latest packet');

        handoff.loadHandoff();

        expect(fs.readFileSync).toHaveBeenCalledWith(
            path.join(HANDOFF_DIR, 'handoff-3000.md'),
            'utf-8'
        );
    });

    it('returns null when directory exists but is empty', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue([]);
        expect(handoff.loadHandoff()).toBeNull();
    });
});

// ─── listHandoffs ───────────────────────────────────────────────────────────

describe('listHandoffs', () => {
    it('returns [] when HANDOFF_DIR does not exist', () => {
        expect(handoff.listHandoffs()).toEqual([]);
    });

    it('returns [] when directory has no matching handoff files', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue(['README.md', 'other.txt']);
        expect(handoff.listHandoffs()).toEqual([]);
    });

    it('returns entries sorted newest-first', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue(['handoff-1000.md', 'handoff-3000.md', 'handoff-2000.md']);

        const result = handoff.listHandoffs();
        expect(result[0].id).toBe('handoff-3000');
        expect(result[1].id).toBe('handoff-2000');
        expect(result[2].id).toBe('handoff-1000');
    });

    it('each entry has id, file, and timestamp fields', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue(['handoff-1700000000000.md']);

        const [entry] = handoff.listHandoffs();
        expect(entry).toHaveProperty('id', 'handoff-1700000000000');
        expect(entry).toHaveProperty('file');
        expect(entry).toHaveProperty('timestamp');
        expect(isNaN(new Date(entry.timestamp))).toBe(false);
    });

    it('ignores files that do not match handoff-*.md pattern', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue(['handoff-1000.md', 'notes.md', 'handoff-bad.txt']);
        expect(handoff.listHandoffs()).toHaveLength(1);
    });
});
