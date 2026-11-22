import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export const VERCEL_COMPRESS_TRIGGER_BYTES = Math.floor(3.5 * 1024 * 1024);
export const TARGET_COMPRESSED_BYTES = Math.floor(3.2 * 1024 * 1024);
export const VERCEL_HARD_LIMIT_BYTES = Math.floor(4.3 * 1024 * 1024);

export interface OptimizeDasarPdfResult {
  pdfBytes: Uint8Array;
  originalBytes: number;
  finalBytes: number;
  selectedPages: number[];
  selectedCount: number;
  totalPages: number;
  trimmed: boolean;
  compressed: boolean;
  rasterized: boolean;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parsePageSelectionInput(input: string, totalPages: number): number[] {
  if (totalPages < 1) return [];
  const selected = new Set<number>();
  const tokens = input
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (rangeMatch) {
      let start = Number.parseInt(rangeMatch[1], 10);
      let end = Number.parseInt(rangeMatch[2], 10);
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      if (start > end) [start, end] = [end, start];
      start = Math.max(1, start);
      end = Math.min(totalPages, end);
      for (let p = start; p <= end; p++) {
        selected.add(p);
      }
      continue;
    }

    const singleMatch = token.match(/^(\d+)$/);
    if (singleMatch) {
      const pageNum = Number.parseInt(singleMatch[1], 10);
      if (pageNum >= 1 && pageNum <= totalPages) {
        selected.add(pageNum);
      }
    }
  }

  return Array.from(selected).sort((a, b) => a - b);
}

export function formatPageSelectionInput(pages: number[]): string {
  if (pages.length === 0) return '';
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(', ');
}

export async function inspectPdfPageCount(buffer: ArrayBuffer): Promise<number> {
  try {
    const pdfDoc = await PDFDocument.load(new Uint8Array(buffer), {
      ignoreEncryption: true,
    });
    const count = pdfDoc.getPageCount();
    if (count > 0) return count;
  } catch {
    // Fallback to pdfjs-dist when pdf-lib encounters unusual xref streams
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer.slice(0)),
  });
  try {
    const doc = await loadingTask.promise;
    return doc.numPages;
  } finally {
    await loadingTask.destroy();
  }
}

export interface RenderThumbnailsOptions {
  startPage?: number;
  endPage?: number;
  targetWidth?: number;
  quality?: number;
  signal?: AbortSignal;
  onThumbnail?: (pageNum: number, dataUrl: string) => void;
}

export async function renderPdfPageThumbnails(
  buffer: ArrayBuffer,
  options: RenderThumbnailsOptions = {}
): Promise<Record<number, string>> {
  const {
    startPage = 1,
    endPage,
    targetWidth = 260,
    quality = 0.72,
    signal,
    onThumbnail,
  } = options;

  const result: Record<number, string> = {};
  if (signal?.aborted) return result;

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer.slice(0)),
  });

  try {
    const pdfJsDoc = await loadingTask.promise;
    const first = Math.max(1, startPage);
    const last = Math.min(pdfJsDoc.numPages, endPage ?? pdfJsDoc.numPages);

    for (let pageNum = first; pageNum <= last; pageNum++) {
      if (signal?.aborted) break;

      const page = await pdfJsDoc.getPage(pageNum);
      if (signal?.aborted) break;

      const origViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(0.85, Math.max(0.25, targetWidth / Math.max(1, origViewport.width)));
      const thumbViewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(thumbViewport.width));
      canvas.height = Math.max(1, Math.floor(thumbViewport.height));

      try {
        await page.render({
          canvas,
          viewport: thumbViewport,
          background: '#ffffff',
        }).promise;

        if (signal?.aborted) break;

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        result[pageNum] = dataUrl;
        onThumbnail?.(pageNum, dataUrl);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return result;
}

export async function renderSinglePdfPageZoom(
  buffer: ArrayBuffer,
  pageNum: number,
  targetWidth = 960
): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer.slice(0)),
  });

  try {
    const pdfJsDoc = await loadingTask.promise;
    const safePage = Math.max(1, Math.min(pdfJsDoc.numPages, pageNum));
    const page = await pdfJsDoc.getPage(safePage);
    const origViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2.0, Math.max(0.8, targetWidth / Math.max(1, origViewport.width)));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    try {
      await page.render({
        canvas,
        viewport,
        background: '#ffffff',
      }).promise;
      return canvas.toDataURL('image/jpeg', 0.85);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await loadingTask.destroy();
  }
}

