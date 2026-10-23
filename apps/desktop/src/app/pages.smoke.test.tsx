import { screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

// Renders every page against the browser mock, as `npm run dev` does. Unit tests don't mount pages, so a page
// that throws or loops forever (React's "Maximum update depth exceeded") would otherwise pass the gate.
// Rendering goes through createRoot outside act(), as in the browser: act() flushes effects synchronously, so
// an effect loop there hangs the test run instead of reaching React's update-depth error.
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    }) as MediaQueryList;
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const pages: Array<[mock: string, route: string, title: string]> = [
  ['done', '/today', 'Today'],
  ['done', '/queue', 'Upload Queue'],
  ['done', '/automation', 'Automation'],
  ['done', '/settings', 'Settings'],
  ['done', '/diagnostics', 'Diagnostics'],
  ['first-run', '/today', 'Today']
];

describe('pages render against the browser mock', () => {
  test.each(pages)('%s %s', { timeout: 10_000 }, async (mock, route, title) => {
    // The mock client reads its scenario from the URL when the module loads.
    window.history.replaceState({}, '', `/?mock=${mock}`);
    vi.resetModules();
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    const [{ App }, { desktopTheme, desktopCssVariablesResolver }] = await Promise.all([import('./App'), import('./theme')]);

    const container = document.body.appendChild(document.createElement('div'));
    window.addEventListener('error', (event) => errors.push(String(event.error ?? event.message)));
    root = createRoot(container, { onUncaughtError: (error) => errors.push(String(error)) });
    root.render(
      <MantineProvider theme={desktopTheme} cssVariablesResolver={desktopCssVariablesResolver} defaultColorScheme="dark">
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </MantineProvider>
    );

    expect(await screen.findByRole('heading', { name: title }, { timeout: 5000 })).toBeTruthy();
    // Let the snapshot load and the page's effects settle before checking for errors.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(errors).toEqual([]);
  });
});
