export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatYear(dateStr: string | null | undefined): string {
  if (!dateStr) return '?';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '?';
  return String(d.getFullYear());
}

export function formatLifespan(
  birth: string | null | undefined,
  death: string | null | undefined,
): string {
  const b = formatYear(birth);
  const d = formatYear(death);
  return `${b} – ${d}`;
}
