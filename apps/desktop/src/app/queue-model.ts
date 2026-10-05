import type { LocalDetectedFile, LocalUploadJob } from '@xips/api-contract';

export const lifecycleColor = (value: string | null): string => {
  switch (value) {
    case 'complete':
      return 'teal';
    case 'refreshing':
      return 'cyan';
    case 'refresh_pending':
      return 'blue';
    case 'processing':
      return 'blue';
    case 'failed':
      return 'red';
    case 'skipped_duplicate':
      return 'gray';
    case 'queued':
      return 'blue';
    default:
      return 'gray';
  }
};

export const localStateColor = (value: LocalUploadJob['localState']): string => {
  switch (value) {
    case 'complete':
      return 'teal';
    case 'detected':
    case 'queued_local':
    case 'uploading':
      return 'blue';
    case 'uploaded_waiting_server':
    case 'server_queued':
    case 'server_processing':
    case 'server_refresh_pending':
    case 'server_refreshing':
      return 'blue';
    case 'failed_retryable':
      return 'orange';
    case 'failed_terminal':
      return 'red';
    case 'ignored':
      return 'gray';
    case 'duplicate_skipped_local':
      return 'gray';
    case 'auth_blocked':
      return 'red';
    case 'awaiting_format_assignment':
      return 'orange';
    default:
      return 'gray';
  }
};

export const localPresenceColor = (value: LocalUploadJob['localPresence']): string =>
  value === 'present' ? 'teal' : 'gray';

const actionRequiredStates = new Set<LocalUploadJob['localState']>([
  'awaiting_format_assignment',
  'failed_retryable',
  'failed_terminal',
  'auth_blocked'
]);

const automaticQueueStates = new Set<LocalUploadJob['localState']>([
  'detected',
  'queued_local',
  'uploading',
  'uploaded_waiting_server',
  'server_queued',
  'server_processing',
  'server_refresh_pending',
  'server_refreshing'
]);

const serverActiveStates = new Set<LocalUploadJob['localState']>([
  'uploaded_waiting_server',
  'server_queued',
  'server_processing',
  'server_refresh_pending',
  'server_refreshing'
]);

export const uploadJobNeedsAttention = (job: LocalUploadJob): boolean =>
  actionRequiredStates.has(job.localState);

export const uploadJobWorkingAutomatically = (job: LocalUploadJob): boolean =>
  automaticQueueStates.has(job.localState);

export const uploadJobWaitingOnServer = (job: LocalUploadJob): boolean =>
  serverActiveStates.has(job.localState);

export const formatFileKindLabel = (fileKind: LocalUploadJob['fileKind'] | 'unknown'): string => {
  switch (fileKind) {
    case 'stats_export':
      return 'Stats Export';
    case 'card_catalog':
      return 'Card Catalog';
    default:
      return 'Unknown';
  }
};

export const formatQueueStateLabel = (
  state: LocalUploadJob['localState'],
  fileKind: LocalUploadJob['fileKind']
): string => {
  const labels: Record<LocalUploadJob['localState'], string> = {
    detected: 'Detected',
    awaiting_format_assignment: 'Awaiting Format Assignment',
    queued_local: 'Queued Locally',
    duplicate_skipped_local: 'Skipped as Duplicate',
    ignored: 'Ignored',
    uploading: 'Uploading',
    uploaded_waiting_server: 'Uploaded, Waiting on Server',
    server_queued: 'Queued on Server',
    server_processing: 'Server Processing',
    server_refresh_pending: 'Refresh Pending',
    server_refreshing: 'Refreshing',
    complete: 'Complete',
    failed_retryable: 'Retry Needed',
    failed_terminal: 'Failed',
    auth_blocked: 'Sign-In Required'
  };

  if (fileKind === 'card_catalog' && (state === 'complete' || state === 'server_refresh_pending')) {
    return 'Catalog Updated';
  }
  return labels[state];
};

