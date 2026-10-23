import { Alert, Badge, Button, type ButtonProps, Card, CopyButton, Group, Select, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { LocalUploadJob } from '@xips/api-contract';
import { useDesktop } from '../DesktopContext';
import { digitsOnly, formatDateTime } from '../format';
import { BlockedStatusBadge, Disclosure, KeyValueTable, PageHeader, QueueStateBadge, QueueTable, SectionHeader } from '../components';
import {
  buildFormatLabelById,
  canDismissUploadJob,
  canIgnoreUploadJob,
  compareUploadJobsNewestFirst,
  explainFilenameAutoAssignment,
  findDetectedFile,
  formatFileKindLabel,
  COMPACT_TIMESTAMP,
  formatLifecycleLabel,
  formatLocalPresenceLabel,
  formatMatchesTeamCount,
  formatQueueStateLabel,
  formatRetryableFailureMessage,
  formatSourceModifiedAt,
  formatUploadJobModifiedAt,
  getIncompleteTeamCountWarning,
  getQueueRowActionKeys,
  getQueueRowPrimaryAction,
  isQueueJobDone,
  isTournamentIdLength,
  parseLegacyQueueWorkspaceView,
  parseQueueWorkspaceView,
  parseRetryableFailureDetail,
  queueWorkspaceViewColor,
  queueWorkspaceViewDetail,
  queueWorkspaceViewForJob,
  queueWorkspaceViewLabel,
  formatOptionLabel,
  formatUploadFormatLabel,
  resolveTournamentIdMatch,
  summarizeBlockedJob,
  uploadJobNeedsAttention,
  uploadJobWorkingAutomatically,
  type QueueRowActionKey,
  type QueueWorkspaceView
} from '../queue-model';

const TechnicalValue = ({ value }: { value: string }): JSX.Element => (
  <Group gap="xs" wrap="nowrap">
    <span className="desktop-mono">{value || '-'}</span>
    {value ? (
      // The confirmation is a tooltip: a wider 'Copied' label overflows the narrow value column.
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Tooltip label="Copied" opened={copied} position="left" withArrow>
            <Button size="compact-xs" variant="light" onClick={copy}>
              Copy
            </Button>
          </Tooltip>
        )}
      </CopyButton>
    ) : null}
  </Group>
);

type ActionButtonStyle = { label: string; variant?: ButtonProps['variant']; color?: string; title?: string };
// 'row' styles the compact queue-row button, 'inspector' the inspector's; an action with neither is not offered there.
type JobActionConfig = { run: (job: LocalUploadJob) => void; row?: ActionButtonStyle; inspector?: ActionButtonStyle };
type JobActionConfigs = Partial<Record<QueueRowActionKey, JobActionConfig>>;

// The fix comes first, then reversible actions, then the ones that drop the row; "Reveal file" sits between the two groups.
const INSPECTOR_FIX_ACTIONS: readonly QueueRowActionKey[] = ['retry', 'reauth', 'restore'];
const INSPECTOR_REMOVE_ACTIONS: readonly QueueRowActionKey[] = ['ignore', 'dismissDuplicate', 'dismissWorking', 'removeAwaiting'];

