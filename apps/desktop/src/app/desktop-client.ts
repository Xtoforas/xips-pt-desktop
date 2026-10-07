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
  saveServerProfile: (input: SaveServerProfileInput) => Promise<void>;
  deleteServerProfile: (profileId: string) => Promise<void>;
  selectServerProfile: (profileId: string) => Promise<void>;
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

const mockProfiles: LocalServerProfile[] = [
  {
    id: 'local',
    name: 'Local xips-pt',
    baseUrl: 'http://localhost:8080',
    gameVersion: 'ootp27',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const mockWatchRoots: LocalWatchRoot[] = [
  {
    id: 'watch-1',
    profileId: 'local',
    path: '/Users/example/Downloads/PT Exports',
    recursive: false,
    paused: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

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
    profileId: 'local',
    filename,
    path: `${mockWatchRoots[0].path}/${folder}/${filename}`,
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

const mockSnapshot = (): DesktopSnapshot => ({
  profiles: mockProfiles,
  selectedProfileId: 'local',
  authProfileId: '',
  authUser: null,
  tokenExpiresAt: '',
  watchRoots: mockWatchRoots,
  formatRules: [],
  detectedFiles: [] as LocalDetectedFile[],
  uploadJobs: mockUploadJobs,
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
});

export const isTauri = (): boolean => typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__ === 'object';

const browserClient: DesktopClient = {
  async getSnapshot() {
    return mockSnapshot();
  },
  async saveServerProfile() {},
  async deleteServerProfile() {},
  async selectServerProfile() {},
  async checkServerHealth() {
    return {
      ok: false,
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
  async redeemAuthCode() {},
  async refreshMe() {},
  async logout() {},
  async addWatchRoot() {},
  async getDefaultWatchRoot() {
    return '';
  },
  async saveFormatRule() {},
  async deleteFormatRule() {},
  async scanWatchRoots() {},
  async assignDetectedFileFormat() {},
  async assignDetectedFileTournament() {},
  async deleteWatchRoot() {},
  async toggleWatchRoot() {},
  async processUploadQueue() {},
  async pollActiveUploads() {},
  async retryUploadJob() {},
  async dismissDuplicateUploadJob() {},
  async dismissWorkingUploadJob() {},
  async ignoreUploadJob() {},
  async restoreIgnoredUploadJob() {},
  async removeAwaitingUploadJob() {},
  async openUploadFileLocation() {},
  async updatePreferences() {},
  async addDiagnosticEvent() {},
  async exportDiagnosticsBundle() {
    return '';
  },
  async openAppDataDirectory() {}
};

const tauriClient: DesktopClient = {
  getSnapshot: () => invoke<DesktopSnapshot>('desktop_get_snapshot'),
  saveServerProfile: (input) => invoke<void>('desktop_save_server_profile', { input }),
  deleteServerProfile: (profileId) => invoke<void>('desktop_delete_server_profile', { profileId }),
  selectServerProfile: (profileId) => invoke<void>('desktop_select_server_profile', { profileId }),
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
