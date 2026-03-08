import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '@web/lib/AuthContext';
import { submitPinDrop } from '@web/lib/apiClient';
import { GPS_ACCURACY_THRESHOLD_METERS } from '@scythe/shared';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const pinIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface GpsPosition {
  lat: number;
  lon: number;
  accuracy: number;
}

interface DroppedPin {
  lat: number;
  lon: number;
}

function accuracyColor(accuracy: number): string {
  if (accuracy < 3) return '#22c55e'; // green
  if (accuracy <= 5) return '#eab308'; // yellow
  return '#ef4444'; // red
}

function accuracyLabel(accuracy: number): string {
  if (accuracy < 3) return 'Excellent';
  if (accuracy <= 5) return 'Good';
  return 'Poor';
}

function accuracyBgClass(accuracy: number): string {
  if (accuracy < 3) return 'bg-green-100 text-green-700';
  if (accuracy <= 5) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
}

// Component to recenter map when GPS position changes
function MapFollower({ position }: { position: GpsPosition | null }) {
  const map = useMap();
  const hasFlown = useRef(false);

  useEffect(() => {
    if (position && !hasFlown.current) {
      map.flyTo([position.lat, position.lon], 18, { duration: 1 });
      hasFlown.current = true;
    }
  }, [position, map]);

  return null;
}

