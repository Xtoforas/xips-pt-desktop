import { describe, expect, test } from 'vitest';
import type { LocalUploadJob } from '@xips/api-contract';
import {
  blockerPriority,
  canDismissUploadJob,
  canIgnoreUploadJob,
  compareUploadJobsNewestFirst,
  diagnoseFilenameAutoAssignment,
  explainFilenameAutoAssignment,
  formatUploadFormatLabel,
  leagueFormatIdFromFilename,
  parseLeagueFormatId,
  formatLifecycleLabel,
  formatMatchesTeamCount,
  formatQueueStateLabel,
  formatRetryableFailureMessage,
  formatUploadJobChecksumStatusLabel,
  getIncompleteTeamCountWarning,
  getQueueRowActionKeys,
  isQueueJobDone,
  parseRetryableFailureDetail,
  queueWorkspaceViewForJob,
  summarizeBlockedJob,
  uploadJobFolderName,
  uploadJobNeedsAttention,
  uploadJobWaitingOnServer,
  uploadJobWorkingAutomatically,
  type QueueRowActionKey,
  type QueueWorkspaceView
} from './queue-model';

const ALL_LOCAL_STATES: LocalUploadJob['localState'][] = [
  'detected',
  'awaiting_format_assignment',
  'queued_local',
  'duplicate_skipped_local',
  'ignored',
  'uploading',
  'uploaded_waiting_server',
  'server_queued',
  'server_processing',
  'server_refresh_pending',
  'server_refreshing',
  'complete',
  'failed_retryable',
  'failed_terminal',
  'auth_blocked'
];

const makeUploadJob = (overrides: Partial<LocalUploadJob> = {}): LocalUploadJob => ({
  id: 'job-1',
  profileId: 'profile-1',
  filename: 'stats_export_12345.csv',
  path: '/tmp/stats_export_12345.csv',
  stagedPath: '',
  fileKind: 'stats_export',
  localPresence: 'present',
  localState: 'detected',
  lifecyclePhase: null,
  checksum: 'abc123',
  teamCount: 0,
  sourceModifiedAt: '',
  formatId: '',
  tournamentId: '',
  uploadId: '',
  serverStatus: '',
  remoteChecksum: '',
  lastRequestId: '',
  duplicateReason: '',
  ignoredFromState: '',
  nextRetryAfter: '',
  queuedAt: '',
  processingAt: '',
  parsedAt: '',
  refreshingAt: '',
  completedAt: '',
  failedAt: '',
  error: '',
  retries: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides
});

describe('queueWorkspaceViewForJob', () => {
  const expectedView: Record<LocalUploadJob['localState'], QueueWorkspaceView> = {
    detected: 'working',
    awaiting_format_assignment: 'needs_action',
    queued_local: 'working',
    duplicate_skipped_local: 'done',
    ignored: 'ignored',
    uploading: 'working',
    uploaded_waiting_server: 'working',
    server_queued: 'working',
    server_processing: 'working',
    server_refresh_pending: 'working',
    server_refreshing: 'working',
    complete: 'done',
    failed_retryable: 'needs_action',
    failed_terminal: 'needs_action',
    auth_blocked: 'needs_action'
  };

  test.each(ALL_LOCAL_STATES)('maps %s to the expected tab', (localState) => {
    const job = makeUploadJob({ localState });
    expect(queueWorkspaceViewForJob(job)).toBe(expectedView[localState]);
  });

  test('needs-attention beats ignored beats working priority', () => {
    // awaiting_format_assignment is also a member of no other bucket, so this just pins
    // the priority order documented in queueWorkspaceViewForJob: attention > ignored > working > done.
    expect(queueWorkspaceViewForJob(makeUploadJob({ localState: 'auth_blocked' }))).toBe('needs_action');
    expect(queueWorkspaceViewForJob(makeUploadJob({ localState: 'ignored' }))).toBe('ignored');
  });
});

describe('isQueueJobDone', () => {
  test.each(ALL_LOCAL_STATES)('agrees with queueWorkspaceViewForJob for %s', (localState) => {
    const job = makeUploadJob({ localState });
    expect(isQueueJobDone(job)).toBe(queueWorkspaceViewForJob(job) === 'done');
  });

  test('is true for exactly complete and duplicate_skipped_local (failed_terminal now needs attention)', () => {
    const doneStates = ALL_LOCAL_STATES.filter((localState) => isQueueJobDone(makeUploadJob({ localState })));
    expect(doneStates.sort()).toEqual(['complete', 'duplicate_skipped_local'].sort());
  });
});

