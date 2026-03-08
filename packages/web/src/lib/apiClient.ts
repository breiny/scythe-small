import type {
  PhotoUploadMetadata,
  ManualPinDrop,
  RegisterInput,
  CemeteryDetectResponse,
  OsmCemeteryMatch,
  Cemetery,
} from '@scythe/shared';

const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('scythe_token');
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

async function postJson(url: string, data: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function uploadPhoto(file: File, metadata: PhotoUploadMetadata) {
  const formData = new FormData();
  formData.append('photo', file);
  formData.append('metadata', JSON.stringify(metadata));

  const res = await fetch(`${API_BASE}/photos/upload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(body.error ?? `Upload failed: ${res.status}`);
  }

  return res.json();
}

export async function createPlot(data: {
  cemeteryId: string;
  plotNumber?: string;
  section?: string;
  lon?: number;
  lat?: number;
  gpsAccuracyMeters?: number;
  gpsSource?: string;
  status?: string;
}) {
  return postJson(`${API_BASE}/plots`, data);
}

export async function fetchCemeteryBySlug(slug: string) {
  return fetchJson(`${API_BASE}/cemeteries/${encodeURIComponent(slug)}`);
}

export async function fetchCemeteryPlots(slug: string) {
  return fetchJson(`${API_BASE}/cemeteries/${encodeURIComponent(slug)}/plots`);
}

export async function fetchPlotDetail(plotId: string) {
  return fetchJson(`${API_BASE}/plots/${encodeURIComponent(plotId)}`);
}

export async function searchBurials(params: {
  q: string;
  cemeterySlug?: string;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set('q', params.q);
  if (params.cemeterySlug) searchParams.set('cemeterySlug', params.cemeterySlug);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  return fetchJson(`${API_BASE}/search?${searchParams.toString()}`);
}

// Auth
export async function login(email: string, password: string) {
  return postJson(`${API_BASE}/auth/login`, { email, password });
}

export async function fetchCurrentUser() {
  return fetchJson(`${API_BASE}/auth/me`);
}

export async function register(data: RegisterInput) {
  return postJson(`${API_BASE}/auth/register`, data);
}

// Manual pin drop
export async function submitPinDrop(data: ManualPinDrop, photo?: File) {
  const formData = new FormData();
  formData.append('data', JSON.stringify(data));
  if (photo) {
    formData.append('photo', photo);
  }

  const res = await fetch(`${API_BASE}/pin-drop`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Pin drop failed' }));
    throw new Error(body.error ?? `Pin drop failed: ${res.status}`);
  }

  return res.json();
}

// CSV Import
export async function parseCsvHeaders(csvText: string) {
  return postJson(`${API_BASE}/csv-import/parse-headers`, { csvText });
}

export async function validateCsvImport(csvText: string, mapping: Record<string, string>) {
  return postJson(`${API_BASE}/csv-import/validate`, { csvText, mapping });
}

export async function executeCsvImport(
  csvText: string,
  mapping: Record<string, string>,
  cemeteryId: string,
  fileName: string,
) {
  return postJson(`${API_BASE}/csv-import/execute`, {
    csvText,
    mapping,
    cemeteryId,
    fileName,
  });
}

// Cemetery detection
export async function detectCemetery(
  lat: number,
  lon: number,
): Promise<CemeteryDetectResponse> {
  return fetchJson(
    `${API_BASE}/cemeteries/detect?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
  );
}

export async function createCemeteryFromOsm(
  osmMatch: OsmCemeteryMatch,
  lat: number,
  lon: number,
): Promise<Cemetery> {
  return postJson(`${API_BASE}/cemeteries/from-osm`, { osmMatch, lat, lon });
}

export async function listCemeteries(): Promise<
  Array<{ id: string; name: string; slug: string }>
> {
  return fetchJson(`${API_BASE}/cemeteries`);
}

export interface DirectoryCemetery {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  centerLat: number | null;
  centerLon: number | null;
  plotCount: number;
}

export async function fetchCemeteryDirectory(): Promise<DirectoryCemetery[]> {
  return fetchJson(`${API_BASE}/cemeteries?stats=true`);
}

// OCR
export async function processOcr(
  file: File,
  metadata: {
    cemeteryId: string;
    exifLat: number | null;
    exifLon: number | null;
    exifAccuracy: number | null;
    capturedAt: string | null;
  },
) {
  const formData = new FormData();
  formData.append('photo', file);
  formData.append('cemeteryId', metadata.cemeteryId);
  if (metadata.exifLat != null) formData.append('exifLat', String(metadata.exifLat));
  if (metadata.exifLon != null) formData.append('exifLon', String(metadata.exifLon));
  if (metadata.exifAccuracy != null)
    formData.append('exifAccuracy', String(metadata.exifAccuracy));
  if (metadata.capturedAt) formData.append('capturedAt', metadata.capturedAt);

  const res = await fetch(`${API_BASE}/ocr/process`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'OCR processing failed' }));
    throw new Error(body.error ?? `OCR failed: ${res.status}`);
  }

  return res.json();
}

// Public contribution
export async function contributeProcess(
  file: File,
  metadata: {
    exifLat: number;
    exifLon: number;
    exifAccuracy: number | null;
    capturedAt: string | null;
  },
) {
  const formData = new FormData();
  formData.append('photo', file);
  formData.append('exifLat', String(metadata.exifLat));
  formData.append('exifLon', String(metadata.exifLon));
  if (metadata.exifAccuracy != null)
    formData.append('exifAccuracy', String(metadata.exifAccuracy));
  if (metadata.capturedAt) formData.append('capturedAt', metadata.capturedAt);

  const res = await fetch(`${API_BASE}/contribute/process`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Processing failed' }));
    throw new Error(body.error ?? `Processing failed: ${res.status}`);
  }

  return res.json();
}

export async function contributeSubmit(data: {
  photoId: string;
  cemeteryId?: string;
  lat: number;
  lon: number;
  gpsAccuracyMeters?: number;
  persons: Array<{
    firstName: string;
    middleName?: string;
    lastName: string;
    maidenName?: string;
    dateOfBirth?: string;
    dateOfDeath?: string;
    inscription?: string;
  }>;
  submittedBy?: string;
}) {
  return postJson(`${API_BASE}/contribute/submit`, data);
}

// Admin submissions
export async function fetchPendingSubmissions(page = 1) {
  return fetchJson(`${API_BASE}/admin/submissions?page=${page}`);
}

export async function getPendingCount(): Promise<{ count: number }> {
  return fetchJson(`${API_BASE}/admin/submissions/count`);
}

async function patchJson(url: string, data?: unknown) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function approveSubmission(personId: string) {
  return patchJson(`${API_BASE}/admin/submissions/${personId}/approve`);
}

export async function rejectSubmission(personId: string) {
  return patchJson(`${API_BASE}/admin/submissions/${personId}/reject`);
}

export async function editApproveSubmission(
  personId: string,
  data: Record<string, string | undefined>,
) {
  return patchJson(`${API_BASE}/admin/submissions/${personId}/edit-approve`, data);
}

export async function confirmOcr(data: {
  cemeteryId: string;
  photoId: string;
  section?: string;
  plotNumber?: string;
  lat?: number;
  lon?: number;
  gpsAccuracyMeters?: number;
  gpsSource?: string;
  persons: Array<{
    firstName: string;
    middleName?: string;
    lastName: string;
    maidenName?: string;
    dateOfBirth?: string;
    dateOfDeath?: string;
    inscription?: string;
  }>;
}) {
  return postJson(`${API_BASE}/ocr/confirm`, data);
}
