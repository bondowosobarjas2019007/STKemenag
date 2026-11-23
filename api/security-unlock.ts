import type { IncomingMessage, ServerResponse } from 'http';
import { unlockSecurityLock } from '../lib/securityGuard.ts';

interface RequestWithOptionalBody extends IncomingMessage {
  body?: unknown;
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

async function readBodyText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export default async function handler(
  req: RequestWithOptionalBody,
  res: ServerResponse
) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { success: false, message: 'Metode harus POST.' });
    return;
  }

  try {
    let parsedBody: Record<string, unknown> = {};
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      parsedBody = req.body as Record<string, unknown>;
    } else {
      const rawText = Buffer.isBuffer(req.body)
        ? req.body.toString('utf-8')
        : typeof req.body === 'string'
          ? req.body
          : await readBodyText(req);
      if (rawText.trim()) {
        try {
          parsedBody = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          sendJson(res, 400, {
            success: false,
            message: 'Format permintaan tidak valid.',
          });
          return;
        }
      }
    }

    const adminKey =
      typeof parsedBody.adminKey === 'string' ? parsedBody.adminKey : '';
    const result = unlockSecurityLock(adminKey);

    if (!result.success) {
      sendJson(res, result.status, {
        success: false,
        message: result.message,
      });
      return;
    }

    sendJson(res, 200, {
      success: true,
      message: result.message,
    });
  } catch (err) {
    console.error('Error /api/security-unlock:', err);
    sendJson(res, 500, {
      success: false,
      message: 'Terjadi kesalahan saat memproses pembukaan kunci Admin.',
    });
  }
}
