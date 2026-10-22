import { describe, expect, test } from 'vitest';
import type { DesktopSnapshot, LocalServerProfile } from '@xips/api-contract';
import {
  buildOnboardingSteps,
  isCustomServer,
  nextOnboardingStep,
  requiredOnboardingSteps,
  serverHostLabel
} from './onboarding';

const now = new Date().toISOString();

const defaultProfile: LocalServerProfile = {
  id: 'xips-default',
  name: 'XiPS',
  baseUrl: 'https://xips.xtoforas.com',
  gameVersion: 'ootp27',
  isDefault: true,
  createdAt: now,
  updatedAt: now
};

const customProfile: LocalServerProfile = {
  ...defaultProfile,
  id: 'local',
  name: 'Local',
  baseUrl: 'http://localhost:8080',
  isDefault: false
};

const makeSnapshot = (overrides: Partial<DesktopSnapshot> = {}): DesktopSnapshot => ({
  profiles: [defaultProfile],
  selectedProfileId: defaultProfile.id,
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

const signedIn: Partial<DesktopSnapshot> = {
  authProfileId: defaultProfile.id,
  authUser: { userId: 'u1', discordId: 'd1', displayName: 'Pat', role: 'viewer' }
};

const watchRoot = (profileId: string) => ({
  id: `watch-${profileId}`,
  profileId,
  path: 'C:/OOTP/online_data',
  recursive: false,
  paused: false,
  createdAt: now,
  updatedAt: now
});

const steps = (snapshot: DesktopSnapshot, authFlowState: 'idle' | 'waiting' | 'failed' = 'idle') =>
  buildOnboardingSteps({
    snapshot,
    selectedProfile: snapshot.profiles.find((profile) => profile.id === snapshot.selectedProfileId) ?? null,
    authFlowState
  });

describe('buildOnboardingSteps', () => {
  test('first run needs exactly two actions: sign in, then the folder', () => {
    const result = steps(makeSnapshot());
    expect(result.map((step) => step.key)).toEqual(['auth', 'watch-folders', 'rules']);
    expect(requiredOnboardingSteps(result).map((step) => step.key)).toEqual(['auth', 'watch-folders']);
    expect(result.filter((step) => step.state === 'waiting_on_you').map((step) => step.key)).toEqual(['auth', 'watch-folders']);
    expect(nextOnboardingStep(result)?.key).toBe('auth');
  });

  test('a sign-in in flight reads as working, not waiting on the user', () => {
    const auth = steps(makeSnapshot(), 'waiting')[0];
    expect(auth.state).toBe('working');
    expect(auth.complete).toBe(false);
  });

  test('signed in moves the next step to the folder', () => {
    const result = steps(makeSnapshot(signedIn));
    expect(result[0].state).toBe('done');
    expect(result[0].status).toBe('Signed in as Pat');
    expect(nextOnboardingStep(result)?.key).toBe('watch-folders');
  });

  test('setup is done once signed in with a folder, even without rules', () => {
    const result = steps(makeSnapshot({ ...signedIn, watchRoots: [watchRoot(defaultProfile.id)] }));
    expect(nextOnboardingStep(result)).toBeNull();
    const rules = result.find((step) => step.key === 'rules');
    expect(rules?.state).toBe('optional');
    expect(rules?.dismissible).toBe(true);
  });

  test('sign-in for a different server does not count', () => {
    const snapshot = makeSnapshot({
      ...signedIn,
      profiles: [defaultProfile, customProfile],
      selectedProfileId: customProfile.id
    });
    expect(steps(snapshot)[0].complete).toBe(false);
  });

  test('folders only count for the selected server', () => {
    const snapshot = makeSnapshot({ watchRoots: [watchRoot(customProfile.id)] });
    expect(steps(snapshot)[1].complete).toBe(false);
  });

  test('dismissing the rules reminder completes the optional step', () => {
    const snapshot = makeSnapshot();
    snapshot.preferences.dismissAutomationRuleReadiness = true;
    const rules = steps(snapshot)[2];
    expect(rules.complete).toBe(true);
    expect(rules.dismissible).toBe(false);
  });

  test('first-run copy avoids server jargon', () => {
    const copy = steps(makeSnapshot())
      .flatMap((step) => [step.label, step.status, step.detail, step.actionLabel ?? ''])
      .join(' ')
      .toLowerCase();
    for (const word of ['profile', 'base url', 'health', 'token', 'snapshot', 'readiness']) {
      expect(copy).not.toContain(word);
    }
  });
});

describe('server helpers', () => {
  test('isCustomServer is false for the built-in default and no server', () => {
    expect(isCustomServer(defaultProfile)).toBe(false);
    expect(isCustomServer(null)).toBe(false);
    expect(isCustomServer(customProfile)).toBe(true);
  });

  test('serverHostLabel keeps the port and tolerates bad input', () => {
    expect(serverHostLabel('http://localhost:8080')).toBe('localhost:8080');
    expect(serverHostLabel('https://xips.xtoforas.com/')).toBe('xips.xtoforas.com');
    expect(serverHostLabel('not a url')).toBe('not a url');
  });
});
