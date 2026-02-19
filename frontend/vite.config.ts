import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Optimize chunk size to reduce memory usage
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;

          // Only split out plotly.js (very large, ~3MB standalone lib)
          if (id.includes('plotly.js')) {
            return 'plotly';
          }

          // Let Vite/Rollup handle all other splitting automatically
          // Manual splitting of react/mui/web3 causes circular dependency errors
          // ("Cannot access 'Ge' before initialization")
        },
      },
    },
    // Use esbuild for faster, less memory-intensive minification
    minify: 'esbuild',
    // Limit parallel builds
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    // Increase rollup memory
    sourcemap: false,
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@mui/material',
      '@mui/icons-material',
    ],
    exclude: [],
  },
});
