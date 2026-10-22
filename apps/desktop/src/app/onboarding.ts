import type { DesktopSnapshot, LocalServerProfile } from '@xips/api-contract';

export type ConnectionState = 'checking' | 'connected' | 'unreachable';

// Who a setup step is waiting on: the user, the app (working automatically), or nobody.
export type OnboardingStepState = 'done' | 'waiting_on_you' | 'working' | 'optional';

export type OnboardingStep = {
  key: 'auth' | 'watch-folders' | 'rules';
  label: string;
  status: string;
  detail: string;
  state: OnboardingStepState;
  complete: boolean;
  optional: boolean;
  href?: string;
  actionLabel?: string;
  dismissible?: boolean;
};

export const isSignedInToSelectedServer = (snapshot: DesktopSnapshot): boolean =>
  snapshot.authUser !== null && snapshot.authProfileId === snapshot.selectedProfileId;

export const isCustomServer = (profile: LocalServerProfile | null): boolean => profile !== null && !profile.isDefault;

// "localhost:8080" for display; falls back to the raw address if it doesn't parse.
export const serverHostLabel = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
};

export const buildOnboardingSteps = ({
  snapshot,
  selectedProfile,
  authFlowState
}: {
  snapshot: DesktopSnapshot;
  selectedProfile: LocalServerProfile | null;
  authFlowState: 'idle' | 'waiting' | 'failed';
}): OnboardingStep[] => {
  const selectedProfileId = selectedProfile?.id ?? '';
  const watchRoots = selectedProfileId ? snapshot.watchRoots.filter((root) => root.profileId === selectedProfileId) : [];
  const formatRules = selectedProfileId ? snapshot.formatRules.filter((rule) => rule.profileId === selectedProfileId) : [];
  const signedIn = isSignedInToSelectedServer(snapshot);
  const finishingSignIn = !signedIn && authFlowState === 'waiting';
  const rulesReminderDismissed = snapshot.preferences.dismissAutomationRuleReadiness;
  const rulesDone = formatRules.length > 0 || rulesReminderDismissed;

  return [
    {
      key: 'auth',
      label: 'Sign in with Discord',
      status: signedIn
        ? `Signed in as ${snapshot.authUser?.displayName ?? 'you'}`
        : finishingSignIn
          ? 'Finishing sign-in…'
          : 'Waiting on you',
      detail: signedIn
        ? 'Your uploads are linked to your Discord account.'
        : 'Sign in so your uploads are linked to your account.',
      state: signedIn ? 'done' : finishingSignIn ? 'working' : 'waiting_on_you',
      complete: signedIn,
      optional: false
    },
    {
      key: 'watch-folders',
      label: 'Pick your OOTP export folder',
      status: watchRoots.length > 0
        ? watchRoots.length === 1
          ? 'Watching 1 folder'
          : `Watching ${watchRoots.length} folders`
        : 'Waiting on you',
      detail: watchRoots.length > 0
        ? 'New exports in this folder upload automatically.'
        : 'This is where OOTP saves your exports. Confirm it, or paste a different folder.',
      state: watchRoots.length > 0 ? 'done' : 'waiting_on_you',
      complete: watchRoots.length > 0,
      optional: false,
      href: '/automation#watch-folders',
      actionLabel: 'Manage folders'
    },
    {
      key: 'rules',
      label: 'Help with oddly named files',
      status: formatRules.length > 0
        ? `${formatRules.length} rule${formatRules.length === 1 ? '' : 's'} saved`
        : rulesReminderDismissed
          ? 'Hidden'
          : 'Optional',
      detail: formatRules.length > 0
        ? 'Rules tell the app which tournament a file belongs to when its name doesn’t say.'
        : 'Most files are recognized automatically. Add a rule if some aren’t.',
      state: rulesDone ? 'done' : 'optional',
      complete: rulesDone,
      optional: true,
      href: '/automation#format-rules',
      actionLabel: formatRules.length > 0 ? 'Review rules' : 'Add a rule',
      dismissible: !rulesDone
    }
  ];
};

export const requiredOnboardingSteps = (steps: OnboardingStep[]): OnboardingStep[] => steps.filter((step) => !step.optional);

// The first required step still open, or null once setup is done.
export const nextOnboardingStep = (steps: OnboardingStep[]): OnboardingStep | null =>
  requiredOnboardingSteps(steps).find((step) => !step.complete) ?? null;
