import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before importing the middleware
vi.mock('../../src/config/index.js', () => ({
  default: {
    apiKeys: ['test-key-1', 'test-key-2'],
  },
}));

const { apiKeyAuth } = await import('../../src/middlewares/apiKeyAuth.js');

const createMockReq = (headers = {}) => ({
  headers,
});

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
};

describe('API Key Auth Middleware', () => {
  it('should call next() with valid API key', () => {
    const req = createMockReq({ 'x-api-key': 'test-key-1' });
    const res = createMockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.body).toBeNull();
  });

  it('should accept second valid API key', () => {
    const req = createMockReq({ 'x-api-key': 'test-key-2' });
    const res = createMockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('should return 401 when API key is missing', () => {
    const req = createMockReq({});
    const res = createMockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('API key is required');
  });

  it('should return 401 when API key is invalid', () => {
    const req = createMockReq({ 'x-api-key': 'wrong-key' });
    const res = createMockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Invalid API key');
  });

  it('should return 401 when API key is empty string', () => {
    const req = createMockReq({ 'x-api-key': '' });
    const res = createMockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
