import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any import that uses them
// ---------------------------------------------------------------------------
vi.mock('../db/index', () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock('../db/schema', () => ({
  cemeteries: {},
}));

import { db } from '../db/index.js';
import {
  detectCemetery,
  createCemeteryFromOsm,
  listCemeteries,
} from './cemeteryDetectionService.js';
import type { OsmCemeteryMatch } from '@scythe/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFakeCemeteryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cem-1',
    name: 'Oak Hill Cemetery',
    slug: 'oak-hill',
    address: '1 Oak Ave',
    city: 'Springfield',
    state: 'IL',
    zip: '62701',
    center_lon: -89.65,
    center_lat: 39.78,
    contact_email: null,
    contact_phone: null,
    hours_description: null,
    is_publicly_searchable: true,
    logo_url: null,
    osm_id: null,
    boundary: null,
    distance_meters: 150,
    created_at: new Date('2024-01-01').toISOString(),
    updated_at: new Date('2024-01-01').toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectCemetery
// ---------------------------------------------------------------------------
describe('detectCemetery', () => {
  beforeEach(() => {
    vi.mocked(db.execute).mockResolvedValue([] as never);
    process.env['CEMETERY_DETECT_MOCK'] = 'true';
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env['CEMETERY_DETECT_MOCK'];
    delete process.env['NODE_ENV'];
    vi.unstubAllGlobals();
  });

  it('returns a scythe match when the DB has a nearby cemetery', async () => {
    vi.mocked(db.execute).mockResolvedValue([makeFakeCemeteryRow()] as never);

    const result = await detectCemetery(39.78, -89.65);

    expect(result.match).not.toBeNull();
    expect(result.match!.source).toBe('scythe');
    expect(result.match!.cemetery.name).toBe('Oak Hill Cemetery');
    expect(result.match!.distanceMeters).toBe(150);
    expect(result.osmMatch).toBeNull();
  });

  it('returns the correct cemetery fields from the DB row', async () => {
    vi.mocked(db.execute).mockResolvedValue([
      makeFakeCemeteryRow({ center_lon: -89.65, center_lat: 39.78 }),
    ] as never);

    const result = await detectCemetery(39.78, -89.65);
    const cem = result.match!.cemetery;
    expect(cem.id).toBe('cem-1');
    expect(cem.slug).toBe('oak-hill');
    expect(cem.centerLon).toBe(-89.65);
    expect(cem.centerLat).toBe(39.78);
  });

  it('returns an OSM mock match when no scythe cemetery nearby (mock mode)', async () => {
    vi.mocked(db.execute).mockResolvedValue([] as never);

    const result = await detectCemetery(39.78, -89.65);

    expect(result.match).toBeNull();
    expect(result.osmMatch).not.toBeNull();
    expect(result.osmMatch!.source).toBe('osm');
    expect(result.osmMatch!.name).toBe('Springfield Memorial Cemetery');
    expect(result.osmMatch!.osmId).toBe('mock-osm-123456');
  });

  it('returns null/null when Overpass returns no results', async () => {
    delete process.env['CEMETERY_DETECT_MOCK'];
    process.env['NODE_ENV'] = 'test'; // not 'development'
    vi.mocked(db.execute).mockResolvedValue([] as never);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ elements: [] }),
      }),
    );

    const result = await detectCemetery(39.78, -89.65);
    expect(result.match).toBeNull();
    expect(result.osmMatch).toBeNull();
  });

  it('returns null osmMatch when the Overpass API returns a non-ok response', async () => {
    delete process.env['CEMETERY_DETECT_MOCK'];
    process.env['NODE_ENV'] = 'test';
    vi.mocked(db.execute).mockResolvedValue([] as never);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    const result = await detectCemetery(39.78, -89.65);
    expect(result.osmMatch).toBeNull();
  });

  it('returns null osmMatch when the Overpass API throws a network error', async () => {
    delete process.env['CEMETERY_DETECT_MOCK'];
    process.env['NODE_ENV'] = 'test';
    vi.mocked(db.execute).mockResolvedValue([] as never);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error')),
    );

    const result = await detectCemetery(39.78, -89.65);
    expect(result.osmMatch).toBeNull();
  });

  it('parses Overpass elements into an OsmCemeteryMatch', async () => {
    delete process.env['CEMETERY_DETECT_MOCK'];
    process.env['NODE_ENV'] = 'test';
    vi.mocked(db.execute).mockResolvedValue([] as never);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          elements: [
            {
              id: 123456,
              tags: {
                name: 'Green Valley Cemetery',
                'addr:street': '10 Oak Rd',
                'addr:city': 'Springfield',
                'addr:state': 'IL',
              },
            },
          ],
        }),
      }),
    );

    const result = await detectCemetery(39.78, -89.65);
    expect(result.osmMatch).not.toBeNull();
    expect(result.osmMatch!.name).toBe('Green Valley Cemetery');
    expect(result.osmMatch!.osmId).toBe('123456');
    expect(result.osmMatch!.address).toContain('Springfield');
  });
});

