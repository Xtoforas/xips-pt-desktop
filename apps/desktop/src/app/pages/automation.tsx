import { Alert, Badge, Button, Card, Group, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useDesktop } from '../DesktopContext';
import {
  FormatRuleTable,
  FormatsTable,
  formatOvrRangeLabel,
  formatSlotCountsLabel,
  formatTeamsPerTournamentLabel,
  WatchRootForm,
  WatchRootTable
} from '../components';
import { explainFilenameAutoAssignment } from '../queue-model';
import { useScrollToHash } from './shared';

export const AutomationPage = (): JSX.Element => {
  const {
    snapshot,
    selectedProfile,
    deleteFormatRule,
    deleteWatchRoot,
    refreshFormats,
    saveFormatRule,
    scanWatchRoots,
    toggleWatchRoot,
    updatePreferences
  } = useDesktop();
  const [selectedWatchRootId, setSelectedWatchRootId] = useState('');
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [pattern, setPattern] = useState('');
  const [validationFilename, setValidationFilename] = useState('stats_export_12345.csv');
  const [validationTeamCount, setValidationTeamCount] = useState('16');
  useEffect(() => {
    if (!selectedFormatId && snapshot.cachedFormats.length > 0) {
      setSelectedFormatId(snapshot.cachedFormats[0]?.id ?? '');
    }
  }, [selectedFormatId, snapshot.cachedFormats]);
  useScrollToHash();

  const selectedWatchRoot = snapshot.watchRoots.find((root) => root.id === selectedWatchRootId) ?? null;
  const selectedFormat = snapshot.cachedFormats.find((format) => format.id === selectedFormatId) ?? null;
  const validationTeamCountValue = Number.parseInt(validationTeamCount, 10);
  const validationReason = validationFilename.trim()
    ? explainFilenameAutoAssignment(
        validationFilename.trim(),
        Number.isFinite(validationTeamCountValue) ? validationTeamCountValue : 0,
        snapshot.cachedFormats
      )
    : 'Enter a filename to reuse the same auto-assignment logic the queue uses for blocked files.';

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={2}>Automation</Title>
        <Text c="dimmed">Watch folder, rule, format match, and validation in one workflow for background uploads.</Text>
      </Stack>
      <Card withBorder className="desktop-card desktop-automation-hero">
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text fw={700}>Automation flow</Text>
              <Text size="sm" c="dimmed">
                The app watches a folder, tries filename-based format detection first, and only needs saved rules when generic filenames need extra help.
              </Text>
            </div>
            <Group gap="xs" wrap="wrap">
              <Badge color="blue" variant="light">
                {snapshot.watchRoots.length} watch roots
              </Badge>
              <Badge color="teal" variant="light">
                {snapshot.formatRules.length} rules
              </Badge>
              <Badge color="grape" variant="light">
                {snapshot.cachedFormats.length} formats
              </Badge>
            </Group>
          </Group>
          <Group gap="xs" wrap="wrap" className="desktop-automation-sequence">
            <Badge color="blue" variant="light">
              1 Watch folder
            </Badge>
            <Text c="dimmed" size="sm">
              →
            </Text>
            <Badge color="teal" variant="light">
              2 Rule
            </Badge>
            <Text c="dimmed" size="sm">
              →
            </Text>
            <Badge color="grape" variant="light">
              3 Format match
            </Badge>
            <Text c="dimmed" size="sm">
              →
            </Text>
            <Badge color="orange" variant="light">
              4 Validation
            </Badge>
          </Group>
        </Stack>
      </Card>
      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <Stack gap="lg">
          <WatchRootForm id="watch-folders" />
          <Card withBorder className="desktop-card">
            <Stack gap="sm">
              <Group justify="space-between">
                <div>
                  <Text fw={700}>Saved watch roots</Text>
                  <Text size="sm" c="dimmed">
                    Keep the roots visible so you can pause, reactivate, or remove them without leaving Automation.
                  </Text>
                </div>
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
        </Stack>
        <Stack gap="lg">
          <Card withBorder className="desktop-card" id="format-rules">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="wrap">
                <div>
                  <Text fw={700}>Format rule</Text>
                  <Text size="sm" c="dimmed">
                    Optional. Use this when watched files keep arriving with generic names.
                  </Text>
                </div>
                <Group gap="xs" wrap="wrap">
                  {snapshot.preferences.dismissAutomationRuleReadiness ? (
                    <Badge color="gray" variant="light">
                      Reminder dismissed
                    </Badge>
                  ) : null}
                  <Button
                    size="xs"
                    variant="light"
                    color="gray"
                    onClick={() => {
                      void updatePreferences({
                        ...snapshot.preferences,
                        dismissAutomationRuleReadiness: !snapshot.preferences.dismissAutomationRuleReadiness
                      });
                    }}
                  >
                    {snapshot.preferences.dismissAutomationRuleReadiness ? 'Show reminder again' : 'Dismiss checklist reminder'}
                  </Button>
                </Group>
              </Group>
              <Group gap="xs" wrap="wrap" className="desktop-automation-relation">
                <Badge color="blue" variant="light">
                  Watch folder: {selectedWatchRoot?.path ?? 'Choose one'}
                </Badge>
                <Text c="dimmed" size="sm">
                  →
                </Text>
                <Badge color="teal" variant="light">
                  Rule: {pattern.trim() || 'Filename contains...'}
                </Badge>
                <Text c="dimmed" size="sm">
                  →
                </Text>
                <Badge color="grape" variant="light">
                  Format: {selectedFormat?.name ?? 'Choose in step 3'}
                </Badge>
              </Group>
              <Select
                placeholder="Choose a watch folder"
                value={selectedWatchRootId || null}
                onChange={(value) => setSelectedWatchRootId(value ?? '')}
                data={snapshot.watchRoots.map((root) => ({ value: root.id, label: root.path }))}
              />
              <TextInput
                placeholder="Filename contains..."
                value={pattern}
                onChange={(event) => setPattern(event.currentTarget.value)}
              />
              <Text size="xs" c="dimmed">
                The selected format below is used only when this optional rule matches.
              </Text>
              <Group justify="flex-end">
                <Button
                  disabled={!selectedWatchRootId || !selectedFormatId || !pattern.trim()}
                  onClick={() => {
                    const format = snapshot.cachedFormats.find((item) => item.id === selectedFormatId) ?? null;
                    const selectedWatchRootToSave = snapshot.watchRoots.find((item) => item.id === selectedWatchRootId) ?? null;
                    if (!format || !selectedWatchRootToSave) {
                      return;
                    }
                    void saveFormatRule({
                      profileId: selectedWatchRootToSave.profileId,
                      watchRootId: selectedWatchRootToSave.id,
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
              <Text fw={700}>Saved format rules</Text>
              <FormatRuleTable rules={snapshot.formatRules} onDelete={deleteFormatRule} />
            </Stack>
          </Card>
          <Card withBorder className="desktop-card" id="cached-formats">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={700}>Format match library</Text>
                  <Text size="sm" c="dimmed">
                    Select the live tournament format that the current rule should resolve to.
                  </Text>
                </div>
                <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void refreshFormats()}>
                  Refresh formats
                </Button>
              </Group>
              <Select
                placeholder="Choose a format"
                value={selectedFormatId || null}
                onChange={(value) => setSelectedFormatId(value ?? '')}
                data={snapshot.cachedFormats.map((format) => ({
                  value: format.id,
                  label: format.tournamentIdPrefix ? `${format.name} (${format.tournamentIdPrefix}xxxx)` : format.name
                }))}
              />
              <Text size="xs" c="dimmed">
                This selection drives the rule above and keeps the watch folder, filename pattern, and target format linked together.
              </Text>
              {!selectedFormat ? (
                <Alert color="gray">Select a format to inspect the live restriction metadata from the server.</Alert>
              ) : (
                <SimpleGrid cols={{ base: 1, md: 2 }}>
                  <Card withBorder className="desktop-subcard">
                    <Stack gap={4}>
                      <Text fw={600}>{selectedFormat.name}</Text>
                      <Text size="sm" c="dimmed">
                        Tournament ID pattern: {selectedFormat.tournamentIdPrefix ? `${selectedFormat.tournamentIdPrefix} + 4-digit suffix (${selectedFormat.tournamentIdPrefix.length + 4} digits total)` : '-'}
                      </Text>
                      <Text size="sm" c="dimmed">Teams per tournament: {formatTeamsPerTournamentLabel(selectedFormat)}</Text>
                      <Text size="sm" c="dimmed">Mode: {selectedFormat.mode || '-'}</Text>
                      <Text size="sm" c="dimmed">Run environment: {selectedFormat.runEnvironment || '-'}</Text>
                      <Text size="sm" c="dimmed">Park: {selectedFormat.parkKey || '-'}</Text>
                      <Text size="sm" c="dimmed">Cap: {selectedFormat.capValue || '-'}</Text>
                    </Stack>
                  </Card>
                  <Card withBorder className="desktop-subcard">
                    <Stack gap={4}>
                      <Text size="sm">OVR range: {formatOvrRangeLabel(selectedFormat)}</Text>
                      <Text size="sm">Slots tournament: {selectedFormat.isSlotsTournament ? 'Yes' : 'No'}</Text>
                      <Text size="sm">Slot counts: {formatSlotCountsLabel(selectedFormat)}</Text>
                      <Text size="sm">Era restrictions: {selectedFormat.eraRestrictions.join(', ') || '-'}</Text>
                      <Text size="sm">Card type restrictions: {selectedFormat.cardTypeRestrictions.join(', ') || '-'}</Text>
                      <Text size="sm">Variant limit: {selectedFormat.variantLimitValue || '-'}</Text>
                      <Text size="sm">Format type: {selectedFormat.formatType || '-'}</Text>
                    </Stack>
                  </Card>
                </SimpleGrid>
              )}
            </Stack>
          </Card>
          <Card withBorder className="desktop-card">
            <Stack gap="sm">
              <Group justify="space-between">
                <div>
                  <Text fw={700}>Validation</Text>
                  <Text size="sm" c="dimmed">
                    Reuse the same auto-assignment reasoning the queue uses when a file does not match automatically.
                  </Text>
                </div>
                <Badge color="orange" variant="light">
                  Step 4
                </Badge>
              </Group>
              <TextInput
                label="Sample filename"
                placeholder="stats_export_12345.csv"
                value={validationFilename}
                onChange={(event) => setValidationFilename(event.currentTarget.value)}
              />
              <TextInput
                label="Detected teams"
                placeholder="16"
                value={validationTeamCount}
                onChange={(event) => {
                  setValidationTeamCount(event.currentTarget.value.replace(/[^0-9]/gu, '').slice(0, 2));
                }}
              />
              <Alert color="blue" title="Why this file would or would not match automatically">
                {validationReason}
              </Alert>
            </Stack>
          </Card>
          <Card withBorder className="desktop-card">
            <Stack gap="sm">
              <Group justify="space-between">
                <div>
                  <Text fw={700}>Cached formats</Text>
                  <Text size="sm" c="dimmed">
                    Refresh to get the latest tournament list for matching files.
                  </Text>
                </div>
                <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void refreshFormats()}>
                  Refresh formats
                </Button>
              </Group>
              <FormatsTable formats={snapshot.cachedFormats} />
            </Stack>
          </Card>
        </Stack>
      </SimpleGrid>
    </Stack>
  );
};
