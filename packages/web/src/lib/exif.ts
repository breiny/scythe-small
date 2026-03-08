import exifr from 'exifr';
import type { ExifData } from '@scythe/shared';

export async function extractExifData(file: File): Promise<ExifData> {
  try {
    const exif = await exifr.parse(file, {
      gps: true,
      pick: [
        'GPSLatitude',
        'GPSLatitudeRef',
        'GPSLongitude',
        'GPSLongitudeRef',
        'GPSHPositioningError',
        'DateTimeOriginal',
        'Make',
        'Model',
      ],
    });

    if (!exif) {
      return {
        lat: null,
        lon: null,
        accuracy: null,
        capturedAt: null,
        deviceMake: null,
        deviceModel: null,
      };
    }

    return {
      lat: exif.latitude ?? null,
      lon: exif.longitude ?? null,
      accuracy: exif.GPSHPositioningError ?? null,
      capturedAt: exif.DateTimeOriginal
        ? new Date(exif.DateTimeOriginal).toISOString()
        : null,
      deviceMake: exif.Make ?? null,
      deviceModel: exif.Model ?? null,
    };
  } catch {
    return {
      lat: null,
      lon: null,
      accuracy: null,
      capturedAt: null,
      deviceMake: null,
      deviceModel: null,
    };
  }
}
