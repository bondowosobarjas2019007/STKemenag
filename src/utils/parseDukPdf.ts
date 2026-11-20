import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Pegawai } from '../types/surat';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface ParseDukPdfResult {
  pegawaiList: Pegawai[];
  totalPages: number;
  satuanKerja: string;
  sumberFormat: 'sisdm-border' | 'tabel-teks';
}

interface TextToken {
  str: string;
  x: number;
  y: number;
  page: number;
}

interface ColumnBounds {
  noMaxX: number;
  namaMinX: number;
  namaMaxX: number;
  golMinX: number;
  golMaxX: number;
  jabMinX: number;
  jabMaxX: number;
}

interface RawRowAccumulator {
  no: number;
  namaItems: TextToken[];
  golItems: TextToken[];
  jabItems: TextToken[];
}

const DEFAULT_COLUMNS: ColumnBounds = {
  noMaxX: 35,
  namaMinX: 35,
  namaMaxX: 190,
  golMinX: 190,
  golMaxX: 245,
  jabMinX: 290,
  jabMaxX: 485,
};

const GOLONGAN_MAP: Record<string, string> = {
  'IV/E': 'Pembina Utama (IV/e)',
  'IV/D': 'Pembina Utama Madya (IV/d)',
  'IV/C': 'Pembina Utama Muda (IV/c)',
  'IV/B': 'Pembina Tk.I (IV/b)',
  'IV/A': 'Pembina (IV/a)',
  'III/D': 'Penata Tk.I (III/d)',
  'III/C': 'Penata (III/c)',
  'III/B': 'Penata Muda Tk.I (III/b)',
  'III/A': 'Penata Muda (III/a)',
  'II/D': 'Pengatur Tk.I (II/d)',
  'II/C': 'Pengatur (II/c)',
  'II/B': 'Pengatur Muda Tk.I (II/b)',
  'II/A': 'Pengatur Muda (II/a)',
  'I/D': 'Juru Tk.I (I/d)',
  'I/C': 'Juru (I/c)',
  'I/B': 'Juru Muda Tk.I (I/b)',
  'I/A': 'Juru Muda (I/a)',
  IX: '- (IX)',
  VII: '- (VII)',
  V: 'V',
  III: 'III',
  I: 'I',
  'LAIN-LAIN': 'PPPK Paruh Waktu',
};

export function mapDukGolongan(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const upper = cleaned.toUpperCase();
  if (/^LAIN\s*-\s*LAIN$/.test(upper)) {
    return 'PPPK Paruh Waktu';
  }
  if (GOLONGAN_MAP[upper]) {
    return GOLONGAN_MAP[upper];
  }
  // If already in full "Pangkat (Gol)" format
  if (/\([IVX]+\/[a-e]\)/i.test(cleaned)) {
    return cleaned;
  }
  return cleaned;
}