describe('upload job classification predicates', () => {
  const expectedFlags: Record<
    LocalUploadJob['localState'],
    { needsAttention: boolean; workingAutomatically: boolean; waitingOnServer: boolean }
  > = {
    detected: { needsAttention: false, workingAutomatically: true, waitingOnServer: false },
    awaiting_format_assignment: { needsAttention: true, workingAutomatically: false, waitingOnServer: false },
    queued_local: { needsAttention: false, workingAutomatically: true, waitingOnServer: false },
    duplicate_skipped_local: { needsAttention: false, workingAutomatically: false, waitingOnServer: false },
    ignored: { needsAttention: false, workingAutomatically: false, waitingOnServer: false },
    uploading: { needsAttention: false, workingAutomatically: true, waitingOnServer: false },
    uploaded_waiting_server: { needsAttention: false, workingAutomatically: true, waitingOnServer: true },
    server_queued: { needsAttention: false, workingAutomatically: true, waitingOnServer: true },
    server_processing: { needsAttention: false, workingAutomatically: true, waitingOnServer: true },
    server_refresh_pending: { needsAttention: false, workingAutomatically: true, waitingOnServer: true },
    server_refreshing: { needsAttention: false, workingAutomatically: true, waitingOnServer: true },
    complete: { needsAttention: false, workingAutomatically: false, waitingOnServer: false },
    failed_retryable: { needsAttention: true, workingAutomatically: false, waitingOnServer: false },
    failed_terminal: { needsAttention: true, workingAutomatically: false, waitingOnServer: false },
    auth_blocked: { needsAttention: true, workingAutomatically: false, waitingOnServer: false }
  };

  test.each(ALL_LOCAL_STATES)('reports the expected flags for %s', (localState) => {
    const job = makeUploadJob({ localState });
    const expected = expectedFlags[localState];
    expect(uploadJobNeedsAttention(job)).toBe(expected.needsAttention);
    expect(uploadJobWorkingAutomatically(job)).toBe(expected.workingAutomatically);
    expect(uploadJobWaitingOnServer(job)).toBe(expected.waitingOnServer);
  });
});

describe('canIgnoreUploadJob', () => {
  test.each(ALL_LOCAL_STATES)('is true iff %s needs attention or is working automatically', (localState) => {
    const job = makeUploadJob({ localState });
    expect(canIgnoreUploadJob(job)).toBe(uploadJobNeedsAttention(job) || uploadJobWorkingAutomatically(job));
  });
});

describe('canDismissUploadJob (the "dismiss is only offered when safe" rule)', () => {
  const dismissibleStates: LocalUploadJob['localState'][] = [
    'duplicate_skipped_local',
    'awaiting_format_assignment',
    'detected',
    'queued_local'
  ];

  test.each(dismissibleStates)('allows dismissing a %s row', (localState) => {
    expect(canDismissUploadJob(makeUploadJob({ localState }))).toBe(true);
  });

  test.each(ALL_LOCAL_STATES.filter((state) => !dismissibleStates.includes(state)))(
    'refuses to dismiss a %s row',
    (localState) => {
      expect(canDismissUploadJob(makeUploadJob({ localState }))).toBe(false);
    }
  );

  test('working rows that already left the local machine cannot be dismissed', () => {
    // Among the "working automatically" states, only detected/queued_local (still local-only)
    // are dismissible; uploading and every server_* state must refuse, even though they're
    // all "working". This is the safety rule the task asked to pin down with a test.
    const workingButNotDismissible: LocalUploadJob['localState'][] = [
      'uploading',
      'uploaded_waiting_server',
      'server_queued',
      'server_processing',
      'server_refresh_pending',
      'server_refreshing'
    ];
    for (const localState of workingButNotDismissible) {
      const job = makeUploadJob({ localState });
      expect(uploadJobWorkingAutomatically(job)).toBe(true);
      expect(canDismissUploadJob(job)).toBe(false);
    }
  });
});

