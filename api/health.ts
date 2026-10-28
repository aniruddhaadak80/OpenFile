// GET /api/health — liveness probe used by the /status page
export default function handler(_req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ ok: true, name: 'OpenFile', version: '1.0.0', region: process.env.VERCEL_REGION ?? 'local', time: new Date().toISOString() })
}