export interface ExtractedPagesTextResult {
  isDigitalText: boolean;
  combinedText: string;
  textByteLength: number;
  totalChars: number;
  perPageChars: Record<number, number>;
}

export async function extractSelectedPagesTextLayer(
  buffer: ArrayBuffer,
  selectedPages1Based: number[]
): Promise<ExtractedPagesTextResult> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer.slice(0)),
  });

  const perPageChars: Record<number, number> = {};
  const pageBlocks: string[] = [];

  try {
    const pdfJsDoc = await loadingTask.promise;
    const validPages = Array.from(
      new Set(
        selectedPages1Based.filter(
          (p) => Number.isInteger(p) && p >= 1 && p <= pdfJsDoc.numPages
        )
      )
    ).sort((a, b) => a - b);

    let totalChars = 0;

    for (const pageNum of validPages) {
      const page = await pdfJsDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      const items: Array<{ str: string; x: number; y: number }> = [];
      for (const rawItem of textContent.items) {
        if (
          rawItem &&
          typeof rawItem === 'object' &&
          'str' in rawItem &&
          'transform' in rawItem
        ) {
          const item = rawItem as { str: string; transform: number[] };
          const trimmed = item.str.replace(/\s+/g, ' ').trim();
          if (trimmed) {
            items.push({
              str: trimmed,
              x: item.transform[4] ?? 0,
              y: item.transform[5] ?? 0,
            });
          }
        }
      }

      // Group items into reading lines (Y descending, X ascending)
      items.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 4.5) return b.y - a.y;
        return a.x - b.x;
      });

      const lines: Array<{ y: number; parts: Array<{ x: number; str: string }> }> = [];
      for (const item of items) {
        const lastLine = lines[lines.length - 1];
        if (lastLine && Math.abs(lastLine.y - item.y) <= 4.5) {
          lastLine.parts.push({ x: item.x, str: item.str });
        } else {
          lines.push({ y: item.y, parts: [{ x: item.x, str: item.str }] });
        }
      }

      const pageText = lines
        .map((line) =>
          line.parts
            .sort((a, b) => a.x - b.x)
            .map((p) => p.str)
            .join(' ')
        )
        .join('\n')
        .trim();

      const nonSpaceLen = pageText.replace(/\s+/g, '').length;
      perPageChars[pageNum] = nonSpaceLen;
      totalChars += nonSpaceLen;

      if (pageText) {
        pageBlocks.push(`=== HALAMAN ${pageNum} ===\n${pageText}`);
      }
    }

    const combinedText = pageBlocks.join('\n\n');
    const allPagesHaveText =
      validPages.length > 0 &&
      validPages.every((p) => (perPageChars[p] ?? 0) >= 25);

    const isDigitalText = totalChars > 120 && allPagesHaveText;
    const textByteLength = new TextEncoder().encode(combinedText).byteLength;

    return {
      isDigitalText,
      combinedText,
      textByteLength,
      totalChars,
      perPageChars,
    };
  } finally {
    await loadingTask.destroy();
  }
}

export async function computePdfSelectionSha256(
  buffer: ArrayBuffer,
  selectedPages1Based: number[]
): Promise<string> {
  const sortedPages = Array.from(new Set(selectedPages1Based)).sort((a, b) => a - b);
  const prefixBytes = new TextEncoder().encode(`pages:${sortedPages.join(',')}|`);
  const sourceBytes = new Uint8Array(buffer);
  const combined = new Uint8Array(prefixBytes.length + sourceBytes.length);
  combined.set(prefixBytes, 0);
  combined.set(sourceBytes, prefixBytes.length);

  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const digest = await window.crypto.subtle.digest('SHA-256', combined);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback digest if crypto.subtle is unavailable on non-HTTPS LAN origins
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < combined.length; i++) {
    h1 ^= combined[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= combined[i] + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `fallback-${(h1 >>> 0).toString(16)}-${(h2 >>> 0).toString(16)}-${combined.length}`;
}

const DASAR_CACHE_KEY = 'situgas_dasar_pdf_cache_v1';
const MAX_CACHE_ENTRIES = 25;

export interface CachedDasarPdfEntry<T = unknown> {
  key: string;
  sha256: string;
  precisionMode: 'cepat' | 'teliti';
  extractionSource: 'text' | 'pdf';
  originalBytes: number;
  finalBytes: number;
  selectedCount: number;
  totalPages: number;
  modelUsed?: string;
  savedAt: number;
  result: T;
}

function readCacheList<T>(): Array<CachedDasarPdfEntry<T>> {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(DASAR_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Array<CachedDasarPdfEntry<T>>) : [];
  } catch {
    return [];
  }
}

