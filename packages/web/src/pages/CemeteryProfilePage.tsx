import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { QRCodeSVG } from 'qrcode.react';
import { fetchCemeteryBySlug, fetchCemeteryPlots } from '@web/lib/apiClient';
import 'leaflet/dist/leaflet.css';

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Cemetery {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  centerLon: number | null;
  centerLat: number | null;
  contactEmail: string | null;
  contactPhone: string | null;
  hoursDescription: string | null;
  isPubliclySearchable: boolean;
}

interface PlotMarker {
  id: string;
  plotNumber: string | null;
  section: string | null;
  lon: number | null;
  lat: number | null;
  status: string;
  personName: string | null;
}

export default function CemeteryProfilePage() {
  const { cemeterySlug } = useParams<{ cemeterySlug: string }>();
  const navigate = useNavigate();
  const [cemetery, setCemetery] = useState<Cemetery | null>(null);
  const [plots, setPlots] = useState<PlotMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showQr, setShowQr] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cemeterySlug) return;
    setLoading(true);

    Promise.all([
      fetchCemeteryBySlug(cemeterySlug),
      fetchCemeteryPlots(cemeterySlug),
    ])
      .then(([cem, allPlots]) => {
        setCemetery(cem);
        setPlots(allPlots);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [cemeterySlug]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    navigate(
      `/search?q=${encodeURIComponent(searchQuery.trim())}&cemetery=${cemeterySlug}`,
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !cemetery) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg text-red-600 mb-4">
            {error ?? 'Cemetery not found'}
          </p>
          <Link to="/" className="text-emerald-600 underline">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  // Plots with GPS coordinates for the map
  const pinnedPlots = plots.filter(
    (p): p is PlotMarker & { lat: number; lon: number } =>
      p.lat != null && p.lon != null,
  );

  // Calculate map center: use cemetery center, or average of pinned plots, or default
  let mapCenter: [number, number] | null = null;
  if (cemetery.centerLat != null && cemetery.centerLon != null) {
    mapCenter = [cemetery.centerLat, cemetery.centerLon];
  } else if (pinnedPlots.length > 0) {
    const avgLat = pinnedPlots.reduce((s, p) => s + p.lat, 0) / pinnedPlots.length;
    const avgLon = pinnedPlots.reduce((s, p) => s + p.lon, 0) / pinnedPlots.length;
    mapCenter = [avgLat, avgLon];
  }

  const totalPlots = plots.length;
  const pinnedCount = pinnedPlots.length;
  const unpinnedCount = totalPlots - pinnedCount;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* QR Code Print Modal */}
      {showQr && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full">
            {/* Print-friendly card */}
            <div ref={printRef} className="p-8 text-center">
              <h2 className="text-2xl font-bold text-stone-800 mb-1">
                Scythe
              </h2>
              <div className="my-6 flex justify-center">
                <QRCodeSVG
                  value={`${window.location.origin}/${cemetery.slug}`}
                  size={200}
                  level="M"
                />
              </div>
              <h3 className="text-lg font-semibold text-stone-800">
                {cemetery.name}
              </h3>
              <p className="text-sm text-stone-500 mt-2">
                Scan to search for a grave
              </p>
            </div>

            {/* Actions (hidden in print) */}
            <div className="px-8 pb-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  const printContent = printRef.current;
                  if (!printContent) return;
                  const win = window.open('', '_blank');
                  if (!win) return;
                  win.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <title>QR Code - ${cemetery.name}</title>
                      <style>
                        body { font-family: system-ui, sans-serif; display: flex; justify-content: center; padding: 2rem; }
                        .card { text-align: center; border: 2px solid #e7e5e4; border-radius: 1rem; padding: 3rem 2rem; max-width: 320px; }
                        h2 { font-size: 1.75rem; font-weight: 700; color: #1c1917; margin: 0 0 0.25rem; }
                        .qr { margin: 1.5rem 0; }
                        h3 { font-size: 1.125rem; font-weight: 600; color: #1c1917; margin: 0; }
                        p { font-size: 0.875rem; color: #78716c; margin: 0.5rem 0 0; }
                      </style>
                    </head>
                    <body>
                      <div class="card">${printContent.innerHTML}</div>
                    </body>
                    </html>
                  `);
                  win.document.close();
                  win.print();
                }}
                className="flex-1 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Print
              </button>
              <button
                type="button"
                onClick={() => setShowQr(false)}
                className="flex-1 py-2 text-sm text-stone-600 border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
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
            <Link to="/contribute" className="text-stone-500 hover:text-stone-700">
              Add a Grave
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Cemetery info */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-stone-800 mb-1">
              {cemetery.name}
            </h1>
            <p className="text-stone-600">
              {cemetery.address}
              <br />
              {cemetery.city}, {cemetery.state} {cemetery.zip}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowQr(true)}
            className="flex-shrink-0 px-3 py-2 text-sm text-emerald-700 border border-emerald-300 rounded-lg hover:bg-emerald-50 transition-colors"
          >
            Print QR Code
          </button>
        </div>

        {/* Contact info */}
        <div className="mt-4 space-y-1">
          {cemetery.contactPhone && (
            <p className="text-sm text-stone-600">
              <span className="font-medium">Phone:</span>{' '}
              <a
                href={`tel:${cemetery.contactPhone}`}
                className="text-emerald-700 hover:underline"
              >
                {cemetery.contactPhone}
              </a>
            </p>
          )}
          {cemetery.contactEmail && (
            <p className="text-sm text-stone-600">
              <span className="font-medium">Email:</span>{' '}
              <a
                href={`mailto:${cemetery.contactEmail}`}
                className="text-emerald-700 hover:underline"
              >
                {cemetery.contactEmail}
              </a>
            </p>
          )}
          {cemetery.hoursDescription && (
            <p className="text-sm text-stone-600">
              <span className="font-medium">Hours:</span>{' '}
              {cemetery.hoursDescription}
            </p>
          )}
        </div>

        {/* Stats */}
        {totalPlots > 0 && (
          <div className="mt-4 flex gap-4 text-sm text-stone-500">
            <span>{totalPlots} burial records</span>
            {pinnedCount > 0 && <span>{pinnedCount} GPS-pinned</span>}
            {unpinnedCount > 0 && <span>{unpinnedCount} unpinned</span>}
          </div>
        )}

        {/* Map overview */}
        {mapCenter && pinnedPlots.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-stone-700 mb-3">
              Cemetery Map
            </h2>
            <div className="rounded-lg overflow-hidden border border-stone-200 h-72">
              <MapContainer
                center={mapCenter}
                zoom={17}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {pinnedPlots.map((plot) => (
                  <Marker
                    key={plot.id}
                    position={[plot.lat, plot.lon]}
                    icon={markerIcon}
                  >
                    <Popup>
                      <div className="text-sm">
                        {plot.personName && (
                          <p className="font-medium">{plot.personName}</p>
                        )}
                        {plot.section && (
                          <p className="text-stone-500">{plot.section}</p>
                        )}
                        {plot.plotNumber && (
                          <p className="text-stone-500">
                            Plot {plot.plotNumber}
                          </p>
                        )}
                        <Link
                          to={`/${cemeterySlug}/plot/${plot.id}`}
                          className="text-emerald-600 hover:underline text-xs mt-1 inline-block"
                        >
                          View details
                        </Link>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </div>
        )}

        {/* Search within this cemetery */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-stone-700 mb-3">
            Search this cemetery
          </h2>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name..."
              className="flex-1 px-4 py-3 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Search
            </button>
          </form>
        </div>

        {/* Help digitize CTA */}
        <div className="mt-8 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-sm font-medium text-emerald-800">Know someone buried here?</p>
          <p className="text-xs text-emerald-700 mt-1">
            Help us digitize this cemetery by photographing headstones.
          </p>
          <Link
            to="/contribute"
            className="inline-block mt-3 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Add a Grave
          </Link>
        </div>
      </main>
    </div>
  );
}
