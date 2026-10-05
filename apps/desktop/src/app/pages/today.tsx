import { Alert, Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDesktop } from '../DesktopContext';
import { buildOnboardingSteps, ReadinessCard } from '../components';
import {
  blockerActionLabelByState,
  blockerDetailByState,
  blockerPriority,
  blockerTitleByState,
  formatFileKindLabel,
  formatLifecycleLabel,
  formatQueueStateLabel,
  formatUploadJobModifiedAt,
  getUploadJobKindDetail,
  getUploadJobModifiedAt,
  queueLinkForJob,
  uploadJobNeedsAttention,
  uploadJobWaitingOnServer,
  uploadJobWorkingAutomatically,
  type TodayBlockerState
} from '../queue-model';

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
  const blockerJobs = useMemo(
    () =>
      [...snapshot.uploadJobs]
        .filter((job) => uploadJobNeedsAttention(job))
        .sort((left, right) => {
          const leftPriority = blockerPriority[left.localState as TodayBlockerState] ?? 99;
          const rightPriority = blockerPriority[right.localState as TodayBlockerState] ?? 99;
          if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
          }
          return (getUploadJobModifiedAt(right) ?? 0) - (getUploadJobModifiedAt(left) ?? 0);
        }),
    [snapshot.uploadJobs]
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
          {blockerJobs.length === 0 ? (
            <Alert color="teal" variant="light">
              No files are blocked right now. The queue is clear of user-driven work.
            </Alert>
          ) : (
            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="sm">
              {blockerJobs.map((job) => {
                const blockerState = job.localState as TodayBlockerState;
                const queueLink = queueLinkForJob(job.id, 'needs_action');
                return (
                  <Card key={job.id} withBorder className="desktop-card desktop-today-blocker-card">
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <div>
                          <Text size="sm" fw={700}>
                            {job.filename}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {getUploadJobKindDetail(job)} Updated {formatUploadJobModifiedAt(job)}.
                          </Text>
                        </div>
                        <Stack gap={4} align="flex-end">
                          <Badge color="orange" variant="light">
                            {blockerTitleByState[blockerState]}
                          </Badge>
                          <Badge color={job.fileKind === 'card_catalog' ? 'grape' : 'blue'} variant="light">
                            {formatFileKindLabel(job.fileKind)}
                          </Badge>
                        </Stack>
                      </Group>
                      <Text size="sm">
                        {blockerDetailByState(job, formatLabelById)}
                      </Text>
                      <Group gap="xs" wrap="wrap">
                        <Button component={Link} to={queueLink} size="xs">
                          {blockerActionLabelByState[blockerState]}
                        </Button>
                        <Button component={Link} to={queueLink} size="xs" variant="light">
                          Open queue row
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                );
              })}
            </SimpleGrid>
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
