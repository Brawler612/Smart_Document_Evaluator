import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devApiPlugin } from './scripts/vite-dev-api';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    /** OAuth redirect must match Supabase → Redirect URLs (http://localhost:5173/login). */
    strictPort: true,
  },
  plugins: [react(), devApiPlugin(mode)],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
}));
