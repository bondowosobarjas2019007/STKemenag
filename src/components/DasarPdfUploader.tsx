import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileText,
  FileUp,
  Layers,
  Loader2,
  Lock,
  Scissors,
  ShieldAlert,
  Sparkles,
  Unlock,
  Users,
  X,
  ZoomIn,
} from 'lucide-react';
import { INITIAL_PEGAWAI_DIRECTORY, Pegawai } from '../types/surat';
import { useViewport } from '../contexts/ViewportContext';
import {
  computePdfSelectionSha256,
  extractSelectedPagesTextLayer,
  formatFileSize,
  formatPageSelectionInput,
  getCachedDasarPdfEntry,
  inspectPdfPageCount,
  parsePageSelectionInput,
  prepareDasarPdfForUpload,
  renderPdfPageThumbnails,
  renderSinglePdfPageZoom,
  saveCachedDasarPdfEntry,
} from '../utils/optimizeDasarPdf';

export interface ParsedDasarPdfResult {
  jenisDokumen: string;
  dasarAsal: string;
  dasarNomor: string;
  dasarTanggal: string;
  namaKegiatan: string;
  lokasiTujuan: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  kriteriaDisarankan?: 'sendiri' | 'tiga_orang' | 'terlampir';
  catatanDeteksi: string;
  pegawaiTerdeteksi: Array<{
    nama: string;
    nip: string;
    pangkatGolongan: string;
    jabatan: string;
    sumberDeteksi: 'eksplisit' | 'direktori_jabatan';
  }>;
  modelUsed?: string;
  extractionSource?: 'text' | 'pdf';
}

interface DasarPdfUploaderProps {
  directory: Pegawai[];
  isAdminMode?: boolean;
  onRequestAdminSignIn?: () => void;
  onApplyParsedResult: (result: ParsedDasarPdfResult, fileName: string) => void;
  onOpenDirectoryMulti: () => void;
}

