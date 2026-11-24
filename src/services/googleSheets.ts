import { KriteriaKeberangkatan, SuratTugasData } from '../types/surat';
import { ADMIN_EMAIL, isAdminEmail } from './googleAuth';

export const OWNER_GOOGLE_EMAIL = ADMIN_EMAIL;

export function isOwnerAccount(email?: string | null): boolean {
  return isAdminEmail(email);
}

export const TRACKING_SPREADSHEET_TITLE =
  'Database Tracking Surat Tugas - Kemenag Jember';

export const SHEET_HEADERS = [
  'No',
  'ID Surat',
  'Waktu Input',
  'Nomor Surat',
  'Tanggal Surat',
  'Kriteria',
  'Dasar Asal',
  'Nomor Dasar',
  'Tanggal Dasar',
  'Nama Kegiatan',
  'Lokasi Tujuan',
  'Tanggal Mulai',
  'Tanggal Selesai',
  'Jumlah Pegawai',
  'Daftar Pegawai (Nama & NIP)',
  'Penandatangan',
  'Data JSON',
];

export interface SheetTabInfo {
  sheetId: number;
  title: string;
  index: number;
}

export interface TrackedSuratRow {
  rowNumber: number; // 1-based row index in sheet
  idSurat: string;
  waktuInput: string;
  nomorSurat: string;
  tanggalSurat: string;
  kriteria: string;
  dasarAsal: string;
  dasarNomor: string;
  dasarTanggal: string;
  namaKegiatan: string;
  lokasiTujuan: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  jumlahPegawai: number;
  daftarPegawaiRingkas: string;
  penandatangan: string;
  rawDraft?: SuratTugasData;
}

export interface SpreadsheetSummary {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheets: SheetTabInfo[];
}

export class SheetsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetsAuthError';
  }
}

const KRITERIA_TEXT: Record<KriteriaKeberangkatan, string> = {
  sendiri: 'Sendiri (1 Orang)',
  tiga_orang: '2-3 Orang',
  terlampir: '> 3 Orang (Terlampir)',
};