describe('getQueueRowActionKeys', () => {
  const expectedActions: Record<LocalUploadJob['localState'], QueueRowActionKey[]> = {
    detected: ['ignore', 'dismissWorking'],
    awaiting_format_assignment: ['assign', 'ignore', 'removeAwaiting'],
    queued_local: ['ignore', 'dismissWorking'],
    duplicate_skipped_local: ['dismissDuplicate'],
    ignored: ['restore'],
    uploading: ['ignore'],
    uploaded_waiting_server: ['ignore'],
    server_queued: ['ignore'],
    server_processing: ['ignore'],
    server_refresh_pending: ['ignore'],
    server_refreshing: ['ignore'],
    complete: [],
    failed_retryable: ['retry', 'ignore'],
    failed_terminal: ['retry', 'ignore'],
    auth_blocked: ['reauth', 'ignore']
  };

  test.each(ALL_LOCAL_STATES)('returns the expected action set for %s', (localState) => {
    const job = makeUploadJob({ localState });
    expect(getQueueRowActionKeys(job).sort()).toEqual([...expectedActions[localState]].sort());
  });
});

describe('ignore / restore transitions', () => {
  test('an ignored row always reports the ignored tab regardless of what it was ignored from', () => {
    const ignoredFromWorking = makeUploadJob({ localState: 'ignored', ignoredFromState: 'queued_local' });
    const ignoredFromBlocked = makeUploadJob({ localState: 'ignored', ignoredFromState: 'awaiting_format_assignment' });
    expect(queueWorkspaceViewForJob(ignoredFromWorking)).toBe('ignored');
    expect(queueWorkspaceViewForJob(ignoredFromBlocked)).toBe('ignored');
    expect(getQueueRowActionKeys(ignoredFromWorking)).toEqual(['restore']);
  });

  test('restoring recovers the tab the row was ignored from', () => {
    const ignoredFromState: LocalUploadJob['localState'] = 'awaiting_format_assignment';
    const restored = makeUploadJob({ localState: ignoredFromState, ignoredFromState: '' });
    expect(queueWorkspaceViewForJob(restored)).toBe('needs_action');
  });
});

describe('formatQueueStateLabel', () => {
  test.each(ALL_LOCAL_STATES)('labels %s for a stats export', (localState) => {
    expect(formatQueueStateLabel(localState, 'stats_export')).not.toBe('');
  });

  test('overrides complete and server_refresh_pending to "Catalog Updated" for card catalogs', () => {
    expect(formatQueueStateLabel('complete', 'card_catalog')).toBe('Catalog Updated');
    expect(formatQueueStateLabel('server_refresh_pending', 'card_catalog')).toBe('Catalog Updated');
    expect(formatQueueStateLabel('complete', 'stats_export')).toBe('Complete');
  });

  test('does not override other card-catalog states', () => {
    expect(formatQueueStateLabel('detected', 'card_catalog')).toBe('Detected');
  });
});

describe('formatLifecycleLabel', () => {
  test('reports "Not Started" for a null phase', () => {
    expect(formatLifecycleLabel(null, 'stats_export')).toBe('Not Started');
  });

  test('overrides complete and refresh_pending to "Catalog Updated" for card catalogs', () => {
    expect(formatLifecycleLabel('complete', 'card_catalog')).toBe('Catalog Updated');
    expect(formatLifecycleLabel('refresh_pending', 'card_catalog')).toBe('Catalog Updated');
    expect(formatLifecycleLabel('complete', 'stats_export')).toBe('Complete');
  });
});

describe('formatUploadJobChecksumStatusLabel', () => {
  test('prioritizes duplicateReason over remoteChecksum', () => {
    expect(formatUploadJobChecksumStatusLabel({ duplicateReason: 'name+size match', remoteChecksum: 'xyz' })).toBe(
      'Duplicate'
    );
  });

  test('reports Uploaded once a remote checksum exists', () => {
    expect(formatUploadJobChecksumStatusLabel({ duplicateReason: '', remoteChecksum: 'xyz' })).toBe('Uploaded');
  });

  test('reports Pending otherwise', () => {
    expect(formatUploadJobChecksumStatusLabel({ duplicateReason: '', remoteChecksum: '' })).toBe('Pending');
  });
});

