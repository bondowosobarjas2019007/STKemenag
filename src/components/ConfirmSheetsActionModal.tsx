import React from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Loader2, X } from 'lucide-react';
import { useViewport } from '../contexts/ViewportContext';
import { GoogleSignInButton } from './GoogleSignInButton';

interface ConfirmSheetsOverwriteModalProps {
  isOpen: boolean;
  year: string;
  rowNumber: number;
  namaKegiatan: string;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmSheetsOverwriteModal: React.FC<
  ConfirmSheetsOverwriteModalProps
> = ({
  isOpen,
  year,
  rowNumber,
  namaKegiatan,
  isBusy,
  onConfirm,
  onCancel,
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
      aria-label="Konfirmasi pembaruan data Google Sheets"
    >
      <div
        className={`w-full st-surface overflow-hidden flex flex-col ${
          isMobileLayout
            ? 'h-full rounded-none border-0'
            : 'max-w-md border rounded-xl shadow-xl'
        }`}
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b st-border shrink-0">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <h2 className="text-sm font-semibold st-text-primary">
              Perbarui Baris di Google Sheets?
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center st-text-muted hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
            aria-label="Tutup konfirmasi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 text-xs st-text-secondary space-y-2.5 leading-relaxed">
          <p>
            Surat Tugas ini sudah tercatat sebelumnya pada{' '}
            <span className="font-semibold st-text-primary">
              Sheet {year} (Baris {rowNumber})
            </span>
            .
          </p>
          <div className="p-3 st-surface-muted border rounded-lg st-text-primary font-medium line-clamp-2">
            {namaKegiatan || 'Kegiatan Surat Tugas'}
          </div>
          <p>
            Melanjutkan akan menimpa data pada baris tersebut di Google Spreadsheet Anda dengan versi terbaru dari editor.
          </p>
        </div>

        <div
          className={`px-4 sm:px-5 py-3.5 st-surface-muted border-t st-border flex gap-2 shrink-0 ${
            isMobileLayout ? 'flex-col-reverse' : 'items-center justify-end'
          }`}
        >
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 text-xs font-medium st-text-secondary st-surface border rounded-lg hover:opacity-90 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onConfirm}
            className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60 transition-colors"
          >
            {isBusy ? 'Menyimpan...' : 'Ya, Perbarui Baris'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ConfirmDocxExportModalProps {
  isOpen: boolean;
  namaKegiatan: string;
  targetYear: string;
  isBusy: boolean;
  errorMessage: string | null;
  onConfirmRecordAndDownload: () => void;
  onForceDownloadOnly: () => void;
  onCancel: () => void;
}

export const ConfirmDocxExportModal: React.FC<ConfirmDocxExportModalProps> = ({
  isOpen,
  namaKegiatan,
  targetYear,
  isBusy,
  errorMessage,
  onConfirmRecordAndDownload,
  onForceDownloadOnly,
  onCancel,
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
      aria-label="Konfirmasi Unduh dan Pencatatan Surat"
    >
      <div
        className={`w-full st-surface overflow-hidden flex flex-col ${
          isMobileLayout
            ? 'h-full rounded-none border-0'
            : 'max-w-md border rounded-xl shadow-xl'
        }`}
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b st-border bg-emerald-50/50 night:bg-[#f5ecd5] dark:bg-emerald-950/35 shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#0B5D3B] dark:text-emerald-400 shrink-0" />
            <h2 className="text-sm font-semibold st-text-primary">
              Konfirmasi Unduh &amp; Pencatatan Surat
            </h2>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center st-text-muted hover:text-slate-700 dark:hover:text-slate-200 rounded-lg disabled:opacity-40"
            aria-label="Tutup konfirmasi unduh"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 text-xs st-text-secondary space-y-3 leading-relaxed">
          <p className="st-text-primary text-[13px] leading-relaxed">
            Apakah Anda akan mengunduh file .docx ini? Bila Ya, surat akan dicatat di Worksheet (Google Sheets) otomatis.
          </p>

          <div className="p-3 st-surface-muted border rounded-lg space-y-1">
            <div className="text-[11px] font-medium st-text-muted">
              Tab Tahun {targetYear} · Status: Tercatat / Final
            </div>
            <div className="st-text-primary font-medium line-clamp-2">
              {namaKegiatan || 'Surat Tugas Kemenag Jember'}
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70 rounded-lg text-red-900 dark:text-red-200 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-red-800 dark:text-red-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>Gagal Mencatat ke Google Sheets</span>
              </div>
              <p className="text-[11px] leading-relaxed text-red-800 dark:text-red-200">
                {errorMessage}
              </p>
              <p className="text-[11px] text-red-700 dark:text-red-300">
                Jika dalam kondisi darurat/koneksi terputus, Anda tetap dapat mengunduh file Word melalui tombol <strong>Tetap Unduh .docx Saja</strong> di bawah.
              </p>
            </div>
          )}
        </div>

        <div
          className={`px-4 sm:px-5 py-3.5 st-surface-muted border-t st-border flex gap-2 shrink-0 ${
            isMobileLayout ? 'flex-col-reverse' : 'flex-wrap items-center justify-end'
          }`}
        >
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="min-h-[44px] px-3.5 py-2 text-xs font-medium st-text-secondary st-surface border rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            Batal
          </button>

          {errorMessage && (
            <button
              type="button"
              disabled={isBusy}
              onClick={onForceDownloadOnly}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-900/50 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/70 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Tetap Unduh .docx Saja
            </button>
          )}

          <button
            type="button"
            disabled={isBusy}
            onClick={onConfirmRecordAndDownload}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60 transition-colors"
          >
            {isBusy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Menyimpan ke Worksheet...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Ya, Catat &amp; Unduh
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

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
      aria-label="Wajib simpan ke Spreadsheet Pemilik"
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
                ? `Wajib Simpan ke Sheets Sebelum ${pendingActionLabel}`
                : 'Wajib Terhubung ke Spreadsheet Pemilik'}
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
            Setiap Surat Tugas wajib tercatat ke Google Spreadsheet akun pemilik (
            <span className="font-mono-tabular font-semibold st-text-primary">
              bondowosobarjas2019.007@gmail.com
            </span>
            ) pada sheet tahun{' '}
            <span className="font-mono-tabular font-semibold st-text-primary">
              {targetYear}
            </span>{' '}
            agar seluruh surat yang diterbitkan dapat terlacak.
          </p>
          <div className="p-3 bg-amber-50 night:bg-[#f5ecd5] dark:bg-amber-950/35 border border-amber-200 dark:border-amber-700/60 rounded-lg text-amber-900 night:text-[#4e4234] dark:text-amber-200">
            Jembatan otomatis untuk pengguna umum belum diaktifkan di server. Jika Anda adalah pemilik (<strong>bondowosobarjas2019.007@gmail.com</strong>), masuk dengan Google untuk langsung menyimpan &amp; melanjutkan, atau aktifkan Bridge Apps Script di menu Tracking Sheets.
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

interface DuplicateSuratWarningModalProps {
  isOpen: boolean;
  waktuInputSebelumnya: string;
  rowNumber: number;
  targetYear: string;
  namaKegiatan: string;
  matchedBy: 'id' | 'fingerprint' | 'both';
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
  waktuInputSebelumnya,
  rowNumber,
  targetYear,
  namaKegiatan,
  matchedBy,
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

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 no-print ${
        isMobileLayout ? 'p-0' : 'p-4'
      } ${isForcedMobile ? 'max-w-[430px] mx-auto' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Surat Tugas Serupa Sudah Tercatat"
    >
      <div
        className={`w-full st-surface overflow-hidden flex flex-col ${
          isMobileLayout
            ? 'h-full rounded-none border-0'
            : 'max-w-lg border rounded-xl shadow-xl'
        }`}
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b st-border bg-amber-50/70 night:bg-[#f5ecd5] dark:bg-amber-950/35 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <h2 className="text-sm font-semibold st-text-primary truncate">
              Surat Tugas Serupa Sudah Tercatat
            </h2>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center st-text-muted hover:text-slate-700 dark:hover:text-slate-200 rounded-lg disabled:opacity-40 shrink-0"
            aria-label="Tutup peringatan duplikasi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 text-xs st-text-secondary space-y-3 leading-relaxed">
          <p className="st-text-primary text-[13px] leading-relaxed">
            Ditemukan surat tugas yang sama persis di Worksheet (diinput pada{' '}
            <span className="font-mono-tabular font-semibold">
              {waktuInputSebelumnya || '-'}
            </span>
            ). Apa yang ingin Anda lakukan?
          </p>

          <div className="p-3 st-surface-muted border rounded-lg space-y-1">
            <div className="text-[11px] font-medium st-text-muted">
              Sheet {targetYear} · Baris {rowNumber} ·{' '}
              {matchedBy === 'both'
                ? 'ID Surat & isi identik'
                : matchedBy === 'id'
                  ? 'Referensi ID Surat sama'
                  : 'Dasar, kegiatan, pegawai & tanggal identik'}
            </div>
            <div className="st-text-primary font-medium line-clamp-2">
              {namaKegiatan || 'Surat Tugas Kemenag Jember'}
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70 rounded-lg text-red-900 dark:text-red-200 text-xs">
              {errorMessage}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3.5 st-surface-muted border-t st-border flex flex-col gap-2 shrink-0">
          <button
            type="button"
            disabled={isBusy}
            onClick={onDownloadOnly}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60 transition-colors"
          >
            {busyAction === 'download_only' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Mengunduh .docx...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Unduh .docx Saja (Jangan Catat Ulang)
              </>
            )}
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={onOverwriteOld}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 bg-amber-100/80 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/60 disabled:opacity-60 transition-colors"
          >
            {busyAction === 'overwrite' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Memperbarui Data Lama...
              </>
            ) : (
              'Perbarui Data Lama (Timpa)'
            )}
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={onSaveAsNew}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium st-text-primary st-surface border rounded-lg hover:opacity-90 disabled:opacity-60 transition-colors"
          >
            {busyAction === 'save_new' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Menyimpan sebagai Data Baru...
              </>
            ) : (
              'Tetap Simpan sebagai Data Baru'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