async function googleFetch(url: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (res.status === 401) {
    throw new SheetsAuthError(
      'Sesi akses Google berakhir. Silakan masuk ulang dengan akun Google.'
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message || `Permintaan Google API gagal (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  return trimmed;
}

export function getTargetYearForSurat(surat: SuratTugasData): string {
  const candidate = surat.tanggalMulai || surat.tanggalNaskah || '';
  const match = candidate.match(/^(\d{4})/);
  if (match?.[1]) return match[1];
  return String(new Date().getFullYear());
}

export function getValidSheetLocale(): string {
  const lang =
    typeof navigator !== 'undefined'
      ? (navigator.language || 'id').toLowerCase()
      : 'id';

  if (lang.startsWith('id')) {
    return 'id';
  }
  if (lang.startsWith('en')) {
    return 'en';
  }
  return 'id';
}

function normalizeFingerprintPart(val?: string | null): string {
  return (val || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function generateSuratFingerprint(surat: SuratTugasData): string {
  const dasar = [
    normalizeFingerprintPart(surat.dasarAsal),
    normalizeFingerprintPart(surat.dasarNomor),
    normalizeFingerprintPart(surat.dasarTanggal),
  ].join('|');

  const kegiatan = normalizeFingerprintPart(surat.namaKegiatan);

  const nipList = surat.pegawaiList
    .map(
      (p) =>
        normalizeFingerprintPart(p.nip) || normalizeFingerprintPart(p.nama)
    )
    .filter(Boolean)
    .sort();

  const tanggalPelaksanaan = [
    normalizeFingerprintPart(surat.tanggalMulai),
    normalizeFingerprintPart(surat.tanggalSelesai),
  ].join('|');

  return `${dasar}||${kegiatan}||${nipList.join(',')}||${tanggalPelaksanaan}`;
}

export function getTrackedRowFingerprint(row: TrackedSuratRow): string {
  if (row.rawDraft) {
    return generateSuratFingerprint(row.rawDraft);
  }
  const dasar = [
    normalizeFingerprintPart(row.dasarAsal),
    normalizeFingerprintPart(row.dasarNomor),
    normalizeFingerprintPart(row.dasarTanggal),
  ].join('|');
  const kegiatan = normalizeFingerprintPart(row.namaKegiatan);
  const nipMatches = Array.from(
    (row.daftarPegawaiRingkas || '').matchAll(/\(([^)]+)\)/g)
  )
    .map((m) => normalizeFingerprintPart(m[1]))
    .filter(Boolean)
    .sort();
  const tanggalPelaksanaan = [
    normalizeFingerprintPart(row.tanggalMulai),
    normalizeFingerprintPart(row.tanggalSelesai),
  ].join('|');
  return `${dasar}||${kegiatan}||${nipMatches.join(',')}||${tanggalPelaksanaan}`;
}

export interface DuplicateSuratMatch {
  row: TrackedSuratRow;
  matchedBy: 'id' | 'fingerprint' | 'both';
}

export function findDuplicateTrackedRow(
  surat: SuratTugasData,
  rows: TrackedSuratRow[]
): DuplicateSuratMatch | null {
  const targetId = (surat.id || '').trim();
  const targetFp = generateSuratFingerprint(surat);

  for (const row of rows) {
    const idMatch = Boolean(targetId && row.idSurat.trim() === targetId);
    const fpMatch = getTrackedRowFingerprint(row) === targetFp;
    if (idMatch || fpMatch) {
      return {
        row,
        matchedBy: idMatch && fpMatch ? 'both' : idMatch ? 'id' : 'fingerprint',
      };
    }
  }
  return null;
}

export async function findOrCreateTrackingSpreadsheet(
  accessToken: string,
  initialYear: string
): Promise<SpreadsheetSummary> {
  // Search Drive for existing app-created spreadsheet first
  const query = encodeURIComponent(
    `name='${TRACKING_SPREADSHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  );
  const searchRes = await googleFetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)&orderBy=modifiedTime desc&pageSize=5`,
    accessToken
  );

  const existing = searchRes?.files?.[0];
  if (existing?.id) {
    return getSpreadsheetMetadata(existing.id, accessToken);
  }

  // Create new spreadsheet with the initial year sheet tab
  const created = await googleFetch(
    'https://sheets.googleapis.com/v4/spreadsheets',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          title: TRACKING_SPREADSHEET_TITLE,
          locale: getValidSheetLocale(),
        },
        sheets: [
          {
            properties: {
              title: initialYear,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        ],
      }),
    }
  );

  const spreadsheetId = created.spreadsheetId as string;
  const sheetId = created.sheets?.[0]?.properties?.sheetId ?? 0;

  await writeHeaderAndStyle(spreadsheetId, initialYear, sheetId, accessToken);

  return {
    spreadsheetId,
    title: created.properties?.title || TRACKING_SPREADSHEET_TITLE,
    spreadsheetUrl:
      created.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sheets: [
      {
        sheetId,
        title: initialYear,
        index: 0,
      },
    ],
  };
}

export async function getSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetSummary> {
  const data = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title,index)`,
    accessToken
  );

  const sheets: SheetTabInfo[] = (data.sheets || []).map((s: any) => ({
    sheetId: s.properties?.sheetId ?? 0,
    title: s.properties?.title || 'Sheet1',
    index: s.properties?.index ?? 0,
  }));

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || TRACKING_SPREADSHEET_TITLE,
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    sheets,
  };
}

