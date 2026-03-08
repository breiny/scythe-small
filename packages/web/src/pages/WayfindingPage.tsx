import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { fetchPlotDetail } from '@web/lib/apiClient';
import 'leaflet/dist/leaflet.css';

// Marker icons
const plotIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const userIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface GpsPosition {
  lat: number;
  lon: number;
  accuracy: number;
}

interface PlotData {
  plot: {
    id: string;
    lat: number | null;
    lon: number | null;
    plotNumber: string | null;
    section: string | null;
  };
  cemetery: {
    name: string;
    slug: string;
  };
  persons: Array<{
    firstName: string;
    lastName: string;
  }>;
}

/** Haversine distance in meters between two GPS points */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Bearing from point 1 to point 2, in degrees (0 = north, 90 = east) */
function bearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function formatDistance(meters: number): string {
  if (meters < 10) return `${Math.round(meters)} m`;
  if (meters < 1000) return `${Math.round(meters / 5) * 5} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function compassDirection(degrees: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(degrees / 45) % 8;
  return dirs[idx]!;
}

// Auto-fit map bounds to show both user and plot
function MapBoundsUpdater({ userPos, plotPos }: {
  userPos: GpsPosition | null;
  plotPos: { lat: number; lon: number };
}) {
  const map = useMap();
  const hasFit = useRef(false);

  useEffect(() => {
    if (userPos && !hasFit.current) {
      const bounds = L.latLngBounds(
        [userPos.lat, userPos.lon],
        [plotPos.lat, plotPos.lon],
      );
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 });
      hasFit.current = true;
    }
  }, [userPos, plotPos, map]);

  return null;
}

export default function WayfindingPage() {
  const { cemeterySlug, plotId } = useParams<{
    cemeterySlug: string;
    plotId: string;
  }>();

  const [plotData, setPlotData] = useState<PlotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gps, setGps] = useState<GpsPosition | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Fetch plot data
  useEffect(() => {
    if (!plotId) return;
    setLoading(true);
    fetchPlotDetail(plotId)
      .then(setPlotData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [plotId]);

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
        // Use heading from GPS if available
        if (pos.coords.heading != null && !isNaN(pos.coords.heading)) {
          setDeviceHeading(pos.coords.heading);
        }
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

  // Try device orientation for compass heading
  useEffect(() => {
    function handleOrientation(e: DeviceOrientationEvent) {
      // alpha is the compass heading on devices that support it
      if (e.alpha != null) {
        // On iOS, webkitCompassHeading is more accurate
        const heading = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
          .webkitCompassHeading ?? (360 - e.alpha);
        setDeviceHeading(heading);
      }
    }

    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => window.removeEventListener('deviceorientation', handleOrientation, true);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !plotData || plotData.plot.lat == null || plotData.plot.lon == null) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg text-red-600 mb-4">
            {error ?? 'This plot does not have GPS coordinates'}
          </p>
          <Link
            to={`/${cemeterySlug}/plot/${plotId}`}
            className="text-emerald-600 underline"
          >
            Back to plot
          </Link>
        </div>
      </div>
    );
  }

  const plotPos = { lat: plotData.plot.lat!, lon: plotData.plot.lon! };
  const personName = plotData.persons[0]
    ? `${plotData.persons[0].firstName} ${plotData.persons[0].lastName}`
    : 'Unknown';

  // Calculate distance and bearing
  const distance = gps
    ? haversineDistance(gps.lat, gps.lon, plotPos.lat, plotPos.lon)
    : null;

  const bearingToPlot = gps
    ? bearing(gps.lat, gps.lon, plotPos.lat, plotPos.lon)
    : null;

  // Relative bearing: how many degrees to turn from current heading
  const relativeBearing =
    bearingToPlot !== null && deviceHeading !== null
      ? ((bearingToPlot - deviceHeading + 360) % 360)
      : null;

  const arrived = distance !== null && distance < 5;

  const defaultCenter: [number, number] = gps
    ? [(gps.lat + plotPos.lat) / 2, (gps.lon + plotPos.lon) / 2]
    : [plotPos.lat, plotPos.lon];

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-stone-200 px-4 py-2 flex items-center justify-between z-[1000] relative">
        <Link
          to={`/${cemeterySlug}/plot/${plotId}`}
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          &larr; Back
        </Link>
        <span className="text-sm font-medium text-stone-800 truncate mx-2">
          {personName}
        </span>
        <span className="text-xs text-stone-400 shrink-0">
          {plotData.cemetery.name}
        </span>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={defaultCenter}
          zoom={17}
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapBoundsUpdater userPos={gps} plotPos={plotPos} />

          {/* Plot marker */}
          <Marker position={[plotPos.lat, plotPos.lon]} icon={plotIcon} />

          {/* User position */}
          {gps && (
            <>
              <Circle
                center={[gps.lat, gps.lon]}
                radius={gps.accuracy}
                pathOptions={{
                  color: '#3b82f6',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.1,
                  weight: 1,
                }}
              />
              <Marker position={[gps.lat, gps.lon]} icon={userIcon} />
            </>
          )}

          {/* Line connecting user to plot */}
          {gps && (
            <Polyline
              positions={[
                [gps.lat, gps.lon],
                [plotPos.lat, plotPos.lon],
              ]}
              pathOptions={{
                color: '#10b981',
                weight: 3,
                dashArray: '8, 8',
                opacity: 0.7,
              }}
            />
          )}
        </MapContainer>

        {/* GPS error */}
        {gpsError && (
          <div className="absolute top-4 left-4 right-4 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg z-[1000]">
            {gpsError}
          </div>
        )}
      </div>

      {/* Bottom navigation panel */}
      <div className="bg-white border-t border-stone-200 z-[1000]">
        {!gps ? (
          <div className="px-4 py-6 text-center">
            <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-stone-500">Acquiring GPS signal...</p>
          </div>
        ) : arrived ? (
          <div className="px-4 py-6 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-emerald-700">You have arrived</p>
            <p className="text-sm text-stone-500 mt-1">{personName}</p>
            {plotData.plot.section && (
              <p className="text-xs text-stone-400 mt-1">
                {plotData.plot.section}
                {plotData.plot.plotNumber && ` \u00B7 Plot ${plotData.plot.plotNumber}`}
              </p>
            )}
          </div>
        ) : (
          <div className="px-4 py-4">
            <div className="flex items-center gap-4">
              {/* Compass arrow */}
              <div className="w-20 h-20 shrink-0 flex items-center justify-center">
                <div
                  className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center transition-transform duration-300"
                  style={{
                    transform: relativeBearing !== null
                      ? `rotate(${relativeBearing}deg)`
                      : 'none',
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-8 h-8 text-emerald-600"
                    fill="currentColor"
                  >
                    <path d="M12 2l4 8H8l4-8z" />
                    <rect x="11" y="9" width="2" height="10" rx="1" />
                  </svg>
                </div>
              </div>

              {/* Distance info */}
              <div className="flex-1 min-w-0">
                <p className="text-3xl font-bold text-stone-800">
                  {distance !== null ? formatDistance(distance) : '—'}
                </p>
                <p className="text-sm text-stone-500 mt-1">
                  {bearingToPlot !== null
                    ? `Head ${compassDirection(bearingToPlot)}`
                    : 'Calculating direction...'}
                </p>
                <p className="text-xs text-stone-400 mt-1 truncate">
                  to {personName}
                  {plotData.plot.section && ` \u00B7 ${plotData.plot.section}`}
                  {plotData.plot.plotNumber && ` \u00B7 ${plotData.plot.plotNumber}`}
                </p>
              </div>
            </div>

            {/* GPS accuracy indicator */}
            <div className="mt-3 flex items-center gap-2 text-xs text-stone-400">
              <div
                className={`w-2 h-2 rounded-full ${
                  gps.accuracy < 3
                    ? 'bg-green-500'
                    : gps.accuracy <= 5
                      ? 'bg-yellow-500'
                      : gps.accuracy <= 15
                        ? 'bg-orange-500'
                        : 'bg-red-500'
                }`}
              />
              GPS accuracy: {gps.accuracy.toFixed(0)}m
              {deviceHeading !== null && (
                <span className="ml-2">
                  Heading: {Math.round(deviceHeading)}\u00B0
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
