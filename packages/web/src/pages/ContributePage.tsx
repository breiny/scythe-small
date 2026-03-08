import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import { GpsAccuracyBadge } from '@web/components/GpsAccuracyBadge';
import { extractExifData } from '@web/lib/exif';
import { contributeProcess, contributeSubmit } from '@web/lib/apiClient';
import type { OcrParsedPerson, Cemetery } from '@scythe/shared';
import 'leaflet/dist/leaflet.css';

type FieldConfidence = 'high' | 'medium' | 'low';

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

interface ProcessResult {
  photoId: string;
  thumbnailUrl: string;
  photoUrl: string;
  rawText: string;
  persons: OcrParsedPerson[];
  overallConfidence: number;
  gps: { lat: number | null; lon: number | null; accuracy: number | null };
  detectedCemetery: Cemetery | null;
}

type Step = 'landing' | 'processing' | 'review' | 'success';

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

export default function ContributePage() {
  const [step, setStep] = useState<Step>('landing');
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [persons, setPersons] = useState<EditablePerson[]>([]);
  const [submitterName, setSubmitterName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitCooldown = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep('landing');
    setError(null);
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setPersons([]);
    setSubmitterName('');
    setSubmitting(false);
    submitCooldown.current = false;
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Client-side file size check (10MB)
    if (selected.size > 10 * 1024 * 1024) {
      setError('Photo must be under 10MB. Please try a smaller image.');
      return;
    }

    setError(null);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));

    // Extract EXIF
    const exif = await extractExifData(selected);
    if (exif.lat == null || exif.lon == null) {
      setError(
        "We couldn't detect your location from the photo. Please make sure location services are enabled for your camera and try again.",
      );
      return;
    }

    // Move to processing
    setStep('processing');

    try {
      const res = await contributeProcess(selected, {
        exifLat: exif.lat,
        exifLon: exif.lon,
        exifAccuracy: exif.accuracy,
        capturedAt: exif.capturedAt,
      });

      setResult(res);
      setPersons(
        (res.persons as OcrParsedPerson[]).length > 0
          ? (res.persons as OcrParsedPerson[]).map((p: OcrParsedPerson) => ({
              firstName: p.firstName ?? '',
              middleName: p.middleName ?? '',
              lastName: p.lastName ?? '',
              maidenName: p.maidenName ?? '',
              dateOfBirth: p.dateOfBirth ?? '',
              dateOfDeath: p.dateOfDeath ?? '',
              inscription: p.inscription ?? '',
              confidence: p.confidence,
            }))
          : [
              {
                firstName: '',
                middleName: '',
                lastName: '',
                maidenName: '',
                dateOfBirth: '',
                dateOfDeath: '',
                inscription: '',
                confidence: {
                  firstName: 'low' as const,
                  lastName: 'low' as const,
                  dateOfBirth: 'low' as const,
                  dateOfDeath: 'low' as const,
                  inscription: 'low' as const,
                },
              },
            ],
      );
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
      setStep('landing');
    }
  }

  async function handleSubmit() {
    if (!result || submitCooldown.current || submitting) return;

    const validPersons = persons.filter(
      (p) => p.firstName.trim() && p.lastName.trim(),
    );
    if (validPersons.length === 0) {
      setError('At least one person must have a first and last name.');
      return;
    }

    submitCooldown.current = true;
    setSubmitting(true);
    setError(null);

    try {
      await contributeSubmit({
        photoId: result.photoId,
        cemeteryId: result.detectedCemetery?.id,
        lat: result.gps.lat!,
        lon: result.gps.lon!,
        gpsAccuracyMeters: result.gps.accuracy ?? undefined,
        persons: validPersons.map((p) => ({
          firstName: p.firstName.trim(),
          middleName: p.middleName.trim() || undefined,
          lastName: p.lastName.trim(),
          maidenName: p.maidenName.trim() || undefined,
          dateOfBirth: p.dateOfBirth.trim() || undefined,
          dateOfDeath: p.dateOfDeath.trim() || undefined,
          inscription: p.inscription.trim() || undefined,
        })),
        submittedBy: submitterName.trim() || undefined,
      });

      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
      setTimeout(() => {
        submitCooldown.current = false;
      }, 3000);
    }
  }

  function handlePersonChange(index: number, updated: EditablePerson) {
    setPersons((prev) => prev.map((p, i) => (i === index ? updated : p)));
  }

  // --- LANDING ---
  if (step === 'landing') {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col">
        <header className="bg-white border-b border-stone-200">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link to="/" className="text-xl font-bold text-stone-800">
              Scythe
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link to="/search" className="text-stone-500 hover:text-stone-700">
                Search
              </Link>
              <Link to="/directory" className="text-stone-500 hover:text-stone-700">
                Directory
              </Link>
              <span className="text-emerald-600 font-medium">Add a Grave</span>
            </nav>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-stone-800 mb-2">
                Add a Grave
              </h1>
              <p className="text-stone-600">
                Help digitize this cemetery. Take a photo of a headstone and
                we'll do the rest.
              </p>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 bg-emerald-600 text-white text-lg font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Take a Photo
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />

            {error && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                {error}
              </div>
            )}

            <p className="text-xs text-stone-400">
              Your photo's GPS location will be used to identify the cemetery.
              No account required.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- PROCESSING ---
  if (step === 'processing') {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto" />
          <h2 className="text-lg font-medium text-stone-800">
            Reading headstone...
          </h2>
          <p className="text-sm text-stone-500">
            Analyzing photo and detecting cemetery
          </p>
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Captured headstone"
              className="w-32 h-32 object-cover rounded-lg mx-auto opacity-60"
            />
          )}
        </div>
      </div>
    );
  }

  // --- SUCCESS ---
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <span className="text-3xl text-emerald-600">&#10003;</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-stone-800 mb-2">
              Thank you!
            </h2>
            <p className="text-stone-600">
              Your contribution will be reviewed before appearing in search
              results.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={reset}
              className="w-full py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Add Another Grave
            </button>
            <Link
              to="/search"
              className="block w-full py-3 bg-white text-stone-700 font-medium rounded-lg border border-stone-300 hover:bg-stone-50 transition-colors text-center"
            >
              Search Records
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- REVIEW ---
  if (!result) return null;

  const hasGps = result.gps.lat != null && result.gps.lon != null;

  const fields: Array<{
    key: keyof EditablePerson;
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
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold text-stone-800">
            Review & Submit
          </h1>
          <button
            type="button"
            onClick={reset}
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
            <img
              src={result.thumbnailUrl}
              alt="Headstone"
              className="w-24 h-24 object-cover rounded-lg flex-shrink-0"
            />
            <div className="flex-1">
              {hasGps ? (
                <div className="space-y-2">
                  <div className="h-28 rounded-lg overflow-hidden">
                    <MapContainer
                      center={[result.gps.lat!, result.gps.lon!]}
                      zoom={17}
                      scrollWheelZoom={false}
                      dragging={false}
                      zoomControl={false}
                      attributionControl={false}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <Marker position={[result.gps.lat!, result.gps.lon!]} />
                    </MapContainer>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-500">
                      {result.gps.lat!.toFixed(6)}, {result.gps.lon!.toFixed(6)}
                    </span>
                    <GpsAccuracyBadge accuracyMeters={result.gps.accuracy} />
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-700 text-center">
                    No GPS data available.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cemetery detection */}
        <div className="bg-white rounded-lg border border-stone-200 p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500">Cemetery:</span>
            {result.detectedCemetery ? (
              <span className="text-sm font-medium text-stone-800">
                {result.detectedCemetery.name}
              </span>
            ) : (
              <span className="text-sm text-amber-700">
                Location not identified — we've saved the GPS coordinates
              </span>
            )}
          </div>
        </div>

        {/* Overall confidence */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs text-stone-500">OCR Confidence:</span>
          <span
            className={`text-xs font-medium ${
              result.overallConfidence >= 0.85
                ? 'text-green-700'
                : result.overallConfidence >= 0.7
                  ? 'text-yellow-700'
                  : 'text-red-700'
            }`}
          >
            {(result.overallConfidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* Person cards */}
        {persons.map((person, i) => (
          <div
            key={i}
            className="bg-white rounded-lg border border-stone-200 p-4 space-y-3"
          >
            <h3 className="text-sm font-bold text-stone-800">
              Person {i + 1}
            </h3>
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
                    value={person[key] as string}
                    onChange={(e) =>
                      handlePersonChange(i, { ...person, [key]: e.target.value })
                    }
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

        {/* Submitter name */}
        <div className="bg-white rounded-lg border border-stone-200 p-4">
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Your name (optional)
          </label>
          <input
            type="text"
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            placeholder="Anonymous Visitor"
            className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="text-xs text-stone-400 mt-1">
            For attribution on the record
          </p>
        </div>

        {/* Raw OCR text */}
        <details className="bg-stone-100 rounded-lg p-3">
          <summary className="text-xs font-medium text-stone-500 cursor-pointer">
            Raw OCR Text
          </summary>
          <pre className="mt-2 text-xs text-stone-600 whitespace-pre-wrap font-mono">
            {result.rawText}
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
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
          <button
            type="button"
            onClick={reset}
            className="w-full py-2 text-sm text-stone-500 hover:text-stone-700"
          >
            Cancel
          </button>
        </div>
      </main>
    </div>
  );
}
