import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import supertest from 'supertest';

// Mock sessionManager service to avoid real Baileys connections
vi.mock('../../src/services/sessionManager.js', () => {
  const sessions = new Map();

  return {
    setIO: vi.fn(),
    createSession: vi.fn(async (sessionId, pairingMethod = 'qr', phoneNumber = null) => {
      sessions.set(sessionId, { sessionId, status: 'connecting', pairingMethod });
      const response = { sessionId, pairingMethod };
      if (pairingMethod === 'qr') {
        response.status = 'qr_generated';
      } else {
        response.status = 'code_requested';
        response.pairingCode = 'A1B2-C3D4';
      }
      return response;
    }),
    getSessionStatus: vi.fn((sessionId) => {
      const session = sessions.get(sessionId);
      if (!session) return { sessionId, status: 'closed' };
      return { sessionId, status: session.status };
    }),
    checkNumber: vi.fn(async (sessionId, number) => {
      const session = sessions.get(sessionId);
      if (!session) {
        throw Object.assign(new Error('Session not found'), { statusCode: 404 });
      }
      // simulate connected check
      if (session.status !== 'connected') {
        throw Object.assign(new Error('Session is not connected'), { statusCode: 400 });
      }
      if (number === '628000000000') {
        return { exists: false, jid: null };
      }
      return { exists: true, jid: `${number}@s.whatsapp.net` };
    }),
    deleteSession: vi.fn(async (sessionId) => {
      const session = sessions.get(sessionId);
      if (!session) {
        throw Object.assign(new Error('Session not found'), { statusCode: 404 });
      }
      sessions.delete(sessionId);
      return { sessionId, status: 'closed' };
    }),
    getAllSessions: vi.fn(() => {
      const result = [];
      for (const [sessionId, session] of sessions) {
        result.push({ sessionId, status: session.status });
      }
      return result;
    }),
    shutdownAllSessions: vi.fn(async () => {
      sessions.clear();
    }),
    // Expose for test manipulation
    _sessions: sessions,
  };
});

// Mock pino logger
vi.mock('../../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Set env before importing app
process.env.API_KEYS = 'test-api-key-1,test-api-key-2';
process.env.RATE_LIMIT_MAX = '1000';
process.env.LOG_LEVEL = 'silent';

const app = (await import('../../src/app.js')).default;
const { _sessions } = await import('../../src/services/sessionManager.js');

let server;
let request;

beforeAll(() => {
  server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: '*' } });
  app.set('io', io);
  request = supertest(app);
});

afterAll(() => {
  if (server) server.close();
  _sessions.clear();
});

