import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import os from 'os';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Store Vite's dep cache in system temp — avoids OneDrive EPERM file-lock errors on Windows
  cacheDir: path.join(os.tmpdir(), 'spic-vite-cache'),
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
