import { Alert, Badge, Button, Card, Group, HoverCard, Stack, Table, Text, Title } from '@mantine/core';
import { mdiInformationOutline } from '@mdi/js';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDesktop } from '../DesktopContext';
import type { LocalUploadJob } from '@xips/api-contract';
import {
  BlockedStatusBadge,
  FileKindBadge,
  MdiIcon,
  ReadinessCard,
  SectionHeader
} from '../components';
import {
  blockerPriority,
  compareUploadJobsNewestFirst,
  formatLifecycleLabel,
  formatQueueStateLabel,
  formatUploadJobModifiedAt,
  queueLinkForJob,
  formatUploadFormatLabel,
  summarizeBlockedJob,
  type BlockedJobSummary,
  uploadJobFolderName,
  uploadJobNeedsAttention,
  uploadJobWaitingOnServer,
  uploadJobWorkingAutomatically,
  type TodayBlockerState
} from '../queue-model';
import { isCustomServer, serverHostLabel } from '../onboarding';

const BLOCKER_ROW_LIMIT = 15;

// Hover card for a blocked row: everything needed to decide whether to fix, open, or ignore it.
const BlockedJobDetails = ({
  job,
  summary,
  formatName
}: {
  job: LocalUploadJob;
  summary: BlockedJobSummary;
  formatName: string;
}): JSX.Element => {
  const rows: Array<[string, string]> = [
    ['File', job.filename],
    ['Path', job.path],
    ['Teams', job.teamCount > 0 ? String(job.teamCount) : '-'],
    ['Format', formatName],
    ['Tournament ID', job.tournamentId || '-'],
    ['State', formatQueueStateLabel(job.localState, job.fileKind)],
    ['Reason', summary.reason || '-'],
    ['Retries', String(job.retries)],
    ['Last request', job.lastRequestId || '-']
  ];
  return (
    <Table className="desktop-blocker-details" verticalSpacing={4} horizontalSpacing="xs">
      <Table.Tbody>
        {rows.map(([label, value]) => (
          <Table.Tr key={label}>
            <Table.Th>{label}</Table.Th>
            <Table.Td className={label === 'Path' || label === 'Last request' ? 'desktop-mono' : 'desktop-wrap-anywhere'}>
              {value}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
};

// One line per job in Today's progress and completion lists.
const JobSummaryRow = ({
  job,
  detail,
  statusLabel,
  statusColor
}: {
  job: LocalUploadJob;
  detail: string;
  statusLabel: string;
  statusColor: string;
}): JSX.Element => (
  <div className="desktop-today-job-row">
    <div>
      <Text size="sm" fw={600}>
        {job.filename}
      </Text>
      <Text size="xs" c="dimmed">
        {detail} · {formatUploadJobModifiedAt(job)}
      </Text>
    </div>
    <Group gap="xs" wrap="nowrap">
      <Badge color={statusColor} variant="light">
        {statusLabel}
      </Badge>
      <FileKindBadge fileKind={job.fileKind} />
    </Group>
  </div>
);

export const TodayPage = (): JSX.Element => {
  const { snapshot, selectedProfile, ignoreUploadJob } = useDesktop();
  const customServer = isCustomServer(selectedProfile);
  const formatLabelById = useMemo(
    () =>
      Object.fromEntries(snapshot.cachedFormats.map((format) => [format.id, format.name])),
    [snapshot.cachedFormats]
  );
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
          return compareUploadJobsNewestFirst(left.job, right.job);
        }),
    [snapshot.cachedFormats, snapshot.uploadJobs]
  );
  const activeMachineJobs = useMemo(
    () =>
      snapshot.uploadJobs
        .filter((job) => uploadJobWorkingAutomatically(job) && !uploadJobWaitingOnServer(job))
        .sort(compareUploadJobsNewestFirst),
    [snapshot.uploadJobs]
  );
  const serverProgressJobs = useMemo(
    () =>
      snapshot.uploadJobs
        .filter((job) => uploadJobWaitingOnServer(job))
        .sort(compareUploadJobsNewestFirst),
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
        compareUploadJobsNewestFirst
      ),
    [activeMachineJobs, serverProgressJobs]
  );
  const completedJobs = useMemo(
    () =>
      snapshot.uploadJobs
        .filter((job) => job.localState === 'complete')
        .sort(compareUploadJobsNewestFirst)
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
            customServer ? (
              <>
                {' '}New exports in your OOTP folder upload to{' '}
                <span className="desktop-mono">{serverHostLabel(selectedProfile.baseUrl)}</span> automatically.
              </>
            ) : (
              ' New exports in your OOTP folder upload to XiPS automatically.'
            )
          ) : null}
        </Text>
      </Stack>
      <ReadinessCard variant="today" />
      <Card withBorder className="desktop-card desktop-today-section">
        <Stack gap="md">
          <SectionHeader
            eyebrow="Needs attention"
            title="Blocked files"
            aside={<Badge color={needsAttentionCount > 0 ? 'orange' : 'gray'} variant="light">
              {needsAttentionCount} file{needsAttentionCount === 1 ? '' : 's'}
            </Badge>}
          />
          {blockerRows.length === 0 ? (
            <Alert color="teal" variant="light">
              Nothing needs you right now.
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
                          <HoverCard width={380} shadow="md" position="bottom-start" withArrow openDelay={250}>
                            <HoverCard.Target>
                              <div className="desktop-blocker-file">
                                <Group gap={4} wrap="nowrap">
                                  <Text size="sm" fw={600} truncate="end">
                                    {job.filename}
                                  </Text>
                                  <span className="desktop-blocker-info">
                                    <MdiIcon path={mdiInformationOutline} size={14} />
                                  </span>
                                </Group>
                                {folder ? (
                                  <Text size="xs" c="dimmed" truncate="end">
                                    {folder}
                                  </Text>
                                ) : null}
                              </div>
                            </HoverCard.Target>
                            <HoverCard.Dropdown>
                              <BlockedJobDetails
                                job={job}
                                summary={summary}
                                formatName={formatUploadFormatLabel(job.formatId, formatLabelById)}
                              />
                            </HoverCard.Dropdown>
                          </HoverCard>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" className="desktop-wrap-anywhere">
                            {summary.reason}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <BlockedStatusBadge summary={summary} />
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">
                            {formatUploadJobModifiedAt(job)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={4} align="stretch">
                            <Button component={Link} to={queueLinkForJob(job.id, 'needs_action')} size="compact-xs" variant="light">
                              Open
                            </Button>
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="gray"
                              title="Move to the queue's Ignored tab; restore it there any time."
                              onClick={() => void ignoreUploadJob(job.id)}
                            >
                              Ignore
                            </Button>
                          </Stack>
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
          <SectionHeader
            eyebrow="In progress"
            title="Uploading now"
            aside={<Group gap="xs" wrap="wrap">
              <Badge color="blue" variant="light">
                {automaticQueueCount} moving
              </Badge>
              <Badge color="cyan" variant="light">
                {waitingOnServerCount} on server
              </Badge>
            </Group>}
          />
          {inProgressJobs.length === 0 ? (
            <Alert color="gray" variant="light">
              Nothing is uploading right now.
            </Alert>
          ) : (
            <div className="desktop-today-job-list">
              {inProgressJobs.slice(0, 6).map((job) => {
                const onServer = uploadJobWaitingOnServer(job);
                return (
                  <JobSummaryRow
                    key={job.id}
                    job={job}
                    detail={
                      onServer
                        ? formatLifecycleLabel(job.lifecyclePhase, job.fileKind)
                        : formatQueueStateLabel(job.localState, job.fileKind)
                    }
                    statusLabel={onServer ? 'On server' : 'Local'}
                    statusColor={onServer ? 'cyan' : 'blue'}
                  />
                );
              })}
            </div>
          )}
        </Stack>
      </Card>
      <Card withBorder className="desktop-card desktop-today-section">
        <Stack gap="md">
          <SectionHeader
            eyebrow="Recently completed"
            title="Latest finished uploads"
            aside={<Badge color="teal" variant="light">
              {completedCount} total
            </Badge>}
          />
          {completedJobs.length === 0 ? (
            <Alert color="gray" variant="light">
              No uploads have finished yet.
            </Alert>
          ) : (
            <div className="desktop-today-job-list">
              {completedJobs.map((job) => (
                <JobSummaryRow
                  key={job.id}
                  job={job}
                  detail={formatUploadFormatLabel(job.formatId, formatLabelById)}
                  statusLabel="Complete"
                  statusColor="teal"
                />
              ))}
            </div>
          )}
        </Stack>
      </Card>
    </Stack>
  );
};
