import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { AppError, errorHandler } from './errorHandler.js';

// Minimal mock for Express res object
function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const req = {} as Request;
const next: NextFunction = vi.fn();

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env['NODE_ENV'];
});

// ---------------------------------------------------------------------------
// AppError
// ---------------------------------------------------------------------------
describe('AppError', () => {
  it('stores statusCode and message', () => {
    const err = new AppError(404, 'Not found');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Not found');
  });

  it('has name "AppError"', () => {
    const err = new AppError(400, 'Bad request');
    expect(err.name).toBe('AppError');
  });

  it('is an instance of Error', () => {
    const err = new AppError(500, 'Oops');
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// errorHandler
// ---------------------------------------------------------------------------
describe('errorHandler', () => {
  it('responds with AppError statusCode and message', () => {
    const res = mockRes();
    const err = new AppError(422, 'Validation failed');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: 'Validation failed' });
  });

  it('responds with 500 for a generic Error in development', () => {
    process.env['NODE_ENV'] = 'development';
    const res = mockRes();
    const err = new Error('Something broke');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Something broke' });
  });

  it('hides the error message in production', () => {
    process.env['NODE_ENV'] = 'production';
    const res = mockRes();
    const err = new Error('Sensitive internal details');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('does not expose AppError details differently in production', () => {
    process.env['NODE_ENV'] = 'production';
    const res = mockRes();
    const err = new AppError(403, 'Forbidden');
    errorHandler(err, req, res, next);
    // AppError message is always surfaced regardless of NODE_ENV
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });
});
