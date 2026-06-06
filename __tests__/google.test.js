'use strict';

jest.mock('fs');
jest.mock('https');

const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const OAUTH_CREDS_PATH = path.join(os.homedir(), '.gemini', 'oauth_creds.json');

// Require once — module and test share the same mocked instances
const google = require('../lib/providers/google');

function mockHttpsResponse(statusCode, body) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const mockRes = {
        statusCode,
        on: jest.fn((event, cb) => {
            if (event === 'data') cb(bodyStr);
            if (event === 'end') cb();
            return mockRes;
        })
    };
    const mockReq = { on: jest.fn().mockReturnThis(), end: jest.fn(), write: jest.fn(), destroy: jest.fn() };
    https.request.mockImplementation((opts, cb) => { cb(mockRes); return mockReq; });
    return { mockRes, mockReq };
}

function mockHttpsError(message) {
    const mockReq = {
        on: jest.fn((event, cb) => {
            if (event === 'error') cb(new Error(message));
            return mockReq;
        }),
        end: jest.fn(), destroy: jest.fn(), write: jest.fn()
    };
    https.request.mockReturnValue(mockReq);
    return mockReq;
}

beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    fs.existsSync.mockReturnValue(false);
});

// ─── resolveAuth ────────────────────────────────────────────────────────────

describe('resolveAuth', () => {
    it('returns api_key when GEMINI_API_KEY is set', () => {
        process.env.GEMINI_API_KEY = 'test-key-123';
        expect(google.resolveAuth()).toEqual({ type: 'api_key', value: 'test-key-123' });
    });

    it('returns api_key when GOOGLE_API_KEY is set (fallback env var)', () => {
        process.env.GOOGLE_API_KEY = 'google-key-456';
        expect(google.resolveAuth()).toEqual({ type: 'api_key', value: 'google-key-456' });
    });

    it('prefers GEMINI_API_KEY over GOOGLE_API_KEY', () => {
        process.env.GEMINI_API_KEY = 'gemini-key';
        process.env.GOOGLE_API_KEY = 'google-key';
        expect(google.resolveAuth().value).toBe('gemini-key');
    });

    it('returns oauth type when valid oauth_creds.json exists', () => {
        fs.existsSync.mockImplementation((p) => p === OAUTH_CREDS_PATH);
        fs.readFileSync.mockReturnValue(JSON.stringify({
            access_token: 'oauth-token',
            expiry_date: Date.now() + 3600000
        }));
        expect(google.resolveAuth()).toEqual({ type: 'oauth', value: 'oauth-token' });
    });

    it('returns oauth_expired when token expiry_date is in the past', () => {
        fs.existsSync.mockImplementation((p) => p === OAUTH_CREDS_PATH);
        fs.readFileSync.mockReturnValue(JSON.stringify({
            access_token: 'expired-token',
            expiry_date: Date.now() - 1000,
            refresh_token: 'refresh-abc'
        }));
        const auth = google.resolveAuth();
        expect(auth.type).toBe('oauth_expired');
        expect(auth.value).toBeNull();
        expect(auth.refreshToken).toBe('refresh-abc');
    });

    it('returns null when no credentials exist', () => {
        expect(google.resolveAuth()).toBeNull();
    });

    it('returns null without throwing when oauth_creds.json is corrupt', () => {
        fs.existsSync.mockImplementation((p) => p === OAUTH_CREDS_PATH);
        fs.readFileSync.mockReturnValue('not json {{{{');
        expect(() => google.resolveAuth()).not.toThrow();
        expect(google.resolveAuth()).toBeNull();
    });
});

// ─── request (auth wiring) ───────────────────────────────────────────────────