interface PendingPdfSelection {
  fileName: string;
  buffer: ArrayBuffer;
  totalPages: number;
  originalBytes: number;
  selectionMode: 'subset' | 'all';
  selectedPages: number[];
  customPages: number[];
  rangeText: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

const DUK_BY_ID = new Map(INITIAL_PEGAWAI_DIRECTORY.map((d) => [d.id, d]));

export const DasarPdfUploader: React.FC<DasarPdfUploaderProps> = ({
  directory,
  isAdminMode = false,
  onRequestAdminSignIn,
  onApplyParsedResult,
  onOpenDirectoryMulti,
}) => {
  const { isMobileLayout, isForcedMobile } = useViewport();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rangeInputRef = useRef<HTMLInputElement>(null);
  const thumbAbortRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [stageText, setStageText] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingPdf, setPendingPdf] = useState<PendingPdfSelection | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [renderedUpTo, setRenderedUpTo] = useState<number>(0);
  const [isRenderingThumbnails, setIsRenderingThumbnails] = useState(false);
  const [zoomPreview, setZoomPreview] = useState<{
    pageNum: number;
    dataUrl: string | null;
    isLoading: boolean;
  } | null>(null);
  const [lastExtractionContext, setLastExtractionContext] = useState<{
    buffer: ArrayBuffer;
    fileName: string;
    selectedPages: number[];
    totalPages: number;
  } | null>(null);
  const [lastSummary, setLastSummary] = useState<{
    fileName: string;
    count: number;
    kriteria: 'sendiri' | 'tiga_orang' | 'terlampir';
    dasarAsal: string;
    catatan: string;
    originalBytes: number;
    finalBytes: number;
    selectedCount: number;
    totalPages: number;
    compressed: boolean;
    fromCache: boolean;
    extractionSource: 'text' | 'pdf';
    precisionMode: 'cepat' | 'teliti';
    modelUsed?: string;
  } | null>(null);
  const [securityLock, setSecurityLock] = useState<{
    lockedUntil: number;
    reason: string;
  } | null>(null);
  const [lockRemainingSeconds, setLockRemainingSeconds] = useState<number>(0);
  const [showAdminUnlockForm, setShowAdminUnlockForm] = useState<boolean>(false);
  const [adminKeyInput, setAdminKeyInput] = useState<string>('');
  const [isUnlockingAdmin, setIsUnlockingAdmin] = useState<boolean>(false);
  const [adminUnlockError, setAdminUnlockError] = useState<string | null>(null);
  const [adminUnlockNotice, setAdminUnlockNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!securityLock) {
      setLockRemainingSeconds(0);
      return;
    }
    const updateCountdown = () => {
      const diffSec = Math.max(
        0,
        Math.ceil((securityLock.lockedUntil - Date.now()) / 1000)
      );
      setLockRemainingSeconds(diffSec);
      if (diffSec === 0) {
        setSecurityLock(null);
        setShowAdminUnlockForm(false);
        setAdminUnlockError(null);
      }
    };
    updateCountdown();
    const timerId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timerId);
  }, [securityLock]);

  useEffect(() => {
    thumbAbortRef.current?.abort();
    setThumbnails({});
    setZoomPreview(null);

    if (!pendingPdf) {
      setRenderedUpTo(0);
      setIsRenderingThumbnails(false);
      return;
    }

    const controller = new AbortController();
    thumbAbortRef.current = controller;
    const initialEnd = Math.min(pendingPdf.totalPages, 20);
    setRenderedUpTo(initialEnd);
    setIsRenderingThumbnails(true);

    void renderPdfPageThumbnails(pendingPdf.buffer, {
      startPage: 1,
      endPage: initialEnd,
      targetWidth: 260,
      quality: 0.72,
      signal: controller.signal,
      onThumbnail: (pageNum, dataUrl) => {
        if (controller.signal.aborted) return;
        setThumbnails((prev) => ({ ...prev, [pageNum]: dataUrl }));
      },
    })
      .catch(() => {
        // Ignore aborted or thumbnail render hiccups; checkboxes remain functional
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsRenderingThumbnails(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [pendingPdf?.buffer, pendingPdf?.totalPages]);

  const handleLoadMoreThumbnails = () => {
    if (!pendingPdf || isRenderingThumbnails || renderedUpTo >= pendingPdf.totalPages) return;
    const nextStart = renderedUpTo + 1;
    const nextEnd = Math.min(pendingPdf.totalPages, renderedUpTo + 20);
    thumbAbortRef.current?.abort();
    const controller = new AbortController();
    thumbAbortRef.current = controller;
    setRenderedUpTo(nextEnd);
    setIsRenderingThumbnails(true);

    void renderPdfPageThumbnails(pendingPdf.buffer, {
      startPage: nextStart,
      endPage: nextEnd,
      targetWidth: 260,
      quality: 0.72,
      signal: controller.signal,
      onThumbnail: (pageNum, dataUrl) => {
        if (controller.signal.aborted) return;
        setThumbnails((prev) => ({ ...prev, [pageNum]: dataUrl }));
      },
    })
      .catch(() => {
        // Keep previously rendered thumbnails intact
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsRenderingThumbnails(false);
        }
      });
  };

  const handleOpenZoom = async (pageNum: number) => {
    if (!pendingPdf) return;
    setZoomPreview({ pageNum, dataUrl: thumbnails[pageNum] || null, isLoading: true });
    try {
      const highRes = await renderSinglePdfPageZoom(pendingPdf.buffer, pageNum, 980);
      setZoomPreview((prev) =>
        prev && prev.pageNum === pageNum
          ? { pageNum, dataUrl: highRes, isLoading: false }
          : prev
      );
    } catch {
      setZoomPreview((prev) =>
        prev && prev.pageNum === pageNum ? { ...prev, isLoading: false } : prev
      );
    }
  };

  const optimizeAndUploadPdf = async (
    rawBuffer: ArrayBuffer,
    fileName: string,
    selectedPages: number[],
    options: { precisionMode?: 'cepat' | 'teliti'; skipCache?: boolean; totalPagesHint?: number } = {}
  ) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const precisionMode: 'cepat' | 'teliti' =
      options.precisionMode === 'teliti' ? 'teliti' : 'cepat';
    const skipCache = Boolean(options.skipCache || precisionMode === 'teliti');

    thumbAbortRef.current?.abort();
    setZoomPreview(null);
    setIsLoading(true);
    setErrorMessage(null);
    setActiveFileName(fileName);
    setStageText('Menghitung sidik jari SHA-256 & memeriksa cache lokal...');

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 90000);

    try {
      const sortedSelectedPages = Array.from(new Set(selectedPages)).sort((a, b) => a - b);
      const totalPagesCount =
        options.totalPagesHint || (await inspectPdfPageCount(rawBuffer));
      const sha256 = await computePdfSelectionSha256(rawBuffer, sortedSelectedPages);

      const applyFinalResult = (
        result: ParsedDasarPdfResult,
        meta: {
          originalBytes: number;
          finalBytes: number;
          selectedCount: number;
          totalPages: number;
          compressed: boolean;
          fromCache: boolean;
          extractionSource: 'text' | 'pdf';
          precisionMode: 'cepat' | 'teliti';
          modelUsed?: string;
        }
      ) => {
        const detectedCount = result.pegawaiTerdeteksi?.length || 0;
        const resolvedKriteria: 'sendiri' | 'tiga_orang' | 'terlampir' =
          detectedCount === 1
            ? 'sendiri'
            : detectedCount >= 2 && detectedCount <= 3
              ? 'tiga_orang'
              : detectedCount >= 4
                ? 'terlampir'
                : result.kriteriaDisarankan === 'sendiri' ||
                    result.kriteriaDisarankan === 'tiga_orang' ||
                    result.kriteriaDisarankan === 'terlampir'
                  ? result.kriteriaDisarankan
                  : 'sendiri';

        setPendingPdf(null);
        setLastExtractionContext({
          buffer: rawBuffer,
          fileName,
          selectedPages: sortedSelectedPages,
          totalPages: meta.totalPages,
        });
        onApplyParsedResult(
          { ...result, kriteriaDisarankan: resolvedKriteria },
          fileName
        );
        setLastSummary({
          fileName,
          count: detectedCount,
          kriteria: resolvedKriteria,
          dasarAsal: result.dasarAsal || '',
          catatan: result.catatanDeteksi,
          ...meta,
        });
      };

      if (!skipCache) {
        const cached = getCachedDasarPdfEntry<ParsedDasarPdfResult>(sha256, precisionMode);
        if (cached) {
          applyFinalResult(cached.result, {
            originalBytes: rawBuffer.byteLength,
            finalBytes: cached.finalBytes,
            selectedCount: sortedSelectedPages.length,
            totalPages: cached.totalPages || totalPagesCount,
            compressed: cached.finalBytes < rawBuffer.byteLength,
            fromCache: true,
            extractionSource: cached.extractionSource,
            precisionMode: cached.precisionMode,
            modelUsed: cached.modelUsed,
          });
          return;
        }
      }

      const customDirectory = directory.filter((item) => {
        const base = DUK_BY_ID.get(item.id);
        if (!base) return true;
        return (
          base.nama !== item.nama ||
          base.nip !== item.nip ||
          base.pangkatGolongan !== item.pangkatGolongan ||
          base.jabatan !== item.jabatan
        );
      });

      const parseJsonSafe = (text: string) => {
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          return null;
        }
      };

      let extractionSource: 'text' | 'pdf' = 'pdf';
      let finalBytes = rawBuffer.byteLength;
      let compressed = false;
      let attempt: { res: Response; text: string; json: unknown } | null = null;

      // Hybrid Text Extraction: untuk mode cepat, cek lapisan teks digital dahulu sebelum mengirim binary PDF
      if (precisionMode !== 'teliti') {
        setStageText('Memeriksa lapisan teks digital halaman terpilih...');
        const textLayer = await extractSelectedPagesTextLayer(rawBuffer, sortedSelectedPages);
        if (textLayer.isDigitalText) {
          extractionSource = 'text';
          finalBytes = textLayer.textByteLength;
          compressed = true;
          setStageText(
            `Mengirim teks digital (${formatFileSize(rawBuffer.byteLength)} → ${formatFileSize(
              finalBytes
            )}, hemat token)...`
          );

          const sendDigitalText = async (endpoint: string, contentType: string) => {
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': contentType },
              body: JSON.stringify({
                isTextOnly: true,
                textContent: textLayer.combinedText,
                fileName,
                directory: customDirectory,
                precisionMode,
              }),
              credentials: 'same-origin',
              signal: controller.signal,
            });
            const text = await res.text();
            return { res, text, json: parseJsonSafe(text) };
          };

          attempt = await sendDigitalText('/api/parse-dasar-pdf', 'application/json');
          if (
            !attempt.json &&
            (attempt.res.status === 404 || attempt.res.status === 405 || !attempt.res.ok)
          ) {
            attempt = await sendDigitalText('/api/ekstrak-dasar', 'text/plain;charset=UTF-8');
          }
        }
      }

      // Binary PDF path (dokumen scan atau Mode Teliti)
      if (!attempt) {
        extractionSource = 'pdf';
        const optimized = await prepareDasarPdfForUpload(
          rawBuffer,
          sortedSelectedPages,
          (stage) => setStageText(stage)
        );
        finalBytes = optimized.finalBytes;
        compressed = optimized.compressed;

        const uploadBuffer = optimized.pdfBytes.buffer.slice(
          optimized.pdfBytes.byteOffset,
          optimized.pdfBytes.byteOffset + optimized.pdfBytes.byteLength
        ) as ArrayBuffer;

        setStageText(
          `Mengirim PDF ${
            precisionMode === 'teliti' ? '(Mode Teliti) ' : ''
          }${formatFileSize(optimized.originalBytes)} → ${formatFileSize(
            optimized.finalBytes
          )} (${optimized.selectedCount} halaman)...`
        );

        const customHeader =
          customDirectory.length > 0
            ? encodeURIComponent(JSON.stringify(customDirectory.slice(0, 20)))
            : '';

        const sendBinaryRequest = async (endpoint: string) => {
          const headers: Record<string, string> = {
            'Content-Type': 'application/pdf',
            'X-File-Name': encodeURIComponent(fileName),
            'X-Precision-Mode': precisionMode,
          };
          if (customHeader) {
            headers['X-Custom-Directory'] = customHeader;
          }
          const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: uploadBuffer,
            credentials: 'same-origin',
            signal: controller.signal,
          });
          const text = await res.text();
          return { res, text, json: parseJsonSafe(text) };
        };

        const sendTextEnvelopeRequest = async (endpoint: string) => {
          const fileBase64 = arrayBufferToBase64(uploadBuffer);
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify({
              docB64: fileBase64,
              fileName,
              directory: customDirectory,
              precisionMode,
            }),
            credentials: 'same-origin',
            signal: controller.signal,
          });
          const text = await res.text();
          return { res, text, json: parseJsonSafe(text) };
        };

        const usedBinaryFirst = !customHeader || customHeader.length <= 4096;
        attempt = usedBinaryFirst
          ? await sendBinaryRequest('/api/parse-dasar-pdf')
          : await sendTextEnvelopeRequest('/api/ekstrak-dasar');

        if (
          usedBinaryFirst &&
          !attempt.json &&
          (attempt.res.status === 404 || attempt.res.status === 405 || !attempt.res.ok)
        ) {
          attempt = await sendTextEnvelopeRequest('/api/ekstrak-dasar');
        }
      }

      const { res: response, text: rawText, json: payload } = attempt;

      if (!response.ok || !payload) {
        if (response.status === 423 && payload) {
          const lockedObj = payload as {
            error?: string;
            reason?: string;
            lockedUntil?: number;
            remainingSeconds?: number;
          };
          const fallbackDurationMs =
            typeof lockedObj.remainingSeconds === 'number' &&
            lockedObj.remainingSeconds > 0
              ? lockedObj.remainingSeconds * 1000
              : 10 * 60 * 1000;
          const lockedUntil =
            typeof lockedObj.lockedUntil === 'number' &&
            lockedObj.lockedUntil > Date.now()
              ? lockedObj.lockedUntil
              : Date.now() + fallbackDurationMs;
          setSecurityLock({
            lockedUntil,
            reason:
              lockedObj.reason ||
              lockedObj.error ||
              'Sistem ekstraksi dikunci otomatis selama 10 menit untuk perlindungan kuota API.',
          });
          setShowAdminUnlockForm(false);
          setAdminUnlockError(null);
          setAdminKeyInput('');
          setErrorMessage(null);
          setLastSummary(null);
          return;
        }
        if (response.status === 413) {
          throw new Error(
            'Ukuran file PDF masih terlalu besar untuk batas server Vercel (maksimal 4,5 MB). Silakan pilih lebih sedikit halaman.'
          );
        }
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          throw new Error(
            'Server sedang sibuk atau memulai ulang. Tunggu beberapa detik lalu coba unggah kembali.'
          );
        }
        if (!payload) {
          let healthNote = '';
          try {
            const hRes = await fetch('/api/health', { credentials: 'same-origin' });
            const hText = await hRes.text();
            const hJson = parseJsonSafe(hText);
            healthNote =
              hRes.ok && hJson?.ok
                ? 'Server API aktif, namun permintaan unggah PDF terhadang oleh proxy/jaringan.'
                : `Backend API tidak merespons (health HTTP ${hRes.status}).`;
          } catch {
            healthNote = 'Tidak dapat terhubung ke backend API.';
          }
          const cleanSnippet = rawText
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 140);
          throw new Error(
            `Respons server tidak valid (HTTP ${response.status}). ${healthNote}${
              cleanSnippet ? ` Detail: "${cleanSnippet}"` : ''
            }`
          );
        }
        const errorObj = payload as { error?: string };
        throw new Error(errorObj?.error || 'Gagal membaca file PDF.');
      }

      const result = payload as ParsedDasarPdfResult;
      const modelUsed =
        result.modelUsed ||
        (precisionMode === 'teliti' ? 'gemini-4-hydrogen' : 'gemini-3.1-flash-lite');

      saveCachedDasarPdfEntry<ParsedDasarPdfResult>({
        sha256,
        precisionMode,
        extractionSource,
        originalBytes: rawBuffer.byteLength,
        finalBytes,
        selectedCount: sortedSelectedPages.length,
        totalPages: totalPagesCount,
        modelUsed,
        result,
      });

      applyFinalResult(result, {
        originalBytes: rawBuffer.byteLength,
        finalBytes,
        selectedCount: sortedSelectedPages.length,
        totalPages: totalPagesCount,
        compressed,
        fromCache: false,
        extractionSource: result.extractionSource || extractionSource,
        precisionMode,
        modelUsed,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMessage(
          'Waktu analisis PDF habis. Coba pilih lebih sedikit halaman (mis. halaman surat utama dan lampiran pegawai saja).'
        );
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : 'Terjadi kesalahan saat menganalisis file PDF.';
        setErrorMessage(msg);
      }
      setLastSummary(null);
    } finally {
      window.clearTimeout(timeoutId);
      isSubmittingRef.current = false;
      setIsLoading(false);
      setStageText(null);
    }
  };

  const handleFileSelected = async (file: File | null | undefined) => {
    if (!file || isSubmittingRef.current || isLoading || isInspecting) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Mohon unggah file berformat PDF (.pdf).');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage(
        'Ukuran file PDF melebihi 50 MB di browser. Silakan pisahkan halaman PDF terlebih dahulu.'
      );
      return;
    }

    setErrorMessage(null);
    setLastSummary(null);
    setLastExtractionContext(null);
    setPendingPdf(null);
    setIsInspecting(true);

    try {
      const buffer = await file.arrayBuffer();
      const totalPages = await inspectPdfPageCount(buffer);

      if (totalPages > 1) {
        const defaultPages = [1, 2].filter((p) => p <= totalPages);
        setPendingPdf({
          fileName: file.name,
          buffer,
          totalPages,
          originalBytes: buffer.byteLength,
          selectionMode: defaultPages.length === totalPages ? 'all' : 'subset',
          selectedPages: defaultPages,
          customPages: defaultPages,
          rangeText: formatPageSelectionInput(defaultPages),
        });
      } else {
        await optimizeAndUploadPdf(buffer, file.name, [1], { totalPagesHint: 1 });
      }
    } catch {
      setErrorMessage(
        'File PDF tidak dapat dibaca atau rusak. Pastikan file merupakan PDF yang valid.'
      );
    } finally {
      setIsInspecting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSelectAllPages = () => {
    if (!pendingPdf) return;
    const allPages = Array.from({ length: pendingPdf.totalPages }, (_, i) => i + 1);
    setPendingPdf({
      ...pendingPdf,
      selectionMode: 'all',
      selectedPages: allPages,
      rangeText: `1-${pendingPdf.totalPages}`,
    });
    setErrorMessage(null);
  };

  const handleSelectSubsetMode = () => {
    if (!pendingPdf) return;
    const subset =
      pendingPdf.customPages.length > 0 &&
      pendingPdf.customPages.length < pendingPdf.totalPages
        ? pendingPdf.customPages
        : [1, 2].filter((p) => p <= pendingPdf.totalPages);
    setPendingPdf({
      ...pendingPdf,
      selectionMode: 'subset',
      selectedPages: subset,
      customPages: subset,
      rangeText: formatPageSelectionInput(subset),
    });
    setErrorMessage(null);
    window.setTimeout(() => {
      rangeInputRef.current?.focus();
    }, 30);
  };

  const handleRangeInputChange = (value: string) => {
    if (!pendingPdf) return;
    const parsed = parsePageSelectionInput(value, pendingPdf.totalPages);
    const isAll = parsed.length === pendingPdf.totalPages;
    setPendingPdf({
      ...pendingPdf,
      rangeText: value,
      selectedPages: parsed,
      customPages: isAll ? pendingPdf.customPages : parsed,
      selectionMode: isAll ? 'all' : 'subset',
    });
    if (parsed.length > 0) setErrorMessage(null);
  };

  const handleToggleSinglePage = (pageNum: number) => {
    if (!pendingPdf) return;
    const exists = pendingPdf.selectedPages.includes(pageNum);
    const nextPages = exists
      ? pendingPdf.selectedPages.filter((p) => p !== pageNum)
      : [...pendingPdf.selectedPages, pageNum].sort((a, b) => a - b);
    const isAll = nextPages.length === pendingPdf.totalPages;
    setPendingPdf({
      ...pendingPdf,
      selectedPages: nextPages,
      customPages: isAll ? pendingPdf.customPages : nextPages,
      selectionMode: isAll ? 'all' : 'subset',
      rangeText: formatPageSelectionInput(nextPages),
    });
    if (nextPages.length > 0) setErrorMessage(null);
  };

  const handleAdminUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUnlockingAdmin) return;
    if (!adminKeyInput.trim()) {
      setAdminUnlockError('Masukkan Kode Admin terlebih dahulu.');
      return;
    }

    setIsUnlockingAdmin(true);
    setAdminUnlockError(null);
    try {
      const res = await fetch('/api/security-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ adminKey: adminKeyInput }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
      };

      if (!res.ok || !data.success) {
        setAdminUnlockError(data.message || 'Kode Admin salah.');
        return;
      }

      setSecurityLock(null);
      setLockRemainingSeconds(0);
      setShowAdminUnlockForm(false);
      setAdminKeyInput('');
      setAdminUnlockError(null);
      setErrorMessage(null);
      const noticeMsg =
        data.message || 'Sistem berhasil dibuka kembali oleh Admin.';
      setAdminUnlockNotice(noticeMsg);
      window.setTimeout(() => {
        setAdminUnlockNotice((prev) => (prev === noticeMsg ? null : prev));
      }, 5000);
    } catch {
      setAdminUnlockError(
        'Gagal menghubungi server untuk membuka kunci. Coba beberapa saat lagi.'
      );
    } finally {
      setIsUnlockingAdmin(false);
    }
  };

  const formatCooldownTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold st-text-primary">
          Deteksi Otomatis dari File PDF Dasar
        </span>
        {lastSummary && !isLoading && (
          <button
            type="button"
            onClick={() => {
              setLastSummary(null);
              setActiveFileName(null);
              setErrorMessage(null);
            }}
            className="text-xs st-text-muted hover:text-slate-700 night:hover:text-[#3b3228] dark:hover:text-slate-200 inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Tutup info
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
      />

      {!pendingPdf && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            void handleFileSelected(dropped);
          }}
          className={`border border-dashed rounded-lg p-3.5 transition-colors ${
            isDragging
              ? 'border-[#0B5D3B] bg-emerald-50/70 night:bg-emerald-900/10 dark:bg-emerald-950/35'
              : 'border-slate-300 night:border-[#d3c096] dark:border-slate-700 st-surface-muted hover:border-slate-400 night:hover:border-[#b79f72] dark:hover:border-slate-500'
          }`}
        >
          {isInspecting || isLoading ? (
            <div className="flex items-center gap-3 py-1">
              <Loader2 className="w-4 h-4 text-[#0B5D3B] dark:text-emerald-400 animate-spin shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold st-text-primary truncate">
                  {isInspecting
                    ? 'Memeriksa jumlah halaman PDF...'
                    : `Memproses ${activeFileName}...`}
                </div>
                <div className="text-[11px] st-text-muted">
                  {stageText ||
                    'Membaca nomor surat, kegiatan, jadwal, lokasi, dan pegawai yang berangkat'}
                </div>
              </div>
            </div>
          ) : (
            <div
              className={`flex flex-col justify-between gap-3 ${
                isMobileLayout ? '' : 'sm:flex-row sm:items-center'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-medium st-text-primary">
                  Unggah PDF Undangan / Nota Dinas / Permohonan
                </div>
                <div className="text-[11px] st-text-muted mt-0.5">
                  Otomatis memotong halaman terpilih &amp; mengompres ukuran agar cepat dan aman (&lt; 3,5 MB)
                </div>
              </div>
              <button
                type="button"
                disabled={isLoading || isInspecting}
                onClick={() => fileInputRef.current?.click()}
                className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 ${
                  isMobileLayout ? 'w-full' : ''
                }`}
              >
                <FileUp className="w-4 h-4 shrink-0" />
                Unggah file PDF dasar surat
              </button>
            </div>
          )}
        </div>
      )}

      {pendingPdf && !isLoading && (
        <div className="border border-emerald-300 night:border-emerald-700/40 dark:border-emerald-800/70 bg-emerald-50/40 night:bg-[#f5ecd5] dark:bg-emerald-950/25 rounded-lg p-3.5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <FileText className="w-4 h-4 text-[#0B5D3B] dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs font-semibold st-text-primary truncate">
                  {pendingPdf.fileName}
                </div>
                <div className="text-[11px] st-text-secondary mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-semibold text-[#0B5D3B] dark:text-emerald-400">
                    Total {pendingPdf.totalPages} halaman
                  </span>
                  <span>·</span>
                  <span className="font-mono-tabular">
                    Ukuran asli: {formatFileSize(pendingPdf.originalBytes)}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPendingPdf(null);
                setErrorMessage(null);
              }}
              className="st-text-muted hover:text-slate-700 night:hover:text-[#3b3228] dark:hover:text-slate-200 p-1 rounded-md"
              title="Batalkan pilihan file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[11px] st-text-secondary leading-relaxed">
            PDF memiliki {pendingPdf.totalPages} halaman. Pilih halaman kop surat utama &amp; daftar nama pegawai saja agar ekstraksi lebih cepat dan hemat token.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSelectSubsetMode}
              className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-colors ${
                pendingPdf.selectionMode === 'subset'
                  ? 'bg-[#0B5D3B] text-white border-[#0B5D3B]'
                  : 'st-surface st-text-secondary border-slate-300 night:border-[#d3c096] dark:border-slate-600 hover:bg-slate-50 night:hover:bg-[#efe3c4] dark:hover:bg-slate-800'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              Hanya Halaman Dipilih
            </button>
            <button
              type="button"
              onClick={handleSelectAllPages}
              className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-colors ${
                pendingPdf.selectionMode === 'all'
                  ? 'bg-[#0B5D3B] text-white border-[#0B5D3B]'
                  : 'st-surface st-text-secondary border-slate-300 night:border-[#d3c096] dark:border-slate-600 hover:bg-slate-50 night:hover:bg-[#efe3c4] dark:hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Semua Halaman ({pendingPdf.totalPages})
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold st-text-secondary">
              Rentang Halaman (contoh: <span className="font-mono-tabular">1, 3-4</span>)
            </label>
            <input
              ref={rangeInputRef}
              type="text"
              value={pendingPdf.rangeText}
              onChange={(e) => handleRangeInputChange(e.target.value)}
              onBlur={() => {
                if (pendingPdf.selectedPages.length > 0) {
                  setPendingPdf((prev) =>
                    prev
                      ? {
                          ...prev,
                          rangeText: formatPageSelectionInput(prev.selectedPages),
                        }
                      : null
                  );
                }
              }}
              placeholder="Contoh: 1, 3-4"
              className="w-full min-h-[44px] px-3 py-2 text-sm sm:text-xs font-mono-tabular st-input border rounded-md focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] st-text-secondary">
              <span>
                Pratinjau halaman — centang halaman berisi{' '}
                <strong className="st-text-primary">kop surat</strong> &amp;{' '}
                <strong className="st-text-primary">daftar nama pegawai</strong>:
              </span>
              {isRenderingThumbnails && (
                <span className="inline-flex items-center gap-1 text-[#0B5D3B] dark:text-emerald-400 font-medium shrink-0">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Memuat pratinjau...
                </span>
              )}
            </div>

            <div
              className={`grid gap-2.5 max-h-[380px] overflow-y-auto p-2 st-surface border rounded-md ${
                isMobileLayout ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
              }`}
            >
              {Array.from({ length: pendingPdf.totalPages }, (_, idx) => {
                const pageNum = idx + 1;
                const checked = pendingPdf.selectedPages.includes(pageNum);
                const thumbUrl = thumbnails[pageNum];
                const isPendingThumb = isRenderingThumbnails && pageNum <= renderedUpTo && !thumbUrl;

                return (
                  <label
                    key={pageNum}
                    className={`group flex flex-col rounded-md border-2 overflow-hidden cursor-pointer select-none transition-all ${
                      checked
                        ? 'border-[#0B5D3B] bg-emerald-50/70 night:bg-emerald-900/15 dark:bg-emerald-950/40 shadow-sm'
                        : 'border-slate-200 night:border-[#e4d5b3] dark:border-slate-700 st-surface-muted hover:border-slate-300 dark:hover:border-slate-500'
                    }`}
                  >
                    <div className="relative aspect-[3/4] w-full bg-slate-100 night:bg-[#efe3c4] dark:bg-slate-800 border-b st-border flex items-center justify-center overflow-hidden">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={`Pratinjau halaman ${pageNum}`}
                          className="w-full h-full object-contain bg-white"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1 px-2 text-center st-text-muted">
                          {isPendingThumb ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-[#0B5D3B] dark:text-emerald-400" />
                              <span className="text-[10px]">Memuat...</span>
                            </>
                          ) : (
                            <>
                              <FileText className="w-5 h-5" />
                              <span className="text-[10px]">Hal. {pageNum}</span>
                            </>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleOpenZoom(pageNum);
                        }}
                        title={`Perbesar halaman ${pageNum}`}
                        aria-label={`Perbesar halaman ${pageNum}`}
                        className="absolute top-1.5 right-1.5 min-w-[34px] min-h-[34px] inline-flex items-center justify-center rounded bg-white/95 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 shadow-sm hover:bg-white hover:text-[#0B5D3B] transition-colors"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>

                      {checked && (
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#0B5D3B] text-white text-[10px] font-semibold shadow-sm">
                          Dipilih
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1.5 px-2 py-2 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 font-mono-tabular font-semibold st-text-primary">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleSinglePage(pageNum)}
                          className="w-4 h-4 accent-[#0B5D3B] rounded"
                        />
                        Hal. {pageNum}
                      </span>
                      <span className="text-[10px] st-text-muted">
                        {checked ? 'Aktif' : 'Lewati'}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>

            {renderedUpTo < pendingPdf.totalPages && (
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={isRenderingThumbnails}
                  onClick={handleLoadMoreThumbnails}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-medium text-[#0B5D3B] dark:text-emerald-400 st-surface border border-emerald-300 dark:border-emerald-700 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50"
                >
                  Muat Pratinjau Halaman {renderedUpTo + 1}–
                  {Math.min(pendingPdf.totalPages, renderedUpTo + 20)}
                </button>
              </div>
            )}
          </div>

          <div
            className={`flex flex-col justify-between gap-2.5 pt-2 border-t border-emerald-200/70 night:border-[#d3c096] dark:border-emerald-800/60 ${
              isMobileLayout ? '' : 'sm:flex-row sm:items-center'
            }`}
          >
            <div className="text-[11px] st-text-secondary font-medium">
              {pendingPdf.selectedPages.length > 0 ? (
                <span>
                  <span className="font-mono-tabular font-semibold text-[#0B5D3B] dark:text-emerald-400">
                    {pendingPdf.selectedPages.length}
                  </span>{' '}
                  dari {pendingPdf.totalPages} halaman dipilih
                  {pendingPdf.originalBytes > 3.5 * 1024 * 1024
                    ? ' · Kompresi otomatis aktif jika > 3,5 MB'
                    : ''}
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400 font-semibold">
                  Pilih minimal 1 halaman untuk diproses
                </span>
              )}
            </div>

            <div
              className={
                isMobileLayout
                  ? 'grid grid-cols-2 gap-2 w-full'
                  : 'flex items-center justify-end gap-2'
              }
            >
              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setPendingPdf(null);
                  setErrorMessage(null);
                }}
                className="min-h-[44px] inline-flex items-center justify-center px-3 py-2 text-xs font-medium st-text-secondary st-surface border border-slate-300 night:border-[#d3c096] dark:border-slate-600 rounded-md hover:bg-slate-50 night:hover:bg-[#efe3c4] dark:hover:bg-slate-800 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isLoading || isInspecting || pendingPdf.selectedPages.length === 0}
                onClick={() =>
                  void optimizeAndUploadPdf(
                    pendingPdf.buffer,
                    pendingPdf.fileName,
                    pendingPdf.selectedPages,
                    { totalPagesHint: pendingPdf.totalPages }
                  )
                }
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-md hover:bg-[#09492E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FileUp className="w-3.5 h-3.5" />
                Ekstrak ({pendingPdf.selectedPages.length} Hal.)
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingPdf && isLoading && (
        <div className="border border-emerald-200 night:border-emerald-700/40 dark:border-emerald-800/70 bg-emerald-50/50 night:bg-[#f5ecd5] dark:bg-emerald-950/30 rounded-lg p-3.5 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-[#0B5D3B] dark:text-emerald-400 animate-spin shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold st-text-primary truncate">
              Memproses {activeFileName}...
            </div>
            <div className="text-[11px] st-text-secondary">
              {stageText || 'Memotong halaman terpilih & mengoptimalkan PDF...'}
            </div>
          </div>
        </div>
      )}

      {securityLock && (
        <div className="p-3 bg-amber-50 night:bg-[#f5ecd5] dark:bg-amber-950/35 border border-amber-300 night:border-amber-600/40 dark:border-amber-700/60 rounded-lg text-xs text-amber-950 dark:text-amber-100 space-y-2.5">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-amber-950 night:text-[#3b3228] dark:text-amber-100">
                  Sistem Terkunci Sementara (Auto-Cooldown 10 Menit)
                </span>
                <span className="px-2 py-0.5 st-surface border border-amber-300 dark:border-amber-700/70 rounded-md font-mono-tabular text-[11px] font-semibold text-amber-900 night:text-[#3b3228] dark:text-amber-200">
                  Sisa waktu: {formatCooldownTimer(lockRemainingSeconds)}
                </span>
              </div>
              <p className="text-[11px] text-amber-900 night:text-[#4e4234] dark:text-amber-200/90 leading-relaxed">
                {securityLock.reason}
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-amber-200/80 dark:border-amber-800/60">
            {!isAdminMode ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-amber-900 night:text-[#4e4234] dark:text-amber-200/90">
                  Sistem dikunci sementara. Masuk sebagai Admin untuk membuka kunci.
                </span>
                {onRequestAdminSignIn && (
                  <button
                    type="button"
                    onClick={onRequestAdminSignIn}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-950 night:text-[#3b3228] dark:text-amber-100 st-surface border border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors shrink-0"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Masuk Admin (Google)
                  </button>
                )}
              </div>
            ) : !showAdminUnlockForm ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminUnlockForm(true);
                    setAdminUnlockError(null);
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 night:text-[#3b3228] dark:text-amber-200 st-surface border border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Saya Admin — Buka Kunci Sekarang
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => void handleAdminUnlockSubmit(e)}
                className="space-y-2"
              >
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="password"
                    value={adminKeyInput}
                    disabled={isUnlockingAdmin}
                    onChange={(e) => {
                      setAdminKeyInput(e.target.value);
                      if (adminUnlockError) setAdminUnlockError(null);
                    }}
                    placeholder="Masukkan Kode Admin"
                    autoFocus
                    className="flex-1 min-h-[44px] px-3 py-2 text-sm sm:text-xs st-input border border-amber-300 dark:border-amber-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/25 focus:border-[#0B5D3B]"
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="submit"
                      disabled={isUnlockingAdmin}
                      className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-md hover:bg-[#09492E] disabled:opacity-60 transition-colors whitespace-nowrap"
                    >
                      {isUnlockingAdmin ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Membuka...
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3 h-3" />
                          Hidupkan Kembali
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isUnlockingAdmin}
                      onClick={() => {
                        setShowAdminUnlockForm(false);
                        setAdminUnlockError(null);
                        setAdminKeyInput('');
                      }}
                      className="min-h-[44px] px-3 py-2 text-xs font-medium text-amber-900 night:text-[#3b3228] dark:text-amber-200 st-surface border border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50"
                    >
                      Batal
                    </button>
                  </div>
                </div>
                {adminUnlockError && (
                  <p className="text-[11px] font-medium text-red-700 dark:text-red-300">
                    {adminUnlockError}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      {adminUnlockNotice && (
        <div className="flex items-center gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-[#0B5D3B] dark:text-emerald-300 font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{adminUnlockNotice}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-start gap-2 p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70 rounded-lg text-xs text-red-800 dark:text-red-200">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {lastSummary && !isLoading && (
        <div className="p-3 bg-emerald-50/70 night:bg-[#f5ecd5] dark:bg-emerald-950/30 border border-emerald-200 night:border-emerald-700/40 dark:border-emerald-800/70 rounded-lg space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#0B5D3B] dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold st-text-primary truncate">
                {lastSummary.fileName} ·{' '}
                <span className="font-mono-tabular">
                  {lastSummary.count > 0
                    ? `${lastSummary.count} pegawai terdeteksi`
                    : 'Perlu pilih tim manual'}
                </span>
              </div>
              <div className="mt-1 inline-flex flex-wrap items-center gap-1.5 px-2 py-0.5 st-surface border border-emerald-200 dark:border-emerald-800 rounded-md text-[11px] font-mono-tabular st-text-secondary">
                {lastSummary.fromCache ? (
                  <span className="inline-flex items-center gap-1 text-[#0B5D3B] dark:text-emerald-400 font-semibold">
                    <Database className="w-3 h-3" />
                    Cache SHA-256 (0 token)
                  </span>
                ) : lastSummary.extractionSource === 'text' ? (
                  <span>
                    {formatFileSize(lastSummary.originalBytes)} →{' '}
                    <strong className="text-[#0B5D3B] dark:text-emerald-400">
                      Teks Digital ({formatFileSize(lastSummary.finalBytes)})
                    </strong>
                  </span>
                ) : (
                  <span>
                    {formatFileSize(lastSummary.originalBytes)} →{' '}
                    <strong className="text-[#0B5D3B] dark:text-emerald-400">
                      {formatFileSize(lastSummary.finalBytes)}
                    </strong>
                  </span>
                )}
                <span className="st-text-muted">·</span>
                <span>
                  {lastSummary.selectedCount} halaman dipilih
                  {lastSummary.selectedCount < lastSummary.totalPages
                    ? ` (dari ${lastSummary.totalPages} hal.)`
                    : ''}
                </span>
                {lastSummary.modelUsed && (
                  <>
                    <span className="st-text-muted">·</span>
                    <span className="st-text-muted">{lastSummary.modelUsed}</span>
                  </>
                )}
              </div>
              <div className="text-[11px] font-medium text-[#0B5D3B] dark:text-emerald-400 mt-1">
                Kriteria otomatis:{' '}
                {lastSummary.kriteria === 'sendiri'
                  ? 'Sendiri (1 Orang)'
                  : lastSummary.kriteria === 'tiga_orang'
                    ? '2–3 Orang'
                    : '> 3 Orang (Terlampir)'}
                {lastSummary.dasarAsal ? ` · ${lastSummary.dasarAsal}` : ''}
              </div>
              <p className="text-[11px] st-text-secondary mt-0.5 leading-relaxed">
                {lastSummary.catatan}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lastSummary.count === 0 && (
              <button
                type="button"
                onClick={onOpenDirectoryMulti}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#0B5D3B] dark:text-emerald-400 st-surface border border-emerald-300 dark:border-emerald-700 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors whitespace-nowrap shrink-0"
              >
                <Users className="w-3.5 h-3.5" />
                Pilih Tim dari Direktori
              </button>
            )}
            {lastExtractionContext && (
              <button
                type="button"
                disabled={isLoading || isInspecting}
                onClick={() =>
                  void optimizeAndUploadPdf(
                    lastExtractionContext.buffer,
                    lastExtractionContext.fileName,
                    lastExtractionContext.selectedPages,
                    {
                      precisionMode: 'teliti',
                      skipCache: true,
                      totalPagesHint: lastExtractionContext.totalPages,
                    }
                  )
                }
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium st-text-secondary st-surface border border-slate-300 night:border-[#d3c096] dark:border-slate-600 rounded-md hover:bg-slate-50 night:hover:bg-[#efe3c4] dark:hover:bg-slate-800 hover:text-[#0B5D3B] hover:border-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#0B5D3B] dark:text-emerald-400" />
                Ekstrak Ulang Mode Teliti
              </button>
            )}
          </div>
        </div>
      )}
      {zoomPreview && pendingPdf && (
        <div
          className={`fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center ${
            isMobileLayout ? 'p-0' : 'p-3 sm:p-5'
          } ${isForcedMobile ? 'max-w-[430px] mx-auto' : ''}`}
          onClick={() => setZoomPreview(null)}
        >
          <div
            className={`st-surface border shadow-xl w-full flex flex-col overflow-hidden ${
              isMobileLayout
                ? 'h-full max-h-none rounded-none border-0'
                : 'rounded-lg max-w-3xl max-h-[90vh]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-3.5 sm:px-4 py-2.5 border-b st-border st-surface-muted">
              <div className="min-w-0">
                <div className="text-xs font-semibold st-text-primary">
                  Pratinjau Halaman {zoomPreview.pageNum} dari {pendingPdf.totalPages}
                </div>
                <div className="text-[11px] st-text-muted truncate">
                  {pendingPdf.fileName}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="min-h-[40px] inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border st-border st-surface st-text-primary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={pendingPdf.selectedPages.includes(zoomPreview.pageNum)}
                    onChange={() => handleToggleSinglePage(zoomPreview.pageNum)}
                    className="w-4 h-4 accent-[#0B5D3B] rounded"
                  />
                  <span>Pilih Hal. {zoomPreview.pageNum}</span>
                </label>
                <button
                  type="button"
                  onClick={() => setZoomPreview(null)}
                  className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-md st-text-muted hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-700/60"
                  title="Tutup pratinjau"
                  aria-label="Tutup pratinjau"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto st-desk p-3 flex items-start justify-center">
              {zoomPreview.dataUrl ? (
                <div className="relative">
                  <img
                    src={zoomPreview.dataUrl}
                    alt={`Pratinjau besar halaman ${zoomPreview.pageNum}`}
                    className="max-w-full h-auto bg-white shadow border border-slate-200 rounded"
                  />
                  {zoomPreview.isLoading && (
                    <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] st-text-secondary">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0B5D3B] dark:text-emerald-400" />
                      Meningkatkan resolusi pratinjau...
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center gap-2 st-text-muted text-xs">
                  <Loader2 className="w-5 h-5 animate-spin text-[#0B5D3B] dark:text-emerald-400" />
                  <span>Memuat pratinjau halaman {zoomPreview.pageNum}...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
