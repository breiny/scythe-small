import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function HomePage() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* Nav */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-xl font-bold text-stone-800">Scythe</span>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/search"
              className="text-stone-500 hover:text-stone-700"
            >
              Search
            </Link>
            <Link
              to="/directory"
              className="text-stone-500 hover:text-stone-700"
            >
              Directory
            </Link>
            <Link
              to="/contribute"
              className="text-emerald-600 font-medium hover:text-emerald-700"
            >
              Add a Grave
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <h1 className="text-5xl font-bold text-stone-800 mb-2">Scythe</h1>
        <p className="text-lg text-stone-600 mb-8">
          Find a grave. Honor a life.
        </p>

        <form onSubmit={handleSearch} className="w-full max-w-md">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a name..."
              className="flex-1 px-4 py-3 rounded-lg border border-stone-300 text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
            <button
              type="submit"
              className="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Search
            </button>
          </div>
        </form>

        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-sm text-stone-400">
            Search across all cemeteries on the platform
          </p>
          <Link
            to="/directory"
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Browse All Cemeteries
          </Link>
        </div>
      </div>

      {/* Footer link to seed cemetery for testing */}
      <footer className="p-4 text-center">
        <Link
          to="/springfield-memorial"
          className="text-sm text-stone-400 hover:text-stone-600"
        >
          Springfield Memorial Cemetery
        </Link>
      </footer>
    </div>
  );
}