export function getCachedDasarPdfEntry<T>(
  sha256: string,
  preferredMode: 'cepat' | 'teliti' = 'cepat'
): CachedDasarPdfEntry<T> | null {
  const entries = readCacheList<T>();
  if (preferredMode === 'cepat') {
    const telitiHit = entries.find((e) => e.sha256 === sha256 && e.precisionMode === 'teliti');
    if (telitiHit) return telitiHit;
  }
  return entries.find((e) => e.sha256 === sha256 && e.precisionMode === preferredMode) ?? null;
}

export function saveCachedDasarPdfEntry<T>(entry: Omit<CachedDasarPdfEntry<T>, 'key' | 'savedAt'>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const key = `${entry.sha256}:${entry.precisionMode}`;
    const existing = readCacheList<T>().filter((e) => e.key !== key);
    const updated: Array<CachedDasarPdfEntry<T>> = [
      { ...entry, key, savedAt: Date.now() },
      ...existing,
    ].slice(0, MAX_CACHE_ENTRIES);
    window.localStorage.setItem(DASAR_CACHE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore localStorage quota exceeded errors
  }
}

function clearHeavyPdfMetadata(pdfDoc: PDFDocument): void {
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('');
  pdfDoc.setCreator('');
}

async function canvasToJpegUint8Array(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('Gagal mengonversi halaman PDF ke gambar terkompresi.'));
      },
      'image/jpeg',
      quality
    );
  });
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}

