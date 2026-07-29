import { invoke } from '@tauri-apps/api/core';
import type {
  CardsResponse,
  DesktopPreferences,
  DesktopSnapshot,
  LocalDetectedFile,
  LocalDiagnosticEvent,
  LocalFormatRule,
  LocalServerProfile,
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
  completeAuth: (profileId: string) => Promise<void>;
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

const mockSnapshot = (): DesktopSnapshot => ({
  profiles: mockProfiles,
  selectedProfileId: 'local',
  authProfileId: '',
  authUser: null,
  tokenExpiresAt: '',
  watchRoots: mockWatchRoots,
  formatRules: [],
  detectedFiles: [] as LocalDetectedFile[],
  uploadJobs: [],
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
  cachedFormats: []
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
    return [];
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
  async completeAuth() {},
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
  completeAuth: (profileId) => invoke<void>('desktop_complete_auth', { input: { profileId } }),
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
