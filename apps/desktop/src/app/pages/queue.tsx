import { Alert, Badge, Button, Card, Collapse, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { type JSX, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDesktop } from '../DesktopContext';
import { BlockedStatusBadge, PageHeader, QueueStateBadge, QueueTable, SectionHeader } from '../components';
import {
  canDismissUploadJob,
  canIgnoreUploadJob,
  compareUploadJobsNewestFirst,
  explainFilenameAutoAssignment,
  matchFormatsForTournamentId,
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
  parseLegacyQueueWorkspaceView,
  parseQueueWorkspaceView,
  parseRetryableFailureDetail,
  queueWorkspaceViewColor,
  queueWorkspaceViewDetail,
  queueWorkspaceViewForJob,
  queueWorkspaceViewLabel,
  formatUploadFormatLabel,
  summarizeBlockedJob,
  uploadJobNeedsAttention,
  uploadJobWorkingAutomatically,
  type QueueWorkspaceView
} from '../queue-model';

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

export const UploadQueuePage = (): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    snapshot,
    loading,
    selectedProfile,
    assignDetectedFileFormat,
    assignDetectedFileTournament,
    retryUploadJob,
    dismissDuplicateUploadJob,
    dismissWorkingUploadJob,
    ignoreUploadJob,
    restoreIgnoredUploadJob,
    removeAwaitingUploadJob,
    openUploadFileLocation,
    openAuthWindow
  } = useDesktop();
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
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [editingFilenameJobId, setEditingFilenameJobId] = useState('');
  const [inlineTournamentId, setInlineTournamentId] = useState('');
  const [bulkDismissInFlight, setBulkDismissInFlight] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
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
        compareUploadJobsNewestFirst
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
  const ignoredJobs = useMemo(
    () => sortedJobs.filter((job) => job.localState === 'ignored'),
    [sortedJobs]
  );
  const doneJobs = useMemo(
    () => sortedJobs.filter(isQueueJobDone),
    [sortedJobs]
  );
  const queueJobsByView = useMemo(
    () => ({
      needs_action: needsActionJobs,
      ignored: ignoredJobs,
      working: workingJobs,
      done: doneJobs
    }),
    [doneJobs, ignoredJobs, needsActionJobs, workingJobs]
  );
  const queueCounts = useMemo(
    () => ({
      needs_action: needsActionJobs.length,
      ignored: ignoredJobs.length,
      working: workingJobs.length,
      done: doneJobs.length
    }),
    [doneJobs.length, ignoredJobs.length, needsActionJobs.length, workingJobs.length]
  );
  const selectedQueueJobs = useMemo(
    () => queueJobsByView[queueView].filter((job) => selectedQueueJobIds.includes(job.id)),
    [queueJobsByView, queueView, selectedQueueJobIds]
  );
  const dismissibleSelectedJobs = useMemo(
    () =>
      selectedQueueJobs.filter(canDismissUploadJob),
    [selectedQueueJobs]
  );
  const ignorableSelectedJobs = useMemo(
    () => selectedQueueJobs.filter(canIgnoreUploadJob),
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
    if (normalizedTournamentId.length < 3 || normalizedTournamentId.length > 7) {
      return [];
    }
    return matchFormatsForTournamentId(snapshot.cachedFormats, normalizedTournamentId, selectedJobTeamCount);
  }, [selectedJobTeamCount, selectedTournamentId, snapshot.cachedFormats]);
  const matchedTournamentFormat = tournamentFormatMatches.length === 1 ? tournamentFormatMatches[0] : null;
  const tournamentAssignmentError =
    selectedTournamentId.trim().length === 0
      ? ''
      : tournamentFormatMatches.length === 0
        ? selectedJobTeamCount > 0
          ? `No cached tournament format matches that 3 to 7 digit tournament ID for ${selectedJobTeamCount} detected teams.`
          : 'No cached tournament format matches that 3 to 7 digit tournament ID.'
        : tournamentFormatMatches.length > 1
          ? 'More than one cached format matches that tournament ID. Refresh formats or assign by format instead.'
          : '';
  const inlineTournamentFormatMatches = useMemo(() => {
    const normalizedTournamentId = inlineTournamentId.trim();
    if (normalizedTournamentId.length < 3 || normalizedTournamentId.length > 7) {
      return [];
    }
    return matchFormatsForTournamentId(snapshot.cachedFormats, normalizedTournamentId, inlineEditingJobTeamCount);
  }, [inlineEditingJobTeamCount, inlineTournamentId, snapshot.cachedFormats]);
  const inlineTournamentAssignmentError =
    inlineTournamentId.trim().length === 0
      ? ''
      : inlineTournamentFormatMatches.length === 0
        ? inlineEditingJobTeamCount > 0
          ? `No cached format matches that tournament ID for ${inlineEditingJobTeamCount} detected teams.`
          : 'No cached format matches that tournament ID.'
        : inlineTournamentFormatMatches.length > 1
          ? 'More than one cached format matches that tournament ID.'
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
  const selectedJobFailureDetail = useMemo(
    () => (selectedJob?.localState === 'failed_retryable' ? parseRetryableFailureDetail(selectedJob.error) : null),
    [selectedJob?.localState, selectedJob?.error]
  );
  const selectedJobView = selectedJob ? queueWorkspaceViewForJob(selectedJob) : null;
  const selectedJobActions = useMemo(() => (selectedJob ? getQueueRowActionKeys(selectedJob) : []), [selectedJob]);
  const selectedJobBlocker =
    selectedJob && uploadJobNeedsAttention(selectedJob) ? summarizeBlockedJob(selectedJob, snapshot.cachedFormats) : null;
  const selectedJobDetail = selectedJob
    ? selectedJobBlocker
      ? selectedJobBlocker.reason
      : selectedJob.localState === 'detected' || selectedJob.localState === 'queued_local'
        ? 'Queued locally and safe to remove before upload starts'
        : selectedJob.localState === 'ignored'
          ? selectedJob.ignoredFromState
            ? `Ignored ${formatQueueStateLabel(selectedJob.ignoredFromState, selectedJob.fileKind).toLowerCase()} row`
            : 'Ignored row'
          : selectedJobView === 'done'
            ? 'Finished queue row'
            : 'Automatic progress is still underway'
    : '';
  // Facts worth a glance; empty ones are left out, the rest sit under technical details.
  const selectedJobFacts: Array<[string, string]> = selectedJob
    ? ([
        ['Format', selectedJobFormat?.name ?? formatUploadFormatLabel(selectedJob.formatId, formatLabelById)],
        ['Teams', selectedJob.teamCount > 0 ? String(selectedJob.teamCount) : ''],
        ['Server', selectedJob.lifecyclePhase ? formatLifecycleLabel(selectedJob.lifecyclePhase, selectedJob.fileKind) : ''],
        ['Server status', selectedJob.serverStatus],
        ['Updated', formatUploadJobModifiedAt(selectedJob, COMPACT_TIMESTAMP)]
      ] as Array<[string, string]>).filter(([, value]) => value && value !== '-')
    : [];
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
    if (tournamentId.length < 3 || tournamentId.length > 7) {
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
    setShowTechnicalDetails(false);
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
        } else if (job.localState === 'detected' || job.localState === 'queued_local') {
          await dismissWorkingUploadJob(job.id);
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

  const ignoreSelectedJobs = async (): Promise<void> => {
    if (ignorableSelectedJobs.length === 0 || bulkDismissInFlight) {
      return;
    }

    setBulkDismissInFlight(true);
    const ignoredIds = ignorableSelectedJobs.map((job) => job.id);
    try {
      for (const job of ignorableSelectedJobs) {
        await ignoreUploadJob(job.id);
      }
      setSelectedQueueJobIds((current) => current.filter((jobId) => !ignoredIds.includes(jobId)));
      if (ignoredIds.includes(selectedJobId)) {
        setSelectedJobId('');
      }
      setQueueView('ignored');
    } finally {
      setBulkDismissInFlight(false);
    }
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
          <Card withBorder className="desktop-card">
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
                        <Badge color="yellow" variant="light">
                          {teamCountWarning.badgeLabel}
                        </Badge>
                      ) : null}
                    </>
                  );
                }}
                actions={(job) => {
                  const rowAction = getQueueRowPrimaryAction(job);
                  return (
                  <Group gap={4} wrap="nowrap">
                    {rowAction === 'assign' ? (
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
                    {rowAction === 'retry' ? (
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
                    {rowAction === 'reauth' && selectedProfile ? (
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
                    {rowAction === 'dismissWorking' ? (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        onClick={(event) => {
                          event.stopPropagation();
                          void dismissWorkingUploadJob(job.id);
                        }}
                      >
                        Dismiss
                      </Button>
                    ) : null}
                    {rowAction === 'restore' ? (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="gray"
                        onClick={(event) => {
                          event.stopPropagation();
                          void restoreIgnoredUploadJob(job.id);
                        }}
                      >
                        Restore
                      </Button>
                    ) : null}
                    {rowAction === 'dismissDuplicate' ? (
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
                  </Group>
                  );
                }}
              />
            </Stack>
          </Card>
        </Stack>
        {selectedJob ? (
          <Card withBorder className="desktop-card desktop-queue-inspector">
            <Stack gap="md">
              <SectionHeader
                eyebrow="Inspector"
                title={selectedJob.filename}
                description={selectedJobDetail}
                aside={selectedJobBlocker ? (
                  <BlockedStatusBadge summary={selectedJobBlocker} />
                ) : (
                  <QueueStateBadge state={selectedJob.localState} fileKind={selectedJob.fileKind} />
                )}
              />
              {selectedJob.localState === 'awaiting_format_assignment' && selectedJob.fileKind === 'stats_export' && selectedJobAutoAssignmentReason ? (
                <Alert color="blue" title="Why this was not auto-assigned">
                  {selectedJobAutoAssignmentReason}
                </Alert>
              ) : null}
              {selectedJob.localState === 'failed_retryable' ? (
                <Alert color="orange" title="Retryable failure" className="desktop-wrap-anywhere">
                  {selectedJob.error
                    ? formatRetryableFailureMessage(selectedJob.error)
                    : 'A transient error paused this upload. Retry from the queue or after the service recovers.'}
                </Alert>
              ) : null}
              {selectedJobFailureDetail?.kind === 'variant_limit_exceeded' ? (
                <Card withBorder className="desktop-subcard">
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
              {selectedJob.localState === 'auth_blocked' ? (
                <Alert color="red" title="Sign-in required">
                  The selected account needs to sign in again. After successful auth, the queue resumes automatically.
                </Alert>
              ) : null}
              {selectedJob.localState === 'ignored' ? (
                <Alert color="gray" title="Ignored row">
                  {selectedJob.ignoredFromState
                    ? `This row was hidden after ${formatQueueStateLabel(selectedJob.ignoredFromState, selectedJob.fileKind).toLowerCase()}. Restore it when you want it back in the queue.`
                    : 'This row was hidden from the queue. Restore it when you want it back in the main lane.'}
                </Alert>
              ) : null}
              {selectedJob.localState === 'awaiting_format_assignment' && selectedJob.fileKind === 'stats_export' ? (
                <Card withBorder className="desktop-subcard desktop-queue-resolution">
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
                          setSelectedTournamentId(event.currentTarget.value.replace(/[^0-9]/gu, '').slice(0, 7));
                        }}
                      />
                      <Button
                        size="xs"
                        color="orange"
                        disabled={!matchedTournamentFormat || selectedTournamentId.trim().length < 3}
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
                          label: `${format.tournamentIdPrefix ? `${format.name} (${format.tournamentIdPrefix}xxxx)` : format.name}${format.teamsPerTournament > 0 ? ` - ${format.teamsPerTournament} teams` : ''}`
                        }))}
                      />
                      <Button
                        size="xs"
                        variant="light"
                        color="orange"
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
                {selectedJobActions.includes('retry') ? (
                  <Button size="xs" color="orange" onClick={() => void retryUploadJob(selectedJob.id)}>
                    Retry now
                  </Button>
                ) : null}
                {selectedJobActions.includes('reauth') && selectedProfile ? (
                  <Button size="xs" color="orange" onClick={() => void openAuthWindow(selectedProfile.id)}>
                    Sign in again
                  </Button>
                ) : null}
                {selectedJobActions.includes('restore') ? (
                  <Button size="xs" onClick={() => void restoreIgnoredUploadJob(selectedJob.id)}>
                    Restore row
                  </Button>
                ) : null}
                <Button size="xs" variant="light" color="gray" onClick={() => void openUploadFileLocation(selectedJob.id)}>
                  Reveal file
                </Button>
                {selectedJobActions.includes('ignore') ? (
                  <Button
                    size="xs"
                    variant="light"
                    color="gray"
                    title="Move to the Ignored tab; restore it there any time."
                    onClick={() => void ignoreUploadJob(selectedJob.id)}
                  >
                    Ignore
                  </Button>
                ) : null}
                {selectedJobActions.includes('dismissDuplicate') ? (
                  <Button size="xs" variant="light" color="gray" onClick={() => void dismissDuplicateUploadJob(selectedJob.id)}>
                    Dismiss duplicate
                  </Button>
                ) : null}
                {selectedJobActions.includes('dismissWorking') ? (
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    title="Remove it from the local queue. Safe until the upload starts."
                    onClick={() => void dismissWorkingUploadJob(selectedJob.id)}
                  >
                    Dismiss
                  </Button>
                ) : null}
                {selectedJobActions.includes('removeAwaiting') ? (
                  <Button size="xs" variant="subtle" color="red" onClick={() => void removeAwaitingUploadJob(selectedJob.id)}>
                    Remove from queue
                  </Button>
                ) : null}
              </Group>
              {selectedJobFacts.length > 0 ? (
                <Table className="desktop-inspector-facts" verticalSpacing={4} fz="sm">
                  <Table.Tbody>
                    {selectedJobFacts.map(([label, value]) => (
                      <Table.Tr key={label}>
                        <Table.Th>{label}</Table.Th>
                        <Table.Td className="desktop-wrap-anywhere">{value}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : null}
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => setShowTechnicalDetails((current) => !current)}
              >
                {showTechnicalDetails ? 'Hide technical details' : 'Show technical details'}
              </Button>
              <Collapse expanded={showTechnicalDetails}>
                <Table.ScrollContainer minWidth={480} type="native">
                  <Table withTableBorder withColumnBorders>
                    <Table.Tbody>
                      <Table.Tr><Table.Th>Kind</Table.Th><Table.Td>{formatFileKindLabel(selectedJob.fileKind)}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Local state</Table.Th><Table.Td>{formatQueueStateLabel(selectedJob.localState, selectedJob.fileKind)}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Error</Table.Th><Table.Td className="desktop-wrap-anywhere">{selectedJob.error ? formatRetryableFailureMessage(selectedJob.error) : '-'}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Local job ID</Table.Th><Table.Td><TechnicalValue value={selectedJob.id} /></Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Path</Table.Th><Table.Td className="desktop-mono">{selectedJob.path}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Staged path</Table.Th><Table.Td className="desktop-mono">{selectedJob.stagedPath || '-'}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Local file</Table.Th><Table.Td>{formatLocalPresenceLabel(selectedJob.localPresence)}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Tournament ID</Table.Th><Table.Td>{selectedJob.tournamentId || '-'}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Checksum</Table.Th><Table.Td><TechnicalValue value={selectedJob.checksum} /></Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Remote checksum</Table.Th><Table.Td><TechnicalValue value={selectedJob.remoteChecksum} /></Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Upload ID</Table.Th><Table.Td><TechnicalValue value={selectedJob.uploadId} /></Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Request ID</Table.Th><Table.Td><TechnicalValue value={selectedJob.lastRequestId} /></Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Duplicate reason</Table.Th><Table.Td>{selectedJob.duplicateReason || '-'}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Retry after</Table.Th><Table.Td>{selectedJob.nextRetryAfter || '-'}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Queued</Table.Th><Table.Td>{selectedJob.queuedAt || '-'}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Processing</Table.Th><Table.Td>{selectedJob.processingAt || '-'}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Parsed</Table.Th><Table.Td>{selectedJob.parsedAt || '-'}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Refreshing</Table.Th><Table.Td>{selectedJob.refreshingAt || '-'}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Completed</Table.Th><Table.Td>{selectedJob.completedAt || '-'}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Failed</Table.Th><Table.Td>{selectedJob.failedAt || '-'}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Retries</Table.Th><Table.Td>{selectedJob.retries}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Source modified</Table.Th><Table.Td>{formatSourceModifiedAt(selectedJob.sourceModifiedAt)}</Table.Td></Table.Tr>
                      <Table.Tr><Table.Th>Queue updated</Table.Th><Table.Td>{new Date(selectedJob.updatedAt).toLocaleString()}</Table.Td></Table.Tr>
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
                <Card withBorder className="desktop-subcard">
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
                                <Table.Td>{new Date(attempt.updatedAt).toLocaleString()}</Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Table.ScrollContainer>
                    )}
                  </Stack>
                </Card>
              </Collapse>
            </Stack>
          </Card>
        ) : null}
      </div>
    </Stack>
  );
};