describe('API Integration Tests', () => {
  // ============================================
  // Health Check
  // ============================================
  describe('GET /health', () => {
    it('should return health status without auth', async () => {
      const res = await request.get('/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('OK');
      expect(res.body.data).toHaveProperty('uptime');
      expect(res.body.data).toHaveProperty('timestamp');
      expect(res.body.data).toHaveProperty('memoryUsage');
    });
  });

  // ============================================
  // Authentication
  // ============================================
  describe('Authentication', () => {
    it('should reject requests without API key', async () => {
      const res = await request
        .post('/api/session/create')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('API key is required');
    });

    it('should reject requests with invalid API key', async () => {
      const res = await request
        .post('/api/session/create')
        .set('x-api-key', 'invalid-key')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid API key');
    });

    it('should accept requests with valid API key', async () => {
      const res = await request
        .post('/api/session/create')
        .set('x-api-key', 'test-api-key-1')
        .send({ sessionId: 'auth-test' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should accept second valid API key', async () => {
      const res = await request
        .post('/api/session/create')
        .set('x-api-key', 'test-api-key-2')
        .send({ sessionId: 'auth-test-2' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  // ============================================
  // Create Session
  // ============================================
  describe('POST /api/session/create', () => {
    it('should create session with QR method (default)', async () => {
      const res = await request
        .post('/api/session/create')
        .set('x-api-key', 'test-api-key-1')
        .send({ sessionId: 'qr-session' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Session created');
      expect(res.body.data.sessionId).toBe('qr-session');
      expect(res.body.data.pairingMethod).toBe('qr');
      expect(res.body.data.status).toBe('qr_generated');
    });

    it('should create session with pairing code method', async () => {
      const res = await request
        .post('/api/session/create')
        .set('x-api-key', 'test-api-key-1')
        .send({
          sessionId: 'code-session',
          pairingMethod: 'code',
          phoneNumber: '628123456789',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.pairingMethod).toBe('code');
      expect(res.body.data.status).toBe('code_requested');
      expect(res.body.data.pairingCode).toBe('A1B2-C3D4');
    });

    it('should auto-generate sessionId', async () => {
      const res = await request
        .post('/api/session/create')
        .set('x-api-key', 'test-api-key-1')
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.sessionId).toBeDefined();
      expect(res.body.data.sessionId.length).toBeGreaterThan(0);
    });

    it('should reject invalid sessionId', async () => {
      const res = await request
        .post('/api/session/create')
        .set('x-api-key', 'test-api-key-1')
        .send({ sessionId: 'bad session!@#' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid sessionId');
    });

    it('should reject invalid pairingMethod', async () => {
      const res = await request
        .post('/api/session/create')
        .set('x-api-key', 'test-api-key-1')
        .send({ sessionId: 'test', pairingMethod: 'sms' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid pairingMethod');
    });

    it('should reject code method without phoneNumber', async () => {
      const res = await request
        .post('/api/session/create')
        .set('x-api-key', 'test-api-key-1')
        .send({ sessionId: 'test', pairingMethod: 'code' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('phoneNumber is required');
    });

    it('should reject code method with invalid phoneNumber', async () => {
      const res = await request
        .post('/api/session/create')
        .set('x-api-key', 'test-api-key-1')
        .send({
          sessionId: 'test',
          pairingMethod: 'code',
          phoneNumber: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid phoneNumber');
    });
  });

  // ============================================
  // Session Status
  // ============================================
  describe('GET /api/session/status/:sessionId', () => {
    it('should return status of existing session', async () => {
      // Create a session first
      await request
        .post('/api/session/create')
        .set('x-api-key', 'test-api-key-1')
        .send({ sessionId: 'status-test' });

      const res = await request
        .get('/api/session/status/status-test')
        .set('x-api-key', 'test-api-key-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionId).toBe('status-test');
      expect(res.body.data).toHaveProperty('status');
    });

    it('should return closed for non-existent session', async () => {
      const res = await request
        .get('/api/session/status/nonexistent-session')
        .set('x-api-key', 'test-api-key-1');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('closed');
    });
  });

  // ============================================
  // List Sessions
  // ============================================
  describe('GET /api/session/list', () => {
    it('should return list of sessions', async () => {
      const res = await request
        .get('/api/session/list')
        .set('x-api-key', 'test-api-key-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('sessions');
      expect(Array.isArray(res.body.data.sessions)).toBe(true);
    });
  });

  // ============================================
  // Check Number
  // ============================================
  describe('POST /api/session/check-number', () => {
    it('should reject missing sessionId', async () => {
      const res = await request
        .post('/api/session/check-number')
        .set('x-api-key', 'test-api-key-1')
        .send({ number: '628123456789' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('sessionId is required');
    });

    it('should reject missing number', async () => {
      const res = await request
        .post('/api/session/check-number')
        .set('x-api-key', 'test-api-key-1')
        .send({ sessionId: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('number is required');
    });

    it('should reject invalid number format', async () => {
      const res = await request
        .post('/api/session/check-number')
        .set('x-api-key', 'test-api-key-1')
        .send({ sessionId: 'test', number: '12' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid number format');
    });

    it('should reject too long number', async () => {
      const res = await request
        .post('/api/session/check-number')
        .set('x-api-key', 'test-api-key-1')
        .send({ sessionId: 'test', number: '1234567890123456' });

      expect(res.status).toBe(400);
    });
  });

  // ============================================
  // Delete Session
  // ============================================
  describe('DELETE /api/session/:sessionId', () => {
    it('should delete existing session', async () => {
      // Create one first
      await request
        .post('/api/session/create')
        .set('x-api-key', 'test-api-key-1')
        .send({ sessionId: 'delete-test' });

      const res = await request
        .delete('/api/session/delete-test')
        .set('x-api-key', 'test-api-key-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('closed');
    });

    it('should return error for non-existent session', async () => {
      const res = await request
        .delete('/api/session/nonexistent')
        .set('x-api-key', 'test-api-key-1');

      // The mock throws 404, caught by error handler
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ============================================
  // 404 Routes
  // ============================================
  describe('Unknown Routes', () => {
    it('should return 404 for unknown API routes', async () => {
      const res = await request
        .get('/api/unknown')
        .set('x-api-key', 'test-api-key-1');

      expect(res.status).toBe(404);
    });

    it('should return 404 for unknown root routes', async () => {
      const res = await request.get('/unknown');

      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // CORS
  // ============================================
  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const res = await request
        .get('/health')
        .set('Origin', 'https://example.com');

      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  // ============================================
  // JSON parsing
  // ============================================
  describe('JSON Body Parsing', () => {
    it('should handle empty body gracefully', async () => {
      const res = await request
        .post('/api/session/create')
        .set('x-api-key', 'test-api-key-1')
        .set('Content-Type', 'application/json')
        .send('');

      // Should either create with auto-id or handle gracefully
      expect([201, 400]).toContain(res.status);
    });

    it('should handle malformed JSON', async () => {
      const res = await request
        .post('/api/session/create')
        .set('x-api-key', 'test-api-key-1')
        .set('Content-Type', 'application/json')
        .send('{"bad json');

      expect(res.status).toBe(400);
    });
  });
});
