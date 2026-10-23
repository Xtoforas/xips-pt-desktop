import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  SaveServerProfileResult,
  ServiceHealth,
  TournamentFormat
} from '@xips/api-contract';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { desktopClient, isTauri, MOCK_SNAPSHOT_EVENT } from './desktop-client';
import type { ConnectionState } from './onboarding';

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

type DesktopContextValue = {
  snapshot: DesktopSnapshot;
  loading: boolean;
  authFlowState: 'idle' | 'waiting' | 'failed';
  authFlowError: string;
  selectedProfile: LocalServerProfile | null;
  health: ServiceHealth | null;
  // Plain-language view of the background reachability check for the selected server.
  connection: ConnectionState;
  cards: CardsResponse['rows'];
  cardSource: CardsResponse['source'];
  myAggCards: MyAggResponse['cards'];
  myAggTeams: MyAggResponse['teams'];
  refreshSnapshot: () => Promise<void>;
  saveServerProfile: (input: SaveServerProfileInput) => Promise<SaveServerProfileResult>;
  deleteServerProfile: (profileId: string) => Promise<void>;
  selectServerProfile: (profileId: string) => Promise<void>;
  switchToDefaultServer: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  refreshFormats: () => Promise<void>;
  refreshCards: (formatId: string) => Promise<void>;
  refreshMyAgg: (profileId: string) => Promise<void>;
  redeemAuthCode: (profileId: string, code: string) => Promise<void>;
  openAuthWindow: (profileId: string) => Promise<void>;
  refreshMe: (profileId: string) => Promise<void>;
  logout: (profileId: string) => Promise<void>;
  addWatchRoot: (input: AddWatchRootInput) => Promise<void>;
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
    diagnosticsRetentionDays: 14,
    dismissAutomationRuleReadiness: false,
    dismissCompletedReadinessCard: false
  },
  diagnostics: [],
  cachedFormats: []
};

const MIN_POLLING_INTERVAL_SECONDS = 5;
// Health checks intentionally run less often than the background dispatcher: 6x the
// configured interval (~30s at the default 5s setting). No documented rationale found in
// git history; preserving existing effective cadence.
const HEALTH_POLL_INTERVAL_MULTIPLIER = 6;
// refreshMe runs even less often: 12x the configured interval (~60s at the default 5s setting).
const REFRESH_ME_POLL_INTERVAL_MULTIPLIER = 12;

const PAIRING_CODE_PATTERN = /^[A-Z0-9]{6,12}$/;

// Sign-in errors shown to the user stay plain; the raw error never reaches the UI.
const OPEN_SIGN_IN_FAILED = "The sign-in window didn't open. Try again in a moment.";
const REDEEM_CODE_FAILED = "That code didn't work. Codes expire after a few minutes, so click Sign in with Discord to get a new one.";

// Tauri's invoke() rejects with the raw value the Rust command's Err variant serialized
// to (a plain string for Result<_, String> commands), not an Error instance.
export function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return fallback;
}

const DesktopContext = createContext<DesktopContextValue | null>(null);

