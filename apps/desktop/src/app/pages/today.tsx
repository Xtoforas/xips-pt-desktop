import { Badge, Button, Card, Group, HoverCard, Stack, Table, Text } from '@mantine/core';
import { mdiInformationOutline } from '@mdi/js';
import { type JSX, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDesktop } from '../DesktopContext';
import type { LocalUploadJob } from '@xips/api-contract';
import {
  BlockedStatusBadge,
  MdiIcon,
  PageHeader,
  ReadinessCard,
  SectionHeader
} from '../components';
import {
  blockerPriority,
  COMPACT_TIMESTAMP,
  compareUploadJobsNewestFirst,
  formatLifecycleLabel,
  formatQueueStateLabel,
  formatUploadJobModifiedAt,
  queueLinkForJob,
  formatUploadFormatLabel,
  summarizeBlockedJob,
  type BlockedJobSummary,
  uploadJobNeedsAttention,
  uploadJobWaitingOnServer,
  uploadJobWorkingAutomatically,
  type TodayBlockerState
} from '../queue-model';

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

const PROGRESS_ROW_LIMIT = 8;
const COMPLETED_ROW_LIMIT = 5;

const UpdatedCell = ({ job }: { job: LocalUploadJob }): JSX.Element => (
  <td className="landing-cell admin-nowrap" title={formatUploadJobModifiedAt(job)}>
    {formatUploadJobModifiedAt(job, COMPACT_TIMESTAMP)}
  </td>
);

