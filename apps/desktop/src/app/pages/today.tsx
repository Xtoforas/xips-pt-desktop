import { Alert, Badge, Button, Card, Group, Stack, Table, Text, Title } from '@mantine/core';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDesktop } from '../DesktopContext';
import { buildOnboardingSteps, ReadinessCard } from '../components';
import {
  blockerPriority,
  formatFileKindLabel,
  formatLifecycleLabel,
  formatQueueStateLabel,
  formatUploadJobModifiedAt,
  getUploadJobModifiedAt,
  queueLinkForJob,
  summarizeBlockedJob,
  uploadJobFolderName,
  uploadJobNeedsAttention,
  uploadJobWaitingOnServer,
  uploadJobWorkingAutomatically,
  type TodayBlockerState
} from '../queue-model';

const BLOCKER_ROW_LIMIT = 15;

export const TodayPage = (): JSX.Element => {
  const { snapshot, selectedProfile, health, authFlowState, updatePreferences } = useDesktop();
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
  // Blocked files waiting on the user come first, then ones the app will retry; similar reasons sit together.
  const blockerRows = useMemo(
    () =>
      snapshot.uploadJobs
        .filter((job) => uploadJobNeedsAttention(job))
        .map((job) => ({ job, summary: summarizeBlockedJob(job, snapshot.cachedFormats) }))
        .sort((left, right) => {
          if (left.summary.owner !== right.summary.owner) {
            return left.summary.owner === 'user' ? -1 : 1;
          }
          const leftPriority = blockerPriority[left.job.localState as TodayBlockerState] ?? 99;
          const rightPriority = blockerPriority[right.job.localState as TodayBlockerState] ?? 99;
          if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
          }
          const byReason = left.summary.reason.localeCompare(right.summary.reason);
          if (byReason !== 0) {
            return byReason;
          }
          return (getUploadJobModifiedAt(right.job) ?? 0) - (getUploadJobModifiedAt(left.job) ?? 0);
        }),
    [snapshot.cachedFormats, snapshot.uploadJobs]
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
  const inProgressJobs = useMemo(
    () =>
      [...activeMachineJobs, ...serverProgressJobs].sort(
        (left, right) => (getUploadJobModifiedAt(right) ?? 0) - (getUploadJobModifiedAt(left) ?? 0)
      ),
    [activeMachineJobs, serverProgressJobs]
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
      <Stack gap={4}>
        <Title order={2}>Today</Title>
        <Text c="dimmed">
          Files that need your input, and what&apos;s uploading right now.
          {selectedProfile ? (
            <>
              {' '}Watched folders are uploaded to <span className="desktop-mono">{selectedProfile.baseUrl}</span> automatically.
            </>
          ) : null}
        </Text>
      </Stack>
      <ReadinessCard
        onboardingSteps={readinessItems}
        nextStep={nextStep}
        selectedProfileName={selectedProfile ? `${selectedProfile.name} is active.` : 'No server profile selected yet.'}
        dismissCompletedReadinessCard={snapshot.preferences.dismissCompletedReadinessCard}
        onDismissCompletedReadinessCard={(dismissed) => {
          void updatePreferences({
            ...snapshot.preferences,
            dismissCompletedReadinessCard: dismissed
          });
        }}
        onDismissAutomationReminder={() => {
          void updatePreferences({
            ...snapshot.preferences,
            dismissAutomationRuleReadiness: true
          });
        }}
        variant="today"
      />
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
          {blockerRows.length === 0 ? (
            <Alert color="teal" variant="light">
              No files are blocked right now. The queue is clear of user-driven work.
            </Alert>
          ) : (
            <>
              <Table className="desktop-blocker-table" layout="fixed" verticalSpacing={6} highlightOnHover>
                <colgroup>
                  <col className="desktop-blocker-col-file" />
                  <col />
                  <col className="desktop-blocker-col-status" />
                  <col className="desktop-blocker-col-updated" />
                  <col className="desktop-blocker-col-action" />
                </colgroup>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>File</Table.Th>
                    <Table.Th>Reason</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Updated</Table.Th>
                    <Table.Th aria-label="Actions" />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {blockerRows.slice(0, BLOCKER_ROW_LIMIT).map(({ job, summary }) => {
                    const folder = uploadJobFolderName(job);
                    return (
                      <Table.Tr key={job.id}>
                        <Table.Td>
                          <Text size="sm" fw={600} truncate="end" title={job.filename}>
                            {job.filename}
                          </Text>
                          {folder ? (
                            <Text size="xs" c="dimmed" truncate="end" title={folder}>
                              {folder}
                            </Text>
                          ) : null}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" className="desktop-wrap-anywhere">
                            {summary.reason}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={summary.owner === 'user' ? 'orange' : 'blue'} variant="light">
                            {summary.statusLabel}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">
                            {formatUploadJobModifiedAt(job)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Button component={Link} to={queueLinkForJob(job.id, 'needs_action')} size="compact-xs" variant="light">
                            Open
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
              {blockerRows.length > BLOCKER_ROW_LIMIT ? (
                <Group justify="space-between" align="center" wrap="wrap">
                  <Text size="sm" c="dimmed">
                    Showing {BLOCKER_ROW_LIMIT} of {blockerRows.length} blocked files.
                  </Text>
                  <Button component={Link} to="/queue?view=needs_action" size="xs" variant="light">
                    Show all in the queue
                  </Button>
                </Group>
              ) : null}
            </>
          )}
        </Stack>
      </Card>
      <Card withBorder className="desktop-card desktop-today-section">
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <div>
              <Text className="desktop-micro-label">In progress</Text>
              <Text fw={700}>Uploading now</Text>
            </div>
            <Group gap="xs" wrap="wrap">
              <Badge color="blue" variant="light">
                {automaticQueueCount} moving
              </Badge>
              <Badge color="cyan" variant="light">
                {waitingOnServerCount} on server
              </Badge>
            </Group>
          </Group>
          {inProgressJobs.length === 0 ? (
            <Alert color="gray" variant="light">
              Nothing is uploading right now.
            </Alert>
          ) : (
            <Stack gap="sm">
              {inProgressJobs.slice(0, 6).map((job) => {
                const onServer = uploadJobWaitingOnServer(job);
                return (
                  <div key={job.id} className="desktop-today-mini-row">
                    <div>
                      <Text size="sm" fw={600}>
                        {job.filename}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {onServer
                          ? formatLifecycleLabel(job.lifecyclePhase, job.fileKind)
                          : formatQueueStateLabel(job.localState, job.fileKind)}{' '}
                        · {formatUploadJobModifiedAt(job)}
                      </Text>
                    </div>
                    <Group gap="xs" wrap="nowrap">
                      <Badge color={onServer ? 'cyan' : 'blue'} variant="light">
                        {onServer ? 'On server' : 'Local'}
                      </Badge>
                      <Badge color={job.fileKind === 'card_catalog' ? 'grape' : 'blue'} variant="light">
                        {formatFileKindLabel(job.fileKind)}
                      </Badge>
                    </Group>
                  </div>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Card>
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
    </Stack>
  );
};
