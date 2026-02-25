import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all service dependencies
const mockCreateSession = vi.fn();
const mockGetSessionStatus = vi.fn();
const mockCheckNumber = vi.fn();
const mockDeleteSession = vi.fn();
const mockGetAllSessions = vi.fn();

vi.mock('../../src/services/sessionManager.js', () => ({
  createSession: (...args) => mockCreateSession(...args),
  getSessionStatus: (...args) => mockGetSessionStatus(...args),
  checkNumber: (...args) => mockCheckNumber(...args),
  deleteSession: (...args) => mockDeleteSession(...args),
  getAllSessions: (...args) => mockGetAllSessions(...args),
}));

vi.mock('../../src/utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

const {
  createSession,
  getStatus,
  checkNumber,
  removeSession,
  listSessions,
} = await import('../../src/controllers/sessionController.js');

const createMockReq = (body = {}, params = {}) => ({
  body,
  params,
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

describe('Session Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create session with QR method by default', async () => {
      mockCreateSession.mockResolvedValue({
        sessionId: 'test-session',
        pairingMethod: 'qr',
        status: 'qr_generated',
      });

      const req = createMockReq({ sessionId: 'test-session' });
      const res = createMockRes();
      const next = vi.fn();

      await createSession(req, res, next);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionId).toBe('test-session');
      expect(res.body.data.pairingMethod).toBe('qr');
      expect(mockCreateSession).toHaveBeenCalledWith('test-session', 'qr', undefined);
    });

    it('should create session with pairing code method', async () => {
      mockCreateSession.mockResolvedValue({
        sessionId: 'test-session',
        pairingMethod: 'code',
        status: 'code_requested',
        pairingCode: 'A1B2-C3D4',
      });

      const req = createMockReq({
        sessionId: 'test-session',
        pairingMethod: 'code',
        phoneNumber: '628123456789',
      });
      const res = createMockRes();
      const next = vi.fn();

      await createSession(req, res, next);

      expect(res.statusCode).toBe(201);
      expect(res.body.data.pairingMethod).toBe('code');
      expect(res.body.data.pairingCode).toBe('A1B2-C3D4');
      expect(mockCreateSession).toHaveBeenCalledWith('test-session', 'code', '628123456789');
    });

    it('should auto-generate sessionId when not provided', async () => {
      mockCreateSession.mockResolvedValue({
        sessionId: 'auto-generated-uuid',
        pairingMethod: 'qr',
        status: 'qr_generated',
      });

      const req = createMockReq({});
      const res = createMockRes();
      const next = vi.fn();

      await createSession(req, res, next);

      expect(res.statusCode).toBe(201);
      expect(mockCreateSession).toHaveBeenCalledTimes(1);
      // First arg should be a UUID string
      const calledSessionId = mockCreateSession.mock.calls[0][0];
      expect(calledSessionId).toMatch(/^[a-f0-9-]+$/);
    });

    it('should reject invalid sessionId characters', async () => {
      const req = createMockReq({ sessionId: 'bad session!@#' });
      const res = createMockRes();
      const next = vi.fn();

      await createSession(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid sessionId');
      expect(mockCreateSession).not.toHaveBeenCalled();
    });

    it('should reject invalid pairingMethod', async () => {
      const req = createMockReq({ sessionId: 'test', pairingMethod: 'invalid' });
      const res = createMockRes();
      const next = vi.fn();

      await createSession(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Invalid pairingMethod');
    });

    it('should reject code method without phoneNumber', async () => {
      const req = createMockReq({
        sessionId: 'test',
        pairingMethod: 'code',
      });
      const res = createMockRes();
      const next = vi.fn();

      await createSession(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('phoneNumber is required');
    });

    it('should reject code method with short phoneNumber', async () => {
      const req = createMockReq({
        sessionId: 'test',
        pairingMethod: 'code',
        phoneNumber: '123',
      });
      const res = createMockRes();
      const next = vi.fn();

      await createSession(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Invalid phoneNumber format');
    });

    it('should reject code method with too long phoneNumber', async () => {
      const req = createMockReq({
        sessionId: 'test',
        pairingMethod: 'code',
        phoneNumber: '1234567890123456',
      });
      const res = createMockRes();
      const next = vi.fn();

      await createSession(req, res, next);

      expect(res.statusCode).toBe(400);
    });

    it('should call next on service error', async () => {
      mockCreateSession.mockRejectedValue(new Error('Service failure'));

      const req = createMockReq({ sessionId: 'test-session' });
      const res = createMockRes();
      const next = vi.fn();

      await createSession(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getStatus', () => {
    it('should return session status', async () => {
      mockGetSessionStatus.mockReturnValue({
        sessionId: 'test-session',
        status: 'connected',
      });

      const req = createMockReq({}, { sessionId: 'test-session' });
      const res = createMockRes();
      const next = vi.fn();

      await getStatus(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('connected');
    });

    it('should return closed for non-existent session', async () => {
      mockGetSessionStatus.mockReturnValue({
        sessionId: 'nonexistent',
        status: 'closed',
      });

      const req = createMockReq({}, { sessionId: 'nonexistent' });
      const res = createMockRes();
      const next = vi.fn();

      await getStatus(req, res, next);

      expect(res.body.data.status).toBe('closed');
    });
  });

  describe('checkNumber', () => {
    it('should check number successfully', async () => {
      mockCheckNumber.mockResolvedValue({
        exists: true,
        jid: '628123456789@s.whatsapp.net',
      });

      const req = createMockReq({
        sessionId: 'test-session',
        number: '628123456789',
      });
      const res = createMockRes();
      const next = vi.fn();

      await checkNumber(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.exists).toBe(true);
      expect(res.body.data.jid).toBe('628123456789@s.whatsapp.net');
    });

    it('should return exists false for non-registered number', async () => {
      mockCheckNumber.mockResolvedValue({
        exists: false,
        jid: null,
      });

      const req = createMockReq({
        sessionId: 'test-session',
        number: '628000000000',
      });
      const res = createMockRes();
      const next = vi.fn();

      await checkNumber(req, res, next);

      expect(res.body.data.exists).toBe(false);
      expect(res.body.data.jid).toBeNull();
    });

    it('should reject missing sessionId', async () => {
      const req = createMockReq({ number: '628123456789' });
      const res = createMockRes();
      const next = vi.fn();

      await checkNumber(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('sessionId is required');
    });

    it('should reject missing number', async () => {
      const req = createMockReq({ sessionId: 'test' });
      const res = createMockRes();
      const next = vi.fn();

      await checkNumber(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('number is required');
    });

    it('should reject short number', async () => {
      const req = createMockReq({ sessionId: 'test', number: '123' });
      const res = createMockRes();
      const next = vi.fn();

      await checkNumber(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Invalid number format');
    });

    it('should clean non-digit characters from number', async () => {
      mockCheckNumber.mockResolvedValue({ exists: true, jid: '628123456789@s.whatsapp.net' });

      const req = createMockReq({
        sessionId: 'test',
        number: '+62-812-345-6789',
      });
      const res = createMockRes();
      const next = vi.fn();

      await checkNumber(req, res, next);

      expect(mockCheckNumber).toHaveBeenCalledWith('test', '628123456789');
    });

    it('should forward service errors to next', async () => {
      mockCheckNumber.mockRejectedValue(
        Object.assign(new Error('Session not found'), { statusCode: 404 })
      );

      const req = createMockReq({
        sessionId: 'nonexistent',
        number: '628123456789',
      });
      const res = createMockRes();
      const next = vi.fn();

      await checkNumber(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('removeSession', () => {
    it('should delete session successfully', async () => {
      mockDeleteSession.mockResolvedValue({
        sessionId: 'test-session',
        status: 'closed',
      });

      const req = createMockReq({}, { sessionId: 'test-session' });
      const res = createMockRes();
      const next = vi.fn();

      await removeSession(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('closed');
    });

    it('should forward error when session not found', async () => {
      mockDeleteSession.mockRejectedValue(
        Object.assign(new Error('Session not found'), { statusCode: 404 })
      );

      const req = createMockReq({}, { sessionId: 'nonexistent' });
      const res = createMockRes();
      const next = vi.fn();

      await removeSession(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('listSessions', () => {
    it('should return list of sessions', async () => {
      mockGetAllSessions.mockReturnValue([
        { sessionId: 'session-1', status: 'connected' },
        { sessionId: 'session-2', status: 'qr_required' },
      ]);

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      await listSessions(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.sessions).toHaveLength(2);
    });

    it('should return empty list when no sessions', async () => {
      mockGetAllSessions.mockReturnValue([]);

      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      await listSessions(req, res, next);

      expect(res.body.data.sessions).toHaveLength(0);
    });
  });
});
