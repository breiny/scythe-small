import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { CapturedPhoto } from '@web/components/PhotoCapture';
import type { Cemetery, OcrParsedPerson } from '@scythe/shared';
import { processOcr } from '@web/lib/apiClient';

export type BatchJobStatus =
  | 'queued'
  | 'extracting'
  | 'processing'
  | 'ready'
  | 'confirmed'
  | 'discarded';

export interface BatchJob {
  id: string;
  photo: CapturedPhoto;
  status: BatchJobStatus;
  error: string | null;
  // OCR result fields (populated when status === 'ready')
  photoId: string | null;
  thumbnailUrl: string | null;
  photoUrl: string | null;
  rawText: string | null;
  persons: OcrParsedPerson[];
  overallConfidence: number | null;
  gps: {
    lat: number | null;
    lon: number | null;
    accuracy: number | null;
  };
}

interface BatchCaptureState {
  jobs: BatchJob[];
  cemetery: Cemetery | null;
  isProcessing: boolean;
}

interface BatchCaptureActions {
  addJob: (photo: CapturedPhoto, cemeteryId: string) => void;
  setCemetery: (cemetery: Cemetery) => void;
  updateJobPersons: (jobId: string, persons: OcrParsedPerson[]) => void;
  confirmJob: (jobId: string) => void;
  discardJob: (jobId: string) => void;
  confirmAllReady: () => string[];
  reset: () => void;
}

type BatchCaptureContextValue = BatchCaptureState & BatchCaptureActions;

const BatchCaptureContext = createContext<BatchCaptureContextValue | null>(null);

let jobIdCounter = 0;

export function BatchCaptureProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [cemetery, setCemeteryState] = useState<Cemetery | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const queueRef = useRef<BatchJob[]>([]);
  const processingRef = useRef(false);

  const processNext = useCallback(async () => {
    if (processingRef.current) return;

    const nextJob = queueRef.current.find((j) => j.status === 'queued');
    if (!nextJob) {
      setIsProcessing(false);
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);

    // Mark as processing
    const updateStatus = (id: string, updates: Partial<BatchJob>) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, ...updates } : j)),
      );
      queueRef.current = queueRef.current.map((j) =>
        j.id === id ? { ...j, ...updates } : j,
      );
    };

    updateStatus(nextJob.id, { status: 'processing' });

    try {
      const cemeteryId = queueRef.current.find(
        (j) => j.id === nextJob.id,
      )?.photo.file
        ? (cemetery?.id ?? '')
        : '';

      const result = await processOcr(nextJob.photo.file, {
        cemeteryId: cemetery?.id ?? '',
        exifLat: nextJob.photo.exif.lat,
        exifLon: nextJob.photo.exif.lon,
        exifAccuracy: nextJob.photo.exif.accuracy,
        capturedAt: nextJob.photo.exif.capturedAt,
      });

      updateStatus(nextJob.id, {
        status: 'ready',
        photoId: result.photoId,
        thumbnailUrl: result.thumbnailUrl,
        photoUrl: result.photoUrl,
        rawText: result.rawText,
        persons: result.persons,
        overallConfidence: result.overallConfidence,
        gps: result.gps ?? {
          lat: nextJob.photo.exif.lat,
          lon: nextJob.photo.exif.lon,
          accuracy: nextJob.photo.exif.accuracy,
        },
      });
    } catch (err) {
      updateStatus(nextJob.id, {
        status: 'ready',
        error: err instanceof Error ? err.message : 'OCR processing failed',
        persons: [],
        overallConfidence: 0,
        gps: {
          lat: nextJob.photo.exif.lat,
          lon: nextJob.photo.exif.lon,
          accuracy: nextJob.photo.exif.accuracy,
        },
      });
    }

    processingRef.current = false;
    // Process next in queue
    processNext();
  }, [cemetery]);

  const addJob = useCallback(
    (photo: CapturedPhoto, _cemeteryId: string) => {
      const job: BatchJob = {
        id: `batch-${++jobIdCounter}`,
        photo,
        status: 'queued',
        error: null,
        photoId: null,
        thumbnailUrl: null,
        photoUrl: null,
        rawText: null,
        persons: [],
        overallConfidence: null,
        gps: {
          lat: photo.exif.lat,
          lon: photo.exif.lon,
          accuracy: photo.exif.accuracy,
        },
      };

      setJobs((prev) => [...prev, job]);
      queueRef.current = [...queueRef.current, job];

      // Kick off processing
      processNext();
    },
    [processNext],
  );

  const setCemetery = useCallback((c: Cemetery) => {
    setCemeteryState(c);
  }, []);

  const updateJobPersons = useCallback(
    (jobId: string, persons: OcrParsedPerson[]) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, persons } : j)),
      );
    },
    [],
  );

  const confirmJob = useCallback((jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: 'confirmed' } : j)),
    );
    queueRef.current = queueRef.current.map((j) =>
      j.id === jobId ? { ...j, status: 'confirmed' } : j,
    );
  }, []);

  const discardJob = useCallback((jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: 'discarded' } : j)),
    );
    queueRef.current = queueRef.current.map((j) =>
      j.id === jobId ? { ...j, status: 'discarded' } : j,
    );
  }, []);

  const confirmAllReady = useCallback(() => {
    const readyIds = jobs
      .filter((j) => j.status === 'ready' && !j.error)
      .map((j) => j.id);
    setJobs((prev) =>
      prev.map((j) =>
        readyIds.includes(j.id) ? { ...j, status: 'confirmed' } : j,
      ),
    );
    queueRef.current = queueRef.current.map((j) =>
      readyIds.includes(j.id) ? { ...j, status: 'confirmed' } : j,
    );
    return readyIds;
  }, [jobs]);

  const reset = useCallback(() => {
    jobs.forEach((j) => URL.revokeObjectURL(j.photo.previewUrl));
    setJobs([]);
    queueRef.current = [];
    setIsProcessing(false);
    processingRef.current = false;
  }, [jobs]);

  return (
    <BatchCaptureContext.Provider
      value={{
        jobs,
        cemetery,
        isProcessing,
        addJob,
        setCemetery,
        updateJobPersons,
        confirmJob,
        discardJob,
        confirmAllReady,
        reset,
      }}
    >
      {children}
    </BatchCaptureContext.Provider>
  );
}

export function useBatchCapture(): BatchCaptureContextValue {
  const ctx = useContext(BatchCaptureContext);
  if (!ctx) {
    throw new Error('useBatchCapture must be used within a BatchCaptureProvider');
  }
  return ctx;
}
