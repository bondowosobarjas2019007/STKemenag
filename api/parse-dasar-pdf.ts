import type { IncomingMessage, ServerResponse } from 'http';
import {
  extractDasarFromInput,
  mapGeminiErrorToFriendlyMessage,
  type DirectoryPegawaiInput,
  type ExtractionPrecisionMode,
} from '../lib/parseDasarPdf.ts';

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

interface RequestWithOptionalBody extends IncomingMessage {
  body?: unknown;
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

async function readStreamBuffer(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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
    sendJson(res, 405, { error: 'Metode harus POST untuk mengunggah PDF.' });
    return;
  }

  try {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    let cleanBase64 = '';
    let textContent = '';
    let isTextOnly = false;
    let fileName = 'dasar_surat.pdf';
    let customDirectory: DirectoryPegawaiInput[] = [];
    let precisionMode: ExtractionPrecisionMode = 'cepat';

    let rawBuffer: Buffer | null = null;
    let parsedObj: Record<string, unknown> | null = null;

    if (Buffer.isBuffer(req.body)) {
      rawBuffer = req.body;
    } else if (typeof req.body === 'string') {
      rawBuffer = Buffer.from(req.body, 'utf-8');
    } else if (
      req.body &&
      typeof req.body === 'object' &&
      Object.keys(req.body as Record<string, unknown>).length > 0
    ) {
      parsedObj = req.body as Record<string, unknown>;
    } else {
      rawBuffer = await readStreamBuffer(req);
    }

    const isBinaryPdf =
      Boolean(rawBuffer) &&
      (contentType.includes('application/pdf') ||
        contentType.includes('application/octet-stream') ||
        rawBuffer!.subarray(0, 4).toString('ascii') === '%PDF');

    if (isBinaryPdf && rawBuffer) {
      if (rawBuffer.length === 0) {
        sendJson(res, 400, { error: 'File PDF tidak valid atau kosong.' });
        return;
      }
      cleanBase64 = rawBuffer.toString('base64');
      const rawHeaderName = req.headers['x-file-name'];
      const headerNameStr = Array.isArray(rawHeaderName)
        ? rawHeaderName[0]
        : rawHeaderName;
      if (headerNameStr) {
        try {
          fileName = decodeURIComponent(headerNameStr);
        } catch {
          fileName = headerNameStr;
        }
      }
      const rawCustomDir = req.headers['x-custom-directory'];
      const customDirStr = Array.isArray(rawCustomDir)
        ? rawCustomDir[0]
        : rawCustomDir;
      if (customDirStr) {
        try {
          const parsedCustom = JSON.parse(decodeURIComponent(customDirStr));
          if (Array.isArray(parsedCustom)) customDirectory = parsedCustom;
        } catch {
          customDirectory = [];
        }
      }
      const rawPrecision = req.headers['x-precision-mode'];
      const precisionStr = Array.isArray(rawPrecision) ? rawPrecision[0] : rawPrecision;
      if (precisionStr === 'teliti') {
        precisionMode = 'teliti';
      }
    } else {
      if (!parsedObj && rawBuffer && rawBuffer.length > 0) {
        try {
          parsedObj = JSON.parse(rawBuffer.toString('utf-8')) as Record<
            string,
            unknown
          >;
        } catch {
          sendJson(res, 400, { error: 'Format data permintaan tidak valid.' });
          return;
        }
      }
      const bodyObj = parsedObj || {};
      if (typeof bodyObj.fileName === 'string' && bodyObj.fileName) {
        fileName = bodyObj.fileName;
      }
      if (Array.isArray(bodyObj.directory)) {
        customDirectory = bodyObj.directory as DirectoryPegawaiInput[];
      }
      if (bodyObj.precisionMode === 'teliti') {
        precisionMode = 'teliti';
      }

      if (bodyObj.isTextOnly === true && typeof bodyObj.textContent === 'string') {
        isTextOnly = true;
        textContent = bodyObj.textContent.trim();
        if (!textContent) {
          sendJson(res, 400, { error: 'Konten teks PDF kosong.' });
          return;
        }
      } else {
        const rawBase64 =
          typeof bodyObj.fileBase64 === 'string'
            ? bodyObj.fileBase64
            : typeof bodyObj.docB64 === 'string'
              ? bodyObj.docB64
              : '';
        if (!rawBase64) {
          sendJson(res, 400, { error: 'File PDF tidak valid atau kosong.' });
          return;
        }
        cleanBase64 = rawBase64
          .replace(/^data:application\/pdf;base64,/, '')
          .trim();
      }
    }

    const result = await extractDasarFromInput({
      base64Pdf: cleanBase64 || undefined,
      textContent: textContent || undefined,
      isTextOnly,
      fileName,
      customDirectory,
      precisionMode,
    });
    sendJson(res, 200, result);
  } catch (err) {
    console.error('Error Vercel /api/parse-dasar-pdf:', err);
    sendJson(res, 500, { error: mapGeminiErrorToFriendlyMessage(err) });
  }
}