describe('blockerPriority', () => {
  test('orders auth_blocked before awaiting_format_assignment before failed_retryable before failed_terminal', () => {
    expect(blockerPriority.auth_blocked).toBeLessThan(blockerPriority.awaiting_format_assignment);
    expect(blockerPriority.awaiting_format_assignment).toBeLessThan(blockerPriority.failed_retryable);
    expect(blockerPriority.failed_retryable).toBeLessThan(blockerPriority.failed_terminal);
  });
});

describe('formatMatchesTeamCount', () => {
  test('accepts when either side is unset (0)', () => {
    expect(formatMatchesTeamCount(0, 12)).toBe(true);
    expect(formatMatchesTeamCount(16, 0)).toBe(true);
  });

  test('accepts a team count at or under the format size', () => {
    expect(formatMatchesTeamCount(16, 16)).toBe(true);
    expect(formatMatchesTeamCount(16, 10)).toBe(true);
  });

  test('rejects a team count over the format size', () => {
    expect(formatMatchesTeamCount(16, 17)).toBe(false);
  });
});

describe('getIncompleteTeamCountWarning', () => {
  test('warns when a stats export has fewer teams than the assigned format expects', () => {
    const warning = getIncompleteTeamCountWarning('stats_export', 12, { name: '16-Team Classic', teamsPerTournament: 16 });
    expect(warning).toEqual({
      badgeLabel: '12/16 teams',
      message: expect.stringContaining('12 distinct team codes')
    });
  });

  test('is silent for card catalogs', () => {
    expect(getIncompleteTeamCountWarning('card_catalog', 12, { name: 'x', teamsPerTournament: 16 })).toBeNull();
  });

  test('is silent once the team count reaches the format size', () => {
    expect(getIncompleteTeamCountWarning('stats_export', 16, { name: 'x', teamsPerTournament: 16 })).toBeNull();
  });

  test('is silent without an assigned format', () => {
    expect(getIncompleteTeamCountWarning('stats_export', 12, null)).toBeNull();
  });
});

