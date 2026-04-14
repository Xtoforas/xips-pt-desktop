import { Alert, Badge, Button, Card, Group, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { LocalUploadJob } from '@xips/api-contract';
import { useDesktop } from './DesktopContext';
import {
  buildOnboardingSteps,
  FormatRuleTable,
  FormatsTable,
  formatDetectedFileStateLabel,
  formatFileKindLabel,
  formatLifecycleLabel,
  formatLocalPresenceLabel,
  formatSourceModifiedAt,
  formatUploadJobModifiedAt,
  getUploadJobModifiedAt,
  formatOvrRangeLabel,
  formatQueueStateLabel,
  formatSlotCountsLabel,
  formatTeamsPerTournamentLabel,
  PreferencesForm,
  QueueTable,
  ServerProfileForm,
  SummaryCard,
  uploadJobNeedsAttention,
  uploadJobWaitingOnServer,
  uploadJobWorkingAutomatically,
  WatchRootForm,
  WatchRootTable
} from './components';

const useScrollToHash = (): void => {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) {
      return;
    }
    const targetId = location.hash.slice(1);
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, location.pathname]);
};

const TechnicalValue = ({ value }: { value: string }): JSX.Element => (
  <Group gap="xs" wrap="nowrap">
    <span className="desktop-mono">{value || '-'}</span>
    {value ? (
      <Button
        size="compact-xs"
        variant="light"
        onClick={() => {
          void navigator.clipboard.writeText(value);
        }}
      >
        Copy
      </Button>
    ) : null}
  </Group>
);

const formatMatchesTeamCount = (teamsPerTournament: number, teamCount: number): boolean =>
  teamCount === 0 || teamsPerTournament === 0 || teamCount <= teamsPerTournament;

const getIncompleteTeamCountWarning = (
  fileKind: string,
  teamCount: number,
  format: { name: string; teamsPerTournament: number } | null | undefined
): { badgeLabel: string; message: string } | null => {
  if (
    fileKind !== 'stats_export' ||
    !format ||
    teamCount === 0 ||
    format.teamsPerTournament === 0 ||
    teamCount >= format.teamsPerTournament
  ) {
    return null;
  }

  return {
    badgeLabel: `${teamCount}/${format.teamsPerTournament} teams`,
    message: `Detected ${teamCount} distinct team codes for ${format.name}'s ${format.teamsPerTournament}-team format. The app still assigned it because the filename matched, but this usually means a team was left unrostered or collapsed into an unknown placeholder in the export.`
  };
};

const extractTournamentIdCandidates = (value: string): string[] => {
  const matches = value.match(/\d+/gu) ?? [];
  return matches.filter((candidate) => candidate.length >= 5 && candidate.length <= 7);
};

const explainFilenameAutoAssignment = (
  filename: string,
  teamCount: number,
  formats: Array<{ id: string; name: string; tournamentIdPrefix: string; teamsPerTournament: number }>
): string => {
  const candidates = extractTournamentIdCandidates(filename);
  if (candidates.length === 0) {
    return 'The filename does not contain a 5 to 7 digit tournament ID, so the app cannot map it automatically.';
  }

  for (const candidate of candidates) {
    const prefixMatches = formats.filter(
      (format) =>
        format.tournamentIdPrefix.length > 0 &&
        candidate.length === format.tournamentIdPrefix.length + 4 &&
        candidate.startsWith(format.tournamentIdPrefix)
    );

    if (prefixMatches.length === 0) {
      continue;
    }

    const compatibleMatches = prefixMatches.filter((format) =>
      formatMatchesTeamCount(format.teamsPerTournament, teamCount)
    );

    if (compatibleMatches.length === 0) {
      return teamCount > 0
        ? `The filename looks like tournament ID ${candidate}, but none of the cached formats with that prefix accept this file's ${teamCount} detected teams.`
        : `The filename looks like tournament ID ${candidate}, but none of the cached formats with that prefix are eligible for automatic assignment.`;
    }

    if (compatibleMatches.length > 1) {
      return `The filename looks like tournament ID ${candidate}, but more than one cached format shares that tournament ID prefix, so the app will not guess.`;
    }
  }

  return `The filename contains ${candidates.join(', ')}, but none of those IDs match a cached tournament prefix on this desktop.`;
};

type QueueWorkspaceView = 'needs_action' | 'working' | 'done';

type TodayBlockerState = 'awaiting_format_assignment' | 'failed_retryable' | 'auth_blocked';

const queueWorkspaceViewLabel: Record<QueueWorkspaceView, string> = {
  needs_action: 'Needs Action',
  working: 'Working',
  done: 'Done'
};

const queueWorkspaceViewDetail: Record<QueueWorkspaceView, string> = {
  needs_action: 'Blocked jobs that need a user decision.',
  working: 'Automatic or server-side work that is still progressing.',
  done: 'Finished, skipped, or terminal rows.'
};

const queueWorkspaceViewColor: Record<QueueWorkspaceView, string> = {
  needs_action: 'orange',
  working: 'blue',
  done: 'teal'
};

const queueLinkForJob = (jobId: string, view: QueueWorkspaceView = 'needs_action'): string => {
  const params = new URLSearchParams();
  params.set('view', view);
  params.set('job', jobId);
  const query = params.toString();
  return query ? `/queue?${query}` : '/queue';
};

const parseQueueWorkspaceView = (value: string | null): QueueWorkspaceView | null => {
  if (value === 'needs_action' || value === 'working' || value === 'done') {
    return value;
  }
  return null;
};

const parseLegacyQueueWorkspaceView = (
  value: string | null,
  selectedJob: LocalUploadJob | null
): QueueWorkspaceView | null => {
  if (value === 'uploaded') {
    return 'done';
  }
  if (value === 'queued') {
    return selectedJob && uploadJobNeedsAttention(selectedJob) ? 'needs_action' : 'working';
  }
  return null;
};

const queueWorkspaceViewForJob = (job: LocalUploadJob): QueueWorkspaceView => {
  if (uploadJobNeedsAttention(job)) {
    return 'needs_action';
  }
  if (uploadJobWorkingAutomatically(job)) {
    return 'working';
  }
  return 'done';
};

const isQueueJobDone = (job: LocalUploadJob): boolean => queueWorkspaceViewForJob(job) === 'done';

const blockerPriority: Record<TodayBlockerState, number> = {
  auth_blocked: 0,
  awaiting_format_assignment: 1,
  failed_retryable: 2
};

const blockerTitleByState: Record<TodayBlockerState, string> = {
  awaiting_format_assignment: 'Waiting for format assignment',
  failed_retryable: 'Retryable failure',
  auth_blocked: 'Sign-in required'
};

const blockerActionLabelByState: Record<TodayBlockerState, string> = {
  awaiting_format_assignment: 'Open queue to assign format',
  failed_retryable: 'Open queue to retry',
  auth_blocked: 'Open queue to re-authenticate'
};

const blockerDetailByState = (
  job: { fileKind: string; error?: string | null; formatId?: string | null; filename: string },
  formatLabelById: Record<string, string>
): string => {
  switch (job.fileKind) {
    case 'stats_export':
      return `The export is blocked until it is mapped to a tournament format${job.formatId ? ` (${formatLabelById[job.formatId] ?? 'unknown format'})` : ''}.`;
    case 'card_catalog':
      return 'The catalog is waiting for the queue to finish assigning its next server lifecycle step.';
    default:
      return 'This file is blocked and needs one quick queue action before it can continue.';
  }
};

const getUploadJobKindDetail = (job: Pick<LocalUploadJob, 'fileKind' | 'lifecyclePhase' | 'localState'>): string => {
  if (job.localState === 'failed_retryable') {
    return 'A transient error paused the upload.';
  }
  if (job.localState === 'auth_blocked') {
    return 'The selected account needs to be signed in again.';
  }
  if (job.localState === 'awaiting_format_assignment') {
    return 'The queue is waiting for a format match.';
  }
  return job.lifecyclePhase ? formatLifecycleLabel(job.lifecyclePhase, job.fileKind) : 'In progress';
};

