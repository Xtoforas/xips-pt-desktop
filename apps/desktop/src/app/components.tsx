import { Alert, Badge, Button, Card, Checkbox, Group, HoverCard, NavLink, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, ThemeIcon, Tooltip } from '@mantine/core';
import { Link, useLocation } from 'react-router-dom';
import type {
  DesktopPreferences,
  LocalFormatRule,
  LocalServerProfile,
  LocalWatchRoot,
  LocalUploadJob,
  TournamentFormat
} from '@xips/api-contract';
import { useEffect, useRef, useState } from 'react';
import { useDesktop } from './DesktopContext';
import { desktopClient } from './desktop-client';
import {
  formatFileKindLabel,
  formatLifecycleLabel,
  formatLocalPresenceLabel,
  formatQueueStateLabel,
  formatUploadJobChecksumStatusLabel,
  formatUploadJobModifiedAt,
  getUploadJobModifiedAt,
  lifecycleColor,
  localPresenceColor,
  localStateColor,
  uploadJobNeedsAttention,
  uploadJobWorkingAutomatically
} from './queue-model';

const SidebarIcon = ({ path }: { path: string }): JSX.Element => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={path} />
  </svg>
);

const navItems: ReadonlyArray<{ to: string; label: string; iconPath: string; support?: boolean }> = [
  {
    to: '/today',
    label: 'Today',
    iconPath:
      'M19,3H18V1H16V3H8V1H6V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.9 20.1,3 19,3M19,19H5V8H19V19Z'
  },
  {
    to: '/queue',
    label: 'Queue',
    iconPath: 'M19.35 10.04A7.49 7.49 0 0 0 5 8a6 6 0 0 0 .35 12H19a5 5 0 0 0 .35-9.96zM13 13v4h-2v-4H8l4-4 4 4z'
  },
  {
    to: '/automation',
    label: 'Automation',
    iconPath: 'M7,2V13H10V22L17,10H13L17,2H7Z'
  },
  {
    to: '/settings',
    label: 'Settings',
    iconPath:
      'M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.22 7.22 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.23 1.13-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z'
  },
  {
    to: '/diagnostics',
    label: 'Diagnostics',
    iconPath:
      'M22.7,19L13.6,9.9C14.5,7.6 14,4.9 12.1,3C10.1,1 7.1,0.6 4.7,1.7L9,6L6,9L1.6,4.7C0.4,7.1 0.9,10.1 2.9,12.1C4.8,14 7.5,14.5 9.8,13.6L18.9,22.7C19.3,23.1 19.9,23.1 20.3,22.7L22.6,20.4C23.1,20 23.1,19.3 22.7,19Z',
    support: true
  }
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
  dismissible?: boolean;
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
  const automationReminderDismissed = snapshot.preferences.dismissAutomationRuleReadiness;

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
        : 'Open sign-in, then paste the short code it shows on the Settings page to finish connecting this device.',
      href: '/settings#server-health',
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
      status: formatRules.length > 0
        ? `${formatRules.length} rule${formatRules.length === 1 ? '' : 's'} saved`
        : automationReminderDismissed
          ? 'Reminder dismissed'
          : 'Optional',
      detail: formatRules.length > 0
        ? 'Rules help generic filenames map faster.'
        : automationReminderDismissed
          ? 'Watch folders still work without a saved rule. The app keeps using filename-based detection from cached server formats.'
          : 'Rules are optional. Add one when generic filenames need extra help.',
      href: '/automation#format-rules',
      actionLabel: formatRules.length > 0 ? 'Review automation' : 'Open automation',
      complete: formatRules.length > 0 || automationReminderDismissed,
      dismissible: formatRules.length === 0 && !automationReminderDismissed
    }
  ];
};

