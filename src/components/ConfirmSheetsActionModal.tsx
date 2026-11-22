import React from 'react';
import { AlertTriangle, FileSpreadsheet, X } from 'lucide-react';
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
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Konfirmasi pembaruan data Google Sheets"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900">
              Perbarui Baris di Google Sheets?
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
            aria-label="Tutup konfirmasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 text-xs text-slate-600 space-y-2 leading-relaxed">
          <p>
            Surat Tugas ini sudah tercatat sebelumnya pada{' '}
            <span className="font-semibold text-slate-900">
              Sheet {year} (Baris {rowNumber})
            </span>
            .
          </p>
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium line-clamp-2">
            {namaKegiatan || 'Kegiatan Surat Tugas'}
          </div>
          <p>
            Melanjutkan akan menimpa data pada baris tersebut di Google Spreadsheet Anda dengan versi terbaru dari editor.
          </p>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60 transition-colors"
          >
            {isBusy ? 'Menyimpan...' : 'Ya, Perbarui Baris'}
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
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Wajib simpan ke Spreadsheet Pemilik"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-emerald-50/50">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#0B5D3B]" />
            <h2 className="text-sm font-semibold text-slate-900">
              {pendingActionLabel
                ? `Wajib Simpan ke Sheets Sebelum ${pendingActionLabel}`
                : 'Wajib Terhubung ke Spreadsheet Pemilik'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
            aria-label="Tutup dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 text-xs text-slate-600 space-y-3 leading-relaxed">
          <p>
            Setiap Surat Tugas wajib tercatat ke Google Spreadsheet akun pemilik (
            <span className="font-mono-tabular font-semibold text-slate-900">
              bondowosobarjas2019.007@gmail.com
            </span>
            ) pada sheet tahun{' '}
            <span className="font-mono-tabular font-semibold text-slate-900">
              {targetYear}
            </span>{' '}
            agar seluruh surat yang diterbitkan dapat terlacak.
          </p>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
            Jembatan otomatis untuk pengguna umum belum diaktifkan di server. Jika Anda adalah pemilik (<strong>bondowosobarjas2019.007@gmail.com</strong>), masuk dengan Google untuk langsung menyimpan &amp; melanjutkan, atau aktifkan Bridge Apps Script di menu Tracking Sheets.
          </div>
          <div className="pt-1 flex justify-center">
            <GoogleSignInButton
              onClick={onSignIn}
              disabled={isConnecting}
              label={
                isConnecting
                  ? 'Menghubungkan...'
                  : 'Masuk sebagai Pemilik (Google)'
              }
            />
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          {onOpenTrackingTab ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTrackingTab();
              }}
              className="px-3 py-1.5 text-xs font-medium text-[#0B5D3B] bg-emerald-50 hover:bg-emerald-100 rounded-lg"
            >
              Pengaturan Tracking Sheets
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
