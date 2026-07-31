import { Alert, Button, Card, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useDesktop } from '../DesktopContext';
import { buildOnboardingSteps, PreferencesForm, ReadinessCard, ServerProfileForm } from '../components';
import { useScrollToHash } from './shared';

export const SettingsPage = (): JSX.Element => {
  const location = useLocation();
  const {
    snapshot,
    selectedProfile,
    health,
    authFlowState,
    authFlowError,
    deleteServerProfile,
    refreshHealth,
    openAuthWindow,
    redeemAuthCode,
    refreshMe,
    selectServerProfile,
    updatePreferences
  } = useDesktop();
  useScrollToHash();
  const isAuthenticated = snapshot.authUser !== null && snapshot.authProfileId === snapshot.selectedProfileId;
  const onboardingSteps = useMemo(
    () => buildOnboardingSteps({ snapshot, health, selectedProfile, authFlowState }),
    [authFlowState, health, selectedProfile, snapshot]
  );
  const nextStep = onboardingSteps.find((step) => !step.complete) ?? null;
  const settingsHash = location.hash || '#server-profile';
  const [authCode, setAuthCode] = useState('');

  const submitCode = async (code: string): Promise<void> => {
    if (!selectedProfile || !code.trim()) {
      return;
    }
    try {
      await redeemAuthCode(selectedProfile.id, code.trim());
      setAuthCode('');
    } catch {
      // authFlowError already reflects the failure for display below.
    }
  };

  const handleRedeemCode = (): Promise<void> => submitCode(authCode);

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Settings</h2>
        <p className="desktop-page-subtitle">Server profiles and desktop behavior configuration.</p>
      </div>
      <Group gap="xs" wrap="wrap">
        <Button component={Link} to="/settings#server-profile" size="xs" variant={settingsHash === '#server-profile' ? 'filled' : 'light'}>
          Server
        </Button>
        <Button component={Link} to="/settings#readiness" size="xs" variant={settingsHash === '#readiness' ? 'filled' : 'light'}>
          Readiness
        </Button>
        <Button component={Link} to="/settings#desktop-behavior" size="xs" variant={settingsHash === '#desktop-behavior' ? 'filled' : 'light'}>
          Desktop behavior
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <ServerProfileForm id="server-profile" />
        <div id="desktop-behavior">
          <PreferencesForm preferences={snapshot.preferences} onSave={updatePreferences} />
        </div>
      </SimpleGrid>
      <ReadinessCard
        id="readiness"
        onboardingSteps={onboardingSteps}
        nextStep={nextStep}
        selectedProfileName={selectedProfile ? `${selectedProfile.name} is active.` : 'No server profile selected yet.'}
        dismissCompletedReadinessCard={snapshot.preferences.dismissCompletedReadinessCard}
        onDismissCompletedReadinessCard={(dismissed) => {
          void updatePreferences({
            ...snapshot.preferences,
            dismissCompletedReadinessCard: dismissed
          });
        }}
        onDismissAutomationReminder={() => {
          void updatePreferences({
            ...snapshot.preferences,
            dismissAutomationRuleReadiness: true
          });
        }}
        variant="settings"
      />
      <Card withBorder className="desktop-card desktop-support-card" id="server-health">
        <Stack gap="sm">
          <Text fw={700}>Connection checks</Text>
          <Text size="sm" c="dimmed">
            Current server health and signed-in desktop identity state.
          </Text>
          <Alert color={health?.ok ? 'teal' : 'gray'} title="Health">
            {health?.ok ? 'Server reachable' : 'Server not checked yet.'}
          </Alert>
          <Text size="sm">Selected server: {selectedProfile?.name ?? 'No server selected'}</Text>
          <Text size="sm">Signed in user: {isAuthenticated ? snapshot.authUser?.displayName : 'Not signed in'}</Text>
          <Text size="sm">Token expiry: {isAuthenticated ? snapshot.tokenExpiresAt : 'No token issued'}</Text>
          <Text size="sm">Detected files: {snapshot.detectedFiles.length}</Text>
          <Group>
            <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void refreshHealth()}>
              Check health
            </Button>
            <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void openAuthWindow(selectedProfile?.id ?? '')}>
              Open sign-in
            </Button>
          </Group>
          {!isAuthenticated ? (
            <>
              <Text size="sm" c="dimmed">
                After signing in in the popup, copy the short code it shows. This device will pick it up from your
                clipboard automatically, or you can paste it below.
              </Text>
              <Group align="flex-end" wrap="wrap">
                <TextInput
                  label="Sign-in code"
                  placeholder="ABCD2345"
                  value={authCode}
                  disabled={!selectedProfile}
                  onChange={(event) => setAuthCode(event.currentTarget.value.toUpperCase())}
                />
                <Button
                  size="sm"
                  disabled={!selectedProfile || !authCode.trim()}
                  loading={authFlowState === 'waiting'}
                  onClick={() => void handleRedeemCode()}
                >
                  Redeem code
                </Button>
              </Group>
              {authFlowError ? (
                <Alert color="red" title="Sign-in problem">
                  {authFlowError}
                </Alert>
              ) : null}
            </>
          ) : null}
        </Stack>
      </Card>
      <Card withBorder className="desktop-card desktop-support-card">
        <Stack gap="sm">
          <Text fw={700}>Where routine actions live</Text>
          <Text size="sm" c="dimmed">
            Settings stays focused on server profiles and desktop behavior. Routine refreshes now live on Today and Automation so the main workflow keeps its own tools.
          </Text>
          <Group gap="xs" wrap="wrap">
            <Button component={Link} to="/today" size="xs" variant="light">
              Open Today
            </Button>
            <Button component={Link} to="/automation#cached-formats" size="xs" variant="light">
              Open Automation
            </Button>
          </Group>
        </Stack>
      </Card>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Saved server profiles</Text>
          {snapshot.profiles.length === 0 ? (
            <Alert color="gray">No server profiles configured.</Alert>
          ) : (
            snapshot.profiles.map((profile) => (
              <Card key={profile.id} withBorder className="desktop-subcard">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={600}>{profile.name}</Text>
                    <Text size="sm" c="dimmed" className="desktop-mono">
                      {profile.baseUrl}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {snapshot.selectedProfileId === profile.id ? 'Selected server' : 'Saved server'}
                      {' · '}
                      {profile.gameVersion || 'ootp27'}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => {
                        void selectServerProfile(profile.id).then(() => refreshHealth());
                      }}
                    >
                      Check health
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      disabled={snapshot.authProfileId !== profile.id || !snapshot.authUser}
                      onClick={() => {
                        void selectServerProfile(profile.id).then(() => refreshMe(profile.id));
                      }}
                    >
                      Check auth
                    </Button>
                    <Button size="xs" color="red" variant="light" onClick={() => void deleteServerProfile(profile.id)}>
                      Remove
                    </Button>
                  </Group>
                </Group>
              </Card>
            ))
          )}
        </Stack>
      </Card>
    </Stack>
  );
};
