import { Alert, Button, Card, Group, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useDesktop } from '../DesktopContext';
import { PageHeader } from '../components';

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
      <PageHeader
        title="Diagnostics"
        actions={
          <>
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
          </>
        }
      />
      {lastExportPath ? (
        <Alert color="teal" title="Export ready">
          <span className="desktop-mono">{lastExportPath}</span>
        </Alert>
      ) : null}
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
            <Table.ScrollContainer minWidth={480} type="native">
              <Table withTableBorder withColumnBorders highlightOnHover striped="odd">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Path</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Updated</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {snapshot.watchRoots.map((root) => (
                    <Table.Tr key={root.id}>
                      <Table.Td className="desktop-mono">{root.path}</Table.Td>
                      <Table.Td>{root.paused ? 'Paused' : 'Active'}</Table.Td>
                      <Table.Td>{new Date(root.updatedAt).toLocaleString()}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
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
              <Table.ScrollContainer minWidth={480} type="native">
                <Table withTableBorder withColumnBorders highlightOnHover striped="odd">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>When</Table.Th>
                      <Table.Th>Message</Table.Th>
                      <Table.Th>Detail</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {recentApiEvents.map((event) => (
                      <Table.Tr key={event.id}>
                        <Table.Td>{new Date(event.createdAt).toLocaleString()}</Table.Td>
                        <Table.Td>{event.message}</Table.Td>
                        <Table.Td className="desktop-mono">{event.detail}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
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
