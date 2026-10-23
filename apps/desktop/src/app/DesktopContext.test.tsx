import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DesktopSnapshot } from '@xips/api-contract';
import type { useDesktop as UseDesktop, DesktopProvider as DesktopProviderType } from './DesktopContext';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args)
}));

type ListenCallback = () => void | Promise<void>;
let capturedListener: ListenCallback | null = null;
let listenResult: () => Promise<() => void> = () => Promise.resolve(vi.fn());
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((_event: string, callback: ListenCallback) => {
    capturedListener = callback;
    return listenResult();
  })
}));

const makeSnapshot = (overrides: Partial<DesktopSnapshot> = {}): DesktopSnapshot => ({
  profiles: [],
  selectedProfileId: '',
  authProfileId: '',
  authUser: null,
  tokenExpiresAt: '',
  watchRoots: [],
  formatRules: [],
  detectedFiles: [],
  uploadJobs: [],
  uploadAttempts: [],
  preferences: {
    launchAtLogin: false,
    closeToTray: true,
    pollingIntervalSeconds: 5,
    diagnosticsRetentionDays: 14,
    dismissAutomationRuleReadiness: false,
    dismissCompletedReadinessCard: false
  },
  diagnostics: [],
  cachedFormats: [],
  ...overrides
});

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const importDesktopContext = async (): Promise<{
  DesktopProvider: typeof DesktopProviderType;
  useDesktop: typeof UseDesktop;
}> => {
  window.__TAURI_INTERNALS__ = {};
  return import('./DesktopContext');
};

