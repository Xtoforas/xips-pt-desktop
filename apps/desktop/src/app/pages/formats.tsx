import { Alert, Button, Card, Group, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useDesktop } from '../DesktopContext';
import { FormatsTable, formatOvrRangeLabel, formatSlotCountsLabel, formatTeamsPerTournamentLabel } from '../components';

export const FormatsPage = (): JSX.Element => {
  const { snapshot, selectedProfile, refreshFormats } = useDesktop();
  const [selectedFormatId, setSelectedFormatId] = useState('');

  useEffect(() => {
    if (!selectedFormatId && snapshot.cachedFormats.length > 0) {
      setSelectedFormatId(snapshot.cachedFormats[0]?.id ?? '');
    }
  }, [selectedFormatId, snapshot.cachedFormats]);

  const selectedFormat = snapshot.cachedFormats.find((format) => format.id === selectedFormatId) ?? null;

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">Formats</h2>
        <p className="desktop-page-subtitle">Tournament format discovery driven by the live `/api/v1/formats` backend endpoint.</p>
      </div>
      <Card withBorder className="desktop-card">
        <Group justify="space-between">
          <div>
            <Text fw={700}>Cached formats</Text>
            <Text size="sm" c="dimmed">
              Refresh from the selected server to update local assignment choices.
            </Text>
          </div>
          <Button size="xs" variant="light" disabled={!selectedProfile} onClick={() => void refreshFormats()}>
            Refresh formats
          </Button>
        </Group>
      </Card>
      <Card withBorder className="desktop-card">
        <Stack gap="sm">
          <Text fw={700}>Selected format detail</Text>
          <Select
            value={selectedFormatId || null}
            data={snapshot.cachedFormats.map((format) => ({
              value: format.id,
              label: format.tournamentIdPrefix ? `${format.name} (${format.tournamentIdPrefix}xxxx)` : format.name
            }))}
            placeholder="Choose a format"
            onChange={(value) => {
              setSelectedFormatId(value ?? '');
            }}
          />
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
        <FormatsTable formats={snapshot.cachedFormats} />
      </Card>
    </Stack>
  );
};