// Actions that only call the desktop client; 'assign' is page navigation, so the page adds it.
const useJobActionConfigs = (): JobActionConfigs => {
  const {
    selectedProfile,
    retryUploadJob,
    dismissDuplicateUploadJob,
    dismissWorkingUploadJob,
    ignoreUploadJob,
    restoreIgnoredUploadJob,
    removeAwaitingUploadJob,
    openAuthWindow
  } = useDesktop();
  return {
    retry: {
      run: (job) => void retryUploadJob(job.id),
      row: { label: 'Retry', variant: 'light', color: 'yellow' },
      inspector: { label: 'Retry now', color: 'orange' }
    },
    ...(selectedProfile
      ? {
          reauth: {
            run: () => void openAuthWindow(selectedProfile.id),
            row: { label: 'Re-auth', variant: 'light', color: 'red' },
            inspector: { label: 'Sign in again', color: 'orange' }
          }
        }
      : {}),
    restore: {
      run: (job) => void restoreIgnoredUploadJob(job.id),
      row: { label: 'Restore', variant: 'subtle', color: 'gray' },
      inspector: { label: 'Restore row' }
    },
    ignore: {
      run: (job) => void ignoreUploadJob(job.id),
      inspector: { label: 'Ignore', variant: 'light', color: 'gray', title: 'Move to the Ignored tab; restore it there any time.' }
    },
    dismissDuplicate: {
      run: (job) => void dismissDuplicateUploadJob(job.id),
      row: { label: 'Dismiss', variant: 'subtle' },
      inspector: { label: 'Dismiss duplicate', variant: 'light', color: 'gray' }
    },
    dismissWorking: {
      run: (job) => void dismissWorkingUploadJob(job.id),
      row: { label: 'Dismiss', variant: 'subtle', color: 'red' },
      inspector: {
        label: 'Dismiss',
        variant: 'subtle',
        color: 'red',
        title: 'Remove it from the local queue. Safe until the upload starts.'
      }
    },
    removeAwaiting: {
      run: (job) => void removeAwaitingUploadJob(job.id),
      inspector: { label: 'Remove from queue', variant: 'subtle', color: 'red' }
    }
  };
};

