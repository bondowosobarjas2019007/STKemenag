import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  extractDasarFromPdfBase64,
  mapGeminiErrorToFriendlyMessage,
  type DirectoryPegawaiInput,
} from './lib/parseDasarPdf.ts';
import {
  handleRelayGet,
  handleRelayPost,
  type RelayPostPayload,
} from './lib/sheetsRelay.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

async function createServer() {
  const app = express();
  app.use(
    ['/api/parse-dasar-pdf', '/api/ekstrak-dasar'],
    express.raw({
      type: ['application/pdf', 'application/octet-stream'],
      limit: '30mb',
    })
  );
  app.use(
    ['/api/parse-dasar-pdf', '/api/ekstrak-dasar'],
    express.text({ type: 'text/plain', limit: '30mb' })
  );
  app.use(express.json({ limit: '30mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'situgas-kemenag-jember',
      runtime: 'node',
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  const handleParseDasarPdf = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      let cleanBase64 = '';
      let fileName = 'dasar_surat.pdf';
      let customDirectory: DirectoryPegawaiInput[] = [];

      if (Buffer.isBuffer(req.body)) {
        if (req.body.length === 0) {
          res.status(400).json({ error: 'File PDF tidak valid atau kosong.' });
          return;
        }
        cleanBase64 = req.body.toString('base64');
        const rawHeaderName = req.header('x-file-name');
        if (rawHeaderName) {
          try {
            fileName = decodeURIComponent(rawHeaderName);
          } catch {
            fileName = rawHeaderName;
          }
        }
        const rawCustomDir = req.header('x-custom-directory');
        if (rawCustomDir) {
          try {
            const parsedCustom = JSON.parse(decodeURIComponent(rawCustomDir));
            if (Array.isArray(parsedCustom)) customDirectory = parsedCustom;
          } catch {
            customDirectory = [];
          }
        }
      } else {
        let parsedBody: Record<string, unknown> = {};
        if (typeof req.body === 'string') {
          try {
            parsedBody = JSON.parse(req.body) as Record<string, unknown>;
          } catch {
            res.status(400).json({ error: 'Format data permintaan tidak valid.' });
            return;
          }
        } else if (req.body && typeof req.body === 'object') {
          parsedBody = req.body as Record<string, unknown>;
        }
        const rawBase64 =
          typeof parsedBody.fileBase64 === 'string'
            ? parsedBody.fileBase64
            : typeof parsedBody.docB64 === 'string'
              ? parsedBody.docB64
              : '';
        if (!rawBase64) {
          res.status(400).json({ error: 'File PDF tidak valid atau kosong.' });
          return;
        }
        cleanBase64 = rawBase64
          .replace(/^data:application\/pdf;base64,/, '')
          .trim();
        if (typeof parsedBody.fileName === 'string' && parsedBody.fileName) {
          fileName = parsedBody.fileName;
        }
        if (Array.isArray(parsedBody.directory)) {
          customDirectory = parsedBody.directory as DirectoryPegawaiInput[];
        }
      }

      const result = await extractDasarFromPdfBase64(
        cleanBase64,
        fileName,
        customDirectory
      );
      res.json(result);
    } catch (err) {
      console.error('Error /api/parse-dasar-pdf:', err);
      res.status(500).json({ error: mapGeminiErrorToFriendlyMessage(err) });
    }
  };

  app.post('/api/parse-dasar-pdf', handleParseDasarPdf);
  app.post('/api/ekstrak-dasar', handleParseDasarPdf);

  app.get('/api/sheets-tracking', async (req, res) => {
    try {
      const rawAction = String(req.query.action || 'status');
      const action =
        rawAction === 'meta' || rawAction === 'list' ? rawAction : 'status';
      const year = req.query.year ? String(req.query.year) : undefined;
      const overrideUrl = req.header('x-apps-script-url');
      const result = await handleRelayGet({
        action,
        year,
        overrideWebhookUrl: overrideUrl,
      });
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('Error GET /api/sheets-tracking:', err);
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Gagal memproses permintaan jembatan Google Sheets.',
      });
    }
  });

  app.post('/api/sheets-tracking', async (req, res) => {
    try {
      const overrideUrl = req.header('x-apps-script-url');
      const payload = (req.body && typeof req.body === 'object'
        ? req.body
        : {}) as RelayPostPayload;
      const result = await handleRelayPost(payload, overrideUrl);
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('Error POST /api/sheets-tracking:', err);
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Gagal menyimpan data melalui jembatan Google Sheets.',
      });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
  });

  app.use(
    '/api',
    (
      err: { status?: number; type?: string; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (err?.type === 'entity.too.large' || err?.status === 413) {
        res.status(413).json({
          error:
            'Ukuran file PDF melebihi batas unggahan server (maksimal 25 MB). Silakan kompres PDF terlebih dahulu.',
        });
        return;
      }
      res.status(err?.status || 500).json({
        error: err?.message || 'Terjadi kesalahan pada server API.',
      });
    }
  );

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SiTugas Kemenag Jember server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer();