export const ReadinessCard = ({
  id,
  onboardingSteps,
  nextStep,
  selectedProfileName,
  dismissCompletedReadinessCard,
  onDismissCompletedReadinessCard,
  onDismissAutomationReminder,
  variant
}: {
  id?: string;
  onboardingSteps: ReturnType<typeof buildOnboardingSteps>;
  nextStep: ReturnType<typeof buildOnboardingSteps>[number] | null;
  selectedProfileName: string;
  dismissCompletedReadinessCard: boolean;
  onDismissCompletedReadinessCard: (dismissed: boolean) => void;
  onDismissAutomationReminder: () => void;
  variant: 'today' | 'settings';
}): JSX.Element | null => {
  if (!nextStep && variant === 'today' && dismissCompletedReadinessCard) {
    return null;
  }

  if (!nextStep) {
    return (
      <Card withBorder className="desktop-card desktop-today-readiness-compact" id={id}>
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="wrap">
            <div>
              <Text className="desktop-micro-label">Readiness</Text>
              <Text fw={700}>Operationally ready</Text>
            </div>
            <Text size="sm" c="dimmed">
              {selectedProfileName}
            </Text>
          </Group>
          <Group gap="xs" wrap="wrap">
            {onboardingSteps.map((step) => (
              <Badge key={step.key} color="teal" variant="light">
                {step.label}
              </Badge>
            ))}
          </Group>
          <Group gap="xs" wrap="wrap" justify="space-between">
            <Text size="sm" c="dimmed">
              The desktop app is ready for normal operation.
            </Text>
            <Group gap="xs" wrap="wrap">
              {variant === 'today' ? (
                <Button size="compact-xs" variant="subtle" color="gray" onClick={() => onDismissCompletedReadinessCard(true)}>
                  Dismiss
                </Button>
              ) : (
                <Button
                  size="compact-xs"
                  variant="light"
                  color="gray"
                  onClick={() => onDismissCompletedReadinessCard(!dismissCompletedReadinessCard)}
                >
                  {dismissCompletedReadinessCard ? 'Show on Today' : 'Hide from Today'}
                </Button>
              )}
              {variant === 'today' ? (
                <Button component={Link} to="/settings#readiness" size="compact-xs" variant="light">
                  Manage readiness
                </Button>
              ) : (
                <Button component={Link} to="/today" size="compact-xs" variant="light">
                  Open Today
                </Button>
              )}
            </Group>
          </Group>
        </Stack>
      </Card>
    );
  }

  return (
    <Card withBorder className="desktop-card desktop-today-strip" id={id}>
      <Stack gap="sm">
        <Group justify="space-between" align="center" wrap="wrap">
          <div>
            <Text className="desktop-micro-label">Readiness</Text>
            <Text fw={700}>Finish setup</Text>
          </div>
          <Text size="sm" c="dimmed">
            {selectedProfileName}
          </Text>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 2, xl: variant === 'today' ? 3 : 2 }} spacing="sm">
          {onboardingSteps.map((step, index) => (
            <Card key={step.key} withBorder className={`desktop-card desktop-today-strip-item${step.complete ? ' complete' : ''}`}>
              <Stack gap={6}>
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Text size="sm" fw={700}>
                      {index + 1}. {step.label}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {step.status}
                    </Text>
                  </div>
                  <Badge color={step.complete ? 'teal' : step === nextStep ? 'orange' : 'gray'} variant="light">
                    {step.complete ? 'Ready' : 'Pending'}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  {step === nextStep ? step.detail : step.complete ? 'Ready for normal operation.' : 'Still needs setup.'}
                </Text>
                {!step.complete ? (
                  <Group gap="xs" wrap="wrap">
                    <Button component={Link} to={step.href} size="compact-xs" variant="light" className="desktop-today-strip-action">
                      {step.actionLabel}
                    </Button>
                    {step.dismissible ? (
                      <Button size="compact-xs" variant="subtle" color="gray" onClick={onDismissAutomationReminder}>
                        Dismiss
                      </Button>
                    ) : null}
                  </Group>
                ) : null}
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Card>
  );
};

const SIDEBAR_COLLAPSE_DELAY_MS = 5000;
const SIDEBAR_EXPAND_HOVER_DELAY_MS = 3000;

export const DesktopSidebar = (): JSX.Element => {
  const location = useLocation();
  const { snapshot, health } = useDesktop();
  const [collapsed, setCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCollapseTimer = (): void => {
    if (collapseTimeoutRef.current !== null) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
  };

  const clearExpandTimer = (): void => {
    if (expandTimeoutRef.current !== null) {
      clearTimeout(expandTimeoutRef.current);
      expandTimeoutRef.current = null;
    }
  };

  const scheduleCollapse = (): void => {
    clearExpandTimer();
    clearCollapseTimer();
    collapseTimeoutRef.current = setTimeout(() => setCollapsed(true), SIDEBAR_COLLAPSE_DELAY_MS);
  };

  const expandNow = (): void => {
    clearExpandTimer();
    clearCollapseTimer();
    setCollapsed(false);
  };

  const handleMouseEnter = (): void => {
    clearCollapseTimer();
    if (!collapsed) {
      return;
    }
    // Wait for a deliberate hover instead of expanding the instant the cursor
    // grazes the collapsed rail, which otherwise flickers expand/collapse.
    clearExpandTimer();
    expandTimeoutRef.current = setTimeout(() => setCollapsed(false), SIDEBAR_EXPAND_HOVER_DELAY_MS);
  };

  const handleMouseLeave = (): void => {
    clearExpandTimer();
    if (!collapsed) {
      scheduleCollapse();
    }
  };

  useEffect(() => {
    scheduleCollapse();
    return () => {
      clearCollapseTimer();
      clearExpandTimer();
    };
  }, []);

  return (
    <Stack
      gap="sm"
      className="desktop-sidebar"
      data-collapsed={collapsed}
      p={collapsed ? 'xs' : 'sm'}
      ref={sidebarRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={expandNow}
      onBlurCapture={(event) => {
        if (!(event.relatedTarget instanceof Node) || !sidebarRef.current?.contains(event.relatedTarget)) {
          scheduleCollapse();
        }
      }}
    >
      <Paper withBorder radius="md" p={collapsed ? 4 : 'sm'}>
        <Group gap="sm" wrap="nowrap" align="center" justify={collapsed ? 'center' : 'flex-start'}>
          <ThemeIcon size={40} radius="md" variant="gradient" gradient={{ from: 'xipsBlue.5', to: 'xipsBlue.8', deg: 145 }}>
            <SidebarIcon path="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M7.39,5.72C8.61,7.16 9.34,9.07 9.34,11.17C9.34,13.27 8.61,15.18 7.39,16.62C5.94,15.41 5,13.8 5,12C5,10.19 5.94,8.59 7.39,7.37V5.72M16.61,7.38C18.05,8.59 19,10.2 19,12C19,13.8 18.05,15.41 16.61,16.62C15.39,15.18 14.66,13.27 14.66,11.17C14.66,9.07 15.39,7.16 16.61,5.72V7.38M9.03,4.79C9.88,4.29 10.9,4 12,4C13.1,4 14.12,4.29 14.97,4.79C13.78,6.45 13.09,8.53 13.09,10.76C13.09,12.97 13.78,15.05 14.97,16.71C14.12,17.21 13.1,17.5 12,17.5C10.9,17.5 9.88,17.21 9.03,16.71C10.22,15.05 10.91,12.97 10.91,10.76C10.91,8.53 10.22,6.45 9.03,4.79M8.66,17.95C9.63,18.45 10.77,18.74 12,18.74C13.23,18.74 14.37,18.45 15.34,17.95C14.38,19.2 13.26,20 12,20C10.74,20 9.62,19.2 8.66,17.95Z" />
          </ThemeIcon>
          {collapsed ? null : (
            <div>
              <Text component="h1" fw={700} size="sm">
                xips-pt Desktop
              </Text>
              <Text size="xs" c="dimmed">
                Local CSV uploader for xips-pt
              </Text>
            </div>
          )}
        </Group>
      </Paper>
      <Paper withBorder radius="md" p={collapsed ? 4 : 'xs'} style={{ flex: '1 1 auto' }}>
        <Stack gap="xs" align={collapsed ? 'center' : 'stretch'}>
          {navItems.map((item) => {
            const navLink = (
              <NavLink
                component={Link}
                to={item.to}
                label={collapsed ? undefined : item.label}
                color="xipsBlue"
                variant="light"
                active={location.pathname === item.to}
                leftSection={<SidebarIcon path={item.iconPath} />}
                style={collapsed ? { width: 40, justifyContent: 'center' } : undefined}
              />
            );
            return (
              <div key={item.to}>
                {item.support && !collapsed ? (
                  <Text className="desktop-nav-support-label" size="xs" c="dimmed" tt="uppercase">
                    Support tools
                  </Text>
                ) : null}
                {collapsed ? (
                  <Tooltip label={item.label} position="right" withArrow openDelay={200}>
                    {navLink}
                  </Tooltip>
                ) : (
                  navLink
                )}
              </div>
            );
          })}
        </Stack>
      </Paper>
      {collapsed ? null : (
        <Card withBorder className="desktop-server-status-card">
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
      )}
    </Stack>
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
      <div className="desktop-topbar-left">
        <Group gap="xs" wrap="nowrap" className="desktop-topbar-primary">
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
        <Group gap="sm" wrap="wrap" className="desktop-topbar-meta">
          {selectedProfile ? (
            <Text size="sm" c="dimmed">
              Uploading to <span className="desktop-mono">{selectedProfile.baseUrl}</span>
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
      </div>
      <Group gap="sm" wrap="wrap" className="desktop-topbar-actions">
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
              <>
                <Badge color="gray" variant="light">
                  Signed out
                </Badge>
                <Button
                  size="xs"
                  variant="light"
                  disabled={authFlowState === 'waiting'}
                  onClick={() => void openAuthWindow(selectedProfile.id)}
                >
                  Sign in
                </Button>
              </>
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
    <Table.ScrollContainer minWidth={960} type="native">
      <Table withTableBorder withColumnBorders highlightOnHover striped="odd">
        <Table.Thead>
          <Table.Tr>
            {selectionEnabled ? (
              <Table.Th>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="Select all queue entries"
                  checked={allVisibleSelected}
                  onChange={(event) => {
                    onToggleAllSelection?.(event.currentTarget.checked);
                  }}
                />
              </Table.Th>
            ) : null}
            <Table.Th>Modified</Table.Th>
            <Table.Th>File</Table.Th>
            <Table.Th>Kind</Table.Th>
            <Table.Th>Format</Table.Th>
            <Table.Th>Local file</Table.Th>
            <Table.Th>Checksum</Table.Th>
            <Table.Th>Local state</Table.Th>
            <Table.Th>Server state</Table.Th>
            <Table.Th>Retry attempts</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {orderedJobs.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={selectionEnabled ? 11 : 10}>No queued uploads yet.</Table.Td>
            </Table.Tr>
          ) : (
            orderedJobs.map((job) => (
              <Table.Tr
                key={job.id}
                className={selectedJobId === job.id ? 'desktop-row-selected' : ''}
                style={{ cursor: onSelect ? 'pointer' : undefined }}
                onClick={() => onSelect?.(job)}
              >
                {selectionEnabled ? (
                  <Table.Td>
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
                  </Table.Td>
                ) : null}
                <Table.Td>{formatUploadJobModifiedAt(job)}</Table.Td>
                <Table.Td>{renderFilename ? renderFilename(job) : job.filename}</Table.Td>
                <Table.Td>
                  <FileKindBadge fileKind={job.fileKind} />
                </Table.Td>
                <Table.Td>{job.formatId ? (formatLabels?.[job.formatId] ?? 'Unknown format') : 'Unassigned'}</Table.Td>
                <Table.Td>
                  <LocalPresenceBadge presence={job.localPresence} />
                </Table.Td>
                <Table.Td className="desktop-mono">
                  {formatUploadJobChecksumStatusLabel(job)}
                </Table.Td>
                <Table.Td>
                  <QueueStateBadge state={job.localState} fileKind={job.fileKind} />
                </Table.Td>
                <Table.Td>
                  <LifecycleBadge phase={job.lifecyclePhase} fileKind={job.fileKind} />
                </Table.Td>
                <Table.Td>{job.retries}</Table.Td>
                <Table.Td>{actions ? actions(job) : '-'}</Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
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
  <Table.ScrollContainer minWidth={640} type="native">
    <Table withTableBorder withColumnBorders highlightOnHover striped="odd">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Path</Table.Th>
          <Table.Th>Recursive</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th>Updated</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {watchRoots.length === 0 ? (
          <Table.Tr>
            <Table.Td colSpan={5}>No watched directories configured.</Table.Td>
          </Table.Tr>
        ) : (
          watchRoots.map((root) => (
            <Table.Tr key={root.id}>
              <Table.Td className="desktop-mono">{root.path}</Table.Td>
              <Table.Td>{root.recursive ? 'Yes' : 'No'}</Table.Td>
              <Table.Td>{root.paused ? 'Paused' : 'Active'}</Table.Td>
              <Table.Td>{new Date(root.updatedAt).toLocaleString()}</Table.Td>
              <Table.Td>
                <Group gap="xs">
                  <Button size="compact-xs" variant="light" onClick={() => void onToggle(root.id, !root.paused)}>
                    {root.paused ? 'Resume' : 'Pause'}
                  </Button>
                  <Button size="compact-xs" color="red" variant="light" onClick={() => void onDelete(root.id)}>
                    Remove
                  </Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))
        )}
      </Table.Tbody>
    </Table>
  </Table.ScrollContainer>
);

export const FormatsTable = ({ formats }: { formats: TournamentFormat[] }): JSX.Element => (
  <Table.ScrollContainer minWidth={760} type="native">
    <Table withTableBorder withColumnBorders highlightOnHover striped="odd">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>Tournament ID</Table.Th>
          <Table.Th>Teams</Table.Th>
          <Table.Th>Mode</Table.Th>
          <Table.Th>Run Environment</Table.Th>
          <Table.Th>Park</Table.Th>
          <Table.Th>Cap</Table.Th>
          <Table.Th>OVR range</Table.Th>
          <Table.Th>Slots</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {formats.length === 0 ? (
          <Table.Tr>
            <Table.Td colSpan={9}>No cached formats yet.</Table.Td>
          </Table.Tr>
        ) : (
          formats.map((format) => (
            <Table.Tr key={format.id}>
              <Table.Td>{format.name}</Table.Td>
              <Table.Td>{format.tournamentIdPrefix ? `${format.tournamentIdPrefix}${'x'.repeat(4)}` : '-'}</Table.Td>
              <Table.Td>{formatTeamsPerTournamentLabel(format)}</Table.Td>
              <Table.Td>{format.mode || '-'}</Table.Td>
              <Table.Td>{format.runEnvironment || '-'}</Table.Td>
              <Table.Td>{format.parkKey || '-'}</Table.Td>
              <Table.Td>{format.capValue || '-'}</Table.Td>
              <Table.Td>{formatOvrRangeLabel(format)}</Table.Td>
              <Table.Td>{formatSlotCountsLabel(format)}</Table.Td>
            </Table.Tr>
          ))
        )}
      </Table.Tbody>
    </Table>
  </Table.ScrollContainer>
);

export const ServerProfileForm = ({ id }: { id?: string }): JSX.Element => {
  const { snapshot, saveServerProfile } = useDesktop();
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [gameVersion, setGameVersion] = useState('ootp27');

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
            setGameVersion(profile?.gameVersion ?? 'ootp27');
          }}
        />
        <TextInput label="Profile name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
        <TextInput label="Base URL" value={baseUrl} onChange={(event) => setBaseUrl(event.currentTarget.value)} />
        <TextInput
          label="Game version"
          description="OOTP game version this server tracks, e.g. ootp27. Leave as ootp27 unless the server says otherwise."
          value={gameVersion}
          onChange={(event) => setGameVersion(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button
            onClick={() => {
              if (!name.trim() || !baseUrl.trim()) {
                return;
              }
              void saveServerProfile({
                id: editingId || undefined,
                name: name.trim(),
                baseUrl: baseUrl.trim(),
                gameVersion: gameVersion.trim() || 'ootp27'
              }).then(() => {
                setEditingId('');
                setName('');
                setBaseUrl('');
                setGameVersion('ootp27');
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
  const [recursive, setRecursive] = useState(false);

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
        <Checkbox
          label="Include subfolders"
          description="Scan and watch nested folders under this path, not just files directly inside it."
          checked={recursive}
          onChange={(event) => setRecursive(event.currentTarget.checked)}
        />
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
                recursive
              }).then(() => {
                void desktopClient.getDefaultWatchRoot().then((defaultPath) => {
                  setPath(defaultPath);
                }).catch(() => {
                  setPath('');
                });
                setRecursive(false);
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
  <Table.ScrollContainer minWidth={640} type="native">
    <Table withTableBorder withColumnBorders highlightOnHover striped="odd">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Match</Table.Th>
          <Table.Th>Pattern</Table.Th>
          <Table.Th>Format</Table.Th>
          <Table.Th>Updated</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rules.length === 0 ? (
          <Table.Tr>
            <Table.Td colSpan={5}>No saved format rules yet.</Table.Td>
          </Table.Tr>
        ) : (
          rules.map((rule) => (
            <Table.Tr key={rule.id}>
              <Table.Td>{rule.matchType}</Table.Td>
              <Table.Td className="desktop-mono">{rule.pattern}</Table.Td>
              <Table.Td>{rule.formatName}</Table.Td>
              <Table.Td>{new Date(rule.updatedAt).toLocaleString()}</Table.Td>
              <Table.Td>
                <Button size="compact-xs" color="red" variant="light" onClick={() => void onDelete(rule.id)}>
                  Remove
                </Button>
              </Table.Td>
            </Table.Tr>
          ))
        )}
      </Table.Tbody>
    </Table>
  </Table.ScrollContainer>
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
  const [dismissAutomationRuleReadiness, setDismissAutomationRuleReadiness] = useState(preferences.dismissAutomationRuleReadiness);
  const [dismissCompletedReadinessCard, setDismissCompletedReadinessCard] = useState(preferences.dismissCompletedReadinessCard);

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
        <label className="desktop-checkbox-row">
          <input
            type="checkbox"
            checked={!dismissAutomationRuleReadiness}
            onChange={(event) => setDismissAutomationRuleReadiness(!event.currentTarget.checked)}
          />
          <span>Keep automation rule in the readiness checklist</span>
        </label>
        <label className="desktop-checkbox-row">
          <input
            type="checkbox"
            checked={!dismissCompletedReadinessCard}
            onChange={(event) => setDismissCompletedReadinessCard(!event.currentTarget.checked)}
          />
          <span>Keep the completed readiness card on Today</span>
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
                diagnosticsRetentionDays: retention,
                dismissAutomationRuleReadiness,
                dismissCompletedReadinessCard
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