export const DesktopProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [authFlowState, setAuthFlowState] = useState<'idle' | 'waiting' | 'failed'>('idle');
  const [authFlowError, setAuthFlowError] = useState('');
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [cards, setCards] = useState<CardsResponse['rows']>([]);
  const [cardSource, setCardSource] = useState<CardsResponse['source']>('admin');
  const [myAggCards, setMyAggCards] = useState<MyAggResponse['cards']>([]);
  const [myAggTeams, setMyAggTeams] = useState<MyAggResponse['teams']>([]);
  const selectedProfile = useMemo(
    () => snapshot.profiles.find((profile) => profile.id === snapshot.selectedProfileId) ?? null,
    [snapshot.profiles, snapshot.selectedProfileId]
  );
  const selectedProfileId = selectedProfile?.id ?? '';
  const selectedProfileBaseUrl = selectedProfile?.baseUrl ?? '';

  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef(false);

  // Baseline is snapshotted whenever a sign-in window opens, so leftover clipboard
  // content from earlier attempts is never mistaken for the code from this one.
  const clipboardBaselineRef = useRef<string | null>(null);
  const watchingClipboardRef = useRef(false);

  const refreshSnapshot = useCallback(async (): Promise<void> => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return refreshInFlightRef.current;
    }
    const fetchAndApply = async (): Promise<void> => {
      setLoading(true);
      try {
        const next = await desktopClient.getSnapshot();
        setSnapshot(next);
      } finally {
        setLoading(false);
      }
    };
    const run = async (): Promise<void> => {
      do {
        refreshQueuedRef.current = false;
        await fetchAndApply();
      } while (refreshQueuedRef.current);
    };
    const promise = run().finally(() => {
      refreshInFlightRef.current = null;
    });
    refreshInFlightRef.current = promise;
    return promise;
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
      // Cleanup may have run while listen() was pending; nothing would remove the listener then.
      if (!active) {
        void stop();
        return;
      }
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
    if (isTauri()) {
      return;
    }
    const onMockChange = (): void => {
      void refreshSnapshot();
    };
    window.addEventListener(MOCK_SNAPSHOT_EVENT, onMockChange);
    return () => window.removeEventListener(MOCK_SNAPSHOT_EVENT, onMockChange);
  }, [refreshSnapshot]);

  useEffect(() => {
    if (snapshot.authProfileId === snapshot.selectedProfileId && snapshot.authUser) {
      return;
    }
    setCards([]);
    setCardSource('admin');
    setMyAggCards([]);
    setMyAggTeams([]);
  }, [snapshot.authProfileId, snapshot.authUser, snapshot.selectedProfileId]);

  useEffect(() => {
    if (!selectedProfileId) {
      setHealth(null);
      setConnection('checking');
      return;
    }
    let active = true;
    setConnection('checking');
    const run = (): void => {
      void desktopClient
        .checkServerHealth(selectedProfileId)
        .then((result) => {
          if (active) {
            setHealth(result);
            setConnection(result.ok ? 'connected' : 'unreachable');
          }
        })
        .catch(() => {
          if (active) {
            setHealth(null);
            setConnection('unreachable');
          }
        });
    };
    run();
    const intervalId = window.setInterval(
      run,
      Math.max(snapshot.preferences.pollingIntervalSeconds, MIN_POLLING_INTERVAL_SECONDS) *
        HEALTH_POLL_INTERVAL_MULTIPLIER *
        1000
    );
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [selectedProfileBaseUrl, selectedProfileId, snapshot.preferences.pollingIntervalSeconds]);

  useEffect(() => {
    const selectedProfile = snapshot.profiles.find((profile) => profile.id === snapshot.selectedProfileId) ?? null;
    if (!selectedProfile || snapshot.authProfileId !== selectedProfile.id || !snapshot.authUser) {
      return;
    }
    const run = (): void => {
      void desktopClient.refreshMe(selectedProfile.id);
    };
    const intervalId = window.setInterval(
      run,
      Math.max(snapshot.preferences.pollingIntervalSeconds, MIN_POLLING_INTERVAL_SECONDS) *
        REFRESH_ME_POLL_INTERVAL_MULTIPLIER *
        1000
    );
    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    snapshot.authProfileId,
    snapshot.authUser,
    snapshot.preferences.pollingIntervalSeconds,
    snapshot.profiles,
    snapshot.selectedProfileId
  ]);

  useEffect(() => {
    const selectedProfile = snapshot.profiles.find((profile) => profile.id === snapshot.selectedProfileId) ?? null;
    if (!selectedProfile) {
      return;
    }
    let active = true;
    void desktopClient.fetchFormats(selectedProfile.id).then((formats) => {
      if (active) {
        setSnapshot((current) => ({
          ...current,
          cachedFormats: formats
        }));
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [snapshot.selectedProfileId]);

  useEffect(() => {
    const selectedProfile = snapshot.profiles.find((profile) => profile.id === snapshot.selectedProfileId) ?? null;
    if (!selectedProfile || snapshot.authProfileId !== selectedProfile.id || !snapshot.authUser) {
      return;
    }
    let active = true;
    void desktopClient.fetchCards(selectedProfile.id, '').then((payload) => {
      if (active) {
        setCards(payload.rows);
        setCardSource(payload.source);
      }
    }).catch(() => {
      if (active) {
        setCards([]);
        setCardSource('admin');
      }
    });
    void desktopClient.fetchMyAgg(selectedProfile.id).then((payload) => {
      if (active) {
        setMyAggCards(payload.cards);
        setMyAggTeams(payload.teams);
      }
    }).catch(() => {
      if (active) {
        setMyAggCards([]);
        setMyAggTeams([]);
      }
    });
    return () => {
      active = false;
    };
  }, [snapshot.authProfileId, snapshot.authUser, snapshot.selectedProfileId]);

  const saveServerProfile = useCallback(
    async (input: SaveServerProfileInput): Promise<SaveServerProfileResult> => desktopClient.saveServerProfile(input),
    []
  );

  const deleteServerProfile = useCallback(async (profileId: string): Promise<void> => {
    await desktopClient.deleteServerProfile(profileId);
  }, []);

  const selectServerProfile = useCallback(async (profileId: string): Promise<void> => {
    await desktopClient.selectServerProfile(profileId);
    setHealth(null);
  }, []);

  const switchToDefaultServer = useCallback(async (): Promise<void> => {
    await desktopClient.switchToDefaultServer();
    setHealth(null);
  }, []);

  const refreshHealth = useCallback(async (): Promise<void> => {
    const selectedProfile = snapshot.profiles.find((profile) => profile.id === snapshot.selectedProfileId) ?? null;
    if (!selectedProfile) {
      setHealth(null);
      return;
    }
    // No 'checking' here: a manual retry keeps the current message (and its Retry button) on screen.
    try {
      const result = await desktopClient.checkServerHealth(selectedProfile.id);
      setHealth(result);
      setConnection(result.ok ? 'connected' : 'unreachable');
    } catch {
      setHealth(null);
      setConnection('unreachable');
    }
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
    setAuthFlowState('waiting');
    setAuthFlowError('');
    if (isTauri()) {
      try {
        clipboardBaselineRef.current = ((await readText()) ?? '').trim().toUpperCase();
      } catch {
        clipboardBaselineRef.current = null;
      }
      watchingClipboardRef.current = true;
    }
    try {
      await desktopClient.openAuthWindow(profileId);
      setAuthFlowState('idle');
    } catch (error) {
      setAuthFlowState('failed');
      setAuthFlowError(OPEN_SIGN_IN_FAILED);
      throw error;
    }
  }, []);

  const redeemAuthCode = useCallback(async (profileId: string, code: string): Promise<void> => {
    setAuthFlowState('waiting');
    setAuthFlowError('');
    try {
      await desktopClient.redeemAuthCode(profileId, code);
      await refreshSnapshot();
      setAuthFlowState('idle');
    } catch (error) {
      setAuthFlowState('failed');
      setAuthFlowError(REDEEM_CODE_FAILED);
      throw error;
    }
  }, [refreshSnapshot]);

  const isAuthenticatedForSelectedProfile =
    snapshot.authUser !== null && snapshot.authProfileId === selectedProfileId;

  useEffect(() => {
    if (!isTauri() || !selectedProfileId || isAuthenticatedForSelectedProfile) {
      watchingClipboardRef.current = false;
      return;
    }
    const tryAutoFillFromClipboard = (): void => {
      if (!watchingClipboardRef.current) {
        return;
      }
      void (async () => {
        let text: string | null;
        try {
          text = await readText();
        } catch {
          return;
        }
        const code = text?.trim().toUpperCase() ?? '';
        if (!PAIRING_CODE_PATTERN.test(code) || code === clipboardBaselineRef.current) {
          return;
        }
        clipboardBaselineRef.current = code;
        try {
          await redeemAuthCode(selectedProfileId, code);
        } catch {
          // authFlowError already reflects the failure.
        }
      })();
    };
    window.addEventListener('focus', tryAutoFillFromClipboard);
    return () => window.removeEventListener('focus', tryAutoFillFromClipboard);
  }, [isAuthenticatedForSelectedProfile, redeemAuthCode, selectedProfileId]);

  const refreshMe = useCallback(async (profileId: string): Promise<void> => {
    await desktopClient.refreshMe(profileId);
  }, []);

  const logout = useCallback(async (profileId: string): Promise<void> => {
    await desktopClient.logout(profileId);
  }, []);

  const addWatchRoot = useCallback(async (input: AddWatchRootInput): Promise<void> => {
    await desktopClient.addWatchRoot(input);
  }, []);

  const saveFormatRule = useCallback(async (input: SaveFormatRuleInput): Promise<void> => {
    await desktopClient.saveFormatRule(input);
  }, []);

  const deleteFormatRule = useCallback(async (formatRuleId: string): Promise<void> => {
    await desktopClient.deleteFormatRule(formatRuleId);
  }, []);

  const scanWatchRoots = useCallback(async (profileId: string): Promise<void> => {
    await desktopClient.scanWatchRoots(profileId);
  }, []);

  const assignDetectedFileFormat = useCallback(async (input: AssignDetectedFileFormatInput): Promise<void> => {
    await desktopClient.assignDetectedFileFormat(input);
  }, []);

  const assignDetectedFileTournament = useCallback(async (input: AssignDetectedFileTournamentInput): Promise<void> => {
    await desktopClient.assignDetectedFileTournament(input);
  }, []);

  const deleteWatchRoot = useCallback(async (watchRootId: string): Promise<void> => {
    await desktopClient.deleteWatchRoot(watchRootId);
  }, []);

  const toggleWatchRoot = useCallback(async (watchRootId: string, paused: boolean): Promise<void> => {
    await desktopClient.toggleWatchRoot(watchRootId, paused);
  }, []);

  const processUploadQueue = useCallback(async (profileId: string): Promise<void> => {
    await desktopClient.processUploadQueue(profileId);
  }, []);

  const pollActiveUploads = useCallback(async (profileId: string): Promise<void> => {
    await desktopClient.pollActiveUploads(profileId);
  }, []);

  const retryUploadJob = useCallback(async (uploadJobId: string): Promise<void> => {
    await desktopClient.retryUploadJob(uploadJobId);
  }, []);

  const dismissDuplicateUploadJob = useCallback(async (uploadJobId: string): Promise<void> => {
    await desktopClient.dismissDuplicateUploadJob(uploadJobId);
  }, []);

  const dismissWorkingUploadJob = useCallback(async (uploadJobId: string): Promise<void> => {
    await desktopClient.dismissWorkingUploadJob(uploadJobId);
  }, []);

  const ignoreUploadJob = useCallback(async (uploadJobId: string): Promise<void> => {
    await desktopClient.ignoreUploadJob(uploadJobId);
  }, []);

  const restoreIgnoredUploadJob = useCallback(async (uploadJobId: string): Promise<void> => {
    await desktopClient.restoreIgnoredUploadJob(uploadJobId);
  }, []);

  const removeAwaitingUploadJob = useCallback(async (uploadJobId: string): Promise<void> => {
    await desktopClient.removeAwaitingUploadJob(uploadJobId);
  }, []);

  const openUploadFileLocation = useCallback(async (uploadJobId: string): Promise<void> => {
    await desktopClient.openUploadFileLocation(uploadJobId);
  }, []);

  const updatePreferences = useCallback(async (preferences: DesktopPreferences): Promise<void> => {
    await desktopClient.updatePreferences(preferences);
  }, []);

  const addDiagnosticEvent = useCallback(
    async (event: Omit<LocalDiagnosticEvent, 'id' | 'createdAt'>): Promise<void> => {
      await desktopClient.addDiagnosticEvent(event);
    },
    []
  );

  const exportDiagnosticsBundle = useCallback(async (): Promise<string> => desktopClient.exportDiagnosticsBundle(), []);

  const openAppDataDirectory = useCallback(async (): Promise<void> => {
    await desktopClient.openAppDataDirectory();
  }, []);

  const value = useMemo<DesktopContextValue>(
    () => ({
      snapshot,
      loading,
      authFlowState,
      authFlowError,
      selectedProfile,
      health,
      connection,
      cards,
      cardSource,
      myAggCards,
      myAggTeams,
      refreshSnapshot,
      saveServerProfile,
      deleteServerProfile,
      selectServerProfile,
      switchToDefaultServer,
      refreshHealth,
      refreshFormats,
      refreshCards,
      refreshMyAgg,
      openAuthWindow,
      redeemAuthCode,
      refreshMe,
      logout,
      addWatchRoot,
      saveFormatRule,
      deleteFormatRule,
      scanWatchRoots,
      assignDetectedFileFormat,
      assignDetectedFileTournament,
      deleteWatchRoot,
      toggleWatchRoot,
      processUploadQueue,
      pollActiveUploads,
      retryUploadJob,
      dismissDuplicateUploadJob,
      dismissWorkingUploadJob,
      ignoreUploadJob,
      restoreIgnoredUploadJob,
      removeAwaitingUploadJob,
      openUploadFileLocation,
      updatePreferences,
      addDiagnosticEvent,
      exportDiagnosticsBundle,
      openAppDataDirectory
    }),
    [
      snapshot,
      loading,
      authFlowState,
      authFlowError,
      selectedProfile,
      health,
      connection,
      cards,
      cardSource,
      myAggCards,
      myAggTeams,
      refreshSnapshot,
      saveServerProfile,
      deleteServerProfile,
      selectServerProfile,
      switchToDefaultServer,
      refreshHealth,
      refreshFormats,
      refreshCards,
      refreshMyAgg,
      openAuthWindow,
      redeemAuthCode,
      refreshMe,
      logout,
      addWatchRoot,
      saveFormatRule,
      deleteFormatRule,
      scanWatchRoots,
      assignDetectedFileFormat,
      assignDetectedFileTournament,
      deleteWatchRoot,
      toggleWatchRoot,
      processUploadQueue,
      pollActiveUploads,
      retryUploadJob,
      dismissDuplicateUploadJob,
      dismissWorkingUploadJob,
      ignoreUploadJob,
      restoreIgnoredUploadJob,
      removeAwaitingUploadJob,
      openUploadFileLocation,
      updatePreferences,
      addDiagnosticEvent,
      exportDiagnosticsBundle,
      openAppDataDirectory
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