describe('formatRetryableFailureMessage', () => {
  test('turns a team_count_mismatch ApiError into a readable sentence', () => {
    const raw = 'team_count_mismatch ({"ok":false,"error":{"expected":2,"actual":1,"minimumAllowed":2}}) [requestId=4dbd-48f0-bbae-5d40fc61a604]';
    expect(formatRetryableFailureMessage(raw)).toBe(
      'Team count mismatch: Expected at least 2 teams in the export, but only 1 was detected. (request 4dbd-48f0-bbae-5d40fc61a604)'
    );
  });

  test('describes known codes even without a matching detail shape', () => {
    expect(formatRetryableFailureMessage('authentication_required ({})')).toBe(
      'Authentication required: The selected account needs to sign in again.'
    );
  });

  test('falls back to a labeled key/value list for unknown codes with a JSON object detail, ignoring "ok"', () => {
    const raw = 'some_new_server_code ({"ok":false,"reason":"disk_full"})';
    expect(formatRetryableFailureMessage(raw)).toBe('Some new server code: Reason: disk_full');
  });

  test('falls back to the raw detail text when it is not JSON', () => {
    expect(formatRetryableFailureMessage('request_failed (Connection timed out)')).toBe(
      'Request failed: Connection timed out'
    );
  });

  test('handles a bare known code with no parenthesized detail', () => {
    expect(formatRetryableFailureMessage('format_team_count_mismatch')).toBe(
      'The export does not have enough distinct teams for this tournament format.'
    );
  });

  test('passes through an unrecognized bare string unchanged', () => {
    expect(formatRetryableFailureMessage('connection reset by peer')).toBe('connection reset by peer');
  });

  test('returns an empty string for empty input', () => {
    expect(formatRetryableFailureMessage('')).toBe('');
  });

  test('reads the server team_count_mismatch shape, which nests counts under details', () => {
    const raw =
      'team_count_mismatch ({"ok":false,"error":"team_count_mismatch","details":{"expected":64,"actual":32,"minimumAllowed":48,"maxAbsent":16,"absent":32,"formatName":"Daily Bronze Only Cap"}}) [requestId=r1]';
    expect(formatRetryableFailureMessage(raw)).toBe(
      'Team count mismatch: Expected at least 48 of 64 teams in the export, but only 32 were detected. (request r1)'
    );
  });

  test('summarizes cap, slot, and rating-range rejections from the server', () => {
    expect(
      formatRetryableFailureMessage(
        'cap_limit_exceeded ({"ok":false,"error":"cap_limit_exceeded","details":{"teamName":"Cymru Crushers","allowed":1610,"actual":1667,"formatName":"Daily Low Gold Cap"}})'
      )
    ).toBe("Cap limit exceeded: Cymru Crushers's cards total 1667, over the 1610 cap for Daily Low Gold Cap.");
    expect(
      formatRetryableFailureMessage(
        'slot_limit_exceeded ({"ok":false,"error":"slot_limit_exceeded","details":{"teamName":"Absolute Units","slotTier":"S","allowed":20,"actual":21,"formatName":"Daily All-Star Hardware Slots"}})'
      )
    ).toBe('Slot limit exceeded: Absolute Units has 21 Silver slot cards, over the limit of 20 for Daily All-Star Hardware Slots.');
    expect(
      formatRetryableFailureMessage(
        'ovr_range_violation ({"ok":false,"error":"ovr_range_violation","details":{"teamName":"The Black Freighter TBD","cardId":83868,"actual":59,"minimumAllowed":60,"maximumAllowed":69}})'
      )
    ).toBe('Ovr range violation: The Black Freighter TBD has card 83868 rated 59, outside the 60-69 range.');
  });

  test('can leave out the request id for compact lists', () => {
    expect(formatRetryableFailureMessage('request_failed (error code: 502) [requestId=abc]', { includeRequestId: false })).toBe(
      'Request failed: error code: 502'
    );
  });

  test('summarizes a real variant_limit_exceeded payload captured from the server', () => {
    const raw =
      'variant_limit_exceeded ({"ok":false,"error":"variant_limit_exceeded","details":{"teamName":"Freedom Grabbers - HotL","allowed":5,"actual":6,"formatId":"c7305d8d-5caa-4189-b0d5-72035c6471c4","formatName":"Wednesday Ice to See You"}}) [requestId=ef5d6835-e0d4-48f4-8281-1b1f09d2fb4d]';
    expect(formatRetryableFailureMessage(raw)).toBe(
      'Variant limit exceeded: Freedom Grabbers - HotL has 6 variant cards, which exceeds the 5-card limit for Wednesday Ice to See You. (request ef5d6835-e0d4-48f4-8281-1b1f09d2fb4d)'
    );
  });
});

describe('parseRetryableFailureDetail', () => {
  const realVariantLimitError =
    'variant_limit_exceeded ({"ok":false,"error":"variant_limit_exceeded","details":{"teamName":"Freedom Grabbers - HotL","allowed":5,"actual":6,"formatId":"c7305d8d-5caa-4189-b0d5-72035c6471c4","formatName":"Wednesday Ice to See You"}}) [requestId=ef5d6835-e0d4-48f4-8281-1b1f09d2fb4d]';

  test('extracts team, format, actual count, and limit from a real payload', () => {
    expect(parseRetryableFailureDetail(realVariantLimitError)).toEqual({
      kind: 'variant_limit_exceeded',
      teamName: 'Freedom Grabbers - HotL',
      formatName: 'Wednesday Ice to See You',
      actual: 6,
      allowed: 5
    });
  });

  test('omits formatName when the server does not include it', () => {
    const raw = 'variant_limit_exceeded ({"details":{"teamName":"Ice Breakers","allowed":10,"actual":12}})';
    expect(parseRetryableFailureDetail(raw)).toEqual({
      kind: 'variant_limit_exceeded',
      teamName: 'Ice Breakers',
      formatName: null,
      actual: 12,
      allowed: 10
    });
  });

  test('returns null for unrelated error codes', () => {
    expect(parseRetryableFailureDetail('team_count_mismatch ({"error":{"expected":2,"actual":1}})')).toBeNull();
  });

  test('returns null when the details shape is missing expected fields', () => {
    expect(parseRetryableFailureDetail('variant_limit_exceeded ({"ok":false})')).toBeNull();
  });

  test('returns null for malformed input', () => {
    expect(parseRetryableFailureDetail('not an api error')).toBeNull();
    expect(parseRetryableFailureDetail('')).toBeNull();
  });
});

