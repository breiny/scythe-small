import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { fetchPlotDetail } from '@web/lib/apiClient';
import { formatDate, formatLifespan } from '@web/lib/format';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon in bundled environments
import L from 'leaflet';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface PlotDetailData {
  plot: {
    id: string;
    cemeteryId: string;
    plotNumber: string | null;
    section: string | null;
    lon: number | null;
    lat: number | null;
    gpsAccuracyMeters: number | null;
    gpsSource: string | null;
    status: string;
  };
  cemetery: {
    id: string;
    name: string;
    slug: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    contactPhone: string | null;
  };
  persons: Array<{
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    maidenName: string | null;
    dateOfBirth: string | null;
    dateOfDeath: string | null;
    inscription: string | null;
    verificationStatus?: string;
    submittedBy?: string | null;
  }>;
  photos: Array<{
    id: string;
    photoUrl: string;
    thumbnailUrl: string | null;
  }>;
}

export default function PlotDetailPage() {
  const { cemeterySlug, plotId } = useParams<{
    cemeterySlug: string;
    plotId: string;
  }>();
  const [data, setData] = useState<PlotDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullScreenPhoto, setFullScreenPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!plotId) return;
    setLoading(true);
    fetchPlotDetail(plotId)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [plotId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg text-red-600 mb-4">
            {error ?? 'Plot not found'}
          </p>
          <Link to="/" className="text-emerald-600 underline">
            Back to search
          </Link>
        </div>
      </div>
    );
  }

  const { plot, cemetery, persons, photos } = data;
  const primaryPerson = persons[0];
  const hasGps = plot.lat != null && plot.lon != null;

  const fullName = primaryPerson
    ? [primaryPerson.firstName, primaryPerson.middleName, primaryPerson.lastName]
        .filter(Boolean)
        .join(' ')
    : 'Unknown';

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Full-screen photo overlay */}
      {fullScreenPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFullScreenPhoto(null)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Escape' && setFullScreenPhoto(null)}
        >
          <img
            src={fullScreenPhoto}
            alt="Full size headstone"
            className="max-w-full max-h-full object-contain"
          />
          <button
            className="absolute top-4 right-4 text-white text-xl bg-black/50 rounded-full w-10 h-10 flex items-center justify-center"
            onClick={() => setFullScreenPhoto(null)}
            aria-label="Close photo"
          >
            &#10005;
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-stone-800">
            Scythe
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link
              to={`/search?q=${encodeURIComponent(primaryPerson?.lastName ?? '')}`}
              className="text-stone-500 hover:text-stone-700"
            >
              Back to search
            </Link>
            <Link
              to="/contribute"
              className="text-emerald-600 hover:text-emerald-700"
            >
              Add a Grave
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Headstone photo */}
        {photos.length > 0 && (
          <div className="mb-6">
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setFullScreenPhoto(photo.photoUrl)}
                  className="aspect-square overflow-hidden rounded-lg bg-stone-100"
                >
                  <img
                    src={photo.thumbnailUrl ?? photo.photoUrl}
                    alt="Headstone"
                    className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Unverified notice */}
        {persons.some((p) => p.verificationStatus === 'unverified') && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800 font-medium">Community Submitted Record</p>
            <p className="text-xs text-amber-700 mt-1">
              This record was submitted by a visitor and hasn't been verified by the cemetery.
            </p>
          </div>
        )}

        {/* Name and dates */}
        {persons.map((person) => {
          const name = [
            person.firstName,
            person.middleName,
            person.lastName,
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div key={person.id} className="mb-6">
              <h1 className="text-2xl font-bold text-stone-800">{name}</h1>
              {person.maidenName && (
                <p className="text-sm text-stone-500">
                  n&eacute;e {person.maidenName}
                </p>
              )}
              <p className="text-lg text-stone-600 mt-1">
                {formatLifespan(person.dateOfBirth, person.dateOfDeath)}
              </p>
              {(person.dateOfBirth || person.dateOfDeath) && (
                <p className="text-sm text-stone-400">
                  {person.dateOfBirth && (
                    <span>Born {formatDate(person.dateOfBirth)}</span>
                  )}
                  {person.dateOfBirth && person.dateOfDeath && (
                    <span> &middot; </span>
                  )}
                  {person.dateOfDeath && (
                    <span>Died {formatDate(person.dateOfDeath)}</span>
                  )}
                </p>
              )}
              {person.inscription && (
                <p className="text-stone-600 italic mt-3">
                  &ldquo;{person.inscription}&rdquo;
                </p>
              )}
            </div>
          );
        })}

        {/* Cemetery and plot info */}
        <div className="p-4 bg-white rounded-lg border border-stone-200 mb-6">
          <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-2">
            Location
          </h2>
          <Link
            to={`/${cemetery.slug}`}
            className="text-emerald-700 font-medium hover:underline"
          >
            {cemetery.name}
          </Link>
          <p className="text-sm text-stone-500 mt-1">
            {cemetery.address}, {cemetery.city}, {cemetery.state} {cemetery.zip}
          </p>
          {(plot.section || plot.plotNumber) && (
            <p className="text-sm text-stone-600 mt-2">
              {plot.section && <span>{plot.section}</span>}
              {plot.section && plot.plotNumber && <span> &middot; </span>}
              {plot.plotNumber && <span>Plot {plot.plotNumber}</span>}
            </p>
          )}
          {cemetery.contactPhone && (
            <p className="text-sm text-stone-400 mt-1">
              {cemetery.contactPhone}
            </p>
          )}
        </div>

        {/* Map */}
        {hasGps && (
          <div className="mb-6">
            <div className="rounded-lg overflow-hidden border border-stone-200 h-64">
              <MapContainer
                center={[plot.lat!, plot.lon!]}
                zoom={18}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[plot.lat!, plot.lon!]}>
                  <Popup>{fullName}</Popup>
                </Marker>
              </MapContainer>
            </div>
            <p className="text-xs text-stone-400 mt-1 text-center">
              {plot.lat!.toFixed(6)}, {plot.lon!.toFixed(6)}
              {plot.gpsSource ? ` (${plot.gpsSource})` : ''}
            </p>
          </div>
        )}

        {/* Navigate button */}
        {hasGps ? (
          <Link
            to={`/${cemetery.slug}/plot/${plot.id}/navigate`}
            className="block w-full py-4 bg-emerald-600 text-white font-semibold rounded-lg text-lg text-center hover:bg-emerald-700 transition-colors mb-6"
          >
            Navigate to Grave
          </Link>
        ) : (
          <div className="relative group mb-6">
            <button
              type="button"
              disabled
              className="w-full py-4 bg-emerald-600 text-white font-semibold rounded-lg opacity-60 cursor-not-allowed text-lg"
            >
              Navigate to Grave
            </button>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-xs px-3 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              No GPS coordinates for this plot
            </div>
          </div>
        )}

        {/* Additional persons on this plot */}
        {persons.length > 1 && (
          <div className="p-4 bg-white rounded-lg border border-stone-200 mb-6">
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
              Also at this plot
            </h2>
            {persons.slice(1).map((person) => {
              const name = [
                person.firstName,
                person.middleName,
                person.lastName,
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div key={person.id} className="mb-2 last:mb-0">
                  <p className="font-medium text-stone-700">{name}</p>
                  <p className="text-sm text-stone-500">
                    {formatLifespan(person.dateOfBirth, person.dateOfDeath)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
