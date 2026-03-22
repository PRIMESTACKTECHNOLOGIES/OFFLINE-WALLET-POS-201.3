import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const port = parseInt(process.env.VITE_PORT || '5174');
  
  return {
    plugins: [react()],
    server: {
      port: port,
      strictPort: false,
      host: true,
      proxy: {
        '/merchant': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/auth': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
