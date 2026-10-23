import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
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
  ServiceHealth
} from '@xips/api-contract';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { desktopClient, isTauri, MOCK_SNAPSHOT_EVENT } from './desktop-client';
import { isSignedInToSelectedServer, type ConnectionState } from './onboarding';

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

// Milliseconds between polls: the configured interval, floored at the minimum, times a multiplier.
const pollIntervalMs = (seconds: number, multiplier: number): number =>
  Math.max(seconds, MIN_POLLING_INTERVAL_SECONDS) * multiplier * 1000;

// Context actions that only forward to the desktop client. desktopClient is a module-level
// constant, so these are stable references and need no hooks.
const clientActions = {
  saveServerProfile: async (input: SaveServerProfileInput): Promise<SaveServerProfileResult> =>
    desktopClient.saveServerProfile(input),
  exportDiagnosticsBundle: async (): Promise<string> => desktopClient.exportDiagnosticsBundle(),
  deleteServerProfile: async (profileId: string): Promise<void> => {
    await desktopClient.deleteServerProfile(profileId);
  },
  refreshMe: async (profileId: string): Promise<void> => {
    await desktopClient.refreshMe(profileId);
  },
  logout: async (profileId: string): Promise<void> => {
    await desktopClient.logout(profileId);
  },
  addWatchRoot: async (input: AddWatchRootInput): Promise<void> => {
    await desktopClient.addWatchRoot(input);
  },
  saveFormatRule: async (input: SaveFormatRuleInput): Promise<void> => {
    await desktopClient.saveFormatRule(input);
  },
  deleteFormatRule: async (formatRuleId: string): Promise<void> => {
    await desktopClient.deleteFormatRule(formatRuleId);
  },
  scanWatchRoots: async (profileId: string): Promise<void> => {
    await desktopClient.scanWatchRoots(profileId);
  },
  assignDetectedFileFormat: async (input: AssignDetectedFileFormatInput): Promise<void> => {
    await desktopClient.assignDetectedFileFormat(input);
  },
  assignDetectedFileTournament: async (input: AssignDetectedFileTournamentInput): Promise<void> => {
    await desktopClient.assignDetectedFileTournament(input);
  },
  deleteWatchRoot: async (watchRootId: string): Promise<void> => {
    await desktopClient.deleteWatchRoot(watchRootId);
  },
  toggleWatchRoot: async (watchRootId: string, paused: boolean): Promise<void> => {
    await desktopClient.toggleWatchRoot(watchRootId, paused);
  },
  processUploadQueue: async (profileId: string): Promise<void> => {
    await desktopClient.processUploadQueue(profileId);
  },
  pollActiveUploads: async (profileId: string): Promise<void> => {
    await desktopClient.pollActiveUploads(profileId);
  },
  retryUploadJob: async (uploadJobId: string): Promise<void> => {
    await desktopClient.retryUploadJob(uploadJobId);
  },
  dismissDuplicateUploadJob: async (uploadJobId: string): Promise<void> => {
    await desktopClient.dismissDuplicateUploadJob(uploadJobId);
  },
  dismissWorkingUploadJob: async (uploadJobId: string): Promise<void> => {
    await desktopClient.dismissWorkingUploadJob(uploadJobId);
  },
  ignoreUploadJob: async (uploadJobId: string): Promise<void> => {
    await desktopClient.ignoreUploadJob(uploadJobId);
  },
  restoreIgnoredUploadJob: async (uploadJobId: string): Promise<void> => {
    await desktopClient.restoreIgnoredUploadJob(uploadJobId);
  },
  removeAwaitingUploadJob: async (uploadJobId: string): Promise<void> => {
    await desktopClient.removeAwaitingUploadJob(uploadJobId);
  },
  openUploadFileLocation: async (uploadJobId: string): Promise<void> => {
    await desktopClient.openUploadFileLocation(uploadJobId);
  },
  updatePreferences: async (preferences: DesktopPreferences): Promise<void> => {
    await desktopClient.updatePreferences(preferences);
  },
  addDiagnosticEvent: async (event: Omit<LocalDiagnosticEvent, 'id' | 'createdAt'>): Promise<void> => {
    await desktopClient.addDiagnosticEvent(event);
  },
  openAppDataDirectory: async (): Promise<void> => {
    await desktopClient.openAppDataDirectory();
  }
};

const DesktopContext = createContext<DesktopContextValue | null>(null);

