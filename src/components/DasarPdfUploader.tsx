import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
  Users,
  X,
} from 'lucide-react';
import { INITIAL_PEGAWAI_DIRECTORY, Pegawai } from '../types/surat';

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
}

interface DasarPdfUploaderProps {
  directory: Pegawai[];
  onApplyParsedResult: (result: ParsedDasarPdfResult, fileName: string) => void;
  onOpenDirectoryMulti: () => void;
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
  onApplyParsedResult,
  onOpenDirectoryMulti,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<{
    fileName: string;
    count: number;
    kriteria: 'sendiri' | 'tiga_orang' | 'terlampir';
    dasarAsal: string;
    catatan: string;
  } | null>(null);

  const processPdfBuffer = async (buffer: ArrayBuffer, fileName: string) => {
    if (buffer.byteLength > 20 * 1024 * 1024) {
      setErrorMessage(
        'Ukuran file PDF terlalu besar (maksimal 20 MB). Silakan unggah PDF undangan/nota dinas yang ukurannya lebih kecil.'
      );
      setLastSummary(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setActiveFileName(fileName);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 90000);

    try {
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

      const customHeader =
        customDirectory.length > 0
          ? encodeURIComponent(JSON.stringify(customDirectory.slice(0, 20)))
          : '';

      const parseJsonSafe = (text: string) => {
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          return null;
        }
      };

      const sendBinaryRequest = async (endpoint: string) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/pdf',
          'X-File-Name': encodeURIComponent(fileName),
        };
        if (customHeader) {
          headers['X-Custom-Directory'] = customHeader;
        }
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: buffer,
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const text = await res.text();
        return { res, text, json: parseJsonSafe(text) };
      };

      const sendTextEnvelopeRequest = async (endpoint: string) => {
        const fileBase64 = arrayBufferToBase64(buffer);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({
            docB64: fileBase64,
            fileName,
            directory: customDirectory,
          }),
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const text = await res.text();
        return { res, text, json: parseJsonSafe(text) };
      };

      const usedBinaryFirst = !customHeader || customHeader.length <= 4096;
      let attempt = usedBinaryFirst
        ? await sendBinaryRequest('/api/parse-dasar-pdf')
        : await sendTextEnvelopeRequest('/api/ekstrak-dasar');

      if (
        usedBinaryFirst &&
        !attempt.json &&
        (attempt.res.status === 404 || attempt.res.status === 405 || !attempt.res.ok)
      ) {
        attempt = await sendTextEnvelopeRequest('/api/ekstrak-dasar');
      }

      const { res: response, text: rawText, json: payload } = attempt;

      if (!response.ok || !payload) {
        if (response.status === 413) {
          throw new Error(
            'Ukuran file PDF terlalu besar untuk dikirim ke server. Silakan kompres PDF terlebih dahulu.'
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
            healthNote = hRes.ok && hJson?.ok
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
        throw new Error(payload?.error || 'Gagal membaca file PDF.');
      }

      const result = payload as ParsedDasarPdfResult;
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
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMessage(
          'Waktu analisis PDF habis. Jika file PDF memiliki banyak halaman atau hasil scan besar, coba kompres atau unggah halaman suratnya saja.'
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
      setIsLoading(false);
    }
  };

  const handleFileSelected = async (file: File | null | undefined) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Mohon unggah file berformat PDF (.pdf).');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage(
        'Ukuran file PDF terlalu besar (maksimal 20 MB). Silakan kompres PDF terlebih dahulu.'
      );
      return;
    }
    const buffer = await file.arrayBuffer();
    await processPdfBuffer(buffer, file.name);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-900">
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
            className="text-xs text-slate-400 hover:text-slate-700 inline-flex items-center gap-1"
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
            ? 'border-[#0B5D3B] bg-emerald-50/70'
            : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
        }`}
      >
        {isLoading ? (
          <div className="flex items-center gap-3 py-1">
            <Loader2 className="w-4 h-4 text-[#0B5D3B] animate-spin shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">
                Menganalisis {activeFileName}...
              </div>
              <div className="text-[11px] text-slate-500">
                Membaca nomor surat, kegiatan, jadwal, lokasi, dan pegawai yang berangkat
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-800">
                Unggah PDF Undangan / Nota Dinas / Permohonan
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Otomatis mengisi dasar surat, kegiatan, tanggal, tempat, dan daftar pegawai
              </div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] transition-colors whitespace-nowrap shrink-0"
            >
              <FileUp className="w-3.5 h-3.5" />
              Unggah file PDF dasar surat
            </button>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {lastSummary && !isLoading && (
        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#0B5D3B] shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-900 truncate">
                {lastSummary.fileName} ·{' '}
                <span className="font-mono-tabular">
                  {lastSummary.count > 0
                    ? `${lastSummary.count} pegawai terdeteksi`
                    : 'Perlu pilih tim manual'}
                </span>
              </div>
              <div className="text-[11px] font-medium text-[#0B5D3B] mt-0.5">
                Kriteria otomatis:{' '}
                {lastSummary.kriteria === 'sendiri'
                  ? 'Sendiri (1 Orang)'
                  : lastSummary.kriteria === 'tiga_orang'
                    ? '2–3 Orang'
                    : '> 3 Orang (Terlampir)'}
                {lastSummary.dasarAsal ? ` · ${lastSummary.dasarAsal}` : ''}
              </div>
              <p className="text-[11px] text-slate-700 mt-0.5 leading-relaxed">
                {lastSummary.catatan}
              </p>
            </div>
          </div>
          {lastSummary.count === 0 && (
            <button
              type="button"
              onClick={onOpenDirectoryMulti}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0B5D3B] bg-white border border-emerald-300 rounded-md hover:bg-emerald-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Users className="w-3.5 h-3.5" />
              Pilih Tim dari Direktori
            </button>
          )}
        </div>
      )}
    </div>
  );
};
