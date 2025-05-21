import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import pkg from './package.json';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/main/main.ts')
        },
        external: ['better-sqlite3', 'aws-sdk']
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        },
        external: ['better-sqlite3', 'electron', 'aws-sdk']
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    server: {
      port: 5173,
      hmr: true
    },
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      },
      minify: true
    },
    plugins: [
      react(),
    ],
    define: {
      APP_VERSION: JSON.stringify(pkg.version),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    }
  }
}); 