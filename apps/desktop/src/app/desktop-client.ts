import { invoke } from '@tauri-apps/api/core';
import type {
  DesktopSnapshot,
  LocalDiagnosticEvent,
  LocalServerProfile,
  LocalWatchRoot,
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

type DesktopClient = {
  getSnapshot: () => Promise<DesktopSnapshot>;
  saveServerProfile: (input: SaveServerProfileInput) => Promise<DesktopSnapshot>;
  deleteServerProfile: (profileId: string) => Promise<DesktopSnapshot>;
  selectServerProfile: (profileId: string) => Promise<DesktopSnapshot>;
  checkServerHealth: (profileId: string) => Promise<ServiceHealth>;
  fetchFormats: (profileId: string) => Promise<TournamentFormat[]>;
  addWatchRoot: (input: AddWatchRootInput) => Promise<DesktopSnapshot>;
  deleteWatchRoot: (watchRootId: string) => Promise<DesktopSnapshot>;
  toggleWatchRoot: (watchRootId: string, paused: boolean) => Promise<DesktopSnapshot>;
  addDiagnosticEvent: (event: Omit<LocalDiagnosticEvent, 'id' | 'createdAt'>) => Promise<DesktopSnapshot>;
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
  authUser: null,
  tokenExpiresAt: '',
  watchRoots: mockWatchRoots,
  uploadJobs: [],
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
  async addWatchRoot() {
    return mockSnapshot();
  },
  async deleteWatchRoot() {
    return mockSnapshot();
  },
  async toggleWatchRoot() {
    return mockSnapshot();
  },
  async addDiagnosticEvent() {
    return mockSnapshot();
  }
};

const tauriClient: DesktopClient = {
  getSnapshot: () => invoke<DesktopSnapshot>('desktop_get_snapshot'),
  saveServerProfile: (input) => invoke<DesktopSnapshot>('desktop_save_server_profile', { input }),
  deleteServerProfile: (profileId) => invoke<DesktopSnapshot>('desktop_delete_server_profile', { profileId }),
  selectServerProfile: (profileId) => invoke<DesktopSnapshot>('desktop_select_server_profile', { profileId }),
  checkServerHealth: (profileId) => invoke<ServiceHealth>('desktop_check_server_health', { profileId }),
  fetchFormats: (profileId) => invoke<TournamentFormat[]>('desktop_fetch_formats', { profileId }),
  addWatchRoot: (input) => invoke<DesktopSnapshot>('desktop_add_watch_root', { input }),
  deleteWatchRoot: (watchRootId) => invoke<DesktopSnapshot>('desktop_delete_watch_root', { watchRootId }),
  toggleWatchRoot: (watchRootId, paused) =>
    invoke<DesktopSnapshot>('desktop_toggle_watch_root', { watchRootId, paused }),
  addDiagnosticEvent: (event) => invoke<DesktopSnapshot>('desktop_add_diagnostic_event', { event })
};

export const desktopClient = isTauri() ? tauriClient : browserClient;
