import { Alert, Badge, Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useDesktop } from '../DesktopContext';

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
    <Stack gap="lg" className="desktop-support-page">
      <div>
        <h2 className="desktop-page-title">Diagnostics</h2>
        <p className="desktop-page-subtitle">Support-only tooling for exports, app data, and deeper troubleshooting.</p>
      </div>
      <Card withBorder className="desktop-card desktop-support-hero">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text className="desktop-micro-label">Support view</Text>
              <Text fw={700}>Keep this page for investigation and handoff work</Text>
              <Text size="sm" c="dimmed">
                Normal workflow belongs on Today, Queue, and Automation. Diagnostics keeps the deeper traces and local files you need when something goes wrong.
              </Text>
            </div>
            <Group gap="xs" wrap="wrap">
              <Badge color="gray" variant="light">
                Support only
              </Badge>
              <Badge color="blue" variant="light">
                {snapshot.diagnostics.length} events
              </Badge>
            </Group>
          </Group>
          <Group gap="xs" wrap="wrap">
            <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void refreshHealth()}>
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
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <Card withBorder className="desktop-card desktop-support-card">
          <Stack gap="sm">
            <Text fw={700}>Connection snapshot</Text>
            <Text size="sm" c="dimmed">
              Current server health, signed-in identity, and the most relevant operational counts.
            </Text>
            <Text size="sm">Selected profile: {snapshot.selectedProfileId || 'None'}</Text>
            <Text size="sm">Authenticated profile: {snapshot.authProfileId || 'None'}</Text>
            <Text size="sm">User: {snapshot.authUser?.displayName ?? 'Not signed in'}</Text>
            <Text size="sm">Token expiry: {snapshot.tokenExpiresAt || 'No token issued'}</Text>
            <Text size="sm">Health status: {health?.ok ? 'Reachable' : 'Unknown'}</Text>
            <Text size="sm">Queue depth: {health?.queueDepth ?? 0}</Text>
            <Text size="sm">Failed jobs: {health?.failedJobs ?? 0}</Text>
            <Text size="sm">Watch roots: {snapshot.watchRoots.length}</Text>
            <Text size="sm">Cached formats: {snapshot.cachedFormats.length}</Text>
          </Stack>
        </Card>
        <Card withBorder className="desktop-card desktop-support-card">
          <Stack gap="sm">
            <Text fw={700}>Queue inspector</Text>
            <Text size="sm" c="dimmed">
              Quick counters for the queue, failures, and background activity.
            </Text>
            <Text size="sm">Detected files: {snapshot.detectedFiles.length}</Text>
            <Text size="sm">Upload jobs: {snapshot.uploadJobs.length}</Text>
            <Text size="sm">Active uploads: {snapshot.uploadJobs.filter((job) => job.uploadId && job.localState !== 'complete').length}</Text>
            <Text size="sm">Retryable failures: {snapshot.uploadJobs.filter((job) => job.localState === 'failed_retryable').length}</Text>
            <Text size="sm">Auth blocked: {snapshot.uploadJobs.filter((job) => job.localState === 'auth_blocked').length}</Text>
            <Text size="sm">Recorded attempts: {snapshot.uploadAttempts.length}</Text>
          </Stack>
        </Card>
      </SimpleGrid>
      <Card withBorder className="desktop-card desktop-support-card">
        <Stack gap="sm">
          <Text fw={700}>Watch roots</Text>
          <Text size="sm" c="dimmed">
            These are the background folders the app is monitoring. Automation owns the rescans, but diagnostics keeps the live inventory visible.
          </Text>
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
        <Card withBorder className="desktop-card desktop-support-card">
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
        <Card withBorder className="desktop-card desktop-support-card">
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
      <Card withBorder className="desktop-card desktop-support-card">
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