export const TodayPage = (): JSX.Element => {
  const { snapshot, selectedProfile, health, authFlowState, cards, cardSource } = useDesktop();
  const onboardingSteps = useMemo(
    () => buildOnboardingSteps({ snapshot, health, selectedProfile, authFlowState }),
    [authFlowState, health, selectedProfile, snapshot]
  );
  const nextStep = onboardingSteps.find((step) => !step.complete) ?? null;
  const formatLabelById = useMemo(
    () =>
      Object.fromEntries(snapshot.cachedFormats.map((format) => [format.id, format.name])),
    [snapshot.cachedFormats]
  );
  const readinessItems = onboardingSteps;
  const blockerJobs = useMemo(
    () =>
      [...snapshot.uploadJobs]
        .filter((job) => uploadJobNeedsAttention(job))
        .sort((left, right) => {
          const leftPriority = blockerPriority[left.localState as TodayBlockerState] ?? 99;
          const rightPriority = blockerPriority[right.localState as TodayBlockerState] ?? 99;
          if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
          }
          return (getUploadJobModifiedAt(right) ?? 0) - (getUploadJobModifiedAt(left) ?? 0);
        }),
    [snapshot.uploadJobs]
  );
  const activeMachineJobs = useMemo(
    () =>
      snapshot.uploadJobs
        .filter((job) => uploadJobWorkingAutomatically(job) && !uploadJobWaitingOnServer(job))
        .sort((left, right) => (getUploadJobModifiedAt(right) ?? 0) - (getUploadJobModifiedAt(left) ?? 0)),
    [snapshot.uploadJobs]
  );
  const serverProgressJobs = useMemo(
    () =>
      snapshot.uploadJobs
        .filter((job) => uploadJobWaitingOnServer(job))
        .sort((left, right) => (getUploadJobModifiedAt(right) ?? 0) - (getUploadJobModifiedAt(left) ?? 0)),
    [snapshot.uploadJobs]
  );
  const completedCount = useMemo(
    () => snapshot.uploadJobs.filter((job) => job.localState === 'complete').length,
    [snapshot.uploadJobs]
  );
  const needsAttentionCount = useMemo(
    () => snapshot.uploadJobs.filter(uploadJobNeedsAttention).length,
    [snapshot.uploadJobs]
  );
  const automaticQueueCount = useMemo(
    () => snapshot.uploadJobs.filter(uploadJobWorkingAutomatically).length,
    [snapshot.uploadJobs]
  );
  const waitingOnServerCount = useMemo(
    () => snapshot.uploadJobs.filter(uploadJobWaitingOnServer).length,
    [snapshot.uploadJobs]
  );
  const localUploadCount = useMemo(
    () => activeMachineJobs.length,
    [activeMachineJobs.length]
  );
  const completedJobs = useMemo(
    () =>
      snapshot.uploadJobs
        .filter((job) => job.localState === 'complete')
        .sort((left, right) => (getUploadJobModifiedAt(right) ?? 0) - (getUploadJobModifiedAt(left) ?? 0))
        .slice(0, 5),
    [snapshot.uploadJobs]
  );

  return (
    <Stack gap="lg">
      <Card withBorder className="desktop-card desktop-today-hero">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <div>
              <Text className="desktop-micro-label">Today</Text>
              <h2 className="desktop-page-title">What needs you right now</h2>
              <p className="desktop-page-subtitle">
                Readiness, blockers, automatic progress, and recent finishes all live on one operating surface.
              </p>
            </div>
            <Group gap="xs" wrap="wrap">
              <Badge color={needsAttentionCount > 0 ? 'orange' : 'teal'} variant="light">
                {needsAttentionCount} needing action
              </Badge>
              <Badge color={automaticQueueCount > 0 ? 'blue' : 'gray'} variant="light">
                {automaticQueueCount} working
              </Badge>
              <Badge color={completedCount > 0 ? 'teal' : 'gray'} variant="light">
                {completedCount} completed
              </Badge>
            </Group>
          </Group>
          <Text size="sm" c="dimmed" className="desktop-today-summary">
            The queue keeps moving when it can. When it cannot, these cards point at the exact next step.
          </Text>
          {nextStep ? (
            <Alert color="blue" variant="light" title={`Next readiness step: ${nextStep.label}`}>
              {nextStep.detail}
            </Alert>
          ) : (
            <Alert color="teal" variant="light" title="Operational readiness complete">
              The desktop app is fully set up for normal operation.
            </Alert>
          )}
        </Stack>
      </Card>
      <Card withBorder className="desktop-card desktop-today-strip">
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="wrap">
            <div>
              <Text className="desktop-micro-label">Readiness strip</Text>
              <Text fw={700}>Setup and operational state</Text>
            </div>
            <Text size="sm" c="dimmed">
              {selectedProfile ? `${selectedProfile.name} is the active server profile.` : 'No server profile selected yet.'}
            </Text>
          </Group>
          <SimpleGrid cols={{ base: 1, md: 2, xl: 5 }} spacing="sm">
            {readinessItems.map((step, index) => (
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
                    {step.detail}
                  </Text>
                  {!step.complete ? (
                    <Button component={Link} to={step.href} size="compact-xs" variant="light" className="desktop-today-strip-action">
                      {step.actionLabel}
                    </Button>
                  ) : null}
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>
      </Card>
      <Card withBorder className="desktop-card desktop-today-section">
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <div>
              <Text className="desktop-micro-label">Needs attention</Text>
              <Text fw={700}>Blocked files</Text>
            </div>
            <Badge color={needsAttentionCount > 0 ? 'orange' : 'gray'} variant="light">
              {needsAttentionCount} file{needsAttentionCount === 1 ? '' : 's'}
            </Badge>
          </Group>
          {blockerJobs.length === 0 ? (
            <Alert color="teal" variant="light">
              No files are blocked right now. The queue is clear of user-driven work.
            </Alert>
          ) : (
            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="sm">
              {blockerJobs.map((job) => {
                const blockerState = job.localState as TodayBlockerState;
                const queueLink = queueLinkForJob(job.id, 'needs_action');
                return (
                  <Card key={job.id} withBorder className="desktop-card desktop-today-blocker-card">
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <div>
                          <Text size="sm" fw={700}>
                            {job.filename}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {getUploadJobKindDetail(job)} Updated {formatUploadJobModifiedAt(job)}.
                          </Text>
                        </div>
                        <Stack gap={4} align="flex-end">
                          <Badge color="orange" variant="light">
                            {blockerTitleByState[blockerState]}
                          </Badge>
                          <Badge color={job.fileKind === 'card_catalog' ? 'grape' : 'blue'} variant="light">
                            {formatFileKindLabel(job.fileKind)}
                          </Badge>
                        </Stack>
                      </Group>
                      <Text size="sm">
                        {blockerDetailByState(job, formatLabelById)}
                      </Text>
                      <Group gap="xs" wrap="wrap">
                        <Button component={Link} to={queueLink} size="xs">
                          {blockerActionLabelByState[blockerState]}
                        </Button>
                        <Button component={Link} to={queueLink} size="xs" variant="light">
                          Open queue row
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                );
              })}
            </SimpleGrid>
          )}
        </Stack>
      </Card>
      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <Card withBorder className="desktop-card desktop-today-section">
          <Stack gap="md">
            <Group justify="space-between" align="center" wrap="wrap">
              <div>
                <Text className="desktop-micro-label">In progress</Text>
                <Text fw={700}>Automatic work</Text>
              </div>
              <Badge color="blue" variant="light">
                {automaticQueueCount} moving
              </Badge>
            </Group>
            <Stack gap="sm">
              <div className="desktop-today-mini-list">
                <Text size="sm" fw={600}>
                  On this machine
                </Text>
                {activeMachineJobs.length === 0 ? (
                  <Alert color="gray" variant="light">
                    No uploads are currently staged or uploading on this desktop.
                  </Alert>
                ) : (
                  activeMachineJobs.slice(0, 4).map((job) => (
                    <div key={job.id} className="desktop-today-mini-row">
                      <div>
                        <Text size="sm" fw={600}>
                          {job.filename}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatQueueStateLabel(job.localState, job.fileKind)} · {formatUploadJobModifiedAt(job)}
                        </Text>
                      </div>
                      <Badge color="blue" variant="light">
                        {formatFileKindLabel(job.fileKind)}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </Stack>
          </Stack>
        </Card>
        <Card withBorder className="desktop-card desktop-today-section">
          <Stack gap="md">
            <Group justify="space-between" align="center" wrap="wrap">
              <div>
                <Text className="desktop-micro-label">In progress</Text>
                <Text fw={700}>Waiting on the server</Text>
              </div>
              <Badge color="cyan" variant="light">
                {waitingOnServerCount} on server
              </Badge>
            </Group>
            {serverProgressJobs.length === 0 ? (
              <Alert color="gray" variant="light">
                Nothing is currently waiting on the server.
              </Alert>
            ) : (
              <Stack gap="sm">
                {serverProgressJobs.slice(0, 4).map((job) => (
                  <div key={job.id} className="desktop-today-mini-row">
                    <div>
                      <Text size="sm" fw={600}>
                        {job.filename}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {formatLifecycleLabel(job.lifecyclePhase, job.fileKind)} · {formatUploadJobModifiedAt(job)}
                      </Text>
                    </div>
                    <Badge color="cyan" variant="light">
                      {job.localState === 'uploaded_waiting_server' ? 'Uploaded' : formatQueueStateLabel(job.localState, job.fileKind)}
                    </Badge>
                  </div>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
      </SimpleGrid>
      <Card withBorder className="desktop-card desktop-today-section">
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <div>
              <Text className="desktop-micro-label">Recently completed</Text>
              <Text fw={700}>Latest finished uploads</Text>
            </div>
            <Badge color="teal" variant="light">
              {completedCount} total
            </Badge>
          </Group>
          {completedJobs.length === 0 ? (
            <Alert color="gray" variant="light">
              No completed uploads have been recorded yet.
            </Alert>
          ) : (
            <div className="desktop-today-completions">
              {completedJobs.map((job) => (
                <div key={job.id} className="desktop-today-completion-row">
                  <div>
                    <Text size="sm" fw={600}>
                      {job.filename}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {job.formatId ? (formatLabelById[job.formatId] ?? 'Unknown format') : 'Unassigned'} · {formatUploadJobModifiedAt(job)}
                    </Text>
                  </div>
                  <Group gap="xs" wrap="nowrap">
                    <Badge color="teal" variant="light">
                      Complete
                    </Badge>
                    <Badge color={job.fileKind === 'card_catalog' ? 'grape' : 'blue'} variant="light">
                      {formatFileKindLabel(job.fileKind)}
                    </Badge>
                  </Group>
                </div>
              ))}
            </div>
          )}
        </Stack>
      </Card>
      <SimpleGrid cols={{ base: 1, md: 4 }} spacing="sm">
        <Card withBorder className="desktop-card">
          <Stack gap={4}>
            <Text className="desktop-micro-label">Server</Text>
            <Text fw={700}>{selectedProfile?.name ?? 'None'}</Text>
            <Text size="xs" c="dimmed">
              {selectedProfile?.baseUrl ?? 'No server selected'}
            </Text>
          </Stack>
        </Card>
        <Card withBorder className="desktop-card">
          <Stack gap={4}>
            <Text className="desktop-micro-label">Watch folders</Text>
            <Text fw={700}>{snapshot.watchRoots.length}</Text>
            <Text size="xs" c="dimmed">
              Configured folder monitors
            </Text>
          </Stack>
        </Card>
        <Card withBorder className="desktop-card">
          <Stack gap={4}>
            <Text className="desktop-micro-label">Cards</Text>
            <Text fw={700}>{cards.length}</Text>
            <Text size="xs" c="dimmed">
              Source: {cardSource ?? 'Unknown'}
            </Text>
          </Stack>
        </Card>
        <Card withBorder className="desktop-card">
          <Stack gap={4}>
            <Text className="desktop-micro-label">Queue state</Text>
            <Text fw={700}>{waitingOnServerCount + localUploadCount}</Text>
            <Text size="xs" c="dimmed">
              Automatic work still in motion
            </Text>
          </Stack>
        </Card>
      </SimpleGrid>
    </Stack>
  );
};

export const UploadQueuePage = (): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    snapshot,
    selectedProfile,
    assignDetectedFileFormat,
    assignDetectedFileTournament,
    retryUploadJob,
    dismissDuplicateUploadJob,
    removeAwaitingUploadJob,
    openUploadFileLocation,
    openAuthWindow
  } = useDesktop();
  const [queueView, setQueueView] = useState<QueueWorkspaceView>('working');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedQueueJobIds, setSelectedQueueJobIds] = useState<string[]>([]);
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [editingFilenameJobId, setEditingFilenameJobId] = useState('');
  const [inlineTournamentId, setInlineTournamentId] = useState('');
  const [bulkDismissInFlight, setBulkDismissInFlight] = useState(false);
  const formatById = useMemo(
    () =>
      Object.fromEntries(snapshot.cachedFormats.map((format) => [format.id, format])),
    [snapshot.cachedFormats]
  );
  const formatLabelById = useMemo(
    () =>
      Object.fromEntries(snapshot.cachedFormats.map((format) => [format.id, format.name])),
    [snapshot.cachedFormats]
  );
  const sortedJobs = useMemo(
    () =>
      [...snapshot.uploadJobs].sort(
        (left, right) => (getUploadJobModifiedAt(right) ?? 0) - (getUploadJobModifiedAt(left) ?? 0)
      ),
    [snapshot.uploadJobs]
  );
  const needsActionJobs = useMemo(
    () => sortedJobs.filter(uploadJobNeedsAttention),
    [sortedJobs]
  );
  const workingJobs = useMemo(
    () => sortedJobs.filter((job) => uploadJobWorkingAutomatically(job) && !uploadJobNeedsAttention(job)),
    [sortedJobs]
  );
  const doneJobs = useMemo(
    () => sortedJobs.filter(isQueueJobDone),
    [sortedJobs]
  );
  const queueJobsByView = useMemo(
    () => ({
      needs_action: needsActionJobs,
      working: workingJobs,
      done: doneJobs
    }),
    [doneJobs, needsActionJobs, workingJobs]
  );
  const queueCounts = useMemo(
    () => ({
      needs_action: needsActionJobs.length,
      working: workingJobs.length,
      done: doneJobs.length
    }),
    [doneJobs.length, needsActionJobs.length, workingJobs.length]
  );
  const selectedQueueJobs = useMemo(
    () => queueJobsByView[queueView].filter((job) => selectedQueueJobIds.includes(job.id)),
    [queueJobsByView, queueView, selectedQueueJobIds]
  );
  const dismissibleSelectedJobs = useMemo(
    () =>
      selectedQueueJobs.filter(
        (job) =>
          job.localState === 'duplicate_skipped_local' ||
          job.localState === 'awaiting_format_assignment'
      ),
    [selectedQueueJobs]
  );

  const selectedJob = useMemo(
    () => sortedJobs.find((job) => job.id === selectedJobId) ?? null,
    [selectedJobId, sortedJobs]
  );

  const selectedAttempts = useMemo(
    () => snapshot.uploadAttempts.filter((attempt) => attempt.uploadJobId === selectedJobId),
    [selectedJobId, snapshot.uploadAttempts]
  );
  const inlineEditingJob = useMemo(
    () => snapshot.uploadJobs.find((job) => job.id === editingFilenameJobId) ?? null,
    [editingFilenameJobId, snapshot.uploadJobs]
  );
  const selectedJobFormat = useMemo(
    () => snapshot.cachedFormats.find((format) => format.id === selectedJob?.formatId) ?? null,
    [selectedJob?.formatId, snapshot.cachedFormats]
  );
  const selectedJobTeamCount = selectedJob?.teamCount ?? 0;
  const inlineEditingJobTeamCount = inlineEditingJob?.teamCount ?? 0;
  const tournamentFormatMatches = useMemo(() => {
    const normalizedTournamentId = selectedTournamentId.trim();
    if (normalizedTournamentId.length < 5 || normalizedTournamentId.length > 7) {
      return [];
    }
    return snapshot.cachedFormats.filter(
      (format) =>
        format.tournamentIdPrefix.length > 0 &&
        normalizedTournamentId.length === format.tournamentIdPrefix.length + 4 &&
        normalizedTournamentId.startsWith(format.tournamentIdPrefix) &&
        formatMatchesTeamCount(format.teamsPerTournament, selectedJobTeamCount)
    );
  }, [selectedJobTeamCount, selectedTournamentId, snapshot.cachedFormats]);
  const matchedTournamentFormat = tournamentFormatMatches.length === 1 ? tournamentFormatMatches[0] : null;
  const tournamentAssignmentError =
    selectedTournamentId.trim().length === 0
      ? ''
      : tournamentFormatMatches.length === 0
        ? selectedJobTeamCount > 0
          ? `No cached tournament format matches that 5 to 7 digit tournament ID for ${selectedJobTeamCount} detected teams.`
          : 'No cached tournament format matches that 5 to 7 digit tournament ID.'
        : tournamentFormatMatches.length > 1
          ? 'More than one cached format shares that tournament ID prefix. Refresh formats or assign by format instead.'
          : '';
  const inlineTournamentFormatMatches = useMemo(() => {
    const normalizedTournamentId = inlineTournamentId.trim();
    if (normalizedTournamentId.length < 5 || normalizedTournamentId.length > 7) {
      return [];
    }
    return snapshot.cachedFormats.filter(
      (format) =>
        format.tournamentIdPrefix.length > 0 &&
        normalizedTournamentId.length === format.tournamentIdPrefix.length + 4 &&
        normalizedTournamentId.startsWith(format.tournamentIdPrefix) &&
        formatMatchesTeamCount(format.teamsPerTournament, inlineEditingJobTeamCount)
    );
  }, [inlineEditingJobTeamCount, inlineTournamentId, snapshot.cachedFormats]);
  const inlineTournamentAssignmentError =
    inlineTournamentId.trim().length === 0
      ? ''
      : inlineTournamentFormatMatches.length === 0
        ? inlineEditingJobTeamCount > 0
          ? `No cached format matches that tournament ID for ${inlineEditingJobTeamCount} detected teams.`
          : 'No cached format matches that tournament ID.'
        : inlineTournamentFormatMatches.length > 1
          ? 'More than one cached format shares that tournament ID prefix.'
          : '';
  const compatibleDirectFormats = useMemo(
    () => snapshot.cachedFormats.filter((format) => formatMatchesTeamCount(format.teamsPerTournament, selectedJobTeamCount)),
    [selectedJobTeamCount, snapshot.cachedFormats]
  );
  const selectedJobAutoAssignmentReason = useMemo(() => {
    if (!selectedJob || selectedJob.localState !== 'awaiting_format_assignment' || selectedJob.fileKind !== 'stats_export') {
      return '';
    }
    return explainFilenameAutoAssignment(selectedJob.filename, selectedJob.teamCount, snapshot.cachedFormats);
  }, [selectedJob, snapshot.cachedFormats]);
  const selectedJobTeamCountWarning = useMemo(
    () =>
      getIncompleteTeamCountWarning(
        selectedJob?.fileKind ?? '',
        selectedJob?.teamCount ?? 0,
        selectedJobFormat
      ),
    [selectedJob?.fileKind, selectedJob?.teamCount, selectedJobFormat]
  );
  const selectedJobView = selectedJob ? queueWorkspaceViewForJob(selectedJob) : null;
  const selectedJobDetail = selectedJob
    ? selectedJob.localState === 'awaiting_format_assignment'
      ? 'Awaiting format assignment'
      : selectedJob.localState === 'failed_retryable'
        ? 'Needs a retry after a transient failure'
        : selectedJob.localState === 'auth_blocked'
          ? 'Blocked until the account signs in again'
          : selectedJobView === 'done'
            ? 'Finished or terminal queue row'
            : 'Automatic progress is still underway'
    : '';
  const currentViewJobs = queueJobsByView[queueView];

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const selectedJobIdFromQuery = params.get('job') ?? '';
    const selectedJobIdsFromQuery = (params.get('jobs') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const selectedJobFromQuery = selectedJobIdFromQuery
      ? sortedJobs.find((job) => job.id === selectedJobIdFromQuery) ?? null
      : null;
    const parsedView =
      parseQueueWorkspaceView(params.get('view')) ??
      parseLegacyQueueWorkspaceView(params.get('filter'), selectedJobFromQuery);
    const defaultView = selectedJobFromQuery
      ? queueWorkspaceViewForJob(selectedJobFromQuery)
      : needsActionJobs.length > 0
        ? 'needs_action'
        : workingJobs.length > 0
          ? 'working'
          : 'done';

    setQueueView(parsedView ?? defaultView);
    setSelectedJobId(selectedJobIdFromQuery);
    setSelectedQueueJobIds(selectedJobIdsFromQuery.length > 0 ? selectedJobIdsFromQuery : selectedJobIdFromQuery ? [selectedJobIdFromQuery] : []);
  }, [location.search, needsActionJobs.length, sortedJobs, workingJobs.length]);

  useEffect(() => {
    if (currentViewJobs.length === 0) {
      if (selectedJobId) {
        setSelectedJobId('');
      }
      return;
    }

    if (!currentViewJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(currentViewJobs[0]?.id ?? '');
    }
  }, [currentViewJobs, selectedJobId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.delete('filter');
    params.set('view', queueView);
    if (selectedJobId) {
      params.set('job', selectedJobId);
    } else {
      params.delete('job');
    }

    const nextSearch = params.toString();
    if (nextSearch !== location.search.slice(1)) {
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : ''
        },
        { replace: true }
      );
    }
  }, [location.pathname, location.search, navigate, queueView, selectedJobId]);

  const submitInlineTournamentAssignment = async (jobId: string): Promise<void> => {
    const tournamentId = inlineTournamentId.trim();
    if (tournamentId.length < 5 || tournamentId.length > 7) {
      return;
    }
    const job = snapshot.uploadJobs.find((entry) => entry.id === jobId) ?? null;
    if (!job) {
      return;
    }
    const detectedFile = snapshot.detectedFiles.find(
      (file) => file.path === job.path && file.checksum === job.checksum
    ) ?? null;
    if (!detectedFile) {
      return;
    }
    await assignDetectedFileTournament({
      detectedFileId: detectedFile.id,
      tournamentId
    });
    setEditingFilenameJobId('');
    setInlineTournamentId('');
  };

  useEffect(() => {
    setSelectedTournamentId('');
    setSelectedFormatId('');
  }, [selectedJobId]);

  useEffect(() => {
    if (!editingFilenameJobId) {
      setInlineTournamentId('');
    }
  }, [editingFilenameJobId]);

  useEffect(() => {
    const visibleJobIds = new Set(currentViewJobs.map((job) => job.id));
    setSelectedQueueJobIds((current) => current.filter((jobId) => visibleJobIds.has(jobId)));
  }, [currentViewJobs]);

  const dismissSelectedJobs = async (): Promise<void> => {
    if (dismissibleSelectedJobs.length === 0 || bulkDismissInFlight) {
      return;
    }

    setBulkDismissInFlight(true);
    const removedIds = dismissibleSelectedJobs.map((job) => job.id);
    try {
      for (const job of dismissibleSelectedJobs) {
        if (job.localState === 'duplicate_skipped_local') {
          await dismissDuplicateUploadJob(job.id);
        } else if (job.localState === 'awaiting_format_assignment') {
          await removeAwaitingUploadJob(job.id);
        }
      }
      setSelectedQueueJobIds((current) => current.filter((jobId) => !removedIds.includes(jobId)));
      if (removedIds.includes(selectedJobId)) {
        setSelectedJobId('');
      }
    } finally {
      setBulkDismissInFlight(false);
    }
  };

  const selectedJobActionLabel =
    selectedJob?.localState === 'awaiting_format_assignment'
      ? 'Assign format'
      : selectedJob?.localState === 'failed_retryable'
        ? 'Retry now'
        : selectedJob?.localState === 'auth_blocked'
          ? 'Re-authenticate'
          : 'Inspect row';
  const selectedJobStateColor =
    selectedJob?.localState === 'awaiting_format_assignment'
      ? 'orange'
      : selectedJob?.localState === 'failed_retryable'
        ? 'yellow'
        : selectedJob?.localState === 'auth_blocked'
          ? 'red'
          : selectedJobView === 'done'
            ? 'teal'
            : 'blue';

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Upload Queue</h2>
        <p className="desktop-page-subtitle">Needs Action, Working, and Done views with a sticky inspector for row-level actions.</p>
      </div>
      <Card withBorder className="desktop-card desktop-queue-hero">
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <div>
              <Text className="desktop-micro-label">Queue workspace</Text>
              <Text fw={700}>Action first, dense scan second</Text>
              <Text size="sm" c="dimmed">
                Needs Action opens automatically when blockers exist. The inspector stays visible so fixes never fall below the fold.
              </Text>
            </div>
            <Group gap="xs" wrap="wrap">
              <Badge color="orange" variant="light">
                {queueCounts.needs_action} needs action
              </Badge>
              <Badge color="blue" variant="light">
                {queueCounts.working} working
              </Badge>
              <Badge color="teal" variant="light">
                {queueCounts.done} done
              </Badge>
            </Group>
          </Group>
          <Text size="sm" c="dimmed">
            {queueWorkspaceViewDetail[queueView]}
          </Text>
          {queueView !== 'needs_action' && queueCounts.needs_action > 0 ? (
            <Alert color="orange" variant="light">
              There are {queueCounts.needs_action} blocked job{queueCounts.needs_action === 1 ? '' : 's'} in Needs Action.
            </Alert>
          ) : null}
        </Stack>
      </Card>
      <Group gap="xs" wrap="wrap" className="desktop-queue-view-switcher">
        {(Object.keys(queueWorkspaceViewLabel) as QueueWorkspaceView[]).map((view) => (
          <Button
            key={view}
            size="xs"
            variant={queueView === view ? 'filled' : 'light'}
            color={queueWorkspaceViewColor[view]}
            onClick={() => {
              const nextJobId = queueJobsByView[view][0]?.id ?? '';
              setQueueView(view);
              setSelectedJobId(nextJobId);
            }}
          >
            {queueWorkspaceViewLabel[view]} ({queueCounts[view]})
          </Button>
        ))}
      </Group>
      <div className="desktop-queue-layout">
        <Stack gap="lg" className="desktop-queue-main">
          <Card withBorder className="desktop-card">
            <Stack gap="sm">
              <Group justify="space-between" align="center" wrap="wrap">
                <Text fw={700}>{queueWorkspaceViewLabel[queueView]}</Text>
                <Group gap="xs" align="center" wrap="wrap">
                  {selectedQueueJobIds.length > 0 ? (
                    <Text size="sm" c="dimmed">
                      {dismissibleSelectedJobs.length} of {selectedQueueJobIds.length} selected can be dismissed.
                    </Text>
                  ) : null}
                  <Button
                    size="xs"
                    variant="light"
                    color="red"
                    disabled={dismissibleSelectedJobs.length === 0 || bulkDismissInFlight}
                    loading={bulkDismissInFlight}
                    onClick={() => {
                      void dismissSelectedJobs();
                    }}
                  >
                    Dismiss selected
                  </Button>
                </Group>
              </Group>
              <QueueTable
                jobs={currentViewJobs}
                formatLabels={formatLabelById}
                selectedJobId={selectedJobId}
                selectedJobIds={selectedQueueJobIds}
                onSelect={(job) => {
                  setQueueView(queueWorkspaceViewForJob(job));
                  setSelectedJobId(job.id);
                }}
                onToggleJobSelection={(job, checked) => {
                  setSelectedQueueJobIds((current) => {
                    if (checked) {
                      return current.includes(job.id) ? current : [...current, job.id];
                    }
                    return current.filter((jobId) => jobId !== job.id);
                  });
                }}
                onToggleAllSelection={(checked) => {
                  setSelectedQueueJobIds(checked ? currentViewJobs.map((job) => job.id) : []);
                }}
                renderFilename={(job) => {
                  const canInlineAssign = job.localState === 'awaiting_format_assignment' && job.fileKind === 'stats_export';
                  const teamCountWarning = getIncompleteTeamCountWarning(
                    job.fileKind,
                    job.teamCount,
                    job.formatId ? formatById[job.formatId] : null
                  );
                  if (editingFilenameJobId === job.id) {
                    return (
                      <TextInput
                        size="xs"
                        autoFocus
                        value={inlineTournamentId}
                        placeholder="5 to 7 digits"
                        error={inlineTournamentAssignmentError || undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        onChange={(event) => {
                          setInlineTournamentId(event.currentTarget.value.replace(/[^0-9]/gu, '').slice(0, 7));
                        }}
                        onBlur={() => {
                          setEditingFilenameJobId('');
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void submitInlineTournamentAssignment(job.id);
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setEditingFilenameJobId('');
                          }
                        }}
                      />
                    );
                  }
                  return (
                    <Group gap="xs" wrap="nowrap">
                      <button
                        type="button"
                        className="desktop-link-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedJobId(job.id);
                        }}
                        onDoubleClick={(event) => {
                          if (!canInlineAssign) {
                            return;
                          }
                          event.stopPropagation();
                          setSelectedJobId(job.id);
                          setEditingFilenameJobId(job.id);
                          setInlineTournamentId('');
                        }}
                        title={canInlineAssign ? 'Double-click to enter a 5 to 7 digit tournament ID.' : job.filename}
                      >
                        {job.filename}
                      </button>
                      {teamCountWarning ? (
                        <Badge color="yellow" variant="light">
                          {teamCountWarning.badgeLabel}
                        </Badge>
                      ) : null}
                    </Group>
                  );
                }}
                actions={(job) => (
                  <Group gap="xs">
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      onClick={(event) => {
                        event.stopPropagation();
                        void openUploadFileLocation(job.id);
                      }}
                    >
                      Reveal
                    </Button>
                    {job.localState === 'awaiting_format_assignment' ? (
                      <Button
                        size="compact-xs"
                        variant="light"
                        color="orange"
                        onClick={(event) => {
                          event.stopPropagation();
                          setQueueView('needs_action');
                          setSelectedJobId(job.id);
                        }}
                      >
                        Assign
                      </Button>
                    ) : null}
                    {job.localState === 'failed_retryable' ? (
                      <Button
                        size="compact-xs"
                        variant="light"
                        color="yellow"
                        onClick={(event) => {
                          event.stopPropagation();
                          void retryUploadJob(job.id);
                        }}
                      >
                        Retry
                      </Button>
                    ) : null}
                    {job.localState === 'auth_blocked' && selectedProfile ? (
                      <Button
                        size="compact-xs"
                        variant="light"
                        color="red"
                        onClick={(event) => {
                          event.stopPropagation();
                          void openAuthWindow(selectedProfile.id);
                        }}
                      >
                        Re-auth
                      </Button>
                    ) : null}
                    {job.localState === 'duplicate_skipped_local' ? (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        onClick={(event) => {
                          event.stopPropagation();
                          void dismissDuplicateUploadJob(job.id);
                        }}
                      >
                        Dismiss
                      </Button>
                    ) : null}
                    {job.localState === 'awaiting_format_assignment' ? (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeAwaitingUploadJob(job.id);
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </Group>
                )}
              />
            </Stack>
          </Card>
        </Stack>
        <Card withBorder className="desktop-card desktop-queue-inspector">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <div>
                <Text className="desktop-micro-label">Inspector</Text>
                <Text fw={700}>{selectedJob ? selectedJob.filename : 'No row selected'}</Text>
                <Text size="sm" c="dimmed">
                  {selectedJob ? selectedJobDetail : 'Select a row to inspect its blocked-state actions and queue metadata.'}
                </Text>
              </div>
              {selectedJob ? (
                <Badge color={selectedJobStateColor} variant="light">
                  {selectedJobActionLabel}
                </Badge>
              ) : null}
            </Group>
            {!selectedJob ? (
              <Alert color="gray">Choose a queue row to inspect its actions, file path, checksum, and lifecycle details.</Alert>
            ) : (
              <>
                <Card withBorder className="desktop-subcard">
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start" wrap="wrap">
                      <div>
                        <Text fw={600}>Primary action</Text>
                        <Text size="sm" c="dimmed">
                          The controls below stay visible while you scan the queue list.
                        </Text>
                      </div>
                      <Group gap="xs" wrap="wrap">
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => {
                            void openUploadFileLocation(selectedJob.id);
                          }}
                        >
                          Reveal file
                        </Button>
                        {selectedJob.localState === 'failed_retryable' ? (
                          <Button
                            size="xs"
                            color="yellow"
                            onClick={() => {
                              void retryUploadJob(selectedJob.id);
                            }}
                          >
                            Retry now
                          </Button>
                        ) : null}
                        {selectedJob.localState === 'auth_blocked' && selectedProfile ? (
                          <Button
                            size="xs"
                            color="red"
                            onClick={() => {
                              void openAuthWindow(selectedProfile.id);
                            }}
                          >
                            Re-authenticate
                          </Button>
                        ) : null}
                        {selectedJob.localState === 'awaiting_format_assignment' ? (
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            onClick={() => {
                              void removeAwaitingUploadJob(selectedJob.id);
                            }}
                          >
                            Remove from queue
                          </Button>
                        ) : null}
                        {selectedJob.localState === 'duplicate_skipped_local' ? (
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => {
                              void dismissDuplicateUploadJob(selectedJob.id);
                            }}
                          >
                            Dismiss duplicate
                          </Button>
                        ) : null}
                      </Group>
                    </Group>
                    {selectedJob.localState === 'awaiting_format_assignment' && selectedJob.fileKind === 'stats_export' && selectedJobAutoAssignmentReason ? (
                      <Alert color="blue" title="Why this was not auto-assigned">
                        {selectedJobAutoAssignmentReason}
                      </Alert>
                    ) : null}
                    {selectedJob.localState === 'failed_retryable' ? (
                      <Alert color="yellow" title="Retryable failure">
                        {selectedJob.error || 'A transient error paused this upload. Retry from the queue or after the service recovers.'}
                      </Alert>
                    ) : null}
                    {selectedJob.localState === 'auth_blocked' ? (
                      <Alert color="red" title="Sign-in required">
                        The selected account needs to sign in again. After successful auth, the queue resumes automatically.
                      </Alert>
                    ) : null}
                    {selectedJob.localState === 'awaiting_format_assignment' && selectedJob.fileKind === 'stats_export' ? (
                      <Card withBorder className="desktop-subcard desktop-queue-resolution">
                        <Stack gap="sm">
                          <Text fw={600}>Assign tournament export</Text>
                          <TextInput
                            label="Tournament ID"
                            description="Enter the full 5 to 7 digit tournament ID. The desktop app maps it to the matching format prefix automatically."
                            placeholder="12345"
                            value={selectedTournamentId}
                            onChange={(event) => {
                              setSelectedTournamentId(event.currentTarget.value.replace(/[^0-9]/gu, '').slice(0, 7));
                            }}
                          />
                          {matchedTournamentFormat ? (
                            <Alert color="teal">
                              Maps to {matchedTournamentFormat.name} using prefix {matchedTournamentFormat.tournamentIdPrefix}
                              {' '}
                              ({matchedTournamentFormat.tournamentIdPrefix.length + 4} digits total).
                              {matchedTournamentFormat.teamsPerTournament > 0 ? ` ${matchedTournamentFormat.teamsPerTournament} teams.` : ''}
                            </Alert>
                          ) : tournamentAssignmentError ? (
                            <Alert color="yellow">{tournamentAssignmentError}</Alert>
                          ) : null}
                          <Group justify="flex-end">
                            <Button
                              size="xs"
                              disabled={!matchedTournamentFormat || selectedTournamentId.trim().length < 5}
                              onClick={() => {
                                const detectedFile = snapshot.detectedFiles.find(
                                  (file) => file.path === selectedJob.path && file.checksum === selectedJob.checksum
                                ) ?? null;
                                if (!detectedFile) {
                                  return;
                                }
                                void assignDetectedFileTournament({
                                  detectedFileId: detectedFile.id,
                                  tournamentId: selectedTournamentId.trim()
                                }).then(() => {
                                  setSelectedTournamentId('');
                                  setSelectedFormatId('');
                                });
                              }}
                            >
                              Assign by tournament ID
                            </Button>
                          </Group>
                          <Text size="sm" c="dimmed">
                            Fallback: assign the format directly if the tournament ID is not in the filename yet or if multiple formats share a prefix.
                          </Text>
                          <select value={selectedFormatId} onChange={(event) => setSelectedFormatId(event.currentTarget.value)}>
                            <option value="">Choose a format</option>
                            {compatibleDirectFormats.map((format) => (
                              <option key={format.id} value={format.id}>
                                {format.tournamentIdPrefix ? `${format.name} (${format.tournamentIdPrefix}xxxx)` : format.name}
                                {format.teamsPerTournament > 0 ? ` - ${format.teamsPerTournament} teams` : ''}
                              </option>
                            ))}
                          </select>
                          <Group justify="flex-end">
                            <Button
                              size="xs"
                              disabled={!selectedFormatId}
                              onClick={() => {
                                const detectedFile = snapshot.detectedFiles.find(
                                  (file) => file.path === selectedJob.path && file.checksum === selectedJob.checksum
                                ) ?? null;
                                if (!detectedFile) {
                                  return;
                                }
                                void assignDetectedFileFormat({
                                  detectedFileId: detectedFile.id,
                                  formatId: selectedFormatId
                                }).then(() => {
                                  setSelectedFormatId('');
                                });
                              }}
                            >
                              Assign format
                            </Button>
                          </Group>
                        </Stack>
                      </Card>
                    ) : null}
                  </Stack>
                </Card>
                {selectedJobTeamCountWarning ? (
                  <Alert color="yellow" title="Team count looks short">
                    {selectedJobTeamCountWarning.message}
                  </Alert>
                ) : null}
                <div className="desktop-table-wrap">
                  <table className="desktop-table">
                    <tbody>
                      <tr><th>File</th><td>{selectedJob.filename}</td></tr>
                      <tr><th>Local job ID</th><td><TechnicalValue value={selectedJob.id} /></td></tr>
                      <tr><th>Path</th><td className="desktop-mono">{selectedJob.path}</td></tr>
                      <tr><th>Staged path</th><td className="desktop-mono">{selectedJob.stagedPath || '-'}</td></tr>
                      <tr><th>Kind</th><td>{formatFileKindLabel(selectedJob.fileKind)}</td></tr>
                      <tr><th>Teams</th><td>{selectedJob.teamCount > 0 ? selectedJob.teamCount : '-'}</td></tr>
                      <tr><th>Local file</th><td>{formatLocalPresenceLabel(selectedJob.localPresence)}</td></tr>
                      <tr><th>Format</th><td>{selectedJobFormat?.name ?? (selectedJob.formatId ? 'Unknown format' : 'Unassigned')}</td></tr>
                      <tr><th>Tournament ID</th><td>{selectedJob.tournamentId || '-'}</td></tr>
                      <tr><th>Local state</th><td>{formatQueueStateLabel(selectedJob.localState, selectedJob.fileKind)}</td></tr>
                      <tr><th>Server lifecycle</th><td>{formatLifecycleLabel(selectedJob.lifecyclePhase, selectedJob.fileKind)}</td></tr>
                      <tr><th>Server status</th><td>{selectedJob.serverStatus || '-'}</td></tr>
                      <tr><th>Checksum</th><td><TechnicalValue value={selectedJob.checksum} /></td></tr>
                      <tr><th>Remote checksum</th><td><TechnicalValue value={selectedJob.remoteChecksum} /></td></tr>
                      <tr><th>Upload ID</th><td><TechnicalValue value={selectedJob.uploadId} /></td></tr>
                      <tr><th>Request ID</th><td><TechnicalValue value={selectedJob.lastRequestId} /></td></tr>
                      <tr><th>Duplicate reason</th><td>{selectedJob.duplicateReason || '-'}</td></tr>
                      <tr><th>Retry after</th><td>{selectedJob.nextRetryAfter || '-'}</td></tr>
                      <tr><th>Queued</th><td>{selectedJob.queuedAt || '-'}</td></tr>
                      <tr><th>Processing</th><td>{selectedJob.processingAt || '-'}</td></tr>
                      <tr><th>Parsed</th><td>{selectedJob.parsedAt || '-'}</td></tr>
                      <tr><th>Refreshing</th><td>{selectedJob.refreshingAt || '-'}</td></tr>
                      <tr><th>Completed</th><td>{selectedJob.completedAt || '-'}</td></tr>
                      <tr><th>Failed</th><td>{selectedJob.failedAt || '-'}</td></tr>
                      <tr><th>Retries</th><td>{selectedJob.retries}</td></tr>
                      <tr><th>Error</th><td>{selectedJob.error || '-'}</td></tr>
                      <tr><th>Source modified</th><td>{formatSourceModifiedAt(selectedJob.sourceModifiedAt)}</td></tr>
                      <tr><th>Queue updated</th><td>{new Date(selectedJob.updatedAt).toLocaleString()}</td></tr>
                    </tbody>
                  </table>
                </div>
                <Card withBorder className="desktop-subcard">
                  <Stack gap="xs">
                    <Text fw={600}>Attempt history</Text>
                    {selectedAttempts.length === 0 ? (
                      <Alert color="gray">No local attempts recorded yet.</Alert>
                    ) : (
                      <div className="desktop-table-wrap">
                        <table className="desktop-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Status</th>
                              <th>Detail</th>
                              <th>Updated</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedAttempts.map((attempt) => (
                              <tr key={attempt.id}>
                                <td>{attempt.attemptNumber}</td>
                                <td>{attempt.status}</td>
                                <td className="desktop-mono">{attempt.detail}</td>
                                <td>{new Date(attempt.updatedAt).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Stack>
                </Card>
              </>
            )}
          </Stack>
        </Card>
      </div>
    </Stack>
  );
};

export const WatchFoldersPage = (): JSX.Element => {
  const { snapshot, deleteFormatRule, deleteWatchRoot, saveFormatRule, scanWatchRoots, toggleWatchRoot } = useDesktop();
  const [selectedWatchRootId, setSelectedWatchRootId] = useState('');
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [pattern, setPattern] = useState('');
  useScrollToHash();

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Watch Folders</h2>
        <p className="desktop-page-subtitle">Configure the CSV folders that the desktop app watches in the background.</p>
      </div>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <WatchRootForm id="watch-folders" />
        <Card withBorder className="desktop-card" id="format-rules">
          <Stack gap="sm">
            <Text fw={700}>Save format rule</Text>
            <Text size="sm" c="dimmed">Map a folder or filename pattern to a tournament format.</Text>
            <select value={selectedWatchRootId} onChange={(event) => setSelectedWatchRootId(event.currentTarget.value)}>
              <option value="">Choose a watch folder</option>
              {snapshot.watchRoots.map((root) => (
                <option key={root.id} value={root.id}>
                  {root.path}
                </option>
              ))}
            </select>
            <select value={selectedFormatId} onChange={(event) => setSelectedFormatId(event.currentTarget.value)}>
              <option value="">Choose a format</option>
              {snapshot.cachedFormats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.tournamentIdPrefix ? `${format.name} (${format.tournamentIdPrefix}xxxx)` : format.name}
                </option>
              ))}
            </select>
            <input
              className="mantine-Input-input"
              placeholder="Filename contains..."
              value={pattern}
              onChange={(event) => setPattern(event.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button
                disabled={!selectedWatchRootId || !selectedFormatId || !pattern.trim()}
                onClick={() => {
                  const format = snapshot.cachedFormats.find((item) => item.id === selectedFormatId) ?? null;
                  const selectedWatchRoot = snapshot.watchRoots.find((item) => item.id === selectedWatchRootId) ?? null;
                  if (!format || !selectedWatchRoot) {
                    return;
                  }
                  void saveFormatRule({
                    profileId: selectedWatchRoot.profileId,
                    watchRootId: selectedWatchRoot.id,
                    matchType: 'filename',
                    pattern: pattern.trim(),
                    formatId: format.id,
                    formatName: format.name
                  }).then(() => {
                    setPattern('');
                  });
                }}
              >
                Save rule
              </Button>
            </Group>
          </Stack>
        </Card>
      </SimpleGrid>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={700}>Watched directories</Text>
            <Button
              size="xs"
              variant="light"
              disabled={!snapshot.selectedProfileId}
              onClick={() => void scanWatchRoots(snapshot.selectedProfileId)}
            >
              Scan now
            </Button>
          </Group>
          <WatchRootTable watchRoots={snapshot.watchRoots} onToggle={toggleWatchRoot} onDelete={deleteWatchRoot} />
        </Stack>
      </Card>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Saved format rules</Text>
          <FormatRuleTable rules={snapshot.formatRules} onDelete={deleteFormatRule} />
        </Stack>
      </Card>
    </Stack>
  );
};

export const AutomationPage = (): JSX.Element => {
  const {
    snapshot,
    selectedProfile,
    deleteFormatRule,
    deleteWatchRoot,
    refreshFormats,
    saveFormatRule,
    scanWatchRoots,
    toggleWatchRoot
  } = useDesktop();
  const [selectedWatchRootId, setSelectedWatchRootId] = useState('');
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [pattern, setPattern] = useState('');
  const [validationFilename, setValidationFilename] = useState('stats_export_12345.csv');
  const [validationTeamCount, setValidationTeamCount] = useState('16');
  useEffect(() => {
    if (!selectedFormatId && snapshot.cachedFormats.length > 0) {
      setSelectedFormatId(snapshot.cachedFormats[0]?.id ?? '');
    }
  }, [selectedFormatId, snapshot.cachedFormats]);
  useScrollToHash();

  const selectedWatchRoot = snapshot.watchRoots.find((root) => root.id === selectedWatchRootId) ?? null;
  const selectedFormat = snapshot.cachedFormats.find((format) => format.id === selectedFormatId) ?? null;
  const validationTeamCountValue = Number.parseInt(validationTeamCount, 10);
  const validationReason = validationFilename.trim()
    ? explainFilenameAutoAssignment(
        validationFilename.trim(),
        Number.isFinite(validationTeamCountValue) ? validationTeamCountValue : 0,
        snapshot.cachedFormats
      )
    : 'Enter a filename to reuse the same auto-assignment logic the queue uses for blocked files.';

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Automation</h2>
        <p className="desktop-page-subtitle">Watch folder, rule, format match, and validation in one workflow for background uploads.</p>
      </div>
      <Card withBorder className="desktop-card desktop-automation-hero">
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text fw={700}>Automation flow</Text>
              <Text size="sm" c="dimmed">
                The app watches a folder, applies a filename rule, resolves a tournament format, and explains misses with the same logic used in the queue.
              </Text>
            </div>
            <Group gap="xs" wrap="wrap">
              <Badge color="blue" variant="light">
                {snapshot.watchRoots.length} watch roots
              </Badge>
              <Badge color="teal" variant="light">
                {snapshot.formatRules.length} rules
              </Badge>
              <Badge color="grape" variant="light">
                {snapshot.cachedFormats.length} formats
              </Badge>
            </Group>
          </Group>
          <Text size="sm" c="dimmed">
            Follow the sequence below to keep the relationship between a watched folder, its rule, and the target format obvious.
          </Text>
          <Group gap="xs" wrap="wrap" className="desktop-automation-sequence">
            <Badge color="blue" variant="light">
              1 Watch folder
            </Badge>
            <Text c="dimmed" size="sm">
              →
            </Text>
            <Badge color="teal" variant="light">
              2 Rule
            </Badge>
            <Text c="dimmed" size="sm">
              →
            </Text>
            <Badge color="grape" variant="light">
              3 Format match
            </Badge>
            <Text c="dimmed" size="sm">
              →
            </Text>
            <Badge color="orange" variant="light">
              4 Validation
            </Badge>
          </Group>
        </Stack>
      </Card>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <Stack gap="lg">
          <WatchRootForm id="watch-folders" />
          <Card withBorder className="desktop-card">
            <Stack gap="sm">
              <Group justify="space-between">
                <div>
                  <Text fw={700}>Saved watch roots</Text>
                  <Text size="sm" c="dimmed">
                    Keep the roots visible so you can pause, reactivate, or remove them without leaving Automation.
                  </Text>
                </div>
                <Button
                  size="xs"
                  variant="light"
                  disabled={!snapshot.selectedProfileId}
                  onClick={() => void scanWatchRoots(snapshot.selectedProfileId)}
                >
                  Scan now
                </Button>
              </Group>
              <WatchRootTable watchRoots={snapshot.watchRoots} onToggle={toggleWatchRoot} onDelete={deleteWatchRoot} />
            </Stack>
          </Card>
        </Stack>
        <Stack gap="lg">
          <Card withBorder className="desktop-card" id="format-rules">
            <Stack gap="sm">
              <Text fw={700}>Save format rule</Text>
              <Text size="sm" c="dimmed">
                Connect a watch root to a filename pattern, then point it at the selected tournament format.
              </Text>
              <Group gap="xs" wrap="wrap" className="desktop-automation-relation">
                <Badge color="blue" variant="light">
                  Watch folder: {selectedWatchRoot?.path ?? 'Choose one'}
                </Badge>
                <Text c="dimmed" size="sm">
                  →
                </Text>
                <Badge color="teal" variant="light">
                  Rule: {pattern.trim() || 'Filename contains...'}
                </Badge>
                <Text c="dimmed" size="sm">
                  →
                </Text>
                <Badge color="grape" variant="light">
                  Format: {selectedFormat?.name ?? 'Choose in step 3'}
                </Badge>
              </Group>
              <select value={selectedWatchRootId} onChange={(event) => setSelectedWatchRootId(event.currentTarget.value)}>
                <option value="">Choose a watch folder</option>
                {snapshot.watchRoots.map((root) => (
                  <option key={root.id} value={root.id}>
                    {root.path}
                  </option>
                ))}
              </select>
              <input
                className="mantine-Input-input"
                placeholder="Filename contains..."
                value={pattern}
                onChange={(event) => setPattern(event.currentTarget.value)}
              />
              <Text size="xs" c="dimmed">
                The selected format below is the target the app will try first when this rule matches.
              </Text>
              <Group justify="flex-end">
                <Button
                  disabled={!selectedWatchRootId || !selectedFormatId || !pattern.trim()}
                  onClick={() => {
                    const format = snapshot.cachedFormats.find((item) => item.id === selectedFormatId) ?? null;
                    const selectedWatchRootToSave = snapshot.watchRoots.find((item) => item.id === selectedWatchRootId) ?? null;
                    if (!format || !selectedWatchRootToSave) {
                      return;
                    }
                    void saveFormatRule({
                      profileId: selectedWatchRootToSave.profileId,
                      watchRootId: selectedWatchRootToSave.id,
                      matchType: 'filename',
                      pattern: pattern.trim(),
                      formatId: format.id,
                      formatName: format.name
                    }).then(() => {
                      setPattern('');
                    });
                  }}
                >
                  Save rule
                </Button>
              </Group>
              <Text fw={700}>Saved format rules</Text>
              <FormatRuleTable rules={snapshot.formatRules} onDelete={deleteFormatRule} />
            </Stack>
          </Card>
          <Card withBorder className="desktop-card" id="cached-formats">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={700}>Format match library</Text>
                  <Text size="sm" c="dimmed">
                    Select the live tournament format that the current rule should resolve to.
                  </Text>
                </div>
                <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void refreshFormats()}>
                  Refresh formats
                </Button>
              </Group>
              <select value={selectedFormatId} onChange={(event) => setSelectedFormatId(event.currentTarget.value)}>
                <option value="">Choose a format</option>
                {snapshot.cachedFormats.map((format) => (
                  <option key={format.id} value={format.id}>
                    {format.tournamentIdPrefix ? `${format.name} (${format.tournamentIdPrefix}xxxx)` : format.name}
                  </option>
                ))}
              </select>
              <Text size="xs" c="dimmed">
                This selection drives the rule above and keeps the watch folder, filename pattern, and target format linked together.
              </Text>
              {!selectedFormat ? (
                <Alert color="gray">Select a format to inspect the live restriction metadata from the server.</Alert>
              ) : (
                <SimpleGrid cols={{ base: 1, md: 2 }}>
                  <Card withBorder className="desktop-subcard">
                    <Stack gap={4}>
                      <Text fw={600}>{selectedFormat.name}</Text>
                      <Text size="sm" c="dimmed">
                        Tournament ID pattern: {selectedFormat.tournamentIdPrefix ? `${selectedFormat.tournamentIdPrefix} + 4-digit suffix (${selectedFormat.tournamentIdPrefix.length + 4} digits total)` : '-'}
                      </Text>
                      <Text size="sm" c="dimmed">Teams per tournament: {formatTeamsPerTournamentLabel(selectedFormat)}</Text>
                      <Text size="sm" c="dimmed">Mode: {selectedFormat.mode || '-'}</Text>
                      <Text size="sm" c="dimmed">Run environment: {selectedFormat.runEnvironment || '-'}</Text>
                      <Text size="sm" c="dimmed">Park: {selectedFormat.parkKey || '-'}</Text>
                      <Text size="sm" c="dimmed">Cap: {selectedFormat.capValue || '-'}</Text>
                    </Stack>
                  </Card>
                  <Card withBorder className="desktop-subcard">
                    <Stack gap={4}>
                      <Text size="sm">OVR range: {formatOvrRangeLabel(selectedFormat)}</Text>
                      <Text size="sm">Slots tournament: {selectedFormat.isSlotsTournament ? 'Yes' : 'No'}</Text>
                      <Text size="sm">Slot counts: {formatSlotCountsLabel(selectedFormat)}</Text>
                      <Text size="sm">Era restrictions: {selectedFormat.eraRestrictions.join(', ') || '-'}</Text>
                      <Text size="sm">Card type restrictions: {selectedFormat.cardTypeRestrictions.join(', ') || '-'}</Text>
                      <Text size="sm">Variant limit: {selectedFormat.variantLimitValue || '-'}</Text>
                      <Text size="sm">Format type: {selectedFormat.formatType || '-'}</Text>
                    </Stack>
                  </Card>
                </SimpleGrid>
              )}
            </Stack>
          </Card>
          <Card withBorder className="desktop-card">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={700}>Validation</Text>
                  <Text size="sm" c="dimmed">
                    Reuse the same auto-assignment reasoning the queue uses when a file does not match automatically.
                  </Text>
                </div>
                <Badge color="orange" variant="light">
                  Step 4
                </Badge>
              </Group>
              <TextInput
                label="Sample filename"
                placeholder="stats_export_12345.csv"
                value={validationFilename}
                onChange={(event) => setValidationFilename(event.currentTarget.value)}
              />
              <TextInput
                label="Detected teams"
                placeholder="16"
                value={validationTeamCount}
                onChange={(event) => {
                  setValidationTeamCount(event.currentTarget.value.replace(/[^0-9]/gu, '').slice(0, 2));
                }}
              />
              <Alert color="blue" title="Why this file would or would not match automatically">
                {validationReason}
              </Alert>
            </Stack>
          </Card>
          <Card withBorder className="desktop-card">
            <Stack gap="sm">
              <Group justify="space-between">
                <div>
                  <Text fw={700}>Cached formats</Text>
                  <Text size="sm" c="dimmed">
                    Refresh from the selected server to update the automation match set.
                  </Text>
                </div>
                <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void refreshFormats()}>
                  Refresh formats
                </Button>
              </Group>
              <FormatsTable formats={snapshot.cachedFormats} />
            </Stack>
          </Card>
        </Stack>
      </SimpleGrid>
    </Stack>
  );
};

export const FormatsPage = (): JSX.Element => {
  const { snapshot, selectedProfile, refreshFormats } = useDesktop();
  const [selectedFormatId, setSelectedFormatId] = useState('');

  useEffect(() => {
    if (!selectedFormatId && snapshot.cachedFormats.length > 0) {
      setSelectedFormatId(snapshot.cachedFormats[0]?.id ?? '');
    }
  }, [selectedFormatId, snapshot.cachedFormats]);

  const selectedFormat = snapshot.cachedFormats.find((format) => format.id === selectedFormatId) ?? null;

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Formats</h2>
        <p className="desktop-page-subtitle">Tournament format discovery driven by the live `/api/v1/formats` backend endpoint.</p>
      </div>
      <Card withBorder className="desktop-card">
        <Group justify="space-between">
          <div>
            <Text fw={700}>Cached formats</Text>
            <Text size="sm" c="dimmed">
              Refresh from the selected server to update local assignment choices.
            </Text>
          </div>
          <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void refreshFormats()}>
            Refresh formats
          </Button>
        </Group>
      </Card>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Selected format detail</Text>
          <Select
            value={selectedFormatId || null}
            data={snapshot.cachedFormats.map((format) => ({
              value: format.id,
              label: format.tournamentIdPrefix ? `${format.name} (${format.tournamentIdPrefix}xxxx)` : format.name
            }))}
            placeholder="Choose a format"
            onChange={(value) => {
              setSelectedFormatId(value ?? '');
            }}
          />
          {!selectedFormat ? (
            <Alert color="gray">Select a format to inspect the live restriction metadata from the server.</Alert>
          ) : (
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <Card withBorder className="desktop-subcard">
                <Stack gap={4}>
                  <Text fw={600}>{selectedFormat.name}</Text>
                  <Text size="sm" c="dimmed">
                    Tournament ID pattern: {selectedFormat.tournamentIdPrefix ? `${selectedFormat.tournamentIdPrefix} + 4-digit suffix (${selectedFormat.tournamentIdPrefix.length + 4} digits total)` : '-'}
                  </Text>
                  <Text size="sm" c="dimmed">Teams per tournament: {formatTeamsPerTournamentLabel(selectedFormat)}</Text>
                  <Text size="sm" c="dimmed">Mode: {selectedFormat.mode || '-'}</Text>
                  <Text size="sm" c="dimmed">Run environment: {selectedFormat.runEnvironment || '-'}</Text>
                  <Text size="sm" c="dimmed">Park: {selectedFormat.parkKey || '-'}</Text>
                  <Text size="sm" c="dimmed">Cap: {selectedFormat.capValue || '-'}</Text>
                </Stack>
              </Card>
              <Card withBorder className="desktop-subcard">
                <Stack gap={4}>
                  <Text size="sm">OVR range: {formatOvrRangeLabel(selectedFormat)}</Text>
                  <Text size="sm">Slots tournament: {selectedFormat.isSlotsTournament ? 'Yes' : 'No'}</Text>
                  <Text size="sm">Slot counts: {formatSlotCountsLabel(selectedFormat)}</Text>
                  <Text size="sm">Era restrictions: {selectedFormat.eraRestrictions.join(', ') || '-'}</Text>
                  <Text size="sm">Card type restrictions: {selectedFormat.cardTypeRestrictions.join(', ') || '-'}</Text>
                  <Text size="sm">Variant limit: {selectedFormat.variantLimitValue || '-'}</Text>
                  <Text size="sm">Format type: {selectedFormat.formatType || '-'}</Text>
                </Stack>
              </Card>
            </SimpleGrid>
          )}
        </Stack>
      </Card>
      <Card withBorder className="desktop-card">
        <FormatsTable formats={snapshot.cachedFormats} />
      </Card>
    </Stack>
  );
};

