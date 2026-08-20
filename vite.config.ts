import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/api': 'http://127.0.0.1:8000',
      '/complaints': 'http://127.0.0.1:8000',
      '/track': 'http://127.0.0.1:8000',
      '/admin/complaints': 'http://127.0.0.1:8000',
      '/admin/analytics': 'http://127.0.0.1:8000',
      '/admin/departments': 'http://127.0.0.1:8000',
      '/chat': 'http://127.0.0.1:8000',
      '/voice': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/uploads': 'http://127.0.0.1:8000',
    },
  },
});
