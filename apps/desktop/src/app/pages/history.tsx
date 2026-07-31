import { Card, Group, Select, Stack } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useDesktop } from '../DesktopContext';
import { formatFileKindLabel, formatLifecycleLabel } from '../queue-model';

export const HistoryPage = (): JSX.Element => {
  const { snapshot } = useDesktop();
  const [fileKindFilter, setFileKindFilter] = useState('all');
  const [lifecycleFilter, setLifecycleFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | '1' | '7' | '30'>('all');
  const [sortKey, setSortKey] = useState<'updated' | 'filename' | 'retries'>('updated');
  const formatLabelById = useMemo(
    () =>
      Object.fromEntries(snapshot.cachedFormats.map((format) => [format.id, format.name])),
    [snapshot.cachedFormats]
  );

  const rows = useMemo(() => {
    const cutoff = (() => {
      if (dateRangeFilter === 'all') {
        return Number.NEGATIVE_INFINITY;
      }
      const days = Number.parseInt(dateRangeFilter, 10);
      return Date.now() - days * 24 * 60 * 60 * 1000;
    })();
    const filtered = snapshot.uploadJobs.filter((job) => {
      if (fileKindFilter !== 'all' && job.fileKind !== fileKindFilter) {
        return false;
      }
      if (lifecycleFilter !== 'all' && (job.lifecyclePhase ?? 'none') !== lifecycleFilter) {
        return false;
      }
      if (formatFilter !== 'all' && job.formatId !== formatFilter) {
        return false;
      }
      if (Date.parse(job.updatedAt) < cutoff) {
        return false;
      }
      return ['complete', 'duplicate_skipped_local', 'failed_terminal'].includes(job.localState);
    });

    return [...filtered].sort((left, right) => {
      if (sortKey === 'filename') {
        return left.filename.localeCompare(right.filename);
      }
      if (sortKey === 'retries') {
        return right.retries - left.retries;
      }
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
  }, [dateRangeFilter, fileKindFilter, formatFilter, lifecycleFilter, snapshot.uploadJobs, sortKey]);

  return (
    <Stack gap="lg">
      <div>
        <h2 className="desktop-page-title">History</h2>
        <p className="desktop-page-subtitle">Completed uploads and terminal rows from the local desktop history.</p>
      </div>
      <Group grow>
        <Select
          value={fileKindFilter}
          data={[
            { value: 'all', label: 'All file kinds' },
            { value: 'stats_export', label: 'Stats exports' },
            { value: 'card_catalog', label: 'Card lists' }
          ]}
          onChange={(value) => setFileKindFilter(value ?? 'all')}
        />
        <Select
          value={lifecycleFilter}
          data={[
            { value: 'all', label: 'All lifecycle states' },
            { value: 'complete', label: 'Complete' },
            { value: 'failed', label: 'Failed' },
            { value: 'skipped_duplicate', label: 'Skipped duplicate' }
          ]}
          onChange={(value) => setLifecycleFilter(value ?? 'all')}
        />
        <Select
          value={formatFilter}
          data={[
            { value: 'all', label: 'All formats' },
            ...snapshot.cachedFormats.map((format) => ({
              value: format.id,
              label: format.name
            }))
          ]}
          onChange={(value) => setFormatFilter(value ?? 'all')}
        />
        <Select
          value={sortKey}
          data={[
            { value: 'updated', label: 'Sort by updated' },
            { value: 'filename', label: 'Sort by filename' },
            { value: 'retries', label: 'Sort by retries' }
          ]}
          onChange={(value) => setSortKey((value as 'updated' | 'filename' | 'retries') ?? 'updated')}
        />
        <Select
          value={dateRangeFilter}
          data={[
            { value: 'all', label: 'All dates' },
            { value: '1', label: 'Last 24 hours' },
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' }
          ]}
          onChange={(value) => setDateRangeFilter((value as 'all' | '1' | '7' | '30') ?? 'all')}
        />
      </Group>
      <Card withBorder className="desktop-card">
        <div className="desktop-table-wrap">
          <table className="desktop-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Kind</th>
                <th>Format</th>
                <th>Lifecycle</th>
                <th>Retries</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>No history rows match the current filters.</td>
                </tr>
              ) : (
                rows.map((job) => (
                  <tr key={job.id}>
                    <td>{job.filename}</td>
                    <td>{formatFileKindLabel(job.fileKind)}</td>
                    <td>{job.formatId ? (formatLabelById[job.formatId] ?? 'Unknown format') : 'Unassigned'}</td>
                    <td>{formatLifecycleLabel(job.lifecyclePhase, job.fileKind)}</td>
                    <td>{job.retries}</td>
                    <td>{new Date(job.updatedAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Stack>
  );
};