// Today's progress and completion lists: the site table markup, one line per job.
const JobTable = ({
  jobs,
  formatLabels,
  status
}: {
  jobs: LocalUploadJob[];
  formatLabels: Record<string, string>;
  status?: (job: LocalUploadJob) => JSX.Element;
}): JSX.Element => (
  <div className="admin-table-frame">
    <div className="landing-table-wrap admin-table-wrap">
      <table className="landing-table observed-table admin-table desktop-today-table">
        <colgroup>
          <col className="desktop-today-col-file" />
          <col />
          {status ? <col className="desktop-today-col-status" /> : null}
          <col className="desktop-today-col-updated" />
        </colgroup>
        <thead>
          <tr>
            <th>File</th>
            <th>Format</th>
            {status ? <th>Stage</th> : null}
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const formatLabel = formatUploadFormatLabel(job.formatId, formatLabels);
            return (
              <tr key={job.id} className="landing-row">
                <td className="landing-cell landing-cell-name" title={job.path}>
                  {job.filename}
                </td>
                <td className="landing-cell" title={formatLabel}>
                  {formatLabel}
                </td>
                {status ? <td className="landing-cell admin-nowrap">{status(job)}</td> : null}
                <UpdatedCell job={job} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

// An empty Today section: one line instead of a header plus an empty-state box.
const QuietSection = ({ title, message }: { title: string; message: string }): JSX.Element => (
  <Card withBorder className="desktop-card desktop-today-section" py="xs">
    <Group gap="sm" wrap="nowrap">
      <Text size="sm" fw={700}>
        {title}
      </Text>
      <Text size="sm" c="dimmed" truncate="end">
        {message}
      </Text>
    </Group>
  </Card>
);

export const TodayPage = (): JSX.Element => {
  const { snapshot, ignoreUploadJob } = useDesktop();
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
  const completedCount = useMemo(
    () => snapshot.uploadJobs.filter((job) => job.localState === 'complete').length,
    [snapshot.uploadJobs]
  );
  const needsAttentionCount = useMemo(
    () => snapshot.uploadJobs.filter(uploadJobNeedsAttention).length,
    [snapshot.uploadJobs]
  );
  const inProgressJobs = useMemo(
    () =>
      snapshot.uploadJobs
        .filter((job) => uploadJobWorkingAutomatically(job) || uploadJobWaitingOnServer(job))
        .sort(compareUploadJobsNewestFirst),
    [snapshot.uploadJobs]
  );
  const completedJobs = useMemo(
    () =>
      snapshot.uploadJobs
        .filter((job) => job.localState === 'complete')
        .sort(compareUploadJobsNewestFirst)
        .slice(0, COMPLETED_ROW_LIMIT),
    [snapshot.uploadJobs]
  );

  return (
    <Stack gap="lg">
      <PageHeader title="Today" />
      <ReadinessCard variant="today" />
      {blockerRows.length === 0 ? (
        <QuietSection title="Blocked files" message="Nothing needs you right now." />
      ) : (
        <Card withBorder className="desktop-card desktop-today-section">
          <Stack gap="md">
            <SectionHeader
              eyebrow="Needs attention"
              title="Blocked files"
              aside={<Badge color="orange" variant="light">
                {needsAttentionCount} file{needsAttentionCount === 1 ? '' : 's'}
              </Badge>}
            />
            <div className="admin-table-frame">
              <div className="landing-table-wrap admin-table-wrap">
                <table className="landing-table observed-table admin-table desktop-today-table">
                  <colgroup>
                    <col className="desktop-today-col-file" />
                    <col />
                    <col className="desktop-today-col-updated" />
                    <col className="desktop-today-col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {blockerRows.slice(0, BLOCKER_ROW_LIMIT).map(({ job, summary }) => (
                      <tr key={job.id} className="landing-row">
                        <td className="landing-cell landing-cell-name">
                          <HoverCard width={380} shadow="md" position="bottom-start" withArrow openDelay={250}>
                            <HoverCard.Target>
                              <div className="admin-cell-inline desktop-blocker-file">
                                <span className="admin-cell-clip">{job.filename}</span>
                                <span className="desktop-blocker-info">
                                  <MdiIcon path={mdiInformationOutline} size={14} />
                                </span>
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
                        </td>
                        <td className="landing-cell" title={summary.reason || undefined}>
                          <div className="admin-cell-inline admin-nowrap">
                            <BlockedStatusBadge summary={summary} />
                            <span className="admin-cell-clip">{summary.reason}</span>
                          </div>
                        </td>
                        <UpdatedCell job={job} />
                        <td className="landing-cell">
                          <Group gap={4} wrap="nowrap">
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
                          </Group>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
          </Stack>
        </Card>
      )}
      {inProgressJobs.length === 0 ? (
        <QuietSection title="Uploading now" message="Nothing is uploading right now." />
      ) : (
        <Card withBorder className="desktop-card desktop-today-section">
          <Stack gap="md">
            <SectionHeader
              eyebrow="In progress"
              title="Uploading now"
              aside={<Badge color="blue" variant="light">
                {inProgressJobs.length} in progress
              </Badge>}
            />
            <JobTable
              jobs={inProgressJobs.slice(0, PROGRESS_ROW_LIMIT)}
              formatLabels={formatLabelById}
              status={(job) =>
                uploadJobWaitingOnServer(job) ? (
                  <Badge color="cyan" variant="light">
                    {formatLifecycleLabel(job.lifecyclePhase, job.fileKind)}
                  </Badge>
                ) : (
                  <Badge color="blue" variant="light">
                    {formatQueueStateLabel(job.localState, job.fileKind)}
                  </Badge>
                )
              }
            />
            {inProgressJobs.length > PROGRESS_ROW_LIMIT ? (
              <Group justify="flex-end">
                <Button component={Link} to="/queue?view=working" size="compact-xs" variant="subtle">
                  Show all {inProgressJobs.length} in the queue
                </Button>
              </Group>
            ) : null}
          </Stack>
        </Card>
      )}
      {completedJobs.length === 0 ? (
        <QuietSection title="Finished uploads" message="No uploads have finished yet." />
      ) : (
        <Card withBorder className="desktop-card desktop-today-section">
          <Stack gap="md">
            <SectionHeader
              eyebrow="Recently completed"
              title="Latest finished uploads"
              aside={<Badge color="teal" variant="light">
                {completedCount} total
              </Badge>}
            />
            <JobTable jobs={completedJobs} formatLabels={formatLabelById} />
          </Stack>
        </Card>
      )}
    </Stack>
  );
};
