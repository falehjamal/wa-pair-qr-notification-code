import { describe, it, expect, vi } from 'vitest';

// Mock logger to suppress output
vi.mock('../../src/utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

const { errorHandler } = await import('../../src/middlewares/errorHandler.js');

const createMockReq = (method = 'GET', url = '/test') => ({
  method,
  url,
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

describe('Error Handler Middleware', () => {
  it('should handle error with statusCode', () => {
    const err = Object.assign(new Error('Not found'), { statusCode: 404 });
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Not found');
  });

  it('should handle error with status property', () => {
    const err = Object.assign(new Error('Bad request'), { status: 400 });
    const req = createMockReq('POST', '/api/test');
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should default to 500 when no status code', () => {
    const err = new Error('Something broke');
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('should hide error details in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const err = new Error('Sensitive internal detail');
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.body.message).toBe('Internal server error');

    process.env.NODE_ENV = originalEnv;
  });

  it('should show error details in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const err = new Error('Debug info shown');
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.body.message).toBe('Debug info shown');

    process.env.NODE_ENV = originalEnv;
  });
});
