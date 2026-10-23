import { describe, expect, it } from 'vitest';
import { describeError, digitsOnly, formatDateTime, pluralize } from './format';

describe('formatDateTime', () => {
  it('formats ISO strings and epoch milliseconds like toLocaleString', () => {
    const iso = '2026-03-04T05:06:07Z';
    expect(formatDateTime(iso)).toBe(new Date(iso).toLocaleString());
    expect(formatDateTime(Date.parse(iso))).toBe(new Date(iso).toLocaleString());
  });

  it('passes options through', () => {
    const iso = '2026-03-04T05:06:07Z';
    const options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' };
    expect(formatDateTime(iso, options)).toBe(new Date(iso).toLocaleString(undefined, options));
  });

  it('returns a dash for empty or invalid input', () => {
    expect(formatDateTime(null)).toBe('-');
    expect(formatDateTime(undefined)).toBe('-');
    expect(formatDateTime('')).toBe('-');
    expect(formatDateTime('not a date')).toBe('-');
    expect(formatDateTime(Number.NaN)).toBe('-');
  });
});

describe('pluralize', () => {
  it('uses the singular only for exactly one', () => {
    expect(pluralize(1, 'file')).toBe('file');
    expect(pluralize(0, 'file')).toBe('files');
    expect(pluralize(2, 'file')).toBe('files');
  });

  it('accepts a custom plural', () => {
    expect(pluralize(1, 'category', 'categories')).toBe('category');
    expect(pluralize(3, 'category', 'categories')).toBe('categories');
  });
});

describe('digitsOnly', () => {
  it('strips non-digits', () => {
    expect(digitsOnly('12a-3 4')).toBe('1234');
    expect(digitsOnly('abc')).toBe('');
  });

  it('truncates to maxLength when given', () => {
    expect(digitsOnly('1234567890', 7)).toBe('1234567');
    expect(digitsOnly('a1b2c3', 2)).toBe('12');
  });
});

describe('describeError', () => {
  it('uses the message of an Error', () => {
    expect(describeError(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('uses a non-blank string as is', () => {
    expect(describeError('plain failure', 'fallback')).toBe('plain failure');
  });

  it('falls back for blank strings and other values', () => {
    expect(describeError('   ', 'fallback')).toBe('fallback');
    expect(describeError({ code: 1 }, 'fallback')).toBe('fallback');
    expect(describeError(null, 'fallback')).toBe('fallback');
  });
});
