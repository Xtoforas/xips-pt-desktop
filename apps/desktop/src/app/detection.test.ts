import { describe, expect, test } from 'vitest';
import { detectPt27CsvKind, pt27CardCatalogHeader, pt27StatsExportHeader } from '@xips/api-contract';

describe('detectPt27CsvKind', () => {
  test('detects card catalog headers from the provided pt27 example schema', () => {
    expect(detectPt27CsvKind(pt27CardCatalogHeader)).toBe('card_catalog');
  });

  test('detects stats export headers from the provided pt27 example schema', () => {
    expect(detectPt27CsvKind(pt27StatsExportHeader)).toBe('stats_export');
  });
});
