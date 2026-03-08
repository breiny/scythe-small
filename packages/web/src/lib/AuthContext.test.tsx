import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Mock apiClient before importing AuthContext
// ---------------------------------------------------------------------------
vi.mock('@web/lib/apiClient', () => ({
  login: vi.fn(),
  register: vi.fn(),
  fetchCurrentUser: vi.fn(),
}));

import * as apiClient from '@web/lib/apiClient';
import { AuthProvider, useAuth } from './AuthContext.js';

const mockLogin = vi.mocked(apiClient.login);
const mockRegister = vi.mocked(apiClient.register);
const mockFetchCurrentUser = vi.mocked(apiClient.fetchCurrentUser);

const fakeUser = {
  id: 'u1',
  email: 'admin@example.com',
  name: 'Alice Admin',
  role: 'admin',
  cemeteryId: 'cem-1',
};

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Initial load — no token
// ---------------------------------------------------------------------------
describe('AuthProvider initial load (no token)', () => {
  it('resolves to loading=false with user=null and never calls fetchCurrentUser', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(mockFetchCurrentUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Initial load — valid token
// ---------------------------------------------------------------------------
describe('AuthProvider initial load (valid token)', () => {
  it('fetches the current user and sets it when a token exists', async () => {
    localStorage.setItem('scythe_token', 'valid-token');
    mockFetchCurrentUser.mockResolvedValue(fakeUser);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(fakeUser);
    expect(mockFetchCurrentUser).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Initial load — bad token
// ---------------------------------------------------------------------------
describe('AuthProvider initial load (bad/expired token)', () => {
  it('removes the token from localStorage and leaves user=null when fetch fails', async () => {
    localStorage.setItem('scythe_token', 'expired-token');
    mockFetchCurrentUser.mockRejectedValue(new Error('401 Unauthorized'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('scythe_token')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// login()
// ---------------------------------------------------------------------------
describe('login', () => {
  it('stores the returned token and sets the user', async () => {
    mockFetchCurrentUser.mockResolvedValue(null); // no pre-existing session
    mockLogin.mockResolvedValue({ token: 'new-token', user: fakeUser });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('admin@example.com', 'password123');
    });

    expect(localStorage.getItem('scythe_token')).toBe('new-token');
    expect(result.current.user).toEqual(fakeUser);
  });

  it('propagates errors from apiLogin', async () => {
    mockFetchCurrentUser.mockResolvedValue(null);
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('a@b.com', 'wrong');
      }),
    ).rejects.toThrow('Invalid credentials');

    expect(result.current.user).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// register()
// ---------------------------------------------------------------------------
describe('register', () => {
  it('stores the returned token, sets user, and returns cemeterySlug', async () => {
    mockFetchCurrentUser.mockResolvedValue(null);
    mockRegister.mockResolvedValue({
      token: 'reg-token',
      user: fakeUser,
      cemetery: { slug: 'oak-hill' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returnValue: { cemeterySlug: string } | undefined;
    await act(async () => {
      returnValue = await result.current.register({
        email: 'a@b.com',
        password: 'pass1234',
        name: 'Alice',
        cemeteryName: 'Oak Hill',
        cemeteryAddress: '1 Oak Ave',
        cemeteryCity: 'Springfield',
        cemeteryState: 'IL',
        cemeteryZip: '62701',
      });
    });

    expect(localStorage.getItem('scythe_token')).toBe('reg-token');
    expect(result.current.user).toEqual(fakeUser);
    expect(returnValue?.cemeterySlug).toBe('oak-hill');
  });
});

// ---------------------------------------------------------------------------
// logout()
// ---------------------------------------------------------------------------
describe('logout', () => {
  it('clears the token and sets user to null', async () => {
    localStorage.setItem('scythe_token', 'valid-token');
    mockFetchCurrentUser.mockResolvedValue(fakeUser);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(fakeUser));

    act(() => {
      result.current.logout();
    });

    expect(localStorage.getItem('scythe_token')).toBeNull();
    expect(result.current.user).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useAuth — used outside AuthProvider
// ---------------------------------------------------------------------------
describe('useAuth outside AuthProvider', () => {
  it('throws a descriptive error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within AuthProvider',
    );
  });
});
