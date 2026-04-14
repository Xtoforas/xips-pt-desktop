import { Alert, Badge, Button, Card, Group, HoverCard, Select, Stack, Text, TextInput } from '@mantine/core';
import { Link, NavLink, useLocation } from 'react-router-dom';
import type {
  DesktopPreferences,
  LocalDetectedFile,
  LocalFormatRule,
  LocalServerProfile,
  LocalWatchRoot,
  LocalUploadJob,
  TournamentFormat
} from '@xips/api-contract';
import { useEffect, useRef, useState } from 'react';
import { useDesktop } from './DesktopContext';
import { desktopClient } from './desktop-client';

const navItems: ReadonlyArray<{ to: string; label: string; support?: boolean }> = [
  { to: '/today', label: 'Today' },
  { to: '/queue', label: 'Queue' },
  { to: '/automation', label: 'Automation' },
  { to: '/settings', label: 'Settings' },
  { to: '/diagnostics', label: 'Diagnostics', support: true }
];

const serverOptions = (profiles: LocalServerProfile[]): Array<{ value: string; label: string }> =>
  profiles.map((profile) => ({
    value: profile.id,
    label: profile.name
  }));

type OnboardingStep = {
  key: string;
  label: string;
  status: string;
  detail: string;
  href: string;
  actionLabel: string;
  complete: boolean;
};

export const buildOnboardingSteps = ({
  snapshot,
  health,
  selectedProfile,
  authFlowState
}: {
  snapshot: ReturnType<typeof useDesktop>['snapshot'];
  health: ReturnType<typeof useDesktop>['health'];
  selectedProfile: ReturnType<typeof useDesktop>['selectedProfile'];
  authFlowState: ReturnType<typeof useDesktop>['authFlowState'];
}): OnboardingStep[] => {
  const selectedProfileId = selectedProfile?.id ?? '';
  const watchRoots = selectedProfileId ? snapshot.watchRoots.filter((root) => root.profileId === selectedProfileId) : [];
  const formatRules = selectedProfileId ? snapshot.formatRules.filter((rule) => rule.profileId === selectedProfileId) : [];
  const isAuthenticated = snapshot.authUser !== null && snapshot.authProfileId === snapshot.selectedProfileId;

  return [
    {
      key: 'server',
      label: 'Server profile',
      status: selectedProfile ? `Using ${selectedProfile.name}` : snapshot.profiles.length > 0 ? 'Choose the server to use' : 'No server profile yet',
      detail: selectedProfile
        ? 'Server settings and health checks live in Settings.'
        : 'Add a server profile first so the desktop app knows which xips-pt instance to talk to.',
      href: '/settings#server-profile',
      actionLabel: selectedProfile ? 'Review server setup' : 'Open server setup',
      complete: Boolean(selectedProfile)
    },
    {
      key: 'health',
      label: 'Health check',
      status: !selectedProfile
        ? 'Choose a server first'
        : health?.ok
          ? 'Server responded'
          : health
            ? 'Server needs attention'
            : 'Not checked yet',
      detail: !selectedProfile
        ? 'Pick a server profile before running the health check.'
        : health?.ok
          ? 'A healthy response means the app can reach the selected server.'
          : 'Run the check from Settings to confirm the server URL and backend are reachable.',
      href: '/settings#server-health',
      actionLabel: 'Check server',
      complete: Boolean(selectedProfile && health?.ok)
    },
    {
      key: 'auth',
      label: 'Discord sign-in',
      status: isAuthenticated
        ? `Signed in as ${snapshot.authUser?.displayName ?? 'the selected user'}`
        : authFlowState === 'waiting'
          ? 'Waiting for sign-in callback'
          : 'Sign-in still needed',
      detail: isAuthenticated
        ? 'Once signed in, the queue can use your account and the card views can switch to live personal data.'
        : 'Sign in after the server responds so the app can finish token exchange and unlock queue actions.',
      href: '/settings#sign-in',
      actionLabel: 'Open sign-in',
      complete: isAuthenticated
    },
    {
      key: 'watch-folders',
      label: 'Watch folders',
      status: watchRoots.length > 0 ? `${watchRoots.length} watched folder${watchRoots.length === 1 ? '' : 's'}` : 'No watched folder yet',
      detail: watchRoots.length > 0
        ? 'The app can discover new files automatically from watched folders.'
        : 'Add a watch folder so the desktop app can notice new exports without manual uploads.',
      href: '/automation#watch-folders',
      actionLabel: 'Add watch folder',
      complete: watchRoots.length > 0
    },
    {
      key: 'rules',
      label: 'Automation rule',
      status: formatRules.length > 0 ? `${formatRules.length} rule${formatRules.length === 1 ? '' : 's'} saved` : 'No automation rule yet',
      detail: formatRules.length > 0
        ? 'Rules connect watched files to the right tournament formats.'
        : 'Add a filename or folder rule so the app can map new files to the right format automatically.',
      href: '/automation#format-rules',
      actionLabel: 'Add automation rule',
      complete: formatRules.length > 0
    }
  ];
};

