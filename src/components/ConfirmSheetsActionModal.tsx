import React from 'react';
import {
  AlertTriangle,
  CopyCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { useViewport } from '../contexts/ViewportContext';
import { GoogleSignInButton } from './GoogleSignInButton';

interface SheetsAuthPromptModalProps {
  isOpen: boolean;
  targetYear: string;
  isConnecting: boolean;
  pendingActionLabel?: string | null;
  onSignIn: () => void;
  onOpenTrackingTab?: () => void;
  onClose: () => void;
}

export const SheetsAuthPromptModal: React.FC<SheetsAuthPromptModalProps> = ({
  isOpen,
  targetYear,
  isConnecting,
  pendingActionLabel,
  onSignIn,
  onOpenTrackingTab,
  onClose,
}) => {
  const { isMobileLayout, isForcedMobile } = useViewport();
  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 no-print ${
        isMobileLayout ? 'p-0' : 'p-4'
      } ${isForcedMobile ? 'max-w-[430px] mx-auto' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Terhubung ke Spreadsheet Pemilik"
    >
      <div
        className={`w-full st-surface overflow-hidden flex flex-col ${
          isMobileLayout
            ? 'h-full rounded-none border-0'
            : 'max-w-md border rounded-xl shadow-xl'
        }`}
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b st-border bg-emerald-50/50 night:bg-[#f5ecd5] dark:bg-emerald-950/35 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileSpreadsheet className="w-4 h-4 text-[#0B5D3B] dark:text-emerald-400 shrink-0" />
            <h2 className="text-sm font-semibold st-text-primary truncate">
              {pendingActionLabel
                ? `Hubungkan Sheets untuk ${pendingActionLabel}`
                : 'Hubungkan ke Spreadsheet Pemilik'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center st-text-muted hover:text-slate-700 dark:hover:text-slate-200 rounded-lg shrink-0"
            aria-label="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 text-xs st-text-secondary space-y-3 leading-relaxed">
          <p>
            Surat Tugas disinkronkan secara otomatis ke Google Spreadsheet akun pemilik (
            <span className="font-mono-tabular font-semibold st-text-primary">
              bondowosobarjas2019.007@gmail.com
            </span>
            ) pada sheet tahun{' '}
            <span className="font-mono-tabular font-semibold st-text-primary">
              {targetYear}
            </span>
            .
          </p>
          <div className="p-3 bg-amber-50 night:bg-[#f5ecd5] dark:bg-amber-950/35 border border-amber-200 dark:border-amber-700/60 rounded-lg text-amber-900 night:text-[#4e4234] dark:text-amber-200">
            Jembatan otomatis (<code>APPS_SCRIPT_WEBHOOK_URL</code>) belum aktif di server. Jika Anda adalah pemilik (<strong>bondowosobarjas2019.007@gmail.com</strong>), masuk dengan Google untuk menyinkronkan langsung, atau aktifkan Bridge Apps Script di menu Tracking Sheets.
          </div>
          <div className="pt-1 flex justify-center">
            <GoogleSignInButton
              onClick={onSignIn}
              disabled={isConnecting}
              label={
                isConnecting
                  ? 'Menghubungkan...'
                  : 'Masuk sebagai Admin (Google)'
              }
            />
          </div>
        </div>

        <div
          className={`px-4 sm:px-5 py-3 st-surface-muted border-t st-border flex gap-2 shrink-0 ${
            isMobileLayout ? 'flex-col' : 'flex-wrap items-center justify-between'
          }`}
        >
          {onOpenTrackingTab ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTrackingTab();
              }}
              className="min-h-[44px] px-3 py-2 text-xs font-medium text-[#0B5D3B] dark:text-emerald-300 bg-emerald-50 night:bg-emerald-900/15 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg"
            >
              Pengaturan Tracking Sheets
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-xs font-medium st-text-secondary st-surface border rounded-lg hover:opacity-90"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

interface ConfirmDownloadSheetsModalProps {
  isOpen: boolean;
  format: 'docx' | 'pdf';
  namaKegiatan: string;
  targetYear: string;
  isBusy: boolean;
  errorMessage: string | null;
  onConfirmSaveAndDownload: () => void;
  onForceDownloadOnly: () => void;
  onCancel: () => void;
}

export const ConfirmDownloadSheetsModal: React.FC<
  ConfirmDownloadSheetsModalProps
> = ({
  isOpen,
  format,
  namaKegiatan,
  targetYear,
  isBusy,
  errorMessage,
  onConfirmSaveAndDownload,
  onForceDownloadOnly,
  onCancel,
}) => {
  const { isMobileLayout, isForcedMobile } = useViewport();
  if (!isOpen) return null;

  const formatLabel = format === 'docx' ? 'Word (.docx)' : 'PDF (.pdf)';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 no-print ${
        isMobileLayout ? 'p-3' : 'p-4'
      } ${isForcedMobile ? 'max-w-[430px] mx-auto' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-download-sheets-title"
    >
      <div className="w-full max-w-md st-surface border st-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b st-border bg-amber-50/80 night:bg-[#f5ecd5] dark:bg-amber-950/35 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <h2
              id="confirm-download-sheets-title"
              className="text-sm font-semibold st-text-primary truncate"
            >
              Peringatan: Otomatis Simpan ke Spreadsheet
            </h2>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="min-w-[38px] min-h-[38px] inline-flex items-center justify-center st-text-muted hover:text-slate-700 dark:hover:text-slate-200 rounded-lg disabled:opacity-50 shrink-0"
            aria-label="Tutup dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 sm:px-5 py-4 text-xs st-text-secondary space-y-3 leading-relaxed">
          <p className="st-text-primary">
            Perhatian: Mengunduh file surat ini akan otomatis mencatat dan menyimpan data Surat Tugas ke dalam buku kendali Google Spreadsheet. Apakah Anda yakin data surat sudah benar dan ingin melanjutkan?
          </p>

          <div className="p-3 st-surface-muted border st-border rounded-lg space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="st-text-muted">Format Unduhan:</span>
              <span className="font-semibold st-text-primary">{formatLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="st-text-muted">Target Buku Kendali:</span>
              <span className="font-mono-tabular font-semibold text-[#0B5D3B] dark:text-emerald-400">
                Google Sheets · Tahun {targetYear}
              </span>
            </div>
            {namaKegiatan.trim() && (
              <div className="pt-1 border-t st-border text-[11px]">
                <span className="st-text-muted">Kegiatan: </span>
                <span className="font-medium st-text-primary line-clamp-2">
                  {namaKegiatan}
                </span>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 night:bg-red-100/80 dark:bg-red-950/50 text-red-800 night:text-red-950 dark:text-red-200 space-y-1">
              <div className="font-semibold">
                Gagal Mencatat ke Google Spreadsheet
              </div>
              <p className="text-[11px] leading-snug">{errorMessage}</p>
              <p className="text-[11px] leading-snug font-medium">
                Anda dapat mencoba lagi atau memilih &ldquo;Tetap Unduh File Saja&rdquo; untuk kebutuhan darurat.
              </p>
            </div>
          )}
        </div>

        <div
          className={`px-4 sm:px-5 py-3 st-surface-muted border-t st-border flex gap-2 shrink-0 ${
            isMobileLayout ? 'flex-col-reverse' : 'flex-col sm:flex-row sm:items-center sm:justify-end'
          }`}
        >
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="min-h-[44px] px-3.5 py-2 text-xs font-medium st-text-secondary st-surface border st-border rounded-lg hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
          >
            Periksa Kembali (Batal)
          </button>

          {errorMessage && (
            <button
              type="button"
              disabled={isBusy}
              onClick={onForceDownloadOnly}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 bg-amber-100 night:bg-amber-200/70 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 rounded-lg hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              Tetap Unduh File Saja
            </button>
          )}

          <button
            type="button"
            disabled={isBusy}
            onClick={onConfirmSaveAndDownload}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            {isBusy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>Menyimpan ke Spreadsheet &amp; Mengunduh...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                <span>Ya, Simpan ke Spreadsheet &amp; Unduh</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

interface DuplicateSuratWarningModalProps {
  isOpen: boolean;
  format: 'docx' | 'pdf';
  waktuInputSebelumnya: string;
  rowNumber: number;
  targetYear: string;
  namaKegiatan: string;
  matchedBy: 'id' | 'fingerprint' | 'both';
  source: 'sheets' | 'local_tercatat';
  busyAction: 'download_only' | 'overwrite' | 'save_new' | null;
  errorMessage: string | null;
  onDownloadOnly: () => void;
  onOverwriteOld: () => void;
  onSaveAsNew: () => void;
  onCancel: () => void;
}

export const DuplicateSuratWarningModal: React.FC<
  DuplicateSuratWarningModalProps
> = ({
  isOpen,
  format,
  waktuInputSebelumnya,
  rowNumber,
  targetYear,
  namaKegiatan,
  matchedBy,
  source,
  busyAction,
  errorMessage,
  onDownloadOnly,
  onOverwriteOld,
  onSaveAsNew,
  onCancel,
}) => {
  const { isMobileLayout, isForcedMobile } = useViewport();
  if (!isOpen) return null;

  const isBusy = busyAction !== null;
  const extLabel = format === 'docx' ? '.docx' : '.pdf';
  const waktuText = waktuInputSebelumnya || 'waktu sebelumnya';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 no-print ${
        isMobileLayout ? 'p-3' : 'p-4'
      } ${isForcedMobile ? 'max-w-[430px] mx-auto' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-surat-title"
    >
      <div className="w-full max-w-lg st-surface border st-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b st-border bg-amber-50/90 night:bg-[#f5ecd5] dark:bg-amber-950/40 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <CopyCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <h2
              id="duplicate-surat-title"
              className="text-sm font-semibold st-text-primary truncate"
            >
              Surat Tugas Serupa Sudah Tercatat
            </h2>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="min-w-[38px] min-h-[38px] inline-flex items-center justify-center st-text-muted hover:text-slate-700 dark:hover:text-slate-200 rounded-lg disabled:opacity-50 shrink-0"
            aria-label="Tutup dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 sm:px-5 py-4 text-xs st-text-secondary space-y-3 leading-relaxed">
          <p className="st-text-primary">
            Ditemukan surat tugas yang sama persis di Worksheet (diinput pada{' '}
            <span className="font-semibold">{waktuText}</span>). Apa yang ingin Anda lakukan?
          </p>

          <div className="p-3 st-surface-muted border st-border rounded-lg space-y-1 text-[11px]">
            <div>
              <span className="st-text-muted">Sumber Kecocokan: </span>
              <span className="font-semibold st-text-primary">
                {source === 'sheets' && rowNumber >= 2
                  ? `Google Sheets Tahun ${targetYear} (Baris ${rowNumber})`
                  : `Riwayat Tercatat Tahun ${targetYear}`}
              </span>
            </div>
            <div>
              <span className="st-text-muted">Kriteria Cocok: </span>
              <span className="font-medium st-text-primary">
                {matchedBy === 'both'
                  ? 'ID Surat & Isi Surat (Dasar, Kegiatan, Pegawai, Tanggal)'
                  : matchedBy === 'id'
                    ? 'ID Surat yang sama'
                    : 'Isi Surat Identik (Dasar, Kegiatan, Pegawai & Tanggal)'}
              </span>
            </div>
            {namaKegiatan.trim() && (
              <div>
                <span className="st-text-muted">Kegiatan: </span>
                <span className="font-medium st-text-primary">{namaKegiatan}</span>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-200 text-[11px]">
              {errorMessage}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 st-surface-muted border-t st-border flex flex-col gap-2 shrink-0">
          <button
            type="button"
            disabled={isBusy}
            onClick={onDownloadOnly}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60"
          >
            {busyAction === 'download_only' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Unduh File {extLabel} Saja (Tanpa Mencatat Ulang)</span>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={onOverwriteOld}
              className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[#0B5D3B] dark:text-emerald-300 st-surface border st-border rounded-lg hover:opacity-90 disabled:opacity-60"
            >
              {busyAction === 'overwrite' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Perbarui Data Lama &amp; Unduh</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={onSaveAsNew}
              className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium st-text-primary st-surface border st-border rounded-lg hover:opacity-90 disabled:opacity-60"
            >
              {busyAction === 'save_new' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5" />
              )}
              <span>Simpan Baru &amp; Unduh</span>
            </button>
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="w-full min-h-[38px] px-3 py-1.5 text-xs font-medium st-text-muted hover:st-text-primary rounded-lg disabled:opacity-50"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
};
