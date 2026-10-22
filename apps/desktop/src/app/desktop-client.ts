import { invoke } from '@tauri-apps/api/core';
import type {
  CardsResponse,
  DesktopPreferences,
  DesktopSnapshot,
  LocalDetectedFile,
  LocalDiagnosticEvent,
  LocalFormatRule,
  LocalServerProfile,
  LocalUploadJob,
  LocalWatchRoot,
  MyAggResponse,
  SaveServerProfileResult,
  ServiceHealth,
  TournamentFormat
} from '@xips/api-contract';

type SaveServerProfileInput = {
  id?: string;
  name: string;
  baseUrl: string;
  gameVersion?: string;
};

type AddWatchRootInput = {
  profileId: string;
  path: string;
  recursive: boolean;
};

type SaveFormatRuleInput = {
  profileId: string;
  watchRootId: string;
  matchType: 'folder' | 'filename';
  pattern: string;
  formatId: string;
  formatName: string;
};

type AssignDetectedFileFormatInput = {
  detectedFileId: string;
  formatId: string;
};

type AssignDetectedFileTournamentInput = {
  detectedFileId: string;
  tournamentId: string;
};

type DesktopClient = {
  getSnapshot: () => Promise<DesktopSnapshot>;
  saveServerProfile: (input: SaveServerProfileInput) => Promise<SaveServerProfileResult>;
  deleteServerProfile: (profileId: string) => Promise<void>;
  selectServerProfile: (profileId: string) => Promise<void>;
  useDefaultServer: () => Promise<void>;
  checkServerHealth: (profileId: string) => Promise<ServiceHealth>;
  fetchFormats: (profileId: string) => Promise<TournamentFormat[]>;
  fetchCards: (profileId: string, formatId: string) => Promise<CardsResponse>;
  fetchMyAgg: (profileId: string) => Promise<MyAggResponse>;
  openAuthWindow: (profileId: string) => Promise<void>;
  redeemAuthCode: (profileId: string, code: string) => Promise<void>;
  refreshMe: (profileId: string) => Promise<void>;
  logout: (profileId: string) => Promise<void>;
  addWatchRoot: (input: AddWatchRootInput) => Promise<void>;
  getDefaultWatchRoot: () => Promise<string>;
  saveFormatRule: (input: SaveFormatRuleInput) => Promise<void>;
  deleteFormatRule: (formatRuleId: string) => Promise<void>;
  scanWatchRoots: (profileId: string) => Promise<void>;
  assignDetectedFileFormat: (input: AssignDetectedFileFormatInput) => Promise<void>;
  assignDetectedFileTournament: (input: AssignDetectedFileTournamentInput) => Promise<void>;
  deleteWatchRoot: (watchRootId: string) => Promise<void>;
  toggleWatchRoot: (watchRootId: string, paused: boolean) => Promise<void>;
  processUploadQueue: (profileId: string) => Promise<void>;
  pollActiveUploads: (profileId: string) => Promise<void>;
  retryUploadJob: (uploadJobId: string) => Promise<void>;
  dismissDuplicateUploadJob: (uploadJobId: string) => Promise<void>;
  dismissWorkingUploadJob: (uploadJobId: string) => Promise<void>;
  ignoreUploadJob: (uploadJobId: string) => Promise<void>;
  restoreIgnoredUploadJob: (uploadJobId: string) => Promise<void>;
  removeAwaitingUploadJob: (uploadJobId: string) => Promise<void>;
  openUploadFileLocation: (uploadJobId: string) => Promise<void>;
  updatePreferences: (preferences: DesktopPreferences) => Promise<void>;
  addDiagnosticEvent: (event: Omit<LocalDiagnosticEvent, 'id' | 'createdAt'>) => Promise<void>;
  exportDiagnosticsBundle: () => Promise<string>;
  openAppDataDirectory: () => Promise<void>;
};