export const DesktopSidebar = (): JSX.Element => {
  const location = useLocation();
  const { snapshot, health, selectedProfile, authFlowState } = useDesktop();
  const onboardingSteps = buildOnboardingSteps({ snapshot, health, selectedProfile, authFlowState });
  const completedCount = onboardingSteps.filter((step) => step.complete).length;
  const nextStep = onboardingSteps.find((step) => !step.complete) ?? null;

  return (
    <aside className="desktop-sidebar">
      <div className="desktop-brand">
        <div className="desktop-brand-mark">XP</div>
        <div>
          <h1>xips-pt Desktop</h1>
          <p>Operator workflow control room</p>
        </div>
      </div>
      <div className="desktop-nav">
        {navItems.map((item) => (
          <div key={item.to}>
            {item.support ? <div className="desktop-nav-support-label">Support tools</div> : null}
            <NavLink
              className={`desktop-nav-link${location.pathname === item.to ? ' active' : ''}${
                item.support ? ' desktop-nav-link-support' : ''
              }`}
              to={item.to}
            >
              {item.label}
            </NavLink>
          </div>
        ))}
      </div>
      <Card withBorder className="desktop-status-card desktop-onboarding-card">
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text className="desktop-micro-label">Setup checklist</Text>
              <Text fw={700}>First-run readiness</Text>
            </div>
            <Badge color={nextStep ? 'orange' : 'teal'} variant="light">
              {completedCount}/5
            </Badge>
          </Group>
          <Text size="xs" c="dimmed">
            {nextStep
              ? `Next: ${nextStep.label.toLowerCase()}`
              : 'Setup complete. The app is ready for normal operation.'}
          </Text>
          <Stack gap={6}>
            {onboardingSteps.map((step) => (
              <div key={step.key} className="desktop-onboarding-step">
                <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                  <div>
                    <Text size="sm" fw={600}>
                      {step.label}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {step.status}
                    </Text>
                  </div>
                  <Badge color={step.complete ? 'teal' : step === nextStep ? 'orange' : 'gray'} variant="light">
                    {step.complete ? 'Ready' : 'Next'}
                  </Badge>
                </Group>
                {!step.complete ? (
                  <Button component={Link} to={step.href} size="compact-xs" variant="light" className="desktop-onboarding-action">
                    {step.actionLabel}
                  </Button>
                ) : null}
              </div>
            ))}
          </Stack>
          {nextStep ? (
            <Button component={Link} to={nextStep.href} size="xs">
              {nextStep.actionLabel}
            </Button>
          ) : (
            <Alert color="teal" variant="light">
              Signed in, watched folders configured, and automation rules ready.
            </Alert>
          )}
        </Stack>
      </Card>
      <Card withBorder className="desktop-status-card">
        <Stack gap={6}>
          <Text className="desktop-micro-label">Server status</Text>
          <Group justify="space-between">
            <Text size="sm">{health?.service ?? 'Not checked'}</Text>
            <Badge color={health?.ok ? 'teal' : 'gray'} variant="light">
              {health?.ok ? 'Healthy' : 'Idle'}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed">
            Queue depth: {health?.queueDepth ?? 0}
          </Text>
          <Text size="xs" c="dimmed">
            Failed jobs: {health?.failedJobs ?? 0}
          </Text>
          <Text size="xs" c="dimmed">
            Profiles: {snapshot.profiles.length}
          </Text>
        </Stack>
      </Card>
    </aside>
  );
};

