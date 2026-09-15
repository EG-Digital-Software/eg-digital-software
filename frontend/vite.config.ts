import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// `--mode tunnel` (npm run dev:tunnel) exposes the dev server through a public
// tunnel: it listens on all interfaces, accepts the tunnel's hostname, and — via
// the /api + /uploads proxies below — keeps everything same-origin so there is
// no CORS to configure. Normal `npm run dev` stays localhost-only.
export default defineConfig(({ mode }) => {
  const tunnel = mode === 'tunnel';
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      host: tunnel ? true : '127.0.0.1',
      port: 3000,
      // Vite blocks requests whose Host header it does not recognise; allow the
      // public tunnel hostname through when running in tunnel mode.
      ...(tunnel ? { allowedHosts: true } : {}),
      proxy: {
        '/uploads': 'http://localhost:4000',
        '/api': 'http://localhost:4000',
      },
    },
  };
});
