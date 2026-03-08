import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@web/lib/AuthContext';
import {
  parseCsvHeaders,
  validateCsvImport,
  executeCsvImport,
} from '@web/lib/apiClient';

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

const SCYTHE_FIELDS = [
  { key: 'firstName', label: 'First Name', required: true },
  { key: 'lastName', label: 'Last Name', required: true },
  { key: 'dateOfBirth', label: 'Date of Birth', required: false },
  { key: 'dateOfDeath', label: 'Date of Death', required: false },
  { key: 'section', label: 'Section', required: false },
  { key: 'plotNumber', label: 'Plot Number', required: false },
];

interface RowError {
  row: number;
  errors: string[];
  data: Record<string, string>;
}

interface ValidationResult {
  totalRows: number;
  validRows: number;
  errorRows: number;
  preview: Array<Record<string, string>>;
  errors: RowError[];
}

interface ImportResult {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: RowError[];
}

export default function CsvImportPage() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Array<Record<string, string>>>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);
    setFileName(file.name);

    try {
      const text = await file.text();
      setCsvText(text);

      const result = await parseCsvHeaders(text);
      setHeaders(result.headers);
      setSampleRows(result.sampleRows);
      setTotalRows(result.totalRows);

      // Auto-map columns by guessing common header names
      const autoMapping: Record<string, string> = {};
      for (const field of SCYTHE_FIELDS) {
        const match = result.headers.find((h: string) => {
          const lower = h.toLowerCase().replace(/[_\s-]/g, '');
          if (field.key === 'firstName') return lower.includes('first') || lower === 'firstname';
          if (field.key === 'lastName') return lower.includes('last') || lower === 'lastname';
          if (field.key === 'dateOfBirth') return lower.includes('birth') || lower === 'dob' || lower === 'dateofbirth' || lower === 'born';
          if (field.key === 'dateOfDeath') return lower.includes('death') || lower === 'dod' || lower === 'dateofdeath' || lower === 'died';
          if (field.key === 'section') return lower === 'section';
          if (field.key === 'plotNumber') return lower.includes('plot') || lower === 'plotnumber' || lower === 'lot';
          return false;
        });
        if (match) autoMapping[field.key] = match;
      }
      setMapping(autoMapping);
      setStep('mapping');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleValidate() {
    setError(null);
    setLoading(true);

    // Check required mappings
    if (!mapping.firstName || !mapping.lastName) {
      setError('First Name and Last Name mappings are required');
      setLoading(false);
      return;
    }

    try {
      const result = await validateCsvImport(csvText, mapping);
      setValidation(result);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!user) return;
    setError(null);
    setStep('importing');

    try {
      const result = await executeCsvImport(csvText, mapping, user.cemeteryId, fileName);
      setImportResult(result);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    }
  }

  function handleReset() {
    setStep('upload');
    setCsvText('');
    setFileName('');
    setHeaders([]);
    setSampleRows([]);
    setTotalRows(0);
    setMapping({});
    setValidation(null);
    setImportResult(null);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-stone-800">
            Scythe
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/pin" className="text-emerald-600 hover:underline">
              Pin Drop
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-stone-800 mb-6">
          Import Burial Records
        </h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-stone-700 mb-2">
                Upload a CSV file
              </h2>
              <p className="text-sm text-stone-500 max-w-md mx-auto">
                Upload a CSV with burial records. You'll map your column headers
                to Scythe fields in the next step.
              </p>
            </div>

            <label className="inline-block cursor-pointer">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <span className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors inline-block">
                {loading ? 'Reading file...' : 'Choose CSV File'}
              </span>
            </label>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === 'mapping' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="text-lg font-semibold text-stone-700 mb-1">
                Map Columns
              </h2>
              <p className="text-sm text-stone-500 mb-4">
                {fileName} — {totalRows} rows detected.
                Map your CSV columns to Scythe fields.
              </p>

              <div className="space-y-3">
                {SCYTHE_FIELDS.map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center gap-3"
                  >
                    <label className="w-36 text-sm font-medium text-stone-700 shrink-0">
                      {field.label}
                      {field.required && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </label>
                    <select
                      value={mapping[field.key] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMapping((prev) => {
                          const next = { ...prev };
                          if (val) {
                            next[field.key] = val;
                          } else {
                            delete next[field.key];
                          }
                          return next;
                        });
                      }}
                      className="flex-1 px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">
                        {field.required ? '-- Select column --' : '-- Skip --'}
                      </option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample data preview */}
            {sampleRows.length > 0 && (
              <div className="bg-white rounded-xl border border-stone-200 p-6">
                <h3 className="text-sm font-semibold text-stone-700 mb-3">
                  Sample Data (first {sampleRows.length} rows)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-stone-200">
                        {headers.map((h) => (
                          <th
                            key={h}
                            className="text-left py-2 px-2 font-medium text-stone-600"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sampleRows.map((row, i) => (
                        <tr key={i} className="border-b border-stone-100">
                          {headers.map((h) => (
                            <td key={h} className="py-2 px-2 text-stone-700">
                              {row[h] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-stone-600 border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                Back
              </button>
              <button
                onClick={handleValidate}
                disabled={loading || !mapping.firstName || !mapping.lastName}
                className="px-6 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Validating...' : 'Validate & Preview'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Validation Preview */}
        {step === 'preview' && validation && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="text-lg font-semibold text-stone-700 mb-4">
                Validation Results
              </h2>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-stone-50 rounded-lg">
                  <p className="text-2xl font-bold text-stone-800">{validation.totalRows}</p>
                  <p className="text-sm text-stone-500">Total Rows</p>
                </div>
                <div className="text-center p-4 bg-emerald-50 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-700">{validation.validRows}</p>
                  <p className="text-sm text-emerald-600">Valid</p>
                </div>
                <div className={`text-center p-4 rounded-lg ${validation.errorRows > 0 ? 'bg-red-50' : 'bg-stone-50'}`}>
                  <p className={`text-2xl font-bold ${validation.errorRows > 0 ? 'text-red-700' : 'text-stone-800'}`}>
                    {validation.errorRows}
                  </p>
                  <p className={`text-sm ${validation.errorRows > 0 ? 'text-red-600' : 'text-stone-500'}`}>
                    Errors
                  </p>
                </div>
              </div>

              {/* Preview valid rows */}
              {validation.preview.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-stone-700 mb-2">
                    Preview (first {validation.preview.length} valid rows)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-stone-200">
                          <th className="text-left py-2 px-2 font-medium text-stone-600">First Name</th>
                          <th className="text-left py-2 px-2 font-medium text-stone-600">Last Name</th>
                          <th className="text-left py-2 px-2 font-medium text-stone-600">Birth Date</th>
                          <th className="text-left py-2 px-2 font-medium text-stone-600">Death Date</th>
                          <th className="text-left py-2 px-2 font-medium text-stone-600">Section</th>
                          <th className="text-left py-2 px-2 font-medium text-stone-600">Plot #</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validation.preview.map((row, i) => (
                          <tr key={i} className="border-b border-stone-100">
                            <td className="py-2 px-2 text-stone-700">{row.firstName}</td>
                            <td className="py-2 px-2 text-stone-700">{row.lastName}</td>
                            <td className="py-2 px-2 text-stone-700">{row.dateOfBirth ? new Date(row.dateOfBirth).toLocaleDateString() : '-'}</td>
                            <td className="py-2 px-2 text-stone-700">{row.dateOfDeath ? new Date(row.dateOfDeath).toLocaleDateString() : '-'}</td>
                            <td className="py-2 px-2 text-stone-700">{row.section ?? '-'}</td>
                            <td className="py-2 px-2 text-stone-700">{row.plotNumber ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Error rows */}
              {validation.errors.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-700 mb-2">
                    Rows with Errors (will be skipped)
                  </h3>
                  <div className="space-y-2">
                    {validation.errors.map((err, i) => (
                      <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs">
                        <p className="font-medium text-red-700">Row {err.row}</p>
                        <ul className="list-disc ml-4 text-red-600 mt-1">
                          {err.errors.map((e, j) => (
                            <li key={j}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('mapping')}
                className="px-4 py-2 text-stone-600 border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                Back to Mapping
              </button>
              <button
                onClick={handleImport}
                disabled={validation.validRows === 0}
                className="px-6 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                Import {validation.validRows} Records
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Importing */}
        {step === 'importing' && (
          <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
            <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg font-medium text-stone-700">Importing records...</p>
            <p className="text-sm text-stone-500 mt-1">This may take a moment.</p>
          </div>
        )}

        {/* Step 5: Done */}
        {step === 'done' && importResult && (
          <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-stone-800 mb-2">
              Import Complete
            </h2>

            <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto mt-6 mb-6">
              <div className="text-center p-4 bg-emerald-50 rounded-lg">
                <p className="text-3xl font-bold text-emerald-700">{importResult.imported}</p>
                <p className="text-sm text-emerald-600">Records Imported</p>
              </div>
              <div className={`text-center p-4 rounded-lg ${importResult.skipped > 0 ? 'bg-red-50' : 'bg-stone-50'}`}>
                <p className={`text-3xl font-bold ${importResult.skipped > 0 ? 'text-red-700' : 'text-stone-800'}`}>
                  {importResult.skipped}
                </p>
                <p className={`text-sm ${importResult.skipped > 0 ? 'text-red-600' : 'text-stone-500'}`}>
                  Skipped
                </p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="text-left mt-6 max-w-lg mx-auto">
                <h3 className="text-sm font-semibold text-red-700 mb-2">Skipped Rows</h3>
                <div className="space-y-2">
                  {importResult.errors.map((err, i) => (
                    <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs">
                      <p className="font-medium text-red-700">Row {err.row}</p>
                      <ul className="list-disc ml-4 text-red-600">
                        {err.errors.map((e, j) => (
                          <li key={j}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-3 justify-center">
              <button
                onClick={handleReset}
                className="px-6 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Import Another File
              </button>
              <Link
                to={`/springfield-memorial`}
                className="px-6 py-2 border border-stone-300 text-stone-600 rounded-lg hover:bg-stone-50"
              >
                View Cemetery
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
