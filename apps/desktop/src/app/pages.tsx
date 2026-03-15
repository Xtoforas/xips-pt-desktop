import { Alert, Badge, Button, Card, Group, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useDesktop } from './DesktopContext';
import {
  FormatRuleTable,
  FormatsTable,
  PreferencesForm,
  QueueTable,
  ServerProfileForm,
  SummaryCard,
  WatchRootForm,
  WatchRootTable
} from './components';

export const OverviewPage = (): JSX.Element => {
  const {
    snapshot,
    selectedProfile,
    health,
    cards,
    cardSource,
    myAggCards,
    myAggTeams,
    refreshFormats,
    refreshCards,
    refreshMyAgg,
    scanWatchRoots
  } = useDesktop();
  const isAuthenticated = snapshot.authUser !== null && snapshot.authProfileId === snapshot.selectedProfileId;
  const selectedFormatId = snapshot.cachedFormats[0]?.id ?? '';
  const completedCount = useMemo(
    () => snapshot.uploadJobs.filter((job) => job.localState === 'complete').length,
    [snapshot.uploadJobs]
  );
  const pendingCount = useMemo(
    () => snapshot.uploadJobs.filter((job) => job.localState !== 'complete').length,
    [snapshot.uploadJobs]
  );

  useEffect(() => {
    if (!selectedProfile || !isAuthenticated) {
      return;
    }
    void refreshMyAgg(selectedProfile.id);
    void refreshCards(selectedFormatId);
  }, [isAuthenticated, refreshCards, refreshMyAgg, selectedFormatId, selectedProfile]);

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Overview</h2>
        <p className="desktop-page-subtitle">Desktop upload mission control aligned with the xips-pt website shell.</p>
      </div>
      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }}>
        <SummaryCard label="Server" value={selectedProfile?.name ?? 'None'} detail={selectedProfile?.baseUrl ?? 'No server selected'} />
        <SummaryCard label="Watch folders" value={String(snapshot.watchRoots.length)} detail="Configured folder monitors" />
        <SummaryCard label="Pending uploads" value={String(pendingCount)} detail="Local queue work not yet complete" />
        <SummaryCard label="Completed" value={String(completedCount)} detail="Finished uploads in local history" />
        <SummaryCard label="Cards" value={String(cards.length)} detail={`Source: ${cardSource ?? 'unknown'}`} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Auth and server</Text>
            <Text size="sm" c="dimmed">
              Current server health and identity state.
            </Text>
            <Group>
              <Alert color={health?.ok ? 'teal' : 'gray'} title="Health">
                {health?.ok ? 'Server reachable' : 'Run health check from the top bar.'}
              </Alert>
            </Group>
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
              <Button size="xs" variant="light" disabled={!selectedProfile || !isAuthenticated} onClick={() => void refreshCards(selectedFormatId)}>
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
      </SimpleGrid>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Recent upload queue</Text>
          <QueueTable jobs={snapshot.uploadJobs.slice(0, 8)} />
        </Stack>
      </Card>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Awaiting format assignment</Text>
          {snapshot.detectedFiles.filter((file) => file.localState === 'awaiting_format_assignment').length === 0 ? (
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
                    .filter((file) => file.localState === 'awaiting_format_assignment')
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
    </Stack>
  );
};

