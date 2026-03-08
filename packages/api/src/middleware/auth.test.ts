import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth, requireAdmin, signToken } from './auth.js';
import { AppError } from './errorHandler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, ...overrides } as unknown as Request;
}

const res = {} as Response;

function captureNext(): { fn: NextFunction; calls: unknown[] } {
  const calls: unknown[] = [];
  const fn: NextFunction = (arg?: unknown) => {
    calls.push(arg);
  };
  return { fn, calls };
}

const testUser = {
  id: 'user-1',
  email: 'admin@example.com',
  role: 'admin',
  cemeteryId: 'cem-1',
};

// ---------------------------------------------------------------------------
// signToken
// ---------------------------------------------------------------------------
describe('signToken', () => {
  it('returns a non-empty JWT string', () => {
    const token = signToken(testUser);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
  });

  it('encodes the user payload', () => {
    const token = signToken(testUser);
    // Decode payload (middle segment) without verifying signature
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1]!, 'base64url').toString(),
    );
    expect(payload.id).toBe(testUser.id);
    expect(payload.email).toBe(testUser.email);
    expect(payload.role).toBe(testUser.role);
  });
});

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------
describe('requireAuth', () => {
  it('calls next with AppError 401 when Authorization header is absent', () => {
    const req = mockReq({ headers: {} });
    const { fn, calls } = captureNext();
    requireAuth(req, res, fn);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeInstanceOf(AppError);
    expect((calls[0] as AppError).statusCode).toBe(401);
  });

  it('calls next with AppError 401 when header does not start with "Bearer "', () => {
    const req = mockReq({ headers: { authorization: 'Basic abc123' } });
    const { fn, calls } = captureNext();
    requireAuth(req, res, fn);
    expect((calls[0] as AppError).statusCode).toBe(401);
  });

  it('calls next with AppError 401 for an invalid/expired token', () => {
    const req = mockReq({ headers: { authorization: 'Bearer not.a.real.token' } });
    const { fn, calls } = captureNext();
    requireAuth(req, res, fn);
    expect((calls[0] as AppError).statusCode).toBe(401);
    expect((calls[0] as AppError).message).toMatch(/invalid or expired/i);
  });

  it('sets req.user and calls next() with no arguments for a valid token', () => {
    const token = signToken(testUser);
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const { fn, calls } = captureNext();
    requireAuth(req, res, fn);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeUndefined(); // next() called without error
    expect(req.user?.id).toBe(testUser.id);
    expect(req.user?.role).toBe(testUser.role);
  });
});

// ---------------------------------------------------------------------------
// requireAdmin
// ---------------------------------------------------------------------------
describe('requireAdmin', () => {
  it('calls next with AppError 403 when req.user is undefined', () => {
    const req = mockReq();
    const { fn, calls } = captureNext();
    requireAdmin(req, res, fn);
    expect((calls[0] as AppError).statusCode).toBe(403);
  });

  it('calls next with AppError 403 when user role is "groundskeeper"', () => {
    const req = mockReq({
      user: { ...testUser, role: 'groundskeeper' },
    } as unknown as Partial<Request>);
    const { fn, calls } = captureNext();
    requireAdmin(req, res, fn);
    expect((calls[0] as AppError).statusCode).toBe(403);
    expect((calls[0] as AppError).message).toMatch(/admin access required/i);
  });

  it('calls next() with no arguments when user role is "admin"', () => {
    const req = mockReq({
      user: testUser,
    } as unknown as Partial<Request>);
    const { fn, calls } = captureNext();
    requireAdmin(req, res, fn);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeUndefined();
  });
});
