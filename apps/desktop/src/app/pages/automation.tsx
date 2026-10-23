import { Button, Card, Collapse, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { type JSX, type ReactNode, useState } from 'react';
import { useDesktop } from '../DesktopContext';
import { FormatRuleTable, FormatsTable, PageHeader, WatchRootForm, WatchRootTable } from '../components';
import { explainFilenameAutoAssignment } from '../queue-model';
import { useScrollToHash } from './shared';

// Reference material that stays one click away: a title line with a Show/Hide toggle.
const DisclosureCard = ({
  title,
  aside,
  children
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}): JSX.Element => {
  const [open, setOpen] = useState(false);
  return (
    <Card withBorder className="desktop-card" py="xs">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Text size="sm" fw={700}>
            {title}
          </Text>
          {aside}
        </Group>
        <Button size="compact-xs" variant="subtle" color="gray" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
          {open ? 'Hide' : 'Show'}
        </Button>
      </Group>
      <Collapse expanded={open}>
        <Stack gap="sm" pt="sm">
          {children}
        </Stack>
      </Collapse>
    </Card>
  );
};

export const AutomationPage = (): JSX.Element => {
  const {
    snapshot,
    selectedProfile,
    deleteFormatRule,
    deleteWatchRoot,
    refreshFormats,
    saveFormatRule,
    scanWatchRoots,
    toggleWatchRoot
  } = useDesktop();
  const [addingFolder, setAddingFolder] = useState(false);
  const [selectedWatchRootId, setSelectedWatchRootId] = useState('');
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [pattern, setPattern] = useState('');
  const [validationFilename, setValidationFilename] = useState('stats_export_12345.csv');
  const [validationTeamCount, setValidationTeamCount] = useState('16');
  useScrollToHash();

  const hasFolders = snapshot.watchRoots.length > 0;
  const validationTeamCountValue = Number.parseInt(validationTeamCount, 10);
  const validationReason = validationFilename.trim()
    ? explainFilenameAutoAssignment(
        validationFilename.trim(),
        Number.isFinite(validationTeamCountValue) ? validationTeamCountValue : 0,
        snapshot.cachedFormats
      )
    : 'Enter a filename to see how the queue would match it.';

  const saveRule = (): void => {
    const format = snapshot.cachedFormats.find((item) => item.id === selectedFormatId) ?? null;
    const watchRoot = snapshot.watchRoots.find((item) => item.id === selectedWatchRootId) ?? null;
    if (!format || !watchRoot || !pattern.trim()) {
      return;
    }
    void saveFormatRule({
      profileId: watchRoot.profileId,
      watchRootId: watchRoot.id,
      matchType: 'filename',
      pattern: pattern.trim(),
      formatId: format.id,
      formatName: format.name
    }).then(() => {
      setPattern('');
    });
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Automation"
        actions={
          <>
            <Button
              size="xs"
              variant="light"
              disabled={!snapshot.selectedProfileId || !hasFolders}
              onClick={() => void scanWatchRoots(snapshot.selectedProfileId)}
            >
              Scan folders now
            </Button>
            <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void refreshFormats()}>
              Refresh formats
            </Button>
          </>
        }
      />
      <Card withBorder className="desktop-card" id="watch-folders">
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text fw={700}>Watched folders</Text>
            {hasFolders ? (
              <Button size="compact-xs" variant="subtle" onClick={() => setAddingFolder((current) => !current)}>
                {addingFolder ? 'Cancel' : 'Add folder'}
              </Button>
            ) : null}
          </Group>
          {hasFolders ? (
            <WatchRootTable watchRoots={snapshot.watchRoots} onToggle={toggleWatchRoot} onDelete={deleteWatchRoot} />
          ) : null}
          {!hasFolders || addingFolder ? <WatchRootForm onAdded={() => setAddingFolder(false)} /> : null}
        </Stack>
      </Card>
      <Card withBorder className="desktop-card" id="format-rules">
        <Stack gap="sm">
          <div>
            <Text fw={700}>Filename rules</Text>
            <Text size="xs" c="dimmed">
              Optional. Files are matched by tournament ID; add a rule for exports that arrive with generic names.
            </Text>
          </div>
          {snapshot.formatRules.length > 0 ? (
            <FormatRuleTable rules={snapshot.formatRules} watchRoots={snapshot.watchRoots} onDelete={deleteFormatRule} />
          ) : null}
          <Group gap="xs" align="flex-end" wrap="wrap">
            <Select
              size="xs"
              w={220}
              label="Folder"
              placeholder="Choose a folder"
              value={selectedWatchRootId || null}
              onChange={(value) => setSelectedWatchRootId(value ?? '')}
              data={snapshot.watchRoots.map((root) => ({ value: root.id, label: root.path }))}
            />
            <TextInput
              size="xs"
              w={180}
              label="Filename contains"
              placeholder="e.g. sunday_open"
              value={pattern}
              onChange={(event) => setPattern(event.currentTarget.value)}
            />
            <Select
              size="xs"
              style={{ flex: '1 1 240px', minWidth: 0 }}
              label="Format"
              placeholder="Choose a format"
              searchable
              value={selectedFormatId || null}
              onChange={(value) => setSelectedFormatId(value ?? '')}
              data={snapshot.cachedFormats.map((format) => ({
                value: format.id,
                label: format.tournamentIdPrefix ? `${format.name} (${format.tournamentIdPrefix}xxxx)` : format.name
              }))}
            />
            <Button size="xs" disabled={!selectedWatchRootId || !selectedFormatId || !pattern.trim()} onClick={saveRule}>
              Save rule
            </Button>
          </Group>
        </Stack>
      </Card>
      <DisclosureCard
        title="Formats"
        aside={
          <Text size="xs" c="dimmed">
            {snapshot.cachedFormats.length} loaded from the server
          </Text>
        }
      >
        <FormatsTable formats={snapshot.cachedFormats} />
      </DisclosureCard>
      <DisclosureCard
        title="Test a filename"
        aside={
          <Text size="xs" c="dimmed">
            See why a file would or wouldn&apos;t match on its own
          </Text>
        }
      >
        <Group gap="xs" align="flex-end" wrap="wrap">
          <TextInput
            size="xs"
            style={{ flex: '1 1 260px', minWidth: 0 }}
            label="Filename"
            placeholder="stats_export_12345.csv"
            value={validationFilename}
            onChange={(event) => setValidationFilename(event.currentTarget.value)}
          />
          <TextInput
            size="xs"
            w={90}
            label="Teams"
            placeholder="16"
            value={validationTeamCount}
            onChange={(event) => {
              setValidationTeamCount(event.currentTarget.value.replace(/[^0-9]/gu, '').slice(0, 2));
            }}
          />
        </Group>
        <Text size="sm">{validationReason}</Text>
      </DisclosureCard>
    </Stack>
  );
};
