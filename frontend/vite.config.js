import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/items': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/chars': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/buildings': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',  // Auf allen Netzwerk-Interfaces lauschen
    allowedHosts: [
      'soaria.soa666.de',
      'localhost',
      '192.168.178.101',
      '.soa666.de'  // Alle Subdomains erlauben
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/items': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/chars': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/buildings': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
