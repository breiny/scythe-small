import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchCemeteryDirectory,
  type DirectoryCemetery,
} from '@web/lib/apiClient';

type SortMode = 'name' | 'nearest';

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

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m away`;
  const km = meters / 1000;
  if (km < 100) return `${km.toFixed(1)}km away`;
  return `${Math.round(km)}km away`;
}

export default function DirectoryPage() {
  const [allCemeteries, setAllCemeteries] = useState<DirectoryCemetery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [locationRequested, setLocationRequested] = useState(false);

  useEffect(() => {
    fetchCemeteryDirectory()
      .then(setAllCemeteries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function requestLocation() {
    if (locationRequested) return;
    setLocationRequested(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
        setSortMode('nearest');
      },
      () => {
        // Permission denied or error — stay on name sort
        setSortMode('name');
      },
    );
  }

  function handleSortChange(mode: SortMode) {
    if (mode === 'nearest' && !userLocation) {
      requestLocation();
      return;
    }
    setSortMode(mode);
  }

  const filtered = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    let result = allCemeteries.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerFilter) ||
        c.city.toLowerCase().includes(lowerFilter) ||
        c.state.toLowerCase().includes(lowerFilter),
    );

    if (sortMode === 'nearest' && userLocation) {
      result = result
        .map((c) => ({
          ...c,
          distance:
            c.centerLat != null && c.centerLon != null
              ? haversineDistance(
                  userLocation.lat,
                  userLocation.lon,
                  c.centerLat,
                  c.centerLon,
                )
              : Infinity,
        }))
        .sort((a, b) => a.distance - b.distance);
    } else {
      result = result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [allCemeteries, filter, sortMode, userLocation]);

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-stone-800">
            Scythe
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/search"
              className="text-stone-500 hover:text-stone-700"
            >
              Search
            </Link>
            <Link
              to="/directory"
              className="text-emerald-600 font-medium"
            >
              Directory
            </Link>
            <Link
              to="/contribute"
              className="text-stone-500 hover:text-stone-700"
            >
              Add a Grave
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-stone-800 mb-1">
          Cemetery Directory
        </h1>
        <p className="text-stone-500 mb-6">
          Browse all cemeteries on the platform.
        </p>

        {/* Filter + sort controls */}
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, city, or state..."
            className="flex-1 px-4 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex rounded-lg border border-stone-300 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => handleSortChange('name')}
              className={`px-3 py-2 ${
                sortMode === 'name'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              A-Z
            </button>
            <button
              type="button"
              onClick={() => handleSortChange('nearest')}
              className={`px-3 py-2 border-l border-stone-300 ${
                sortMode === 'nearest'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              Nearest
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-stone-500 text-lg">
              {filter
                ? 'No cemeteries match your filter.'
                : 'No cemeteries found.'}
            </p>
          </div>
        )}

        {/* Cemetery cards */}
        {!loading && filtered.length > 0 && (
          <div className="grid gap-3">
            {filtered.map((cem) => (
              <CemeteryCard
                key={cem.id}
                cemetery={cem}
                distance={
                  sortMode === 'nearest' && userLocation && cem.centerLat != null && cem.centerLon != null
                    ? haversineDistance(
                        userLocation.lat,
                        userLocation.lon,
                        cem.centerLat,
                        cem.centerLon,
                      )
                    : null
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function CemeteryCard({
  cemetery,
  distance,
}: {
  cemetery: DirectoryCemetery;
  distance: number | null;
}) {
  return (
    <Link
      to={`/${cemetery.slug}`}
      className="flex gap-4 p-4 bg-white rounded-lg border border-stone-200 hover:border-emerald-300 transition-colors"
    >
      {/* Placeholder icon */}
      <div className="w-14 h-14 flex-shrink-0 rounded-lg bg-emerald-50 flex items-center justify-center">
        <svg
          className="w-7 h-7 text-emerald-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-stone-800 truncate">
          {cemetery.name}
        </h3>
        <p className="text-sm text-stone-500">
          {cemetery.city}, {cemetery.state}
        </p>
        <div className="flex gap-3 mt-1 text-xs text-stone-400">
          <span>
            {cemetery.plotCount} burial{cemetery.plotCount !== 1 ? 's' : ''}
          </span>
          {distance != null && <span>{formatDistance(distance)}</span>}
        </div>
      </div>

      {/* Chevron */}
      <div className="flex items-center text-stone-300">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
