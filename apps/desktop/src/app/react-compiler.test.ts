// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformAsync } from '@babel/core';
import reactCompiler from 'babel-plugin-react-compiler';
import { expect, test } from 'vitest';

// The React Compiler skips a component it can't compile without failing the build, and that
// component silently loses its memoization. This fails instead, naming the function and reason.
const srcDir = fileURLToPath(new URL('..', import.meta.url));

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'contract' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });

test('the React Compiler compiles every component and hook', { timeout: 60_000 }, async () => {
  const skipped: string[] = [];
  for (const file of sourceFiles(srcDir)) {
    await transformAsync(readFileSync(file, 'utf8'), {
      filename: file,
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: ['typescript', 'jsx'] },
      plugins: [
        [
          reactCompiler,
          {
            panicThreshold: 'none',
            logger: {
              logEvent: (_filename: string | null, event: { kind: string; fnLoc?: { start?: { line: number } }; detail?: { options?: { reason?: string } } }) => {
                if (event.kind === 'CompileError' || event.kind === 'PipelineError') {
                  skipped.push(`${file.slice(srcDir.length)}:${event.fnLoc?.start?.line ?? '?'} ${event.detail?.options?.reason ?? event.kind}`);
                }
              }
            }
          }
        ]
      ]
    });
  }
  expect(skipped).toEqual([]);
});
