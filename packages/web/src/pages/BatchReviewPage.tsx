import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import { GpsAccuracyBadge } from '@web/components/GpsAccuracyBadge';
import { confirmOcr } from '@web/lib/apiClient';
import { useBatchCapture } from '@web/lib/BatchCaptureContext';
import type { BatchJob } from '@web/lib/BatchCaptureContext';
import type { OcrParsedPerson, OcrFieldConfidence } from '@scythe/shared';
import 'leaflet/dist/leaflet.css';

function ConfidenceBadge({ level }: { level: OcrFieldConfidence }) {
  const styles = {
    high: 'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-red-100 text-red-700 ring-1 ring-red-300',
  };
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[level]}`}
    >
      {level}
    </span>
  );
}

function hasLowConfidence(job: BatchJob): boolean {
  return job.persons.some(
    (p) =>
      p.confidence.firstName === 'low' ||
      p.confidence.lastName === 'low' ||
      p.confidence.dateOfBirth === 'low' ||
      p.confidence.dateOfDeath === 'low',
  );
}

function JobCard({
  job,
  cemeteryName,
  onConfirm,
  onDiscard,
  onEdit,
  isConfirming,
}: {
  job: BatchJob;
  cemeteryName: string;
  onConfirm: (jobId: string) => void;
  onDiscard: (jobId: string) => void;
  onEdit: (jobId: string) => void;
  isConfirming: boolean;
}) {
  const hasGps = job.gps.lat != null && job.gps.lon != null;
  const lowConf = hasLowConfidence(job);
  const isReady = job.status === 'ready';
  const isProcessing = job.status === 'queued' || job.status === 'processing';
  const isConfirmed = job.status === 'confirmed';
  const isDiscarded = job.status === 'discarded';

  let borderClass = 'border-stone-200';
  if (lowConf && isReady) borderClass = 'border-yellow-400';
  if (isConfirmed) borderClass = 'border-green-300 bg-green-50';
  if (isDiscarded) borderClass = 'border-stone-200 opacity-50';
  if (job.error) borderClass = 'border-red-300';

  return (
    <div className={`bg-white rounded-lg border-2 ${borderClass} p-4 space-y-3`}>
      <div className="flex gap-3">
        {/* Thumbnail */}
        <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-stone-100">
          {job.thumbnailUrl ? (
            <img
              src={job.thumbnailUrl}
              alt="Headstone"
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={job.photo.previewUrl}
              alt="Headstone"
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Status + summary */}
        <div className="flex-1 min-w-0">
          {isProcessing && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
              <span className="text-sm text-stone-500">Processing OCR...</span>
            </div>
          )}

          {job.error && (
            <p className="text-sm text-red-600">
              Error: {job.error}
            </p>
          )}

          {isReady && !job.error && job.persons.length > 0 && (
            <div className="space-y-1">
              {job.persons.map((person, i) => (
                <div key={i}>
                  <p className="text-sm font-medium text-stone-800 truncate">
                    {[person.firstName, person.middleName, person.lastName]
                      .filter(Boolean)
                      .join(' ') || 'Unknown'}
                    {person.maidenName ? ` (née ${person.maidenName})` : ''}
                  </p>
                  <p className="text-xs text-stone-500">
                    {[person.dateOfBirth, person.dateOfDeath]
                      .filter(Boolean)
                      .join(' — ') || 'No dates'}
                  </p>
                  <div className="flex gap-1 mt-0.5">
                    <ConfidenceBadge level={person.confidence.firstName} />
                    <ConfidenceBadge level={person.confidence.dateOfBirth} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isReady && !job.error && job.persons.length === 0 && (
            <p className="text-sm text-stone-500">No persons detected</p>
          )}

          {isConfirmed && (
            <p className="text-sm font-medium text-green-700">Confirmed</p>
          )}

          {isDiscarded && (
            <p className="text-sm text-stone-400">Discarded</p>
          )}
        </div>
      </div>

      {/* Mini-map and GPS */}
      {hasGps && isReady && (
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
            <MapContainer
              center={[job.gps.lat!, job.gps.lon!]}
              zoom={17}
              scrollWheelZoom={false}
              dragging={false}
              zoomControl={false}
              attributionControl={false}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={[job.gps.lat!, job.gps.lon!]} />
            </MapContainer>
          </div>
          <div>
            <p className="text-xs text-stone-500">
              {job.gps.lat!.toFixed(6)}, {job.gps.lon!.toFixed(6)}
            </p>
            <GpsAccuracyBadge accuracyMeters={job.gps.accuracy} />
          </div>
        </div>
      )}

      {/* Cemetery */}
      {isReady && (
        <p className="text-xs text-stone-500">
          Cemetery: {cemeteryName}
        </p>
      )}

      {/* Low confidence warning */}
      {lowConf && isReady && (
        <div className="flex items-center gap-1.5 text-xs text-yellow-700 bg-yellow-50 px-2 py-1 rounded">
          <span>&#9888;</span>
          <span>Low confidence on some fields — review recommended</span>
        </div>
      )}

      {/* Actions */}
      {isReady && !isConfirmed && !isDiscarded && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onConfirm(job.id)}
            disabled={isConfirming || !!job.error}
            className="flex-1 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => onEdit(job.id)}
            disabled={isConfirming || !!job.error}
            className="flex-1 py-2 bg-white text-stone-700 text-sm font-medium rounded-lg border border-stone-300 hover:bg-stone-50 transition-colors disabled:opacity-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDiscard(job.id)}
            disabled={isConfirming}
            className="py-2 px-3 text-sm text-red-600 hover:text-red-800"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}

// Inline edit modal for a single job's persons
function EditModal({
  job,
  onSave,
  onClose,
}: {
  job: BatchJob;
  onSave: (jobId: string, persons: OcrParsedPerson[]) => void;
  onClose: () => void;
}) {
  const [editPersons, setEditPersons] = useState<OcrParsedPerson[]>(
    job.persons.map((p) => ({ ...p, confidence: { ...p.confidence } })),
  );

  function updateField(
    personIdx: number,
    field: keyof Omit<OcrParsedPerson, 'confidence'>,
    value: string,
  ) {
    setEditPersons((prev) =>
      prev.map((p, i) =>
        i === personIdx ? { ...p, [field]: value || null } : p,
      ),
    );
  }

  const fields: Array<{
    key: keyof Omit<OcrParsedPerson, 'confidence'>;
    label: string;
    confKey: keyof OcrParsedPerson['confidence'];
  }> = [
    { key: 'firstName', label: 'First Name', confKey: 'firstName' },
    { key: 'middleName', label: 'Middle Name', confKey: 'firstName' },
    { key: 'lastName', label: 'Last Name', confKey: 'lastName' },
    { key: 'maidenName', label: 'Maiden Name', confKey: 'lastName' },
    { key: 'dateOfBirth', label: 'Date of Birth', confKey: 'dateOfBirth' },
    { key: 'dateOfDeath', label: 'Date of Death', confKey: 'dateOfDeath' },
    { key: 'inscription', label: 'Inscription', confKey: 'inscription' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-stone-800">Edit Record</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 text-xl"
          >
            &#10005;
          </button>
        </div>

        {editPersons.map((person, pi) => (
          <div
            key={pi}
            className="border border-stone-200 rounded-lg p-3 space-y-3"
          >
            <h4 className="text-sm font-bold text-stone-700">
              Person {pi + 1}
            </h4>
            {fields.map(({ key, label, confKey }) => {
              const isLow = person.confidence[confKey] === 'low';
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-stone-600">
                      {label}
                    </label>
                    <ConfidenceBadge level={person.confidence[confKey]} />
                  </div>
                  <input
                    type="text"
                    value={person[key] ?? ''}
                    onChange={(e) => updateField(pi, key, e.target.value)}
                    placeholder={label}
                    className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      isLow ? 'border-red-300 bg-red-50' : 'border-stone-300'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        ))}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => onSave(job.id, editPersons)}
            className="flex-1 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Save Changes
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-white text-stone-700 font-medium rounded-lg border border-stone-300 hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BatchReviewPage() {
  const navigate = useNavigate();
  const { cemeterySlug } = useParams<{ cemeterySlug: string }>();
  const batch = useBatchCapture();

  const [confirmingAll, setConfirmingAll] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);

  const cemeteryName = batch.cemetery?.name ?? 'Unknown Cemetery';
  const cemeteryId = batch.cemetery?.id ?? '';

  // Filter jobs that are actionable (not yet confirmed/discarded)
  const activeJobs = batch.jobs.filter(
    (j) => j.status !== 'confirmed' && j.status !== 'discarded',
  );
  const readyJobs = batch.jobs.filter(
    (j) => j.status === 'ready' && !j.error,
  );
  const confirmedCount = batch.jobs.filter(
    (j) => j.status === 'confirmed',
  ).length;
  const allDone = activeJobs.length === 0 && batch.jobs.length > 0;

  async function handleConfirmJob(jobId: string) {
    const job = batch.jobs.find((j) => j.id === jobId);
    if (!job || !job.photoId) return;

    const validPersons = job.persons.filter(
      (p) => p.firstName?.trim() && p.lastName?.trim(),
    );
    if (validPersons.length === 0) return;

    try {
      await confirmOcr({
        cemeteryId,
        photoId: job.photoId,
        lat: job.gps.lat ?? undefined,
        lon: job.gps.lon ?? undefined,
        gpsAccuracyMeters: job.gps.accuracy ?? undefined,
        gpsSource: job.gps.lat != null ? 'exif' : undefined,
        persons: validPersons.map((p) => ({
          firstName: (p.firstName ?? '').trim(),
          middleName: p.middleName?.trim() || undefined,
          lastName: (p.lastName ?? '').trim(),
          maidenName: p.maidenName?.trim() || undefined,
          dateOfBirth: p.dateOfBirth?.trim() || undefined,
          dateOfDeath: p.dateOfDeath?.trim() || undefined,
          inscription: p.inscription?.trim() || undefined,
        })),
      });
      batch.confirmJob(jobId);
    } catch (err) {
      setConfirmError(
        err instanceof Error ? err.message : 'Failed to confirm',
      );
    }
  }

  async function handleConfirmAll() {
    setConfirmingAll(true);
    setConfirmError(null);

    for (const job of readyJobs) {
      try {
        await handleConfirmJob(job.id);
      } catch {
        // Error already set in handleConfirmJob
        break;
      }
    }

    setConfirmingAll(false);
  }

  function handleDiscard(jobId: string) {
    batch.discardJob(jobId);
  }

  function handleEditSave(jobId: string, persons: OcrParsedPerson[]) {
    batch.updateJobPersons(jobId, persons);
    setEditingJobId(null);
  }

  function handleBackToCapture() {
    const slug = batch.cemetery?.slug ?? cemeterySlug;
    if (slug) {
      navigate(`/${slug}/capture`);
    } else {
      navigate('/capture');
    }
  }

  function handleDone() {
    batch.reset();
    const slug = batch.cemetery?.slug ?? cemeterySlug;
    if (slug) {
      navigate(`/${slug}`);
    } else {
      navigate('/');
    }
  }

  const editingJob = editingJobId
    ? batch.jobs.find((j) => j.id === editingJobId) ?? null
    : null;

  if (batch.jobs.length === 0) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg text-stone-600 mb-4">
            No captures to review. Start by capturing some headstone photos.
          </p>
          <button
            type="button"
            onClick={handleBackToCapture}
            className="text-emerald-600 underline"
          >
            Go to Capture
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-stone-800">Review Batch</h1>
            <p className="text-sm text-stone-500">
              {batch.jobs.length} capture{batch.jobs.length !== 1 ? 's' : ''}
              {confirmedCount > 0 && ` — ${confirmedCount} confirmed`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleBackToCapture}
            className="text-sm text-stone-500 hover:text-stone-700"
          >
            Back to Capture
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Confirm All button */}
        {readyJobs.length > 1 && (
          <button
            type="button"
            onClick={handleConfirmAll}
            disabled={confirmingAll}
            className="w-full py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {confirmingAll
              ? 'Confirming...'
              : `Confirm All (${readyJobs.length})`}
          </button>
        )}

        {/* Error */}
        {confirmError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {confirmError}
          </div>
        )}

        {/* Processing indicator */}
        {batch.isProcessing && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm text-blue-700">
              Processing remaining photos...
            </span>
          </div>
        )}

        {/* Job cards */}
        {batch.jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            cemeteryName={cemeteryName}
            onConfirm={handleConfirmJob}
            onDiscard={handleDiscard}
            onEdit={(id) => setEditingJobId(id)}
            isConfirming={confirmingAll}
          />
        ))}

        {/* All done state */}
        {allDone && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-emerald-600">&#10003;</span>
            </div>
            <h2 className="text-xl font-bold text-stone-800 mb-2">
              All Done!
            </h2>
            <p className="text-stone-600 mb-6">
              {confirmedCount} record{confirmedCount !== 1 ? 's' : ''} saved.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleBackToCapture}
                className="w-full py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Capture More
              </button>
              <button
                type="button"
                onClick={handleDone}
                className="w-full py-3 bg-white text-stone-700 font-medium rounded-lg border border-stone-300 hover:bg-stone-50 transition-colors"
              >
                Finish
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Edit modal */}
      {editingJob && (
        <EditModal
          job={editingJob}
          onSave={handleEditSave}
          onClose={() => setEditingJobId(null)}
        />
      )}
    </div>
  );
}
