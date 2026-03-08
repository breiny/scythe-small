import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock exifr before importing the module under test
// ---------------------------------------------------------------------------
vi.mock('exifr', () => ({
  default: {
    parse: vi.fn(),
  },
}));

import exifr from 'exifr';
import { extractExifData } from './exif.js';

const mockParse = vi.mocked(exifr.parse);

// A minimal File-like object for tests
function makeFile(name = 'photo.jpg'): File {
  return new File(['data'], name, { type: 'image/jpeg' });
}

afterEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// extractExifData
// ---------------------------------------------------------------------------
describe('extractExifData', () => {
  it('returns all nulls when exifr returns null (no EXIF data)', async () => {
    mockParse.mockResolvedValue(null);

    const result = await extractExifData(makeFile());

    expect(result).toEqual({
      lat: null,
      lon: null,
      accuracy: null,
      capturedAt: null,
      deviceMake: null,
      deviceModel: null,
    });
  });

  it('maps GPS coordinates from exifr output', async () => {
    mockParse.mockResolvedValue({
      latitude: 39.7817,
      longitude: -89.6501,
      GPSHPositioningError: 3.2,
      DateTimeOriginal: new Date('2024-06-01T10:30:00Z'),
      Make: 'Apple',
      Model: 'iPhone 15',
    });

    const result = await extractExifData(makeFile());

    expect(result.lat).toBe(39.7817);
    expect(result.lon).toBe(-89.6501);
    expect(result.accuracy).toBe(3.2);
    expect(result.deviceMake).toBe('Apple');
    expect(result.deviceModel).toBe('iPhone 15');
  });

  it('converts DateTimeOriginal to an ISO string', async () => {
    const date = new Date('2024-06-01T10:30:00.000Z');
    mockParse.mockResolvedValue({
      latitude: 39.78,
      longitude: -89.65,
      GPSHPositioningError: null,
      DateTimeOriginal: date,
      Make: null,
      Model: null,
    });

    const result = await extractExifData(makeFile());

    expect(result.capturedAt).toBe(date.toISOString());
  });

  it('returns null for capturedAt when DateTimeOriginal is absent', async () => {
    mockParse.mockResolvedValue({
      latitude: 39.78,
      longitude: -89.65,
      GPSHPositioningError: null,
      DateTimeOriginal: undefined,
      Make: 'Samsung',
      Model: 'Galaxy S24',
    });

    const result = await extractExifData(makeFile());

    expect(result.capturedAt).toBeNull();
  });

  it('returns null for GPS fields when they are absent', async () => {
    mockParse.mockResolvedValue({
      latitude: undefined,
      longitude: undefined,
      GPSHPositioningError: undefined,
      DateTimeOriginal: undefined,
      Make: undefined,
      Model: undefined,
    });

    const result = await extractExifData(makeFile());

    expect(result.lat).toBeNull();
    expect(result.lon).toBeNull();
    expect(result.accuracy).toBeNull();
    expect(result.deviceMake).toBeNull();
    expect(result.deviceModel).toBeNull();
  });

  it('returns all nulls when exifr throws an error', async () => {
    mockParse.mockRejectedValue(new Error('Invalid EXIF data'));

    const result = await extractExifData(makeFile());

    expect(result).toEqual({
      lat: null,
      lon: null,
      accuracy: null,
      capturedAt: null,
      deviceMake: null,
      deviceModel: null,
    });
  });

  it('passes the file to exifr.parse with the correct options', async () => {
    mockParse.mockResolvedValue(null);
    const file = makeFile('headstone.jpg');

    await extractExifData(file);

    expect(mockParse).toHaveBeenCalledOnce();
    const [passedFile, options] = mockParse.mock.calls[0]!;
    expect(passedFile).toBe(file);
    expect(options).toMatchObject({ gps: true });
  });
});
