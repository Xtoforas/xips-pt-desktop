import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { type JSX, useEffect, useState } from 'react';
import { isTauri } from './desktop-client';

export const UpdatePrompt = (): JSX.Element | null => {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let cancelled = false;
    check()
      .then((found) => {
        if (!cancelled && found) {
          setUpdate(found);
        }
      })
      .catch(() => {
        // Update checks are best-effort; never surface launch-time noise.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update || dismissed) {
    return null;
  }

  const installUpdate = async (): Promise<void> => {
    setInstalling(true);
    setErrorMessage('');
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setInstalling(false);
    }
  };

  return (
    <Card className="desktop-card desktop-update-prompt" padding="md" radius="md">
      <Stack gap="xs">
        <Text fw={600} size="sm">
          Update available
        </Text>
        <Text size="sm" c="dimmed">
          Version {update.version} is ready. Install now and the app will restart when it finishes.
        </Text>
        {errorMessage ? (
          <Text size="sm" c="red">
            Update failed: {errorMessage}
          </Text>
        ) : null}
        <Group gap="xs" justify="flex-end">
          <Button size="xs" variant="subtle" color="gray" disabled={installing} onClick={() => setDismissed(true)}>
            Not now
          </Button>
          <Button size="xs" loading={installing} onClick={() => void installUpdate()}>
            Install and restart
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};
