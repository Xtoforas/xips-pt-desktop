import { Navigate, Route, Routes } from 'react-router-dom';
import { DesktopProvider } from './DesktopContext';
import { DesktopSidebar, DesktopTopbar } from './components';
import {
  AutomationPage,
  DiagnosticsPage,
  SettingsPage,
  UploadQueuePage,
  TodayPage
} from './pages';

export const App = (): JSX.Element => {
  return (
    <DesktopProvider>
      <DesktopShell />
    </DesktopProvider>
  );
};

const DesktopShell = (): JSX.Element => {
  return (
    <div className="desktop-shell">
      <DesktopSidebar />
      <div className="desktop-main">
        <DesktopTopbar />
        <main className="desktop-content">
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/overview" element={<Navigate to="/today" replace />} />
            <Route path="/queue" element={<UploadQueuePage />} />
            <Route path="/automation" element={<AutomationPage />} />
            <Route path="/watch-folders" element={<Navigate to="/automation" replace />} />
            <Route path="/formats" element={<Navigate to="/automation" replace />} />
            <Route path="/history" element={<Navigate to="/today" replace />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};