export const DesktopTopbar = (): JSX.Element => {
  const {
    snapshot,
    authFlowState,
    selectedProfile,
    selectServerProfile,
    openAuthWindow,
    logout,
    processUploadQueue
  } = useDesktop();
  const isAuthenticated = snapshot.authUser !== null && snapshot.authProfileId === snapshot.selectedProfileId;
  const needsAttentionCount = snapshot.uploadJobs.filter(uploadJobNeedsAttention).length;
  const automaticQueueCount = snapshot.uploadJobs.filter(uploadJobWorkingAutomatically).length;

  return (
    <header className="desktop-topbar">
      <Group gap="sm" wrap="wrap" className="desktop-topbar-left">
        <Group gap="xs" wrap="nowrap" className="desktop-server-field">
          <Text size="sm" fw={600}>
            Server
          </Text>
          <Select
            value={snapshot.selectedProfileId || null}
            data={serverOptions(snapshot.profiles)}
            placeholder="Select a server"
            className="desktop-select-wrap"
            onChange={(value) => {
              if (value) {
                void selectServerProfile(value);
              }
            }}
          />
        </Group>
        {selectedProfile ? (
          <Text size="sm" c="dimmed" className="desktop-mono desktop-topbar-endpoint">
            {selectedProfile.baseUrl}
          </Text>
        ) : null}
        {snapshot.tokenExpiresAt && isAuthenticated ? (
          <Text size="xs" c="dimmed">
            Token {new Date(snapshot.tokenExpiresAt).toLocaleString()}
          </Text>
        ) : null}
        {authFlowState === 'waiting' ? (
          <Badge color="orange" variant="light">
            Completing sign-in...
          </Badge>
        ) : null}
      </Group>
      <Group gap="sm">
        {!selectedProfile ? (
          <Alert className="desktop-topbar-alert" color="blue" variant="light" title="Setup in progress">
            Use the checklist to add a server, check health, sign in, and finish watch-folder setup.
          </Alert>
        ) : null}
        {needsAttentionCount > 0 ? (
          <Badge color="orange" variant="light">
            Needs action {needsAttentionCount}
          </Badge>
        ) : null}
        {automaticQueueCount > 0 ? (
          <Badge color="blue" variant="light">
            Working {automaticQueueCount}
          </Badge>
        ) : (
          <Badge color="gray" variant="light">
            Queue idle
          </Badge>
        )}
        {selectedProfile ? (
          <>
            {!isAuthenticated ? (
              <Button
                size="xs"
                variant="light"
                disabled={authFlowState === 'waiting'}
                onClick={() => void openAuthWindow(selectedProfile.id)}
              >
                Sign in
              </Button>
            ) : null}
            <Button size="xs" variant="light" disabled={!isAuthenticated} onClick={() => void processUploadQueue(selectedProfile.id)}>
              Run queue now
            </Button>
            {snapshot.authUser && isAuthenticated ? (
              <HoverCard shadow="md" position="bottom-end" withArrow>
                <HoverCard.Target>
                  <Button size="xs" variant="subtle">
                    {snapshot.authUser.displayName}
                  </Button>
                </HoverCard.Target>
                <HoverCard.Dropdown>
                  <Stack gap="xs">
                    <Text size="sm" fw={600}>
                      {snapshot.authUser.displayName}
                    </Text>
                    <Button size="xs" color="red" variant="light" onClick={() => void logout(selectedProfile.id)}>
                      Logout
                    </Button>
                  </Stack>
                </HoverCard.Dropdown>
              </HoverCard>
            ) : null}
          </>
        ) : null}
      </Group>
    </header>
  );
};