async function writeHeaderAndStyle(
  spreadsheetId: string,
  sheetTitle: string,
  sheetId: number,
  accessToken: string
) {
  const escapedTitle = `'${sheetTitle.replace(/'/g, "''")}'`;
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${escapedTitle}!A1:Q1`)}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [SHEET_HEADERS],
      }),
    }
  );

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: SHEET_HEADERS.length,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.043, green: 0.365, blue: 0.231 },
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                    bold: true,
                  },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: { frozenRowCount: 1 },
              },
              fields: 'gridProperties.frozenRowCount',
            },
          },
        ],
      }),
    }
  );
}

export async function ensureYearSheet(
  spreadsheetId: string,
  year: string,
  accessToken: string
): Promise<{ createdNew: boolean; summary: SpreadsheetSummary }> {
  const summary = await getSpreadsheetMetadata(spreadsheetId, accessToken);
  const existingTab = summary.sheets.find((s) => s.title === year);

  if (existingTab) {
    // Verify header exists in row 1 if sheet was empty
    const escaped = `'${year.replace(/'/g, "''")}'`;
    const headRes = await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(`${escaped}!A1:B1`)}`,
      accessToken
    );
    if (!headRes.values || headRes.values.length === 0) {
      await writeHeaderAndStyle(spreadsheetId, year, existingTab.sheetId, accessToken);
    }
    return { createdNew: false, summary };
  }

  // Create new tab for the requested year (e.g. 2026, 2027)
  const batchRes = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: year,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
        ],
      }),
    }
  );

  const newSheetId =
    batchRes?.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;

  await writeHeaderAndStyle(spreadsheetId, year, newSheetId, accessToken);
  const updatedSummary = await getSpreadsheetMetadata(spreadsheetId, accessToken);
  return { createdNew: true, summary: updatedSummary };
}

export async function fetchRowsForSheet(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<TrackedSuratRow[]> {
  const escaped = `'${sheetTitle.replace(/'/g, "''")}'`;
  const data = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${escaped}!A2:Q`)}`,
    accessToken
  );

  const values: string[][] = Array.isArray(data.values) ? data.values : [];
  return values
    .map((row, idx) => {
      let rawDraft: SuratTugasData | undefined;
      if (row[16]) {
        try {
          rawDraft = JSON.parse(row[16]) as SuratTugasData;
        } catch {
          rawDraft = undefined;
        }
      }
      return {
        rowNumber: idx + 2,
        idSurat: row[1] || '',
        waktuInput: row[2] || '',
        nomorSurat: row[3] || '',
        tanggalSurat: row[4] || '',
        kriteria: row[5] || '',
        dasarAsal: row[6] || '',
        dasarNomor: row[7] || '',
        dasarTanggal: row[8] || '',
        namaKegiatan: row[9] || '',
        lokasiTujuan: row[10] || '',
        tanggalMulai: row[11] || '',
        tanggalSelesai: row[12] || '',
        jumlahPegawai: Number(row[13]) || 0,
        daftarPegawaiRingkas: row[14] || '',
        penandatangan: row[15] || '',
        rawDraft,
      };
    })
    .filter((r) => r.idSurat || r.namaKegiatan || r.daftarPegawaiRingkas)
    .reverse();
}