export const UploadQueuePage = (): JSX.Element => {
  const { snapshot, assignDetectedFileFormat } = useDesktop();
  const [filter, setFilter] = useState<'all' | 'awaiting' | 'queued' | 'complete'>('all');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedFormatId, setSelectedFormatId] = useState('');

  const filteredJobs = useMemo(() => {
    switch (filter) {
      case 'awaiting':
        return snapshot.uploadJobs.filter((job) => job.localState === 'awaiting_format_assignment');
      case 'queued':
        return snapshot.uploadJobs.filter((job) => job.localState !== 'complete');
      case 'complete':
        return snapshot.uploadJobs.filter((job) => job.localState === 'complete');
      default:
        return snapshot.uploadJobs;
    }
  }, [filter, snapshot.uploadJobs]);

  const selectedJob = useMemo(
    () => filteredJobs.find((job) => job.id === selectedJobId) ?? snapshot.uploadJobs.find((job) => job.id === selectedJobId) ?? null,
    [filteredJobs, selectedJobId, snapshot.uploadJobs]
  );

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
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Queue</Text>
            <QueueTable
              jobs={filteredJobs}
              selectedJobId={selectedJobId}
              onSelect={(job) => {
                setSelectedJobId(job.id);
              }}
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
                      <tr><th>Path</th><td className="desktop-mono">{selectedJob.path}</td></tr>
                      <tr><th>Kind</th><td>{selectedJob.fileKind}</td></tr>
                      <tr><th>Format</th><td>{selectedJob.formatId || '-'}</td></tr>
                      <tr><th>Local state</th><td>{selectedJob.localState}</td></tr>
                      <tr><th>Server lifecycle</th><td>{selectedJob.lifecyclePhase ?? '-'}</td></tr>
                      <tr><th>Checksum</th><td className="desktop-mono">{selectedJob.checksum}</td></tr>
                      <tr><th>Upload ID</th><td className="desktop-mono">{selectedJob.uploadId || '-'}</td></tr>
                      <tr><th>Retries</th><td>{selectedJob.retries}</td></tr>
                      <tr><th>Error</th><td>{selectedJob.error || '-'}</td></tr>
                      <tr><th>Updated</th><td>{new Date(selectedJob.updatedAt).toLocaleString()}</td></tr>
                    </tbody>
                  </table>
                </div>
                {selectedJob.localState === 'awaiting_format_assignment' && selectedJob.fileKind === 'stats_export' ? (
                  <Card withBorder className="desktop-subcard">
                    <Stack gap="sm">
                      <Text fw={600}>Assign tournament format</Text>
                      <select value={selectedFormatId} onChange={(event) => setSelectedFormatId(event.currentTarget.value)}>
                        <option value="">Choose a format</option>
                        {snapshot.cachedFormats.map((format) => (
                          <option key={format.id} value={format.id}>
                            {format.name}
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
      </SimpleGrid>
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
                  {format.name}
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
              label: format.name
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
  const [sortKey, setSortKey] = useState<'updated' | 'filename' | 'retries'>('updated');

  const rows = useMemo(() => {
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
  }, [fileKindFilter, formatFilter, lifecycleFilter, snapshot.uploadJobs, sortKey]);

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
            { value: 'card_catalog', label: 'Card catalogs' }
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
                    <td>{job.fileKind}</td>
                    <td>{job.formatId || '-'}</td>
                    <td>{job.lifecyclePhase ?? '-'}</td>
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
  const { snapshot } = useDesktop();

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Diagnostics</h2>
        <p className="desktop-page-subtitle">Request state, auth state, queue metadata, and recent events.</p>
      </div>
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
  const { snapshot, deleteServerProfile, updatePreferences } = useDesktop();

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
          <Text fw={700}>Saved server profiles</Text>
          {snapshot.profiles.length === 0 ? (
            <Alert color="gray">No server profiles configured.</Alert>
          ) : (
            snapshot.profiles.map((profile) => (
              <Card key={profile.id} withBorder className="desktop-subcard">
                <Group justify="space-between">
                  <div>
                    <Text fw={600}>{profile.name}</Text>
                    <Text size="sm" c="dimmed" className="desktop-mono">
                      {profile.baseUrl}
                    </Text>
                  </div>
                  <Button size="xs" color="red" variant="light" onClick={() => void deleteServerProfile(profile.id)}>
                    Remove
                  </Button>
                </Group>
              </Card>
            ))
          )}
        </Stack>
      </Card>
    </Stack>
  );
};