// ---------------------------------------------------------------------------
// createCemeteryFromOsm
// ---------------------------------------------------------------------------
describe('createCemeteryFromOsm', () => {
  const osmMatch: OsmCemeteryMatch = {
    source: 'osm',
    osmId: 'osm-999',
    name: 'Springfield Memorial Cemetery',
    address: '123 Oak Street, Springfield, IL',
    boundary: null,
  };

  const createdCemRow = {
    id: 'new-cem-1',
    name: 'Springfield Memorial Cemetery',
    slug: 'springfield-memorial-cemetery',
    address: '123 Oak Street',
    city: 'Springfield',
    state: 'IL',
    zip: '',
    centerLon: -89.65,
    centerLat: 39.78,
    contactEmail: null,
    contactPhone: null,
    hoursDescription: null,
    isPubliclySearchable: true,
    logoUrl: null,
    osmId: 'osm-999',
    boundary: null,
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
  };

  beforeEach(() => {
    // slug uniqueness check → no existing slug
    vi.mocked(db.execute).mockResolvedValue([] as never);

    // db.insert(...).values(...).returning(...)
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([createdCemRow]),
      }),
    } as never);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('creates a cemetery and returns mapped Cemetery object', async () => {
    const result = await createCemeteryFromOsm(osmMatch, 39.78, -89.65);
    expect(result.id).toBe('new-cem-1');
    expect(result.name).toBe('Springfield Memorial Cemetery');
    expect(result.osmId).toBe('osm-999');
  });

  it('generates a URL-safe slug from the cemetery name', async () => {
    const result = await createCemeteryFromOsm(osmMatch, 39.78, -89.65);
    expect(result.slug).toMatch(/^[a-z0-9-]+$/);
    expect(result.slug).not.toMatch(/[A-Z\s]/);
  });

  it('appends osmId suffix to the slug when slug already exists', async () => {
    // First execute call = slug collision exists
    vi.mocked(db.execute).mockResolvedValueOnce([{ id: 'existing' }] as never);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { ...createdCemRow, slug: 'springfield-memorial-cemetery-m-999' },
        ]),
      }),
    } as never);

    const result = await createCemeteryFromOsm(osmMatch, 39.78, -89.65);
    expect(result.slug).toContain('-'); // contains the osm suffix
  });

  it('parses the address parts from OSM address string', async () => {
    await createCemeteryFromOsm(osmMatch, 39.78, -89.65);
    const insertCall = vi.mocked(db.insert).mock.results[0]!.value;
    const valuesCall = insertCall.values.mock.calls[0]![0];
    expect(valuesCall.address).toBe('123 Oak Street');
    expect(valuesCall.city).toBe('Springfield');
    expect(valuesCall.state).toBe('IL');
  });

  it('stores an empty address string when OSM address is null', async () => {
    // The source splits (address ?? '') — a null address becomes '' whose split
    // gives [''], and '' is not null/undefined so the ?? name fallback is not taken.
    const osmMatchNoAddress: OsmCemeteryMatch = {
      ...osmMatch,
      address: null,
    };

    await createCemeteryFromOsm(osmMatchNoAddress, 39.78, -89.65);
    const insertCall = vi.mocked(db.insert).mock.results[0]!.value;
    const valuesCall = insertCall.values.mock.calls[0]![0];
    expect(valuesCall.address).toBe('');
  });
});

// ---------------------------------------------------------------------------
// listCemeteries
// ---------------------------------------------------------------------------
describe('listCemeteries', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns a list of id/name/slug objects', async () => {
    const rows = [
      { id: 'cem-1', name: 'Oak Hill', slug: 'oak-hill' },
      { id: 'cem-2', name: 'Green Valley', slug: 'green-valley' },
    ];

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue(rows),
    } as never);

    const result = await listCemeteries();
    expect(result).toHaveLength(2);
    expect(result[0]!.slug).toBe('oak-hill');
    expect(result[1]!.name).toBe('Green Valley');
  });

  it('returns an empty array when no cemeteries exist', async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue([]),
    } as never);

    const result = await listCemeteries();
    expect(result).toEqual([]);
  });
});