// Rendered with key={job.id}, so the typed tournament ID, chosen format and open details reset when the selection changes.
const Inspector = ({ job }: { job: LocalUploadJob }): JSX.Element => {
  const { snapshot, assignDetectedFileFormat, assignDetectedFileTournament, openUploadFileLocation } = useDesktop();
  const actionConfigs = useJobActionConfigs();
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [showTechnicalDetails, { toggle: toggleTechnicalDetails }] = useDisclosure(false);
  const formatLabelById = buildFormatLabelById(snapshot.cachedFormats);
  const selectedAttempts = snapshot.uploadAttempts.filter((attempt) => attempt.uploadJobId === job.id);
  const selectedJobFormat = snapshot.cachedFormats.find((format) => format.id === job.formatId) ?? null;
  const selectedJobTeamCount = job.teamCount;
  const { matches: tournamentFormatMatches, error: tournamentAssignmentError } = resolveTournamentIdMatch(
    snapshot.cachedFormats,
    selectedTournamentId,
    selectedJobTeamCount,
    'inspector'
  );
  const matchedTournamentFormat = tournamentFormatMatches.length === 1 ? tournamentFormatMatches[0] : null;
  const compatibleDirectFormats = snapshot.cachedFormats.filter((format) =>
    formatMatchesTeamCount(format.teamsPerTournament, selectedJobTeamCount)
  );
  const selectedJobAutoAssignmentReason =
    job.localState !== 'awaiting_format_assignment' || job.fileKind !== 'stats_export'
      ? ''
      : explainFilenameAutoAssignment(job.filename, job.teamCount, snapshot.cachedFormats);
  const selectedJobTeamCountWarning = getIncompleteTeamCountWarning(job.fileKind, job.teamCount, selectedJobFormat);
  const selectedJobFailureDetail =
    job.localState === 'failed_retryable' ? parseRetryableFailureDetail(job.error) : null;
  const selectedJobView = queueWorkspaceViewForJob(job);
  const selectedJobActions = getQueueRowActionKeys(job);
  const selectedJobBlocker = uploadJobNeedsAttention(job) ? summarizeBlockedJob(job, snapshot.cachedFormats) : null;
  const selectedJobDetail = selectedJobBlocker
    ? selectedJobBlocker.reason
    : job.localState === 'detected' || job.localState === 'queued_local'
      ? 'Queued locally and safe to remove before upload starts'
      : job.localState === 'ignored'
        ? job.ignoredFromState
          ? `Ignored ${formatQueueStateLabel(job.ignoredFromState, job.fileKind).toLowerCase()} row`
          : 'Ignored row'
        : selectedJobView === 'done'
          ? 'Finished queue row'
          : 'Automatic progress is still underway';
  // Facts worth a glance; empty ones are left out, the rest sit under technical details.
  const selectedJobFacts: Array<[string, string]> = ([
    ['Format', selectedJobFormat?.name ?? formatUploadFormatLabel(job.formatId, formatLabelById)],
    ['Teams', job.teamCount > 0 ? String(job.teamCount) : ''],
    ['Server', job.lifecyclePhase ? formatLifecycleLabel(job.lifecyclePhase, job.fileKind) : ''],
    ['Server status', job.serverStatus],
    ['Updated', formatUploadJobModifiedAt(job, COMPACT_TIMESTAMP)]
  ] as Array<[string, string]>).filter(([, value]) => value && value !== '-');

  const renderAction = (key: QueueRowActionKey): JSX.Element | null => {
    const config = actionConfigs[key];
    if (!selectedJobActions.includes(key) || !config?.inspector) {
      return null;
    }
    const { label, variant, color, title } = config.inspector;
    return (
      <Button key={key} size="xs" variant={variant} color={color} title={title} onClick={() => config.run(job)}>
        {label}
      </Button>
    );
  };

  return (
    <Card className="desktop-card desktop-queue-inspector">
      <Stack gap="md">
        <SectionHeader
          eyebrow="Inspector"
          title={job.filename}
          description={selectedJobDetail}
          aside={selectedJobBlocker ? (
            <BlockedStatusBadge summary={selectedJobBlocker} />
          ) : (
            <QueueStateBadge state={job.localState} fileKind={job.fileKind} />
          )}
        />
        {job.localState === 'awaiting_format_assignment' && job.fileKind === 'stats_export' && selectedJobAutoAssignmentReason ? (
          <Alert color="blue" title="Why this was not auto-assigned">
            {selectedJobAutoAssignmentReason}
          </Alert>
        ) : null}
        {job.localState === 'failed_retryable' ? (
          <Alert color="orange" title="Retryable failure" className="desktop-wrap-anywhere">
            {job.error
              ? formatRetryableFailureMessage(job.error)
              : 'A transient error paused this upload. Retry from the queue or after the service recovers.'}
          </Alert>
        ) : null}
        {selectedJobFailureDetail?.kind === 'variant_limit_exceeded' ? (
          <Card className="desktop-subcard">
            <Stack gap="xs">
              <Text fw={600}>Variant limit details</Text>
              <Table withTableBorder withColumnBorders>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Th>Team</Table.Th>
                    <Table.Td>{selectedJobFailureDetail.teamName}</Table.Td>
                  </Table.Tr>
                  {selectedJobFailureDetail.formatName ? (
                    <Table.Tr>
                      <Table.Th>Format</Table.Th>
                      <Table.Td>{selectedJobFailureDetail.formatName}</Table.Td>
                    </Table.Tr>
                  ) : null}
                  <Table.Tr>
                    <Table.Th>Variant cards found</Table.Th>
                    <Table.Td>{selectedJobFailureDetail.actual}</Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Th>Limit allowed</Table.Th>
                    <Table.Td>{selectedJobFailureDetail.allowed}</Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            </Stack>
          </Card>
        ) : null}
        {job.localState === 'auth_blocked' ? (
          <Alert color="red" title="Sign-in required">
            The selected account needs to sign in again. After successful auth, the queue resumes automatically.
          </Alert>
        ) : null}
        {job.localState === 'ignored' ? (
          <Alert color="gray" title="Ignored row">
            {job.ignoredFromState
              ? `This row was hidden after ${formatQueueStateLabel(job.ignoredFromState, job.fileKind).toLowerCase()}. Restore it when you want it back in the queue.`
              : 'This row was hidden from the queue. Restore it when you want it back in the main lane.'}
          </Alert>
        ) : null}
        {job.localState === 'awaiting_format_assignment' && job.fileKind === 'stats_export' ? (
          <Card className="desktop-subcard desktop-queue-resolution">
            <Stack gap="xs">
              <Text fw={600}>Assign a format</Text>
              <Group gap="xs" align="flex-end" wrap="nowrap">
                <TextInput
                  size="xs"
                  style={{ flex: 1 }}
                  label="Tournament ID"
                  placeholder="Full 3 to 7 digit ID"
                  value={selectedTournamentId}
                  onChange={(event) => {
                    setSelectedTournamentId(digitsOnly(event.currentTarget.value, 7));
                  }}
                />
                <Button
                  size="xs"
                  color="orange"
                  disabled={!matchedTournamentFormat || selectedTournamentId.trim().length < 3}
                  onClick={() => {
                    const detectedFile = findDetectedFile(snapshot.detectedFiles, job);
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
                  Assign
                </Button>
              </Group>
              {matchedTournamentFormat ? (
                <Text size="xs" c="teal">
                  {matchedTournamentFormat.tournamentId
                    ? `Maps to ${matchedTournamentFormat.name} (event ${matchedTournamentFormat.tournamentId}).`
                    : `Maps to ${matchedTournamentFormat.name} using prefix ${matchedTournamentFormat.tournamentIdPrefix} (${matchedTournamentFormat.tournamentIdPrefix.length + 4} digits total).`}
                  {matchedTournamentFormat.teamsPerTournament > 0 ? ` ${matchedTournamentFormat.teamsPerTournament} teams.` : ''}
                </Text>
              ) : tournamentAssignmentError ? (
                <Text size="xs" c="yellow">{tournamentAssignmentError}</Text>
              ) : null}
              <Group gap="xs" align="flex-end" wrap="nowrap">
                <Select
                  size="xs"
                  style={{ flex: 1 }}
                  label="Or pick the format"
                  title="Use this when the tournament ID is not known yet or several formats share a prefix."
                  placeholder="Choose a format"
                  value={selectedFormatId || null}
                  onChange={(value) => setSelectedFormatId(value ?? '')}
                  data={compatibleDirectFormats.map((format) => ({
                    value: format.id,
                    label: `${formatOptionLabel(format)}${format.teamsPerTournament > 0 ? ` - ${format.teamsPerTournament} teams` : ''}`
                  }))}
                />
                <Button
                  size="xs"
                  variant="light"
                  color="orange"
                  disabled={!selectedFormatId}
                  onClick={() => {
                    const detectedFile = findDetectedFile(snapshot.detectedFiles, job);
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
                  Assign
                </Button>
              </Group>
            </Stack>
          </Card>
        ) : null}
        {selectedJobTeamCountWarning ? (
          <Alert color="yellow" title="Team count looks short">
            {selectedJobTeamCountWarning.message}
          </Alert>
        ) : null}
        {/* The fix comes first, then reversible actions, then the ones that drop the row. */}
        <Group gap="xs" wrap="wrap">
          {INSPECTOR_FIX_ACTIONS.map(renderAction)}
          <Button size="xs" variant="light" color="gray" onClick={() => void openUploadFileLocation(job.id)}>
            Reveal file
          </Button>
          {INSPECTOR_REMOVE_ACTIONS.map(renderAction)}
        </Group>
        {selectedJobFacts.length > 0 ? (
          <KeyValueTable
            className="desktop-inspector-facts"
            rows={selectedJobFacts.map(([label, value]) => ({ label, value }))}
            valueClassName="desktop-wrap-anywhere"
            verticalSpacing={4}
            fz="sm"
          />
        ) : null}
        <Disclosure
          size="xs"
          variant="subtle"
          color="gray"
          opened={showTechnicalDetails}
          onToggle={toggleTechnicalDetails}
          showLabel="Show technical details"
          hideLabel="Hide technical details"
        >
          <Table.ScrollContainer minWidth={480} type="native">
            <KeyValueTable
              withTableBorder
              withColumnBorders
              rows={[
                { label: 'Kind', value: formatFileKindLabel(job.fileKind) },
                { label: 'Local state', value: formatQueueStateLabel(job.localState, job.fileKind) },
                { label: 'Error', value: job.error ? formatRetryableFailureMessage(job.error) : '-', className: 'desktop-wrap-anywhere' },
                { label: 'Local job ID', value: <TechnicalValue value={job.id} /> },
                { label: 'Path', value: job.path, className: 'desktop-mono' },
                { label: 'Staged path', value: job.stagedPath || '-', className: 'desktop-mono' },
                { label: 'Local file', value: formatLocalPresenceLabel(job.localPresence) },
                { label: 'Tournament ID', value: job.tournamentId || '-' },
                { label: 'Checksum', value: <TechnicalValue value={job.checksum} /> },
                { label: 'Remote checksum', value: <TechnicalValue value={job.remoteChecksum} /> },
                { label: 'Upload ID', value: <TechnicalValue value={job.uploadId} /> },
                { label: 'Request ID', value: <TechnicalValue value={job.lastRequestId} /> },
                { label: 'Duplicate reason', value: job.duplicateReason || '-' },
                { label: 'Retry after', value: job.nextRetryAfter || '-' },
                { label: 'Queued', value: job.queuedAt || '-' },
                { label: 'Processing', value: job.processingAt || '-' },
                { label: 'Parsed', value: job.parsedAt || '-' },
                { label: 'Refreshing', value: job.refreshingAt || '-' },
                { label: 'Completed', value: job.completedAt || '-' },
                { label: 'Failed', value: job.failedAt || '-' },
                { label: 'Retries', value: job.retries },
                { label: 'Source modified', value: formatSourceModifiedAt(job.sourceModifiedAt) },
                { label: 'Queue updated', value: formatDateTime(job.updatedAt) }
              ]}
            />
          </Table.ScrollContainer>
          <Card className="desktop-subcard">
            <Stack gap="xs">
              <Text fw={600}>Attempt history</Text>
              {selectedAttempts.length === 0 ? (
                <Alert color="gray">No local attempts recorded yet.</Alert>
              ) : (
                <Table.ScrollContainer minWidth={480} type="native">
                  <Table withTableBorder withColumnBorders highlightOnHover striped="odd">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>#</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Detail</Table.Th>
                        <Table.Th>Updated</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {selectedAttempts.map((attempt) => (
                        <Table.Tr key={attempt.id}>
                          <Table.Td>{attempt.attemptNumber}</Table.Td>
                          <Table.Td>{attempt.status}</Table.Td>
                          <Table.Td className="desktop-mono">{attempt.detail}</Table.Td>
                          <Table.Td>{formatDateTime(attempt.updatedAt)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Stack>
          </Card>
        </Disclosure>
      </Stack>
    </Card>
  );
};

export const UploadQueuePage = (): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    snapshot,
    loading,
    assignDetectedFileTournament,
    dismissDuplicateUploadJob,
    dismissWorkingUploadJob,
    ignoreUploadJob,
    removeAwaitingUploadJob
  } = useDesktop();
  const jobActionConfigs = useJobActionConfigs();
  const actionConfigs: JobActionConfigs = {
    ...jobActionConfigs,
    assign: {
      run: (job) => {
        setQueueView('needs_action');
        setSelectedJobId(job.id);
      },
      row: { label: 'Assign', variant: 'light', color: 'orange' }
    }
  };
  const [queueView, setQueueView] = useState<QueueWorkspaceView>('working');
  // The default tab depends on the jobs, so pick it (and write it to the URL) only once a snapshot has loaded;
  // otherwise a cold start lands on Done from the empty initial snapshot and the URL keeps it.
  const [snapshotReady, setSnapshotReady] = useState(!loading);
  useEffect(() => {
    if (!loading) {
      setSnapshotReady(true);
    }
  }, [loading]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedQueueJobIds, setSelectedQueueJobIds] = useState<string[]>([]);
  const [editingFilenameJobId, setEditingFilenameJobId] = useState('');
  const [inlineTournamentId, setInlineTournamentId] = useState('');
  const [bulkDismissInFlight, setBulkDismissInFlight] = useState(false);
  const formatById = Object.fromEntries(snapshot.cachedFormats.map((format) => [format.id, format]));
  const formatLabelById = buildFormatLabelById(snapshot.cachedFormats);
  // The URL-sync and selection effects below depend on these arrays, and they set state, so the arrays must
  // keep their identity until the jobs change. The React Compiler left them unmemoized (an infinite render
  // loop), so useMemo stays: compiler memoization is an optimization, not a guarantee.
  const { sortedJobs, needsActionJobs, workingJobs, ignoredJobs, queueJobsByView } = useMemo(() => {
    const sorted = [...snapshot.uploadJobs].sort(compareUploadJobsNewestFirst);
    const byView = {
      needs_action: sorted.filter(uploadJobNeedsAttention),
      ignored: sorted.filter((job) => job.localState === 'ignored'),
      working: sorted.filter((job) => uploadJobWorkingAutomatically(job) && !uploadJobNeedsAttention(job)),
      done: sorted.filter(isQueueJobDone)
    };
    return {
      sortedJobs: sorted,
      needsActionJobs: byView.needs_action,
      workingJobs: byView.working,
      ignoredJobs: byView.ignored,
      queueJobsByView: byView
    };
  }, [snapshot.uploadJobs]);
  const doneJobs = queueJobsByView.done;
  const queueCounts = {
    needs_action: needsActionJobs.length,
    ignored: ignoredJobs.length,
    working: workingJobs.length,
    done: doneJobs.length
  };
  const selectedQueueJobs = queueJobsByView[queueView].filter((job) => selectedQueueJobIds.includes(job.id));
  const dismissibleSelectedJobs = selectedQueueJobs.filter(canDismissUploadJob);
  const ignorableSelectedJobs = selectedQueueJobs.filter(canIgnoreUploadJob);

  const selectedJob = sortedJobs.find((job) => job.id === selectedJobId) ?? null;
  const inlineEditingJob = snapshot.uploadJobs.find((job) => job.id === editingFilenameJobId) ?? null;
  const inlineEditingJobTeamCount = inlineEditingJob?.teamCount ?? 0;
  const { error: inlineTournamentAssignmentError } = resolveTournamentIdMatch(
    snapshot.cachedFormats,
    inlineTournamentId,
    inlineEditingJobTeamCount,
    'inline'
  );
  const currentViewJobs = queueJobsByView[queueView];

  useEffect(() => {
    if (!snapshotReady) {
      return;
    }
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
        : ignoredJobs.length > 0
          ? 'ignored'
        : workingJobs.length > 0
          ? 'working'
          : 'done';

    setQueueView(parsedView ?? defaultView);
    setSelectedJobId(selectedJobIdFromQuery);
    setSelectedQueueJobIds(selectedJobIdsFromQuery.length > 0 ? selectedJobIdsFromQuery : selectedJobIdFromQuery ? [selectedJobIdFromQuery] : []);
  }, [ignoredJobs.length, location.search, needsActionJobs.length, snapshotReady, sortedJobs, workingJobs.length]);

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
    if (!snapshotReady) {
      return;
    }
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
  }, [location.pathname, location.search, navigate, queueView, selectedJobId, snapshotReady]);

  const submitInlineTournamentAssignment = async (jobId: string): Promise<void> => {
    const tournamentId = inlineTournamentId.trim();
    if (!isTournamentIdLength(tournamentId)) {
      return;
    }
    const job = snapshot.uploadJobs.find((entry) => entry.id === jobId) ?? null;
    if (!job) {
      return;
    }
    const detectedFile = findDetectedFile(snapshot.detectedFiles, job);
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
    const dismissAll = async (): Promise<void> => {
      for (const job of dismissibleSelectedJobs) {
        if (job.localState === 'duplicate_skipped_local') {
          await dismissDuplicateUploadJob(job.id);
        } else if (job.localState === 'awaiting_format_assignment') {
          await removeAwaitingUploadJob(job.id);
        } else if (job.localState === 'detected' || job.localState === 'queued_local') {
          await dismissWorkingUploadJob(job.id);
        }
      }
      setSelectedQueueJobIds((current) => current.filter((jobId) => !removedIds.includes(jobId)));
      if (removedIds.includes(selectedJobId)) {
        setSelectedJobId('');
      }
    };
    await dismissAll().finally(() => setBulkDismissInFlight(false));
  };

  const ignoreSelectedJobs = async (): Promise<void> => {
    if (ignorableSelectedJobs.length === 0 || bulkDismissInFlight) {
      return;
    }

    setBulkDismissInFlight(true);
    const ignoredIds = ignorableSelectedJobs.map((job) => job.id);
    const ignoreAll = async (): Promise<void> => {
      for (const job of ignorableSelectedJobs) {
        await ignoreUploadJob(job.id);
      }
      setSelectedQueueJobIds((current) => current.filter((jobId) => !ignoredIds.includes(jobId)));
      if (ignoredIds.includes(selectedJobId)) {
        setSelectedJobId('');
      }
      setQueueView('ignored');
    };
    await ignoreAll().finally(() => setBulkDismissInFlight(false));
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Upload Queue"
        actions={
          <>
            {(Object.keys(queueWorkspaceViewLabel) as QueueWorkspaceView[]).map((view) => (
              <Button
                key={view}
                title={queueWorkspaceViewDetail[view]}
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
          </>
        }
      />
      <div className={`desktop-queue-layout${selectedJob ? '' : ' no-inspector'}`}>
        <Stack gap="lg" className="desktop-queue-main">
          <Card className="desktop-card">
            <Stack gap="sm">
              <Group justify="space-between" align="center" wrap="wrap">
                <Text size="sm" c="dimmed">
                  {selectedQueueJobIds.length > 0 ? `${selectedQueueJobIds.length} selected` : 'Select rows to ignore or dismiss them together.'}
                </Text>
                <Group gap="xs" align="center" wrap="wrap">
                  {queueView !== 'ignored' ? (
                    <Button
                      size="xs"
                      variant="light"
                      color="gray"
                      disabled={ignorableSelectedJobs.length === 0 || bulkDismissInFlight}
                      loading={bulkDismissInFlight}
                      onClick={() => {
                        void ignoreSelectedJobs();
                      }}
                    >
                      Ignore selected
                    </Button>
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
                formats={snapshot.cachedFormats}
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
                        placeholder="3 to 7 digits"
                        error={inlineTournamentAssignmentError || undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        onChange={(event) => {
                          setInlineTournamentId(digitsOnly(event.currentTarget.value, 7));
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
                    <>
                      <button
                        type="button"
                        className="desktop-link-button admin-cell-clip"
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
                        title={canInlineAssign ? 'Double-click to enter a 3 to 7 digit tournament ID.' : job.filename}
                      >
                        {job.filename}
                      </button>
                      {teamCountWarning ? (
                        <Badge color="yellow">
                          {teamCountWarning.badgeLabel}
                        </Badge>
                      ) : null}
                    </>
                  );
                }}
                actions={(job) => {
                  const key = getQueueRowPrimaryAction(job);
                  const action = key ? actionConfigs[key] : undefined;
                  return (
                    <Group gap={4} wrap="nowrap">
                      {action?.row ? (
                        <Button
                          size="compact-xs"
                          variant={action.row.variant}
                          color={action.row.color}
                          onClick={(event) => {
                            event.stopPropagation();
                            action.run(job);
                          }}
                        >
                          {action.row.label}
                        </Button>
                      ) : null}
                    </Group>
                  );
                }}
              />
            </Stack>
          </Card>
        </Stack>
        {selectedJob ? <Inspector key={selectedJob.id} job={selectedJob} /> : null}
      </div>
    </Stack>
  );
};