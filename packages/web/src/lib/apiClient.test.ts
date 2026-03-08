import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  uploadPhoto,
  createPlot,
  fetchCemeteryBySlug,
  fetchCemeteryPlots,
  fetchPlotDetail,
  searchBurials,
  login,
  fetchCurrentUser,
  register,
  submitPinDrop,
  parseCsvHeaders,
  validateCsvImport,
  executeCsvImport,
  detectCemetery,
  createCemeteryFromOsm,
  listCemeteries,
  fetchCemeteryDirectory,
  processOcr,
  contributeProcess,
  contributeSubmit,
  fetchPendingSubmissions,
  getPendingCount,
  approveSubmission,
  rejectSubmission,
  editApproveSubmission,
  confirmOcr,
} from './apiClient.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function okResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

function errResponse(status: number, errorMsg: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: errorMsg }),
  } as unknown as Response;
}

function errResponseNonJson(status: number) {
  return {
    ok: false,
    status,
    json: async () => { throw new Error('Not JSON'); },
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Auth header injection (tested implicitly through fetchJson functions)
// ---------------------------------------------------------------------------
describe('Auth header injection', () => {
  it('includes Authorization header when a token exists in localStorage', async () => {
    localStorage.setItem('scythe_token', 'my-jwt');
    vi.mocked(fetch).mockResolvedValue(okResponse({ id: 'u1' }));

    await fetchCurrentUser();

    const [, options] = vi.mocked(fetch).mock.calls[0]!;
    expect((options as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer my-jwt',
    });
  });

  it('omits Authorization header when no token is stored', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ id: 'u1' }));

    await fetchCurrentUser();

    const [, options] = vi.mocked(fetch).mock.calls[0]!;
    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// fetchJson error handling
// ---------------------------------------------------------------------------
describe('fetchJson error handling', () => {
  it('throws with the body.error message on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(errResponse(401, 'Unauthorized'));
    await expect(fetchCurrentUser()).rejects.toThrow('Unauthorized');
  });

  it('throws a fallback message when the error body is not valid JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(errResponseNonJson(500));
    await expect(fetchCurrentUser()).rejects.toThrow('Request failed');
  });
});

// ---------------------------------------------------------------------------
// postJson error handling
// ---------------------------------------------------------------------------
describe('postJson error handling', () => {
  it('throws with the body.error message on a non-ok POST response', async () => {
    vi.mocked(fetch).mockResolvedValue(errResponse(422, 'Validation failed'));
    await expect(login('a@b.com', 'wrong')).rejects.toThrow('Validation failed');
  });
});

// ---------------------------------------------------------------------------
// fetchCemeteryBySlug
// ---------------------------------------------------------------------------
describe('fetchCemeteryBySlug', () => {
  it('calls GET /api/cemeteries/:slug', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ id: 'c1', name: 'Oak Hill' }));
    const result = await fetchCemeteryBySlug('oak-hill');
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/cemeteries/oak-hill');
    expect(result.name).toBe('Oak Hill');
  });

  it('URL-encodes the slug', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({}));
    await fetchCemeteryBySlug('oak hill');
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/cemeteries/oak%20hill');
  });
});

// ---------------------------------------------------------------------------
// fetchCemeteryPlots
// ---------------------------------------------------------------------------
describe('fetchCemeteryPlots', () => {
  it('calls GET /api/cemeteries/:slug/plots', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse([]));
    await fetchCemeteryPlots('oak-hill');
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/cemeteries/oak-hill/plots');
  });
});

// ---------------------------------------------------------------------------
// fetchPlotDetail
// ---------------------------------------------------------------------------
describe('fetchPlotDetail', () => {
  it('calls GET /api/plots/:plotId', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ id: 'p1' }));
    await fetchPlotDetail('p1');
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/plots/p1');
  });
});

// ---------------------------------------------------------------------------
// searchBurials
// ---------------------------------------------------------------------------
describe('searchBurials', () => {
  it('builds the query string with all provided params', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ results: [] }));
    await searchBurials({ q: 'Smith', cemeterySlug: 'oak-hill', page: 2, limit: 10 });
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toContain('q=Smith');
    expect(url).toContain('cemeterySlug=oak-hill');
    expect(url).toContain('page=2');
    expect(url).toContain('limit=10');
  });

  it('omits optional params when not provided', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ results: [] }));
    await searchBurials({ q: 'Jones' });
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toContain('q=Jones');
    expect(url).not.toContain('cemeterySlug');
    expect(url).not.toContain('page');
  });
});

