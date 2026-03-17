import { Alert, Badge, Button, Card, Group, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useDesktop } from './DesktopContext';
import {
  FormatRuleTable,
  FormatsTable,
  formatFileKindLabel,
  formatLifecycleLabel,
  formatLocalPresenceLabel,
  formatQueueStateLabel,
  PreferencesForm,
  QueueTable,
  ServerProfileForm,
  SummaryCard,
  WatchRootForm,
  WatchRootTable
} from './components';

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

export const OverviewPage = (): JSX.Element => {
  const { snapshot, selectedProfile, cards, cardSource } = useDesktop();
  const completedCount = useMemo(
    () => snapshot.uploadJobs.filter((job) => job.localState === 'complete').length,
    [snapshot.uploadJobs]
  );
  const pendingCount = useMemo(
    () =>
      snapshot.uploadJobs.filter(
        (job) =>
          !['complete', 'duplicate_skipped_local', 'failed_terminal'].includes(job.localState) &&
          (job.localPresence === 'present' || Boolean(job.uploadId))
      ).length,
    [snapshot.uploadJobs]
  );
  const recentActivity = useMemo(
    () =>
      [...snapshot.uploadJobs]
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
        .slice(0, 8),
    [snapshot.uploadJobs]
  );
  const formatSummary = useMemo(() => {
    const counts = new Map<string, number>();
    snapshot.uploadJobs.forEach((job) => {
      const key = job.formatId || 'Unassigned';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6);
  }, [snapshot.uploadJobs]);

  return (
    <Stack gap="md">
      <div>
        <h2 className="desktop-page-title">Overview</h2>
      </div>
      <Stack gap="md">
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Recent upload queue</Text>
            <QueueTable jobs={snapshot.uploadJobs.slice(0, 5)} />
          </Stack>
        </Card>
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Awaiting format assignment</Text>
            {snapshot.detectedFiles.filter((file) => file.localPresence === 'present' && file.localState === 'awaiting_format_assignment').length === 0 ? (
              <Alert color="gray">No scanned files are waiting for format assignment.</Alert>
            ) : (
              <div className="desktop-table-wrap">
                <table className="desktop-table">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Kind</th>
                      <th>Checksum</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.detectedFiles
                      .filter((file) => file.localPresence === 'present' && file.localState === 'awaiting_format_assignment')
                      .slice(0, 5)
                      .map((file) => (
                        <tr key={file.id}>
                          <td>{file.filename}</td>
                          <td>{file.fileKind}</td>
                          <td className="desktop-mono">{file.checksum.slice(0, 16)}...</td>
                          <td>{file.localState}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Stack>
        </Card>
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Recent activity</Text>
            {recentActivity.length === 0 ? (
              <Alert color="gray">No upload activity recorded yet.</Alert>
            ) : (
              <div className="desktop-table-wrap">
                <table className="desktop-table">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Format</th>
                      <th>State</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActivity.slice(0, 4).map((job) => (
                      <tr key={job.id}>
                        <td>{job.filename}</td>
                        <td>{job.formatId || 'Unassigned'}</td>
                        <td>{formatLifecycleLabel(job.lifecyclePhase, job.fileKind)}</td>
                        <td>{new Date(job.updatedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Stack>
        </Card>
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Format activity</Text>
            {formatSummary.length === 0 ? (
              <Alert color="gray">No format-linked uploads yet.</Alert>
            ) : (
              <div className="desktop-table-wrap">
                <table className="desktop-table">
                  <thead>
                    <tr>
                      <th>Format</th>
                      <th>Uploads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formatSummary.map(([formatId, count]) => (
                      <tr key={formatId}>
                        <td>{formatId}</td>
                        <td>{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Stack>
        </Card>
      </Stack>
      <SimpleGrid cols={{ base: 1, md: 2, xl: 5 }}>
        <SummaryCard label="Server" value={selectedProfile?.name ?? 'None'} detail={selectedProfile?.baseUrl ?? 'No server selected'} />
        <SummaryCard label="Watch folders" value={String(snapshot.watchRoots.length)} detail="Configured folder monitors" />
        <SummaryCard label="Pending uploads" value={String(pendingCount)} detail="Local queue work not yet complete" />
        <SummaryCard label="Completed" value={String(completedCount)} detail="Finished uploads in local history" />
        <SummaryCard label="Cards" value={String(cards.length)} detail={`Source: ${cardSource ?? 'unknown'}`} />
      </SimpleGrid>
    </Stack>
  );
};

export const UploadQueuePage = (): JSX.Element => {
  const {
    snapshot,
    selectedProfile,
    assignDetectedFileFormat,
    assignDetectedFileTournament,
    retryUploadJob,
    dismissDuplicateUploadJob,
    openUploadFileLocation,
    openAuthWindow
  } = useDesktop();
  const [filter, setFilter] = useState<'all' | 'awaiting' | 'queued' | 'complete'>('all');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [selectedTournamentId, setSelectedTournamentId] = useState('');

  const filteredJobs = useMemo(() => {
    switch (filter) {
      case 'awaiting':
        return snapshot.uploadJobs.filter((job) => job.localPresence === 'present' && job.localState === 'awaiting_format_assignment');
      case 'queued':
        return snapshot.uploadJobs.filter(
          (job) =>
            !['complete', 'duplicate_skipped_local', 'failed_terminal'].includes(job.localState) &&
            (job.localPresence === 'present' || Boolean(job.uploadId))
        );
      case 'complete':
        return snapshot.uploadJobs.filter((job) => ['complete', 'duplicate_skipped_local', 'failed_terminal'].includes(job.localState));
      default:
        return snapshot.uploadJobs;
    }
  }, [filter, snapshot.uploadJobs]);

  const selectedJob = useMemo(
    () => filteredJobs.find((job) => job.id === selectedJobId) ?? snapshot.uploadJobs.find((job) => job.id === selectedJobId) ?? null,
    [filteredJobs, selectedJobId, snapshot.uploadJobs]
  );

  const selectedAttempts = useMemo(
    () => snapshot.uploadAttempts.filter((attempt) => attempt.uploadJobId === selectedJobId),
    [selectedJobId, snapshot.uploadAttempts]
  );
  const selectedJobFormat = useMemo(
    () => snapshot.cachedFormats.find((format) => format.id === selectedJob?.formatId) ?? null,
    [selectedJob?.formatId, snapshot.cachedFormats]
  );
  const tournamentFormatMatches = useMemo(() => {
    const normalizedTournamentId = selectedTournamentId.trim();
    if (normalizedTournamentId.length < 5 || normalizedTournamentId.length > 7) {
      return [];
    }
    return snapshot.cachedFormats.filter(
      (format) =>
        format.tournamentIdPrefix.length > 0 &&
        normalizedTournamentId.length === format.tournamentIdPrefix.length + 4 &&
        normalizedTournamentId.startsWith(format.tournamentIdPrefix)
    );
  }, [selectedTournamentId, snapshot.cachedFormats]);
  const matchedTournamentFormat = tournamentFormatMatches.length === 1 ? tournamentFormatMatches[0] : null;
  const tournamentAssignmentError =
    selectedTournamentId.trim().length === 0
      ? ''
      : tournamentFormatMatches.length === 0
        ? 'No cached tournament format matches that 5 to 7 digit tournament ID.'
        : tournamentFormatMatches.length > 1
          ? 'More than one cached format shares that tournament ID prefix. Refresh formats or assign by format instead.'
          : '';

  useEffect(() => {
    setSelectedTournamentId('');
    setSelectedFormatId('');
  }, [selectedJobId]);

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Upload Queue</h2>
        <p className="desktop-page-subtitle">Dense operational queue with local and server lifecycle state.</p>
      </div>
      <Group gap="xs">
        <Button size="xs" variant={filter === 'all' ? 'filled' : 'light'} onClick={() => setFilter('all')}>
          All
        </Button>
        <Button size="xs" variant={filter === 'awaiting' ? 'filled' : 'light'} onClick={() => setFilter('awaiting')}>
          Awaiting format
        </Button>
        <Button size="xs" variant={filter === 'queued' ? 'filled' : 'light'} onClick={() => setFilter('queued')}>
          Active
        </Button>
        <Button size="xs" variant={filter === 'complete' ? 'filled' : 'light'} onClick={() => setFilter('complete')}>
          Complete
        </Button>
      </Group>
      <Stack gap="lg">
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Queue</Text>
            <QueueTable
              jobs={filteredJobs}
              selectedJobId={selectedJobId}
              onSelect={(job) => {
                setSelectedJobId(job.id);
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
                  {job.localState === 'failed_retryable' ? (
                    <Button
                      size="compact-xs"
                      variant="subtle"
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
                      variant="subtle"
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
                </Group>
              )}
            />
          </Stack>
        </Card>
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Selected job detail</Text>
            {!selectedJob ? (
              <Alert color="gray">Select a queue row to inspect its file path, checksum, and lifecycle details.</Alert>
            ) : (
              <>
                <div className="desktop-table-wrap">
                  <table className="desktop-table">
                    <tbody>
                      <tr><th>File</th><td>{selectedJob.filename}</td></tr>
                      <tr><th>Local job ID</th><td><TechnicalValue value={selectedJob.id} /></td></tr>
                      <tr><th>Path</th><td className="desktop-mono">{selectedJob.path}</td></tr>
                      <tr><th>Staged path</th><td className="desktop-mono">{selectedJob.stagedPath || '-'}</td></tr>
                      <tr><th>Kind</th><td>{formatFileKindLabel(selectedJob.fileKind)}</td></tr>
                      <tr><th>Local file</th><td>{formatLocalPresenceLabel(selectedJob.localPresence)}</td></tr>
                      <tr><th>Format</th><td>{selectedJobFormat ? `${selectedJobFormat.name} (${selectedJob.formatId})` : selectedJob.formatId || '-'}</td></tr>
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
                      <tr><th>Updated</th><td>{new Date(selectedJob.updatedAt).toLocaleString()}</td></tr>
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
                {selectedJob.localPresence === 'present' && selectedJob.localState === 'awaiting_format_assignment' && selectedJob.fileKind === 'stats_export' ? (
                  <Card withBorder className="desktop-subcard">
                    <Stack gap="sm">
                      <Text fw={600}>Assign tournament export</Text>
                      <TextInput
                        label="Tournament ID"
                        description="Enter the full 5 to 7 digit tournament ID. The desktop app will map it to the matching format prefix automatically."
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
                        </Alert>
                      ) : tournamentAssignmentError ? (
                        <Alert color="yellow">{tournamentAssignmentError}</Alert>
                      ) : null}
                      <Group justify="flex-end">
                        <Button
                          size="xs"
                          disabled={!matchedTournamentFormat || selectedTournamentId.trim().length < 5}
                          onClick={() => {
                            const detectedFile = snapshot.detectedFiles.find((file) => file.path === selectedJob.path) ?? null;
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
                        {snapshot.cachedFormats.map((format) => (
                          <option key={format.id} value={format.id}>
                            {format.tournamentIdPrefix ? `${format.name} (${format.tournamentIdPrefix}xxxx)` : format.name}
                          </option>
                        ))}
                      </select>
                      <Group justify="flex-end">
                        <Button
                          size="xs"
                          disabled={!selectedFormatId}
                          onClick={() => {
                            const detectedFile = snapshot.detectedFiles.find((file) => file.path === selectedJob.path) ?? null;
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
              </>
            )}
          </Stack>
        </Card>
      </Stack>
    </Stack>
  );
};

export const WatchFoldersPage = (): JSX.Element => {
  const { snapshot, deleteFormatRule, deleteWatchRoot, saveFormatRule, scanWatchRoots, toggleWatchRoot } = useDesktop();
  const [selectedWatchRootId, setSelectedWatchRootId] = useState('');
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [pattern, setPattern] = useState('');

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Watch Folders</h2>
        <p className="desktop-page-subtitle">Configure the CSV folders that the desktop app watches in the background.</p>
      </div>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <WatchRootForm />
        <Card withBorder className="desktop-card">
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
                  <Text size="sm" c="dimmed">Mode: {selectedFormat.mode || '-'}</Text>
                  <Text size="sm" c="dimmed">Run environment: {selectedFormat.runEnvironment || '-'}</Text>
                  <Text size="sm" c="dimmed">Park: {selectedFormat.parkKey || '-'}</Text>
                  <Text size="sm" c="dimmed">Cap: {selectedFormat.capValue || '-'}</Text>
                </Stack>
              </Card>
              <Card withBorder className="desktop-subcard">
                <Stack gap={4}>
                  <Text size="sm">OVR restrictions: {selectedFormat.ovrRestrictions.join(', ') || '-'}</Text>
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
                    <td>{job.formatId || '-'}</td>
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
        <p className="desktop-page-subtitle">Request state, auth state, queue metadata, and recent events.</p>
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
                Open logs folder
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
    selectServerProfile,
    updatePreferences
  } = useDesktop();
  const isAuthenticated = snapshot.authUser !== null && snapshot.authProfileId === snapshot.selectedProfileId;

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Settings</h2>
        <p className="desktop-page-subtitle">Server profiles and desktop behavior configuration.</p>
      </div>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <ServerProfileForm />
        <PreferencesForm preferences={snapshot.preferences} onSave={updatePreferences} />
      </SimpleGrid>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Auth and server</Text>
          <Text size="sm" c="dimmed">
            Current server health and signed-in desktop identity state.
          </Text>
          <Group>
            <Alert color={health?.ok ? 'teal' : 'gray'} title="Health">
              {health?.ok ? 'Server reachable' : 'Server not checked yet.'}
            </Alert>
          </Group>
          <Text size="sm">Selected server: {selectedProfile?.name ?? 'No server selected'}</Text>
          <Text size="sm">Signed in user: {isAuthenticated ? snapshot.authUser?.displayName : 'Not signed in'}</Text>
          <Text size="sm">Token expiry: {isAuthenticated ? snapshot.tokenExpiresAt : 'No token issued'}</Text>
          <Text size="sm">Detected files: {snapshot.detectedFiles.length}</Text>
        </Stack>
      </Card>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Cards and personal aggregate</Text>
          <Text size="sm" c="dimmed">
            Desktop view of your current card source and private aggregate rows.
          </Text>
          <Group>
            <Badge color={cardSource === 'user' ? 'teal' : 'blue'} variant="light">
              {cardSource === 'user' ? 'Using your card list' : 'Using shared fallback'}
            </Badge>
            <Badge color="orange" variant="light">
              Card rows {cards.length}
            </Badge>
            <Badge color="cyan" variant="light">
              My agg cards {myAggCards.length}
            </Badge>
            <Badge color="grape" variant="light">
              My agg teams {myAggTeams.length}
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
              Refresh my agg
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
