import { Alert, Badge, Button, Card, Checkbox, Group, HoverCard, List, NavLink, Paper, Popover, Select, SimpleGrid, Stack, Table, Text, TextInput, ThemeIcon, Tooltip } from '@mantine/core';
import { mdiBaseball, mdiCalendarToday, mdiCloudUpload, mdiCog, mdiLightningBolt, mdiWrench } from '@mdi/js';
import { Link, useLocation } from 'react-router-dom';
import type {
  DesktopPreferences,
  LocalFormatRule,
  LocalServerProfile,
  LocalWatchRoot,
  LocalUploadJob,
  TournamentFormat
} from '@xips/api-contract';
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { describeError, useDesktop } from './DesktopContext';
import { desktopClient } from './desktop-client';
import {
  buildOnboardingSteps,
  isCustomServer,
  isSignedInToSelectedServer,
  nextOnboardingStep,
  requiredOnboardingSteps,
  serverHostLabel,
  type OnboardingStepState
} from './onboarding';
import {
  COMPACT_TIMESTAMP,
  compareUploadJobsNewestFirst,
  formatFileKindLabel,
  formatRetryableFailureMessage,
  formatLifecycleLabel,
  formatLocalPresenceLabel,
  formatQueueStateLabel,
  formatUploadJobChecksumStatusLabel,
  formatUploadJobModifiedAt,
  lifecycleColor,
  localPresenceColor,
  localStateColor,
  formatUploadFormatLabel,
  summarizeBlockedJob,
  uploadJobNeedsAttention,
  uploadJobWorkingAutomatically,
  type BlockedJobSummary
} from './queue-model';

// Renders a Material Design Icons path from @mdi/js.
export const MdiIcon = ({ path, size = 18 }: { path: string; size?: number }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={path} />
  </svg>
);

const navItems: ReadonlyArray<{ to: string; label: string; iconPath: string; support?: boolean }> = [
  { to: '/today', label: 'Today', iconPath: mdiCalendarToday },
  { to: '/queue', label: 'Queue', iconPath: mdiCloudUpload },
  { to: '/automation', label: 'Automation', iconPath: mdiLightningBolt },
  { to: '/settings', label: 'Settings', iconPath: mdiCog },
  { to: '/diagnostics', label: 'Diagnostics', iconPath: mdiWrench, support: true }
];

export const serverOptions = (profiles: LocalServerProfile[]): Array<{ value: string; label: string }> =>
  profiles.map((profile) => ({
    value: profile.id,
    label: profile.isDefault ? `${profile.name} (default)` : profile.name
  }));

const stepBadges: Record<OnboardingStepState, { label: string; color: string }> = {
  done: { label: 'Done', color: 'teal' },
  waiting_on_you: { label: 'Waiting on you', color: 'orange' },
  working: { label: 'Working…', color: 'blue' },
  optional: { label: 'Optional', color: 'gray' }
};

export const OnboardingStepBadge = ({ state }: { state: OnboardingStepState }): JSX.Element => (
  <Badge color={stepBadges[state].color} variant="light" style={{ flexShrink: 0 }}>
    {stepBadges[state].label}
  </Badge>
);