function buildRowValues(
  rowNumberDisplay: number,
  surat: SuratTugasData
): (string | number)[] {
  const nowStr = new Date().toLocaleString('id-ID', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const validPegawai = surat.pegawaiList.filter(
    (p) => p.nama.trim() || p.nip.trim()
  );
  const pegawaiSummary = validPegawai
    .map((p, i) => `${i + 1}. ${p.nama || '-'}${p.nip ? ` (${p.nip})` : ''}`)
    .join('\n');

  const nomorTampil = surat.modeSrikandi
    ? '${nomor_naskah} (Srikandi)'
    : surat.nomorSurat || '-';

  const payloadDraft: SuratTugasData = {
    ...surat,
    statusSurat: surat.statusSurat || 'Tercatat / Final',
  };

  return [
    rowNumberDisplay,
    surat.id,
    nowStr,
    nomorTampil,
    surat.tanggalNaskah || '-',
    KRITERIA_TEXT[surat.kriteria],
    surat.dasarAsal || '-',
    surat.dasarNomor || '-',
    surat.dasarTanggal || '-',
    surat.namaKegiatan || '-',
    surat.lokasiTujuan || '-',
    surat.tanggalMulai || '-',
    surat.tanggalSelesai || '-',
    validPegawai.length,
    pegawaiSummary || '-',
    surat.namaPenandatangan || 'Kepala Kantor',
    JSON.stringify(payloadDraft),
  ];
}

export async function checkExistingRecordRow(
  spreadsheetId: string,
  year: string,
  suratId: string,
  accessToken: string
): Promise<{ existingRowNumber: number | null; nextRowNumberDisplay: number }> {
  const escaped = `'${year.replace(/'/g, "''")}'`;
  const data = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${escaped}!A2:B`)}`,
    accessToken
  );

  const values: string[][] = Array.isArray(data.values) ? data.values : [];
  const foundIdx = values.findIndex((r) => r[1] === suratId);
  return {
    existingRowNumber: foundIdx !== -1 ? foundIdx + 2 : null,
    nextRowNumberDisplay: values.length + 1,
  };
}

export async function appendSuratToYearSheet(
  spreadsheetId: string,
  year: string,
  nextRowNumberDisplay: number,
  surat: SuratTugasData,
  accessToken: string
): Promise<void> {
  const escaped = `'${year.replace(/'/g, "''")}'`;
  const rowValues = buildRowValues(nextRowNumberDisplay, surat);

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${escaped}!A:Q`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );
}

export async function updateExistingSuratRow(
  spreadsheetId: string,
  year: string,
  rowNumber: number,
  surat: SuratTugasData,
  accessToken: string
): Promise<void> {
  const escaped = `'${year.replace(/'/g, "''")}'`;
  const rowValues = buildRowValues(rowNumber - 1, surat);

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${escaped}!A${rowNumber}:Q${rowNumber}`)}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );
}

/**
 * Mengunci Google Spreadsheet agar:
 * 1. Link dapat diakses orang lain sebagai VIEWER (Hanya Lihat), tidak dapat mengedit.
 * 2. Setiap tab sheet diproteksi (addProtectedRange) agar hanya akun pemilik
 *    (bondowosobarjas2019.007@gmail.com) dan skrip resmi aplikasi yang bisa mengubah isi sel.
 */
export async function setSpreadsheetViewOnlyAndProtected(
  spreadsheetId: string,
  accessToken: string
): Promise<{
  protectedTabsCount: number;
  anyoneViewerSet: boolean;
}> {
  // 1. Check existing Drive permissions
  const permsRes = await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      spreadsheetId
    )}/permissions?fields=permissions(id,type,role,emailAddress)`,
    accessToken
  );

  const permissions: Array<{
    id: string;
    type: string;
    role: string;
    emailAddress?: string;
  }> = Array.isArray(permsRes?.permissions) ? permsRes.permissions : [];

  let anyoneViewerSet = false;
  const anyonePerm = permissions.find((p) => p.type === 'anyone');

  if (anyonePerm) {
    if (anyonePerm.role !== 'reader') {
      await googleFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          spreadsheetId
        )}/permissions/${encodeURIComponent(anyonePerm.id)}`,
        accessToken,
        {
          method: 'PATCH',
          body: JSON.stringify({ role: 'reader' }),
        }
      );
    }
    anyoneViewerSet = true;
  } else {
    await googleFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        spreadsheetId
      )}/permissions`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
        }),
      }
    );
    anyoneViewerSet = true;
  }

  // Downgrade any non-owner writer permissions to reader
  for (const perm of permissions) {
    if (
      perm.type === 'user' &&
      perm.role !== 'owner' &&
      perm.role !== 'reader' &&
      perm.emailAddress?.toLowerCase() !== OWNER_GOOGLE_EMAIL.toLowerCase()
    ) {
      await googleFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          spreadsheetId
        )}/permissions/${encodeURIComponent(perm.id)}`,
        accessToken,
        {
          method: 'PATCH',
          body: JSON.stringify({ role: 'reader' }),
        }
      );
    }
  }

  // 2. Protect sheet tabs inside Google Sheets against manual edits by non-owners
  const meta = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=sheets(properties(sheetId,title),protectedRanges(protectedRangeId,range))`,
    accessToken
  );

  const requests: Record<string, unknown>[] = [];
  for (const sheet of meta?.sheets || []) {
    const sheetId = sheet?.properties?.sheetId;
    if (typeof sheetId !== 'number') continue;
    const alreadyProtected = Array.isArray(sheet.protectedRanges)
      ? sheet.protectedRanges.some(
          (pr: any) =>
            pr?.range?.sheetId === sheetId &&
            pr?.range?.startRowIndex === undefined &&
            pr?.range?.startColumnIndex === undefined
        )
      : false;
    if (!alreadyProtected) {
      requests.push({
        addProtectedRange: {
          protectedRange: {
            range: { sheetId },
            description:
              'Terkunci: hanya dapat diubah melalui aplikasi SiTugas Kemenag Jember',
            warningOnly: false,
            editors: {
              users: [OWNER_GOOGLE_EMAIL],
            },
          },
        },
      });
    }
  }

  if (requests.length > 0) {
    await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ requests }),
      }
    );
  }

  return {
    protectedTabsCount: requests.length,
    anyoneViewerSet,
  };
}