export const OnboardingChecklist = (): JSX.Element => {
  const {
    snapshot,
    authFlowError,
    authFlowState,
    selectedProfile,
    health,
    saveServerProfile,
    refreshHealth,
    openAuthWindow,
    refreshMe
  } = useDesktop();
  const [profileName, setProfileName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'health' | 'signin' | 'validate' | ''>('');
  const isAuthenticated = snapshot.authUser !== null && snapshot.authProfileId === snapshot.selectedProfileId;
  const hasSelectedProfile = selectedProfile !== null;
  const onboardingSteps = buildOnboardingSteps({ snapshot, health, selectedProfile, authFlowState });
  const nextStep = onboardingSteps.find((step) => !step.complete) ?? null;
  const completedCount = onboardingSteps.filter((step) => step.complete).length;

  const handleSaveProfile = async (): Promise<void> => {
    if (!profileName.trim() || !baseUrl.trim()) {
      setErrorMessage('Enter a profile name and the xips-pt base URL first.');
      return;
    }
    setBusyAction('save');
    setErrorMessage('');
    try {
      await saveServerProfile({
        name: profileName.trim(),
        baseUrl: baseUrl.trim()
      });
      setProfileName('');
      setBaseUrl('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save server profile.');
    } finally {
      setBusyAction('');
    }
  };

  const handleCheckServer = async (): Promise<void> => {
    if (!selectedProfile) {
      return;
    }
    setBusyAction('health');
    setErrorMessage('');
    try {
      await refreshHealth();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to contact the selected server.');
    } finally {
      setBusyAction('');
    }
  };

  const handleOpenSignin = async (): Promise<void> => {
    if (!selectedProfile) {
      return;
    }
    setBusyAction('signin');
    setErrorMessage('');
    try {
      await openAuthWindow(selectedProfile.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to open the Discord sign-in window.');
    } finally {
      setBusyAction('');
    }
  };

  const handleValidateAuth = async (): Promise<void> => {
    if (!selectedProfile) {
      return;
    }
    setBusyAction('validate');
    setErrorMessage('');
    try {
      await refreshMe(selectedProfile.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Auth validation failed.');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="desktop-oobe-wrap">
      <Card withBorder className="desktop-oobe-hero">
        <Stack gap="lg">
          <div>
            <Text className="desktop-micro-label">First-run setup</Text>
            <h2 className="desktop-page-title">Keep the app shell visible while setup finishes</h2>
            <p className="desktop-page-subtitle">
              Follow the checklist to add a server, verify health, sign in, and wire up automation without hiding the rest of the product.
            </p>
          </div>
          <Alert color={nextStep ? 'blue' : 'teal'} variant="light" title={nextStep ? `Next step: ${nextStep.label}` : 'Setup complete'}>
            {nextStep
              ? nextStep.detail
              : 'The desktop app is ready for normal operation, and the full workflow is now unlocked.'}
          </Alert>
          {errorMessage ? (
            <Alert color="red" title="Setup problem">
              {errorMessage}
            </Alert>
          ) : null}
          {authFlowError ? (
            <Alert color="red" title="Desktop sign-in problem">
              {authFlowError}
            </Alert>
          ) : null}
          <Group gap="sm">
            <Badge color="blue" variant="light">
              {completedCount}/5 ready
            </Badge>
            {selectedProfile ? (
              <Badge color="teal" variant="light">
                {selectedProfile.name}
              </Badge>
            ) : (
              <Badge color="gray" variant="light">
                No server selected
              </Badge>
            )}
          </Group>
          <div className="desktop-oobe-grid">
            <Card withBorder className="desktop-card">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={700}>1. Add server</Text>
                  <Badge color={hasSelectedProfile ? 'teal' : 'blue'} variant="light">
                    {hasSelectedProfile ? 'Done' : 'Required'}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  Create or choose the server profile for the xips-pt instance this desktop app should talk to.
                </Text>
                <TextInput
                  label="Profile name"
                  placeholder="Local xips-pt"
                  value={profileName}
                  onChange={(event) => setProfileName(event.currentTarget.value)}
                />
                <TextInput
                  label="Base URL"
                  placeholder="http://localhost:8080"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.currentTarget.value)}
                />
                {selectedProfile ? (
                  <Alert color="gray" variant="light" title="Selected server">
                    <div>{selectedProfile.name}</div>
                    <div className="desktop-mono">{selectedProfile.baseUrl}</div>
                  </Alert>
                ) : null}
                <Group justify="flex-end">
                  <Button loading={busyAction === 'save'} onClick={() => void handleSaveProfile()}>
                    Save server
                  </Button>
                </Group>
              </Stack>
            </Card>
            <Card withBorder className="desktop-card">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={700}>2. Verify server</Text>
                  <Badge color={health?.ok ? 'teal' : 'gray'} variant="light">
                    {health?.ok ? 'Healthy' : 'Unchecked'}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  Make sure the selected server responds before opening the auth flow.
                </Text>
                <div className="desktop-oobe-status-list">
                  <div>
                    <Text className="desktop-micro-label">Service</Text>
                    <Text>{health?.service ?? 'Not checked yet'}</Text>
                  </div>
                  <div>
                    <Text className="desktop-micro-label">Queue depth</Text>
                    <Text>{health?.queueDepth ?? 0}</Text>
                  </div>
                  <div>
                    <Text className="desktop-micro-label">Failed jobs</Text>
                    <Text>{health?.failedJobs ?? 0}</Text>
                  </div>
                </div>
                <Group justify="flex-end">
                  <Button
                    variant="light"
                    disabled={!selectedProfile}
                    loading={busyAction === 'health'}
                    onClick={() => void handleCheckServer()}
                  >
                    Check server
                  </Button>
                </Group>
              </Stack>
            </Card>
            <Card withBorder className="desktop-card">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={700}>3. Sign in with Discord</Text>
                  <Badge color={isAuthenticated ? 'teal' : 'orange'} variant="light">
                    {isAuthenticated ? 'Connected' : 'Pending'}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  Open the website login flow in the auth popup. As soon as Discord auth finishes, the desktop app will complete token exchange and close the window automatically.
                </Text>
                <div className="desktop-oobe-status-list">
                  <div>
                    <Text className="desktop-micro-label">Selected profile</Text>
                    <Text>{selectedProfile?.name ?? 'No server selected'}</Text>
                  </div>
                  <div>
                    <Text className="desktop-micro-label">Auth state</Text>
                    <Text>
                      {isAuthenticated
                        ? snapshot.authUser?.displayName ?? 'Signed in'
                        : authFlowState === 'waiting'
                          ? 'Waiting for callback'
                          : 'Signed out'}
                    </Text>
                  </div>
                  <div>
                    <Text className="desktop-micro-label">Token expiry</Text>
                    <Text>{snapshot.tokenExpiresAt || 'No token issued yet'}</Text>
                  </div>
                </div>
                <Group>
                  <Button
                    disabled={!selectedProfile}
                    loading={busyAction === 'signin' || authFlowState === 'waiting'}
                    onClick={() => void handleOpenSignin()}
                  >
                    Open sign-in
                  </Button>
                  <Button
                    variant="subtle"
                    disabled={!selectedProfile}
                    loading={busyAction === 'validate'}
                    onClick={() => void handleValidateAuth()}
                  >
                    Validate auth
                  </Button>
                </Group>
                {isAuthenticated ? (
                  <Alert color="teal" title="Setup complete">
                    The desktop app is connected. Watch folders and automation rules are the next steps.
                  </Alert>
                ) : null}
              </Stack>
            </Card>
          </div>
        </Stack>
      </Card>
    </div>
  );
};

const lifecycleColor = (value: string | null): string => {
  switch (value) {
    case 'complete':
      return 'teal';
    case 'refreshing':
      return 'cyan';
    case 'refresh_pending':
      return 'blue';
    case 'processing':
      return 'orange';
    case 'failed':
      return 'red';
    case 'skipped_duplicate':
      return 'gray';
    case 'queued':
      return 'yellow';
    default:
      return 'gray';
  }
};

const localStateColor = (value: LocalUploadJob['localState']): string => {
  switch (value) {
    case 'complete':
      return 'teal';
    case 'uploading':
      return 'orange';
    case 'server_processing':
    case 'server_refresh_pending':
    case 'server_refreshing':
      return 'blue';
    case 'failed_retryable':
      return 'yellow';
    case 'failed_terminal':
      return 'red';
    case 'duplicate_skipped_local':
      return 'gray';
    case 'auth_blocked':
      return 'red';
    default:
      return 'gray';
  }
};

const localPresenceColor = (value: LocalUploadJob['localPresence']): string =>
  value === 'present' ? 'teal' : 'gray';

const actionRequiredStates = new Set<LocalUploadJob['localState']>([
  'awaiting_format_assignment',
  'failed_retryable',
  'auth_blocked'
]);

const automaticQueueStates = new Set<LocalUploadJob['localState']>([
  'detected',
  'queued_local',
  'uploading',
  'uploaded_waiting_server',
  'server_queued',
  'server_processing',
  'server_refresh_pending',
  'server_refreshing'
]);

const serverActiveStates = new Set<LocalUploadJob['localState']>([
  'uploaded_waiting_server',
  'server_queued',
  'server_processing',
  'server_refresh_pending',
  'server_refreshing'
]);

export const uploadJobNeedsAttention = (job: LocalUploadJob): boolean =>
  actionRequiredStates.has(job.localState);

export const uploadJobWorkingAutomatically = (job: LocalUploadJob): boolean =>
  automaticQueueStates.has(job.localState);

export const uploadJobWaitingOnServer = (job: LocalUploadJob): boolean =>
  serverActiveStates.has(job.localState);

export const formatFileKindLabel = (fileKind: LocalUploadJob['fileKind'] | 'unknown'): string => {
  switch (fileKind) {
    case 'stats_export':
      return 'Stats Export';
    case 'card_catalog':
      return 'Card Catalog';
    default:
      return 'Unknown';
  }
};

export const formatQueueStateLabel = (
  state: LocalUploadJob['localState'],
  fileKind: LocalUploadJob['fileKind']
): string => {
  const labels: Record<LocalUploadJob['localState'], string> = {
    detected: 'Detected',
    awaiting_format_assignment: 'Awaiting Format Assignment',
    queued_local: 'Queued Locally',
    duplicate_skipped_local: 'Skipped as Duplicate',
    uploading: 'Uploading',
    uploaded_waiting_server: 'Uploaded, Waiting on Server',
    server_queued: 'Queued on Server',
    server_processing: 'Server Processing',
    server_refresh_pending: 'Refresh Pending',
    server_refreshing: 'Refreshing',
    complete: 'Complete',
    failed_retryable: 'Retry Needed',
    failed_terminal: 'Failed',
    auth_blocked: 'Sign-In Required'
  };

  if (fileKind === 'card_catalog' && (state === 'complete' || state === 'server_refresh_pending')) {
    return 'Catalog Updated';
  }
  return labels[state];
};

export const formatLifecycleLabel = (
  phase: LocalUploadJob['lifecyclePhase'],
  fileKind: LocalUploadJob['fileKind']
): string => {
  const labels: Record<NonNullable<LocalUploadJob['lifecyclePhase']>, string> = {
    queued: 'Queued',
    processing: 'Processing',
    refresh_pending: 'Refresh Pending',
    refreshing: 'Refreshing',
    complete: 'Complete',
    failed: 'Failed',
    skipped_duplicate: 'Skipped as Duplicate'
  };

  if (fileKind === 'card_catalog' && (phase === 'complete' || phase === 'refresh_pending')) {
    return 'Catalog Updated';
  }
  return phase ? labels[phase] : 'Not Started';
};

export const formatLocalPresenceLabel = (presence: LocalUploadJob['localPresence']): string =>
  presence === 'present' ? 'Present' : 'Missing';

export const formatDetectedFileStateLabel = (state: LocalDetectedFile['localState']): string => {
  const labels: Record<LocalDetectedFile['localState'], string> = {
    detected: 'Detected',
    queued_local: 'Queued Locally',
    awaiting_format_assignment: 'Awaiting Format Assignment',
    ignored: 'Ignored'
  };
  return labels[state];
};

export const getUploadJobModifiedAt = (job: LocalUploadJob): number | null => {
  const sourceModifiedAt = Number(job.sourceModifiedAt);
  if (Number.isFinite(sourceModifiedAt) && sourceModifiedAt > 0) {
    return sourceModifiedAt;
  }

  const queueUpdatedAt = Date.parse(job.updatedAt);
  return Number.isFinite(queueUpdatedAt) ? queueUpdatedAt : null;
};

export const formatUploadJobModifiedAt = (job: LocalUploadJob): string => {
  const modifiedAt = getUploadJobModifiedAt(job);
  return modifiedAt === null ? '-' : new Date(modifiedAt).toLocaleString();
};

export const formatSourceModifiedAt = (sourceModifiedAt: string): string => {
  const parsed = Number(sourceModifiedAt);
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toLocaleString() : '-';
};

export const FileKindBadge = ({ fileKind }: { fileKind: LocalUploadJob['fileKind'] }): JSX.Element => (
  <Badge color={fileKind === 'card_catalog' ? 'grape' : 'blue'} variant="light">
    {formatFileKindLabel(fileKind)}
  </Badge>
);

export const QueueStateBadge = ({
  state,
  fileKind
}: {
  state: LocalUploadJob['localState'];
  fileKind: LocalUploadJob['fileKind'];
}): JSX.Element => (
  <Badge color={localStateColor(state)} variant="light">
    {formatQueueStateLabel(state, fileKind)}
  </Badge>
);

export const LifecycleBadge = ({
  phase,
  fileKind
}: {
  phase: LocalUploadJob['lifecyclePhase'];
  fileKind: LocalUploadJob['fileKind'];
}): JSX.Element => (
  <Badge color={lifecycleColor(phase)} variant="light">
    {formatLifecycleLabel(phase, fileKind)}
  </Badge>
);

export const LocalPresenceBadge = ({ presence }: { presence: LocalUploadJob['localPresence'] }): JSX.Element => (
  <Badge color={localPresenceColor(presence)} variant="light">
    {formatLocalPresenceLabel(presence)}
  </Badge>
);

export const SummaryCard = ({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}): JSX.Element => (
  <Card withBorder className="desktop-card">
    <Stack gap={4}>
      <Text className="desktop-micro-label">{label}</Text>
      <Text className="desktop-stat">{value}</Text>
      <Text size="xs" c="dimmed">
        {detail}
      </Text>
    </Stack>
  </Card>
);

export const formatOvrRangeLabel = (format: TournamentFormat): string => {
  if (format.ovrMin === null || format.ovrMax === null) {
    return '-';
  }
  return `${Math.min(format.ovrMin, format.ovrMax)}-${Math.max(format.ovrMin, format.ovrMax)}`;
};

export const formatSlotCountsLabel = (format: TournamentFormat): string => {
  if (!format.isSlotsTournament) {
    return '-';
  }
  return `P ${format.slotCounts.P} / D ${format.slotCounts.D} / G ${format.slotCounts.G} / S ${format.slotCounts.S} / B ${format.slotCounts.B}`;
};

export const formatTeamsPerTournamentLabel = (format: TournamentFormat): string =>
  format.teamsPerTournament > 0 ? String(format.teamsPerTournament) : '-';

export const QueueTable = ({
  jobs,
  formatLabels,
  selectedJobId,
  selectedJobIds,
  onSelect,
  onToggleJobSelection,
  onToggleAllSelection,
  actions,
  renderFilename
}: {
  jobs: LocalUploadJob[];
  formatLabels?: Record<string, string>;
  selectedJobId?: string;
  selectedJobIds?: string[];
  onSelect?: (job: LocalUploadJob) => void;
  onToggleJobSelection?: (job: LocalUploadJob, checked: boolean) => void;
  onToggleAllSelection?: (checked: boolean) => void;
  actions?: (job: LocalUploadJob) => JSX.Element;
  renderFilename?: (job: LocalUploadJob) => JSX.Element;
}): JSX.Element => {
  const orderedJobs = [...jobs].sort(
    (left, right) => (getUploadJobModifiedAt(right) ?? 0) - (getUploadJobModifiedAt(left) ?? 0)
  );
  const selectionEnabled = Boolean(selectedJobIds && onToggleJobSelection && onToggleAllSelection);
  const selectedIds = new Set(selectedJobIds ?? []);
  const selectedVisibleCount = orderedJobs.filter((job) => selectedIds.has(job.id)).length;
  const allVisibleSelected = orderedJobs.length > 0 && selectedVisibleCount === orderedJobs.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectAllRef.current) {
      return;
    }
    selectAllRef.current.indeterminate = selectionEnabled && someVisibleSelected;
  }, [selectionEnabled, someVisibleSelected]);

  return (
  <div className="desktop-table-wrap">
    <table className="desktop-table">
      <thead>
        <tr>
          {selectionEnabled ? (
            <th>
              <input
                ref={selectAllRef}
                type="checkbox"
                aria-label="Select all queue entries"
                checked={allVisibleSelected}
                onChange={(event) => {
                  onToggleAllSelection?.(event.currentTarget.checked);
                }}
              />
            </th>
          ) : null}
          <th>Modified</th>
          <th>File</th>
          <th>Kind</th>
          <th>Format</th>
          <th>Local file</th>
          <th>Checksum</th>
          <th>Local state</th>
          <th>Server state</th>
          <th>Retry attempts</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {orderedJobs.length === 0 ? (
          <tr>
            <td colSpan={selectionEnabled ? 11 : 10}>No queued uploads yet.</td>
          </tr>
        ) : (
          orderedJobs.map((job) => (
            <tr
              key={job.id}
              className={selectedJobId === job.id ? 'desktop-row-selected' : ''}
              onClick={() => onSelect?.(job)}
            >
              {selectionEnabled ? (
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${job.filename}`}
                    checked={selectedIds.has(job.id)}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                    onChange={(event) => {
                      event.stopPropagation();
                      onToggleJobSelection?.(job, event.currentTarget.checked);
                    }}
                  />
                </td>
              ) : null}
              <td>{formatUploadJobModifiedAt(job)}</td>
              <td>{renderFilename ? renderFilename(job) : job.filename}</td>
              <td>
                <FileKindBadge fileKind={job.fileKind} />
              </td>
              <td>{job.formatId ? (formatLabels?.[job.formatId] ?? 'Unknown format') : 'Unassigned'}</td>
              <td>
                <LocalPresenceBadge presence={job.localPresence} />
              </td>
              <td className="desktop-mono">
                {job.duplicateReason ? 'Duplicate' : job.remoteChecksum ? 'Uploaded' : 'Pending'}
              </td>
              <td>
                <QueueStateBadge state={job.localState} fileKind={job.fileKind} />
              </td>
              <td>
                <LifecycleBadge phase={job.lifecyclePhase} fileKind={job.fileKind} />
              </td>
              <td>{job.retries}</td>
              <td>{actions ? actions(job) : '-'}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
  );
};

export const WatchRootTable = ({
  watchRoots,
  onToggle,
  onDelete
}: {
  watchRoots: LocalWatchRoot[];
  onToggle: (watchRootId: string, paused: boolean) => Promise<void>;
  onDelete: (watchRootId: string) => Promise<void>;
}): JSX.Element => (
  <div className="desktop-table-wrap">
    <table className="desktop-table">
      <thead>
        <tr>
          <th>Path</th>
          <th>Recursive</th>
          <th>Status</th>
          <th>Updated</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {watchRoots.length === 0 ? (
          <tr>
            <td colSpan={5}>No watched directories configured.</td>
          </tr>
        ) : (
          watchRoots.map((root) => (
            <tr key={root.id}>
              <td className="desktop-mono">{root.path}</td>
              <td>{root.recursive ? 'Yes' : 'No'}</td>
              <td>{root.paused ? 'Paused' : 'Active'}</td>
              <td>{new Date(root.updatedAt).toLocaleString()}</td>
              <td>
                <Group gap="xs">
                  <Button size="compact-xs" variant="light" onClick={() => void onToggle(root.id, !root.paused)}>
                    {root.paused ? 'Resume' : 'Pause'}
                  </Button>
                  <Button size="compact-xs" color="red" variant="light" onClick={() => void onDelete(root.id)}>
                    Remove
                  </Button>
                </Group>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export const FormatsTable = ({ formats }: { formats: TournamentFormat[] }): JSX.Element => (
  <div className="desktop-table-wrap">
    <table className="desktop-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Tournament ID</th>
          <th>Teams</th>
          <th>Mode</th>
          <th>Run Environment</th>
          <th>Park</th>
          <th>Cap</th>
          <th>OVR range</th>
          <th>Slots</th>
        </tr>
      </thead>
      <tbody>
        {formats.length === 0 ? (
          <tr>
            <td colSpan={9}>No cached formats yet.</td>
          </tr>
        ) : (
          formats.map((format) => (
            <tr key={format.id}>
              <td>{format.name}</td>
              <td>{format.tournamentIdPrefix ? `${format.tournamentIdPrefix}${'x'.repeat(4)}` : '-'}</td>
              <td>{formatTeamsPerTournamentLabel(format)}</td>
              <td>{format.mode || '-'}</td>
              <td>{format.runEnvironment || '-'}</td>
              <td>{format.parkKey || '-'}</td>
              <td>{format.capValue || '-'}</td>
              <td>{formatOvrRangeLabel(format)}</td>
              <td>{formatSlotCountsLabel(format)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export const ServerProfileForm = ({ id }: { id?: string }): JSX.Element => {
  const { snapshot, saveServerProfile } = useDesktop();
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  return (
    <Card withBorder className="desktop-card" id={id}>
      <Stack gap="sm">
        <Text fw={700}>Add server profile</Text>
        <Select
          label="Edit existing profile"
          placeholder="Create a new profile"
          value={editingId || null}
          data={[
            { value: '', label: 'Create new profile' },
            ...snapshot.profiles.map((profile) => ({ value: profile.id, label: profile.name }))
          ]}
          onChange={(value) => {
            const nextId = value ?? '';
            setEditingId(nextId);
            const profile = snapshot.profiles.find((item) => item.id === nextId) ?? null;
            setName(profile?.name ?? '');
            setBaseUrl(profile?.baseUrl ?? '');
          }}
        />
        <TextInput label="Profile name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
        <TextInput label="Base URL" value={baseUrl} onChange={(event) => setBaseUrl(event.currentTarget.value)} />
        <Group justify="flex-end">
          <Button
            onClick={() => {
              if (!name.trim() || !baseUrl.trim()) {
                return;
              }
              void saveServerProfile({
                id: editingId || undefined,
                name: name.trim(),
                baseUrl: baseUrl.trim()
              }).then(() => {
                setEditingId('');
                setName('');
                setBaseUrl('');
              });
            }}
          >
            {editingId ? 'Update profile' : 'Save profile'}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};

export const WatchRootForm = ({ id }: { id?: string }): JSX.Element => {
  const { selectedProfile, addWatchRoot } = useDesktop();
  const [path, setPath] = useState('');

  useEffect(() => {
    if (!selectedProfile) {
      setPath('');
      return;
    }
    let active = true;
    void desktopClient.getDefaultWatchRoot().then((defaultPath) => {
      if (active && defaultPath && !path.trim()) {
        setPath(defaultPath);
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedProfile?.id]);

  return (
    <Card withBorder className="desktop-card" id={id}>
      <Stack gap="sm">
        <Text fw={700}>Add watch folder</Text>
        <TextInput
          label="Folder path"
          placeholder="Default OOTP 27 online_data path"
          value={path}
          onChange={(event) => setPath(event.currentTarget.value)}
        />
        <Text size="xs" c="dimmed">
          Defaults to the current platform&apos;s OOTP Baseball 27 `online_data` directory.
        </Text>
        <Group justify="flex-end">
          <Button
            disabled={!selectedProfile || !path.trim()}
            onClick={() => {
              if (!selectedProfile || !path.trim()) {
                return;
              }
              void addWatchRoot({
                profileId: selectedProfile.id,
                path: path.trim(),
                recursive: false
              }).then(() => {
                void desktopClient.getDefaultWatchRoot().then((defaultPath) => {
                  setPath(defaultPath);
                }).catch(() => {
                  setPath('');
                });
              });
            }}
          >
            Add folder
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};

export const FormatRuleTable = ({
  rules,
  onDelete
}: {
  rules: LocalFormatRule[];
  onDelete: (formatRuleId: string) => Promise<void>;
}): JSX.Element => (
  <div className="desktop-table-wrap">
    <table className="desktop-table">
      <thead>
        <tr>
          <th>Match</th>
          <th>Pattern</th>
          <th>Format</th>
          <th>Updated</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rules.length === 0 ? (
          <tr>
            <td colSpan={5}>No saved format rules yet.</td>
          </tr>
        ) : (
          rules.map((rule) => (
            <tr key={rule.id}>
              <td>{rule.matchType}</td>
              <td className="desktop-mono">{rule.pattern}</td>
              <td>{rule.formatName}</td>
              <td>{new Date(rule.updatedAt).toLocaleString()}</td>
              <td>
                <Button size="compact-xs" color="red" variant="light" onClick={() => void onDelete(rule.id)}>
                  Remove
                </Button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export const PreferencesForm = ({
  preferences,
  onSave
}: {
  preferences: DesktopPreferences;
  onSave: (preferences: DesktopPreferences) => Promise<void>;
}): JSX.Element => {
  const [launchAtLogin, setLaunchAtLogin] = useState(preferences.launchAtLogin);
  const [closeToTray, setCloseToTray] = useState(preferences.closeToTray);
  const [pollingIntervalSeconds, setPollingIntervalSeconds] = useState(String(preferences.pollingIntervalSeconds));
  const [diagnosticsRetentionDays, setDiagnosticsRetentionDays] = useState(String(preferences.diagnosticsRetentionDays));

  return (
    <Card withBorder className="desktop-card">
      <Stack gap="sm">
        <Text fw={700}>Desktop behavior</Text>
        <label className="desktop-checkbox-row">
          <input
            type="checkbox"
            checked={launchAtLogin}
            onChange={(event) => setLaunchAtLogin(event.currentTarget.checked)}
          />
          <span>Launch at login</span>
        </label>
        <label className="desktop-checkbox-row">
          <input type="checkbox" checked={closeToTray} onChange={(event) => setCloseToTray(event.currentTarget.checked)} />
          <span>Keep running in the background</span>
        </label>
        <TextInput
          label="Polling interval (seconds)"
          value={pollingIntervalSeconds}
          onChange={(event) => setPollingIntervalSeconds(event.currentTarget.value)}
        />
        <TextInput
          label="Diagnostics retention (days)"
          value={diagnosticsRetentionDays}
          onChange={(event) => setDiagnosticsRetentionDays(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button
            onClick={() => {
              const polling = Number.parseInt(pollingIntervalSeconds, 10);
              const retention = Number.parseInt(diagnosticsRetentionDays, 10);
              if (!Number.isFinite(polling) || !Number.isFinite(retention)) {
                return;
              }
              void onSave({
                launchAtLogin,
                closeToTray,
                pollingIntervalSeconds: polling,
                diagnosticsRetentionDays: retention
              });
            }}
          >
            Save preferences
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};
