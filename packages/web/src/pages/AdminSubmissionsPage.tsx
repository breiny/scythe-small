import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchPendingSubmissions,
  approveSubmission,
  rejectSubmission,
  editApproveSubmission,
} from '@web/lib/apiClient';
import { formatDate } from '@web/lib/format';

interface SubmissionPerson {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  maidenName: string | null;
  dateOfBirth: string | null;
  dateOfDeath: string | null;
  inscription: string | null;
  submittedBy: string | null;
  createdAt: string;
}

interface SubmissionResult {
  person: SubmissionPerson;
  plot: {
    id: string;
    lat: number | null;
    lon: number | null;
  } | null;
  cemetery: {
    id: string;
    name: string;
    slug: string;
  };
  thumbnailUrl: string | null;
}

interface EditState {
  firstName: string;
  lastName: string;
  middleName: string;
  maidenName: string;
  dateOfBirth: string;
  dateOfDeath: string;
  inscription: string;
}

export default function AdminSubmissionsPage() {
  const [submissions, setSubmissions] = useState<SubmissionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  async function loadSubmissions(p = 1) {
    setLoading(true);
    try {
      const data = await fetchPendingSubmissions(p);
      setSubmissions(data.results);
      setTotalPages(data.totalPages);
      setPage(data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubmissions();
  }, []);

  async function handleApprove(personId: string) {
    setActionLoading(personId);
    try {
      await approveSubmission(personId);
      setSubmissions((prev) => prev.filter((s) => s.person.id !== personId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(personId: string) {
    setActionLoading(personId);
    try {
      await rejectSubmission(personId);
      setSubmissions((prev) => prev.filter((s) => s.person.id !== personId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setActionLoading(null);
    }
  }

  function startEdit(person: SubmissionPerson) {
    setEditingId(person.id);
    setEditState({
      firstName: person.firstName,
      lastName: person.lastName,
      middleName: person.middleName ?? '',
      maidenName: person.maidenName ?? '',
      dateOfBirth: person.dateOfBirth ?? '',
      dateOfDeath: person.dateOfDeath ?? '',
      inscription: person.inscription ?? '',
    });
  }

  async function handleEditApprove(personId: string) {
    if (!editState) return;
    setActionLoading(personId);
    try {
      await editApproveSubmission(personId, {
        firstName: editState.firstName,
        lastName: editState.lastName,
        middleName: editState.middleName || undefined,
        maidenName: editState.maidenName || undefined,
        dateOfBirth: editState.dateOfBirth || undefined,
        dateOfDeath: editState.dateOfDeath || undefined,
        inscription: editState.inscription || undefined,
      });
      setSubmissions((prev) => prev.filter((s) => s.person.id !== personId));
      setEditingId(null);
      setEditState(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
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
            <span className="text-emerald-600 font-medium">
              Submissions
            </span>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-stone-800">
            Pending Submissions
          </h1>
          {!loading && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-700">
              {submissions.length} pending
            </span>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-12 text-stone-500">
            <p className="text-lg mb-2">No pending submissions</p>
            <p className="text-sm">
              Community contributions will appear here for review.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((sub) => (
              <div
                key={sub.person.id}
                className="bg-white rounded-lg border border-stone-200 p-4"
              >
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  {sub.thumbnailUrl ? (
                    <img
                      src={sub.thumbnailUrl}
                      alt="Headstone"
                      className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-stone-100 rounded-lg flex-shrink-0 flex items-center justify-center">
                      <span className="text-stone-400 text-xs">No photo</span>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-stone-800 truncate">
                      {sub.person.firstName} {sub.person.lastName}
                    </h3>
                    <p className="text-sm text-stone-500">
                      {formatDate(sub.person.dateOfBirth)} &mdash;{' '}
                      {formatDate(sub.person.dateOfDeath)}
                    </p>
                    <p className="text-xs text-stone-400 mt-1">
                      {sub.cemetery.name}
                    </p>
                    {sub.person.submittedBy && (
                      <p className="text-xs text-stone-400">
                        Submitted by: {sub.person.submittedBy}
                      </p>
                    )}
                    <p className="text-xs text-stone-400">
                      {new Date(sub.person.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Edit panel */}
                {editingId === sub.person.id && editState && (
                  <div className="mt-4 pt-4 border-t border-stone-200 grid grid-cols-2 gap-3">
                    {(
                      [
                        ['firstName', 'First Name'],
                        ['lastName', 'Last Name'],
                        ['middleName', 'Middle Name'],
                        ['maidenName', 'Maiden Name'],
                        ['dateOfBirth', 'Date of Birth'],
                        ['dateOfDeath', 'Date of Death'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-stone-600 mb-1">
                          {label}
                        </label>
                        <input
                          type="text"
                          value={editState[key]}
                          onChange={(e) =>
                            setEditState({ ...editState, [key]: e.target.value })
                          }
                          className="w-full px-2 py-1.5 rounded border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-stone-600 mb-1">
                        Inscription
                      </label>
                      <input
                        type="text"
                        value={editState.inscription}
                        onChange={(e) =>
                          setEditState({
                            ...editState,
                            inscription: e.target.value,
                          })
                        }
                        className="w-full px-2 py-1.5 rounded border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  {editingId === sub.person.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleEditApprove(sub.person.id)}
                        disabled={actionLoading === sub.person.id}
                        className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        Save & Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditState(null);
                        }}
                        className="px-4 py-2 text-sm text-stone-500 hover:text-stone-700"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApprove(sub.person.id)}
                        disabled={actionLoading === sub.person.id}
                        className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(sub.person)}
                        disabled={actionLoading === sub.person.id}
                        className="px-4 py-2 bg-white text-stone-700 text-sm font-medium rounded-lg border border-stone-300 hover:bg-stone-50 transition-colors disabled:opacity-50"
                      >
                        Edit & Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(sub.person.id)}
                        disabled={actionLoading === sub.person.id}
                        className="px-4 py-2 text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => loadSubmissions(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1 text-sm text-stone-600 border border-stone-300 rounded disabled:opacity-30"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-stone-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => loadSubmissions(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1 text-sm text-stone-600 border border-stone-300 rounded disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
