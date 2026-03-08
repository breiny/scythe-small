import { describe, it, expect } from 'vitest';
import { formatDate, formatYear, formatLifespan } from './format.js';

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('returns "—" for null', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(formatDate(undefined)).toBe('—');
  });

  it('returns "—" for an empty string', () => {
    expect(formatDate('')).toBe('—');
  });

  it('returns "—" for an invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('includes the year for a valid date', () => {
    const result = formatDate('2000-06-15');
    expect(result).toContain('2000');
  });

  it('includes the month name for a valid date', () => {
    const result = formatDate('2000-06-15');
    expect(result).toContain('June');
  });

  it('includes the day for a valid date', () => {
    const result = formatDate('2000-06-15');
    expect(result).toContain('15');
  });
});

// ---------------------------------------------------------------------------
// formatYear
// ---------------------------------------------------------------------------
describe('formatYear', () => {
  it('returns "?" for null', () => {
    expect(formatYear(null)).toBe('?');
  });

  it('returns "?" for undefined', () => {
    expect(formatYear(undefined)).toBe('?');
  });

  it('returns "?" for an invalid date string', () => {
    expect(formatYear('garbage')).toBe('?');
  });

  it('returns the 4-digit year as a string', () => {
    expect(formatYear('1985-08-20')).toBe('1985');
  });

  it('handles a year-only string', () => {
    const result = formatYear('1920');
    expect(result).toMatch(/^\d{4}$/);
  });
});

// ---------------------------------------------------------------------------
// formatLifespan
// ---------------------------------------------------------------------------
describe('formatLifespan', () => {
  it('formats birth and death years separated by " – "', () => {
    expect(formatLifespan('1940-03-10', '2019-11-25')).toBe('1940 – 2019');
  });

  it('uses "?" for missing birth year', () => {
    expect(formatLifespan(null, '2010-01-01')).toBe('? – 2010');
  });

  it('uses "?" for missing death year', () => {
    expect(formatLifespan('1955-01-01', null)).toBe('1955 – ?');
  });

  it('uses "?" for both when both are missing', () => {
    expect(formatLifespan(null, null)).toBe('? – ?');
  });

  it('uses "?" for both when both are undefined', () => {
    expect(formatLifespan(undefined, undefined)).toBe('? – ?');
  });
});
