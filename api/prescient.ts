import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadPrescientPayload } from '../lib/prescientCore'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const payload = await loadPrescientPayload()
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300')
    return res.status(200).json(payload)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/prescient]', msg)
    return res.status(502).json({ error: msg })
  }
}
