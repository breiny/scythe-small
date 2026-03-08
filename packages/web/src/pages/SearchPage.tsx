import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { searchBurials } from '@web/lib/apiClient';
import { formatLifespan } from '@web/lib/format';

interface SearchResult {
  person: {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    maidenName: string | null;
    dateOfBirth: string | null;
    dateOfDeath: string | null;
    plotId: string | null;
    verificationStatus: string;
  };
  plot: {
    id: string;
    plotNumber: string | null;
    section: string | null;
  } | null;
  cemetery: {
    id: string;
    name: string;
    slug: string;
    city: string;
    state: string;
  };
  thumbnailUrl: string | null;
}

interface SearchResponse {
  results: SearchResult[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryFromUrl = searchParams.get('q') ?? '';
  const cemeterySlugFromUrl = searchParams.get('cemetery') ?? '';
  const pageFromUrl = parseInt(searchParams.get('page') ?? '1', 10);

  const [query, setQuery] = useState(queryFromUrl);
  const [cemeteryFilter, setCemeteryFilter] = useState(cemeterySlugFromUrl);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!queryFromUrl) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);
    searchBurials({
      q: queryFromUrl,
      cemeterySlug: cemeterySlugFromUrl || undefined,
      page: pageFromUrl,
      limit: 20,
    })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [queryFromUrl, cemeterySlugFromUrl, pageFromUrl]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const params: Record<string, string> = { q: query.trim() };
    if (cemeteryFilter) params.cemetery = cemeteryFilter;
    setSearchParams(params);
  }

  function goToPage(page: number) {
    const params: Record<string, string> = {
      q: queryFromUrl,
      page: String(page),
    };
    if (cemeterySlugFromUrl) params.cemetery = cemeterySlugFromUrl;
    setSearchParams(params);
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-stone-800">
            Scythe
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/search" className="text-emerald-600 font-medium">
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
        {/* Search form */}
        <form onSubmit={handleSearch} className="space-y-3 mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name..."
              className="flex-1 px-4 py-3 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
            <button
              type="submit"
              className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Search
            </button>
          </div>
          <div>
            <input
              type="text"
              value={cemeteryFilter}
              onChange={(e) => setCemeteryFilter(e.target.value)}
              placeholder="Filter by cemetery slug (optional)"
              className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm text-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </form>

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

        {/* Results */}
        {data && !loading && (
          <>
            <p className="text-sm text-stone-500 mb-4">
              {data.total} result{data.total !== 1 ? 's' : ''} for &ldquo;
              {queryFromUrl}&rdquo;
            </p>

            {data.results.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-stone-500 text-lg">No results found.</p>
                <p className="text-stone-400 text-sm mt-1">
                  Try a different name or check your spelling.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.results.map((r) => (
                  <ResultCard key={r.person.id} result={r} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  type="button"
                  onClick={() => goToPage(data.page - 1)}
                  disabled={data.page <= 1}
                  className="px-3 py-2 text-sm rounded border border-stone-300 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-stone-600">
                  Page {data.page} of {data.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(data.page + 1)}
                  disabled={data.page >= data.totalPages}
                  className="px-3 py-2 text-sm rounded border border-stone-300 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* Empty state when no search */}
        {!queryFromUrl && !loading && (
          <div className="text-center py-16">
            <p className="text-stone-400 text-lg">
              Enter a name above to search burial records.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function ResultCard({ result }: { result: SearchResult }) {
  const { person, plot, cemetery, thumbnailUrl } = result;

  const fullName = [person.firstName, person.middleName, person.lastName]
    .filter(Boolean)
    .join(' ');

  const plotLink = plot
    ? `/${cemetery.slug}/plot/${plot.id}`
    : null;

  const card = (
    <div className="flex gap-4 p-4 bg-white rounded-lg border border-stone-200 hover:border-emerald-300 transition-colors">
      {/* Thumbnail */}
      <div className="w-16 h-16 flex-shrink-0 rounded-lg bg-stone-100 overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`Headstone of ${fullName}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-300 text-2xl">
            &#9744;
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-stone-800 truncate">{fullName}</h3>
        {person.maidenName && (
          <p className="text-xs text-stone-400">n&eacute;e {person.maidenName}</p>
        )}
        <p className="text-sm text-stone-600">
          {formatLifespan(person.dateOfBirth, person.dateOfDeath)}
        </p>
        <p className="text-xs text-stone-400 mt-1">
          {cemetery.name} &middot; {cemetery.city}, {cemetery.state}
          {plot?.section ? ` · ${plot.section}` : ''}
          {plot?.plotNumber ? ` · Plot ${plot.plotNumber}` : ''}
        </p>
        {person.verificationStatus === 'unverified' && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 mt-1">
            Community submitted
          </span>
        )}
      </div>
    </div>
  );

  if (plotLink) {
    return <Link to={plotLink}>{card}</Link>;
  }
  return card;
}
