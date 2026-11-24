export const OWNER_GOOGLE_EMAIL = 'bondowosobarjas2019.007@gmail.com';

const APPS_SCRIPT_URL_PATTERN =
  /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/;

export function isValidAppsScriptUrl(url: string): boolean {
  return APPS_SCRIPT_URL_PATTERN.test(url.trim());
}

export function resolveWebhookUrl(overrideHeaderUrl?: string): string {
  const headerUrl = (overrideHeaderUrl || '').trim();
  if (headerUrl && isValidAppsScriptUrl(headerUrl)) {
    return headerUrl;
  }
  const envUrl = (process.env.APPS_SCRIPT_WEBHOOK_URL || '').trim();
  if (envUrl && isValidAppsScriptUrl(envUrl)) {
    return envUrl;
  }
  return '';
}

export interface RelayGetParams {
  action: 'status' | 'meta' | 'list';
  year?: string;
  overrideWebhookUrl?: string;
}

export async function handleRelayGet(params: RelayGetParams) {
  const envUrl = (process.env.APPS_SCRIPT_WEBHOOK_URL || '').trim();
  const serverConfigured = Boolean(envUrl && isValidAppsScriptUrl(envUrl));
  const webhookUrl = resolveWebhookUrl(params.overrideWebhookUrl);
  const envSpreadsheetUrl = (process.env.OWNER_SPREADSHEET_URL || '').trim();

  if (params.action === 'status') {
    return {
      status: 200,
      body: {
        ok: true,
        bridgeConfigured: Boolean(webhookUrl),
        serverConfigured,
        ownerEmail: OWNER_GOOGLE_EMAIL,
        spreadsheetUrl: envSpreadsheetUrl || undefined,
      },
    };
  }

  if (!webhookUrl) {
    return {
      status: 503,
      body: {
        ok: false,
        bridgeConfigured: false,
        ownerEmail: OWNER_GOOGLE_EMAIL,
        error:
          'Jembatan Spreadsheet Pemilik (APPS_SCRIPT_WEBHOOK_URL) belum dikonfigurasi oleh pemilik.',
      },
    };
  }

  const target = new URL(webhookUrl);
  target.searchParams.set('action', params.action);
  if (params.year) {
    target.searchParams.set('year', params.year);
  }

  const response = await fetch(target.toString(), {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });

  const text = await response.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      status: 502,
      body: {
        ok: false,
        error:
          'Respons Apps Script bukan JSON valid. Pastikan Web App di-deploy dengan akses "Siapa saja (Anyone)".',
      },
    };
  }

  if (!response.ok || parsed.ok === false) {
    return {
      status: 502,
      body: {
        ok: false,
        error:
          typeof parsed.error === 'string'
            ? parsed.error
            : `Gagal membaca spreadsheet pemilik (${response.status}).`,
      },
    };
  }

  return {
    status: 200,
    body: {
      ...parsed,
      bridgeConfigured: true,
      ownerEmail: OWNER_GOOGLE_EMAIL,
    },
  };
}

export interface RelayPostPayload {
  action?: 'upsert' | 'ensureYear';
  year?: string;
  suratId?: string;
  recordType?: 'ST' | 'SPD';
  spdId?: string;
  rowValues?: (string | number)[];
  overwriteConfirmed?: boolean;
}

export async function handleRelayPost(
  payload: RelayPostPayload,
  overrideWebhookUrl?: string
) {
  const webhookUrl = resolveWebhookUrl(overrideWebhookUrl);
  if (!webhookUrl) {
    return {
      status: 503,
      body: {
        ok: false,
        bridgeConfigured: false,
        ownerEmail: OWNER_GOOGLE_EMAIL,
        error:
          'Jembatan Spreadsheet Pemilik (APPS_SCRIPT_WEBHOOK_URL) belum aktif. Pemilik perlu mengaktifkannya di menu Tracking Sheets.',
      },
    };
  }

  const action = payload.action === 'ensureYear' ? 'ensureYear' : 'upsert';
  const year = String(payload.year || new Date().getFullYear()).trim();

  if (!/^\d{4}$/.test(year)) {
    return {
      status: 400,
      body: { ok: false, error: 'Tahun sheet harus 4 digit angka (contoh: 2026).' },
    };
  }

  const effectiveId = payload.spdId || payload.suratId;
  if (action === 'upsert') {
    if (
      !effectiveId ||
      !Array.isArray(payload.rowValues) ||
      payload.rowValues.length === 0
    ) {
      return {
        status: 400,
        body: { ok: false, error: 'Data tidak lengkap untuk disimpan ke Google Sheets.' },
      };
    }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action,
      year,
      suratId: effectiveId,
      recordType: payload.recordType || 'ST',
      spdId: payload.spdId || (payload.recordType === 'SPD' ? effectiveId : undefined),
      rowValues: payload.rowValues,
      overwriteConfirmed:
        action === 'upsert' ? payload.overwriteConfirmed !== false : Boolean(payload.overwriteConfirmed),
    }),
    signal: AbortSignal.timeout(25000),
  });

  const text = await response.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      status: 502,
      body: {
        ok: false,
        error:
          'Respons Apps Script saat menyimpan tidak valid. Pastikan Web App di-deploy dengan "Execute as: Me" dan "Who has access: Anyone".',
      },
    };
  }

  if (!response.ok || parsed.ok === false) {
    return {
      status: 502,
      body: {
        ok: false,
        error:
          typeof parsed.error === 'string'
            ? parsed.error
            : `Gagal menyimpan ke spreadsheet pemilik (${response.status}).`,
      },
    };
  }

  return {
    status: 200,
    body: {
      ...parsed,
      bridgeConfigured: true,
      ownerEmail: OWNER_GOOGLE_EMAIL,
    },
  };
}