function mulMat(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function detectSatuanKerja(items: TextToken[]): string {
  const headerTop = items
    .filter((it) => it.y < 110)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (let i = 0; i < headerTop.length; i++) {
    const t = headerTop[i];
    if (/SATUAN\s+KERJA/i.test(t.str)) {
      const sameLine = headerTop
        .filter((other) => Math.abs(other.y - t.y) < 6 && other.x > t.x)
        .map((other) => other.str.replace(/^:\s*/, ''))
        .join(' ')
        .trim();
      if (sameLine) return sameLine;
    }
  }
  const kemenagLine = headerTop.find((it) =>
    /KANTOR\s+KEMENTERIAN\s+AGAMA/i.test(it.str)
  );
  return kemenagLine ? kemenagLine.str : '';
}

function detectColumnBounds(items: TextToken[]): ColumnBounds {
  // Look for standard SISDM column number row: 1, 2, 3, 4, 5 across same Y
  const numRowCandidates = items.filter(
    (it) => it.y < 220 && /^[1-6]$/.test(it.str)
  );
  for (const c1 of numRowCandidates) {
    if (c1.str !== '1') continue;
    const row = numRowCandidates
      .filter((other) => Math.abs(other.y - c1.y) < 4)
      .sort((a, b) => a.x - b.x);
    const col1 = row.find((r) => r.str === '1');
    const col2 = row.find((r) => r.str === '2');
    const col3 = row.find((r) => r.str === '3');
    const col4 = row.find((r) => r.str === '4');
    const col5 = row.find((r) => r.str === '5');
    const col6 = row.find((r) => r.str === '6');
    if (col1 && col2 && col3 && col4 && col5 && col6) {
      // Midpoints are roughly proportional to standard SISDM layout
      const noMaxX = Math.round((col1.x + col2.x * 0.25) * 10) / 10;
      const golMinX = Math.round(((col2.x + col3.x) / 2 + 25) * 10) / 10;
      const golMaxX = Math.round(((col3.x + col4.x) / 2 + 5) * 10) / 10;
      const jabMinX = Math.round(((col4.x + col5.x) / 2 - 34) * 10) / 10;
      const jabMaxX = Math.round(((col5.x + col6.x) / 2 + 40) * 10) / 10;
      if (
        noMaxX > 25 &&
        golMinX > noMaxX + 80 &&
        golMaxX > golMinX + 25 &&
        jabMinX > golMaxX + 15 &&
        jabMaxX > jabMinX + 80
      ) {
        // Keep exact SISDM calibration if within tolerance
        if (
          Math.abs(col1.x - 19.5) < 5 &&
          Math.abs(col2.x - 111.4) < 10 &&
          Math.abs(col3.x - 213) < 10 &&
          Math.abs(col5.x - 384.1) < 15
        ) {
          return DEFAULT_COLUMNS;
        }
        return {
          noMaxX,
          namaMinX: noMaxX,
          namaMaxX: golMinX,
          golMinX,
          golMaxX,
          jabMinX,
          jabMaxX,
        };
      }
    }
  }
  return DEFAULT_COLUMNS;
}

function finalizeRow(raw: RawRowAccumulator, index: number): Pegawai | null {
  const byDocOrder = (a: TextToken, b: TextToken) =>
    a.page - b.page || a.y - b.y || a.x - b.x;
  const sortedNama = [...raw.namaItems].sort(byDocOrder);
  const sortedGol = [...raw.golItems].sort(byDocOrder);
  const sortedJab = [...raw.jabItems].sort(byDocOrder);

  let nip = '';
  const namaLines: string[] = [];

  for (const it of sortedNama) {
    if (/^\d{18}$/.test(it.str)) {
      nip = it.str;
    } else if (/^(\d{9}|PW\d+|-\s*)\s*\/?$/i.test(it.str) || it.str === '/') {
      continue;
    } else if (!nip) {
      namaLines.push(it.str);
    }
  }

  // Fallback if NIP was joined with slash or text in one token
  if (!nip) {
    const joinedAll = sortedNama.map((x) => x.str).join(' ');
    const nipMatch = joinedAll.match(/\b(\d{18})\b/);
    if (nipMatch) {
      nip = nipMatch[1];
    }
  }

  const nama = namaLines.join(' ').replace(/\s+/g, ' ').trim();
  const golRaw = sortedGol.map((x) => x.str).join(' ').trim();
  const pangkatGolongan = mapDukGolongan(golRaw);
  const jabatan = sortedJab
    .map((x) => x.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!nama && !nip) return null;

  return {
    id: nip ? `duk-${raw.no || index + 1}-${nip}` : `duk-${index + 1}`,
    nama: nama || 'Tanpa Nama',
    nip,
    pangkatGolongan,
    jabatan,
  };
}

function deduplicatePegawai(list: Pegawai[]): Pegawai[] {
  const seenNips = new Set<string>();
  const result: Pegawai[] = [];
  for (const item of list) {
    const nipKey = item.nip.trim();
    if (nipKey) {
      if (seenNips.has(nipKey)) continue;
      seenNips.add(nipKey);
    }
    result.push(item);
  }
  return result;
}

/**
 * Fallback parser for borderless or spreadsheet-exported DUK PDFs where
 * SISDM vector cell borders are not present in operatorList.
 */
function parseBorderlessPages(
  pageItemsList: TextToken[][],
  cols: ColumnBounds
): Pegawai[] {
  const rows: RawRowAccumulator[] = [];

  for (const items of pageItemsList) {
    const anchors = items
      .filter((it) => it.x < cols.noMaxX && /^\d{1,5}$/.test(it.str))
      .sort((a, b) => a.y - b.y);

    // Filter out sub-header column number "1" when it sits next to "2" and "3"
    const cleanAnchors = anchors.filter((a) => {
      if (a.str !== '1') return true;
      const hasCol2 = items.some(
        (it) =>
          Math.abs(it.y - a.y) < 4 &&
          it.x >= cols.namaMinX &&
          it.x < cols.namaMaxX &&
          it.str === '2'
      );
      return !hasCol2;
    });

    if (cleanAnchors.length === 0) continue;

    // Determine vertical midpoint boundaries between consecutive NO anchors
    for (const item of items) {
      if (item.x < cols.noMaxX) continue;
      // Ignore header labels
      if (
        item.y < 140 &&
        /^(NAMA|PANGKAT|GOL\/|RUANG|JABATAN|KEMENTERIAN AGAMA|DAFTAR URUT|SATUAN KERJA)/i.test(
          item.str
        )
      ) {
        continue;
      }

      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < cleanAnchors.length; i++) {
        const d = Math.abs(item.y - cleanAnchors[i].y);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }

      if (bestDist > 60) continue;

      const anchor = cleanAnchors[bestIdx];
      let targetRow = rows.find((r) => r.no === Number(anchor.str));
      if (!targetRow) {
        targetRow = {
          no: Number(anchor.str),
          namaItems: [],
          golItems: [],
          jabItems: [],
        };
        rows.push(targetRow);
      }

      if (item.x >= cols.namaMinX && item.x < cols.namaMaxX) {
        targetRow.namaItems.push(item);
      } else if (item.x >= cols.golMinX && item.x < cols.golMaxX) {
        targetRow.golItems.push(item);
      } else if (item.x >= cols.jabMinX && item.x < cols.jabMaxX) {
        targetRow.jabItems.push(item);
      }
    }
  }

  const parsed = rows
    .map((r, i) => finalizeRow(r, i))
    .filter((p): p is Pegawai => Boolean(p && p.nip));
  return deduplicatePegawai(parsed);
}

