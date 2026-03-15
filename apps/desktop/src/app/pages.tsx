import { Alert, Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useMemo } from 'react';
import { useDesktop } from './DesktopContext';
import {
  FormatsTable,
  QueueTable,
  ServerProfileForm,
  SummaryCard,
  WatchRootForm,
  WatchRootTable
} from './components';

export const OverviewPage = (): JSX.Element => {
  const { snapshot, selectedProfile, health, refreshFormats } = useDesktop();
  const completedCount = useMemo(
    () => snapshot.uploadJobs.filter((job) => job.localState === 'complete').length,
    [snapshot.uploadJobs]
  );
  const pendingCount = useMemo(
    () => snapshot.uploadJobs.filter((job) => job.localState !== 'complete').length,
    [snapshot.uploadJobs]
  );

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
            <Text size="sm">Signed in user: {snapshot.authUser?.displayName ?? 'Not signed in'}</Text>
            <Text size="sm">Token expiry: {snapshot.tokenExpiresAt || 'No token issued'}</Text>
          </Stack>
        </Card>
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Format cache</Text>
            <Text size="sm" c="dimmed">
              Cached tournament formats used for folder rules and upload assignment.
            </Text>
            <Text size="sm">Cached rows: {snapshot.cachedFormats.length}</Text>
            <Group>
              <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void refreshFormats()}>
                Refresh formats
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
    </Stack>
  );
};

export const UploadQueuePage = (): JSX.Element => {
  const { snapshot } = useDesktop();

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Upload Queue</h2>
        <p className="desktop-page-subtitle">Dense operational queue with local and server lifecycle state.</p>
      </div>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Queue</Text>
          <QueueTable jobs={snapshot.uploadJobs} />
        </Stack>
      </Card>
    </Stack>
  );
};

export const WatchFoldersPage = (): JSX.Element => {
  const { snapshot, deleteWatchRoot, toggleWatchRoot } = useDesktop();

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
            <Text fw={700}>Folder rules</Text>
            <Text size="sm" c="dimmed">
              Folder-to-format and filename rules will be layered on top of these watch roots.
            </Text>
          </Stack>
        </Card>
      </SimpleGrid>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Watched directories</Text>
          <WatchRootTable watchRoots={snapshot.watchRoots} onToggle={toggleWatchRoot} onDelete={deleteWatchRoot} />
        </Stack>
      </Card>
    </Stack>
  );
};

export const FormatsPage = (): JSX.Element => {
  const { snapshot, selectedProfile, refreshFormats } = useDesktop();

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
        <FormatsTable formats={snapshot.cachedFormats} />
      </Card>
    </Stack>
  );
};

export const HistoryPage = (): JSX.Element => {
  const { snapshot } = useDesktop();
  const rows = useMemo(() => snapshot.uploadJobs.filter((job) => job.localState === 'complete'), [snapshot.uploadJobs]);

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">History</h2>
        <p className="desktop-page-subtitle">Completed uploads and terminal rows from the local desktop history.</p>
      </div>
      <Card withBorder className="desktop-card">
        <QueueTable jobs={rows} />
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
  const { snapshot, deleteServerProfile } = useDesktop();

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Settings</h2>
        <p className="desktop-page-subtitle">Server profiles and desktop behavior configuration.</p>
      </div>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <ServerProfileForm />
        <Card withBorder className="desktop-card">
          <Stack gap="sm">
            <Text fw={700}>Desktop behavior</Text>
            <Text size="sm" c="dimmed">
              Launch-at-login, background behavior, polling cadence, and diagnostics retention will live here.
            </Text>
          </Stack>
        </Card>
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
