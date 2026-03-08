import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock dependencies before importing the hook
// ---------------------------------------------------------------------------
vi.mock('@web/lib/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@web/lib/apiClient', () => ({
  getPendingCount: vi.fn(),
}));

import { useAuth } from '@web/lib/AuthContext';
import { getPendingCount } from '@web/lib/apiClient';
import { usePendingCount } from './usePendingCount.js';

const mockUseAuth = vi.mocked(useAuth);
const mockGetPendingCount = vi.mocked(getPendingCount);

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// usePendingCount
// ---------------------------------------------------------------------------
describe('usePendingCount', () => {
  it('returns 0 and does not call the API when user is null', () => {
    mockUseAuth.mockReturnValue({ user: null } as never);
    const { result } = renderHook(() => usePendingCount());
    expect(result.current).toBe(0);
    expect(mockGetPendingCount).not.toHaveBeenCalled();
  });

  it('returns 0 and does not call the API when user role is "groundskeeper"', () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'groundskeeper', id: 'u1', email: 'gk@example.com', name: 'GK', cemeteryId: 'c1' },
    } as never);
    const { result } = renderHook(() => usePendingCount());
    expect(result.current).toBe(0);
    expect(mockGetPendingCount).not.toHaveBeenCalled();
  });

  it('calls getPendingCount and returns the count when user is admin', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'admin', id: 'u1', email: 'a@b.com', name: 'Admin', cemeteryId: 'c1' },
    } as never);
    mockGetPendingCount.mockResolvedValue({ count: 7 });

    const { result } = renderHook(() => usePendingCount());

    await waitFor(() => expect(result.current).toBe(7));
    expect(mockGetPendingCount).toHaveBeenCalledOnce();
  });

  it('returns 0 when getPendingCount throws an error', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'admin', id: 'u1', email: 'a@b.com', name: 'Admin', cemeteryId: 'c1' },
    } as never);
    mockGetPendingCount.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePendingCount());

    // Give the effect time to settle; count should remain 0
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toBe(0);
  });

  it('starts at 0 before the API call resolves', () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'admin', id: 'u1', email: 'a@b.com', name: 'Admin', cemeteryId: 'c1' },
    } as never);
    // Never resolves during this test
    mockGetPendingCount.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => usePendingCount());
    expect(result.current).toBe(0);
  });
});
