import { KriteriaKeberangkatan, SuratTugasData } from '../types/surat';

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
          locale: 'id_ID',
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
    JSON.stringify(surat),
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
