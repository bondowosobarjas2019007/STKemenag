export function generateOwnerAppsScriptCode(ownerEmail: string): string {
  return `// =========================================================================
// SiTugas Kemenag Jember — Jembatan Spreadsheet Pemilik (${ownerEmail})
// Cara Pasang:
// 1. Buka Google Spreadsheet Anda -> menu Ekstensi -> Apps Script
// 2. Hapus kode lama, tempel seluruh kode ini, lalu tekan Simpan (Ctrl+S)
// 3. Klik Terapkan -> Deployment baru -> Jenis: Aplikasi Web (Web App)
//    - Jalankan sebagai (Execute as): Saya (${ownerEmail})
//    - Yang memiliki akses (Who has access): Siapa saja (Anyone)
// 4. Salin URL Aplikasi Web (/exec) lalu tempel di menu Tracking Sheets
//    (dan simpan di Environment Variable APPS_SCRIPT_WEBHOOK_URL pada Vercel)
// =========================================================================

const HEADERS = [
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

function getOrCreateYearSheet_(ss, year) {
  let sheet = ss.getSheetByName(year);
  let createdNew = false;
  if (!sheet) {
    sheet = ss.insertSheet(year);
    createdNew = true;
  }
  const firstCell = sheet.getRange(1, 1).getValue();
  if (!firstCell) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange
      .setBackground('#0B5D3B')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return { sheet: sheet, createdNew: createdNew };
}

function getSheetsList_(ss) {
  return ss.getSheets().map(function (s, idx) {
    return {
      sheetId: s.getSheetId(),
      title: s.getName(),
      index: idx,
    };
  });
}

function doGet(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const params = (e && e.parameter) || {};
    const action = params.action || 'meta';
    const sheets = getSheetsList_(ss);

    if (action === 'list') {
      const year = String(params.year || new Date().getFullYear()).trim();
      const sheet = ss.getSheetByName(year);
      let rows = [];
      if (sheet && sheet.getLastRow() >= 2) {
        const numRows = sheet.getLastRow() - 1;
        const values = sheet
          .getRange(2, 1, numRows, HEADERS.length)
          .getValues();
        const tz = Session.getScriptTimeZone();
        rows = values.map(function (row, i) {
          return {
            rowNumber: i + 2,
            values: row.map(function (v) {
              if (v instanceof Date) {
                return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
              }
              return String(v === null || v === undefined ? '' : v);
            }),
          };
        });
      }
      return jsonOut_({
        ok: true,
        spreadsheetId: ss.getId(),
        title: ss.getName(),
        spreadsheetUrl: ss.getUrl(),
        sheets: sheets,
        rows: rows,
      });
    }

    return jsonOut_({
      ok: true,
      spreadsheetId: ss.getId(),
      title: ss.getName(),
      spreadsheetUrl: ss.getUrl(),
      sheets: sheets,
    });
  } catch (err) {
    return jsonOut_({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    const body = JSON.parse(raw);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = body.action || 'upsert';
    const year = String(body.year || new Date().getFullYear()).trim();

    if (action === 'ensureYear') {
      const ensured = getOrCreateYearSheet_(ss, year);
      return jsonOut_({
        ok: true,
        createdNew: ensured.createdNew,
        spreadsheetId: ss.getId(),
        title: ss.getName(),
        spreadsheetUrl: ss.getUrl(),
        sheets: getSheetsList_(ss),
      });
    }

    const rowValues = Array.isArray(body.rowValues) ? body.rowValues : [];
    const suratId = String(body.suratId || '').trim();
    const overwriteConfirmed = Boolean(body.overwriteConfirmed);

    if (!suratId || rowValues.length === 0) {
      return jsonOut_({ ok: false, error: 'Data Surat Tugas tidak lengkap.' });
    }

    const res = getOrCreateYearSheet_(ss, year);
    const sheet = res.sheet;
    const lastRow = sheet.getLastRow();
    let existingRowNumber = null;

    if (lastRow >= 2) {
      const idValues = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
      for (let i = 0; i < idValues.length; i++) {
        if (String(idValues[i][0]).trim() === suratId) {
          existingRowNumber = i + 2;
          break;
        }
      }
    }

    if (existingRowNumber !== null && !overwriteConfirmed) {
      return jsonOut_({
        ok: true,
        needsOverwriteConfirm: true,
        existingRowNumber: existingRowNumber,
        createdNew: res.createdNew,
      });
    }

    if (existingRowNumber !== null) {
      rowValues[0] = existingRowNumber - 1;
      sheet
        .getRange(existingRowNumber, 1, 1, HEADERS.length)
        .setValues([rowValues]);
    } else {
      const nextNo = lastRow >= 2 ? lastRow : 1;
      rowValues[0] = nextNo;
      sheet.appendRow(rowValues);
    }

    return jsonOut_({
      ok: true,
      savedRowNumber: existingRowNumber || sheet.getLastRow(),
      createdNew: res.createdNew,
      updatedExisting: existingRowNumber !== null,
      spreadsheetId: ss.getId(),
      title: ss.getName(),
      spreadsheetUrl: ss.getUrl(),
      sheets: getSheetsList_(ss),
    });
  } catch (err) {
    return jsonOut_({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  } finally {
    lock.releaseLock();
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
`;
}
