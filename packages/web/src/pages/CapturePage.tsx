import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PhotoCapture } from '@web/components/PhotoCapture';
import { GpsAccuracyBadge } from '@web/components/GpsAccuracyBadge';
import { CemeteryDetection } from '@web/components/CemeteryDetection';
import {
  createPlot,
  uploadPhoto,
  fetchCemeteryBySlug,
  detectCemetery,
} from '@web/lib/apiClient';
import { useBatchCapture } from '@web/lib/BatchCaptureContext';
import { usePendingCount } from '@web/hooks/usePendingCount';
import { useAuth } from '@web/lib/AuthContext';
import type { CapturedPhoto } from '@web/components/PhotoCapture';
import type { Cemetery, CemeteryDetectResponse } from '@scythe/shared';

type CaptureStep = 'capture' | 'review' | 'submitting' | 'success';

const DETECTION_CACHE_DISTANCE_METERS = 500;

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CapturePage() {
  const { cemeterySlug } = useParams<{ cemeterySlug: string }>();
  const navigate = useNavigate();
  const batch = useBatchCapture();
  const { user } = useAuth();
  const pendingCount = usePendingCount();

  const [cemetery, setCemetery] = useState<Cemetery | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [step, setStep] = useState<CaptureStep>('capture');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [section, setSection] = useState('');
  const [plotNumber, setPlotNumber] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Detection state
  const [detectionResult, setDetectionResult] =
    useState<CemeteryDetectResponse | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const lastDetectionCoords = useRef<{ lat: number; lon: number } | null>(null);
  const detectionRanOnce = useRef(false);

  // Sync cemetery to batch context
  useEffect(() => {
    if (cemetery) {
      batch.setCemetery(cemetery);
    }
  }, [cemetery, batch.setCemetery]);

  // Load cemetery by slug (if provided via URL)
  useEffect(() => {
    if (!cemeterySlug) return;
    fetchCemeteryBySlug(cemeterySlug)
      .then(setCemetery)
      .catch(() => setLoadError('Cemetery not found'));
  }, [cemeterySlug]);

  // Get best GPS data from captured photos
  const bestGps = photos.find((p) => p.exif.lat !== null)?.exif ?? null;

  // Run detection when GPS is available (once per session, or when moved 500m+)
  const runDetection = useCallback(
    async (lat: number, lon: number) => {
      if (cemeterySlug && cemetery) return;
      if (isDetecting) return;

      if (lastDetectionCoords.current) {
        const dist = haversineDistance(
          lastDetectionCoords.current.lat,
          lastDetectionCoords.current.lon,
          lat,
          lon,
        );
        if (dist < DETECTION_CACHE_DISTANCE_METERS && detectionRanOnce.current) {
          return;
        }
      }

      setIsDetecting(true);
      setDetectionError(null);
      lastDetectionCoords.current = { lat, lon };
      detectionRanOnce.current = true;

      try {
        const result = await detectCemetery(lat, lon);
        setDetectionResult(result);
        if (result.match) {
          setCemetery(result.match.cemetery);
        }
      } catch (err) {
        setDetectionError(
          err instanceof Error ? err.message : 'Detection failed',
        );
      } finally {
        setIsDetecting(false);
      }
    },
    [cemeterySlug, cemetery, isDetecting],
  );

  // Trigger detection when first photo with GPS is captured
  useEffect(() => {
    if (bestGps?.lat != null && bestGps?.lon != null && !detectionRanOnce.current) {
      runDetection(bestGps.lat, bestGps.lon);
    }
  }, [bestGps?.lat, bestGps?.lon, runDetection]);

  function handleCemeterySelected(selected: Cemetery) {
    setCemetery(selected);
  }

  // Batch capture: enqueue photo for OCR and reset for next headstone
  function handleBatchCapture() {
    if (!cemetery || photos.length === 0) return;

    // Enqueue the first photo for OCR processing in the background
    const photo = photos[0]!;
    batch.addJob(photo, cemetery.id);

    // Reset capture UI for next headstone (keep cemetery & detection)
    setPhotos([]);
    setSection('');
    setPlotNumber('');
    setStep('capture');
  }

  // Navigate to batch review page
  function handleReviewAll() {
    const slug = cemetery?.slug ?? cemeterySlug;
    if (slug) {
      navigate(`/${slug}/capture/batch-review`);
    } else {
      navigate('/capture/batch-review');
    }
  }

  async function handleSubmit() {
    if (!cemetery || photos.length === 0) return;

    setStep('submitting');
    setSubmitError(null);

    try {
      const hasGps = bestGps?.lat != null && bestGps?.lon != null;
      const plot = await createPlot({
        cemeteryId: cemetery.id,
        plotNumber: plotNumber || undefined,
        section: section || undefined,
        lat: bestGps?.lat ?? undefined,
        lon: bestGps?.lon ?? undefined,
        gpsAccuracyMeters: bestGps?.accuracy ?? undefined,
        gpsSource: hasGps ? 'exif' : undefined,
        status: hasGps ? 'pinned' : 'unpinned',
      });

      for (const photo of photos) {
        await uploadPhoto(photo.file, {
          cemeteryId: cemetery.id,
          plotId: plot.id,
          exifLat: photo.exif.lat,
          exifLon: photo.exif.lon,
          exifAccuracy: photo.exif.accuracy,
          capturedAt: photo.exif.capturedAt,
        });
      }

      setStep('success');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Upload failed');
      setStep('review');
    }
  }

  function handleReset() {
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setSection('');
    setPlotNumber('');
    setStep('capture');
    setSubmitError(null);
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg text-red-600 mb-4">{loadError}</p>
          <Link to="/" className="text-emerald-600 underline">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (cemeterySlug && !cemetery) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-500">Loading cemetery...</p>
      </div>
    );
  }

  const cemeteryName = cemetery?.name ?? 'Auto-detect';
  const cancelLink = cemeterySlug ? `/${cemeterySlug}` : '/';

  // Batch stats
  const totalCaptured = batch.jobs.length;
  const readyCount = batch.jobs.filter((j) => j.status === 'ready').length;
  const processingCount = batch.jobs.filter(
    (j) => j.status === 'queued' || j.status === 'processing',
  ).length;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-stone-800">Capture</h1>
            <p className="text-sm text-stone-500">{cemeteryName}</p>
          </div>
          <div className="flex items-center gap-3">
            {totalCaptured > 0 && (
              <button
                type="button"
                onClick={handleReviewAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full hover:bg-emerald-200 transition-colors"
              >
                Review All
                {readyCount > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-emerald-600 text-white rounded-full">
                    {readyCount}
                  </span>
                )}
              </button>
            )}
            {user?.role === 'admin' && pendingCount > 0 && (
              <Link
                to="/admin/submissions"
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-full hover:bg-amber-200 transition-colors"
              >
                Submissions
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-amber-600 text-white rounded-full">
                  {pendingCount}
                </span>
              </Link>
            )}
            <Link
              to={cancelLink}
              className="text-sm text-stone-500 hover:text-stone-700"
            >
              Cancel
            </Link>
          </div>
        </div>
      </header>

      {/* Batch status bar */}
      {totalCaptured > 0 && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2">
          <div className="max-w-lg mx-auto flex items-center justify-between text-sm">
            <span className="text-emerald-800 font-medium">
              {totalCaptured} captured
              {readyCount > 0 && `, ${readyCount} ready for review`}
              {processingCount > 0 && `, ${processingCount} processing`}
            </span>
            {batch.isProcessing && (
              <div className="flex items-center gap-1.5 text-emerald-600">
                <div className="w-3 h-3 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
                <span className="text-xs">Processing...</span>
              </div>
            )}
          </div>
        </div>
      )}

      <main className="max-w-lg mx-auto p-4">
        {/* CAPTURE STEP */}
        {step === 'capture' && (
          <div className="space-y-6">
            {/* Prompt for next headstone when batch has items */}
            {totalCaptured > 0 && photos.length === 0 && (
              <div className="text-center py-4">
                <h2 className="text-lg font-bold text-stone-800 mb-1">
                  Next Headstone
                </h2>
                <p className="text-sm text-stone-500">
                  Take a photo of the next headstone, or review your batch.
                </p>
              </div>
            )}

            <PhotoCapture photos={photos} onPhotosChange={setPhotos} />

            {/* Cemetery detection (only when no slug provided) */}
            {!cemeterySlug && bestGps?.lat != null && (
              <CemeteryDetection
                detectionResult={detectionResult}
                isDetecting={isDetecting}
                detectionError={detectionError}
                gpsLat={bestGps.lat}
                gpsLon={bestGps.lon}
                selectedCemetery={cemetery}
                onCemeterySelected={handleCemeterySelected}
              />
            )}

            {/* GPS summary from best photo */}
            {bestGps?.lat != null && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="text-sm font-medium text-emerald-800 mb-1">
                  GPS Location Detected
                </p>
                <p className="text-xs text-emerald-700">
                  {bestGps.lat.toFixed(6)}, {bestGps.lon?.toFixed(6)}
                </p>
                <div className="mt-1">
                  <GpsAccuracyBadge accuracyMeters={bestGps.accuracy} />
                </div>
              </div>
            )}

            {/* Plot info fields */}
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="section"
                  className="block text-sm font-medium text-stone-700 mb-1"
                >
                  Section
                </label>
                <input
                  id="section"
                  type="text"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  placeholder="e.g. Section A"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label
                  htmlFor="plotNumber"
                  className="block text-sm font-medium text-stone-700 mb-1"
                >
                  Plot Number
                </label>
                <input
                  id="plotNumber"
                  type="text"
                  value={plotNumber}
                  onChange={(e) => setPlotNumber(e.target.value)}
                  placeholder="e.g. A-101"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              {/* Primary: Queue for OCR and move to next */}
              <button
                type="button"
                onClick={handleBatchCapture}
                disabled={photos.length === 0 || !cemetery}
                className="w-full py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {totalCaptured === 0
                  ? 'Capture & Continue'
                  : 'Capture Next Headstone'}
              </button>

              {/* Secondary: Manual save without OCR */}
              <button
                type="button"
                onClick={() => setStep('review')}
                disabled={photos.length === 0 || !cemetery}
                className="w-full py-3 bg-white text-stone-700 font-medium rounded-lg border border-stone-300 hover:bg-stone-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Review & Save (Manual)
              </button>

              {!cemetery && photos.length > 0 && (
                <p className="text-xs text-amber-600 text-center">
                  Select a cemetery above before proceeding
                </p>
              )}
            </div>
          </div>
        )}

        {/* REVIEW STEP (manual, no OCR) */}
        {step === 'review' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-stone-800">
              Review Capture
            </h2>

            {submitError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {submitError}
              </div>
            )}

            {/* Photo previews */}
            <div className="grid grid-cols-3 gap-3">
              {photos.map((photo, i) => (
                <img
                  key={photo.previewUrl}
                  src={photo.previewUrl}
                  alt={`Photo ${i + 1}`}
                  className="w-full aspect-square object-cover rounded-lg"
                />
              ))}
            </div>

            {/* GPS info */}
            {bestGps?.lat != null ? (
              <div className="p-3 bg-stone-100 rounded-lg">
                <p className="text-sm font-medium text-stone-700">
                  GPS Location
                </p>
                <p className="text-xs text-stone-600 mt-1">
                  {bestGps.lat.toFixed(6)}, {bestGps.lon?.toFixed(6)}
                </p>
                <div className="mt-1">
                  <GpsAccuracyBadge accuracyMeters={bestGps.accuracy} />
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                No GPS data — plot will be saved as unpinned.
              </div>
            )}

            {/* Plot info summary */}
            <div className="p-3 bg-stone-100 rounded-lg space-y-1">
              <p className="text-sm text-stone-700">
                <span className="font-medium">Cemetery:</span>{' '}
                {cemetery?.name ?? '—'}
              </p>
              <p className="text-sm text-stone-700">
                <span className="font-medium">Section:</span>{' '}
                {section || '—'}
              </p>
              <p className="text-sm text-stone-700">
                <span className="font-medium">Plot #:</span>{' '}
                {plotNumber || '—'}
              </p>
              <p className="text-sm text-stone-700">
                <span className="font-medium">Photos:</span> {photos.length}
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleSubmit}
                className="w-full py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Confirm & Save
              </button>
              <button
                type="button"
                onClick={() => setStep('capture')}
                className="w-full py-3 bg-white text-stone-700 font-medium rounded-lg border border-stone-300 hover:bg-stone-50 transition-colors"
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="w-full py-2 text-sm text-red-600 hover:text-red-800"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* SUBMITTING STEP */}
        {step === 'submitting' && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
            <p className="text-stone-600">Saving capture...</p>
          </div>
        )}

        {/* SUCCESS STEP */}
        {step === 'success' && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl text-emerald-600">&#10003;</span>
            </div>
            <h2 className="text-xl font-bold text-stone-800 mb-2">
              Capture Saved
            </h2>
            <p className="text-stone-600 mb-6">
              {photos.length} photo{photos.length > 1 ? 's' : ''} uploaded
              successfully.
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Capture Another
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
