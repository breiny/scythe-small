import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import { GpsAccuracyBadge } from '@web/components/GpsAccuracyBadge';
import { confirmOcr } from '@web/lib/apiClient';
import type { OcrParsedPerson } from '@scythe/shared';
import 'leaflet/dist/leaflet.css';

type FieldConfidence = 'high' | 'medium' | 'low';

interface OcrReviewState {
  photoId: string;
  thumbnailUrl: string;
  photoUrl: string;
  rawText: string;
  persons: OcrParsedPerson[];
  overallConfidence: number;
  gps: {
    lat: number | null;
    lon: number | null;
    accuracy: number | null;
  };
  cemeteryId: string;
  cemeteryName: string;
  section?: string;
  plotNumber?: string;
}

interface EditablePerson {
  firstName: string;
  middleName: string;
  lastName: string;
  maidenName: string;
  dateOfBirth: string;
  dateOfDeath: string;
  inscription: string;
  confidence: OcrParsedPerson['confidence'];
}

function ConfidenceBadge({ level }: { level: FieldConfidence }) {
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

function PersonCard({
  person,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  person: EditablePerson;
  index: number;
  onChange: (index: number, updated: EditablePerson) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}) {
  function update(field: keyof EditablePerson, value: string) {
    onChange(index, { ...person, [field]: value });
  }

  const fields: Array<{
    key: keyof EditablePerson;
    label: string;
    confKey: keyof OcrParsedPerson['confidence'];
    type?: string;
  }> = [
    { key: 'firstName', label: 'First Name', confKey: 'firstName' },
    { key: 'middleName', label: 'Middle Name', confKey: 'firstName' },
    { key: 'lastName', label: 'Last Name', confKey: 'lastName' },
    { key: 'maidenName', label: 'Maiden Name', confKey: 'lastName' },
    { key: 'dateOfBirth', label: 'Date of Birth', confKey: 'dateOfBirth', type: 'text' },
    { key: 'dateOfDeath', label: 'Date of Death', confKey: 'dateOfDeath', type: 'text' },
    { key: 'inscription', label: 'Inscription', confKey: 'inscription' },
  ];

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-stone-800">
          Person {index + 1}
        </h3>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Remove
          </button>
        )}
      </div>

      {fields.map(({ key, label, confKey, type }) => {
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
              type={type ?? 'text'}
              value={person[key] as string}
              onChange={(e) => update(key, e.target.value)}
              placeholder={label}
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                isLow
                  ? 'border-red-300 bg-red-50'
                  : 'border-stone-300'
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function OcrReviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { cemeterySlug } = useParams<{ cemeterySlug: string }>();
  const state = location.state as OcrReviewState | null;

  const [persons, setPersons] = useState<EditablePerson[]>([]);
  const [section, setSection] = useState('');
  const [plotNumber, setPlotNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!state) return;
    setPersons(
      state.persons.map((p) => ({
        firstName: p.firstName ?? '',
        middleName: p.middleName ?? '',
        lastName: p.lastName ?? '',
        maidenName: p.maidenName ?? '',
        dateOfBirth: p.dateOfBirth ?? '',
        dateOfDeath: p.dateOfDeath ?? '',
        inscription: p.inscription ?? '',
        confidence: p.confidence,
      })),
    );
    setSection(state.section ?? '');
    setPlotNumber(state.plotNumber ?? '');
  }, [state]);

  if (!state) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg text-stone-600 mb-4">
            No OCR data to review. Please capture a photo first.
          </p>
          <Link
            to={`/${cemeterySlug}/capture`}
            className="text-emerald-600 underline"
          >
            Go to Capture
          </Link>
        </div>
      </div>
    );
  }

  function handlePersonChange(index: number, updated: EditablePerson) {
    setPersons((prev) => prev.map((p, i) => (i === index ? updated : p)));
  }

  function handleRemovePerson(index: number) {
    setPersons((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirm() {
    if (!state) return;

    // Validate at least one person with first+last name
    const validPersons = persons.filter(
      (p) => p.firstName.trim() && p.lastName.trim(),
    );
    if (validPersons.length === 0) {
      setError('At least one person must have a first and last name.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await confirmOcr({
        cemeteryId: state.cemeteryId,
        photoId: state.photoId,
        section: section || undefined,
        plotNumber: plotNumber || undefined,
        lat: state.gps.lat ?? undefined,
        lon: state.gps.lon ?? undefined,
        gpsAccuracyMeters: state.gps.accuracy ?? undefined,
        gpsSource: state.gps.lat != null ? 'exif' : undefined,
        persons: validPersons.map((p) => ({
          firstName: p.firstName.trim(),
          middleName: p.middleName.trim() || undefined,
          lastName: p.lastName.trim(),
          maidenName: p.maidenName.trim() || undefined,
          dateOfBirth: p.dateOfBirth.trim() || undefined,
          dateOfDeath: p.dateOfDeath.trim() || undefined,
          inscription: p.inscription.trim() || undefined,
        })),
      });

      setShowSuccess(true);
      setTimeout(() => {
        navigate(`/${cemeterySlug}/capture`, { replace: true });
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSubmitting(false);
    }
  }

  function handleDiscard() {
    navigate(`/${cemeterySlug}/capture`, { replace: true });
  }

  // Success toast
  if (showSuccess) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-emerald-600">&#10003;</span>
          </div>
          <h2 className="text-xl font-bold text-stone-800 mb-2">
            Record Saved
          </h2>
          <p className="text-stone-600">
            {persons.filter((p) => p.firstName && p.lastName).length} person(s)
            added. Returning to capture...
          </p>
        </div>
      </div>
    );
  }

  const hasGps = state.gps.lat != null && state.gps.lon != null;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-stone-800">Review OCR</h1>
            <p className="text-sm text-stone-500">{state.cemeteryName}</p>
          </div>
          <button
            type="button"
            onClick={handleDiscard}
            className="text-sm text-stone-500 hover:text-stone-700"
          >
            Cancel
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Photo + GPS card */}
        <div className="bg-white rounded-lg border border-stone-200 p-4">
          <div className="flex gap-4">
            {/* Thumbnail */}
            <img
              src={state.thumbnailUrl}
              alt="Headstone"
              className="w-24 h-24 object-cover rounded-lg flex-shrink-0"
            />

            {/* GPS mini-map or no-GPS message */}
            <div className="flex-1">
              {hasGps ? (
                <div className="space-y-2">
                  <div className="h-28 rounded-lg overflow-hidden">
                    <MapContainer
                      center={[state.gps.lat!, state.gps.lon!]}
                      zoom={17}
                      scrollWheelZoom={false}
                      dragging={false}
                      zoomControl={false}
                      attributionControl={false}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <Marker position={[state.gps.lat!, state.gps.lon!]} />
                    </MapContainer>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-500">
                      {state.gps.lat!.toFixed(6)}, {state.gps.lon!.toFixed(6)}
                    </span>
                    <GpsAccuracyBadge accuracyMeters={state.gps.accuracy} />
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-700 text-center">
                    No GPS data. Plot will be saved as unpinned.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Overall confidence */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs text-stone-500">OCR Confidence:</span>
          <span
            className={`text-xs font-medium ${
              state.overallConfidence >= 0.85
                ? 'text-green-700'
                : state.overallConfidence >= 0.7
                  ? 'text-yellow-700'
                  : 'text-red-700'
            }`}
          >
            {(state.overallConfidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* Plot info */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">
              Section
            </label>
            <input
              type="text"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="e.g. Section A"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">
              Plot Number
            </label>
            <input
              type="text"
              value={plotNumber}
              onChange={(e) => setPlotNumber(e.target.value)}
              placeholder="e.g. A-101"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Person cards */}
        {persons.map((person, i) => (
          <PersonCard
            key={i}
            person={person}
            index={i}
            onChange={handlePersonChange}
            onRemove={handleRemovePerson}
            canRemove={persons.length > 1}
          />
        ))}

        {/* Raw OCR text (collapsible) */}
        <details className="bg-stone-100 rounded-lg p-3">
          <summary className="text-xs font-medium text-stone-500 cursor-pointer">
            Raw OCR Text
          </summary>
          <pre className="mt-2 text-xs text-stone-600 whitespace-pre-wrap font-mono">
            {state.rawText}
          </pre>
        </details>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Confirm & Save'}
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            className="w-full py-2 text-sm text-red-600 hover:text-red-800"
          >
            Discard
          </button>
        </div>
      </main>
    </div>
  );
}
