/**
 * Vite 内置 Odaily API — dev / preview 时提供 /api/prescient。
 */
import type { Connect, Plugin } from 'vite'
import { loadOpportunitiesPayload, loadPrescientPayload } from '../api/lib/prescientCore'

async function handleApi(
  _req: Connect.IncomingMessage,
  res: Connect.ServerResponse,
  url: string,
) {
  try {
    const path = url.split('?')[0]
    if (path === '/api/health') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, service: 'vite-odaily-proxy' }))
      return
    }
    if (path === '/api/opportunities') {
      const payload = await loadOpportunitiesPayload()
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      res.end(JSON.stringify(payload))
      return
    }
    if (path === '/api/prescient') {
      const payload = await loadPrescientPayload()
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(payload))
      return
    }
    res.statusCode = 404
    res.end('Not found')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[prescient-api]', msg)
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: msg }))
  }
}

function apiMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url?.split('?')[0] ?? ''
    if (!url.startsWith('/api/')) return next()
    void handleApi(req, res, req.url ?? '')
  }
}

export function prescientApiPlugin(): Plugin {
  return {
    name: 'prescient-odaily-api',
    configureServer(server) {
      server.middlewares.use(apiMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiMiddleware())
    },
  }
}
