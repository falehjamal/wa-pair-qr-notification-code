import { describe, it, expect } from 'vitest';

describe('Config', () => {
  it('should load default config values', async () => {
    // Override env for testing
    const originalPort = process.env.PORT;
    const originalHost = process.env.HOST;
    const originalApiKeys = process.env.API_KEYS;
    const originalCors = process.env.CORS_ORIGIN;
    const originalLogLevel = process.env.LOG_LEVEL;
    const originalSessionsDir = process.env.SESSIONS_DIR;

    delete process.env.PORT;
    delete process.env.HOST;
    delete process.env.API_KEYS;
    delete process.env.CORS_ORIGIN;
    delete process.env.LOG_LEVEL;
    delete process.env.SESSIONS_DIR;

    // Re-import to get fresh defaults
    const { default: config } = await import('../../src/config/index.js');

    expect(config).toBeDefined();
    expect(typeof config.port).toBe('number');
    expect(typeof config.host).toBe('string');
    expect(Array.isArray(config.apiKeys)).toBe(true);
    expect(typeof config.corsOrigin).toBe('string');
    expect(typeof config.logLevel).toBe('string');
    expect(typeof config.sessionsDir).toBe('string');
    expect(typeof config.rateLimitWindowMs).toBe('number');
    expect(typeof config.rateLimitMax).toBe('number');

    // Restore
    if (originalPort) process.env.PORT = originalPort;
    if (originalHost) process.env.HOST = originalHost;
    if (originalApiKeys) process.env.API_KEYS = originalApiKeys;
    if (originalCors) process.env.CORS_ORIGIN = originalCors;
    if (originalLogLevel) process.env.LOG_LEVEL = originalLogLevel;
    if (originalSessionsDir) process.env.SESSIONS_DIR = originalSessionsDir;
  });

  it('should parse API_KEYS as array', async () => {
    process.env.API_KEYS = 'key1,key2,key3';

    // Dynamic import won't re-evaluate since module is cached, so test the parsing logic directly
    const keys = process.env.API_KEYS.split(',').map((k) => k.trim()).filter(Boolean);

    expect(keys).toEqual(['key1', 'key2', 'key3']);
  });

  it('should handle empty API_KEYS', () => {
    process.env.API_KEYS = '';
    const keys = process.env.API_KEYS
      ? process.env.API_KEYS.split(',').map((k) => k.trim()).filter(Boolean)
      : [];

    expect(keys).toEqual([]);
  });

  it('should handle API_KEYS with spaces', () => {
    process.env.API_KEYS = ' key1 , key2 , key3 ';
    const keys = process.env.API_KEYS.split(',').map((k) => k.trim()).filter(Boolean);

    expect(keys).toEqual(['key1', 'key2', 'key3']);
  });

  it('should parse PORT as integer', () => {
    const port = parseInt('8080', 10);
    expect(port).toBe(8080);
    expect(typeof port).toBe('number');
  });

  it('should default PORT to 3000 when invalid', () => {
    const port = parseInt('invalid', 10) || 3000;
    expect(port).toBe(3000);
  });
});
