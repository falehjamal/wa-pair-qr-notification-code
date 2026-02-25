import { describe, it, expect, vi } from 'vitest';
import { sendSuccess, sendError } from '../../src/utils/response.js';

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

describe('Response Utils', () => {
  describe('sendSuccess', () => {
    it('should return success response with data', () => {
      const res = createMockRes();
      sendSuccess(res, { foo: 'bar' }, 'Done', 200);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: 'Done',
        data: { foo: 'bar' },
      });
    });

    it('should return success response without data when data is null', () => {
      const res = createMockRes();
      sendSuccess(res, null, 'Done');

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: 'Done',
      });
      expect(res.body.data).toBeUndefined();
    });

    it('should use default message and status code', () => {
      const res = createMockRes();
      sendSuccess(res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Success');
    });

    it('should support custom status codes', () => {
      const res = createMockRes();
      sendSuccess(res, { id: 1 }, 'Created', 201);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should include data when it is an empty object', () => {
      const res = createMockRes();
      sendSuccess(res, {}, 'Ok');

      expect(res.body.data).toEqual({});
    });

    it('should include data when it is an empty array', () => {
      const res = createMockRes();
      sendSuccess(res, [], 'Ok');

      expect(res.body.data).toEqual([]);
    });

    it('should include data when it is false', () => {
      const res = createMockRes();
      sendSuccess(res, false, 'Ok');

      expect(res.body.data).toBe(false);
    });

    it('should include data when it is 0', () => {
      const res = createMockRes();
      sendSuccess(res, 0, 'Ok');

      expect(res.body.data).toBe(0);
    });
  });

  describe('sendError', () => {
    it('should return error response', () => {
      const res = createMockRes();
      sendError(res, 'Not found', 404);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({
        success: false,
        message: 'Not found',
      });
    });

    it('should use default message and status code', () => {
      const res = createMockRes();
      sendError(res);

      expect(res.statusCode).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Internal server error');
    });

    it('should include data when provided', () => {
      const res = createMockRes();
      sendError(res, 'Validation failed', 400, { fields: ['name'] });

      expect(res.statusCode).toBe(400);
      expect(res.body.data).toEqual({ fields: ['name'] });
    });

    it('should not include data when null', () => {
      const res = createMockRes();
      sendError(res, 'Error', 500, null);

      expect(res.body.data).toBeUndefined();
    });
  });
});