export default function PinDropPage() {
  const { user } = useAuth();
  const [gps, setGps] = useState<GpsPosition | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [droppedPin, setDroppedPin] = useState<DroppedPin | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [dateOfDeath, setDateOfDeath] = useState('');
  const [section, setSection] = useState('');
  const [plotNumber, setPlotNumber] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);

  // Start GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsError(null);
      },
      (err) => {
        setGpsError(`GPS error: ${err.message}`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const canDropPin = gps !== null && gps.accuracy < GPS_ACCURACY_THRESHOLD_METERS;

  const handleDropPin = useCallback(() => {
    if (!gps || !canDropPin) return;
    setDroppedPin({ lat: gps.lat, lon: gps.lon });
    setShowForm(true);
    setSaveError(null);
    setLastSaved(null);
  }, [gps, canDropPin]);

  function resetForm() {
    setFirstName('');
    setLastName('');
    setDateOfBirth('');
    setDateOfDeath('');
    setSection('');
    setPlotNumber('');
    setPhoto(null);
    setDroppedPin(null);
    setShowForm(false);
    setSaveError(null);
    setLastSaved(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!droppedPin || !gps || !user) return;

    setSaving(true);
    setSaveError(null);

    try {
      await submitPinDrop(
        {
          cemeteryId: user.cemeteryId,
          lon: droppedPin.lon,
          lat: droppedPin.lat,
          gpsAccuracyMeters: gps.accuracy,
          firstName,
          lastName,
          dateOfBirth: dateOfBirth || undefined,
          dateOfDeath: dateOfDeath || undefined,
          section: section || undefined,
          plotNumber: plotNumber || undefined,
        },
        photo ?? undefined,
      );

      setSessionCount((c) => c + 1);
      setLastSaved(`${firstName} ${lastName}`);
      resetForm();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const defaultCenter: [number, number] = gps
    ? [gps.lat, gps.lon]
    : [39.7817, -89.6501]; // Springfield, IL fallback

  return (
    <div className="h-screen flex flex-col relative">
      {/* Top bar */}
      <div className="bg-white border-b border-stone-200 px-4 py-2 flex items-center justify-between z-[1000] relative">
        <Link to="/" className="text-lg font-bold text-stone-800">
          Scythe
        </Link>
        <div className="flex items-center gap-3">
          {sessionCount > 0 && (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-600 text-white text-sm font-bold">
              {sessionCount}
            </span>
          )}
          {gps && (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${accuracyBgClass(gps.accuracy)}`}>
              {accuracyLabel(gps.accuracy)} ({gps.accuracy.toFixed(1)}m)
            </span>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={defaultCenter}
          zoom={18}
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapFollower position={gps} />

          {/* User position + accuracy circle */}
          {gps && (
            <>
              <Circle
                center={[gps.lat, gps.lon]}
                radius={gps.accuracy}
                pathOptions={{
                  color: accuracyColor(gps.accuracy),
                  fillColor: accuracyColor(gps.accuracy),
                  fillOpacity: 0.15,
                  weight: 2,
                }}
              />
              <Marker position={[gps.lat, gps.lon]} icon={defaultIcon} />
            </>
          )}

          {/* Dropped pin */}
          {droppedPin && (
            <Marker position={[droppedPin.lat, droppedPin.lon]} icon={pinIcon} />
          )}
        </MapContainer>

        {/* GPS error overlay */}
        {gpsError && (
          <div className="absolute top-4 left-4 right-4 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg z-[1000]">
            {gpsError}
          </div>
        )}

        {/* Last saved toast */}
        {lastSaved && !showForm && (
          <div className="absolute top-4 left-4 right-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm p-3 rounded-lg z-[1000]">
            Saved: {lastSaved}. Ready for next pin.
          </div>
        )}

        {/* Drop Pin button */}
        {!showForm && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000]">
            <button
              onClick={handleDropPin}
              disabled={!canDropPin}
              className="px-8 py-4 bg-emerald-600 text-white text-lg font-semibold rounded-full shadow-lg hover:bg-emerald-700 transition-colors disabled:bg-stone-400 disabled:cursor-not-allowed"
            >
              Drop Pin
            </button>
            {gps && !canDropPin && (
              <p className="text-center text-xs text-stone-500 mt-2 bg-white/80 rounded px-2 py-1">
                Waiting for GPS accuracy under {GPS_ACCURACY_THRESHOLD_METERS}m (currently {gps.accuracy.toFixed(1)}m)
              </p>
            )}
          </div>
        )}
      </div>

      {/* Slide-up form panel */}
      {showForm && (
        <div className="bg-white border-t border-stone-200 p-4 max-h-[60vh] overflow-y-auto z-[1000]">
          <form onSubmit={handleSave} className="space-y-3 max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-stone-800">New Burial Record</h2>
              <button
                type="button"
                onClick={resetForm}
                className="text-sm text-stone-500 hover:text-stone-700"
              >
                Cancel
              </button>
            </div>

            {saveError && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">
                {saveError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pin-firstName" className="block text-sm font-medium text-stone-700 mb-1">
                  First Name *
                </label>
                <input
                  id="pin-firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="pin-lastName" className="block text-sm font-medium text-stone-700 mb-1">
                  Last Name *
                </label>
                <input
                  id="pin-lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pin-dob" className="block text-sm font-medium text-stone-700 mb-1">
                  Date of Birth
                </label>
                <input
                  id="pin-dob"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="pin-dod" className="block text-sm font-medium text-stone-700 mb-1">
                  Date of Death
                </label>
                <input
                  id="pin-dod"
                  type="date"
                  value={dateOfDeath}
                  onChange={(e) => setDateOfDeath(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pin-section" className="block text-sm font-medium text-stone-700 mb-1">
                  Section
                </label>
                <input
                  id="pin-section"
                  type="text"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="pin-plotNumber" className="block text-sm font-medium text-stone-700 mb-1">
                  Plot Number
                </label>
                <input
                  id="pin-plotNumber"
                  type="text"
                  value={plotNumber}
                  onChange={(e) => setPlotNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="pin-photo" className="block text-sm font-medium text-stone-700 mb-1">
                Photo (optional)
              </label>
              <input
                id="pin-photo"
                type="file"
                accept="image/jpeg,image/png,image/heic,image/heif"
                capture="environment"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-stone-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
              />
            </div>

            <button
              type="submit"
              disabled={saving || !firstName || !lastName}
              className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Record'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
