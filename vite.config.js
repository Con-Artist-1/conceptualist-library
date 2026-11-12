import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const LIBRARY_ROOT = path.resolve(__dirname, '..')
const LOCAL_VIEWS_FILE = path.join(__dirname, '.data', 'paper_views.json')

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.txt': 'text/plain; charset=utf-8',
}

function readLocalViews() {
  try {
    if (!fs.existsSync(LOCAL_VIEWS_FILE)) return {}
    const parsed = JSON.parse(fs.readFileSync(LOCAL_VIEWS_FILE, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalViews(counts) {
  try {
    fs.mkdirSync(path.dirname(LOCAL_VIEWS_FILE), { recursive: true })
    fs.writeFileSync(LOCAL_VIEWS_FILE, JSON.stringify(counts, null, 2))
  } catch {
    // Best-effort local persistence only
  }
}

async function attachApiAndLibraryMiddlewares(server) {
  let cachedViewsHandler = null
  let viewsHandlerAttempted = false

  server.middlewares.use('/api/views', async (req, res) => {
    const sendJson = (statusCode, payload) => {
      res.statusCode = statusCode
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(payload))
    }

    // Shim Vercel/Express helpers if handler runs inside Vite Connect
    res.status = (code) => {
      res.statusCode = code
      return res
    }
    res.json = (payload) => sendJson(res.statusCode || 200, payload)

    if (!req.query) {
      const urlObj = new URL(req.url || '/', 'http://localhost')
      req.query = Object.fromEntries(urlObj.searchParams.entries())
    }

    if (req.method === 'POST' && req.body === undefined) {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        req.body = raw ? JSON.parse(raw) : {}
      } catch {
        req.body = {}
      }
    }

    if (!viewsHandlerAttempted) {
      viewsHandlerAttempted = true
      try {
        const viewsModuleUrl = pathToFileURL(path.join(__dirname, 'api', 'views.js')).href
        const mod = await import(/* @vite-ignore */ viewsModuleUrl)
        cachedViewsHandler = mod.default
      } catch {
        cachedViewsHandler = null
      }
    }

    if (cachedViewsHandler && process.env.MONGODB_URI) {
      try {
        await cachedViewsHandler(req, res)
        return
      } catch {
        // Fall through to local dev file store
      }
    }

    const counts = readLocalViews()
    if (req.method === 'GET') {
      return sendJson(200, { ok: true, source: 'local-dev', counts })
    }

    if (req.method === 'POST') {
      const paperKey = typeof req.body?.paperKey === 'string' ? req.body.paperKey.trim().slice(0, 220) : ''
      if (!paperKey) return sendJson(400, { ok: false, error: 'Missing paperKey' })
      const next = (counts[paperKey] || 0) + 1
      counts[paperKey] = next
      writeLocalViews(counts)
      return sendJson(200, {
        ok: true,
        source: 'local-dev',
        paperKey,
        views: next,
        incremented: true,
        cooldownRemainingMs: 30000
      })
    }

    return sendJson(405, { error: 'Method not allowed' })
  })

  const ALLOWED_LIBRARY_PREFIXES = ['Past Papers/', 'IAL Books/', 'IGCSE Books/']

  server.middlewares.use('/library-files', (req, res) => {
    const cleanUrl = (req.url || '').split('?')[0]
    let decodedPath = ''
    try {
      decodedPath = decodeURIComponent(cleanUrl)
    } catch {
      res.statusCode = 400
      res.end('Bad request')
      return
    }
    const relativePath = decodedPath.startsWith('/') ? decodedPath.slice(1) : decodedPath
    const normalizedRel = relativePath.replace(/\\/g, '/')
    if (
      normalizedRel.includes('..') ||
      normalizedRel.split('/').some((seg) => seg.startsWith('.')) ||
      !ALLOWED_LIBRARY_PREFIXES.some((prefix) => normalizedRel.startsWith(prefix))
    ) {
      res.statusCode = 403
      res.end('Forbidden')
      return
    }
    const fullPath = path.resolve(LIBRARY_ROOT, relativePath)

    // Strict containment check prevents path traversal outside LIBRARY_ROOT
    if (!fullPath.startsWith(LIBRARY_ROOT + path.sep)) {
      res.statusCode = 403
      res.end('Forbidden')
      return
    }

    let stat
    try {
      stat = fs.statSync(fullPath)
    } catch {
      res.statusCode = 404
      res.end('Not found')
      return
    }
    if (!stat.isFile()) {
      res.statusCode = 404
      res.end('Not found')
      return
    }

    const ext = path.extname(fullPath).toLowerCase()
    const contentType = MIME_BY_EXT[ext] || 'application/octet-stream'
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', contentType)

    const total = stat.size
    const rangeHeader = req.headers.range
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim())
      if (!match) {
        res.statusCode = 416
        res.setHeader('Content-Range', `bytes */${total}`)
        res.end()
        return
      }
      let start = match[1] ? parseInt(match[1], 10) : 0
      let end = match[2] ? parseInt(match[2], 10) : total - 1
      if (!match[1] && match[2]) {
        const suffixLen = parseInt(match[2], 10)
        start = Math.max(0, total - suffixLen)
        end = total - 1
      }
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
        res.statusCode = 416
        res.setHeader('Content-Range', `bytes */${total}`)
        res.end()
        return
      }
      end = Math.min(end, total - 1)
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
      res.setHeader('Content-Length', end - start + 1)
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      fs.createReadStream(fullPath, { start, end }).pipe(res)
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Length', total)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    fs.createReadStream(fullPath).pipe(res)
  })
}

// Custom plugin to serve files from The Library root and handle /api/views during local dev & preview
const serveLibraryFiles = () => {
  return {
    name: 'serve-library-files',
    configureServer(server) {
      attachApiAndLibraryMiddlewares(server)
    },
    configurePreviewServer(server) {
      attachApiAndLibraryMiddlewares(server)
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
