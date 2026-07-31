import { Alert, Badge, Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
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
  const {
    snapshot,
    selectedProfile,
    health,
    authFlowState,
    cards,
    cardSource,
    refreshCards,
    refreshMyAgg,
    updatePreferences
  } = useDesktop();
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
  const localUploadCount = useMemo(
    () => activeMachineJobs.length,
    [activeMachineJobs.length]
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
      <Card withBorder className="desktop-card desktop-today-hero">
        <Stack gap="md">
          <div>
            <Text className="desktop-micro-label">Today</Text>
            <h2 className="desktop-page-title">What needs you right now</h2>
            <p className="desktop-page-subtitle">Blockers, automatic progress, and recent finishes all live on one operating surface.</p>
          </div>
          {nextStep ? (
            <Alert color="blue" variant="light" title={`Next readiness step: ${nextStep.label}`}>
              {nextStep.detail}
            </Alert>
          ) : (
            <Alert color="teal" variant="light">
              Operational readiness is complete.
            </Alert>
          )}
        </Stack>
      </Card>
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
      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <Card withBorder className="desktop-card desktop-today-section">
          <Stack gap="md">
            <Group justify="space-between" align="center" wrap="wrap">
              <div>
                <Text className="desktop-micro-label">In progress</Text>
                <Text fw={700}>Automatic work</Text>
              </div>
              <Badge color="blue" variant="light">
                {automaticQueueCount} moving
              </Badge>
            </Group>
            <Stack gap="sm">
              <div className="desktop-today-mini-list">
                <Text size="sm" fw={600}>
                  On this machine
                </Text>
                {activeMachineJobs.length === 0 ? (
                  <Alert color="gray" variant="light">
                    No uploads are currently staged or uploading on this desktop.
                  </Alert>
                ) : (
                  activeMachineJobs.slice(0, 4).map((job) => (
                    <div key={job.id} className="desktop-today-mini-row">
                      <div>
                        <Text size="sm" fw={600}>
                          {job.filename}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatQueueStateLabel(job.localState, job.fileKind)} · {formatUploadJobModifiedAt(job)}
                        </Text>
                      </div>
                      <Badge color="blue" variant="light">
                        {formatFileKindLabel(job.fileKind)}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </Stack>
          </Stack>
        </Card>
        <Card withBorder className="desktop-card desktop-today-section">
          <Stack gap="md">
            <Group justify="space-between" align="center" wrap="wrap">
              <div>
                <Text className="desktop-micro-label">In progress</Text>
                <Text fw={700}>Waiting on the server</Text>
              </div>
              <Badge color="cyan" variant="light">
                {waitingOnServerCount} on server
              </Badge>
            </Group>
            {serverProgressJobs.length === 0 ? (
              <Alert color="gray" variant="light">
                Nothing is currently waiting on the server.
              </Alert>
            ) : (
              <Stack gap="sm">
                {serverProgressJobs.slice(0, 4).map((job) => (
                  <div key={job.id} className="desktop-today-mini-row">
                    <div>
                      <Text size="sm" fw={600}>
                        {job.filename}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {formatLifecycleLabel(job.lifecyclePhase, job.fileKind)} · {formatUploadJobModifiedAt(job)}
                      </Text>
                    </div>
                    <Badge color="cyan" variant="light">
                      {job.localState === 'uploaded_waiting_server' ? 'Uploaded' : formatQueueStateLabel(job.localState, job.fileKind)}
                    </Badge>
                  </div>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
      </SimpleGrid>
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
      <SimpleGrid cols={{ base: 1, md: 4 }} spacing="sm">
        <Card withBorder className="desktop-card">
          <Stack gap={4}>
            <Text className="desktop-micro-label">Server</Text>
            <Text fw={700}>{selectedProfile?.name ?? 'None'}</Text>
            <Text size="xs" c="dimmed">
              {selectedProfile?.baseUrl ?? 'No server selected'}
            </Text>
          </Stack>
        </Card>
        <Card withBorder className="desktop-card">
          <Stack gap={4}>
            <Text className="desktop-micro-label">Watch folders</Text>
            <Text fw={700}>{snapshot.watchRoots.length}</Text>
            <Text size="xs" c="dimmed">
              Configured folder monitors
            </Text>
          </Stack>
        </Card>
        <Card withBorder className="desktop-card">
          <Stack gap={4}>
            <Text className="desktop-micro-label">Cards</Text>
            <Text fw={700}>{cards.length}</Text>
            <Text size="xs" c="dimmed">
              Source: {cardSource ?? 'Unknown'}
            </Text>
            <Group gap="xs" wrap="wrap" mt={4}>
              <Button size="compact-xs" variant="light" disabled={!selectedProfile} onClick={() => void refreshCards('')}>
                Refresh cards
              </Button>
              <Button
                size="compact-xs"
                variant="light"
                disabled={!selectedProfile}
                onClick={() => {
                  if (!selectedProfile) {
                    return;
                  }
                  void refreshMyAgg(selectedProfile.id);
                }}
              >
                Refresh personal aggregate
              </Button>
            </Group>
          </Stack>
        </Card>
        <Card withBorder className="desktop-card">
          <Stack gap={4}>
            <Text className="desktop-micro-label">Queue state</Text>
            <Text fw={700}>{waitingOnServerCount + localUploadCount}</Text>
            <Text size="xs" c="dimmed">
              Automatic work still in motion
            </Text>
          </Stack>
        </Card>
      </SimpleGrid>
    </Stack>
  );
};
