'use strict';

jest.mock('fs');

const fs = require('fs');
const os = require('os');
const path = require('path');

// Require once — module and test share the same mocked fs instance
const store = require('../lib/usage-store');

beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
});

// ─── readLog ────────────────────────────────────────────────────────────────

describe('readLog', () => {
    it('returns [] when the log file does not exist', () => {
        expect(store.readLog()).toEqual([]);
    });

    it('returns [] when the file is empty', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('   ');
        expect(store.readLog()).toEqual([]);
    });

    it('returns [] and logs an error when JSON is corrupt', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('not json {{{{');
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        expect(store.readLog()).toEqual([]);
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Corrupt'));
        spy.mockRestore();
    });

    it('returns parsed events when file is valid JSON', () => {
        const events = [
            { provider: 'local', model: 'llama3', inputTokens: 10, outputTokens: 20, timestamp: '2024-01-01T00:00:00Z' }
        ];
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify(events));
        expect(store.readLog()).toEqual(events);
    });
});

// ─── logEvent ───────────────────────────────────────────────────────────────

describe('logEvent', () => {
    beforeEach(() => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('[]');
        fs.mkdirSync.mockImplementation(() => {});
        fs.writeFileSync.mockImplementation(() => {});
    });

    it.each(['provider', 'model', 'inputTokens', 'outputTokens'])(
        'throws when required field "%s" is missing',
        (field) => {
            const base = { provider: 'local', model: 'llama3', inputTokens: 5, outputTokens: 10 };
            delete base[field];
            expect(() => store.logEvent(base)).toThrow(`Missing required field: ${field}`);
        }
    );

    it('auto-assigns a timestamp when none is provided', () => {
        const event = { provider: 'local', model: 'llama3', inputTokens: 5, outputTokens: 10 };
        const result = store.logEvent(event);
        expect(result.timestamp).toBeDefined();
        expect(() => new Date(result.timestamp)).not.toThrow();
    });

    it('preserves an explicit timestamp', () => {
        const ts = '2024-06-01T12:00:00Z';
        const result = store.logEvent({ provider: 'google', model: 'gemini-pro', inputTokens: 1, outputTokens: 2, timestamp: ts });
        expect(result.timestamp).toBe(ts);
    });

    it('appends the new event to existing log entries', () => {
        const existing = [
            { provider: 'local', model: 'llama3', inputTokens: 1, outputTokens: 1, timestamp: 't1' }
        ];
        fs.readFileSync.mockReturnValue(JSON.stringify(existing));

        store.logEvent({ provider: 'google', model: 'gemini-pro', inputTokens: 5, outputTokens: 5 });

        const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
        expect(written).toHaveLength(2);
        expect(written[0]).toMatchObject(existing[0]);
        expect(written[1].provider).toBe('google');
    });

    it('creates the directory if it does not exist', () => {
        fs.existsSync.mockReturnValue(false);
        store.logEvent({ provider: 'local', model: 'llama3', inputTokens: 1, outputTokens: 1 });
        expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });
});

// ─── summarize ──────────────────────────────────────────────────────────────

describe('summarize', () => {
    const log = [
        { provider: 'local', model: 'llama3', inputTokens: 100, outputTokens: 50, timestamp: '2024-01-01T00:00:00Z' },
        { provider: 'local', model: 'llama3', inputTokens: 200, outputTokens: 100, timestamp: '2024-03-01T00:00:00Z' },
        { provider: 'google', model: 'gemini-pro', inputTokens: 400, outputTokens: 200, timestamp: '2024-06-01T00:00:00Z' }
    ];

    beforeEach(() => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify(log));
    });

    it('returns zeroed totals for an empty log', () => {
        fs.existsSync.mockReturnValue(false);
        const result = store.summarize();
        expect(result).toMatchObject({ totalEvents: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0 });
        expect(result.breakdown).toEqual([]);
    });

    it('aggregates token totals across all events', () => {
        const result = store.summarize();
        expect(result.totalInputTokens).toBe(700);
        expect(result.totalOutputTokens).toBe(350);
        expect(result.totalTokens).toBe(1050);
        expect(result.totalEvents).toBe(3);
    });

    it('filters by provider', () => {
        const result = store.summarize({ provider: 'local' });
        expect(result.totalEvents).toBe(2);
        expect(result.totalInputTokens).toBe(300);
    });

    it('filters by since date (inclusive boundary)', () => {
        const result = store.summarize({ since: '2024-03-01T00:00:00Z' });
        expect(result.totalEvents).toBe(2);
        expect(result.totalInputTokens).toBe(600);
    });

    it('combines provider and since filters', () => {
        const result = store.summarize({ provider: 'local', since: '2024-02-01T00:00:00Z' });
        expect(result.totalEvents).toBe(1);
        expect(result.totalInputTokens).toBe(200);
    });

    it('groups breakdown by provider/model key with correct call count', () => {
        const result = store.summarize({ provider: 'local' });
        expect(result.breakdown).toHaveLength(1);
        expect(result.breakdown[0]).toMatchObject({
            provider: 'local',
            model: 'llama3',
            inputTokens: 300,
            outputTokens: 150,
            calls: 2
        });
    });
});