// ---------------------------------------------------------------------------
// login / register / fetchCurrentUser
// ---------------------------------------------------------------------------
describe('login', () => {
  it('POSTs to /api/auth/login with email and password', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ token: 'tok', user: {} }));
    await login('user@example.com', 'password123');
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    const opts = options as RequestInit;
    expect(url).toBe('/api/auth/login');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toMatchObject({
      email: 'user@example.com',
      password: 'password123',
    });
  });
});

describe('register', () => {
  it('POSTs to /api/auth/register with the registration payload', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ token: 't', user: {}, cemetery: {} }));
    await register({
      email: 'a@b.com',
      password: 'pass1234',
      name: 'Alice',
      cemeteryName: 'Oak Hill',
      cemeteryAddress: '1 Oak Ave',
      cemeteryCity: 'Springfield',
      cemeteryState: 'IL',
      cemeteryZip: '62701',
    });
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/auth/register');
  });
});

// ---------------------------------------------------------------------------
// detectCemetery
// ---------------------------------------------------------------------------
describe('detectCemetery', () => {
  it('calls GET /api/cemeteries/detect with encoded lat/lon', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ match: null, osmMatch: null }));
    await detectCemetery(39.78, -89.65);
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toContain('/api/cemeteries/detect');
    expect(url).toContain('lat=39.78');
    expect(url).toContain('lon=-89.65');
  });
});

// ---------------------------------------------------------------------------
// createCemeteryFromOsm
// ---------------------------------------------------------------------------
describe('createCemeteryFromOsm', () => {
  it('POSTs to /api/cemeteries/from-osm with osmMatch, lat, lon', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ id: 'c1' }));
    const osmMatch = { source: 'osm' as const, osmId: 'x', name: 'Test', address: null, boundary: null };
    await createCemeteryFromOsm(osmMatch, 39.78, -89.65);
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/cemeteries/from-osm');
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.lat).toBe(39.78);
    expect(body.lon).toBe(-89.65);
    expect(body.osmMatch.name).toBe('Test');
  });
});

// ---------------------------------------------------------------------------
// listCemeteries / fetchCemeteryDirectory
// ---------------------------------------------------------------------------
describe('listCemeteries', () => {
  it('calls GET /api/cemeteries', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse([]));
    await listCemeteries();
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/cemeteries');
  });
});

describe('fetchCemeteryDirectory', () => {
  it('calls GET /api/cemeteries?stats=true', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse([]));
    await fetchCemeteryDirectory();
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/cemeteries?stats=true');
  });
});

// ---------------------------------------------------------------------------
// createPlot
// ---------------------------------------------------------------------------
describe('createPlot', () => {
  it('POSTs to /api/plots with the plot data', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ id: 'p1' }));
    await createPlot({ cemeteryId: 'cem-1', lat: 39.78, lon: -89.65 });
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/plots');
    expect((options as RequestInit).method).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// uploadPhoto (FormData)
// ---------------------------------------------------------------------------
describe('uploadPhoto', () => {
  it('sends the file and metadata as FormData to /api/photos/upload', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ id: 'photo-1' }));
    const file = new File(['data'], 'headstone.jpg', { type: 'image/jpeg' });
    const metadata = {
      cemeteryId: 'cem-1',
      plotId: 'plot-1',
      exifLat: 39.78,
      exifLon: -89.65,
      exifAccuracy: 2.5,
      capturedAt: '2024-01-01T00:00:00Z',
    };

    await uploadPhoto(file, metadata);

    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/photos/upload');
    expect((options as RequestInit).method).toBe('POST');
    expect((options as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('throws on upload failure', async () => {
    vi.mocked(fetch).mockResolvedValue(errResponse(413, 'File too large'));
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await expect(
      uploadPhoto(file, {
        cemeteryId: 'c1',
        plotId: 'p1',
        exifLat: null,
        exifLon: null,
        exifAccuracy: null,
        capturedAt: null,
      }),
    ).rejects.toThrow('File too large');
  });
});

// ---------------------------------------------------------------------------
// submitPinDrop (FormData)
// ---------------------------------------------------------------------------
describe('submitPinDrop', () => {
  it('POSTs as FormData to /api/pin-drop', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ id: 'plot-1' }));
    const data = {
      cemeteryId: 'cem-1',
      lat: 39.78,
      lon: -89.65,
      gpsAccuracyMeters: 2.5,
      firstName: 'John',
      lastName: 'Doe',
    };
    await submitPinDrop(data);
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/pin-drop');
    expect((options as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('throws on pin drop failure', async () => {
    vi.mocked(fetch).mockResolvedValue(errResponse(400, 'Pin drop failed'));
    await expect(
      submitPinDrop({ cemeteryId: 'c1', lat: 0, lon: 0, gpsAccuracyMeters: 1, firstName: 'A', lastName: 'B' }),
    ).rejects.toThrow('Pin drop failed');
  });
});