export const formatLifecycleLabel = (
  phase: LocalUploadJob['lifecyclePhase'],
  fileKind: LocalUploadJob['fileKind']
): string => {
  const labels: Record<NonNullable<LocalUploadJob['lifecyclePhase']>, string> = {
    queued: 'Queued',
    processing: 'Processing',
    refresh_pending: 'Refresh Pending',
    refreshing: 'Refreshing',
    complete: 'Complete',
    failed: 'Failed',
    skipped_duplicate: 'Skipped as Duplicate'
  };

  if (fileKind === 'card_catalog' && (phase === 'complete' || phase === 'refresh_pending')) {
    return 'Catalog Updated';
  }
  return phase ? labels[phase] : 'Not Started';
};

export const formatLocalPresenceLabel = (presence: LocalUploadJob['localPresence']): string =>
  presence === 'present' ? 'Present' : 'Missing';

export const formatDetectedFileStateLabel = (state: LocalDetectedFile['localState']): string => {
  const labels: Record<LocalDetectedFile['localState'], string> = {
    detected: 'Detected',
    queued_local: 'Queued Locally',
    awaiting_format_assignment: 'Awaiting Format Assignment',
    ignored: 'Ignored'
  };
  return labels[state];
};

export const getUploadJobModifiedAt = (job: LocalUploadJob): number | null => {
  const sourceModifiedAt = Number(job.sourceModifiedAt);
  if (Number.isFinite(sourceModifiedAt) && sourceModifiedAt > 0) {
    return sourceModifiedAt;
  }

  const queueUpdatedAt = Date.parse(job.updatedAt);
  return Number.isFinite(queueUpdatedAt) ? queueUpdatedAt : null;
};

export const formatUploadJobModifiedAt = (job: LocalUploadJob): string => {
  const modifiedAt = getUploadJobModifiedAt(job);
  return modifiedAt === null ? '-' : new Date(modifiedAt).toLocaleString();
};

export const formatSourceModifiedAt = (sourceModifiedAt: string): string => {
  const parsed = Number(sourceModifiedAt);
  return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toLocaleString() : '-';
};

export const formatUploadJobChecksumStatusLabel = (
  job: Pick<LocalUploadJob, 'duplicateReason' | 'remoteChecksum'>
): string => (job.duplicateReason ? 'Duplicate' : job.remoteChecksum ? 'Uploaded' : 'Pending');

export type QueueWorkspaceView = 'needs_action' | 'ignored' | 'working' | 'done';

export const queueWorkspaceViewLabel: Record<QueueWorkspaceView, string> = {
  needs_action: 'Needs Action',
  ignored: 'Ignored',
  working: 'Working',
  done: 'Done'
};

export const queueWorkspaceViewDetail: Record<QueueWorkspaceView, string> = {
  needs_action: 'Rows waiting on a user decision.',
  ignored: 'Rows hidden from the active queue until you restore them.',
  working: 'Automatic or server-side work that is still progressing.',
  done: 'Finished, skipped, or terminal rows.'
};

export const queueWorkspaceViewColor: Record<QueueWorkspaceView, string> = {
  needs_action: 'orange',
  ignored: 'gray',
  working: 'blue',
  done: 'teal'
};

export const queueLinkForJob = (jobId: string, view: QueueWorkspaceView = 'needs_action'): string => {
  const params = new URLSearchParams();
  params.set('view', view);
  params.set('job', jobId);
  const query = params.toString();
  return query ? `/queue?${query}` : '/queue';
};

export const parseQueueWorkspaceView = (value: string | null): QueueWorkspaceView | null => {
  if (value === 'needs_action' || value === 'ignored' || value === 'working' || value === 'done') {
    return value;
  }
  return null;
};

export const parseLegacyQueueWorkspaceView = (
  value: string | null,
  selectedJob: LocalUploadJob | null
): QueueWorkspaceView | null => {
  if (value === 'uploaded') {
    return 'done';
  }
  if (value === 'queued') {
    return selectedJob && uploadJobNeedsAttention(selectedJob) ? 'needs_action' : 'working';
  }
  return null;
};