// Sign-in button, the pairing-code explanation, and the paste box, all in one place so sign-in
// finishes on the screen that started it.
export const SignInPanel = (): JSX.Element => {
  const { selectedProfile, authFlowState, authFlowError, openAuthWindow, redeemAuthCode } = useDesktop();
  const [code, setCode] = useState('');
  const profileId = selectedProfile?.id ?? '';

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!profileId || !code.trim()) {
      return;
    }
    try {
      await redeemAuthCode(profileId, code.trim());
      setCode('');
    } catch {
      // authFlowError already holds the plain-language message shown below.
    }
  };

  return (
    <Stack gap="xs">
      <Group>
        <Button
          disabled={!profileId || authFlowState === 'waiting'}
          onClick={() => {
            openAuthWindow(profileId).catch(() => {});
          }}
        >
          Sign in with Discord
        </Button>
      </Group>
      <List type="ordered" size="xs" spacing={2} className="desktop-sign-in-steps">
        <List.Item>Click Sign in with Discord. A sign-in window opens.</List.Item>
        <List.Item>Sign in with your Discord account.</List.Item>
        <List.Item>If the window shows a code, copy it.</List.Item>
        <List.Item>Paste the code below and click Finish sign-in.</List.Item>
      </List>
      <Text size="xs" c="dimmed">
        Often this finishes by itself right after you sign in.
      </Text>
      <form onSubmit={(event) => void submit(event)}>
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <TextInput
            aria-label="Sign-in code"
            placeholder="Paste code"
            value={code}
            disabled={!profileId}
            style={{ flex: '1 1 auto', minWidth: 0 }}
            onChange={(event) => setCode(event.currentTarget.value.toUpperCase())}
          />
          <Button type="submit" variant="light" disabled={!profileId || !code.trim()} loading={authFlowState === 'waiting' && Boolean(code.trim())}>
            Finish sign-in
          </Button>
        </Group>
      </form>
      {authFlowState === 'waiting' ? (
        <Text size="xs" c="blue">
          Finishing sign-in…
        </Text>
      ) : null}
      {authFlowError ? (
        <Alert color="red" variant="light">
          {authFlowError}
        </Alert>
      ) : null}
    </Stack>
  );
};

