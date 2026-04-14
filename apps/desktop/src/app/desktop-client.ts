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
  saveServerProfile: (input: SaveServerProfileInput) => Promise<DesktopSnapshot>;
  deleteServerProfile: (profileId: string) => Promise<DesktopSnapshot>;
  selectServerProfile: (profileId: string) => Promise<DesktopSnapshot>;
  checkServerHealth: (profileId: string) => Promise<ServiceHealth>;
  fetchFormats: (profileId: string) => Promise<TournamentFormat[]>;
  fetchCards: (profileId: string, formatId: string) => Promise<CardsResponse>;
  fetchMyAgg: (profileId: string) => Promise<MyAggResponse>;
  openAuthWindow: (profileId: string) => Promise<void>;
  completeAuth: (profileId: string) => Promise<void>;
  refreshMe: (profileId: string) => Promise<DesktopSnapshot>;
  logout: (profileId: string) => Promise<DesktopSnapshot>;
  addWatchRoot: (input: AddWatchRootInput) => Promise<DesktopSnapshot>;
  getDefaultWatchRoot: () => Promise<string>;
  saveFormatRule: (input: SaveFormatRuleInput) => Promise<DesktopSnapshot>;
  deleteFormatRule: (formatRuleId: string) => Promise<DesktopSnapshot>;
  scanWatchRoots: (profileId: string) => Promise<DesktopSnapshot>;
  assignDetectedFileFormat: (input: AssignDetectedFileFormatInput) => Promise<DesktopSnapshot>;
  assignDetectedFileTournament: (input: AssignDetectedFileTournamentInput) => Promise<DesktopSnapshot>;
  deleteWatchRoot: (watchRootId: string) => Promise<DesktopSnapshot>;
  toggleWatchRoot: (watchRootId: string, paused: boolean) => Promise<DesktopSnapshot>;
  processUploadQueue: (profileId: string) => Promise<DesktopSnapshot>;
  pollActiveUploads: (profileId: string) => Promise<DesktopSnapshot>;
  retryUploadJob: (uploadJobId: string) => Promise<DesktopSnapshot>;
  dismissDuplicateUploadJob: (uploadJobId: string) => Promise<DesktopSnapshot>;
  ignoreUploadJob: (uploadJobId: string) => Promise<DesktopSnapshot>;
  restoreIgnoredUploadJob: (uploadJobId: string) => Promise<DesktopSnapshot>;
  removeAwaitingUploadJob: (uploadJobId: string) => Promise<DesktopSnapshot>;
  openUploadFileLocation: (uploadJobId: string) => Promise<void>;
  updatePreferences: (preferences: DesktopPreferences) => Promise<DesktopSnapshot>;
  addDiagnosticEvent: (event: Omit<LocalDiagnosticEvent, 'id' | 'createdAt'>) => Promise<DesktopSnapshot>;
  exportDiagnosticsBundle: () => Promise<string>;
  openAppDataDirectory: () => Promise<void>;
};

const mockProfiles: LocalServerProfile[] = [
  {
    id: 'local',
    name: 'Local xips-pt',
    baseUrl: 'http://localhost:8080',
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
    dismissAutomationRuleReadiness: false
  },
  diagnostics: [],
  cachedFormats: []
});

const isTauri = (): boolean => typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__ === 'object';

const browserClient: DesktopClient = {
  async getSnapshot() {
    return mockSnapshot();
  },
  async saveServerProfile() {
    return mockSnapshot();
  },
  async deleteServerProfile() {
    return mockSnapshot();
  },
  async selectServerProfile() {
    return mockSnapshot();
  },
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
  async refreshMe() {
    return mockSnapshot();
  },
  async logout() {
    return mockSnapshot();
  },
  async addWatchRoot() {
    return mockSnapshot();
  },
  async getDefaultWatchRoot() {
    return '';
  },
  async saveFormatRule() {
    return mockSnapshot();
  },
  async deleteFormatRule() {
    return mockSnapshot();
  },
  async scanWatchRoots() {
    return mockSnapshot();
  },
  async assignDetectedFileFormat() {
    return mockSnapshot();
  },
  async assignDetectedFileTournament() {
    return mockSnapshot();
  },
  async deleteWatchRoot() {
    return mockSnapshot();
  },
  async toggleWatchRoot() {
    return mockSnapshot();
  },
  async processUploadQueue() {
    return mockSnapshot();
  },
  async pollActiveUploads() {
    return mockSnapshot();
  },
  async retryUploadJob() {
    return mockSnapshot();
  },
  async dismissDuplicateUploadJob() {
    return mockSnapshot();
  },
  async ignoreUploadJob() {
    return mockSnapshot();
  },
  async restoreIgnoredUploadJob() {
    return mockSnapshot();
  },
  async removeAwaitingUploadJob() {
    return mockSnapshot();
  },
  async openUploadFileLocation() {},
  async updatePreferences() {
    return mockSnapshot();
  },
  async addDiagnosticEvent() {
    return mockSnapshot();
  },
  async exportDiagnosticsBundle() {
    return '';
  },
  async openAppDataDirectory() {}
};

