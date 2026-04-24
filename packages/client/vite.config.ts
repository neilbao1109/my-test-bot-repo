import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Also load .env from the server package so the port stays in sync
  const serverEnv = loadEnv(mode, '../server', '');
  const backendPort = serverEnv.PORT || process.env.VITE_BACKEND_PORT || '3001';
  const backendUrl = `http://localhost:${backendPort}`;

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'ClawChat',
          short_name: 'ClawChat',
          description: 'ClawChat — real-time messaging',
          theme_color: '#0c8cff',
          background_color: '#1a1b1e',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          // Only cache app shell assets, NOT API or socket requests
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              urlPattern: /^\/api\//,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /\/socket\.io\//,
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
    build: {
      target: ['es2020', 'safari15', 'chrome90', 'firefox90'],
      chunkSizeWarningLimit: 700,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': backendUrl,
        '/socket.io': {
          target: backendUrl,
          ws: true,
        },
      },
    },
  };
});
