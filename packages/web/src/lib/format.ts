// Parse date string as UTC to avoid timezone shift issues
// (e.g., "2000-06-15" parsed as UTC midnight shows as June 14 in US timezones)
function parseUTC(dateStr: string): Date | null {
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00Z' : ''));
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = parseUTC(dateStr);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatYear(dateStr: string | null | undefined): string {
  if (!dateStr) return '?';
  const d = parseUTC(dateStr);
  if (!d) return '?';
  return String(d.getUTCFullYear());
}

export function formatLifespan(
  birth: string | null | undefined,
  death: string | null | undefined,
): string {
  const b = formatYear(birth);
  const d = formatYear(death);
  return `${b} – ${d}`;
}
