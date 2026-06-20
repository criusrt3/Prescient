import { loadOpportunitiesPayload } from './lib/prescientCore.js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
}

type ApiRequest = { method?: string }
type ApiResponse = {
  statusCode: number
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

function sendJson(res: ApiResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  try {
    const payload = await loadOpportunitiesPayload()
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    sendJson(res, 200, payload)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/opportunities]', msg)
    sendJson(res, 502, { error: msg })
  }
}
