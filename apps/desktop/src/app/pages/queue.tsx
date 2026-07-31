import { Alert, Badge, Button, Card, Group, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDesktop } from '../DesktopContext';
import { QueueTable } from '../components';
import {
  canDismissUploadJob,
  canIgnoreUploadJob,
  explainFilenameAutoAssignment,
  formatFileKindLabel,
  formatLifecycleLabel,
  formatLocalPresenceLabel,
  formatMatchesTeamCount,
  formatQueueStateLabel,
  formatSourceModifiedAt,
  formatUploadJobModifiedAt,
  getIncompleteTeamCountWarning,
  getQueueRowActionKeys,
  getUploadJobModifiedAt,
  isQueueJobDone,
  parseLegacyQueueWorkspaceView,
  parseQueueWorkspaceView,
  queueWorkspaceViewColor,
  queueWorkspaceViewDetail,
  queueWorkspaceViewForJob,
  queueWorkspaceViewLabel,
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
  const selectedJobActions = useMemo(() => (selectedJob ? getQueueRowActionKeys(selectedJob) : []), [selectedJob]);
  const selectedJobDetail = selectedJob
    ? selectedJob.localState === 'awaiting_format_assignment'
      ? 'Awaiting format assignment'
      : selectedJob.localState === 'failed_retryable'
        ? 'Needs a retry after a transient failure'
      : selectedJob.localState === 'auth_blocked'
          ? 'Blocked until the account signs in again'
          : selectedJob.localState === 'detected' || selectedJob.localState === 'queued_local'
            ? 'Queued locally and safe to remove before upload starts'
          : selectedJob.localState === 'ignored'
            ? selectedJob.ignoredFromState
              ? `Ignored ${formatQueueStateLabel(selectedJob.ignoredFromState, selectedJob.fileKind).toLowerCase()} row`
              : 'Ignored row'
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
        : ignoredJobs.length > 0
          ? 'ignored'
        : workingJobs.length > 0
          ? 'working'
          : 'done';

    setQueueView(parsedView ?? defaultView);
    setSelectedJobId(selectedJobIdFromQuery);
    setSelectedQueueJobIds(selectedJobIdsFromQuery.length > 0 ? selectedJobIdsFromQuery : selectedJobIdFromQuery ? [selectedJobIdFromQuery] : []);
  }, [ignoredJobs.length, location.search, needsActionJobs.length, sortedJobs, workingJobs.length]);

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

  const selectedJobActionLabel =
    selectedJob?.localState === 'awaiting_format_assignment'
      ? 'Assign format'
      : selectedJob?.localState === 'failed_retryable'
        ? 'Retry now'
        : selectedJob?.localState === 'auth_blocked'
          ? 'Re-authenticate'
          : selectedJob?.localState === 'detected' || selectedJob?.localState === 'queued_local'
            ? 'Dismiss row'
          : selectedJob?.localState === 'ignored'
            ? 'Restore row'
          : 'Inspect row';
  const selectedJobStateColor =
    selectedJob?.localState === 'awaiting_format_assignment'
      ? 'orange'
      : selectedJob?.localState === 'failed_retryable'
        ? 'orange'
        : selectedJob?.localState === 'auth_blocked'
          ? 'red'
          : selectedJob?.localState === 'ignored'
            ? 'gray'
          : selectedJobView === 'done'
            ? 'teal'
            : 'blue';

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Upload Queue</h2>
        <p className="desktop-page-subtitle">Resolve blockers, track active work, and park ignored rows outside the main action lane.</p>
      </div>
      {queueView !== 'needs_action' && queueCounts.needs_action > 0 ? (
        <Alert color="orange" variant="light">
          There are {queueCounts.needs_action} blocked job{queueCounts.needs_action === 1 ? '' : 's'} in Needs Action.
        </Alert>
      ) : null}
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
                <div>
                  <Text fw={700}>{queueWorkspaceViewLabel[queueView]}</Text>
                  <Text size="sm" c="dimmed">
                    {queueWorkspaceViewDetail[queueView]}
                  </Text>
                </div>
                <Group gap="xs" align="center" wrap="wrap">
                  {selectedQueueJobIds.length > 0 ? (
                    <Text size="sm" c="dimmed">
                      {ignorableSelectedJobs.length} of {selectedQueueJobIds.length} selected can be ignored. {dismissibleSelectedJobs.length} can be dismissed.
                    </Text>
                  ) : null}
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
                actions={(job) => {
                  const rowActions = getQueueRowActionKeys(job);
                  return (
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
                    {rowActions.includes('assign') ? (
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
                    {rowActions.includes('retry') ? (
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
                    {rowActions.includes('reauth') && selectedProfile ? (
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
                    {rowActions.includes('ignore') ? (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="gray"
                        onClick={(event) => {
                          event.stopPropagation();
                          void ignoreUploadJob(job.id);
                        }}
                      >
                        Ignore
                      </Button>
                    ) : null}
                    {rowActions.includes('dismissWorking') ? (
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
                    {rowActions.includes('restore') ? (
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
                    {rowActions.includes('dismissDuplicate') ? (
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
                    {rowActions.includes('removeAwaiting') ? (
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
                  );
                }}
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
                  {selectedJob ? selectedJobDetail : 'Select a row to inspect its actions and queue metadata.'}
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
                      <Text fw={600}>Primary action</Text>
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
                        {selectedJobActions.includes('retry') ? (
                          <Button
                            size="xs"
                            color="orange"
                            onClick={() => {
                              void retryUploadJob(selectedJob.id);
                            }}
                          >
                            Retry now
                          </Button>
                        ) : null}
                        {selectedJobActions.includes('reauth') && selectedProfile ? (
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
                        {selectedJobActions.includes('ignore') ? (
                          <Button
                            size="xs"
                            variant="light"
                            color="gray"
                            onClick={() => {
                              void ignoreUploadJob(selectedJob.id);
                            }}
                          >
                            Ignore row
                          </Button>
                        ) : null}
                        {selectedJobActions.includes('restore') ? (
                          <Button
                            size="xs"
                            color="gray"
                            onClick={() => {
                              void restoreIgnoredUploadJob(selectedJob.id);
                            }}
                          >
                            Restore row
                          </Button>
                        ) : null}
                        {selectedJobActions.includes('dismissWorking') ? (
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            onClick={() => {
                              void dismissWorkingUploadJob(selectedJob.id);
                            }}
                          >
                            Dismiss row
                          </Button>
                        ) : null}
                        {selectedJobActions.includes('removeAwaiting') ? (
                          <Button
                            size="xs"
                            color="orange"
                            onClick={() => {
                              void removeAwaitingUploadJob(selectedJob.id);
                            }}
                          >
                            Remove from queue
                          </Button>
                        ) : null}
                        {selectedJobActions.includes('dismissDuplicate') ? (
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
                      <Alert color="orange" title="Retryable failure">
                        {selectedJob.error || 'A transient error paused this upload. Retry from the queue or after the service recovers.'}
                      </Alert>
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
                    {(selectedJob.localState === 'detected' || selectedJob.localState === 'queued_local') && !selectedJob.uploadId ? (
                      <Alert color="blue" title="Local-only queue row">
                        This file has not been uploaded yet. You can ignore it to hide it for now or dismiss it to remove it from the local queue entirely.
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
                              color="orange"
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