// =========================================================================
// APPS SCRIPT SERVER RELAY CLIENT (for centralized owner spreadsheet access)
// =========================================================================

export interface BridgeStatusResponse {
  ok: boolean;
  bridgeConfigured: boolean;
  serverConfigured: boolean;
  ownerEmail: string;
  spreadsheetUrl?: string;
}

export interface BridgeUpsertResponse {
  ok: boolean;
  needsOverwriteConfirm?: boolean;
  existingRowNumber?: number;
  savedRowNumber?: number;
  createdNew?: boolean;
  updatedExisting?: boolean;
  spreadsheetId?: string;
  title?: string;
  spreadsheetUrl?: string;
  sheets?: SheetTabInfo[];
  error?: string;
}

function buildBridgeHeaders(customWebhookUrl?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (customWebhookUrl && customWebhookUrl.trim()) {
    headers['x-apps-script-url'] = customWebhookUrl.trim();
  }
  return headers;
}

export async function fetchSheetsBridgeStatus(
  customWebhookUrl?: string
): Promise<BridgeStatusResponse> {
  const res = await fetch('/api/sheets-tracking?action=status', {
    headers: buildBridgeHeaders(customWebhookUrl),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: Boolean(data?.ok),
    bridgeConfigured: Boolean(data?.bridgeConfigured),
    serverConfigured: Boolean(data?.serverConfigured),
    ownerEmail: data?.ownerEmail || OWNER_GOOGLE_EMAIL,
    spreadsheetUrl: data?.spreadsheetUrl,
  };
}

export async function fetchBridgeMetadata(
  customWebhookUrl?: string
): Promise<SpreadsheetSummary> {
  const res = await fetch('/api/sheets-tracking?action=meta', {
    headers: buildBridgeHeaders(customWebhookUrl),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(
      data?.error || 'Gagal membaca metadata spreadsheet pemilik.'
    );
  }
  return {
    spreadsheetId: data.spreadsheetId,
    title: data.title || TRACKING_SPREADSHEET_TITLE,
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    sheets: Array.isArray(data.sheets) ? data.sheets : [],
  };
}

export async function fetchBridgeYearRows(
  year: string,
  customWebhookUrl?: string
): Promise<{ summary: SpreadsheetSummary; rows: TrackedSuratRow[] }> {
  const res = await fetch(
    `/api/sheets-tracking?action=list&year=${encodeURIComponent(year)}`,
    {
      headers: buildBridgeHeaders(customWebhookUrl),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(
      data?.error || `Gagal memuat data sheet ${year} dari spreadsheet pemilik.`
    );
  }

  const rawRows: Array<{ rowNumber: number; values: string[] }> = Array.isArray(
    data.rows
  )
    ? data.rows
    : [];

  const rows: TrackedSuratRow[] = rawRows
    .map((entry) => {
      const row = entry.values || [];
      let rawDraft: SuratTugasData | undefined;
      if (row[16]) {
        try {
          rawDraft = JSON.parse(row[16]) as SuratTugasData;
        } catch {
          rawDraft = undefined;
        }
      }
      return {
        rowNumber: entry.rowNumber,
        idSurat: row[1] || '',
        waktuInput: row[2] || '',
        nomorSurat: row[3] || '',
        tanggalSurat: row[4] || '',
        kriteria: row[5] || '',
        dasarAsal: row[6] || '',
        dasarNomor: row[7] || '',
        dasarTanggal: row[8] || '',
        namaKegiatan: row[9] || '',
        lokasiTujuan: row[10] || '',
        tanggalMulai: row[11] || '',
        tanggalSelesai: row[12] || '',
        jumlahPegawai: Number(row[13]) || 0,
        daftarPegawaiRingkas: row[14] || '',
        penandatangan: row[15] || '',
        rawDraft,
      };
    })
    .filter((r) => r.idSurat || r.namaKegiatan || r.daftarPegawaiRingkas)
    .reverse();

  return {
    summary: {
      spreadsheetId: data.spreadsheetId,
      title: data.title || TRACKING_SPREADSHEET_TITLE,
      spreadsheetUrl:
        data.spreadsheetUrl ||
        `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
      sheets: Array.isArray(data.sheets) ? data.sheets : [],
    },
    rows,
  };
}

export async function ensureBridgeYearSheet(
  year: string,
  customWebhookUrl?: string
): Promise<{ createdNew: boolean; summary: SpreadsheetSummary }> {
  const res = await fetch('/api/sheets-tracking', {
    method: 'POST',
    headers: buildBridgeHeaders(customWebhookUrl),
    body: JSON.stringify({
      action: 'ensureYear',
      year,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(
      data?.error || `Gagal membuat sheet tahun ${year} di spreadsheet pemilik.`
    );
  }
  return {
    createdNew: Boolean(data.createdNew),
    summary: {
      spreadsheetId: data.spreadsheetId,
      title: data.title || TRACKING_SPREADSHEET_TITLE,
      spreadsheetUrl:
        data.spreadsheetUrl ||
        `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
      sheets: Array.isArray(data.sheets) ? data.sheets : [],
    },
  };
}

export async function upsertSuratViaBridge(
  year: string,
  surat: SuratTugasData,
  overwriteConfirmed: boolean,
  customWebhookUrl?: string
): Promise<BridgeUpsertResponse> {
  const normalizedSurat: SuratTugasData = {
    ...surat,
    statusSurat: surat.statusSurat || 'Tercatat / Final',
  };
  const rowValues = buildRowValues(1, normalizedSurat);
  let res: Response;
  try {
    res = await fetch('/api/sheets-tracking', {
      method: 'POST',
      headers: buildBridgeHeaders(customWebhookUrl),
      body: JSON.stringify({
        action: 'upsert',
        year,
        suratId: normalizedSurat.id,
        status: normalizedSurat.statusSurat,
        rowValues,
        overwriteConfirmed,
      }),
    });
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `Koneksi ke server Google Sheets terputus (${err.message}).`
        : 'Tidak dapat terhubung ke jaringan atau jembatan Google Sheets.'
    );
  }
  const data = (await res.json().catch(() => ({}))) as BridgeUpsertResponse;
  if (!res.ok || data.ok === false) {
    throw new Error(
      data?.error ||
        `Gagal menyimpan Surat Tugas ke Google Sheets (HTTP ${res.status}).`
    );
  }
  return data;
}