async function compressPdfWithCanvasRasterization(
  sourceBytes: Uint8Array,
  selectedPages1Based: number[],
  onStage?: (stage: string) => void
): Promise<Uint8Array> {
  const presets: Array<{ scale: number; quality: number; label: string }> = [
    { scale: 1.8, quality: 0.72, label: 'Mengompres halaman PDF (kualitas standar)...' },
    { scale: 1.5, quality: 0.56, label: 'Mengompres ulang agar ukuran aman (< 3,5 MB)...' },
    { scale: 1.25, quality: 0.42, label: 'Mengoptimalkan ukuran PDF untuk unggahan cepat...' },
    { scale: 1.0, quality: 0.34, label: 'Kompresi maksimal agar lolos batas server...' },
  ];

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(sourceBytes),
  });

  let bestBytes: Uint8Array | null = null;

  try {
    const pdfJsDoc = await loadingTask.promise;

    for (const preset of presets) {
      onStage?.(preset.label);
      const outPdf = await PDFDocument.create();
      clearHeavyPdfMetadata(outPdf);

      for (const pageNum of selectedPages1Based) {
        const page = await pdfJsDoc.getPage(pageNum);
        const origViewport = page.getViewport({ scale: 1 });
        const renderViewport = page.getViewport({ scale: preset.scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(renderViewport.width));
        canvas.height = Math.max(1, Math.floor(renderViewport.height));

        try {
          await page.render({
            canvas,
            viewport: renderViewport,
            background: '#ffffff',
          }).promise;

          const jpgBytes = await canvasToJpegUint8Array(canvas, preset.quality);
          const embeddedJpg = await outPdf.embedJpg(jpgBytes);

          const outPage = outPdf.addPage([origViewport.width, origViewport.height]);
          outPage.drawImage(embeddedJpg, {
            x: 0,
            y: 0,
            width: origViewport.width,
            height: origViewport.height,
          });
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }

      const candidate = await outPdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });

      if (!bestBytes || candidate.byteLength < bestBytes.byteLength) {
        bestBytes = candidate;
      }

      if (candidate.byteLength <= TARGET_COMPRESSED_BYTES) {
        return candidate;
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return bestBytes ?? sourceBytes;
}

export async function prepareDasarPdfForUpload(
  buffer: ArrayBuffer,
  selectedPagesInput: number[],
  onStage?: (stage: string) => void
): Promise<OptimizeDasarPdfResult> {
  const originalBytes = buffer.byteLength;
  const sourceBytes = new Uint8Array(buffer);

  onStage?.('Memeriksa struktur halaman PDF...');
  let totalPages = 0;
  let workingBytes: Uint8Array = sourceBytes;
  let rasterized = false;
  let isTrimmed = false;
  let normalizedPages: number[] = [];

  try {
    const srcPdf = await PDFDocument.load(sourceBytes, {
      ignoreEncryption: true,
    });
    totalPages = srcPdf.getPageCount();
    normalizedPages = Array.from(
      new Set(
        selectedPagesInput.filter((p) => Number.isInteger(p) && p >= 1 && p <= totalPages)
      )
    ).sort((a, b) => a - b);

    if (normalizedPages.length === 0) {
      throw new Error('Pilih minimal 1 halaman PDF untuk diunggah.');
    }

    isTrimmed = normalizedPages.length < totalPages;

    if (isTrimmed || originalBytes > VERCEL_COMPRESS_TRIGGER_BYTES) {
      onStage?.(
        isTrimmed
          ? `Memotong ${normalizedPages.length} dari ${totalPages} halaman PDF...`
          : 'Membersihkan metadata dan mengoptimalkan struktur PDF...'
      );
      const trimmedPdf = await PDFDocument.create();
      const zeroBasedIndices = normalizedPages.map((p) => p - 1);
      const copiedPages = await trimmedPdf.copyPages(srcPdf, zeroBasedIndices);
      for (const page of copiedPages) {
        trimmedPdf.addPage(page);
      }
      clearHeavyPdfMetadata(trimmedPdf);
      workingBytes = await trimmedPdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });
    }

    if (workingBytes.byteLength > VERCEL_COMPRESS_TRIGGER_BYTES) {
      const rasterSourcePages = normalizedPages.map((_, idx) => idx + 1);
      const rasterizedBytes = await compressPdfWithCanvasRasterization(
        workingBytes,
        rasterSourcePages,
        onStage
      );

      if (rasterizedBytes.byteLength < workingBytes.byteLength) {
        workingBytes = rasterizedBytes;
        rasterized = true;
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Pilih minimal 1 halaman')) {
      throw err;
    }
    // Fallback when pdf-lib cannot load source directly: render selected pages via pdfjs-dist
    totalPages = await inspectPdfPageCount(buffer);
    normalizedPages = Array.from(
      new Set(
        selectedPagesInput.filter((p) => Number.isInteger(p) && p >= 1 && p <= totalPages)
      )
    ).sort((a, b) => a - b);

    if (normalizedPages.length === 0) {
      throw new Error('Pilih minimal 1 halaman PDF untuk diunggah.');
    }

    isTrimmed = normalizedPages.length < totalPages;
    if (isTrimmed || originalBytes > VERCEL_COMPRESS_TRIGGER_BYTES) {
      workingBytes = await compressPdfWithCanvasRasterization(
        sourceBytes,
        normalizedPages,
        onStage
      );
      rasterized = true;
    }
  }

  if (workingBytes.byteLength > VERCEL_HARD_LIMIT_BYTES) {
    throw new Error(
      `Ukuran PDF setelah optimasi masih ${formatFileSize(workingBytes.byteLength)} (melebihi batas server 4,5 MB). Silakan pilih lebih sedikit halaman saja (misalnya halaman surat utama dan lampiran nama pegawai).`
    );
  }

  return {
    pdfBytes: workingBytes,
    originalBytes,
    finalBytes: workingBytes.byteLength,
    selectedPages: normalizedPages,
    selectedCount: normalizedPages.length,
    totalPages,
    trimmed: isTrimmed,
    compressed: workingBytes.byteLength < originalBytes,
    rasterized,
  };
}
