import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that use them
// ---------------------------------------------------------------------------
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
  },
}));

const mockSharpInstance = {
  jpeg: vi.fn().mockReturnThis(),
  resize: vi.fn().mockReturnThis(),
  toFile: vi.fn().mockResolvedValue(undefined),
  toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-image')),
};

vi.mock('sharp', () => ({
  default: vi.fn(() => mockSharpInstance),
}));

vi.mock('../db/index', () => ({
  db: {
    insert: vi.fn(),
  },
}));

vi.mock('../db/schema', () => ({
  headstonePhotos: {},
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
import fs from 'fs/promises';
import sharp from 'sharp';
import { db } from '../db/index.js';
import {
  savePhoto,
  savePhotoForOcr,
  readPhotoBuffer,
  TEST_USER_ID,
} from './photoService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockDbInsert(returnRecord: Record<string, unknown>) {
  vi.mocked(db.insert).mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([returnRecord]),
    }),
  } as never);
}

// ---------------------------------------------------------------------------
// TEST_USER_ID constant
// ---------------------------------------------------------------------------
describe('TEST_USER_ID', () => {
  it('is a valid UUID-format string', () => {
    expect(TEST_USER_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

// ---------------------------------------------------------------------------
// readPhotoBuffer
// ---------------------------------------------------------------------------
describe('readPhotoBuffer', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('reads the file at the resolved path and returns a Buffer', async () => {
    const fakeData = Buffer.from('binary-image-data');
    vi.mocked(fs.readFile).mockResolvedValue(fakeData);

    const result = await readPhotoBuffer('/uploads/originals/photo.jpg');

    expect(fs.readFile).toHaveBeenCalledOnce();
    expect(result).toBe(fakeData);
  });

  it('propagates errors from fs.readFile', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    await expect(readPhotoBuffer('/uploads/missing.jpg')).rejects.toThrow('ENOENT');
  });
});

// ---------------------------------------------------------------------------
// savePhotoForOcr
// ---------------------------------------------------------------------------
describe('savePhotoForOcr', () => {
  const baseParams = {
    filePath: '/tmp/upload-123.jpg',
    originalName: 'headstone.jpg',
    cemeteryId: 'cem-1',
    exifLat: 39.78,
    exifLon: -89.65,
    exifAccuracy: 2.5,
    capturedAt: '2024-06-01T10:30:00Z',
  };

  beforeEach(() => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
    vi.mocked(mockSharpInstance.toFile).mockResolvedValue(undefined);
    // Restore sharp mock chain per test (methods return this)
    mockSharpInstance.jpeg.mockReturnThis();
    mockSharpInstance.resize.mockReturnThis();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('creates the uploads directories before processing', async () => {
    await savePhotoForOcr(baseParams);
    expect(fs.mkdir).toHaveBeenCalledTimes(2);
  });

  it('renames the uploaded file for a non-HEIC image', async () => {
    await savePhotoForOcr(baseParams);
    expect(fs.rename).toHaveBeenCalledOnce();
  });

  it('returns photoUrl and thumbnailUrl paths', async () => {
    const result = await savePhotoForOcr(baseParams);
    expect(result.photoUrl).toMatch(/^\/uploads\/originals\/.+\.jpg$/);
    expect(result.thumbnailUrl).toMatch(/^\/uploads\/thumbnails\/.+_thumb\.jpg$/);
  });

  it('returns the EXIF and cemetery metadata unchanged', async () => {
    const result = await savePhotoForOcr(baseParams);
    expect(result.exifLat).toBe(39.78);
    expect(result.exifLon).toBe(-89.65);
    expect(result.exifAccuracy).toBe(2.5);
    expect(result.capturedAt).toBe('2024-06-01T10:30:00Z');
    expect(result.cemeteryId).toBe('cem-1');
  });

  it('uses Sharp to generate a thumbnail', async () => {
    await savePhotoForOcr(baseParams);
    expect(sharp).toHaveBeenCalled();
    expect(mockSharpInstance.resize).toHaveBeenCalled();
    expect(mockSharpInstance.toFile).toHaveBeenCalled();
  });

  it('converts HEIC files to JPEG instead of renaming', async () => {
    const heicParams = { ...baseParams, originalName: 'photo.heic' };
    await savePhotoForOcr(heicParams);
    // For HEIC: sharp conversion is called (toFile), rename is NOT called
    expect(fs.rename).not.toHaveBeenCalled();
    // unlink is called to clean up the temp HEIC file
    expect(fs.unlink).toHaveBeenCalled();
  });

  it('returns a photoUrl with .jpg extension even for HEIC input', async () => {
    const heicParams = { ...baseParams, originalName: 'photo.heic' };
    const result = await savePhotoForOcr(heicParams);
    expect(result.photoUrl).toMatch(/\.jpg$/);
  });
});

// ---------------------------------------------------------------------------
// savePhoto
// ---------------------------------------------------------------------------
describe('savePhoto', () => {
  const baseParams = {
    filePath: '/tmp/upload-456.jpg',
    originalName: 'headstone.jpg',
    cemeteryId: 'cem-1',
    plotId: 'plot-1',
    exifLat: 39.78,
    exifLon: -89.65,
    exifAccuracy: 2.5,
    capturedAt: '2024-06-01T10:30:00Z',
  };

  const fakeRecord = {
    id: 'photo-uuid',
    plotId: 'plot-1',
    cemeteryId: 'cem-1',
    photoUrl: '/uploads/originals/photo.jpg',
    thumbnailUrl: '/uploads/thumbnails/photo_thumb.jpg',
  };

  beforeEach(() => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);
    mockSharpInstance.jpeg.mockReturnThis();
    mockSharpInstance.resize.mockReturnThis();
    vi.mocked(mockSharpInstance.toFile).mockResolvedValue(undefined);
    mockDbInsert(fakeRecord);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('inserts a record into the database and returns it', async () => {
    const result = await savePhoto(baseParams);
    expect(db.insert).toHaveBeenCalledOnce();
    expect(result).toEqual(fakeRecord);
  });

  it('passes TEST_USER_ID as the uploadedBy value', async () => {
    await savePhoto(baseParams);
    const insertCall = vi.mocked(db.insert).mock.results[0]!.value;
    const valuesCall = insertCall.values.mock.calls[0]![0];
    expect(valuesCall.uploadedBy).toBe(TEST_USER_ID);
  });

  it('stores null capturedAt in the DB when capturedAt param is null', async () => {
    await savePhoto({ ...baseParams, capturedAt: null });
    const insertCall = vi.mocked(db.insert).mock.results[0]!.value;
    const valuesCall = insertCall.values.mock.calls[0]![0];
    expect(valuesCall.capturedAt).toBeNull();
  });

  it('converts capturedAt string to a Date object for the DB', async () => {
    await savePhoto(baseParams);
    const insertCall = vi.mocked(db.insert).mock.results[0]!.value;
    const valuesCall = insertCall.values.mock.calls[0]![0];
    expect(valuesCall.capturedAt).toBeInstanceOf(Date);
  });
});
