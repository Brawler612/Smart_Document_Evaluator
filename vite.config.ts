import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: { port: 5173 },
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