// ---------------------------------------------------------------------------
// processOcr (FormData)
// ---------------------------------------------------------------------------
describe('processOcr', () => {
  it('POSTs as FormData to /api/ocr/process', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ persons: [] }));
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
    await processOcr(file, {
      cemeteryId: 'cem-1',
      exifLat: 39.78,
      exifLon: -89.65,
      exifAccuracy: 3.0,
      capturedAt: null,
    });
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/ocr/process');
    expect((options as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('omits null GPS fields from the FormData', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ persons: [] }));
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
    await processOcr(file, {
      cemeteryId: 'cem-1',
      exifLat: null,
      exifLon: null,
      exifAccuracy: null,
      capturedAt: null,
    });
    const [, options] = vi.mocked(fetch).mock.calls[0]!;
    const body = (options as RequestInit).body as FormData;
    expect(body.get('exifLat')).toBeNull();
    expect(body.get('exifLon')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// contributeProcess (FormData, no auth)
// ---------------------------------------------------------------------------
describe('contributeProcess', () => {
  it('POSTs as FormData to /api/contribute/process without auth headers', async () => {
    localStorage.setItem('scythe_token', 'my-jwt');
    vi.mocked(fetch).mockResolvedValue(okResponse({ photoId: 'p1' }));
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
    await contributeProcess(file, {
      exifLat: 39.78,
      exifLon: -89.65,
      exifAccuracy: null,
      capturedAt: null,
    });
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/contribute/process');
    // Public endpoint — no Authorization header
    expect((options as RequestInit).headers).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// contributeSubmit
// ---------------------------------------------------------------------------
describe('contributeSubmit', () => {
  it('POSTs to /api/contribute/submit', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ success: true }));
    await contributeSubmit({
      photoId: 'ph1',
      lat: 39.78,
      lon: -89.65,
      persons: [{ firstName: 'Jane', lastName: 'Doe' }],
    });
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/contribute/submit');
  });
});

// ---------------------------------------------------------------------------
// CSV import endpoints
// ---------------------------------------------------------------------------
describe('parseCsvHeaders', () => {
  it('POSTs to /api/csv-import/parse-headers', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ headers: ['First Name', 'Last Name'] }));
    await parseCsvHeaders('First Name,Last Name\nJohn,Smith');
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/csv-import/parse-headers');
  });
});

describe('validateCsvImport', () => {
  it('POSTs to /api/csv-import/validate', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ valid: true }));
    await validateCsvImport('csv', { 'First Name': 'firstName' });
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/csv-import/validate');
  });
});

describe('executeCsvImport', () => {
  it('POSTs to /api/csv-import/execute with all required fields', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ jobId: 'j1' }));
    await executeCsvImport('csv', { 'First Name': 'firstName' }, 'cem-1', 'import.csv');
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/csv-import/execute');
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.cemeteryId).toBe('cem-1');
    expect(body.fileName).toBe('import.csv');
  });
});

// ---------------------------------------------------------------------------
// Admin submission endpoints
// ---------------------------------------------------------------------------
describe('fetchPendingSubmissions', () => {
  it('calls GET /api/admin/submissions?page=1 by default', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ submissions: [] }));
    await fetchPendingSubmissions();
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/submissions?page=1');
  });
});

describe('getPendingCount', () => {
  it('calls GET /api/admin/submissions/count', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ count: 5 }));
    const result = await getPendingCount();
    expect(result.count).toBe(5);
  });
});

describe('approveSubmission', () => {
  it('PATCHes /api/admin/submissions/:id/approve', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ ok: true }));
    await approveSubmission('person-1');
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/submissions/person-1/approve');
    expect((options as RequestInit).method).toBe('PATCH');
  });
});

describe('rejectSubmission', () => {
  it('PATCHes /api/admin/submissions/:id/reject', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ ok: true }));
    await rejectSubmission('person-1');
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/submissions/person-1/reject');
  });
});

describe('editApproveSubmission', () => {
  it('PATCHes /api/admin/submissions/:id/edit-approve with data', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ ok: true }));
    await editApproveSubmission('person-1', { firstName: 'John' });
    const [url, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/submissions/person-1/edit-approve');
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.firstName).toBe('John');
  });
});

// ---------------------------------------------------------------------------
// confirmOcr
// ---------------------------------------------------------------------------
describe('confirmOcr', () => {
  it('POSTs to /api/ocr/confirm with the confirm payload', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse({ plotId: 'p1' }));
    await confirmOcr({
      cemeteryId: 'cem-1',
      photoId: 'photo-1',
      persons: [{ firstName: 'Jane', lastName: 'Doe' }],
    });
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/ocr/confirm');
  });
});
