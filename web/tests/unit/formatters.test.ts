import { describe, expect, test } from 'vitest';
import { fmtDate, fmtDateLong, relTime } from '../../src/data/data';

describe('formatters', () => {
  test('fmtDate produces "Mon D" form', () => {
    expect(fmtDate('2026-05-22')).toMatch(/May 22/);
  });

  test('fmtDateLong includes year', () => {
    expect(fmtDateLong('2026-05-22')).toMatch(/2026/);
  });

  // `relTime` uses `Math.round((now - d) / 86400000)`, so it needs timestamp-precision
  // inputs to identify "today" / "yesterday" reliably. Date-only strings parse as
  // local midnight, which makes "today" register as 0 or 1 depending on time of day.
  test('relTime returns "today" for the current instant', () => {
    expect(relTime(new Date().toISOString())).toBe('today');
  });

  test('relTime returns "yesterday" 24h prior', () => {
    const d = new Date(Date.now() - 24 * 3600 * 1000);
    expect(relTime(d.toISOString())).toBe('yesterday');
  });

  test('relTime returns weeks for 14 days back', () => {
    const d = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    expect(relTime(d.toISOString())).toBe('2w ago');
  });

  test('fmtDate accepts a Postgres date string (no time component)', () => {
    expect(fmtDate('2026-01-04')).toMatch(/Jan 4/);
  });
});