export const queueWorkspaceViewForJob = (job: LocalUploadJob): QueueWorkspaceView => {
  if (uploadJobNeedsAttention(job)) {
    return 'needs_action';
  }
  if (job.localState === 'ignored') {
    return 'ignored';
  }
  if (uploadJobWorkingAutomatically(job)) {
    return 'working';
  }
  return 'done';
};

export const isQueueJobDone = (job: LocalUploadJob): boolean => queueWorkspaceViewForJob(job) === 'done';

export const canIgnoreUploadJob = (job: LocalUploadJob): boolean =>
  uploadJobNeedsAttention(job) || uploadJobWorkingAutomatically(job);

export const canDismissUploadJob = (job: LocalUploadJob): boolean =>
  job.localState === 'duplicate_skipped_local' ||
  job.localState === 'awaiting_format_assignment' ||
  job.localState === 'detected' ||
  job.localState === 'queued_local';

export type TodayBlockerState =
  | 'awaiting_format_assignment'
  | 'failed_retryable'
  | 'failed_terminal'
  | 'auth_blocked';

export const blockerPriority: Record<TodayBlockerState, number> = {
  auth_blocked: 0,
  awaiting_format_assignment: 1,
  failed_retryable: 2,
  failed_terminal: 3
};

export const blockerTitleByState: Record<TodayBlockerState, string> = {
  awaiting_format_assignment: 'Waiting for format assignment',
  failed_retryable: 'Retryable failure',
  failed_terminal: 'Blocked — needs a format or rule change',
  auth_blocked: 'Sign-in required'
};

export const blockerActionLabelByState: Record<TodayBlockerState, string> = {
  awaiting_format_assignment: 'Open queue to assign format',
  failed_retryable: 'Open queue to retry',
  failed_terminal: 'Open queue to review',
  auth_blocked: 'Open queue to re-authenticate'
};

export const blockerDetailByState = (
  job: { fileKind: string; error?: string | null; formatId?: string | null; filename: string },
  formatLabelById: Record<string, string>
): string => {
  switch (job.fileKind) {
    case 'stats_export':
      return `The export is blocked until it is mapped to a tournament format${job.formatId ? ` (${formatLabelById[job.formatId] ?? 'unknown format'})` : ''}.`;
    case 'card_catalog':
      return 'The catalog is waiting for the queue to finish assigning its next server lifecycle step.';
    default:
      return 'This file is blocked and needs one quick queue action before it can continue.';
  }
};

export const getUploadJobKindDetail = (job: Pick<LocalUploadJob, 'fileKind' | 'lifecyclePhase' | 'localState'>): string => {
  if (job.localState === 'failed_retryable') {
    return 'A transient error paused the upload.';
  }
  if (job.localState === 'failed_terminal') {
    return "The export was rejected and won't succeed until the format or export changes.";
  }
  if (job.localState === 'auth_blocked') {
    return 'The selected account needs to be signed in again.';
  }
  if (job.localState === 'awaiting_format_assignment') {
    return 'The queue is waiting for a format match.';
  }
  return job.lifecyclePhase ? formatLifecycleLabel(job.lifecyclePhase, job.fileKind) : 'In progress';
};

export const formatMatchesTeamCount = (teamsPerTournament: number, teamCount: number): boolean =>
  teamCount === 0 || teamsPerTournament === 0 || teamCount <= teamsPerTournament;

export const getIncompleteTeamCountWarning = (
  fileKind: string,
  teamCount: number,
  format: { name: string; teamsPerTournament: number } | null | undefined
): { badgeLabel: string; message: string } | null => {
  if (
    fileKind !== 'stats_export' ||
    !format ||
    teamCount === 0 ||
    format.teamsPerTournament === 0 ||
    teamCount >= format.teamsPerTournament
  ) {
    return null;
  }

  return {
    badgeLabel: `${teamCount}/${format.teamsPerTournament} teams`,
    message: `Detected ${teamCount} distinct team codes for ${format.name}'s ${format.teamsPerTournament}-team format. The app still assigned it because the filename matched, but this usually means a team was left unrostered or collapsed into an unknown placeholder in the export.`
  };
};

