import { useState, useRef } from 'react';
import { extractExifData } from '@web/lib/exif';
import { GpsAccuracyBadge } from '@web/components/GpsAccuracyBadge';
import { MAX_PHOTOS_PER_HEADSTONE } from '@scythe/shared';
import type { ExifData } from '@scythe/shared';

export interface CapturedPhoto {
  file: File;
  previewUrl: string;
  exif: ExifData;
}

interface PhotoCaptureProps {
  photos: CapturedPhoto[];
  onPhotosChange: (photos: CapturedPhoto[]) => void;
}

export function PhotoCapture({ photos, onPhotosChange }: PhotoCaptureProps) {
  const [isExtracting, setIsExtracting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photos.length >= MAX_PHOTOS_PER_HEADSTONE) return;

    setIsExtracting(true);
    try {
      const exif = await extractExifData(file);
      const previewUrl = URL.createObjectURL(file);
      onPhotosChange([...photos, { file, previewUrl, exif }]);
    } finally {
      setIsExtracting(false);
      e.target.value = '';
    }
  }

  function handleRemove(index: number) {
    URL.revokeObjectURL(photos[index]!.previewUrl);
    onPhotosChange(photos.filter((_, i) => i !== index));
  }

  const hasNoGps = photos.some((p) => p.exif.lat === null);

  return (
    <div className="space-y-4">
      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo, i) => (
            <div key={photo.previewUrl} className="relative">
              <img
                src={photo.previewUrl}
                alt={`Headstone photo ${i + 1}`}
                className="w-full aspect-square object-cover rounded-lg"
              />
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold flex items-center justify-center"
                aria-label={`Remove photo ${i + 1}`}
              >
                X
              </button>
              <div className="mt-1">
                {photo.exif.lat !== null ? (
                  <GpsAccuracyBadge accuracyMeters={photo.exif.accuracy} />
                ) : (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                    No GPS
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Warning if any photo lacks GPS */}
      {hasNoGps && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          One or more photos have no GPS data. Enable location services in your
          camera app for automatic positioning.
        </div>
      )}

      {/* Camera input */}
      {photos.length < MAX_PHOTOS_PER_HEADSTONE && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isExtracting}
          className="w-full py-4 border-2 border-dashed border-stone-300 rounded-lg text-stone-600 font-medium hover:border-emerald-400 hover:text-emerald-600 transition-colors disabled:opacity-50"
        >
          {isExtracting
            ? 'Reading photo data...'
            : photos.length === 0
              ? 'Take Photo of Headstone'
              : `Add Photo (${photos.length}/${MAX_PHOTOS_PER_HEADSTONE})`}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
