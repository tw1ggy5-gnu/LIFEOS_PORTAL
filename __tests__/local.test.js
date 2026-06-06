'use strict';

jest.mock('http');

const http = require('http');

// Require once — module and test share the same mocked http instance
const local = require('../lib/providers/local');

function mockHttpResponse(statusCode, body) {
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
    http.request.mockImplementation((opts, cb) => { cb(mockRes); return mockReq; });
    return mockReq;
}

function mockHttpError(message) {
    const mockReq = {
        on: jest.fn((event, cb) => {
            if (event === 'error') cb(new Error(message));
            return mockReq;
        }),
        end: jest.fn(), write: jest.fn(), destroy: jest.fn()
    };
    http.request.mockReturnValue(mockReq);
    return mockReq;
}

beforeEach(() => {
    jest.clearAllMocks();
});

// ─── healthCheck ─────────────────────────────────────────────────────────────

describe('healthCheck', () => {
    it('returns alive:true with version when Ollama responds with a plain string', async () => {
        mockHttpResponse(200, 'Ollama is running');
        const result = await local.healthCheck();
        expect(result.alive).toBe(true);
        expect(result.version).toBe('Ollama is running');
    });

    it('returns alive:true with "unknown" version when response is JSON', async () => {
        mockHttpResponse(200, { status: 'ok' });
        const result = await local.healthCheck();
        expect(result.alive).toBe(true);
        expect(result.version).toBe('unknown');
    });

    it('returns alive:false with error message on connection refused', async () => {
        mockHttpError('ECONNREFUSED');
        const result = await local.healthCheck();
        expect(result.alive).toBe(false);
        expect(result.error).toContain('ECONNREFUSED');
    });

    it('returns alive:false on non-2xx status', async () => {
        mockHttpResponse(500, 'Internal Server Error');
        const result = await local.healthCheck();
        expect(result.alive).toBe(false);
    });
});

// ─── getModels ────────────────────────────────────────────────────────────────

describe('getModels', () => {
    it('returns [] when API response has no models field', async () => {
        mockHttpResponse(200, {});
        expect(await local.getModels()).toEqual([]);
    });

    it('maps Ollama model shape to internal shape', async () => {
        mockHttpResponse(200, { models: [{
            name: 'llama3:8b',
            size: 4661211768,
            modified_at: '2024-05-01T00:00:00Z',
            details: { family: 'llama', quantization_level: 'Q4_0', parameter_size: '8B' }
        }]});
        const [model] = await local.getModels();
        expect(model).toMatchObject({
            id: 'llama3:8b',
            provider: 'local',
            size: 4661211768,
            family: 'llama',
            quantization: 'Q4_0',
            parameterSize: '8B'
        });
    });

    it('falls back to "unknown" for missing details fields', async () => {
        mockHttpResponse(200, { models: [{ name: 'mistral' }] });
        const [model] = await local.getModels();
        expect(model.family).toBe('unknown');
        expect(model.quantization).toBe('unknown');
        expect(model.parameterSize).toBe('unknown');
    });

    it('throws on non-2xx status', async () => {
        mockHttpResponse(503, 'Service Unavailable');
        await expect(local.getModels()).rejects.toThrow('Ollama 503');
    });
});

// ─── getRunningModels ────────────────────────────────────────────────────────

describe('getRunningModels', () => {
    it('returns the models array from /api/ps', async () => {
        const running = [{ name: 'llama3:8b', size: 100 }];
        mockHttpResponse(200, { models: running });
        expect(await local.getRunningModels()).toEqual(running);
    });

    it('returns [] when /api/ps response has no models field', async () => {
        mockHttpResponse(200, {});
        expect(await local.getRunningModels()).toEqual([]);
    });

    it('returns [] silently when Ollama is unreachable', async () => {
        mockHttpError('ECONNREFUSED');
        expect(await local.getRunningModels()).toEqual([]);
    });
});