export const extractTournamentIdCandidates = (value: string): string[] => {
  const matches = value.match(/\d+/gu) ?? [];
  return matches.filter((candidate) => candidate.length >= 5 && candidate.length <= 7);
};

export const explainFilenameAutoAssignment = (
  filename: string,
  teamCount: number,
  formats: Array<{ id: string; name: string; tournamentIdPrefix: string; teamsPerTournament: number }>
): string => {
  const candidates = extractTournamentIdCandidates(filename);
  if (candidates.length === 0) {
    return 'The filename does not contain a 5 to 7 digit tournament ID, so the app cannot map it automatically.';
  }

  for (const candidate of candidates) {
    const prefixMatches = formats.filter(
      (format) =>
        format.tournamentIdPrefix.length > 0 &&
        candidate.length === format.tournamentIdPrefix.length + 4 &&
        candidate.startsWith(format.tournamentIdPrefix)
    );

    if (prefixMatches.length === 0) {
      continue;
    }

    const compatibleMatches = prefixMatches.filter((format) =>
      formatMatchesTeamCount(format.teamsPerTournament, teamCount)
    );

    if (compatibleMatches.length === 0) {
      return teamCount > 0
        ? `The filename looks like tournament ID ${candidate}, but none of the cached formats with that prefix accept this file's ${teamCount} detected teams.`
        : `The filename looks like tournament ID ${candidate}, but none of the cached formats with that prefix are eligible for automatic assignment.`;
    }

    if (compatibleMatches.length > 1) {
      return `The filename looks like tournament ID ${candidate}, but more than one cached format shares that tournament ID prefix, so the app will not guess.`;
    }
  }

  return `The filename contains ${candidates.join(', ')}, but none of those IDs match a cached tournament prefix on this desktop.`;
};

export type QueueRowActionKey =
  | 'assign'
  | 'retry'
  | 'reauth'
  | 'ignore'
  | 'dismissDuplicate'
  | 'dismissWorking'
  | 'removeAwaiting'
  | 'restore';

// `reauth` also requires a selected server profile at render time; callers must AND that in themselves.
export const getQueueRowActionKeys = (job: LocalUploadJob): QueueRowActionKey[] => {
  const keys: QueueRowActionKey[] = [];
  if (job.localState === 'awaiting_format_assignment') {
    keys.push('assign');
  }
  if (job.localState === 'failed_retryable' || job.localState === 'failed_terminal') {
    keys.push('retry');
  }
  if (job.localState === 'auth_blocked') {
    keys.push('reauth');
  }
  if (canIgnoreUploadJob(job)) {
    keys.push('ignore');
  }
  if (job.localState === 'detected' || job.localState === 'queued_local') {
    keys.push('dismissWorking');
  }
  if (job.localState === 'duplicate_skipped_local') {
    keys.push('dismissDuplicate');
  }
  if (job.localState === 'awaiting_format_assignment') {
    keys.push('removeAwaiting');
  }
  if (job.localState === 'ignored') {
    keys.push('restore');
  }
  return keys;
};

type ApiErrorDetail = Record<string, unknown>;

const humanizeErrorCode = (code: string): string => {
  const spaced = code.replace(/_/g, ' ').trim();
  return spaced.length > 0 ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : spaced;
};

const asRecord = (value: unknown): ApiErrorDetail | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as ApiErrorDetail) : null;