const prefixFormats = [
  { id: 'f-102', name: 'Bronze Quick', tournamentIdPrefix: '102', teamsPerTournament: 16 },
  { id: 'f-207', name: "Laptophound's Daily 5L Deadball", tournamentIdPrefix: '207', teamsPerTournament: 64 },
  { id: 'f-140a', name: 'Daily Wide Open', tournamentIdPrefix: '140', teamsPerTournament: 64 },
  { id: 'f-140b', name: 'Daily Wide Open (copy)', tournamentIdPrefix: '140', teamsPerTournament: 64 }
];

describe('explainFilenameAutoAssignment', () => {
  test('explains each reason a filename was not auto-assigned', () => {
    expect(explainFilenameAutoAssignment('league-roster-export.csv', 0, prefixFormats)).toBe(
      'The filename does not contain a 5 to 7 digit tournament ID, so the app cannot map it automatically.'
    );
    expect(explainFilenameAutoAssignment('2070146.csv', 123, prefixFormats)).toBe(
      "The filename looks like tournament ID 2070146, but none of the cached formats with that prefix accept this file's 123 detected teams."
    );
    expect(explainFilenameAutoAssignment('1400101.csv', 60, prefixFormats)).toBe(
      'The filename looks like tournament ID 1400101, but more than one cached format shares that tournament ID prefix, so the app will not guess.'
    );
    expect(explainFilenameAutoAssignment('9990001.csv', 60, prefixFormats)).toBe(
      'The filename contains 9990001, but none of those IDs match a cached tournament prefix on this desktop.'
    );
  });
});

describe('league format helpers', () => {
  test('parseLeagueFormatId validates ranges and names levels', () => {
    expect(parseLeagueFormatId('2050.403')).toEqual({ year: 2050, leagueNumber: 403, levelLabel: 'Low Diamond' });
    expect(parseLeagueFormatId('1959.500')?.levelLabel).toBe('Perfect League');
    expect(parseLeagueFormatId('2050.50')?.levelLabel).toBe('Iron');
    expect(parseLeagueFormatId('2050.99')?.levelLabel).toBe('Iron');
    expect(parseLeagueFormatId('2050.100')?.levelLabel).toBe('Low Bronze');
    expect(parseLeagueFormatId('2050.499')?.levelLabel).toBe('High Diamond');
    expect(parseLeagueFormatId('2050.49')).toBeNull();
    expect(parseLeagueFormatId('2050.501')).toBeNull();
    expect(parseLeagueFormatId('1899.100')).toBeNull();
    expect(parseLeagueFormatId('f-102')).toBeNull();
  });

  test('leagueFormatIdFromFilename only accepts the whole-name pattern', () => {
    expect(leagueFormatIdFromFilename('2050.403.csv')).toBe('2050.403');
    expect(leagueFormatIdFromFilename('2050.050.CSV')).toBe('2050.50');
    expect(leagueFormatIdFromFilename('2026-04-03.csv')).toBeNull();
    expect(leagueFormatIdFromFilename('2070146.csv')).toBeNull();
    expect(leagueFormatIdFromFilename('Q-Bronze-2026-04-03.csv')).toBeNull();
    expect(leagueFormatIdFromFilename('2050.501.csv')).toBeNull();
  });

  test('formatUploadFormatLabel covers unassigned, league, known and unknown ids', () => {
    const labels = { 'f-102': 'Bronze Quick' };
    expect(formatUploadFormatLabel('', labels)).toBe('Unassigned');
    expect(formatUploadFormatLabel('2050.403', labels)).toBe('League 2050.403 · Low Diamond');
    expect(formatUploadFormatLabel('f-102', labels)).toBe('Bronze Quick');
    expect(formatUploadFormatLabel('f-999', labels)).toBe('Unknown format');
  });

  test('diagnoses league files before tournament checks', () => {
    expect(diagnoseFilenameAutoAssignment('2050.403.csv', 40, prefixFormats)).toEqual({
      kind: 'league_team_count',
      teamCount: 40
    });
    expect(diagnoseFilenameAutoAssignment('2050.501.csv', 30, prefixFormats)).toEqual({
      kind: 'league_number_invalid',
      leagueNumber: 501
    });
    expect(diagnoseFilenameAutoAssignment('2050.403.csv', 30, prefixFormats).kind).toBe('no_tournament_id');
    expect(explainFilenameAutoAssignment('2050.403.csv', 40, prefixFormats)).toContain('24 to 36 teams');
    expect(explainFilenameAutoAssignment('2050.501.csv', 30, prefixFormats)).toContain('league number 501');
    const awaiting = (filename: string, teamCount: number) =>
      summarizeBlockedJob(makeUploadJob({ localState: 'awaiting_format_assignment', filename, teamCount }), prefixFormats);
    expect(awaiting('2050.403.csv', 40).reason).toBe('League files need 24-36 teams; this has 40.');
    expect(awaiting('2050.501.csv', 30).reason).toBe('League number 501 is outside 50-500.');
  });
});

