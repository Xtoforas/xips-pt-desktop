import { Alert, Badge, Button, Card, Group, HoverCard, Select, Stack, Text, TextInput } from '@mantine/core';
import { NavLink, useLocation } from 'react-router-dom';
import type { DesktopPreferences, LocalFormatRule, LocalServerProfile, LocalWatchRoot, LocalUploadJob, TournamentFormat } from '@xips/api-contract';
import { useEffect, useState } from 'react';
import { useDesktop } from './DesktopContext';
import { desktopClient } from './desktop-client';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/queue', label: 'Upload Queue' },
  { to: '/watch-folders', label: 'Watch Folders' },
  { to: '/formats', label: 'Formats' },
  { to: '/history', label: 'History' },
  { to: '/diagnostics', label: 'Diagnostics' },
  { to: '/settings', label: 'Settings' }
] as const;

const serverOptions = (profiles: LocalServerProfile[]): Array<{ value: string; label: string }> =>
  profiles.map((profile) => ({
    value: profile.id,
    label: profile.name
  }));

export const DesktopSidebar = (): JSX.Element => {
  const location = useLocation();
  const { snapshot, health } = useDesktop();

  return (
    <aside className="desktop-sidebar">
      <div className="desktop-brand">
        <div className="desktop-brand-mark">XP</div>
        <div>
          <h1>xips-pt desktop</h1>
          <p>Perfect Team upload control room</p>
        </div>
      </div>
      <div className="desktop-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            className={`desktop-nav-link${location.pathname === item.to ? ' active' : ''}`}
            to={item.to}
          >
            {item.label}
          </NavLink>
        ))}
      </div>
      <Card withBorder className="desktop-status-card">
        <Stack gap={6}>
          <Text className="desktop-micro-label">Server status</Text>
          <Group justify="space-between">
            <Text size="sm">{health?.service ?? 'not checked'}</Text>
            <Badge color={health?.ok ? 'teal' : 'gray'} variant="light">
              {health?.ok ? 'healthy' : 'idle'}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed">
            Queue depth: {health?.queueDepth ?? 0}
          </Text>
          <Text size="xs" c="dimmed">
            Failed jobs: {health?.failedJobs ?? 0}
          </Text>
          <Text size="xs" c="dimmed">
            Profiles: {snapshot.profiles.length}
          </Text>
        </Stack>
      </Card>
    </aside>
  );
};

export const DesktopTopbar = (): JSX.Element => {
  const {
    snapshot,
    authFlowState,
    selectedProfile,
    selectServerProfile,
    openAuthWindow,
    logout,
    processUploadQueue
  } = useDesktop();
  const isAuthenticated = snapshot.authUser !== null && snapshot.authProfileId === snapshot.selectedProfileId;

  return (
    <header className="desktop-topbar">
      <Group gap="sm" wrap="wrap" className="desktop-topbar-left">
        <Group gap="xs" wrap="nowrap" className="desktop-server-field">
          <Text size="sm" fw={600}>
            Server
          </Text>
          <Select
            value={snapshot.selectedProfileId || null}
            data={serverOptions(snapshot.profiles)}
            placeholder="Select a server"
            className="desktop-select-wrap"
            onChange={(value) => {
              if (value) {
                void selectServerProfile(value);
              }
            }}
          />
        </Group>
        {selectedProfile ? (
          <Text size="sm" c="dimmed" className="desktop-mono desktop-topbar-endpoint">
            {selectedProfile.baseUrl}
          </Text>
        ) : null}
        {snapshot.tokenExpiresAt && isAuthenticated ? (
          <Text size="xs" c="dimmed">
            Token {new Date(snapshot.tokenExpiresAt).toLocaleString()}
          </Text>
        ) : null}
        {authFlowState === 'waiting' ? (
          <Badge color="orange" variant="light">
            Completing sign-in...
          </Badge>
        ) : null}
      </Group>
      <Group gap="sm">
        {!selectedProfile ? (
          <Alert className="desktop-topbar-alert" color="blue" variant="light" title="Setup required">
            Add a server profile below to start sign-in.
          </Alert>
        ) : null}
        <Badge color="orange" variant="light">
          Pending {snapshot.uploadJobs.filter((job) => !['complete', 'duplicate_skipped_local', 'failed_terminal'].includes(job.localState) && (job.localPresence === 'present' || Boolean(job.uploadId))).length}
        </Badge>
        {selectedProfile ? (
          <>
            {!isAuthenticated ? (
              <Button
                size="xs"
                variant="light"
                disabled={authFlowState === 'waiting'}
                onClick={() => void openAuthWindow(selectedProfile.id)}
              >
                Sign in
              </Button>
            ) : null}
            <Button size="xs" variant="light" disabled={!isAuthenticated} onClick={() => void processUploadQueue(selectedProfile.id)}>
              Upload queue
            </Button>
            {snapshot.authUser && isAuthenticated ? (
              <HoverCard shadow="md" position="bottom-end" withArrow>
                <HoverCard.Target>
                  <Button size="xs" variant="subtle">
                    {snapshot.authUser.displayName}
                  </Button>
                </HoverCard.Target>
                <HoverCard.Dropdown>
                  <Stack gap="xs">
                    <Text size="sm" fw={600}>
                      {snapshot.authUser.displayName}
                    </Text>
                    <Button size="xs" color="red" variant="light" onClick={() => void logout(selectedProfile.id)}>
                      Logout
                    </Button>
                  </Stack>
                </HoverCard.Dropdown>
              </HoverCard>
            ) : null}
          </>
        ) : null}
      </Group>
    </header>
  );
};

