import { Route, Routes } from 'react-router-dom';
import { DesktopProvider, useDesktop } from './DesktopContext';
import { DesktopSidebar, DesktopTopbar, OnboardingGate } from './components';
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
      <DesktopShell />
    </DesktopProvider>
  );
};

const DesktopShell = (): JSX.Element => {
  const { loading, selectedProfile, snapshot } = useDesktop();
  const isAuthenticated = snapshot.authUser !== null && snapshot.authProfileId === snapshot.selectedProfileId;
  const needsOnboarding = !loading && (!selectedProfile || !isAuthenticated);

  return (
    <div className="desktop-shell">
      <DesktopSidebar />
      <div className="desktop-main">
        <DesktopTopbar />
        <main className="desktop-content">
          {needsOnboarding ? (
            <OnboardingGate />
          ) : (
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/queue" element={<UploadQueuePage />} />
              <Route path="/watch-folders" element={<WatchFoldersPage />} />
              <Route path="/formats" element={<FormatsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/diagnostics" element={<DiagnosticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  );
};
