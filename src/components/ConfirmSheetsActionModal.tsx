import React from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
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
