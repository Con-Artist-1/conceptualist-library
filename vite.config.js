import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const LIBRARY_ROOT = path.resolve(__dirname, '..')

// Custom plugin to serve files from The Library root during local dev
const serveLibraryFiles = () => {
  return {
    name: 'serve-library-files',
    configureServer(server) {
      server.middlewares.use('/library-files', (req, res, next) => {
        const decodedPath = decodeURIComponent(req.url || '');
        const relativePath = decodedPath.startsWith('/') ? decodedPath.slice(1) : decodedPath;
        const fullPath = path.join(LIBRARY_ROOT, relativePath);
        
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          const ext = path.extname(fullPath).toLowerCase();
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Accept-Ranges', 'bytes');
          if (ext === '.pdf') {
            res.setHeader('Content-Type', 'application/pdf');
          }
          fs.createReadStream(fullPath).pipe(res);
        } else {
          next();
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react(), serveLibraryFiles()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
        }
      }
    }
  }
})