// Imported lazily so the browser mock never loads the Tauri event API. Kept outside the
// provider because the React Compiler can't compile a component containing import().
const listenForSnapshotUpdates = async (onUpdate: () => Promise<void>): Promise<() => void> => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<boolean>('desktop:snapshot-updated', onUpdate);
};

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
  const signedIn = isSignedInToSelectedServer(snapshot);

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
      await desktopClient.getSnapshot().then(setSnapshot).finally(() => setLoading(false));
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
    void listenForSnapshotUpdates(async () => {
      if (active) {
        await refreshSnapshot();
      }
    }).then((stop) => {
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
    if (signedIn) {
      return;
    }
    setCards([]);
    setCardSource('admin');
    setMyAggCards([]);
    setMyAggTeams([]);
  }, [signedIn]);

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
      pollIntervalMs(snapshot.preferences.pollingIntervalSeconds, HEALTH_POLL_INTERVAL_MULTIPLIER)
    );
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [selectedProfileBaseUrl, selectedProfileId, snapshot.preferences.pollingIntervalSeconds]);

  useEffect(() => {
    if (!selectedProfileId || !signedIn) {
      return;
    }
    const run = (): void => {
      void desktopClient.refreshMe(selectedProfileId);
    };
    const intervalId = window.setInterval(
      run,
      pollIntervalMs(snapshot.preferences.pollingIntervalSeconds, REFRESH_ME_POLL_INTERVAL_MULTIPLIER)
    );
    return () => {
      window.clearInterval(intervalId);
    };
  }, [signedIn, selectedProfileId, snapshot.authUser, snapshot.preferences.pollingIntervalSeconds]);

  useEffect(() => {
    if (!selectedProfileId) {
      return;
    }
    let active = true;
    void desktopClient.fetchFormats(selectedProfileId).then((formats) => {
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
  }, [selectedProfileId]);

  useEffect(() => {
    if (!selectedProfileId || !signedIn) {
      return;
    }
    let active = true;
    void desktopClient.fetchCards(selectedProfileId, '').then((payload) => {
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
    void desktopClient.fetchMyAgg(selectedProfileId).then((payload) => {
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
  }, [signedIn, selectedProfileId, snapshot.authUser]);

  const selectServerProfile = useCallback(async (profileId: string): Promise<void> => {
    await desktopClient.selectServerProfile(profileId);
    setHealth(null);
  }, []);

  const switchToDefaultServer = useCallback(async (): Promise<void> => {
    await desktopClient.switchToDefaultServer();
    setHealth(null);
  }, []);

  const refreshHealth = useCallback(async (): Promise<void> => {
    if (!selectedProfileId) {
      setHealth(null);
      return;
    }
    // No 'checking' here: a manual retry keeps the current message (and its Retry button) on screen.
    const result = await desktopClient.checkServerHealth(selectedProfileId).catch(() => null);
    setHealth(result);
    setConnection(result?.ok ? 'connected' : 'unreachable');
  }, [selectedProfileId]);

  const refreshFormats = useCallback(async (): Promise<void> => {
    if (!selectedProfileId) {
      return;
    }
    const formats = await desktopClient.fetchFormats(selectedProfileId);
    setSnapshot((current) => ({
      ...current,
      cachedFormats: formats
    }));
  }, [selectedProfileId]);

  const refreshCards = useCallback(
    async (formatId: string): Promise<void> => {
      if (!selectedProfileId || !signedIn) {
        setCards([]);
        setCardSource('admin');
        return;
      }
      const payload = await desktopClient.fetchCards(selectedProfileId, formatId);
      setCards(payload.rows);
      setCardSource(payload.source);
    },
    [signedIn, selectedProfileId]
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
      clipboardBaselineRef.current = await readText().then(
        (text) => (text ?? '').trim().toUpperCase(),
        () => null
      );
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

  useEffect(() => {
    if (!isTauri() || !selectedProfileId || signedIn) {
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
  }, [signedIn, redeemAuthCode, selectedProfileId]);

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
      selectServerProfile,
      switchToDefaultServer,
      refreshHealth,
      refreshFormats,
      refreshCards,
      refreshMyAgg,
      openAuthWindow,
      redeemAuthCode,
      ...clientActions
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
      selectServerProfile,
      switchToDefaultServer,
      refreshHealth,
      refreshFormats,
      refreshCards,
      refreshMyAgg,
      openAuthWindow,
      redeemAuthCode,
    ]
  );

  return <DesktopContext value={value}>{children}</DesktopContext>;
};

export const useDesktop = (): DesktopContextValue => {
  const value = useContext(DesktopContext);
  if (!value) {
    throw new Error('DesktopContext is not available');
  }
  return value;
};
