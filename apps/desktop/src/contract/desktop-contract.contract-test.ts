import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  cardsResponseSchema,
  desktopCodeResponseSchema,
  desktopExchangeResponseSchema,
  duplicateCheckResponseSchema,
  formatsResponseSchema,
  lifecyclePhaseSchema,
  meResponseSchema,
  myAggResponseSchema,
  roleSchema,
  serviceHealthSchema,
  uploadCreateResponseSchema,
  uploadDetailResponseSchema
} from '@xips/api-contract';

// Validates this repo's zod assumptions against the server contract published
// by the xips-pt repo (packages/shared/src/api/desktop-contract.openapi.json).
// By default the checked-in copy is used; set XIPS_PT_CONTRACT_PATH to point at
// the live file in a local xips-pt checkout to check against the latest server.
const defaultContractPath = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../packages/api-contract/desktop-contract.openapi.json'
);
const contractPath = process.env.XIPS_PT_CONTRACT_PATH?.trim() || defaultContractPath;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as JsonObject;

const dig = (root: JsonValue, path: string[]): JsonValue => {
  let node: JsonValue = root;
  for (const segment of path) {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) {
      throw new Error(`contract path not found: ${path.join('/')}`);
    }
    const next: JsonValue | undefined = node[segment];
    if (next === undefined) {
      throw new Error(`contract path not found: ${path.join('/')}`);
    }
    node = next;
  }
  return node;
};

const exampleFor = (path: string, method: string, status: string): JsonValue =>
  dig(contract, ['paths', path, method, 'responses', status, 'content', 'application/json', 'example']);

const schemaEnum = (schemaName: string, property?: string): string[] => {
  const path = property
    ? ['components', 'schemas', schemaName, 'properties', property, 'enum']
    : ['components', 'schemas', schemaName, 'enum'];
  const values = dig(contract, path);
  if (!Array.isArray(values)) {
    throw new Error(`expected enum array at ${path.join('/')}`);
  }
  return values.map((value) => String(value));
};

describe('desktop zod schemas against the xips-pt OpenAPI contract', () => {
  it('role enum matches the server role taxonomy', () => {
    expect([...roleSchema.options].sort()).toEqual([...schemaEnum('UserRole')].sort());
  });

  it('lifecycle phase enum matches the server taxonomy', () => {
    expect([...lifecyclePhaseSchema.options].sort()).toEqual(
      [...schemaEnum('UploadLifecyclePhase')].sort()
    );
  });

  it('cards source enum matches the server catalog sources', () => {
    const parsed = cardsResponseSchema.safeParse({ ok: true, rows: [], source: 'merged' });
    expect(parsed.success).toBe(true);
    for (const source of schemaEnum('CardsResponse', 'source')) {
      expect(cardsResponseSchema.safeParse({ ok: true, rows: [], source }).success).toBe(true);
    }
  });

  it('parses the documented /health example', () => {
    expect(serviceHealthSchema.safeParse(exampleFor('/health', 'get', '200')).success).toBe(true);
  });

  it('parses the documented /api/v1/me example', () => {
    expect(meResponseSchema.safeParse(exampleFor('/api/v1/me', 'get', '200')).success).toBe(true);
  });

  it('parses the documented desktop exchange example', () => {
    expect(
      desktopExchangeResponseSchema.safeParse(
        exampleFor('/api/v1/auth/desktop/exchange', 'post', '201')
      ).success
    ).toBe(true);
  });

  it('parses the documented desktop code example', () => {
    expect(
      desktopCodeResponseSchema.safeParse(exampleFor('/api/v1/auth/desktop/code', 'post', '201')).success
    ).toBe(true);
  });

  it('parses the documented desktop redeem example', () => {
    expect(
      desktopExchangeResponseSchema.safeParse(
        exampleFor('/api/v1/auth/desktop/redeem', 'post', '201')
      ).success
    ).toBe(true);
  });

  it('parses the documented upload create example', () => {
    expect(
      uploadCreateResponseSchema.safeParse(exampleFor('/api/v1/my/uploads', 'post', '201')).success
    ).toBe(true);
  });

  it('parses the documented duplicate check example', () => {
    expect(
      duplicateCheckResponseSchema.safeParse(
        exampleFor('/api/v1/my/uploads/check-duplicate', 'post', '200')
      ).success
    ).toBe(true);
  });

  it('parses the documented upload detail example', () => {
    expect(
      uploadDetailResponseSchema.safeParse(
        exampleFor('/api/v1/my/uploads/{uploadId}', 'get', '200')
      ).success
    ).toBe(true);
  });

  it('parses the documented cards example', () => {
    expect(cardsResponseSchema.safeParse(exampleFor('/api/v1/cards', 'get', '200')).success).toBe(true);
  });

  it('parses the documented my/agg example', () => {
    expect(myAggResponseSchema.safeParse(exampleFor('/api/v1/my/agg', 'get', '200')).success).toBe(true);
  });

  it('parses the documented formats example and maps teamCount to teamsPerTournament', () => {
    const example = exampleFor('/api/v1/formats', 'get', '200');
    const parsed = formatsResponseSchema.parse(example);
    const rawRow = dig(example, ['rows']) as JsonObject[];
    expect(parsed.rows[0]?.teamsPerTournament).toBe(rawRow[0]?.teamCount);
  });
});
