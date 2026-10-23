import type { LocalDetectedFile, LocalUploadJob, TournamentFormat } from '@xips/api-contract';
import { formatDateTime, pluralize } from './format';

export const lifecycleColor = (value: string | null): string => {
  switch (value) {
    case 'complete':
      return 'teal';
    case 'refreshing':
      return 'cyan';
    case 'refresh_pending':
    case 'processing':
    case 'queued':
      return 'blue';
    case 'failed':
      return 'red';
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
    case 'uploaded_waiting_server':
    case 'server_queued':
    case 'server_processing':
    case 'server_refresh_pending':
    case 'server_refreshing':
      return 'blue';
    case 'failed_retryable':
    case 'awaiting_format_assignment':
      return 'orange';
    case 'failed_terminal':
    case 'auth_blocked':
      return 'red';
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

const queueStateLabels: Record<LocalUploadJob['localState'], string> = {
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

export const formatQueueStateLabel = (
  state: LocalUploadJob['localState'],
  fileKind: LocalUploadJob['fileKind']
): string => {
  if (fileKind === 'card_catalog' && (state === 'complete' || state === 'server_refresh_pending')) {
    return 'Catalog Updated';
  }
  return queueStateLabels[state];
};

const lifecycleLabels: Record<NonNullable<LocalUploadJob['lifecyclePhase']>, string> = {
  queued: 'Queued',
  processing: 'Processing',
  refresh_pending: 'Refresh Pending',
  refreshing: 'Refreshing',
  complete: 'Complete',
  failed: 'Failed',
  skipped_duplicate: 'Skipped as Duplicate'
};

export const formatLifecycleLabel = (
  phase: LocalUploadJob['lifecyclePhase'],
  fileKind: LocalUploadJob['fileKind']
): string => {
  if (fileKind === 'card_catalog' && (phase === 'complete' || phase === 'refresh_pending')) {
    return 'Catalog Updated';
  }
  return phase ? lifecycleLabels[phase] : 'Not Started';
};

export const formatLocalPresenceLabel = (presence: LocalUploadJob['localPresence']): string =>
  presence === 'present' ? 'Present' : 'Missing';

const detectedFileStateLabels: Record<LocalDetectedFile['localState'], string> = {
  detected: 'Detected',
  queued_local: 'Queued Locally',
  awaiting_format_assignment: 'Awaiting Format Assignment',
  ignored: 'Ignored'
};

export const formatDetectedFileStateLabel = (state: LocalDetectedFile['localState']): string =>
  detectedFileStateLabels[state];

export const getUploadJobModifiedAt = (job: LocalUploadJob): number | null => {
  const sourceModifiedAt = Number(job.sourceModifiedAt);
  if (Number.isFinite(sourceModifiedAt) && sourceModifiedAt > 0) {
    return sourceModifiedAt;
  }

  const queueUpdatedAt = Date.parse(job.updatedAt);
  return Number.isFinite(queueUpdatedAt) ? queueUpdatedAt : null;
};

// Sort comparator: most recently modified job first; jobs without a timestamp sort last.
export const compareUploadJobsNewestFirst = (left: LocalUploadJob, right: LocalUploadJob): number =>
  (getUploadJobModifiedAt(right) ?? 0) - (getUploadJobModifiedAt(left) ?? 0);

// Short date and time that fits one table line, as the xips-pt site's admin tables show them.
export const COMPACT_TIMESTAMP: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' };

export const formatUploadJobModifiedAt = (job: LocalUploadJob, options?: Intl.DateTimeFormatOptions): string =>
  formatDateTime(getUploadJobModifiedAt(job), options);

export const formatSourceModifiedAt = (sourceModifiedAt: string): string => {
  const parsed = Number(sourceModifiedAt);
  return Number.isFinite(parsed) && parsed > 0 ? formatDateTime(parsed) : '-';
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

// tournamentId is the exact id of an Event format (Pop-ups, PTCS Period 7); its prefix is empty.
type PrefixFormat = {
  id: string;
  name: string;
  tournamentIdPrefix: string;
  tournamentId?: string;
  teamsPerTournament: number;
};

const exactEventFormats = <T extends PrefixFormat>(formats: T[], tournamentId: string): T[] =>
  formats.filter((format) => !!format.tournamentId && format.tournamentId === tournamentId);

// Formats a tournament id maps to: exact Event ids first (skipping prefix rules for that id), then prefixes.
export const matchFormatsForTournamentId = <T extends PrefixFormat>(
  formats: T[],
  tournamentId: string,
  teamCount: number
): T[] => {
  const exact = exactEventFormats(formats, tournamentId);
  if (exact.length > 0) {
    return exact.filter((format) => formatMatchesTeamCount(format.teamsPerTournament, teamCount));
  }
  return formats.filter(
    (format) =>
      format.tournamentIdPrefix.length > 0 &&
      tournamentId.length === format.tournamentIdPrefix.length + 4 &&
      tournamentId.startsWith(format.tournamentIdPrefix) &&
      formatMatchesTeamCount(format.teamsPerTournament, teamCount)
  );
};

// Digit runs that exactly equal an Event format id. Runs under 5 digits only count as the whole filename stem.
const eventIdCandidates = (filename: string, formats: PrefixFormat[]): string[] => {
  const dot = filename.lastIndexOf('.');
  const stem = dot >= 0 ? filename.slice(0, dot) : filename;
  const runs = filename.match(/\d+/gu) ?? [];
  return [...new Set(runs)].filter(
    (run) => exactEventFormats(formats, run).length > 0 && (run.length >= 5 || run === stem)
  );
};

const leagueLevelLabel = (leagueNumber: number): string => {
  if (leagueNumber === 500) return 'Perfect League';
  const tier = Math.floor(leagueNumber / 50);
  const labels: Record<number, string> = {
    1: 'Iron',
    2: 'Low Bronze',
    3: 'High Bronze',
    4: 'Low Silver',
    5: 'High Silver',
    6: 'Low Gold',
    7: 'High Gold',
    8: 'Low Diamond',
    9: 'High Diamond'
  };
  return labels[tier] ?? '';
};

// League format ids are "<year>.<leagueNumber>", year 1900-9999, number 50-500.
export const parseLeagueFormatId = (
  id: string
): { year: number; leagueNumber: number; levelLabel: string } | null => {
  const match = /^(\d{4})\.(\d{2,3})$/u.exec(id);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const leagueNumber = Number(match[2]);
  if (year < 1900 || leagueNumber < 50 || leagueNumber > 500) {
    return null;
  }
  return { year, leagueNumber, levelLabel: leagueLevelLabel(leagueNumber) };
};

// Strict: the whole filename must be "<year>.<number>.csv".
export const leagueFormatIdFromFilename = (filename: string): string | null => {
  const match = /^(\d{4}\.\d{2,3})\.csv$/iu.exec(filename);
  const parsed = match ? parseLeagueFormatId(match[1]) : null;
  return parsed ? `${parsed.year}.${parsed.leagueNumber}` : null;
};

// Select option label: the format name, plus its tournament id prefix when it has one.
export const formatOptionLabel = (format: Pick<TournamentFormat, 'name' | 'tournamentIdPrefix'>): string =>
  format.tournamentIdPrefix ? `${format.name} (${format.tournamentIdPrefix}xxxx)` : format.name;

export const formatUploadFormatLabel = (formatId: string, formatLabels: Record<string, string>): string => {
  if (!formatId) {
    return 'Unassigned';
  }
  const league = parseLeagueFormatId(formatId);
  if (league) {
    return `League ${formatId} · ${league.levelLabel}`;
  }
  return formatLabels[formatId] ?? 'Unknown format';
};

export type FilenameAutoAssignmentDiagnosis =
  | { kind: 'league_number_invalid'; leagueNumber: number }
  | { kind: 'league_team_count'; teamCount: number }
  | { kind: 'no_tournament_id' }
  | { kind: 'no_format_for_team_count'; candidate: string; prefix: string; teamCount: number }
  | { kind: 'ambiguous_prefix'; candidate: string; prefix: string }
  | { kind: 'event_team_count'; candidate: string; formatName: string; teamCount: number }
  | { kind: 'no_matching_prefix'; candidates: string[] };

// Why a filename was not auto-assigned; explainFilenameAutoAssignment and summarizeBlockedJob word it.
export const diagnoseFilenameAutoAssignment = (
  filename: string,
  teamCount: number,
  formats: PrefixFormat[]
): FilenameAutoAssignmentDiagnosis => {
  const leagueName = /^(\d{4})\.(\d{2,3})\.csv$/iu.exec(filename);
  if (leagueName) {
    const leagueNumber = Number(leagueName[2]);
    if (!parseLeagueFormatId(`${leagueName[1]}.${leagueName[2]}`)) {
      return { kind: 'league_number_invalid', leagueNumber };
    }
    if (teamCount !== 0 && (teamCount < 24 || teamCount > 36)) {
      return { kind: 'league_team_count', teamCount };
    }
  }

  const eventCandidates = eventIdCandidates(filename, formats);
  for (const candidate of eventCandidates) {
    const exact = exactEventFormats(formats, candidate);
    const compatible = exact.filter((format) => formatMatchesTeamCount(format.teamsPerTournament, teamCount));
    if (compatible.length === 0) {
      return { kind: 'event_team_count', candidate, formatName: exact[0].name, teamCount };
    }
    if (compatible.length > 1) {
      return { kind: 'ambiguous_prefix', candidate, prefix: '' };
    }
  }

  const candidates = extractTournamentIdCandidates(filename);
  if (candidates.length === 0 && eventCandidates.length === 0) {
    return { kind: 'no_tournament_id' };
  }

  for (const candidate of candidates) {
    if (eventCandidates.includes(candidate)) {
      continue;
    }
    const prefixMatches = formats.filter(
      (format) =>
        format.tournamentIdPrefix.length > 0 &&
        candidate.length === format.tournamentIdPrefix.length + 4 &&
        candidate.startsWith(format.tournamentIdPrefix)
    );
    if (prefixMatches.length === 0) {
      continue;
    }
    const prefix = prefixMatches[0].tournamentIdPrefix;
    const compatibleMatches = prefixMatches.filter((format) =>
      formatMatchesTeamCount(format.teamsPerTournament, teamCount)
    );
    if (compatibleMatches.length === 0) {
      return { kind: 'no_format_for_team_count', candidate, prefix, teamCount };
    }
    if (compatibleMatches.length > 1) {
      return { kind: 'ambiguous_prefix', candidate, prefix };
    }
  }

  return { kind: 'no_matching_prefix', candidates };
};

export const explainFilenameAutoAssignment = (
  filename: string,
  teamCount: number,
  formats: PrefixFormat[]
): string => {
  const diagnosis = diagnoseFilenameAutoAssignment(filename, teamCount, formats);
  switch (diagnosis.kind) {
    case 'league_number_invalid':
      return `The filename looks like a league export, but league number ${diagnosis.leagueNumber} is outside the valid 50 to 500 range (or the year is before 1900), so the app will not assign it.`;
    case 'league_team_count':
      return `The filename looks like a league export, but league files need 24 to 36 teams and this one has ${diagnosis.teamCount}, so the app will not assign it automatically.`;
    case 'no_tournament_id':
      return 'The filename does not contain a 5 to 7 digit tournament ID, so the app cannot map it automatically.';
    case 'no_format_for_team_count':
      return diagnosis.teamCount > 0
        ? `The filename looks like tournament ID ${diagnosis.candidate}, but none of the cached formats with that prefix accept this file's ${diagnosis.teamCount} detected teams.`
        : `The filename looks like tournament ID ${diagnosis.candidate}, but none of the cached formats with that prefix are eligible for automatic assignment.`;
    case 'event_team_count':
      return `The filename looks like event tournament ID ${diagnosis.candidate} (${diagnosis.formatName}), but none of the cached event formats with that ID accept this file's ${diagnosis.teamCount} detected teams.`;
    case 'ambiguous_prefix':
      return diagnosis.prefix
        ? `The filename looks like tournament ID ${diagnosis.candidate}, but more than one cached format shares that tournament ID prefix, so the app will not guess.`
        : `The filename looks like tournament ID ${diagnosis.candidate}, but more than one cached event format uses that exact ID, so the app will not guess.`;
    case 'no_matching_prefix':
      return `The filename contains ${diagnosis.candidates.join(', ')}, but none of those IDs match a cached tournament prefix on this desktop.`;
  }
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

// The one action a queue row shows inline; the inspector and the bulk bar hold the rest (ignore, remove).
const QUEUE_ROW_PRIMARY_ACTIONS: readonly QueueRowActionKey[] = ['assign', 'retry', 'reauth', 'restore', 'dismissDuplicate', 'dismissWorking'];

export const getQueueRowPrimaryAction = (job: LocalUploadJob): QueueRowActionKey | null => {
  const keys = getQueueRowActionKeys(job);
  return QUEUE_ROW_PRIMARY_ACTIONS.find((key) => keys.includes(key)) ?? null;
};

type ApiErrorDetail = Record<string, unknown>;

const humanizeErrorCode = (code: string): string => {
  const spaced = code.replace(/_/g, ' ').trim();
  return spaced.length > 0 ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : spaced;
};

const asRecord = (value: unknown): ApiErrorDetail | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as ApiErrorDetail) : null;

const slotTierLabels: Record<string, string> = { P: 'Perfect', D: 'Diamond', G: 'Gold', S: 'Silver', B: 'Bronze' };

const forFormat = (detail: ApiErrorDetail): string =>
  typeof detail.formatName === 'string' ? ` for ${detail.formatName}` : '';

// Codes the desktop app and the xips-pt server are known to return for failed jobs.
const describeKnownErrorCode = (code: string, detail: ApiErrorDetail): string | null => {
  switch (code) {
    case 'team_count_mismatch':
    case 'format_team_count_mismatch': {
      const inner = asRecord(detail.details) ?? asRecord(detail.error) ?? detail;
      const minimum = inner.minimumAllowed ?? inner.expected;
      const { expected, actual } = inner;
      if (typeof minimum === 'number' && typeof actual === 'number') {
        const ofFormat = typeof expected === 'number' && expected !== minimum ? ` of ${expected}` : '';
        return `Expected at least ${minimum}${ofFormat} team${minimum === 1 && !ofFormat ? '' : 's'} in the export, but only ${actual} ${actual === 1 ? 'was' : 'were'} detected.`;
      }
      return 'The export does not have enough distinct teams for this tournament format.';
    }
    case 'cap_limit_exceeded': {
      const inner = asRecord(detail.details) ?? detail;
      const { teamName, allowed, actual } = inner;
      if (typeof teamName === 'string' && typeof allowed === 'number' && typeof actual === 'number') {
        return `${teamName}'s cards total ${actual}, over the ${allowed} cap${forFormat(inner)}.`;
      }
      return 'A team in this export is over the format’s card value cap.';
    }
    case 'slot_limit_exceeded': {
      const inner = asRecord(detail.details) ?? detail;
      const { teamName, allowed, actual, slotTier } = inner;
      if (typeof teamName === 'string' && typeof allowed === 'number' && typeof actual === 'number') {
        const tier = typeof slotTier === 'string' ? `${slotTierLabels[slotTier] ?? slotTier} ` : '';
        return `${teamName} has ${actual} ${tier}slot cards, over the limit of ${allowed}${forFormat(inner)}.`;
      }
      return 'A team in this export uses more slot cards than the format allows.';
    }
    case 'ovr_range_violation': {
      const inner = asRecord(detail.details) ?? detail;
      const { teamName, actual, minimumAllowed, maximumAllowed, cardId } = inner;
      if (
        typeof teamName === 'string' &&
        typeof actual === 'number' &&
        typeof minimumAllowed === 'number' &&
        typeof maximumAllowed === 'number'
      ) {
        const card = typeof cardId === 'number' || typeof cardId === 'string' ? `card ${cardId}` : 'a card';
        return `${teamName} has ${card} rated ${actual}, outside the ${minimumAllowed}-${maximumAllowed} range${forFormat(inner)}.`;
      }
      return 'A card in this export is outside the format’s rating range.';
    }
    case 'variant_limit_exceeded': {
      const inner = asRecord(detail.details) ?? detail;
      const teamName = inner.teamName;
      const allowed = inner.allowed;
      const actual = inner.actual;
      if (typeof teamName === 'string' && typeof allowed === 'number' && typeof actual === 'number') {
        const formatName = typeof inner.formatName === 'string' ? ` for ${inner.formatName}` : '';
        return `${teamName} has ${actual} variant ${pluralize(actual, 'card')}, which exceeds the ${allowed}-card limit${formatName}.`;
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

type ParsedApiError = { code: string; detailText: string; detail: unknown; requestId: string };

// Rust's ApiError Display is `code (detail) [requestId=...]`, where detail is usually the server's JSON error body.
const parseApiErrorText = (rawError: string): ParsedApiError | null => {
  const match = rawError.trim().match(/^([a-zA-Z0-9_]+)\s\((.*)\)(?:\s\[requestId=([^\]]*)\])?$/s);
  if (!match) {
    return null;
  }
  const [, code, detailText, requestId = ''] = match;
  let detail: unknown = null;
  try {
    detail = JSON.parse(detailText);
  } catch {
    detail = null;
  }
  return { code, detailText, detail, requestId: requestId.trim() };
};

// Turn an ApiError string into a sentence.
export const formatRetryableFailureMessage = (
  rawError: string,
  { includeRequestId = true }: { includeRequestId?: boolean } = {}
): string => {
  const trimmed = rawError.trim();
  if (!trimmed) {
    return '';
  }

  const parsed = parseApiErrorText(trimmed);
  if (!parsed) {
    return /^[a-zA-Z0-9_]+$/.test(trimmed) ? (describeKnownErrorCode(trimmed, {}) ?? humanizeErrorCode(trimmed)) : trimmed;
  }

  const { code, detailText, detail: parsedDetail, requestId } = parsed;
  const humanizedCode = humanizeErrorCode(code);
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
  return includeRequestId && requestId ? `${message} (request ${requestId})` : message;
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
  const parsed = parseApiErrorText(rawError);
  if (parsed?.code !== 'variant_limit_exceeded') {
    return null;
  }

  const details = asRecord(asRecord(parsed.detail)?.details);
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

export type BlockedJobSummary = {
  // 'user' when only the user can unblock it; 'automatic' when the app will retry on its own.
  owner: 'user' | 'automatic';
  statusLabel: string;
  reason: string;
};

const summarizeFormatMatchProblem = (job: LocalUploadJob, formats: PrefixFormat[]): string => {
  const diagnosis = diagnoseFilenameAutoAssignment(job.filename, job.teamCount, formats);
  switch (diagnosis.kind) {
    case 'league_number_invalid':
      return `League number ${diagnosis.leagueNumber} is outside 50-500.`;
    case 'league_team_count':
      return `League files need 24-36 teams; this has ${diagnosis.teamCount}.`;
    case 'no_tournament_id':
      return 'No tournament ID in the filename.';
    case 'no_format_for_team_count':
      return diagnosis.teamCount > 0
        ? `No prefix ${diagnosis.prefix} format accepts ${diagnosis.teamCount} teams.`
        : `No prefix ${diagnosis.prefix} format is eligible for automatic assignment.`;
    case 'event_team_count':
      return `${diagnosis.formatName} (event ${diagnosis.candidate}) doesn't accept ${diagnosis.teamCount} teams.`;
    case 'ambiguous_prefix':
      return diagnosis.prefix
        ? `Several formats share prefix ${diagnosis.prefix}.`
        : `Several formats share event ID ${diagnosis.candidate}.`;
    case 'no_matching_prefix':
      return `No format for prefix ${[...new Set(diagnosis.candidates.map((candidate) => candidate.slice(0, -4)))].join(', ')}.`;
  }
};

// One-line status and reason for a blocked job, for compact lists such as the Today table.
export const summarizeBlockedJob = (job: LocalUploadJob, formats: PrefixFormat[]): BlockedJobSummary => {
  const failureReason = () =>
    formatRetryableFailureMessage(job.error ?? '', { includeRequestId: false }) || 'The upload failed.';
  switch (job.localState) {
    case 'auth_blocked':
      return { owner: 'user', statusLabel: 'Sign in', reason: 'Sign in again to resume uploads.' };
    case 'awaiting_format_assignment':
      return {
        owner: 'user',
        statusLabel: 'Needs format',
        reason:
          job.fileKind === 'stats_export'
            ? summarizeFormatMatchProblem(job, formats)
            : 'Waiting for a format before it can upload.'
      };
    case 'failed_retryable':
      return { owner: 'automatic', statusLabel: 'Will retry', reason: failureReason() };
    case 'failed_terminal':
      return { owner: 'user', statusLabel: 'Rejected', reason: failureReason() };
    default:
      return { owner: 'automatic', statusLabel: formatQueueStateLabel(job.localState, job.fileKind), reason: '' };
  }
};

// Name of the folder holding the job's source file (the tournament folder under the watch root).
export const uploadJobFolderName = (job: Pick<LocalUploadJob, 'path'>): string => {
  const parts = job.path.split(/[\\/]/u).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : '';
};