describe('DesktopContext snapshot refresh', () => {
  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset();
    capturedListener = null;
    listenResult = () => Promise.resolve(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('an event-triggered refresh is not clobbered by a slower mutation response', async () => {
    const { DesktopProvider, useDesktop } = await importDesktopContext();

    const v1 = makeSnapshot({ selectedProfileId: 'v1' });
    const v2 = makeSnapshot({ selectedProfileId: 'v2' });
    let getSnapshotCalls = 0;
    let resolveMutation: (() => void) | null = null;

    invokeMock.mockImplementation((command: string) => {
      if (command === 'desktop_get_snapshot') {
        getSnapshotCalls += 1;
        return Promise.resolve(getSnapshotCalls === 1 ? v1 : v2);
      }
      if (command === 'desktop_retry_upload_job') {
        return new Promise<void>((resolve) => {
          resolveMutation = resolve;
        });
      }
      return Promise.resolve(undefined);
    });

    const ref: { current: ReturnType<typeof useDesktop> | null } = { current: null };
    const Probe = (): null => {
      ref.current = useDesktop();
      return null;
    };

    await act(async () => {
      render(
        <DesktopProvider>
          <Probe />
        </DesktopProvider>
      );
      await flushMicrotasks();
    });
    expect(ref.current?.snapshot.selectedProfileId).toBe('v1');

    let mutationPromise: Promise<void> = Promise.resolve();
    await act(async () => {
      mutationPromise = ref.current!.retryUploadJob('job-1');
      await flushMicrotasks();
    });

    // Simulate the native background dispatcher's event arriving while the mutation is still pending.
    await act(async () => {
      await capturedListener?.();
      await flushMicrotasks();
    });
    expect(ref.current?.snapshot.selectedProfileId).toBe('v2');

    // The mutation finally resolves after the fresher snapshot already landed; it must not clobber it,
    // since it no longer carries (or applies) a returned snapshot of its own.
    await act(async () => {
      resolveMutation?.();
      await mutationPromise;
      await flushMicrotasks();
    });
    expect(ref.current?.snapshot.selectedProfileId).toBe('v2');
  });

  test('refreshSnapshot coalesces concurrent calls into a single follow-up fetch', async () => {
    const { DesktopProvider, useDesktop } = await importDesktopContext();

    let getSnapshotCalls = 0;
    const pendingResolvers: Array<(snapshot: DesktopSnapshot) => void> = [];
    invokeMock.mockImplementation((command: string) => {
      if (command === 'desktop_get_snapshot') {
        getSnapshotCalls += 1;
        return new Promise<DesktopSnapshot>((resolve) => {
          pendingResolvers.push(resolve);
        });
      }
      return Promise.resolve(undefined);
    });

    const ref: { current: ReturnType<typeof useDesktop> | null } = { current: null };
    const Probe = (): null => {
      ref.current = useDesktop();
      return null;
    };

    await act(async () => {
      render(
        <DesktopProvider>
          <Probe />
        </DesktopProvider>
      );
      await flushMicrotasks();
    });
    // The mount effect kicked off the first (still in-flight) fetch.
    expect(getSnapshotCalls).toBe(1);

    let refresh2: Promise<void> = Promise.resolve();
    let refresh3: Promise<void> = Promise.resolve();
    await act(async () => {
      refresh2 = ref.current!.refreshSnapshot();
      refresh3 = ref.current!.refreshSnapshot();
      await flushMicrotasks();
    });
    // Both extra calls arrived while a fetch was in flight, so they were coalesced into one
    // queued follow-up rather than dispatching their own requests.
    expect(getSnapshotCalls).toBe(1);

    await act(async () => {
      pendingResolvers[0](makeSnapshot({ selectedProfileId: 'v1' }));
      await flushMicrotasks();
    });
    expect(getSnapshotCalls).toBe(2);

    await act(async () => {
      pendingResolvers[1](makeSnapshot({ selectedProfileId: 'v2' }));
      await Promise.all([refresh2, refresh3]);
      await flushMicrotasks();
    });

    expect(getSnapshotCalls).toBe(2);
    expect(ref.current?.snapshot.selectedProfileId).toBe('v2');
  });

  test('the snapshot listener is removed when unmount happens before listen() resolves', async () => {
    const { DesktopProvider } = await importDesktopContext();
    invokeMock.mockImplementation(() => Promise.resolve(makeSnapshot()));

    const stop = vi.fn();
    let resolveListen: ((unlisten: () => void) => void) | null = null;
    listenResult = () =>
      new Promise((resolve) => {
        resolveListen = resolve;
      });

    let unmount: () => void = () => {};
    await act(async () => {
      ({ unmount } = render(<DesktopProvider>{null}</DesktopProvider>));
      await flushMicrotasks();
    });
    expect(resolveListen).not.toBeNull();

    unmount();
    await act(async () => {
      resolveListen?.(stop);
      await flushMicrotasks();
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test('a new snapshot for the same signed-in user does not refetch cards or restart the refresh timer', async () => {
    const { DesktopProvider } = await importDesktopContext();
    const profile = {
      id: 'p1',
      name: 'XiPS',
      baseUrl: 'https://example.test',
      gameVersion: 'ootp27',
      isDefault: true,
      createdAt: '',
      updatedAt: ''
    };
    let userId = 'u1';
    // Every snapshot deserializes to a fresh authUser object, as the Tauri command does.
    const signedInSnapshot = (): DesktopSnapshot =>
      makeSnapshot({
        profiles: [profile],
        selectedProfileId: 'p1',
        authProfileId: 'p1',
        authUser: { userId, discordId: 'd1', displayName: 'Player', role: 'viewer' }
      });
    const calls: string[] = [];
    invokeMock.mockImplementation((command: string) => {
      calls.push(command);
      switch (command) {
        case 'desktop_get_snapshot':
          return Promise.resolve(signedInSnapshot());
        case 'desktop_fetch_cards':
          return Promise.resolve({ rows: [], source: 'admin' });
        case 'desktop_fetch_my_agg':
          return Promise.resolve({ cards: [], teams: [] });
        case 'desktop_fetch_formats':
          return Promise.resolve([]);
        default:
          return Promise.resolve(undefined);
      }
    });
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const count = (command: string): number => calls.filter((call) => call === command).length;

    await act(async () => {
      render(<DesktopProvider>{null}</DesktopProvider>);
      await flushMicrotasks();
      await flushMicrotasks();
    });
    expect(count('desktop_fetch_cards')).toBe(1);
    expect(count('desktop_fetch_my_agg')).toBe(1);
    const intervalsAfterMount = setIntervalSpy.mock.calls.length;

    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await capturedListener?.();
        await flushMicrotasks();
      });
    }
    expect(count('desktop_get_snapshot')).toBe(4);
    expect(count('desktop_fetch_cards')).toBe(1);
    expect(count('desktop_fetch_my_agg')).toBe(1);
    expect(setIntervalSpy.mock.calls.length).toBe(intervalsAfterMount);

    // Signing in as someone else is a real change: fetch once more.
    userId = 'u2';
    await act(async () => {
      await capturedListener?.();
      await flushMicrotasks();
    });
    expect(count('desktop_fetch_cards')).toBe(2);
    expect(count('desktop_fetch_my_agg')).toBe(2);
  });
});