const mockDefaultProfile: LocalServerProfile = {
  id: 'xips-default',
  name: 'XiPS',
  baseUrl: 'https://xips.xtoforas.com',
  gameVersion: 'ootp27',
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const mockCustomProfile: LocalServerProfile = {
  id: 'local',
  name: 'Local xips-pt',
  baseUrl: 'http://localhost:8080',
  gameVersion: 'ootp27',
  isDefault: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const MOCK_DEFAULT_WATCH_ROOT = 'C:\\Users\\example\\Documents\\Out of the Park Developments\\OOTP Baseball 27\\online_data';

const mockWatchRoot = (profileId: string, path = '/Users/example/Downloads/PT Exports'): LocalWatchRoot => ({
  id: `watch-${profileId}-${Math.random().toString(36).slice(2, 8)}`,
  profileId,
  path,
  recursive: false,
  paused: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const MOCK_JOB_ROOT = '/Users/example/Downloads/PT Exports';

const mockFormats: TournamentFormat[] = [
  {
    id: 'format-207',
    name: "Laptophound's Daily 5L Deadball",
    gameVersion: 'ootp27',
    formatType: 'Daily',
    tournamentIdPrefix: '207',
    tournamentId: '',
    isDraft: false,
    categories: [],
    runEnvironment: '1916',
    parkKey: 'Harrison Park 1915',
    mode: 'Best of 7',
    capValue: '',
    variantLimitValue: '',
    ovrMin: 40,
    ovrMax: 79,
    teamsPerTournament: 64,
    isSlotsTournament: false,
    slotCounts: { P: 0, D: 0, G: 0, S: 0, B: 0 },
    eraRestrictions: [],
    cardTypeRestrictions: []
  },
  {
    id: 'format-713',
    name: 'Live-Plus Bronze Pop-up',
    gameVersion: 'ootp27',
    formatType: 'Event',
    tournamentIdPrefix: '',
    tournamentId: '713',
    isDraft: false,
    categories: [],
    runEnvironment: '1916',
    parkKey: 'Harrison Park 1915',
    mode: 'Best of 7',
    capValue: '',
    variantLimitValue: '',
    ovrMin: 40,
    ovrMax: 79,
    teamsPerTournament: 128,
    isSlotsTournament: false,
    slotCounts: { P: 0, D: 0, G: 0, S: 0, B: 0 },
    eraRestrictions: [],
    cardTypeRestrictions: []
  }
];

// One blocked job per kind of reason the Today and Queue pages explain, plus one job on the server and one done.
const mockUploadJob = (
  id: string,
  folder: string,
  filename: string,
  localState: LocalUploadJob['localState'],
  teamCount: number,
  error = ''
): LocalUploadJob => {
  const now = new Date().toISOString();
  return {
    id,
    profileId: mockDefaultProfile.id,
    filename,
    path: `${MOCK_JOB_ROOT}/${folder}/${filename}`,
    stagedPath: '',
    fileKind: 'stats_export',
    localPresence: 'present',
    localState,
    lifecyclePhase: null,
    checksum: id,
    teamCount,
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
    queuedAt: now,
    processingAt: '',
    parsedAt: '',
    refreshingAt: '',
    completedAt: '',
    failedAt: localState.startsWith('failed') ? now : '',
    error,
    retries: localState === 'failed_retryable' ? 1 : 0,
    createdAt: now,
    updatedAt: now
  };
};

const mockUploadJobs: LocalUploadJob[] = [
  { ...mockUploadJob('job-league', 'League', '2050.403.csv', 'queued_local', 30), formatId: '2050.403' },
  mockUploadJob('job-league-blocked', 'League', '2051.452.csv', 'awaiting_format_assignment', 40),
  mockUploadJob('job-deadball', 'PD-D-LTH-Deadball-E1913', '2070146.csv', 'awaiting_format_assignment', 123),
  mockUploadJob(
    'job-cap',
    'D-S-C2068-E2007',
    '1910116.csv',
    'failed_terminal',
    63,
    'cap_limit_exceeded ({"ok":false,"error":"cap_limit_exceeded","details":{"teamName":"Cymru Crushers","allowed":1610,"actual":1667,"formatName":"Daily Low Gold Cap"}}) [requestId=mock-1]'
  ),
  mockUploadJob('job-502', 'D-I-Slots-E1999', '1880115.csv', 'failed_retryable', 31, 'request_failed (error code: 502) [requestId=mock-2]'),
  { ...mockUploadJob('job-event', 'Pop-ups', '713.csv', 'queued_local', 100), formatId: 'format-713', tournamentId: '713' },
  { ...mockUploadJob('job-server', 'D-LS', '1970026.csv', 'server_queued', 64), lifecyclePhase: 'queued', formatId: 'format-207' },
  { ...mockUploadJob('job-done', 'D-LS', '1970023.csv', 'complete', 64), lifecyclePhase: 'complete', formatId: 'format-207' },
  mockUploadJob(
    'job-long-name',
    'breslau_binturings_-_hotl_rosters',
    'statistics_player_statistics_-_sortable_stats_export-fielding-xips.csv',
    'awaiting_format_assignment',
    48
  )
];

// Browser-mock scenarios for `npm run dev`: add `?mock=<scenario>` before the `#` in the URL,
// e.g. http://localhost:1420/?mock=first-run#/today. Without it the mock starts mid-setup.
export type MockScenario = 'first-run' | 'mid-setup' | 'done' | 'custom' | 'unreachable';

const MOCK_SCENARIOS: readonly MockScenario[] = ['first-run', 'mid-setup', 'done', 'custom', 'unreachable'];

const readMockScenario = (): MockScenario => {
  if (typeof window === 'undefined') {
    return 'mid-setup';
  }
  const value = new URLSearchParams(window.location.search).get('mock') ?? '';
  return (MOCK_SCENARIOS as readonly string[]).includes(value) ? (value as MockScenario) : 'mid-setup';
};

const mockAuthUser = { userId: 'mock-user', discordId: 'mock-discord', displayName: 'Mock Player', role: 'viewer' as const };

const mockTokenExpiry = (): string => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const mockSnapshot = (scenario: MockScenario): DesktopSnapshot => {
  const custom = scenario === 'custom';
  const profileId = custom ? mockCustomProfile.id : mockDefaultProfile.id;
  const signedIn = scenario === 'done' || scenario === 'custom' || scenario === 'unreachable';
  const hasFolder = scenario !== 'first-run';
  return {
    profiles: custom ? [mockCustomProfile, mockDefaultProfile] : [mockDefaultProfile],
    selectedProfileId: profileId,
    authProfileId: signedIn ? profileId : '',
    authUser: signedIn ? mockAuthUser : null,
    tokenExpiresAt: signedIn ? mockTokenExpiry() : '',
    watchRoots: hasFolder ? [mockWatchRoot(profileId, MOCK_JOB_ROOT)] : [],
    formatRules: [],
    detectedFiles: [] as LocalDetectedFile[],
    uploadJobs: scenario === 'first-run' ? [] : mockUploadJobs.map((job) => ({ ...job, profileId })),
    uploadAttempts: [],
    preferences: {
      launchAtLogin: false,
      closeToTray: true,
      pollingIntervalSeconds: 5,
      diagnosticsRetentionDays: 14,
      dismissAutomationRuleReadiness: false,
      dismissCompletedReadinessCard: false
    },
    diagnostics: [],
    cachedFormats: mockFormats
  };
};

// Fired after the browser mock changes its state, standing in for Tauri's snapshot event.
export const MOCK_SNAPSHOT_EVENT = 'xips-mock-snapshot-updated';

export const isTauri = (): boolean => typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__ === 'object';

const mockScenario = readMockScenario();
let mockState = mockSnapshot(mockScenario);

const updateMockState = (update: (current: DesktopSnapshot) => DesktopSnapshot): void => {
  mockState = update(mockState);
  window.dispatchEvent(new Event(MOCK_SNAPSHOT_EVENT));
};

const browserClient: DesktopClient = {
  async getSnapshot() {
    return structuredClone(mockState);
  },
  async saveServerProfile(input) {
    let parsed: URL;
    try {
      parsed = new URL(input.baseUrl.trim());
    } catch {
      throw 'Enter a full server address, like https://example.com.';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw 'Server address must start with http:// or https://.';
    }
    const now = new Date().toISOString();
    const id = input.id || `mock-${Math.random().toString(36).slice(2, 8)}`;
    const profile: LocalServerProfile = {
      id,
      name: input.name.trim(),
      baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
      gameVersion: input.gameVersion?.trim() || 'ootp27',
      isDefault: false,
      createdAt: now,
      updatedAt: now
    };
    updateMockState((current) => ({
      ...current,
      profiles: [profile, ...current.profiles.filter((item) => item.id !== id)],
      selectedProfileId: id
    }));
    const localHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    return {
      warning: parsed.protocol === 'http:' && !localHost
        ? "This server uses plain http, so your sign-in isn't encrypted in transit. Use https unless this is a local test server."
        : ''
    };
  },
  async deleteServerProfile(profileId) {
    if (profileId === mockDefaultProfile.id) {
      throw "The built-in XiPS server can't be removed.";
    }
    updateMockState((current) => ({
      ...current,
      profiles: current.profiles.filter((profile) => profile.id !== profileId),
      watchRoots: current.watchRoots.filter((root) => root.profileId !== profileId),
      selectedProfileId: current.selectedProfileId === profileId ? mockDefaultProfile.id : current.selectedProfileId
    }));
  },
  async selectServerProfile(profileId) {
    updateMockState((current) => ({ ...current, selectedProfileId: profileId }));
  },
  async useDefaultServer() {
    updateMockState((current) => ({ ...current, selectedProfileId: mockDefaultProfile.id }));
  },
  async checkServerHealth() {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (mockScenario === 'unreachable') {
      throw 'request_failed (error sending request)';
    }
    return {
      ok: true,
      service: 'mock',
      queueDepth: 0,
      failedJobs: 0,
      timestamp: new Date().toISOString()
    };
  },
  async fetchFormats() {
    return mockFormats;
  },
  async fetchCards() {
    return {
      ok: true,
      rows: [],
      source: 'admin'
    };
  },
  async fetchMyAgg() {
    return {
      ok: true,
      cards: [],
      teams: []
    };
  },
  async openAuthWindow() {},
  async redeemAuthCode(profileId, code) {
    if (!/^[A-Z0-9]{6,12}$/.test(code)) {
      throw 'invalid_code';
    }
    updateMockState((current) => ({
      ...current,
      authProfileId: profileId,
      authUser: mockAuthUser,
      tokenExpiresAt: mockTokenExpiry()
    }));
  },
  async refreshMe() {},
  async logout() {
    updateMockState((current) => ({ ...current, authProfileId: '', authUser: null, tokenExpiresAt: '' }));
  },
  async addWatchRoot(input) {
    updateMockState((current) => ({
      ...current,
      watchRoots: [...current.watchRoots, { ...mockWatchRoot(input.profileId, input.path), recursive: input.recursive }]
    }));
  },
  async getDefaultWatchRoot() {
    return MOCK_DEFAULT_WATCH_ROOT;
  },
  async saveFormatRule() {},
  async deleteFormatRule() {},
  async scanWatchRoots() {},
  async assignDetectedFileFormat() {},
  async assignDetectedFileTournament() {},
  async deleteWatchRoot(watchRootId) {
    updateMockState((current) => ({ ...current, watchRoots: current.watchRoots.filter((root) => root.id !== watchRootId) }));
  },
  async toggleWatchRoot(watchRootId, paused) {
    updateMockState((current) => ({
      ...current,
      watchRoots: current.watchRoots.map((root) => (root.id === watchRootId ? { ...root, paused } : root))
    }));
  },
  async processUploadQueue() {},
  async pollActiveUploads() {},
  async retryUploadJob() {},
  async dismissDuplicateUploadJob() {},
  async dismissWorkingUploadJob() {},
  async ignoreUploadJob() {},
  async restoreIgnoredUploadJob() {},
  async removeAwaitingUploadJob() {},
  async openUploadFileLocation() {},
  async updatePreferences(preferences) {
    updateMockState((current) => ({ ...current, preferences }));
  },
  async addDiagnosticEvent() {},
  async exportDiagnosticsBundle() {
    return '';
  },
  async openAppDataDirectory() {}
};

const tauriClient: DesktopClient = {
  getSnapshot: () => invoke<DesktopSnapshot>('desktop_get_snapshot'),
  saveServerProfile: (input) => invoke<SaveServerProfileResult>('desktop_save_server_profile', { input }),
  deleteServerProfile: (profileId) => invoke<void>('desktop_delete_server_profile', { profileId }),
  selectServerProfile: (profileId) => invoke<void>('desktop_select_server_profile', { profileId }),
  useDefaultServer: () => invoke<void>('desktop_use_default_server'),
  checkServerHealth: (profileId) => invoke<ServiceHealth>('desktop_check_server_health', { profileId }),
  fetchFormats: (profileId) => invoke<TournamentFormat[]>('desktop_fetch_formats', { profileId }),
  fetchCards: (profileId, formatId) => invoke<CardsResponse>('desktop_fetch_cards', { profileId, formatId }),
  fetchMyAgg: (profileId) => invoke<MyAggResponse>('desktop_fetch_my_agg', { profileId }),
  openAuthWindow: (profileId) => invoke<void>('desktop_open_auth_window', { profileId }),
  redeemAuthCode: (profileId, code) => invoke<void>('desktop_redeem_auth_code', { input: { profileId, code } }),
  refreshMe: (profileId) => invoke<void>('desktop_refresh_me', { profileId }),
  logout: (profileId) => invoke<void>('desktop_logout', { profileId }),
  addWatchRoot: (input) => invoke<void>('desktop_add_watch_root', { input }),
  getDefaultWatchRoot: () => invoke<string>('desktop_get_default_watch_root'),
  saveFormatRule: (input) => invoke<void>('desktop_save_format_rule', { input }),
  deleteFormatRule: (formatRuleId) => invoke<void>('desktop_delete_format_rule', { formatRuleId }),
  scanWatchRoots: (profileId) => invoke<void>('desktop_scan_watch_roots', { profileId }),
  assignDetectedFileFormat: (input) => invoke<void>('desktop_assign_detected_file_format', { input }),
  assignDetectedFileTournament: (input) => invoke<void>('desktop_assign_detected_file_tournament', { input }),
  deleteWatchRoot: (watchRootId) => invoke<void>('desktop_delete_watch_root', { watchRootId }),
  toggleWatchRoot: (watchRootId, paused) =>
    invoke<void>('desktop_toggle_watch_root', { watchRootId, paused }),
  processUploadQueue: (profileId) => invoke<void>('desktop_process_upload_queue', { profileId }),
  pollActiveUploads: (profileId) => invoke<void>('desktop_poll_active_uploads', { profileId }),
  retryUploadJob: (uploadJobId) => invoke<void>('desktop_retry_upload_job', { uploadJobId }),
  dismissDuplicateUploadJob: (uploadJobId) =>
    invoke<void>('desktop_dismiss_duplicate_upload_job', { uploadJobId }),
  dismissWorkingUploadJob: (uploadJobId) =>
    invoke<void>('desktop_dismiss_working_upload_job', { uploadJobId }),
  ignoreUploadJob: (uploadJobId) => invoke<void>('desktop_ignore_upload_job', { uploadJobId }),
  restoreIgnoredUploadJob: (uploadJobId) =>
    invoke<void>('desktop_restore_ignored_upload_job', { uploadJobId }),
  removeAwaitingUploadJob: (uploadJobId) =>
    invoke<void>('desktop_remove_awaiting_upload_job', { uploadJobId }),
  openUploadFileLocation: (uploadJobId) => invoke<void>('desktop_open_upload_file_location', { uploadJobId }),
  updatePreferences: (preferences) => invoke<void>('desktop_update_preferences', { input: preferences }),
  addDiagnosticEvent: (event) => invoke<void>('desktop_add_diagnostic_event', { event }),
  exportDiagnosticsBundle: () => invoke<string>('desktop_export_diagnostics_bundle'),
  openAppDataDirectory: () => invoke<void>('desktop_open_app_data_directory')
};

export const desktopClient = isTauri() ? tauriClient : browserClient;
