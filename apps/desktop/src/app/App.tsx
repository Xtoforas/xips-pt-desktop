import { Route, Routes } from 'react-router-dom';
import { DesktopProvider } from './DesktopContext';
import { DesktopSidebar, DesktopTopbar } from './components';
import {
  DiagnosticsPage,
  FormatsPage,
  HistoryPage,
  OverviewPage,
  SettingsPage,
  UploadQueuePage,
  WatchFoldersPage
} from './pages';

export const App = (): JSX.Element => {
  return (
    <DesktopProvider>
      <div className="desktop-shell">
        <DesktopSidebar />
        <div className="desktop-main">
          <DesktopTopbar />
          <main className="desktop-content">
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/queue" element={<UploadQueuePage />} />
              <Route path="/watch-folders" element={<WatchFoldersPage />} />
              <Route path="/formats" element={<FormatsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/diagnostics" element={<DiagnosticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </DesktopProvider>
  );
};
