import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from 'react';
import type {
  DesktopPreferences,
  DesktopSnapshot,
  LocalDiagnosticEvent,
  LocalServerProfile,
  LocalWatchRoot,
  ServiceHealth,
  TournamentFormat
} from '@xips/api-contract';
import { desktopClient } from './desktop-client';

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

type DesktopContextValue = {
  snapshot: DesktopSnapshot;
  loading: boolean;
  selectedProfile: LocalServerProfile | null;
  health: ServiceHealth | null;
  refreshSnapshot: () => Promise<void>;
  saveServerProfile: (input: SaveServerProfileInput) => Promise<void>;
  deleteServerProfile: (profileId: string) => Promise<void>;
  selectServerProfile: (profileId: string) => Promise<void>;
  refreshHealth: () => Promise<void>;
  refreshFormats: () => Promise<void>;
  addWatchRoot: (input: AddWatchRootInput) => Promise<void>;
  saveFormatRule: (input: SaveFormatRuleInput) => Promise<void>;
  deleteFormatRule: (formatRuleId: string) => Promise<void>;
  scanWatchRoots: (profileId: string) => Promise<void>;
  deleteWatchRoot: (watchRootId: string) => Promise<void>;
  toggleWatchRoot: (watchRootId: string, paused: boolean) => Promise<void>;
  updatePreferences: (preferences: DesktopPreferences) => Promise<void>;
  addDiagnosticEvent: (event: Omit<LocalDiagnosticEvent, 'id' | 'createdAt'>) => Promise<void>;
};

const emptySnapshot: DesktopSnapshot = {
  profiles: [],
  selectedProfileId: '',
  authUser: null,
  tokenExpiresAt: '',
  watchRoots: [],
  formatRules: [],
  detectedFiles: [],
  uploadJobs: [],
  uploadAttempts: [],
  preferences: {
    launchAtLogin: false,
    closeToTray: true,
    pollingIntervalSeconds: 5,
    diagnosticsRetentionDays: 14
  },
  diagnostics: [],
  cachedFormats: []
};

const DesktopContext = createContext<DesktopContextValue | null>(null);

export const DesktopProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<ServiceHealth | null>(null);

  const refreshSnapshot = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const next = await desktopClient.getSnapshot();
      setSnapshot(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const saveServerProfile = useCallback(async (input: SaveServerProfileInput): Promise<void> => {
    const next = await desktopClient.saveServerProfile(input);
    setSnapshot(next);
  }, []);

  const deleteServerProfile = useCallback(async (profileId: string): Promise<void> => {
    const next = await desktopClient.deleteServerProfile(profileId);
    setSnapshot(next);
  }, []);

  const selectServerProfile = useCallback(async (profileId: string): Promise<void> => {
    const next = await desktopClient.selectServerProfile(profileId);
    setSnapshot(next);
    setHealth(null);
  }, []);

  const refreshHealth = useCallback(async (): Promise<void> => {
    const selectedProfile = snapshot.profiles.find((profile) => profile.id === snapshot.selectedProfileId) ?? null;
    if (!selectedProfile) {
      setHealth(null);
      return;
    }
    const result = await desktopClient.checkServerHealth(selectedProfile.id);
    setHealth(result);
  }, [snapshot.profiles, snapshot.selectedProfileId]);

  const refreshFormats = useCallback(async (): Promise<void> => {
    const selectedProfile = snapshot.profiles.find((profile) => profile.id === snapshot.selectedProfileId) ?? null;
    if (!selectedProfile) {
      return;
    }
    const formats = await desktopClient.fetchFormats(selectedProfile.id);
    setSnapshot((current) => ({
      ...current,
      cachedFormats: formats
    }));
  }, [snapshot.profiles, snapshot.selectedProfileId]);

  const addWatchRoot = useCallback(async (input: AddWatchRootInput): Promise<void> => {
    const next = await desktopClient.addWatchRoot(input);
    setSnapshot(next);
  }, []);

  const saveFormatRule = useCallback(async (input: SaveFormatRuleInput): Promise<void> => {
    const next = await desktopClient.saveFormatRule(input);
    setSnapshot(next);
  }, []);

  const deleteFormatRule = useCallback(async (formatRuleId: string): Promise<void> => {
    const next = await desktopClient.deleteFormatRule(formatRuleId);
    setSnapshot(next);
  }, []);

  const scanWatchRoots = useCallback(async (profileId: string): Promise<void> => {
    const next = await desktopClient.scanWatchRoots(profileId);
    setSnapshot(next);
  }, []);

  const deleteWatchRoot = useCallback(async (watchRootId: string): Promise<void> => {
    const next = await desktopClient.deleteWatchRoot(watchRootId);
    setSnapshot(next);
  }, []);

  const toggleWatchRoot = useCallback(async (watchRootId: string, paused: boolean): Promise<void> => {
    const next = await desktopClient.toggleWatchRoot(watchRootId, paused);
    setSnapshot(next);
  }, []);

  const updatePreferences = useCallback(async (preferences: DesktopPreferences): Promise<void> => {
    const next = await desktopClient.updatePreferences(preferences);
    setSnapshot(next);
  }, []);

  const addDiagnosticEvent = useCallback(
    async (event: Omit<LocalDiagnosticEvent, 'id' | 'createdAt'>): Promise<void> => {
      const next = await desktopClient.addDiagnosticEvent(event);
      setSnapshot(next);
    },
    []
  );

  const selectedProfile = useMemo(
    () => snapshot.profiles.find((profile) => profile.id === snapshot.selectedProfileId) ?? null,
    [snapshot.profiles, snapshot.selectedProfileId]
  );

  const value = useMemo<DesktopContextValue>(
    () => ({
      snapshot,
      loading,
      selectedProfile,
      health,
      refreshSnapshot,
      saveServerProfile,
      deleteServerProfile,
      selectServerProfile,
      refreshHealth,
      refreshFormats,
      addWatchRoot,
      saveFormatRule,
      deleteFormatRule,
      scanWatchRoots,
      deleteWatchRoot,
      toggleWatchRoot,
      updatePreferences,
      addDiagnosticEvent
    }),
    [
      snapshot,
      loading,
      selectedProfile,
      health,
      refreshSnapshot,
      saveServerProfile,
      deleteServerProfile,
      selectServerProfile,
      refreshHealth,
      refreshFormats,
      addWatchRoot,
      saveFormatRule,
      deleteFormatRule,
      scanWatchRoots,
      deleteWatchRoot,
      toggleWatchRoot,
      updatePreferences,
      addDiagnosticEvent
    ]
  );

  return <DesktopContext.Provider value={value}>{children}</DesktopContext.Provider>;
};

export const useDesktop = (): DesktopContextValue => {
  const value = useContext(DesktopContext);
  if (!value) {
    throw new Error('DesktopContext is not available');
  }
  return value;
};
