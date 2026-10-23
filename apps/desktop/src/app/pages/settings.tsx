import { Alert, Badge, Button, Card, Group, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { type JSX, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDesktop } from '../DesktopContext';
import { Disclosure, ErrorAlert, KeyValueTable, type KeyValueRow, PageHeader, PreferencesForm, ReadinessCard, ServerProfileForm } from '../components';
import { DEFAULT_GAME_VERSION, describeError, formatDateTime, pluralize } from '../format';
import { connectionLabel, isCustomServer, isSignedInToSelectedServer, serverHostLabel } from '../onboarding';
import { useScrollToHash } from './shared';

// Old deep links from before the Advanced section existed.
const LEGACY_HASHES: Record<string, string> = {
  '#readiness': '#setup',
  '#server-profile': '#advanced',
  '#server-health': '#advanced'
};

// Everything about which server the app talks to. Collapsed by default; opens on its own while a
// custom server is in use so it's never hidden.
const AdvancedServerSection = ({ forceOpen }: { forceOpen: boolean }): JSX.Element => {
  const {
    snapshot,
    selectedProfile,
    health,
    connection,
    selectServerProfile,
    switchToDefaultServer,
    deleteServerProfile,
    refreshHealth,
    refreshMe
  } = useDesktop();
  const customServer = isCustomServer(selectedProfile);
  const [opened, { open, toggle }] = useDisclosure(customServer || forceOpen);
  const [pickingOther, setPickingOther] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState('');
  const [error, setError] = useState('');
  const customProfiles = snapshot.profiles.filter((profile) => !profile.isDefault);
  const signedIn = isSignedInToSelectedServer(snapshot);

  useEffect(() => {
    if (customServer || forceOpen) {
      open();
    }
  }, [customServer, forceOpen]);

  const run = (action: () => Promise<void>, fallback: string): void => {
    setError('');
    action().catch((actionError: unknown) => setError(describeError(actionError, fallback)));
  };

  const backToDefault = (): void => {
    setPickingOther(false);
    run(switchToDefaultServer, "Couldn't switch back to XiPS.");
  };

  const detailRows: KeyValueRow[] = selectedProfile
    ? [
        { label: 'Name', value: selectedProfile.name },
        { label: 'Address', value: selectedProfile.baseUrl, className: 'desktop-mono desktop-wrap-anywhere' },
        { label: 'Game version', value: selectedProfile.gameVersion || DEFAULT_GAME_VERSION },
        { label: 'Connection', value: connectionLabel[connection] },
        { label: 'Service', value: health?.service ?? '-' },
        { label: 'Server queue', value: health?.queueDepth !== undefined ? `${health.queueDepth} queued, ${health.failedJobs ?? 0} failed` : '-' },
        { label: 'Last checked', value: formatDateTime(health?.timestamp) },
        { label: 'Signed in as', value: signedIn ? snapshot.authUser?.displayName ?? '-' : 'Not signed in' },
        { label: 'Sign-in expires', value: signedIn ? formatDateTime(snapshot.tokenExpiresAt) : '-' }
      ]
    : [];

  return (
    <Card className="desktop-card desktop-support-card" id="advanced">
      <Stack gap="sm">
        <Disclosure
          size="xs"
          variant="light"
          color="gray"
          opened={opened}
          onToggle={toggle}
          renderToggle={(button) => (
            <Group justify="space-between" align="center" wrap="wrap" gap="xs">
              <div>
                <Text fw={700}>Advanced: connect to a different server</Text>
                <Text size="sm" c="dimmed">
                  For developers. Most people never need this.
                </Text>
              </div>
              {button}
            </Group>
          )}
        >
          <Stack gap="md">
            {customServer && selectedProfile ? (
              <Alert color="orange" title={`Uploading to a custom server: ${serverHostLabel(selectedProfile.baseUrl)}`}>
                <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                  <Text size="sm">New exports go to this server, not XiPS.</Text>
                  <Button size="xs" color="orange" onClick={backToDefault}>
                    Back to XiPS (default)
                  </Button>
                </Group>
              </Alert>
            ) : null}
            <Switch
              label="Upload to XiPS (default)"
              description="Turn off to send uploads to a server you choose below."
              checked={!customServer && !pickingOther}
              onChange={(event) => {
                if (event.currentTarget.checked) {
                  if (customServer) {
                    backToDefault();
                  } else {
                    setPickingOther(false);
                  }
                } else {
                  setPickingOther(true);
                }
              }}
            />
            {customServer || pickingOther ? (
              <Select
                label="Upload to a different server"
                placeholder={customProfiles.length > 0 ? 'Choose a server' : 'Add a server below first'}
                disabled={customProfiles.length === 0}
                allowDeselect={false}
                value={customServer && selectedProfile ? selectedProfile.id : null}
                data={customProfiles.map((profile) => ({
                  value: profile.id,
                  label: `${profile.name} · ${serverHostLabel(profile.baseUrl)}`
                }))}
                onChange={(value) => {
                  if (value) {
                    setPickingOther(false);
                    run(() => selectServerProfile(value), "Couldn't switch to that server.");
                  }
                }}
              />
            ) : null}
            <ErrorAlert message={error} />
            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
              <Card className="desktop-card desktop-subcard">
                <Stack gap="sm">
                  <Text fw={700}>Current server</Text>
                  <KeyValueTable
                    rows={detailRows}
                    valueClassName="desktop-wrap-anywhere"
                    labelStyle={{ whiteSpace: 'nowrap', width: 1 }}
                    verticalSpacing={4}
                    horizontalSpacing="xs"
                  />
                  <Group gap="xs" wrap="wrap">
                    <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => run(refreshHealth, "Couldn't check the connection.")}>
                      Check connection
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      disabled={!selectedProfile || !signedIn}
                      onClick={() => run(() => refreshMe(selectedProfile?.id ?? ''), "Couldn't check sign-in.")}
                    >
                      Check sign-in
                    </Button>
                  </Group>
                </Stack>
              </Card>
              <ServerProfileForm />
            </SimpleGrid>
            <Card className="desktop-card desktop-subcard">
              <Stack gap="sm">
                <Text fw={700}>Saved servers</Text>
                {snapshot.profiles.map((profile) => {
                  const inUse = snapshot.selectedProfileId === profile.id;
                  const folderCount = snapshot.watchRoots.filter((root) => root.profileId === profile.id).length;
                  return (
                    <Group key={profile.id} justify="space-between" align="flex-start" wrap="wrap" gap="xs">
                      <div style={{ minWidth: 0 }}>
                        <Group gap="xs" wrap="wrap">
                          <Text fw={600}>{profile.name}</Text>
                          {profile.isDefault ? (
                            <Badge color="gray">
                              Built-in
                            </Badge>
                          ) : null}
                          {inUse ? (
                            <Badge color={profile.isDefault ? 'teal' : 'orange'}>
                              In use
                            </Badge>
                          ) : null}
                        </Group>
                        <Text size="sm" c="dimmed" className="desktop-mono desktop-wrap-anywhere">
                          {profile.baseUrl}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {profile.gameVersion || DEFAULT_GAME_VERSION} · {folderCount} watch {pluralize(folderCount, 'folder')}
                        </Text>
                      </div>
                      {confirmRemoveId === profile.id ? (
                        <Group gap="xs" wrap="wrap">
                          <Text size="sm">
                            Remove {profile.name}? This also removes its {folderCount} watch {pluralize(folderCount, 'folder')}.
                          </Text>
                          <Button
                            size="xs"
                            color="red"
                            onClick={() => {
                              setConfirmRemoveId('');
                              run(() => deleteServerProfile(profile.id), "Couldn't remove this server.");
                            }}
                          >
                            Remove
                          </Button>
                          <Button size="xs" variant="subtle" color="gray" onClick={() => setConfirmRemoveId('')}>
                            Cancel
                          </Button>
                        </Group>
                      ) : (
                        <Group gap="xs" wrap="wrap">
                          {!inUse ? (
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() =>
                                profile.isDefault
                                  ? backToDefault()
                                  : run(() => selectServerProfile(profile.id), "Couldn't switch to that server.")
                              }
                            >
                              Use
                            </Button>
                          ) : null}
                          {!profile.isDefault ? (
                            <Button size="xs" color="red" variant="light" onClick={() => setConfirmRemoveId(profile.id)}>
                              Remove
                            </Button>
                          ) : null}
                        </Group>
                      )}
                    </Group>
                  );
                })}
              </Stack>
            </Card>
          </Stack>
        </Disclosure>
      </Stack>
    </Card>
  );
};

export const SettingsPage = (): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const { snapshot, updatePreferences } = useDesktop();
  useScrollToHash();
  const settingsHash = location.hash || '#setup';

  useEffect(() => {
    const replacement = LEGACY_HASHES[location.hash];
    if (replacement) {
      navigate(`/settings${replacement}`, { replace: true });
    }
  }, [location.hash, navigate]);

  return (
    <Stack gap="lg">
      <PageHeader title="Settings" />
      <ReadinessCard id="setup" variant="settings" />
      <div id="desktop-behavior">
        <PreferencesForm preferences={snapshot.preferences} onSave={updatePreferences} />
      </div>
      <AdvancedServerSection forceOpen={settingsHash === '#advanced'} />
    </Stack>
  );
};
