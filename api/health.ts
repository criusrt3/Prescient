type ApiResponse = {
  statusCode: number
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

export default function handler(_req: unknown, res: ApiResponse) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ ok: true, service: 'vercel-prescient-api' }))
}
