import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4022', '/uploads': 'http://127.0.0.1:4022', '/health': 'http://127.0.0.1:4022' },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: { livekit: ['livekit-client', '@livekit/components-react'], react: ['react', 'react-dom', 'react-router-dom'] } } },
  },
});
