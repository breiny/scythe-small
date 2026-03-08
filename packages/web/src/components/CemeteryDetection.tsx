import { useState } from 'react';
import type {
  Cemetery,
  CemeteryDetectResponse,
  OsmCemeteryMatch,
} from '@scythe/shared';
import {
  createCemeteryFromOsm,
  listCemeteries,
} from '@web/lib/apiClient';

interface CemeteryDetectionProps {
  detectionResult: CemeteryDetectResponse | null;
  isDetecting: boolean;
  detectionError: string | null;
  gpsLat: number | null;
  gpsLon: number | null;
  selectedCemetery: Cemetery | null;
  onCemeterySelected: (cemetery: Cemetery) => void;
}

export function CemeteryDetection({
  detectionResult,
  isDetecting,
  detectionError,
  gpsLat,
  gpsLon,
  selectedCemetery,
  onCemeterySelected,
}: CemeteryDetectionProps) {
  const [showOverride, setShowOverride] = useState(false);
  const [cemeteryList, setCemeteryList] = useState<
    Array<{ id: string; name: string; slug: string }> | null
  >(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');

  async function loadCemeteryList() {
    if (cemeteryList) return;
    try {
      const list = await listCemeteries();
      setCemeteryList(list);
    } catch {
      setCemeteryList([]);
    }
  }

  async function handleCreateFromOsm(osmMatch: OsmCemeteryMatch) {
    if (gpsLat == null || gpsLon == null) return;
    setCreating(true);
    setCreateError(null);
    try {
      const cemetery = await createCemeteryFromOsm(osmMatch, gpsLat, gpsLon);
      onCemeterySelected(cemetery);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Failed to create cemetery',
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateNew() {
    if (!newName.trim() || gpsLat == null || gpsLon == null) return;
    setCreating(true);
    setCreateError(null);
    try {
      const osmMatch: OsmCemeteryMatch = {
        source: 'osm',
        osmId: `manual-${Date.now()}`,
        name: newName.trim(),
        address: newAddress.trim() || null,
        boundary: null,
      };
      const cemetery = await createCemeteryFromOsm(osmMatch, gpsLat, gpsLon);
      onCemeterySelected(cemetery);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Failed to create cemetery',
      );
    } finally {
      setCreating(false);
    }
  }

  // Loading state
  if (isDetecting) {
    return (
      <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />
        <p className="text-sm text-stone-600">Detecting cemetery...</p>
      </div>
    );
  }

  // Detection error
  if (detectionError) {
    return (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-700">
          Detection failed: {detectionError}
        </p>
      </div>
    );
  }

  // Already selected (confirmed)
  if (selectedCemetery && !showOverride) {
    const isScythe = detectionResult?.match?.source === 'scythe';
    return (
      <div
        className={`p-3 rounded-lg border ${
          isScythe
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-blue-50 border-blue-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                isScythe
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {isScythe ? 'Detected' : 'Created'}
            </span>
            <span className="text-sm font-medium text-stone-800">
              {selectedCemetery.name}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowOverride(true);
              loadCemeteryList();
            }}
            className="text-xs text-stone-500 hover:text-stone-700 underline"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  // Override / dropdown mode
  if (showOverride) {
    return (
      <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-stone-700">
            Select a cemetery
          </p>
          {selectedCemetery && (
            <button
              type="button"
              onClick={() => setShowOverride(false)}
              className="text-xs text-stone-500 hover:text-stone-700 underline"
            >
              Cancel
            </button>
          )}
        </div>
        {cemeteryList === null ? (
          <p className="text-xs text-stone-500">Loading...</p>
        ) : (
          <select
            className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
            value=""
            onChange={async (e) => {
              const id = e.target.value;
              if (id === '__new__') {
                setShowNewForm(true);
                return;
              }
              const picked = cemeteryList.find((c) => c.id === id);
              if (picked) {
                // Fetch full cemetery details
                const { fetchCemeteryBySlug } = await import(
                  '@web/lib/apiClient'
                );
                const full = await fetchCemeteryBySlug(picked.slug);
                onCemeterySelected(full);
                setShowOverride(false);
              }
            }}
          >
            <option value="">Choose...</option>
            {cemeteryList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new__">+ Create New</option>
          </select>
        )}
        {showNewForm && (
          <NewCemeteryForm
            name={newName}
            address={newAddress}
            onNameChange={setNewName}
            onAddressChange={setNewAddress}
            onCreate={handleCreateNew}
            creating={creating}
          />
        )}
        {createError && (
          <p className="text-xs text-red-600">{createError}</p>
        )}
      </div>
    );
  }

  // No detection result yet (no GPS)
  if (!detectionResult) {
    return null;
  }

  // Scythe match found
  if (detectionResult.match) {
    onCemeterySelected(detectionResult.match.cemetery);
    return null;
  }

  // OSM match — show creation prompt
  if (detectionResult.osmMatch) {
    const osm = detectionResult.osmMatch;
    return (
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
        <div>
          <p className="text-sm font-medium text-blue-800">
            It looks like you're at {osm.name}
            {osm.address ? `, ${osm.address}` : ''}
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Create this cemetery and start adding records?
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleCreateFromOsm(osm)}
            disabled={creating}
            className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create & Continue'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowOverride(true);
              loadCemeteryList();
            }}
            className="px-3 py-2 text-sm text-stone-600 border border-stone-300 rounded-lg hover:bg-stone-50"
          >
            Other
          </button>
        </div>
        {createError && (
          <p className="text-xs text-red-600">{createError}</p>
        )}
      </div>
    );
  }

  // No match at all — manual entry prompt
  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
      <p className="text-sm font-medium text-amber-800">
        Cemetery not detected. Select an existing cemetery or enter a new one.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setShowOverride(true);
            loadCemeteryList();
          }}
          className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
        >
          Select Cemetery
        </button>
        <button
          type="button"
          onClick={() => {
            setShowOverride(true);
            setShowNewForm(true);
            loadCemeteryList();
          }}
          className="px-3 py-2 text-sm text-stone-600 border border-stone-300 rounded-lg hover:bg-stone-50"
        >
          Create New
        </button>
      </div>
    </div>
  );
}

function NewCemeteryForm({
  name,
  address,
  onNameChange,
  onAddressChange,
  onCreate,
  creating,
}: {
  name: string;
  address: string;
  onNameChange: (v: string) => void;
  onAddressChange: (v: string) => void;
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className="space-y-2 pt-2 border-t border-stone-200">
      <input
        type="text"
        placeholder="Cemetery name"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <input
        type="text"
        placeholder="Address (optional)"
        value={address}
        onChange={(e) => onAddressChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <button
        type="button"
        onClick={onCreate}
        disabled={!name.trim() || creating}
        className="w-full py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
      >
        {creating ? 'Creating...' : 'Create Cemetery'}
      </button>
    </div>
  );
}
