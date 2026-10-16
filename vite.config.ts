import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // O workspace roda em um compartilhamento SMB (H:), onde fs.watch pode falhar.
      // Polling mantém o HMR funcionando em volumes de rede.
      usePolling: true,
      interval: 1000,
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
