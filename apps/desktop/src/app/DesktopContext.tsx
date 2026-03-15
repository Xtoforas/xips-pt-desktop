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
  CardsResponse,
  DesktopPreferences,
  DesktopSnapshot,
  LocalDiagnosticEvent,
  LocalServerProfile,
  MyAggResponse,
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

type AssignDetectedFileFormatInput = {
  detectedFileId: string;
  formatId: string;
};

type DesktopContextValue = {
  snapshot: DesktopSnapshot;
  loading: boolean;
  selectedProfile: LocalServerProfile | null;
  health: ServiceHealth | null;
  cards: CardsResponse['rows'];
  cardSource: CardsResponse['source'];
  myAggCards: MyAggResponse['cards'];
  myAggTeams: MyAggResponse['teams'];
  refreshSnapshot: () => Promise<void>;
  saveServerProfile: (input: SaveServerProfileInput) => Promise<void>;
  deleteServerProfile: (profileId: string) => Promise<void>;
  selectServerProfile: (profileId: string) => Promise<void>;
  refreshHealth: () => Promise<void>;
  refreshFormats: () => Promise<void>;
  refreshCards: (formatId: string) => Promise<void>;
  refreshMyAgg: (profileId: string) => Promise<void>;
  openAuthWindow: (profileId: string) => Promise<void>;
  completeAuth: (profileId: string) => Promise<void>;
  refreshMe: (profileId: string) => Promise<void>;
  logout: (profileId: string) => Promise<void>;
  addWatchRoot: (input: AddWatchRootInput) => Promise<void>;
  saveFormatRule: (input: SaveFormatRuleInput) => Promise<void>;
  deleteFormatRule: (formatRuleId: string) => Promise<void>;
  scanWatchRoots: (profileId: string) => Promise<void>;
  assignDetectedFileFormat: (input: AssignDetectedFileFormatInput) => Promise<void>;
  deleteWatchRoot: (watchRootId: string) => Promise<void>;
  toggleWatchRoot: (watchRootId: string, paused: boolean) => Promise<void>;
  processUploadQueue: (profileId: string) => Promise<void>;
  pollActiveUploads: (profileId: string) => Promise<void>;
  updatePreferences: (preferences: DesktopPreferences) => Promise<void>;
  addDiagnosticEvent: (event: Omit<LocalDiagnosticEvent, 'id' | 'createdAt'>) => Promise<void>;
};

const emptySnapshot: DesktopSnapshot = {
  profiles: [],
  selectedProfileId: '',
  authProfileId: '',
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
  const [cards, setCards] = useState<CardsResponse['rows']>([]);
  const [cardSource, setCardSource] = useState<CardsResponse['source']>('admin');
  const [myAggCards, setMyAggCards] = useState<MyAggResponse['cards']>([]);
  const [myAggTeams, setMyAggTeams] = useState<MyAggResponse['teams']>([]);

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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.__TAURI_INTERNALS__ !== 'object') {
      return;
    }
    let active = true;
    let unlisten: (() => void) | null = null;
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const stop = await listen<boolean>('desktop:snapshot-updated', async () => {
        if (active) {
          await refreshSnapshot();
        }
      });
      unlisten = () => {
        void stop();
      };
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    if (!snapshot.selectedProfileId || snapshot.authProfileId !== snapshot.selectedProfileId || !snapshot.authUser) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void desktopClient.pollActiveUploads(snapshot.selectedProfileId).then(setSnapshot);
    }, Math.max(snapshot.preferences.pollingIntervalSeconds, 3) * 1000);
    return () => window.clearInterval(intervalId);
  }, [
    snapshot.authProfileId,
    snapshot.authUser,
    snapshot.preferences.pollingIntervalSeconds,
    snapshot.selectedProfileId
  ]);

  useEffect(() => {
    if (snapshot.authProfileId === snapshot.selectedProfileId && snapshot.authUser) {
      return;
    }
    setCards([]);
    setCardSource('admin');
    setMyAggCards([]);
    setMyAggTeams([]);
  }, [snapshot.authProfileId, snapshot.authUser, snapshot.selectedProfileId]);

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

  const refreshCards = useCallback(
    async (formatId: string): Promise<void> => {
      const selectedProfile = snapshot.profiles.find((profile) => profile.id === snapshot.selectedProfileId) ?? null;
      if (!selectedProfile || snapshot.authProfileId !== selectedProfile.id || !snapshot.authUser) {
        setCards([]);
        setCardSource('admin');
        return;
      }
      const payload = await desktopClient.fetchCards(selectedProfile.id, formatId);
      setCards(payload.rows);
      setCardSource(payload.source);
    },
    [snapshot.authProfileId, snapshot.authUser, snapshot.profiles, snapshot.selectedProfileId]
  );

  const refreshMyAgg = useCallback(async (profileId: string): Promise<void> => {
    const payload = await desktopClient.fetchMyAgg(profileId);
    setMyAggCards(payload.cards);
    setMyAggTeams(payload.teams);
  }, []);

  const openAuthWindow = useCallback(async (profileId: string): Promise<void> => {
    await desktopClient.openAuthWindow(profileId);
  }, []);

  const completeAuth = useCallback(async (profileId: string): Promise<void> => {
    await desktopClient.completeAuth(profileId);
  }, []);

  const refreshMe = useCallback(async (profileId: string): Promise<void> => {
    const next = await desktopClient.refreshMe(profileId);
    setSnapshot(next);
  }, []);

  const logout = useCallback(async (profileId: string): Promise<void> => {
    const next = await desktopClient.logout(profileId);
    setSnapshot(next);
  }, []);

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

  const assignDetectedFileFormat = useCallback(async (input: AssignDetectedFileFormatInput): Promise<void> => {
    const next = await desktopClient.assignDetectedFileFormat(input);
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

  const processUploadQueue = useCallback(async (profileId: string): Promise<void> => {
    const next = await desktopClient.processUploadQueue(profileId);
    setSnapshot(next);
  }, []);

  const pollActiveUploads = useCallback(async (profileId: string): Promise<void> => {
    const next = await desktopClient.pollActiveUploads(profileId);
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
      cards,
      cardSource,
      myAggCards,
      myAggTeams,
      refreshSnapshot,
      saveServerProfile,
      deleteServerProfile,
      selectServerProfile,
      refreshHealth,
      refreshFormats,
      refreshCards,
      refreshMyAgg,
      openAuthWindow,
      completeAuth,
      refreshMe,
      logout,
      addWatchRoot,
      saveFormatRule,
      deleteFormatRule,
      scanWatchRoots,
      assignDetectedFileFormat,
      deleteWatchRoot,
      toggleWatchRoot,
      processUploadQueue,
      pollActiveUploads,
      updatePreferences,
      addDiagnosticEvent
    }),
    [
      snapshot,
      loading,
      selectedProfile,
      health,
      cards,
      cardSource,
      myAggCards,
      myAggTeams,
      refreshSnapshot,
      saveServerProfile,
      deleteServerProfile,
      selectServerProfile,
      refreshHealth,
      refreshFormats,
      refreshCards,
      refreshMyAgg,
      openAuthWindow,
      completeAuth,
      refreshMe,
      logout,
      addWatchRoot,
      saveFormatRule,
      deleteFormatRule,
      scanWatchRoots,
      assignDetectedFileFormat,
      deleteWatchRoot,
      toggleWatchRoot,
      processUploadQueue,
      pollActiveUploads,
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