const tauriClient: DesktopClient = {
  getSnapshot: () => invoke<DesktopSnapshot>('desktop_get_snapshot'),
  saveServerProfile: (input) => invoke<DesktopSnapshot>('desktop_save_server_profile', { input }),
  deleteServerProfile: (profileId) => invoke<DesktopSnapshot>('desktop_delete_server_profile', { profileId }),
  selectServerProfile: (profileId) => invoke<DesktopSnapshot>('desktop_select_server_profile', { profileId }),
  checkServerHealth: (profileId) => invoke<ServiceHealth>('desktop_check_server_health', { profileId }),
  fetchFormats: (profileId) => invoke<TournamentFormat[]>('desktop_fetch_formats', { profileId }),
  fetchCards: (profileId, formatId) => invoke<CardsResponse>('desktop_fetch_cards', { profileId, formatId }),
  fetchMyAgg: (profileId) => invoke<MyAggResponse>('desktop_fetch_my_agg', { profileId }),
  openAuthWindow: (profileId) => invoke<void>('desktop_open_auth_window', { profileId }),
  completeAuth: (profileId) => invoke<void>('desktop_complete_auth', { input: { profileId } }),
  refreshMe: (profileId) => invoke<DesktopSnapshot>('desktop_refresh_me', { profileId }),
  logout: (profileId) => invoke<DesktopSnapshot>('desktop_logout', { profileId }),
  addWatchRoot: (input) => invoke<DesktopSnapshot>('desktop_add_watch_root', { input }),
  getDefaultWatchRoot: () => invoke<string>('desktop_get_default_watch_root'),
  saveFormatRule: (input) => invoke<DesktopSnapshot>('desktop_save_format_rule', { input }),
  deleteFormatRule: (formatRuleId) => invoke<DesktopSnapshot>('desktop_delete_format_rule', { formatRuleId }),
  scanWatchRoots: (profileId) => invoke<DesktopSnapshot>('desktop_scan_watch_roots', { profileId }),
  assignDetectedFileFormat: (input) => invoke<DesktopSnapshot>('desktop_assign_detected_file_format', { input }),
  assignDetectedFileTournament: (input) => invoke<DesktopSnapshot>('desktop_assign_detected_file_tournament', { input }),
  deleteWatchRoot: (watchRootId) => invoke<DesktopSnapshot>('desktop_delete_watch_root', { watchRootId }),
  toggleWatchRoot: (watchRootId, paused) =>
    invoke<DesktopSnapshot>('desktop_toggle_watch_root', { watchRootId, paused }),
  processUploadQueue: (profileId) => invoke<DesktopSnapshot>('desktop_process_upload_queue', { profileId }),
  pollActiveUploads: (profileId) => invoke<DesktopSnapshot>('desktop_poll_active_uploads', { profileId }),
  retryUploadJob: (uploadJobId) => invoke<DesktopSnapshot>('desktop_retry_upload_job', { uploadJobId }),
  dismissDuplicateUploadJob: (uploadJobId) =>
    invoke<DesktopSnapshot>('desktop_dismiss_duplicate_upload_job', { uploadJobId }),
  ignoreUploadJob: (uploadJobId) => invoke<DesktopSnapshot>('desktop_ignore_upload_job', { uploadJobId }),
  restoreIgnoredUploadJob: (uploadJobId) =>
    invoke<DesktopSnapshot>('desktop_restore_ignored_upload_job', { uploadJobId }),
  removeAwaitingUploadJob: (uploadJobId) =>
    invoke<DesktopSnapshot>('desktop_remove_awaiting_upload_job', { uploadJobId }),
  openUploadFileLocation: (uploadJobId) => invoke<void>('desktop_open_upload_file_location', { uploadJobId }),
  updatePreferences: (preferences) => invoke<DesktopSnapshot>('desktop_update_preferences', { input: preferences }),
  addDiagnosticEvent: (event) => invoke<DesktopSnapshot>('desktop_add_diagnostic_event', { event }),
  exportDiagnosticsBundle: () => invoke<string>('desktop_export_diagnostics_bundle'),
  openAppDataDirectory: () => invoke<void>('desktop_open_app_data_directory')
};

export const desktopClient = isTauri() ? tauriClient : browserClient;
