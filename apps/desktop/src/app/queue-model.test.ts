import { describe, expect, test } from 'vitest';
import type { LocalUploadJob } from '@xips/api-contract';
import {
  blockerPriority,
  canDismissUploadJob,
  canIgnoreUploadJob,
  formatLifecycleLabel,
  formatMatchesTeamCount,
  formatQueueStateLabel,
  formatUploadJobChecksumStatusLabel,
  getIncompleteTeamCountWarning,
  getQueueRowActionKeys,
  isQueueJobDone,
  queueWorkspaceViewForJob,
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
    failed_terminal: 'done',
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

  test('is true for exactly complete, duplicate_skipped_local, and failed_terminal', () => {
    const doneStates = ALL_LOCAL_STATES.filter((localState) => isQueueJobDone(makeUploadJob({ localState })));
    expect(doneStates.sort()).toEqual(['complete', 'duplicate_skipped_local', 'failed_terminal'].sort());
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
    failed_terminal: { needsAttention: false, workingAutomatically: false, waitingOnServer: false },
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
    failed_terminal: [],
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
  test('orders auth_blocked before awaiting_format_assignment before failed_retryable', () => {
    expect(blockerPriority.auth_blocked).toBeLessThan(blockerPriority.awaiting_format_assignment);
    expect(blockerPriority.awaiting_format_assignment).toBeLessThan(blockerPriority.failed_retryable);
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