// The OOTP export folder, prefilled with the platform default so most people only confirm it.
export const ExportFolderPicker = (): JSX.Element => {
  const { selectedProfile, addWatchRoot } = useDesktop();
  const [path, setPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void desktopClient.getDefaultWatchRoot().then((defaultPath) => {
      if (active && defaultPath) {
        setPath((current) => (current.trim() ? current : defaultPath));
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const save = async (): Promise<void> => {
    if (!selectedProfile || !path.trim()) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addWatchRoot({ profileId: selectedProfile.id, path: path.trim(), recursive: false });
    } catch {
      setError("Couldn't use that folder. Check the path and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        This is where OOTP saves your exports. Confirm it, or paste a different folder.
      </Text>
      <TextInput
        aria-label="OOTP export folder"
        placeholder="Paste your OOTP export folder"
        classNames={{ input: 'desktop-mono' }}
        value={path}
        title={path}
        onChange={(event) => setPath(event.currentTarget.value)}
      />
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Button component={Link} to="/automation#watch-folders" size="compact-xs" variant="subtle" color="gray">
          More folder options
        </Button>
        <Button disabled={!selectedProfile || !path.trim()} loading={saving} onClick={() => void save()}>
          Use this folder
        </Button>
      </Group>
      {error ? (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      ) : null}
    </Stack>
  );
};

// First-run setup on Today and in Settings: two required steps with their actions inline, one optional
// step, and a one-line note once setup is done.
export const ReadinessCard = ({ id, variant }: { id?: string; variant: 'today' | 'settings' }): JSX.Element | null => {
  const { snapshot, selectedProfile, authFlowState, updatePreferences } = useDesktop();
  const steps = useMemo(
    () => buildOnboardingSteps({ snapshot, selectedProfile, authFlowState }),
    [authFlowState, selectedProfile, snapshot]
  );
  const nextStep = nextOnboardingStep(steps);
  const requiredSteps = requiredOnboardingSteps(steps);
  const doneCount = requiredSteps.filter((step) => step.complete).length;
  const rulesStep = steps.find((step) => step.key === 'rules') ?? null;
  const hideDoneNote = snapshot.preferences.dismissCompletedReadinessCard;
  const savePreferences = (patch: Partial<DesktopPreferences>): void => {
    void updatePreferences({ ...snapshot.preferences, ...patch });
  };

  if (!nextStep) {
    if (variant === 'today' && hideDoneNote) {
      return null;
    }
    return (
      <Card withBorder className="desktop-card desktop-setup-done" id={id}>
        <Group justify="space-between" align="center" wrap="wrap" gap="xs">
          <Text size="sm">
            <Text span fw={700} c="teal">
              Setup complete.
            </Text>{' '}
            New exports in your OOTP folder upload automatically.
          </Text>
          <Group gap="xs" wrap="wrap">
            {rulesStep && !rulesStep.complete && rulesStep.href ? (
              <Button component={Link} to={rulesStep.href} size="compact-xs" variant="subtle">
                {rulesStep.label}
              </Button>
            ) : null}
            {variant === 'today' ? (
              <Button size="compact-xs" variant="subtle" color="gray" onClick={() => savePreferences({ dismissCompletedReadinessCard: true })}>
                Dismiss
              </Button>
            ) : (
              <Button
                size="compact-xs"
                variant="light"
                color="gray"
                onClick={() => savePreferences({ dismissCompletedReadinessCard: !hideDoneNote })}
              >
                {hideDoneNote ? 'Show on Today' : 'Hide from Today'}
              </Button>
            )}
          </Group>
        </Group>
      </Card>
    );
  }

  return (
    <Card withBorder className="desktop-card desktop-setup-card" id={id}>
      <Stack gap="sm">
        <SectionHeader
          eyebrow="Setup"
          title="Get your exports uploading"
          description="Two quick steps. After that, the app uploads new exports by itself."
          aside={
            <Badge color="gray" variant="light">
              {doneCount} of {requiredSteps.length} done
            </Badge>
          }
        />
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm">
          {requiredSteps.map((step, index) => (
            <Card key={step.key} withBorder className={`desktop-card desktop-setup-step${step.complete ? ' complete' : ''}`}>
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={700}>
                      {index + 1}. {step.label}
                    </Text>
                    {step.state !== 'waiting_on_you' ? (
                      <Text size="xs" c="dimmed" truncate="end">
                        {step.status}
                      </Text>
                    ) : null}
                  </div>
                  <OnboardingStepBadge state={step.state} />
                </Group>
                {step.complete ? (
                  <Text size="xs" c="dimmed">
                    {step.detail}
                  </Text>
                ) : step.key === 'auth' ? (
                  <SignInPanel />
                ) : (
                  <ExportFolderPicker />
                )}
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
        {rulesStep && !rulesStep.complete ? (
          <Group justify="space-between" align="center" wrap="wrap" gap="xs" className="desktop-setup-optional">
            <div style={{ minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" fw={600}>
                  {rulesStep.label}
                </Text>
                <OnboardingStepBadge state={rulesStep.state} />
              </Group>
              <Text size="xs" c="dimmed">
                {rulesStep.detail}
              </Text>
            </div>
            <Group gap="xs" wrap="wrap">
              {rulesStep.href ? (
                <Button component={Link} to={rulesStep.href} size="compact-xs" variant="light">
                  {rulesStep.actionLabel}
                </Button>
              ) : null}
              <Button size="compact-xs" variant="subtle" color="gray" onClick={() => savePreferences({ dismissAutomationRuleReadiness: true })}>
                Not now
              </Button>
            </Group>
          </Group>
        ) : null}
      </Stack>
    </Card>
  );
};

// Shown under the topbar on every page while the selected server can't be reached. Uploads wait, nothing is lost.
export const ConnectionBanner = (): JSX.Element | null => {
  const { connection, selectedProfile, refreshHealth } = useDesktop();
  const [retrying, setRetrying] = useState(false);
  if (connection !== 'unreachable' || !selectedProfile) {
    return null;
  }
  const custom = isCustomServer(selectedProfile);
  return (
    <Alert className="desktop-connection-banner" color="red" variant="light">
      <Group justify="space-between" align="center" wrap="wrap" gap="xs">
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={700}>
            {custom ? `Can't reach the custom server (${serverHostLabel(selectedProfile.baseUrl)}) right now.` : "Can't reach XiPS right now."}
          </Text>
          <Text size="sm">
            {custom ? 'Check that the server is running.' : 'Check your internet connection.'} Your exports are kept and upload once the
            connection is back.
          </Text>
        </div>
        <Button
          size="xs"
          variant="light"
          color="red"
          loading={retrying}
          onClick={() => {
            setRetrying(true);
            void refreshHealth().finally(() => setRetrying(false));
          }}
        >
          Retry
        </Button>
      </Group>
    </Alert>
  );
};

const SIDEBAR_COLLAPSE_DELAY_MS = 5000;
const SIDEBAR_EXPAND_HOVER_DELAY_MS = 3000;

export const DesktopSidebar = (): JSX.Element => {
  const location = useLocation();
  const { selectedProfile, connection } = useDesktop();
  const customServer = isCustomServer(selectedProfile);
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
            <MdiIcon path={mdiBaseball} />
          </ThemeIcon>
          {collapsed ? null : (
            <div>
              <Text component="h1" fw={700} size="sm">
                xips-pt Desktop
              </Text>
              <Text size="xs" c="dimmed">
                Uploads your OOTP exports
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
                leftSection={<MdiIcon path={item.iconPath} />}
                // NavLink's default padding and the icon's end margin push a lone icon off
                // center in the 40px rail button, so drop both and the empty label body.
                styles={
                  collapsed
                    ? {
                        root: { width: 40, height: 40, padding: 0, justifyContent: 'center' },
                        section: { marginInlineEnd: 0 },
                        body: { display: 'none' },
                      }
                    : undefined
                }
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
            <Text className="desktop-micro-label">Connection</Text>
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Text size="sm" truncate="end">
                {customServer ? 'Custom' : 'XiPS'}
              </Text>
              <Badge
                color={connection === 'connected' ? 'teal' : connection === 'unreachable' ? 'red' : 'gray'}
                variant="light"
                style={{ flexShrink: 0 }}
              >
                {connection === 'connected' ? 'Connected' : connection === 'unreachable' ? "Can't reach" : 'Connecting…'}
              </Badge>
            </Group>
            {customServer && selectedProfile ? (
              <Text size="xs" c="orange" className="desktop-mono" truncate="end" title={selectedProfile.baseUrl}>
                {serverHostLabel(selectedProfile.baseUrl)}
              </Text>
            ) : null}
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
    logout,
    processUploadQueue
  } = useDesktop();
  const isAuthenticated = isSignedInToSelectedServer(snapshot);
  const customServer = isCustomServer(selectedProfile);
  const setupWaiting = useMemo(
    () => nextOnboardingStep(buildOnboardingSteps({ snapshot, selectedProfile, authFlowState })) !== null,
    [authFlowState, selectedProfile, snapshot]
  );
  const needsAttentionCount = snapshot.uploadJobs.filter(uploadJobNeedsAttention).length;
  const automaticQueueCount = snapshot.uploadJobs.filter(uploadJobWorkingAutomatically).length;

  return (
    <header className="desktop-topbar">
      <div className="desktop-topbar-left">
        {customServer && selectedProfile ? (
          <>
            {/* Server switching is a developer feature, so it only shows up while a custom server is in use. */}
            <Group gap="xs" wrap="nowrap" className="desktop-topbar-primary">
              <Badge color="orange" variant="filled" size="lg" className="desktop-custom-server-badge" title={selectedProfile.baseUrl}>
                Custom server: {serverHostLabel(selectedProfile.baseUrl)}
              </Badge>
              <Select
                aria-label="Server"
                value={snapshot.selectedProfileId || null}
                data={serverOptions(snapshot.profiles)}
                className="desktop-select-wrap"
                allowDeselect={false}
                onChange={(value) => {
                  if (value) {
                    void selectServerProfile(value);
                  }
                }}
              />
            </Group>
            <Group gap="sm" wrap="wrap" className="desktop-topbar-meta">
              <Text size="sm" c="dimmed">
                Uploading to <span className="desktop-mono">{selectedProfile.baseUrl}</span>
              </Text>
            </Group>
          </>
        ) : null}
        {authFlowState === 'waiting' ? (
          <Badge color="blue" variant="light">
            Finishing sign-in…
          </Badge>
        ) : null}
      </div>
      <Group gap="sm" wrap="wrap" className="desktop-topbar-actions">
        {setupWaiting ? (
          <Button component={Link} to="/today" size="xs" color="orange" variant="light">
            Setup: waiting on you
          </Button>
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
              <Popover width={360} position="bottom-end" withArrow shadow="md">
                <Popover.Target>
                  <Button size="xs">Sign in</Button>
                </Popover.Target>
                <Popover.Dropdown>
                  <SignInPanel />
                </Popover.Dropdown>
              </Popover>
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
                      Sign out
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

// Card header: small uppercase eyebrow, bold title, optional dimmed description, and an optional aside
// (badges, buttons, or text) pushed to the right.
export const SectionHeader = ({
  eyebrow,
  title,
  description,
  aside
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
}): JSX.Element => (
  <Group justify="space-between" align={description ? 'flex-start' : 'center'} wrap="wrap">
    <div>
      <Text className="desktop-micro-label">{eyebrow}</Text>
      <Text fw={700}>{title}</Text>
      {description ? (
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      ) : null}
    </div>
    {aside}
  </Group>
);

// Status for a job that needs attention: orange when only the user can unblock it, blue when the app retries.
// The reason shows on hover; pages with room show it as text next to the badge.
export const BlockedStatusBadge = ({ summary }: { summary: BlockedJobSummary }): JSX.Element => (
  <Badge color={summary.owner === 'user' ? 'orange' : 'blue'} variant="light" title={summary.reason || undefined}>
    {summary.statusLabel}
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
  formats,
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
  // Cached formats; when given, blocked rows show the same status as the Today page.
  formats?: TournamentFormat[];
  selectedJobId?: string;
  selectedJobIds?: string[];
  onSelect?: (job: LocalUploadJob) => void;
  onToggleJobSelection?: (job: LocalUploadJob, checked: boolean) => void;
  onToggleAllSelection?: (checked: boolean) => void;
  actions?: (job: LocalUploadJob) => JSX.Element;
  renderFilename?: (job: LocalUploadJob) => JSX.Element;
}): JSX.Element => {
  const orderedJobs = [...jobs].sort(
    compareUploadJobsNewestFirst
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

  const columnCount = selectionEnabled ? 6 : 5;

  // Site table markup: one line per row; full text, paths and server detail sit in titles.
  return (
    <div className="admin-table-frame">
      <div className="landing-table-wrap admin-table-wrap">
        <table className="landing-table observed-table admin-table desktop-queue-table">
          <colgroup>
            {selectionEnabled ? <col className="desktop-queue-col-select" /> : null}
            <col className="desktop-queue-col-file" />
            <col className="desktop-queue-col-format" />
            <col />
            <col className="desktop-queue-col-updated" />
            <col className="desktop-queue-col-actions" />
          </colgroup>
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
              <th>File</th>
              <th>Format</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orderedJobs.length === 0 ? (
              <tr className="landing-row">
                <td className="landing-cell" colSpan={columnCount}>No queued uploads yet.</td>
              </tr>
            ) : (
              orderedJobs.map((job) => {
                const blocked = formats && uploadJobNeedsAttention(job) ? summarizeBlockedJob(job, formats) : null;
                const issue =
                  blocked?.reason ||
                  job.duplicateReason ||
                  (job.error ? formatRetryableFailureMessage(job.error, { includeRequestId: false }) : '');
                const formatLabel = formatUploadFormatLabel(job.formatId, formatLabels ?? {});
                const statusTitle = [
                  `Server: ${formatLifecycleLabel(job.lifecyclePhase, job.fileKind)}`,
                  `Upload: ${formatUploadJobChecksumStatusLabel(job)}`,
                  job.retries > 0 ? `Retries: ${job.retries}` : ''
                ]
                  .filter(Boolean)
                  .join('\n');
                return (
                  <tr
                    key={job.id}
                    className={`landing-row${selectedJobId === job.id ? ' desktop-row-selected' : ''}`}
                    style={{ cursor: onSelect ? 'pointer' : undefined }}
                    onClick={() => onSelect?.(job)}
                  >
                    {selectionEnabled ? (
                      <td className="landing-cell">
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
                    <td className="landing-cell landing-cell-name" title={job.path}>
                      <div className="admin-cell-inline">
                        {renderFilename ? renderFilename(job) : <span className="admin-cell-clip">{job.filename}</span>}
                        {job.localPresence === 'missing' ? <LocalPresenceBadge presence={job.localPresence} /> : null}
                      </div>
                    </td>
                    <td className="landing-cell">
                      <span className="admin-cell-clip" title={formatLabel}>
                        {formatLabel}
                      </span>
                    </td>
                    <td className="landing-cell" title={issue ? `${issue}
${statusTitle}` : statusTitle}>
                      <div className="admin-cell-inline admin-nowrap">
                        {blocked ? (
                          <BlockedStatusBadge summary={blocked} />
                        ) : (
                          <QueueStateBadge state={job.localState} fileKind={job.fileKind} />
                        )}
                        {issue ? <span className="admin-cell-clip">{issue}</span> : null}
                      </div>
                    </td>
                    <td className="landing-cell admin-nowrap" title={formatUploadJobModifiedAt(job)}>
                      {formatUploadJobModifiedAt(job, COMPACT_TIMESTAMP)}
                    </td>
                    <td className="landing-cell admin-nowrap">{actions ? actions(job) : '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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

// Add or edit a custom server (Settings → Advanced). The built-in XiPS server isn't editable here.
export const ServerProfileForm = ({ id }: { id?: string }): JSX.Element => {
  const { snapshot, saveServerProfile } = useDesktop();
  const customProfiles = snapshot.profiles.filter((profile) => !profile.isDefault);
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [gameVersion, setGameVersion] = useState('ootp27');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const reset = (): void => {
    setEditingId('');
    setName('');
    setBaseUrl('');
    setGameVersion('ootp27');
  };

  const save = async (): Promise<void> => {
    if (!name.trim() || !baseUrl.trim()) {
      return;
    }
    setSaving(true);
    setError('');
    setWarning('');
    try {
      const result = await saveServerProfile({
        id: editingId || undefined,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        gameVersion: gameVersion.trim() || 'ootp27'
      });
      setWarning(result.warning);
      reset();
    } catch (saveError) {
      // Rust validation errors are written for people ("Server address must start with ...").
      setError(describeError(saveError, "Couldn't save this server."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card withBorder className="desktop-card desktop-subcard" id={id}>
      <Stack gap="sm">
        <div>
          <Text fw={700}>Add or edit a server</Text>
          <Text size="xs" c="dimmed">
            Saving switches uploads to that server.
          </Text>
        </div>
        {customProfiles.length > 0 ? (
          <Select
            label="Edit a saved server"
            placeholder="Add a new server"
            value={editingId || null}
            data={[
              { value: '', label: 'Add a new server' },
              ...customProfiles.map((profile) => ({ value: profile.id, label: profile.name }))
            ]}
            onChange={(value) => {
              const nextId = value ?? '';
              setEditingId(nextId);
              const profile = customProfiles.find((item) => item.id === nextId) ?? null;
              setName(profile?.name ?? '');
              setBaseUrl(profile?.baseUrl ?? '');
              setGameVersion(profile?.gameVersion ?? 'ootp27');
            }}
          />
        ) : null}
        <TextInput label="Name" placeholder="Local dev" value={name} onChange={(event) => setName(event.currentTarget.value)} />
        <TextInput
          label="Server address"
          placeholder="http://localhost:8080"
          classNames={{ input: 'desktop-mono' }}
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.currentTarget.value)}
        />
        <TextInput
          label="Game version"
          description="OOTP game version this server tracks, e.g. ootp27. Leave as ootp27 unless the server says otherwise."
          value={gameVersion}
          onChange={(event) => setGameVersion(event.currentTarget.value)}
        />
        {error ? (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        ) : null}
        {warning ? (
          <Alert color="yellow" variant="light">
            {warning}
          </Alert>
        ) : null}
        <Group justify="flex-end">
          {editingId ? (
            <Button variant="subtle" color="gray" onClick={reset}>
              Cancel
            </Button>
          ) : null}
          <Button disabled={!name.trim() || !baseUrl.trim()} loading={saving} onClick={() => void save()}>
            {editingId ? 'Update server' : 'Save server'}
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
          placeholder="Paste your OOTP export folder"
          value={path}
          onChange={(event) => setPath(event.currentTarget.value)}
        />
        <Text size="xs" c="dimmed">
          Starts with the folder where OOTP 27 saves exports.
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
          <span>Show &apos;Help with oddly named files&apos; in setup</span>
        </label>
        <label className="desktop-checkbox-row">
          <input
            type="checkbox"
            checked={!dismissCompletedReadinessCard}
            onChange={(event) => setDismissCompletedReadinessCard(!event.currentTarget.checked)}
          />
          <span>Show the setup-complete note on Today</span>
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