export const HistoryPage = (): JSX.Element => {
  const { snapshot } = useDesktop();
  const [fileKindFilter, setFileKindFilter] = useState('all');
  const [lifecycleFilter, setLifecycleFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | '1' | '7' | '30'>('all');
  const [sortKey, setSortKey] = useState<'updated' | 'filename' | 'retries'>('updated');
  const formatLabelById = useMemo(
    () =>
      Object.fromEntries(snapshot.cachedFormats.map((format) => [format.id, format.name])),
    [snapshot.cachedFormats]
  );

  const rows = useMemo(() => {
    const cutoff = (() => {
      if (dateRangeFilter === 'all') {
        return Number.NEGATIVE_INFINITY;
      }
      const days = Number.parseInt(dateRangeFilter, 10);
      return Date.now() - days * 24 * 60 * 60 * 1000;
    })();
    const filtered = snapshot.uploadJobs.filter((job) => {
      if (fileKindFilter !== 'all' && job.fileKind !== fileKindFilter) {
        return false;
      }
      if (lifecycleFilter !== 'all' && (job.lifecyclePhase ?? 'none') !== lifecycleFilter) {
        return false;
      }
      if (formatFilter !== 'all' && job.formatId !== formatFilter) {
        return false;
      }
      if (Date.parse(job.updatedAt) < cutoff) {
        return false;
      }
      return ['complete', 'duplicate_skipped_local', 'failed_terminal'].includes(job.localState);
    });

    return [...filtered].sort((left, right) => {
      if (sortKey === 'filename') {
        return left.filename.localeCompare(right.filename);
      }
      if (sortKey === 'retries') {
        return right.retries - left.retries;
      }
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
  }, [dateRangeFilter, fileKindFilter, formatFilter, lifecycleFilter, snapshot.uploadJobs, sortKey]);

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">History</h2>
        <p className="desktop-page-subtitle">Completed uploads and terminal rows from the local desktop history.</p>
      </div>
      <Group grow>
        <Select
          value={fileKindFilter}
          data={[
            { value: 'all', label: 'All file kinds' },
            { value: 'stats_export', label: 'Stats exports' },
            { value: 'card_catalog', label: 'Card lists' }
          ]}
          onChange={(value) => setFileKindFilter(value ?? 'all')}
        />
        <Select
          value={lifecycleFilter}
          data={[
            { value: 'all', label: 'All lifecycle states' },
            { value: 'complete', label: 'Complete' },
            { value: 'failed', label: 'Failed' },
            { value: 'skipped_duplicate', label: 'Skipped duplicate' }
          ]}
          onChange={(value) => setLifecycleFilter(value ?? 'all')}
        />
        <Select
          value={formatFilter}
          data={[
            { value: 'all', label: 'All formats' },
            ...snapshot.cachedFormats.map((format) => ({
              value: format.id,
              label: format.name
            }))
          ]}
          onChange={(value) => setFormatFilter(value ?? 'all')}
        />
        <Select
          value={sortKey}
          data={[
            { value: 'updated', label: 'Sort by updated' },
            { value: 'filename', label: 'Sort by filename' },
            { value: 'retries', label: 'Sort by retries' }
          ]}
          onChange={(value) => setSortKey((value as 'updated' | 'filename' | 'retries') ?? 'updated')}
        />
        <Select
          value={dateRangeFilter}
          data={[
            { value: 'all', label: 'All dates' },
            { value: '1', label: 'Last 24 hours' },
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' }
          ]}
          onChange={(value) => setDateRangeFilter((value as 'all' | '1' | '7' | '30') ?? 'all')}
        />
      </Group>
      <Card withBorder className="desktop-card">
        <div className="desktop-table-wrap">
          <table className="desktop-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Kind</th>
                <th>Format</th>
                <th>Lifecycle</th>
                <th>Retries</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>No history rows match the current filters.</td>
                </tr>
              ) : (
                rows.map((job) => (
                  <tr key={job.id}>
                    <td>{job.filename}</td>
                    <td>{formatFileKindLabel(job.fileKind)}</td>
                    <td>{job.formatId ? (formatLabelById[job.formatId] ?? 'Unknown format') : 'Unassigned'}</td>
                    <td>{formatLifecycleLabel(job.lifecyclePhase, job.fileKind)}</td>
                    <td>{job.retries}</td>
                    <td>{new Date(job.updatedAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Stack>
  );
};

export const DiagnosticsPage = (): JSX.Element => {
  const { health, refreshHealth, selectedProfile, snapshot, exportDiagnosticsBundle, openAppDataDirectory } = useDesktop();
  const [lastExportPath, setLastExportPath] = useState('');
  const recentFailures = useMemo(
    () => snapshot.diagnostics.filter((event) => event.level === 'error').slice(0, 8),
    [snapshot.diagnostics]
  );
  const recentApiEvents = useMemo(
    () => snapshot.diagnostics.filter((event) => event.category === 'api').slice(0, 12),
    [snapshot.diagnostics]
  );

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Diagnostics</h2>
        <p className="desktop-page-subtitle">Support tooling for request state, auth state, queue metadata, and recent events.</p>
      </div>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Auth and server</Text>
            <Text size="sm">Selected profile: {snapshot.selectedProfileId || 'None'}</Text>
            <Text size="sm">Authenticated profile: {snapshot.authProfileId || 'None'}</Text>
            <Text size="sm">User: {snapshot.authUser?.displayName ?? 'Not signed in'}</Text>
            <Text size="sm">Token expiry: {snapshot.tokenExpiresAt || 'No token issued'}</Text>
            <Text size="sm">Health status: {health?.ok ? 'Reachable' : 'Unknown'}</Text>
            <Text size="sm">Queue depth: {health?.queueDepth ?? 0}</Text>
            <Text size="sm">Failed jobs: {health?.failedJobs ?? 0}</Text>
            <Text size="sm">Watch roots: {snapshot.watchRoots.length}</Text>
            <Text size="sm">Cached formats: {snapshot.cachedFormats.length}</Text>
            <Group>
              <Button
                size="xs"
                variant="light"
                disabled={!selectedProfile}
                onClick={() => void refreshHealth()}
              >
                Refresh health snapshot
              </Button>
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  void exportDiagnosticsBundle().then((path) => setLastExportPath(path));
                }}
              >
                Export diagnostics
              </Button>
              <Button size="xs" variant="light" onClick={() => void openAppDataDirectory()}>
                Open app data folder
              </Button>
            </Group>
            {lastExportPath ? (
              <Alert color="teal" title="Export ready">
                <span className="desktop-mono">{lastExportPath}</span>
              </Alert>
            ) : null}
          </Stack>
        </Card>
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Queue inspector</Text>
            <Text size="sm">Detected files: {snapshot.detectedFiles.length}</Text>
            <Text size="sm">Upload jobs: {snapshot.uploadJobs.length}</Text>
            <Text size="sm">Active uploads: {snapshot.uploadJobs.filter((job) => job.uploadId && job.localState !== 'complete').length}</Text>
            <Text size="sm">Retryable failures: {snapshot.uploadJobs.filter((job) => job.localState === 'failed_retryable').length}</Text>
            <Text size="sm">Auth blocked: {snapshot.uploadJobs.filter((job) => job.localState === 'auth_blocked').length}</Text>
            <Text size="sm">Recorded attempts: {snapshot.uploadAttempts.length}</Text>
          </Stack>
        </Card>
      </SimpleGrid>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Watch roots</Text>
          {snapshot.watchRoots.length === 0 ? (
            <Alert color="gray">No watch roots configured.</Alert>
          ) : (
            <div className="desktop-table-wrap">
              <table className="desktop-table">
                <thead>
                  <tr>
                    <th>Path</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.watchRoots.map((root) => (
                    <tr key={root.id}>
                      <td className="desktop-mono">{root.path}</td>
                      <td>{root.paused ? 'Paused' : 'Active'}</td>
                      <td>{new Date(root.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Stack>
      </Card>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Recent failures</Text>
            {recentFailures.length === 0 ? (
              <Alert color="gray">No recent error events captured.</Alert>
            ) : (
              recentFailures.map((event) => (
                <Card key={event.id} withBorder className="desktop-subcard">
                  <Stack gap={4}>
                    <Group justify="space-between">
                      <Text fw={600}>{event.message}</Text>
                      <Text size="xs" c="dimmed">
                        {new Date(event.createdAt).toLocaleString()}
                      </Text>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {event.category}
                    </Text>
                    <Text size="sm" className="desktop-mono">
                      {event.detail}
                    </Text>
                  </Stack>
                </Card>
              ))
            )}
          </Stack>
        </Card>
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Recent API requests</Text>
            {recentApiEvents.length === 0 ? (
              <Alert color="gray">No API events captured yet.</Alert>
            ) : (
              <div className="desktop-table-wrap">
                <table className="desktop-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Message</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentApiEvents.map((event) => (
                      <tr key={event.id}>
                        <td>{new Date(event.createdAt).toLocaleString()}</td>
                        <td>{event.message}</td>
                        <td className="desktop-mono">{event.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Stack>
        </Card>
      </SimpleGrid>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Recent events</Text>
          {snapshot.diagnostics.length === 0 ? (
            <Alert color="gray">No diagnostic events captured yet.</Alert>
          ) : (
            snapshot.diagnostics.map((event) => (
              <Card key={event.id} withBorder className="desktop-subcard">
                <Stack gap={4}>
                  <Group justify="space-between">
                    <Text fw={600}>{event.message}</Text>
                    <Text size="xs" c="dimmed">
                      {new Date(event.createdAt).toLocaleString()}
                    </Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {event.category} / {event.level}
                  </Text>
                  <Text size="sm" className="desktop-mono">
                    {event.detail}
                  </Text>
                </Stack>
              </Card>
            ))
          )}
        </Stack>
      </Card>
    </Stack>
  );
};

export const SettingsPage = (): JSX.Element => {
  const {
    snapshot,
    selectedProfile,
    health,
    cards,
    cardSource,
    myAggCards,
    myAggTeams,
    deleteServerProfile,
    refreshHealth,
    refreshFormats,
    refreshCards,
    refreshMe,
    refreshMyAgg,
    scanWatchRoots,
    openAuthWindow,
    selectServerProfile,
    updatePreferences
  } = useDesktop();
  useScrollToHash();
  const isAuthenticated = snapshot.authUser !== null && snapshot.authProfileId === snapshot.selectedProfileId;

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Settings</h2>
        <p className="desktop-page-subtitle">Server profiles and desktop behavior configuration.</p>
      </div>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <ServerProfileForm id="server-profile" />
        <PreferencesForm preferences={snapshot.preferences} onSave={updatePreferences} />
      </SimpleGrid>
      <Card withBorder className="desktop-card" id="server-health">
        <Stack gap="sm">
          <Text fw={700}>Auth and server</Text>
          <Text size="sm" c="dimmed">
            Current server health and signed-in desktop identity state.
          </Text>
          <Alert color={health?.ok ? 'teal' : 'gray'} title="Health">
            {health?.ok ? 'Server reachable' : 'Server not checked yet.'}
          </Alert>
          <Text size="sm">Selected server: {selectedProfile?.name ?? 'No server selected'}</Text>
          <Text size="sm">Signed in user: {isAuthenticated ? snapshot.authUser?.displayName : 'Not signed in'}</Text>
          <Text size="sm">Token expiry: {isAuthenticated ? snapshot.tokenExpiresAt : 'No token issued'}</Text>
          <Text size="sm">Detected files: {snapshot.detectedFiles.length}</Text>
          <Group>
            <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void refreshHealth()}>
              Check health
            </Button>
            <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void openAuthWindow(selectedProfile?.id ?? '')}>
              Open sign-in
            </Button>
          </Group>
        </Stack>
      </Card>
      <Card withBorder className="desktop-card" id="sign-in">
        <Stack gap="sm">
          <Text fw={700}>Cards and personal aggregate</Text>
          <Text size="sm" c="dimmed">
            Desktop view of your current card source and personal aggregate rows.
          </Text>
          <Group>
            <Badge color={cardSource === 'user' ? 'teal' : 'blue'} variant="light">
              {cardSource === 'user' ? 'Using your card list' : 'Using shared fallback'}
            </Badge>
            <Badge color="orange" variant="light">
              Card rows {cards.length}
            </Badge>
            <Badge color="cyan" variant="light">
              Personal card rows {myAggCards.length}
            </Badge>
            <Badge color="grape" variant="light">
              Personal team rows {myAggTeams.length}
            </Badge>
          </Group>
          <Group>
            <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void refreshFormats()}>
              Refresh formats
            </Button>
            <Button size="xs" variant="light" disabled={!selectedProfile || !isAuthenticated} onClick={() => void refreshCards('')}>
              Refresh cards
            </Button>
            <Button
              size="xs"
              variant="light"
              disabled={!selectedProfile || !isAuthenticated}
              onClick={() => {
                if (!selectedProfile) {
                  return;
                }
                void refreshMyAgg(selectedProfile.id);
              }}
            >
              Refresh personal aggregate
            </Button>
            <Button
              size="xs"
              variant="light"
              disabled={!selectedProfile}
              onClick={() => {
                if (!selectedProfile) {
                  return;
                }
                void scanWatchRoots(selectedProfile.id);
              }}
            >
              Scan watch roots
            </Button>
          </Group>
        </Stack>
      </Card>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Saved server profiles</Text>
          {snapshot.profiles.length === 0 ? (
            <Alert color="gray">No server profiles configured.</Alert>
          ) : (
            snapshot.profiles.map((profile) => (
              <Card key={profile.id} withBorder className="desktop-subcard">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={600}>{profile.name}</Text>
                    <Text size="sm" c="dimmed" className="desktop-mono">
                      {profile.baseUrl}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {snapshot.selectedProfileId === profile.id ? 'Selected server' : 'Saved server'}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => {
                        void selectServerProfile(profile.id).then(() => refreshHealth());
                      }}
                    >
                      Check health
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      disabled={snapshot.authProfileId !== profile.id || !snapshot.authUser}
                      onClick={() => {
                        void selectServerProfile(profile.id).then(() => refreshMe(profile.id));
                      }}
                    >
                      Check auth
                    </Button>
                    <Button size="xs" color="red" variant="light" onClick={() => void deleteServerProfile(profile.id)}>
                      Remove
                    </Button>
                  </Group>
                </Group>
              </Card>
            ))
          )}
        </Stack>
      </Card>
    </Stack>
  );
};
