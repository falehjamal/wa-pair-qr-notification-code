import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config without API keys (auth disabled)
vi.mock('../../src/config/index.js', () => ({
  default: {
    apiKeys: [],
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

describe('API Key Auth Middleware - Auth Disabled', () => {
  it('should skip auth when no API keys configured', () => {
    const req = createMockReq({});
    const res = createMockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.body).toBeNull();
  });

  it('should skip auth even with random header when no keys configured', () => {
    const req = createMockReq({ 'x-api-key': 'any-random-key' });
    const res = createMockRes();
    const next = vi.fn();

    apiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
