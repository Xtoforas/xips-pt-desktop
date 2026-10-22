import { Alert, Badge, Button, Card, Group, SegmentedControl, SimpleGrid, Stack, Text } from '@mantine/core';
import type { LocalDiagnosticEvent } from '@xips/api-contract';
import { useMemo, useState } from 'react';
import { useDesktop } from '../DesktopContext';
import { PageHeader, SiteTable } from '../components';
import { isSignedInToSelectedServer, serverHostLabel } from '../onboarding';
import { COMPACT_TIMESTAMP } from '../queue-model';

const EVENT_ROW_LIMIT = 50;

type EventFilter = 'all' | 'errors' | 'api';

const eventLevelColor: Record<LocalDiagnosticEvent['level'], string> = {
  info: 'gray',
  warn: 'yellow',
  error: 'red'
};

// Label/value cells in the site's admin metric grid.
const MetricGrid = ({ title, items }: { title: string; items: Array<[string, string]> }): JSX.Element => (
  <Stack gap={6}>
    <Text size="xs" fw={700} className="desktop-micro-label">
      {title}
    </Text>
    <div className="admin-metric-grid">
      {items.map(([label, value]) => (
        <div key={label} className="admin-metric-cell">
          <Text className="admin-metric-cell__label" size="xs" c="dimmed" truncate="end" title={label}>
            {label}
          </Text>
          <Text className="admin-metric-cell__value" size="sm" fw={600}>
            {value}
          </Text>
        </div>
      ))}
    </div>
  </Stack>
);

export const DiagnosticsPage = (): JSX.Element => {
  const { health, connection, refreshHealth, selectedProfile, snapshot, exportDiagnosticsBundle, openAppDataDirectory } = useDesktop();
  const [lastExportPath, setLastExportPath] = useState('');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const events = useMemo(
    () =>
      snapshot.diagnostics
        .filter((event) => (eventFilter === 'errors' ? event.level === 'error' : eventFilter === 'api' ? event.category === 'api' : true))
        .slice(0, EVENT_ROW_LIMIT),
    [eventFilter, snapshot.diagnostics]
  );
  const countJobs = (states: string[]): string =>
    String(snapshot.uploadJobs.filter((job) => states.includes(job.localState)).length);
  const signedIn = isSignedInToSelectedServer(snapshot);

  // Server counts cover everyone's uploads on that server; the local counts are this computer's queue.
  const serverItems: Array<[string, string]> = [
    ['Server', selectedProfile ? (selectedProfile.isDefault ? 'XiPS' : serverHostLabel(selectedProfile.baseUrl)) : 'None'],
    ['Connection', connection === 'connected' ? 'Connected' : connection === 'checking' ? 'Checking…' : "Can't reach"],
    ['Signed in as', signedIn ? snapshot.authUser?.displayName ?? '-' : 'Not signed in'],
    ['Sign-in expires', signedIn && snapshot.tokenExpiresAt ? new Date(snapshot.tokenExpiresAt).toLocaleString(undefined, COMPACT_TIMESTAMP) : '-'],
    ['Server queue (all users)', String(health?.queueDepth ?? '-')],
    ['Server failures (all users)', String(health?.failedJobs ?? '-')]
  ];
  const localItems: Array<[string, string]> = [
    ['Uploads in queue', String(snapshot.uploadJobs.length)],
    ['Uploading now', String(snapshot.uploadJobs.filter((job) => job.uploadId && job.localState !== 'complete').length)],
    ['Waiting to retry', countJobs(['failed_retryable'])],
    ['Need sign-in', countJobs(['auth_blocked'])],
    ['Files detected', String(snapshot.detectedFiles.length)],
    ['Watched folders', String(snapshot.watchRoots.length)],
    ['Formats loaded', String(snapshot.cachedFormats.length)],
    ['Upload attempts', snapshot.uploadAttempts.length.toLocaleString()]
  ];

  return (
    <Stack gap="lg">
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
      <Card withBorder className="desktop-card">
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          <MetricGrid title="Server" items={serverItems} />
          <MetricGrid title="This computer" items={localItems} />
        </SimpleGrid>
      </Card>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="wrap">
            <Text fw={700}>Recent events</Text>
            <SegmentedControl
              size="xs"
              value={eventFilter}
              onChange={(value) => setEventFilter(value as EventFilter)}
              data={[
                { value: 'all', label: 'All' },
                { value: 'errors', label: 'Errors' },
                { value: 'api', label: 'API requests' }
              ]}
            />
          </Group>
          {events.length === 0 ? (
            <Text size="sm" c="dimmed">
              No events recorded yet.
            </Text>
          ) : (
            <SiteTable className="desktop-fixed-table">
              <colgroup>
                <col className="desktop-col-date" />
                <col className="desktop-col-state" />
                <col className="desktop-col-subfolders" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Level</th>
                  <th>Area</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="landing-row">
                    <td className="landing-cell admin-nowrap" title={new Date(event.createdAt).toLocaleString()}>
                      {new Date(event.createdAt).toLocaleString(undefined, COMPACT_TIMESTAMP)}
                    </td>
                    <td className="landing-cell admin-nowrap">
                      <Badge color={eventLevelColor[event.level]} variant="light">
                        {event.level}
                      </Badge>
                    </td>
                    <td className="landing-cell">{event.category}</td>
                    <td className="landing-cell" title={event.detail ? `${event.message}\n${event.detail}` : event.message}>
                      {event.message}
                      {event.detail ? (
                        <Text span size="xs" c="dimmed" className="admin-mono">
                          {' '}
                          {event.detail}
                        </Text>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </SiteTable>
          )}
        </Stack>
      </Card>
    </Stack>
  );
};