describe('request auth wiring', () => {
    it('appends ?key= to URL path for api_key auth', async () => {
        process.env.GEMINI_API_KEY = 'my-api-key';
        let capturedPath;
        https.request.mockImplementation((opts, cb) => {
            capturedPath = opts.path;
            const res = { statusCode: 200, on: jest.fn((e, fn) => { if (e === 'data') fn('{}'); if (e === 'end') fn(); return res; }) };
            cb(res);
            return { on: jest.fn().mockReturnThis(), end: jest.fn() };
        });
        await google.getModels();
        expect(capturedPath).toContain('key=my-api-key');
    });

    it('sets Authorization Bearer header for oauth auth', async () => {
        fs.existsSync.mockImplementation((p) => p === OAUTH_CREDS_PATH);
        fs.readFileSync.mockReturnValue(JSON.stringify({
            access_token: 'bearer-token',
            expiry_date: Date.now() + 3600000
        }));
        let capturedHeaders;
        https.request.mockImplementation((opts, cb) => {
            capturedHeaders = opts.headers;
            const res = { statusCode: 200, on: jest.fn((e, fn) => { if (e === 'data') fn('{"models":[]}'); if (e === 'end') fn(); return res; }) };
            cb(res);
            return { on: jest.fn().mockReturnThis(), end: jest.fn() };
        });
        await google.getModels();
        expect(capturedHeaders['Authorization']).toBe('Bearer bearer-token');
    });

    it('rejects with "Gemini API unreachable" on network error', async () => {
        process.env.GEMINI_API_KEY = 'key';
        mockHttpsError('ECONNREFUSED');
        await expect(google.getModels()).rejects.toThrow('Gemini API unreachable');
    });
});

// ─── healthCheck ────────────────────────────────────────────────────────────

describe('healthCheck', () => {
    it('returns alive:false with no-credentials message when no auth exists', async () => {
        const result = await google.healthCheck();
        expect(result.alive).toBe(false);
        expect(result.error).toMatch(/No credentials/);
    });

    it('returns alive:false with expired message when token is expired', async () => {
        fs.existsSync.mockImplementation((p) => p === OAUTH_CREDS_PATH);
        fs.readFileSync.mockReturnValue(JSON.stringify({
            access_token: 'tok',
            expiry_date: Date.now() - 1000
        }));
        const result = await google.healthCheck();
        expect(result.alive).toBe(false);
        expect(result.error).toMatch(/expired/i);
    });

    it('returns alive:true with authType on success', async () => {
        process.env.GEMINI_API_KEY = 'valid-key';
        mockHttpsResponse(200, { models: [] });
        const result = await google.healthCheck();
        expect(result.alive).toBe(true);
        expect(result.authType).toBe('api_key');
    });

    it('returns alive:false with error message when API call fails', async () => {
        process.env.GEMINI_API_KEY = 'valid-key';
        mockHttpsError('connection refused');
        const result = await google.healthCheck();
        expect(result.alive).toBe(false);
        expect(result.error).toBeDefined();
    });
});

// ─── getModels ───────────────────────────────────────────────────────────────

describe('getModels', () => {
    beforeEach(() => { process.env.GEMINI_API_KEY = 'key'; });

    it('throws when no credentials are available', async () => {
        delete process.env.GEMINI_API_KEY;
        await expect(google.getModels()).rejects.toThrow('No valid Google credentials');
    });

    it('returns [] when API response has no models array', async () => {
        mockHttpsResponse(200, {});
        expect(await google.getModels()).toEqual([]);
    });

    it('maps API model shape to internal shape', async () => {
        mockHttpsResponse(200, { models: [{
            name: 'models/gemini-pro',
            displayName: 'Gemini Pro',
            inputTokenLimit: 30720,
            outputTokenLimit: 2048,
            supportedGenerationMethods: ['generateContent']
        }]});
        const [model] = await google.getModels();
        expect(model).toMatchObject({
            id: 'gemini-pro',
            provider: 'google',
            displayName: 'Gemini Pro',
            inputTokenLimit: 30720,
            outputTokenLimit: 2048,
            supportedMethods: ['generateContent']
        });
    });

    it('strips "models/" prefix from model id', async () => {
        mockHttpsResponse(200, { models: [{ name: 'models/gemini-1.5-pro' }] });
        const [model] = await google.getModels();
        expect(model.id).toBe('gemini-1.5-pro');
    });
});
