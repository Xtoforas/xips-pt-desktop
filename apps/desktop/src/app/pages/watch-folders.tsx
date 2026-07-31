import { Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useDesktop } from '../DesktopContext';
import { FormatRuleTable, WatchRootForm, WatchRootTable } from '../components';
import { useScrollToHash } from './shared';

export const WatchFoldersPage = (): JSX.Element => {
  const { snapshot, deleteFormatRule, deleteWatchRoot, saveFormatRule, scanWatchRoots, toggleWatchRoot } = useDesktop();
  const [selectedWatchRootId, setSelectedWatchRootId] = useState('');
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [pattern, setPattern] = useState('');
  useScrollToHash();

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Watch Folders</h2>
        <p className="desktop-page-subtitle">Configure the CSV folders that the desktop app watches in the background.</p>
      </div>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <WatchRootForm id="watch-folders" />
        <Card withBorder className="desktop-card" id="format-rules">
          <Stack gap="sm">
            <Text fw={700}>Save format rule</Text>
            <Text size="sm" c="dimmed">Map a folder or filename pattern to a tournament format.</Text>
            <select value={selectedWatchRootId} onChange={(event) => setSelectedWatchRootId(event.currentTarget.value)}>
              <option value="">Choose a watch folder</option>
              {snapshot.watchRoots.map((root) => (
                <option key={root.id} value={root.id}>
                  {root.path}
                </option>
              ))}
            </select>
            <select value={selectedFormatId} onChange={(event) => setSelectedFormatId(event.currentTarget.value)}>
              <option value="">Choose a format</option>
              {snapshot.cachedFormats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.tournamentIdPrefix ? `${format.name} (${format.tournamentIdPrefix}xxxx)` : format.name}
                </option>
              ))}
            </select>
            <input
              className="mantine-Input-input"
              placeholder="Filename contains..."
              value={pattern}
              onChange={(event) => setPattern(event.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button
                disabled={!selectedWatchRootId || !selectedFormatId || !pattern.trim()}
                onClick={() => {
                  const format = snapshot.cachedFormats.find((item) => item.id === selectedFormatId) ?? null;
                  const selectedWatchRoot = snapshot.watchRoots.find((item) => item.id === selectedWatchRootId) ?? null;
                  if (!format || !selectedWatchRoot) {
                    return;
                  }
                  void saveFormatRule({
                    profileId: selectedWatchRoot.profileId,
                    watchRootId: selectedWatchRoot.id,
                    matchType: 'filename',
                    pattern: pattern.trim(),
                    formatId: format.id,
                    formatName: format.name
                  }).then(() => {
                    setPattern('');
                  });
                }}
              >
                Save rule
              </Button>
            </Group>
          </Stack>
        </Card>
      </SimpleGrid>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={700}>Watched directories</Text>
            <Button
              size="xs"
              variant="light"
              disabled={!snapshot.selectedProfileId}
              onClick={() => void scanWatchRoots(snapshot.selectedProfileId)}
            >
              Scan now
            </Button>
          </Group>
          <WatchRootTable watchRoots={snapshot.watchRoots} onToggle={toggleWatchRoot} onDelete={deleteWatchRoot} />
        </Stack>
      </Card>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Saved format rules</Text>
          <FormatRuleTable rules={snapshot.formatRules} onDelete={deleteFormatRule} />
        </Stack>
      </Card>
    </Stack>
  );
};
