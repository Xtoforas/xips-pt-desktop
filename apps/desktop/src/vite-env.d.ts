/// <reference types="vite/client" />

declare global {
  interface Window {
    __TAURI_INTERNALS__?: Record<string, string>;
  }
}

export {};
