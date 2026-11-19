import type { IncomingMessage, ServerResponse } from 'http';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(
    JSON.stringify({
      ok: true,
      service: 'situgas-kemenag-jember',
      runtime: process.env.VERCEL ? 'vercel' : 'node',
      method: req.method || 'GET',
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    })
  );
}