describe('summarizeBlockedJob', () => {
  test('gives a short format-match reason for files waiting on a format', () => {
    const awaiting = (filename: string, teamCount: number) =>
      summarizeBlockedJob(makeUploadJob({ localState: 'awaiting_format_assignment', filename, teamCount }), prefixFormats);
    expect(awaiting('league-roster-export.csv', 0)).toEqual({
      owner: 'user',
      statusLabel: 'Needs format',
      reason: 'No tournament ID in the filename.'
    });
    expect(awaiting('2070146.csv', 123).reason).toBe('No prefix 207 format accepts 123 teams.');
    expect(awaiting('1400101.csv', 60).reason).toBe('Several formats share prefix 140.');
    expect(awaiting('9990001.csv', 60).reason).toBe('No format for prefix 999.');
  });

  test('marks retryable failures as automatic and rejections as needing the user', () => {
    const retryable = summarizeBlockedJob(
      makeUploadJob({ localState: 'failed_retryable', error: 'request_failed (error code: 502) [requestId=abc]' }),
      prefixFormats
    );
    expect(retryable).toEqual({ owner: 'automatic', statusLabel: 'Will retry', reason: 'Request failed: error code: 502' });

    const rejected = summarizeBlockedJob(
      makeUploadJob({
        localState: 'failed_terminal',
        error:
          'cap_limit_exceeded ({"ok":false,"error":"cap_limit_exceeded","details":{"teamName":"Cymru Crushers","allowed":1610,"actual":1667}}) [requestId=abc]'
      }),
      prefixFormats
    );
    expect(rejected).toEqual({
      owner: 'user',
      statusLabel: 'Rejected',
      reason: "Cap limit exceeded: Cymru Crushers's cards total 1667, over the 1610 cap."
    });
  });

  test('asks the user to sign in for auth-blocked jobs', () => {
    expect(summarizeBlockedJob(makeUploadJob({ localState: 'auth_blocked' }), prefixFormats)).toEqual({
      owner: 'user',
      statusLabel: 'Sign in',
      reason: 'Sign in again to resume uploads.'
    });
  });
});

describe('uploadJobFolderName', () => {
  test('returns the parent folder for Windows and POSIX paths', () => {
    expect(uploadJobFolderName({ path: 'C:\\Users\\me\\PT27\\data\\D-LS\\1970019.csv' })).toBe('D-LS');
    expect(uploadJobFolderName({ path: '/tmp/watch/Q-Bronze-Bo5-T16/1025202.csv' })).toBe('Q-Bronze-Bo5-T16');
    expect(uploadJobFolderName({ path: '1970019.csv' })).toBe('');
  });
});

describe('compareUploadJobsNewestFirst', () => {
  test('orders by source modified time, then queue update time, with untimed jobs last', () => {
    const jobs = [
      makeUploadJob({ id: 'untimed', sourceModifiedAt: '', updatedAt: '' }),
      makeUploadJob({ id: 'old-source', sourceModifiedAt: '1000', updatedAt: '' }),
      makeUploadJob({ id: 'queue-only', sourceModifiedAt: '', updatedAt: '2026-10-07T00:00:00.000Z' }),
      makeUploadJob({ id: 'new-source', sourceModifiedAt: String(Date.parse('2026-10-08T00:00:00.000Z')), updatedAt: '' })
    ];
    expect([...jobs].sort(compareUploadJobsNewestFirst).map((job) => job.id)).toEqual([
      'new-source',
      'queue-only',
      'old-source',
      'untimed'
    ]);
  });
});