// Codes the desktop app and the xips-pt server are known to return for failed_retryable jobs.
const describeKnownErrorCode = (code: string, detail: ApiErrorDetail): string | null => {
  switch (code) {
    case 'team_count_mismatch':
    case 'format_team_count_mismatch': {
      const inner = asRecord(detail.error) ?? detail;
      const expected = inner.expected ?? inner.minimumAllowed;
      const actual = inner.actual;
      if (typeof expected === 'number' && typeof actual === 'number') {
        return `Expected at least ${expected} team${expected === 1 ? '' : 's'} in the export, but only ${actual} ${actual === 1 ? 'was' : 'were'} detected.`;
      }
      return 'The export does not have enough distinct teams for this tournament format.';
    }
    case 'variant_limit_exceeded': {
      const inner = asRecord(detail.details) ?? detail;
      const teamName = inner.teamName;
      const allowed = inner.allowed;
      const actual = inner.actual;
      if (typeof teamName === 'string' && typeof allowed === 'number' && typeof actual === 'number') {
        const formatName = typeof inner.formatName === 'string' ? ` for ${inner.formatName}` : '';
        return `${teamName} has ${actual} variant card${actual === 1 ? '' : 's'}, which exceeds the ${allowed}-card limit${formatName}.`;
      }
      return 'A team in this export has more variant cards than the format allows.';
    }
    case 'authentication_required':
      return 'The selected account needs to sign in again.';
    case 'format_not_found':
      return 'The assigned tournament format is no longer cached on this desktop.';
    case 'request_failed':
      return 'The server could not process the request.';
    case 'response_read_failed':
      return 'The server response could not be read.';
    default:
      return null;
  }
};

const describeUnknownErrorDetail = (detail: ApiErrorDetail): string => {
  const inner = asRecord(detail.error) ?? detail;
  const message = inner.message ?? inner.error;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  const entries = Object.entries(inner).filter(
    ([key, value]) => key !== 'ok' && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
  );
  return entries.length > 0 ? entries.map(([key, value]) => `${humanizeErrorCode(key)}: ${value}`).join(', ') : '';
};

// Rust's ApiError Display is `code ({"json":"detail"}) [requestId=...]`; turn that into a sentence.
export const formatRetryableFailureMessage = (rawError: string): string => {
  const trimmed = rawError.trim();
  if (!trimmed) {
    return '';
  }

  const match = trimmed.match(/^([a-zA-Z0-9_]+)\s\((.*)\)(?:\s\[requestId=([^\]]*)\])?$/s);
  if (!match) {
    return /^[a-zA-Z0-9_]+$/.test(trimmed) ? (describeKnownErrorCode(trimmed, {}) ?? humanizeErrorCode(trimmed)) : trimmed;
  }

  const [, code, detailText, requestId] = match;
  const humanizedCode = humanizeErrorCode(code);
  let parsedDetail: unknown = null;
  try {
    parsedDetail = JSON.parse(detailText);
  } catch {
    parsedDetail = null;
  }
  const detailRecord = asRecord(parsedDetail);

  let sentence = '';
  if (detailRecord) {
    sentence = describeKnownErrorCode(code, detailRecord) ?? describeUnknownErrorDetail(detailRecord);
  }
  if (!sentence && parsedDetail === null && detailText.trim()) {
    sentence = detailText.trim();
  }

  const parts = sentence && sentence !== humanizedCode ? [humanizedCode, sentence] : [humanizedCode];
  const message = parts.join(': ');
  return requestId && requestId.trim() ? `${message} (request ${requestId.trim()})` : message;
};

export type VariantLimitExceededDetail = {
  kind: 'variant_limit_exceeded';
  teamName: string;
  formatName: string | null;
  actual: number;
  allowed: number;
};

export type RetryableFailureDetail = VariantLimitExceededDetail;

// Structured breakdown for failure codes with a details pane, distinct from the one-line summary above.
export const parseRetryableFailureDetail = (rawError: string): RetryableFailureDetail | null => {
  const trimmed = rawError.trim();
  const match = trimmed.match(/^([a-zA-Z0-9_]+)\s\((.*)\)(?:\s\[requestId=([^\]]*)\])?$/s);
  if (!match || match[1] !== 'variant_limit_exceeded') {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[2]);
  } catch {
    return null;
  }

  const details = asRecord(asRecord(parsed)?.details);
  if (!details) {
    return null;
  }
  const { teamName, allowed, actual, formatName } = details;
  if (typeof teamName !== 'string' || typeof allowed !== 'number' || typeof actual !== 'number') {
    return null;
  }
  return {
    kind: 'variant_limit_exceeded',
    teamName,
    formatName: typeof formatName === 'string' ? formatName : null,
    actual,
    allowed
  };
};
