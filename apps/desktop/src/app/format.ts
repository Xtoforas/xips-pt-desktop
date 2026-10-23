export const DEFAULT_GAME_VERSION = 'ootp27';

// Locale date and time; '-' when the value is missing or not a valid date.
export const formatDateTime = (
  value: string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString(undefined, options);
};

// Returns only the word; callers keep their own number formatting.
export const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  count === 1 ? singular : plural;

export const digitsOnly = (value: string, maxLength?: number): string => {
  const digits = value.replace(/[^0-9]/gu, '');
  return maxLength === undefined ? digits : digits.slice(0, maxLength);
};

// Tauri's invoke() rejects with the raw value the Rust command's Err variant serialized
// to (a plain string for Result<_, String> commands), not an Error instance.
export const describeError = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return fallback;
};