export async function parseDukPdfBuffer(
  buffer: ArrayBuffer | Uint8Array,
  onProgress?: (donePages: number, totalPages: number) => void
): Promise<ParseDukPdfResult> {
  const data =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const loadingTask = pdfjsLib.getDocument({
    data,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;

  const totalPages = doc.numPages;
  let satuanKerja = '';
  let cols: ColumnBounds = DEFAULT_COLUMNS;
  const rows: RawRowAccumulator[] = [];
  const allPageItems: TextToken[][] = [];
  let totalBorderBoxes = 0;

  for (let pNum = 1; pNum <= totalPages; pNum++) {
    const page = await doc.getPage(pNum);
    const vp = page.getViewport({ scale: 1 });
    const [tc, ops] = await Promise.all([
      page.getTextContent(),
      page.getOperatorList(),
    ]);

    const items: TextToken[] = (tc.items as Array<{ str?: string; transform?: number[] }>)
      .map((it) => ({
        str: (it.str || '').trim(),
        x: Array.isArray(it.transform) ? it.transform[4] : 0,
        y: Array.isArray(it.transform) ? vp.height - it.transform[5] : 0,
        page: pNum,
      }))
      .filter((it) => it.str.length > 0);

    allPageItems.push(items);

    if (pNum === 1) {
      satuanKerja = detectSatuanKerja(items);
      cols = detectColumnBounds(items);
    }

    // Extract vertical cell borders along the left edge of the table (column NO)
    const stack: number[][] = [[1, 0, 0, 1, 0, 0]];
    const vCol0: Array<{ yTop: number; yBot: number }> = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === pdfjsLib.OPS.save) {
        stack.push([...stack[stack.length - 1]]);
      } else if (fn === pdfjsLib.OPS.restore && stack.length > 1) {
        stack.pop();
      } else if (fn === pdfjsLib.OPS.transform && Array.isArray(args)) {
        stack[stack.length - 1] = mulMat(stack[stack.length - 1], args);
      } else if (fn === pdfjsLib.OPS.constructPath && Array.isArray(args)) {
        const bbox = args[2] as number[] | Float32Array | undefined;
        if (!bbox || bbox.length < 4) continue;
        const m = stack[stack.length - 1];
        const [bx1, by1, bx2, by2] = bbox;
        const px1 = m[0] * bx1 + m[2] * by1 + m[4];
        const py1 = m[1] * bx1 + m[3] * by1 + m[5];
        const px2 = m[0] * bx2 + m[2] * by2 + m[4];
        const py2 = m[1] * bx2 + m[3] * by2 + m[5];
        const vx1 = Math.min(px1, px2);
        const vx2 = Math.max(px1, px2);
        const vyTop = vp.height - Math.max(py1, py2);
        const vyBot = vp.height - Math.min(py1, py2);
        const vw = vx2 - vx1;
        const vh = vyBot - vyTop;
        if (vx1 < 20 && vw < 3 && vh > 3 && vh < 220) {
          vCol0.push({ yTop: vyTop, yBot: vyBot });
        }
      }
    }

    vCol0.sort((a, b) => a.yTop - b.yTop);
    const cellIntervals: Array<{ yTop: number; yBot: number }> = [];
    for (const c of vCol0) {
      const last = cellIntervals[cellIntervals.length - 1];
      if (
        !last ||
        Math.abs(c.yTop - last.yTop) > 2 ||
        Math.abs(c.yBot - last.yBot) > 2
      ) {
        cellIntervals.push({ yTop: c.yTop, yBot: c.yBot });
      }
    }

    totalBorderBoxes += cellIntervals.length;

    for (const box of cellIntervals) {
      const boxItems = items.filter(
        (it) => it.y >= box.yTop - 2 && it.y <= box.yBot + 2
      );
      if (boxItems.length === 0) continue;

      const hasHeaderWords =
        boxItems.some((it) => it.x < cols.noMaxX && it.str === 'NO') &&
        boxItems.some(
          (it) => it.x >= cols.namaMinX && it.x < cols.namaMaxX && it.str === 'NAMA'
        );
      if (hasHeaderWords) continue;

      const noItems = boxItems.filter(
        (it) => it.x < cols.noMaxX && /^\d{1,5}$/.test(it.str)
      );
      const colNama = boxItems
        .filter((it) => it.x >= cols.namaMinX && it.x < cols.namaMaxX)
        .sort((a, b) => a.y - b.y || a.x - b.x);
      const colGol = boxItems
        .filter((it) => it.x >= cols.golMinX && it.x < cols.golMaxX)
        .sort((a, b) => a.y - b.y || a.x - b.x);
      const colJab = boxItems
        .filter((it) => it.x >= cols.jabMinX && it.x < cols.jabMaxX)
        .sort((a, b) => a.y - b.y || a.x - b.x);

      // Skip column number row (1 | 2 | 3 | 4 | 5 ...)
      if (
        noItems.length === 1 &&
        noItems[0].str === '1' &&
        colNama.length === 1 &&
        colNama[0].str === '2' &&
        colGol.length === 1 &&
        colGol[0].str === '3'
      ) {
        continue;
      }

      if (noItems.length === 1) {
        rows.push({
          no: Number(noItems[0].str),
          namaItems: colNama,
          golItems: colGol,
          jabItems: colJab,
        });
      } else if (
        noItems.length === 0 &&
        rows.length > 0 &&
        (colNama.length > 0 || colGol.length > 0 || colJab.length > 0)
      ) {
        // Page-break wrapped bottom half of the last row from the previous page
        const prev = rows[rows.length - 1];
        prev.namaItems.push(...colNama);
        prev.golItems.push(...colGol);
        prev.jabItems.push(...colJab);
      }
    }

    if (onProgress) {
      onProgress(pNum, totalPages);
    }
    if (pNum % 10 === 0 && typeof window !== 'undefined') {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  let pegawaiList: Pegawai[] = [];
  let sumberFormat: 'sisdm-border' | 'tabel-teks' = 'sisdm-border';

  if (totalBorderBoxes > 0 && rows.length > 0) {
    pegawaiList = deduplicatePegawai(
      rows
        .map((r, i) => finalizeRow(r, i))
        .filter((p): p is Pegawai => Boolean(p))
    );
  } else {
    sumberFormat = 'tabel-teks';
    pegawaiList = parseBorderlessPages(allPageItems, cols);
  }

  try {
    await loadingTask.destroy();
  } catch {
    // ignore cleanup errors
  }

  return {
    pegawaiList,
    totalPages,
    satuanKerja,
    sumberFormat,
  };
}
