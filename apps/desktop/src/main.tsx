import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import { HashRouter } from 'react-router-dom';
import { App } from './app/App';
import { desktopCssVariablesResolver, desktopTheme } from './app/theme';
import './app/site-table.css';
import './app/styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={desktopTheme} defaultColorScheme="dark" cssVariablesResolver={desktopCssVariablesResolver}>
      <HashRouter>
        <App />
      </HashRouter>
    </MantineProvider>
  </React.StrictMode>
);