export const OnboardingGate = (): JSX.Element => {
  const {
    snapshot,
    authFlowError,
    authFlowState,
    selectedProfile,
    health,
    saveServerProfile,
    refreshHealth,
    openAuthWindow,
    refreshMe
  } = useDesktop();
  const [profileName, setProfileName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'health' | 'signin' | 'validate' | ''>('');
  const isAuthenticated = snapshot.authUser !== null && snapshot.authProfileId === snapshot.selectedProfileId;
  const hasSelectedProfile = selectedProfile !== null;

  const handleSaveProfile = async (): Promise<void> => {
    if (!profileName.trim() || !baseUrl.trim()) {
      setErrorMessage('Enter a profile name and the xips-pt base URL first.');
      return;
    }
    setBusyAction('save');
    setErrorMessage('');
    try {
      await saveServerProfile({
        name: profileName.trim(),
        baseUrl: baseUrl.trim()
      });
      setProfileName('');
      setBaseUrl('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save server profile.');
    } finally {
      setBusyAction('');
    }
  };

  const handleCheckServer = async (): Promise<void> => {
    if (!selectedProfile) {
      return;
    }
    setBusyAction('health');
    setErrorMessage('');
    try {
      await refreshHealth();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to contact the selected server.');
    } finally {
      setBusyAction('');
    }
  };

  const handleOpenSignin = async (): Promise<void> => {
    if (!selectedProfile) {
      return;
    }
    setBusyAction('signin');
    setErrorMessage('');
    try {
      await openAuthWindow(selectedProfile.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to open the Discord sign-in window.');
    } finally {
      setBusyAction('');
    }
  };

  const handleValidateAuth = async (): Promise<void> => {
    if (!selectedProfile) {
      return;
    }
    setBusyAction('validate');
    setErrorMessage('');
    try {
      await refreshMe(selectedProfile.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Auth validation failed.');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="desktop-oobe-wrap">
      <Card withBorder className="desktop-oobe-hero">
        <Stack gap="lg">
          <div>
            <Text className="desktop-micro-label">First Run Setup</Text>
            <h2 className="desktop-page-title">Connect xips-pt desktop to your server first</h2>
            <p className="desktop-page-subtitle">Add a server, verify it responds, then finish the Discord-backed desktop sign-in flow.</p>
          </div>
          {errorMessage ? (
            <Alert color="red" title="Setup problem">
              {errorMessage}
            </Alert>
          ) : null}
          {authFlowError ? (
            <Alert color="red" title="Desktop sign-in problem">
              {authFlowError}
            </Alert>
          ) : null}
          <div className="desktop-oobe-grid">
            <Card withBorder className="desktop-card">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={700}>1. Add server</Text>
                  <Badge color={hasSelectedProfile ? 'teal' : 'blue'} variant="light">
                    {hasSelectedProfile ? 'Done' : 'Required'}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  Create the first server profile for the xips-pt instance this desktop app should talk to.
                </Text>
                <TextInput
                  label="Profile name"
                  placeholder="Local xips-pt"
                  value={profileName}
                  onChange={(event) => setProfileName(event.currentTarget.value)}
                />
                <TextInput
                  label="Base URL"
                  placeholder="http://localhost:8080"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.currentTarget.value)}
                />
                {selectedProfile ? (
                  <Alert color="gray" variant="light" title="Selected server">
                    <div>{selectedProfile.name}</div>
                    <div className="desktop-mono">{selectedProfile.baseUrl}</div>
                  </Alert>
                ) : null}
                <Group justify="flex-end">
                  <Button loading={busyAction === 'save'} onClick={() => void handleSaveProfile()}>
                    Save server
                  </Button>
                </Group>
              </Stack>
            </Card>
            <Card withBorder className="desktop-card">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={700}>2. Verify server</Text>
                  <Badge color={health?.ok ? 'teal' : 'gray'} variant="light">
                    {health?.ok ? 'Healthy' : 'Unchecked'}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  Make sure the selected server responds before opening the auth flow.
                </Text>
                <div className="desktop-oobe-status-list">
                  <div>
                    <Text className="desktop-micro-label">Service</Text>
                    <Text>{health?.service ?? 'Not checked yet'}</Text>
                  </div>
                  <div>
                    <Text className="desktop-micro-label">Queue depth</Text>
                    <Text>{health?.queueDepth ?? 0}</Text>
                  </div>
                  <div>
                    <Text className="desktop-micro-label">Failed jobs</Text>
                    <Text>{health?.failedJobs ?? 0}</Text>
                  </div>
                </div>
                <Group justify="flex-end">
                  <Button
                    variant="light"
                    disabled={!selectedProfile}
                    loading={busyAction === 'health'}
                    onClick={() => void handleCheckServer()}
                  >
                    Check server
                  </Button>
                </Group>
              </Stack>
            </Card>
            <Card withBorder className="desktop-card">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={700}>3. Sign in with Discord</Text>
                  <Badge color={isAuthenticated ? 'teal' : 'orange'} variant="light">
                    {isAuthenticated ? 'Connected' : 'Pending'}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  Open the website login flow in the auth popup. As soon as Discord auth finishes, the desktop app will complete token exchange and close the window automatically.
                </Text>
                <div className="desktop-oobe-status-list">
                  <div>
                    <Text className="desktop-micro-label">Selected profile</Text>
                    <Text>{selectedProfile?.name ?? 'No server selected'}</Text>
                  </div>
                  <div>
                    <Text className="desktop-micro-label">Auth state</Text>
                    <Text>
                      {isAuthenticated
                        ? snapshot.authUser?.displayName ?? 'Signed in'
                        : authFlowState === 'waiting'
                          ? 'Waiting for callback'
                          : 'Signed out'}
                    </Text>
                  </div>
                  <div>
                    <Text className="desktop-micro-label">Token expiry</Text>
                    <Text>{snapshot.tokenExpiresAt || 'No token issued yet'}</Text>
                  </div>
                </div>
                <Group>
                  <Button
                    disabled={!selectedProfile}
                    loading={busyAction === 'signin' || authFlowState === 'waiting'}
                    onClick={() => void handleOpenSignin()}
                  >
                    Open sign-in
                  </Button>
                  <Button
                    variant="subtle"
                    disabled={!selectedProfile}
                    loading={busyAction === 'validate'}
                    onClick={() => void handleValidateAuth()}
                  >
                    Validate auth
                  </Button>
                </Group>
                {isAuthenticated ? (
                  <Alert color="teal" title="Setup complete">
                    The desktop app is connected. You can now configure watch folders and upload flows.
                  </Alert>
                ) : null}
              </Stack>
            </Card>
          </div>
        </Stack>
      </Card>
    </div>
  );
};

const lifecycleColor = (value: string | null): string => {
  switch (value) {
    case 'complete':
      return 'teal';
    case 'refreshing':
      return 'cyan';
    case 'refresh_pending':
      return 'blue';
    case 'processing':
      return 'orange';
    case 'failed':
      return 'red';
    case 'skipped_duplicate':
      return 'gray';
    case 'queued':
      return 'yellow';
    default:
      return 'gray';
  }
};

const localStateColor = (value: LocalUploadJob['localState']): string => {
  switch (value) {
    case 'complete':
      return 'teal';
    case 'uploading':
      return 'orange';
    case 'server_processing':
    case 'server_refresh_pending':
    case 'server_refreshing':
      return 'blue';
    case 'failed_retryable':
      return 'yellow';
    case 'failed_terminal':
      return 'red';
    case 'duplicate_skipped_local':
      return 'gray';
    case 'auth_blocked':
      return 'red';
    default:
      return 'gray';
  }
};

const localPresenceColor = (value: LocalUploadJob['localPresence']): string =>
  value === 'present' ? 'teal' : 'gray';

export const formatFileKindLabel = (fileKind: LocalUploadJob['fileKind'] | 'unknown'): string => {
  if (fileKind === 'card_catalog') {
    return 'card_list';
  }
  return fileKind;
};

export const formatQueueStateLabel = (
  state: LocalUploadJob['localState'],
  fileKind: LocalUploadJob['fileKind']
): string => {
  if (fileKind === 'card_catalog' && (state === 'complete' || state === 'server_refresh_pending')) {
    return 'list_updated';
  }
  return state;
};

export const formatLifecycleLabel = (
  phase: LocalUploadJob['lifecyclePhase'],
  fileKind: LocalUploadJob['fileKind']
): string => {
  if (fileKind === 'card_catalog' && (phase === 'complete' || phase === 'refresh_pending')) {
    return 'list_updated';
  }
  return phase ?? 'not_started';
};

export const formatLocalPresenceLabel = (presence: LocalUploadJob['localPresence']): string =>
  presence === 'present' ? 'present_locally' : 'missing_locally';

export const FileKindBadge = ({ fileKind }: { fileKind: LocalUploadJob['fileKind'] }): JSX.Element => (
  <Badge color={fileKind === 'card_catalog' ? 'grape' : 'blue'} variant="light">
    {formatFileKindLabel(fileKind)}
  </Badge>
);

export const QueueStateBadge = ({
  state,
  fileKind
}: {
  state: LocalUploadJob['localState'];
  fileKind: LocalUploadJob['fileKind'];
}): JSX.Element => (
  <Badge color={localStateColor(state)} variant="light">
    {formatQueueStateLabel(state, fileKind)}
  </Badge>
);

export const LifecycleBadge = ({
  phase,
  fileKind
}: {
  phase: LocalUploadJob['lifecyclePhase'];
  fileKind: LocalUploadJob['fileKind'];
}): JSX.Element => (
  <Badge color={lifecycleColor(phase)} variant="light">
    {formatLifecycleLabel(phase, fileKind)}
  </Badge>
);

export const LocalPresenceBadge = ({ presence }: { presence: LocalUploadJob['localPresence'] }): JSX.Element => (
  <Badge color={localPresenceColor(presence)} variant="light">
    {formatLocalPresenceLabel(presence)}
  </Badge>
);

export const SummaryCard = ({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}): JSX.Element => (
  <Card withBorder className="desktop-card">
    <Stack gap={4}>
      <Text className="desktop-micro-label">{label}</Text>
      <Text className="desktop-stat">{value}</Text>
      <Text size="xs" c="dimmed">
        {detail}
      </Text>
    </Stack>
  </Card>
);

export const QueueTable = ({
  jobs,
  formatLabels,
  selectedJobId,
  onSelect,
  actions,
  renderFilename
}: {
  jobs: LocalUploadJob[];
  formatLabels?: Record<string, string>;
  selectedJobId?: string;
  onSelect?: (job: LocalUploadJob) => void;
  actions?: (job: LocalUploadJob) => JSX.Element;
  renderFilename?: (job: LocalUploadJob) => JSX.Element;
}): JSX.Element => {
  const orderedJobs = [...jobs].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return (
  <div className="desktop-table-wrap">
    <table className="desktop-table">
      <thead>
        <tr>
          <th>Updated</th>
          <th>File</th>
          <th>Kind</th>
          <th>Format</th>
          <th>Local file</th>
          <th>Checksum</th>
          <th>Local state</th>
          <th>Server state</th>
          <th>Retries</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {orderedJobs.length === 0 ? (
          <tr>
            <td colSpan={10}>No queued uploads yet.</td>
          </tr>
        ) : (
          orderedJobs.map((job) => (
            <tr
              key={job.id}
              className={selectedJobId === job.id ? 'desktop-row-selected' : ''}
              onClick={() => onSelect?.(job)}
            >
              <td>{new Date(job.updatedAt).toLocaleString()}</td>
              <td>{renderFilename ? renderFilename(job) : job.filename}</td>
              <td>
                <FileKindBadge fileKind={job.fileKind} />
              </td>
              <td>{job.formatId ? (formatLabels?.[job.formatId] ?? 'Unknown format') : 'Unassigned'}</td>
              <td>
                <LocalPresenceBadge presence={job.localPresence} />
              </td>
              <td className="desktop-mono">
                {job.duplicateReason ? 'duplicate' : job.remoteChecksum ? 'uploaded' : 'pending'}
              </td>
              <td>
                <QueueStateBadge state={job.localState} fileKind={job.fileKind} />
              </td>
              <td>
                <LifecycleBadge phase={job.lifecyclePhase} fileKind={job.fileKind} />
              </td>
              <td>{job.retries}</td>
              <td>{actions ? actions(job) : '-'}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
  );
};

export const WatchRootTable = ({
  watchRoots,
  onToggle,
  onDelete
}: {
  watchRoots: LocalWatchRoot[];
  onToggle: (watchRootId: string, paused: boolean) => Promise<void>;
  onDelete: (watchRootId: string) => Promise<void>;
}): JSX.Element => (
  <div className="desktop-table-wrap">
    <table className="desktop-table">
      <thead>
        <tr>
          <th>Path</th>
          <th>Recursive</th>
          <th>Status</th>
          <th>Updated</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {watchRoots.length === 0 ? (
          <tr>
            <td colSpan={5}>No watched directories configured.</td>
          </tr>
        ) : (
          watchRoots.map((root) => (
            <tr key={root.id}>
              <td className="desktop-mono">{root.path}</td>
              <td>{root.recursive ? 'Yes' : 'No'}</td>
              <td>{root.paused ? 'Paused' : 'Active'}</td>
              <td>{new Date(root.updatedAt).toLocaleString()}</td>
              <td>
                <Group gap="xs">
                  <Button size="compact-xs" variant="light" onClick={() => void onToggle(root.id, !root.paused)}>
                    {root.paused ? 'Resume' : 'Pause'}
                  </Button>
                  <Button size="compact-xs" color="red" variant="light" onClick={() => void onDelete(root.id)}>
                    Remove
                  </Button>
                </Group>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export const FormatsTable = ({ formats }: { formats: TournamentFormat[] }): JSX.Element => (
  <div className="desktop-table-wrap">
    <table className="desktop-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Tournament ID</th>
          <th>Mode</th>
          <th>Run env</th>
          <th>Park</th>
          <th>Cap</th>
          <th>OVR restrictions</th>
        </tr>
      </thead>
      <tbody>
        {formats.length === 0 ? (
          <tr>
            <td colSpan={7}>No cached formats yet.</td>
          </tr>
        ) : (
          formats.map((format) => (
            <tr key={format.id}>
              <td>{format.name}</td>
              <td>{format.tournamentIdPrefix ? `${format.tournamentIdPrefix}${'x'.repeat(4)}` : '-'}</td>
              <td>{format.mode || '-'}</td>
              <td>{format.runEnvironment || '-'}</td>
              <td>{format.parkKey || '-'}</td>
              <td>{format.capValue || '-'}</td>
              <td>{format.ovrRestrictions.join(', ') || '-'}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export const ServerProfileForm = (): JSX.Element => {
  const { snapshot, saveServerProfile } = useDesktop();
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  return (
    <Card withBorder className="desktop-card">
      <Stack gap="sm">
        <Text fw={700}>Add server profile</Text>
        <Select
          label="Edit existing profile"
          placeholder="Create a new profile"
          value={editingId || null}
          data={[
            { value: '', label: 'Create new profile' },
            ...snapshot.profiles.map((profile) => ({ value: profile.id, label: profile.name }))
          ]}
          onChange={(value) => {
            const nextId = value ?? '';
            setEditingId(nextId);
            const profile = snapshot.profiles.find((item) => item.id === nextId) ?? null;
            setName(profile?.name ?? '');
            setBaseUrl(profile?.baseUrl ?? '');
          }}
        />
        <TextInput label="Profile name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
        <TextInput label="Base URL" value={baseUrl} onChange={(event) => setBaseUrl(event.currentTarget.value)} />
        <Group justify="flex-end">
          <Button
            onClick={() => {
              if (!name.trim() || !baseUrl.trim()) {
                return;
              }
              void saveServerProfile({
                id: editingId || undefined,
                name: name.trim(),
                baseUrl: baseUrl.trim()
              }).then(() => {
                setEditingId('');
                setName('');
                setBaseUrl('');
              });
            }}
          >
            {editingId ? 'Update profile' : 'Save profile'}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};

export const WatchRootForm = (): JSX.Element => {
  const { selectedProfile, addWatchRoot } = useDesktop();
  const [path, setPath] = useState('');

  useEffect(() => {
    if (!selectedProfile) {
      setPath('');
      return;
    }
    let active = true;
    void desktopClient.getDefaultWatchRoot().then((defaultPath) => {
      if (active && defaultPath && !path.trim()) {
        setPath(defaultPath);
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedProfile?.id]);

  return (
    <Card withBorder className="desktop-card">
      <Stack gap="sm">
        <Text fw={700}>Add watch folder</Text>
        <TextInput
          label="Folder path"
          placeholder="Default OOTP 27 online_data path"
          value={path}
          onChange={(event) => setPath(event.currentTarget.value)}
        />
        <Text size="xs" c="dimmed">
          Defaults to the current platform&apos;s OOTP Baseball 27 `online_data` directory.
        </Text>
        <Group justify="flex-end">
          <Button
            disabled={!selectedProfile || !path.trim()}
            onClick={() => {
              if (!selectedProfile || !path.trim()) {
                return;
              }
              void addWatchRoot({
                profileId: selectedProfile.id,
                path: path.trim(),
                recursive: false
              }).then(() => {
                void desktopClient.getDefaultWatchRoot().then((defaultPath) => {
                  setPath(defaultPath);
                }).catch(() => {
                  setPath('');
                });
              });
            }}
          >
            Add folder
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};

export const FormatRuleTable = ({
  rules,
  onDelete
}: {
  rules: LocalFormatRule[];
  onDelete: (formatRuleId: string) => Promise<void>;
}): JSX.Element => (
  <div className="desktop-table-wrap">
    <table className="desktop-table">
      <thead>
        <tr>
          <th>Match</th>
          <th>Pattern</th>
          <th>Format</th>
          <th>Updated</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rules.length === 0 ? (
          <tr>
            <td colSpan={5}>No saved format rules yet.</td>
          </tr>
        ) : (
          rules.map((rule) => (
            <tr key={rule.id}>
              <td>{rule.matchType}</td>
              <td className="desktop-mono">{rule.pattern}</td>
              <td>{rule.formatName}</td>
              <td>{new Date(rule.updatedAt).toLocaleString()}</td>
              <td>
                <Button size="compact-xs" color="red" variant="light" onClick={() => void onDelete(rule.id)}>
                  Remove
                </Button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export const PreferencesForm = ({
  preferences,
  onSave
}: {
  preferences: DesktopPreferences;
  onSave: (preferences: DesktopPreferences) => Promise<void>;
}): JSX.Element => {
  const [launchAtLogin, setLaunchAtLogin] = useState(preferences.launchAtLogin);
  const [closeToTray, setCloseToTray] = useState(preferences.closeToTray);
  const [pollingIntervalSeconds, setPollingIntervalSeconds] = useState(String(preferences.pollingIntervalSeconds));
  const [diagnosticsRetentionDays, setDiagnosticsRetentionDays] = useState(String(preferences.diagnosticsRetentionDays));

  return (
    <Card withBorder className="desktop-card">
      <Stack gap="sm">
        <Text fw={700}>Desktop behavior</Text>
        <label className="desktop-checkbox-row">
          <input
            type="checkbox"
            checked={launchAtLogin}
            onChange={(event) => setLaunchAtLogin(event.currentTarget.checked)}
          />
          <span>Launch at login</span>
        </label>
        <label className="desktop-checkbox-row">
          <input type="checkbox" checked={closeToTray} onChange={(event) => setCloseToTray(event.currentTarget.checked)} />
          <span>Close to background</span>
        </label>
        <TextInput
          label="Polling interval (seconds)"
          value={pollingIntervalSeconds}
          onChange={(event) => setPollingIntervalSeconds(event.currentTarget.value)}
        />
        <TextInput
          label="Diagnostics retention (days)"
          value={diagnosticsRetentionDays}
          onChange={(event) => setDiagnosticsRetentionDays(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button
            onClick={() => {
              const polling = Number.parseInt(pollingIntervalSeconds, 10);
              const retention = Number.parseInt(diagnosticsRetentionDays, 10);
              if (!Number.isFinite(polling) || !Number.isFinite(retention)) {
                return;
              }
              void onSave({
                launchAtLogin,
                closeToTray,
                pollingIntervalSeconds: polling,
                diagnosticsRetentionDays: retention
              });
            }}
          >
            Save preferences
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};
