import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Also load .env from the server package so the port stays in sync
  const serverEnv = loadEnv(mode, '../server', '');
  const backendPort = serverEnv.PORT || process.env.VITE_BACKEND_PORT || '3001';
  const backendUrl = `http://localhost:${backendPort}`;

  return {
    plugins: [react()],
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
