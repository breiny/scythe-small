import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@web/lib/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // User fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Cemetery fields
  const [cemeteryName, setCemeteryName] = useState('');
  const [cemeteryAddress, setCemeteryAddress] = useState('');
  const [cemeteryCity, setCemeteryCity] = useState('');
  const [cemeteryState, setCemeteryState] = useState('');
  const [cemeteryZip, setCemeteryZip] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await register({
        name,
        email,
        password,
        cemeteryName,
        cemeteryAddress,
        cemeteryCity,
        cemeteryState,
        cemeteryZip,
      });
      navigate(`/${result.cemeterySlug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link to="/" className="text-2xl font-bold text-stone-800">
            Scythe
          </Link>
          <p className="text-stone-500 mt-1">Claim your cemetery profile</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-sm border border-stone-200 p-6 space-y-5"
        >
          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Your account */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-stone-700 mb-1">
              Your Account
            </legend>

            <div>
              <label htmlFor="reg-name" className="block text-sm font-medium text-stone-600 mb-1">
                Your Name
              </label>
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-sm font-medium text-stone-600 mb-1">
                Email
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-sm font-medium text-stone-600 mb-1">
                Password
              </label>
              <input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Min 8 characters"
              />
            </div>
          </fieldset>

          {/* Cemetery info */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-stone-700 mb-1">
              Cemetery Information
            </legend>

            <div>
              <label htmlFor="reg-cemeteryName" className="block text-sm font-medium text-stone-600 mb-1">
                Cemetery Name
              </label>
              <input
                id="reg-cemeteryName"
                type="text"
                value={cemeteryName}
                onChange={(e) => setCemeteryName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="e.g. Oakwood Memorial Cemetery"
              />
            </div>

            <div>
              <label htmlFor="reg-address" className="block text-sm font-medium text-stone-600 mb-1">
                Address
              </label>
              <input
                id="reg-address"
                type="text"
                value={cemeteryAddress}
                onChange={(e) => setCemeteryAddress(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label htmlFor="reg-city" className="block text-sm font-medium text-stone-600 mb-1">
                  City
                </label>
                <input
                  id="reg-city"
                  type="text"
                  value={cemeteryCity}
                  onChange={(e) => setCemeteryCity(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="reg-state" className="block text-sm font-medium text-stone-600 mb-1">
                  State
                </label>
                <input
                  id="reg-state"
                  type="text"
                  value={cemeteryState}
                  onChange={(e) => setCemeteryState(e.target.value)}
                  required
                  maxLength={2}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="IL"
                />
              </div>
              <div>
                <label htmlFor="reg-zip" className="block text-sm font-medium text-stone-600 mb-1">
                  ZIP
                </label>
                <input
                  id="reg-zip"
                  type="text"
                  value={cemeteryZip}
                  onChange={(e) => setCemeteryZip(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Cemetery Profile'}
          </button>

          <p className="text-sm text-stone-500 text-center">
            Already have an account?{' '}
            <Link to="/login" className="text-emerald-600 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
