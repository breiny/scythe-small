import { db } from '../db/index';
import { cemeteries } from '../db/schema';
import { sql } from 'drizzle-orm';
import type {
  CemeteryDetectResponse,
  OsmCemeteryMatch,
  Cemetery,
} from '@scythe/shared';

const DETECTION_RADIUS_METERS = 500;

/**
 * Layer 1: Query PostGIS for existing Scythe cemeteries within 500m.
 * Uses ST_DWithin with geography cast for meter-based distance.
 */
async function findScytheCemetery(
  lat: number,
  lon: number,
): Promise<{ cemetery: Cemetery; distanceMeters: number } | null> {
  const results = await db.execute(sql`
    SELECT *,
      ST_Distance(
        ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326)::geography
      ) AS distance_meters
    FROM cemeteries
    WHERE center_lon IS NOT NULL
      AND center_lat IS NOT NULL
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326)::geography,
        ${DETECTION_RADIUS_METERS}
      )
    ORDER BY distance_meters ASC
    LIMIT 1
  `);

  if (results.length === 0) return null;

  const row = results[0] as Record<string, unknown>;
  return {
    cemetery: mapRowToCemetery(row),
    distanceMeters: Number(row.distance_meters),
  };
}

/**
 * Layer 2: Query Overpass API for OSM landuse=cemetery polygon containing the point.
 */
async function findOsmCemetery(
  lat: number,
  lon: number,
): Promise<OsmCemeteryMatch | null> {
  const query = `[out:json];is_in(${lat},${lon})->.a;area.a[landuse=cemetery];out tags;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = (await res.json()) as {
      elements?: Array<{
        id: number;
        tags?: Record<string, string>;
      }>;
    };

    if (!data.elements || data.elements.length === 0) return null;

    const element = data.elements[0]!;
    const tags = element.tags ?? {};

    const name = tags.name ?? 'Unknown Cemetery';
    const address = [tags['addr:street'], tags['addr:city'], tags['addr:state']]
      .filter(Boolean)
      .join(', ') || null;

    return {
      source: 'osm',
      osmId: String(element.id),
      name,
      address,
      boundary: null, // Overpass is_in doesn't return geometry; would need a separate query
    };
  } catch {
    return null;
  }
}

/**
 * Mock mode: returns a fake OSM cemetery for local development.
 */
function getMockOsmCemetery(lat: number, lon: number): OsmCemeteryMatch {
  return {
    source: 'osm',
    osmId: 'mock-osm-123456',
    name: 'Springfield Memorial Cemetery',
    address: '123 Oak Street, Springfield, IL',
    boundary: JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [
          [lon - 0.002, lat - 0.002],
          [lon + 0.002, lat - 0.002],
          [lon + 0.002, lat + 0.002],
          [lon - 0.002, lat + 0.002],
          [lon - 0.002, lat - 0.002],
        ],
      ],
    }),
  };
}

/**
 * Main detection function: layered strategy.
 * 1. Check Scythe DB (PostGIS)
 * 2. Check Overpass API (OSM)
 * 3. Return null for manual entry
 */
export async function detectCemetery(
  lat: number,
  lon: number,
): Promise<CemeteryDetectResponse> {
  // Layer 1: Scythe DB
  const scytheMatch = await findScytheCemetery(lat, lon);
  if (scytheMatch) {
    return {
      match: {
        source: 'scythe',
        cemetery: scytheMatch.cemetery,
        distanceMeters: scytheMatch.distanceMeters,
      },
      osmMatch: null,
    };
  }

  // Layer 2: OSM / Overpass
  const useMock =
    process.env.CEMETERY_DETECT_MOCK === 'true' ||
    process.env.NODE_ENV === 'development';

  const osmMatch = useMock
    ? getMockOsmCemetery(lat, lon)
    : await findOsmCemetery(lat, lon);

  if (osmMatch) {
    return { match: null, osmMatch };
  }

  // Layer 3: No match
  return { match: null, osmMatch: null };
}

/**
 * Create a cemetery from an OSM detection result.
 */
export async function createCemeteryFromOsm(
  osmMatch: OsmCemeteryMatch,
  lat: number,
  lon: number,
): Promise<Cemetery> {
  const slug = osmMatch.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Ensure unique slug by appending osmId suffix if needed
  const existing = await db.execute(
    sql`SELECT id FROM cemeteries WHERE slug = ${slug} LIMIT 1`,
  );

  const finalSlug =
    existing.length > 0 ? `${slug}-${osmMatch.osmId.slice(-6)}` : slug;

  // Parse address parts
  const addressParts = (osmMatch.address ?? '').split(',').map((s) => s.trim());
  const street = addressParts[0] ?? osmMatch.name;
  const city = addressParts[1] ?? '';
  const state = addressParts[2] ?? '';

  const [cemetery] = await db
    .insert(cemeteries)
    .values({
      name: osmMatch.name,
      slug: finalSlug,
      address: street,
      city,
      state,
      zip: '',
      centerLon: lon,
      centerLat: lat,
      osmId: osmMatch.osmId,
      boundary: osmMatch.boundary,
      isPubliclySearchable: true,
    })
    .returning();

  return mapRowToCemetery(cemetery as Record<string, unknown>);
}

/**
 * List all cemeteries (for dropdown fallback).
 */
export async function listCemeteries(): Promise<
  Array<{ id: string; name: string; slug: string }>
> {
  const results = await db
    .select({
      id: cemeteries.id,
      name: cemeteries.name,
      slug: cemeteries.slug,
    })
    .from(cemeteries);

  return results;
}

function mapRowToCemetery(row: Record<string, unknown>): Cemetery {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    address: row.address as string,
    city: row.city as string,
    state: row.state as string,
    zip: row.zip as string,
    centerLon: (row.center_lon ?? row.centerLon ?? null) as number | null,
    centerLat: (row.center_lat ?? row.centerLat ?? null) as number | null,
    contactEmail: (row.contact_email ?? row.contactEmail ?? null) as
      | string
      | null,
    contactPhone: (row.contact_phone ?? row.contactPhone ?? null) as
      | string
      | null,
    hoursDescription: (row.hours_description ?? row.hoursDescription ?? null) as
      | string
      | null,
    isPubliclySearchable: (row.is_publicly_searchable ??
      row.isPubliclySearchable ??
      true) as boolean,
    logoUrl: (row.logo_url ?? row.logoUrl ?? null) as string | null,
    osmId: (row.osm_id ?? row.osmId ?? null) as string | null,
    boundary: (row.boundary ?? null) as string | null,
    createdAt: new Date(row.created_at as string ?? row.createdAt as string),
    updatedAt: new Date(row.updated_at as string ?? row.updatedAt as string),
  };
}
