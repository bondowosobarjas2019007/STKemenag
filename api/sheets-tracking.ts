import type { IncomingMessage, ServerResponse } from 'http';
import {
  handleRelayGet,
  handleRelayPost,
  type RelayPostPayload,
} from '../lib/sheetsRelay.ts';

export const config = {
  maxDuration: 30,
};

interface VercelRequestLike extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelResponseLike extends ServerResponse {
  status?: (code: number) => VercelResponseLike;
  json?: (body: unknown) => void;
}

function sendJson(res: VercelResponseLike, statusCode: number, data: unknown) {
  const statusFn = res.status;
  const jsonFn = res.json;
  if (typeof statusFn === 'function' && typeof jsonFn === 'function') {
    statusFn.call(res, statusCode);
    jsonFn.call(res, data);
    return;
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(
  req: VercelRequestLike,
  res: VercelResponseLike
) {
  try {
    const overrideHeader = req.headers['x-apps-script-url'];
    const overrideUrl = Array.isArray(overrideHeader)
      ? overrideHeader[0]
      : overrideHeader;

    if (req.method === 'GET') {
      const urlObj = new URL(req.url || '/api/sheets-tracking', 'http://localhost');
      const rawAction =
        (Array.isArray(req.query?.action)
          ? req.query?.action[0]
          : req.query?.action) ||
        urlObj.searchParams.get('action') ||
        'status';
      const year =
        (Array.isArray(req.query?.year) ? req.query?.year[0] : req.query?.year) ||
        urlObj.searchParams.get('year') ||
        undefined;

      const action =
        rawAction === 'meta' || rawAction === 'list' ? rawAction : 'status';
      const result = await handleRelayGet({
        action,
        year,
        overrideWebhookUrl: overrideUrl,
      });
      sendJson(res, result.status, result.body);
      return;
    }

    if (req.method === 'POST') {
      let payload: RelayPostPayload = {};
      if (req.body && typeof req.body === 'object') {
        payload = req.body as RelayPostPayload;
      } else if (typeof req.body === 'string' && req.body.trim()) {
        payload = JSON.parse(req.body) as RelayPostPayload;
      } else {
        const raw = await readRawBody(req);
        if (raw.trim()) {
          payload = JSON.parse(raw) as RelayPostPayload;
        }
      }

      const result = await handleRelayPost(payload, overrideUrl);
      sendJson(res, result.status, result.body);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    sendJson(res, 405, { ok: false, error: 'Metode HTTP tidak diizinkan.' });
  } catch (err) {
    console.error('Error /api/sheets-tracking:', err);
    sendJson(res, 500, {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan pada jembatan Google Sheets.',
    });
  }
}
