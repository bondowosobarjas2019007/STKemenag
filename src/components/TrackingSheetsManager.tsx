import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  Link2,
  Loader2,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  Wrench,
} from 'lucide-react';
import { useViewport } from '../contexts/ViewportContext';
import {
  generateSuratFingerprint,
  getTrackedRowFingerprint,
  MigrasiBatchSyncProgress,
  OWNER_GOOGLE_EMAIL,
  SpreadsheetSummary,
  TrackedSuratRow,
} from '../services/googleSheets';
import { KriteriaKeberangkatan, SuratTugasData } from '../types/surat';
import { generateOwnerAppsScriptCode } from '../utils/appsScriptTemplate';
import { formatTanggalIndo } from '../utils/dateFormat';
import { GoogleSignInButton } from './GoogleSignInButton';

interface TrackingSheetsManagerProps {
  googleUser: User | null;
  needsAuth: boolean;
  isOwner: boolean;
  bridgeConnected: boolean;
  bridgeSource: 'server' | 'local' | 'none';
  localBridgeUrl: string;
  isConnecting: boolean;
  isSyncing: boolean;
  isProtecting: boolean;
  spreadsheet: SpreadsheetSummary | null;
  selectedYear: string;
  rows: TrackedSuratRow[];
  errorMessage: string | null;
  migrasiSt2026Items: SuratTugasData[];
  migrasiSyncProgress: MigrasiBatchSyncProgress | null;
  isSyncingMigrasi: boolean;
  onBatchSyncMigrasiSt2026: () => void;
  onGoogleLogin: () => void;
  onGoogleLogout: () => void;
  onAutoSetupSpreadsheet: () => void;
  onConnectSpreadsheetId: (rawIdOrUrl: string) => void;
  onProtectSpreadsheet: () => void;
  onSaveBridgeUrl: (url: string) => void;
  onClearLocalBridgeUrl: () => void;
  onSelectYear: (year: string) => void;
  onCreateYearSheet: (year: string) => void;
  onRefreshRows: () => void;
  onLoadTrackedDraft: (draft: SuratTugasData, asTemplateCopy: boolean) => void;
}

const KRITERIA_LABELS: Record<KriteriaKeberangkatan, string> = {
  sendiri: 'Sendiri (1 Orang)',
  tiga_orang: '2-3 Orang',
  terlampir: '> 3 Orang (Terlampir)',
};

const TABLE_PAGE_SIZE = 50;

export const TrackingSheetsManager: React.FC<TrackingSheetsManagerProps> = ({
  googleUser,
  needsAuth,
  isOwner,
  bridgeConnected,
  bridgeSource,
  localBridgeUrl,
  isConnecting,
  isSyncing,
  isProtecting,
  spreadsheet,
  selectedYear,
  rows,
  errorMessage,
  migrasiSt2026Items,
  migrasiSyncProgress,
  isSyncingMigrasi,
  onBatchSyncMigrasiSt2026,
  onGoogleLogin,
  onGoogleLogout,
  onAutoSetupSpreadsheet,
  onConnectSpreadsheetId,
  onProtectSpreadsheet,
  onSaveBridgeUrl,
  onClearLocalBridgeUrl,
  onSelectYear,
  onCreateYearSheet,
  onRefreshRows,
  onLoadTrackedDraft,
}) => {
  const { isMobileLayout } = useViewport();
  const [query, setQuery] = useState('');
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [newYearInput, setNewYearInput] = useState(() =>
    String(new Date().getFullYear() + 1)
  );
  const [showNewYearForm, setShowNewYearForm] = useState(false);
  const [showOwnerSetup, setShowOwnerSetup] = useState(false);
  const [bridgeUrlInput, setBridgeUrlInput] = useState(localBridgeUrl);
  const [copiedScript, setCopiedScript] = useState(false);
  const [includeUnsyncedMigrasi, setIncludeUnsyncedMigrasi] = useState(false);
  const [visibleRowCount, setVisibleRowCount] = useState(TABLE_PAGE_SIZE);

  useEffect(() => {
    setVisibleRowCount(TABLE_PAGE_SIZE);
  }, [query, selectedYear, includeUnsyncedMigrasi]);

  const unsyncedMigrasiRows = useMemo<
    Array<TrackedSuratRow & { isLocalMigrasiOnly?: boolean }>
  >(() => {
    if (selectedYear !== '2026' || migrasiSt2026Items.length === 0) return [];
    const sheetIds = new Set(rows.map((r) => r.idSurat.trim()).filter(Boolean));
    const sheetFps = new Set(
      rows.map((r) => getTrackedRowFingerprint(r)).filter(Boolean)
    );

    const pending: Array<TrackedSuratRow & { isLocalMigrasiOnly?: boolean }> = [];
    for (const item of migrasiSt2026Items) {
      const id = (item.id || '').trim();
      const fp = generateSuratFingerprint(item);
      if ((id && sheetIds.has(id)) || (fp && sheetFps.has(fp))) {
        continue;
      }
      const validPegawai = item.pegawaiList.filter(
        (p) => p.nama.trim() || p.nip.trim()
      );
      const pegawaiRingkas =
        validPegawai
          .map((p, i) => `${i + 1}. ${p.nama || '-'}${p.nip ? ` (${p.nip})` : ''}`)
          .join('\n') || (item.kriteria === 'terlampir' ? 'Terlampir' : '-');

      pending.push({
        rowNumber: 0,
        idSurat: item.id,
        waktuInput: `${formatTanggalIndo(item.tanggalNaskah)} (Migrasi Lokal 2026)`,
        nomorSurat: '${nomor_naskah} (Srikandi)',
        tanggalSurat: item.tanggalNaskah || '-',
        kriteria: KRITERIA_LABELS[item.kriteria],
        dasarAsal: item.dasarAsal || '-',
        dasarNomor: item.dasarNomor || '-',
        dasarTanggal: item.dasarTanggal || '-',
        namaKegiatan: item.namaKegiatan || '-',
        lokasiTujuan: item.lokasiTujuan || '-',
        tanggalMulai: item.tanggalMulai || '-',
        tanggalSelesai: item.tanggalSelesai || '-',
        jumlahPegawai: validPegawai.length,
        daftarPegawaiRingkas: pegawaiRingkas,
        penandatangan: item.namaPenandatangan || 'Kepala Kantor',
        rawDraft: item,
        isLocalMigrasiOnly: true,
      });
    }
    return pending.sort((a, b) =>
      (b.tanggalSurat || '').localeCompare(a.tanggalSurat || '')
    );
  }, [migrasiSt2026Items, rows, selectedYear]);

  const combinedRows = useMemo<
    Array<TrackedSuratRow & { isLocalMigrasiOnly?: boolean }>
  >(() => {
    const liveRows: Array<TrackedSuratRow & { isLocalMigrasiOnly?: boolean }> =
      rows;
    if (selectedYear !== '2026' || unsyncedMigrasiRows.length === 0) {
      return liveRows;
    }
    if (includeUnsyncedMigrasi || query.trim().length > 0) {
      return [...liveRows, ...unsyncedMigrasiRows];
    }
    return liveRows;
  }, [includeUnsyncedMigrasi, query, rows, selectedYear, unsyncedMigrasiRows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return combinedRows;
    return combinedRows.filter(
      (r) =>
        r.namaKegiatan.toLowerCase().includes(q) ||
        r.daftarPegawaiRingkas.toLowerCase().includes(q) ||
        r.lokasiTujuan.toLowerCase().includes(q) ||
        r.dasarAsal.toLowerCase().includes(q) ||
        r.dasarNomor.toLowerCase().includes(q) ||
        r.nomorSurat.toLowerCase().includes(q) ||
        r.idSurat.toLowerCase().includes(q) ||
        r.penandatangan.toLowerCase().includes(q)
    );
  }, [combinedRows, query]);

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleRowCount),
    [filteredRows, visibleRowCount]
  );

  const sortedSheets = useMemo(() => {
    if (!spreadsheet) return [];
    return [...spreadsheet.sheets].sort((a, b) =>
      b.title.localeCompare(a.title, 'id-ID', { numeric: true })
    );
  }, [spreadsheet]);

  const isAdminMode = isOwner && !needsAuth;
  const canViewTrackingData = bridgeConnected || isAdminMode;
  const migrasiSyncedCount = Math.max(
    0,
    migrasiSt2026Items.length - unsyncedMigrasiRows.length
  );

  const handleCopyAppsScript = async () => {
    const code = generateOwnerAppsScriptCode(OWNER_GOOGLE_EMAIL);
    try {
      await navigator.clipboard.writeText(code);
      setCopiedScript(true);
      window.setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className={`max-w-6xl mx-auto space-y-5 sm:space-y-6 ${isMobileLayout ? 'px-3 py-4' : 'px-4 sm:px-6 py-6 sm:py-8'}`}>
      {/* HEADER */}
      <div
        className={`flex justify-between gap-4 ${
          isMobileLayout ? 'flex-col items-stretch' : 'flex-col md:flex-row md:items-center'
        }`}
      >
        <div>
          <h1 className="text-lg sm:text-xl font-semibold st-text-primary">
            Tracking Database Google Sheets
          </h1>
          <p className="text-xs sm:text-sm st-text-secondary mt-1">
            Database terpusat akun pemilik (
            <span className="font-mono-tabular font-medium st-text-primary break-all">
              {OWNER_GOOGLE_EMAIL}
            </span>
            ). Seluruh Surat Tugas wajib tercatat dan otomatis dikelompokkan per sheet tahun (
            <span className="font-mono-tabular font-medium st-text-primary">2026</span>,{' '}
            <span className="font-mono-tabular font-medium st-text-primary">2027</span>).
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {needsAuth || !googleUser ? (
            <GoogleSignInButton
              onClick={onGoogleLogin}
              disabled={isConnecting}
              label={isConnecting ? 'Menghubungkan...' : 'Masuk Admin (Google)'}
            />
          ) : (
            <div className="flex items-center justify-between gap-3 w-full sm:w-auto st-surface border rounded-lg px-3.5 py-2">
              <div className="text-xs min-w-0">
                <div className="flex items-center gap-1.5 font-semibold st-text-primary flex-wrap">
                  <span className="truncate">{googleUser.displayName || 'Akun Google'}</span>
                  {isOwner && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 night:bg-amber-200/70 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 rounded">
                      Admin / Pemilik
                    </span>
                  )}
                </div>
                <div className="st-text-muted truncate">{googleUser.email}</div>
              </div>
              <button
                type="button"
                onClick={onGoogleLogout}
                title="Keluar dari akun Google"
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center st-text-muted hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors shrink-0"
                aria-label="Keluar akun Google"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CENTRALIZED SECURITY STATUS BANNER */}
      <div
        className={`st-surface border rounded-xl p-4 flex justify-between gap-3 ${
          isMobileLayout ? 'flex-col items-stretch' : 'flex-col sm:flex-row sm:items-center'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-lg shrink-0 ${
              bridgeConnected || isAdminMode
                ? 'bg-emerald-50 night:bg-emerald-900/15 dark:bg-emerald-950/50 text-[#0B5D3B] dark:text-emerald-400'
                : 'bg-amber-50 night:bg-amber-900/15 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="text-xs space-y-0.5">
            <div className="font-semibold st-text-primary">
              {bridgeConnected
                ? 'Mode Terpusat Aktif — Operator Dapat Melihat & Menyimpan Hanya Lewat Aplikasi'
                : isAdminMode
                  ? 'Terhubung sebagai Admin / Pemilik Spreadsheet (Mode Langsung)'
                  : 'Menunggu Koneksi Admin atau Jembatan Aplikasi'}
            </div>
            <p className="st-text-secondary leading-relaxed">
              {bridgeConnected
                ? `Seluruh pengajuan Surat Tugas otomatis disimpan ke spreadsheet milik ${OWNER_GOOGLE_EMAIL} (${
                    bridgeSource === 'server' ? 'Bridge Server Global' : 'Bridge Browser Lokal'
                  }). Pengaturan struktur spreadsheet disembunyikan untuk Operator.`
                : isAdminMode
                  ? 'Aktifkan kunci View-Only dan Jembatan Apps Script di bawah agar Operator dapat menyimpan otomatis ke spreadsheet Anda tanpa login sebagai editor.'
                  : `Spreadsheet hanya terpusat pada akun ${OWNER_GOOGLE_EMAIL}. Pengaturan sensitif dan perubahan struktur spreadsheet dikunci khusus Admin.`}
            </p>
          </div>
        </div>
        {isAdminMode && (
          <button
            type="button"
            onClick={() => setShowOwnerSetup((v) => !v)}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B5D3B] dark:text-emerald-300 bg-emerald-50 night:bg-emerald-900/15 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 whitespace-nowrap shrink-0"
          >
            <Wrench className="w-3.5 h-3.5" />
            Proteksi &amp; Jembatan Pemilik
            {showOwnerSetup ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {isAdminMode && migrasiSt2026Items.length > 0 && (
        <div className="st-surface border rounded-xl p-4 space-y-3">
          <div
            className={`flex justify-between gap-3 ${
              isMobileLayout
                ? 'flex-col items-stretch'
                : 'flex-col sm:flex-row sm:items-center'
            }`}
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 rounded-lg shrink-0 bg-amber-50 night:bg-amber-900/15 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
                <Database className="w-5 h-5" />
              </div>
              <div className="text-xs space-y-0.5 min-w-0">
                <div className="font-semibold st-text-primary">
                  Utilitas Admin · Sinkronisasi Data Awal ST 2026 (Migrasi Excel)
                </div>
                <p className="st-text-secondary leading-relaxed">
                  Mengunggah {migrasiSt2026Items.length.toLocaleString('id-ID')} data riwayat ST 2026 ke tab sheet <span className="font-mono-tabular font-semibold">2026</span> secara bertahap (25 baris/batch) dengan pengecekan otomatis ID &amp; fingerprint agar tidak terjadi duplikasi.
                  {selectedYear === '2026' && spreadsheet && (
                    <span className="ml-1 font-mono-tabular st-text-primary">
                      ({migrasiSyncedCount}/{migrasiSt2026Items.length} sudah tercatat di tab 2026).
                    </span>
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isSyncingMigrasi || isSyncing}
              onClick={onBatchSyncMigrasiSt2026}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {isSyncingMigrasi ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyinkronkan Batch...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Sinkronkan {migrasiSt2026Items.length} Data Awal ST 2026 ke Google Sheets
                </>
              )}
            </button>
          </div>

          {migrasiSyncProgress && (
            <div
              className={`p-3 rounded-lg border text-xs space-y-2 ${
                migrasiSyncProgress.phase === 'error'
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/70 text-red-900 dark:text-red-200'
                  : migrasiSyncProgress.phase === 'done'
                    ? 'bg-emerald-50 night:bg-emerald-900/15 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-[#0B5D3B] dark:text-emerald-200'
                    : 'st-surface-muted st-border st-text-primary'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 font-medium">
                <span className="flex items-center gap-1.5">
                  {migrasiSyncProgress.phase === 'error' ? (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  ) : migrasiSyncProgress.phase === 'done' ? (
                    <Check className="w-4 h-4 shrink-0" />
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  )}
                  {migrasiSyncProgress.message}
                </span>
                {migrasiSyncProgress.totalBatches > 0 && (
                  <span className="font-mono-tabular text-[11px]">
                    Batch {migrasiSyncProgress.currentBatch}/{migrasiSyncProgress.totalBatches} · Masuk:{' '}
                    {migrasiSyncProgress.inserted} · Lewati:{' '}
                    {migrasiSyncProgress.skipped}
                  </span>
                )}
              </div>

              {migrasiSyncProgress.totalPending > 0 && (
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-[#0B5D3B] dark:bg-emerald-500 transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (migrasiSyncProgress.processed /
                            migrasiSyncProgress.totalPending) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70 rounded-xl text-xs text-red-800 dark:text-red-200">
          {errorMessage}
        </div>
      )}

      {/* OWNER PROTECTION & APPS SCRIPT BRIDGE PANEL (ADMIN ONLY) */}
      {isAdminMode && showOwnerSetup && (
        <div
          className={`st-surface border-2 border-[#0B5D3B]/35 dark:border-emerald-700/60 rounded-xl space-y-5 ${
            isMobileLayout ? 'p-4' : 'p-5'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b st-border">
            <div>
              <h2 className="text-sm font-semibold st-text-primary">
                1. Kunci Spreadsheet agar Orang Lain Tidak Bisa Edit di Google Sheets
              </h2>
              <p className="text-xs st-text-secondary mt-0.5">
                Mengatur tautan Google Sheets menjadi <strong>Hanya Lihat (Viewer)</strong> untuk orang lain dan memproteksi seluruh sheet agar hanya akun Anda (<code>{OWNER_GOOGLE_EMAIL}</code>) &amp; aplikasi yang bisa menulis data.
              </p>
            </div>
            <button
              type="button"
              disabled={!spreadsheet || isProtecting}
              onClick={onProtectSpreadsheet}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              {isProtecting
                ? 'Mengunci Spreadsheet...'
                : 'Kunci View-Only & Proteksi Sheet'}
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold st-text-primary">
                  2. Jembatan Aplikasi (Wajib Agar Orang Lain Bisa Simpan ke Spreadsheet Anda)
                </h2>
                <p className="text-xs st-text-secondary mt-0.5">
                  Karena Google Drive tidak mengizinkan orang lain mengedit file Anda tanpa izin Editor, pasang skrip Apps Script berikut pada spreadsheet Anda dan deploy sebagai Web App (<strong>Execute as: Me</strong>, <strong>Who has access: Anyone</strong>).
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyAppsScript()}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold st-text-primary st-surface-muted border rounded-lg hover:opacity-90 whitespace-nowrap shrink-0"
              >
                {copiedScript ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#0B5D3B] dark:text-emerald-400" />
                    Kode Apps Script Tersalin
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Salin Kode Apps Script
                  </>
                )}
              </button>
            </div>

            <ol className="text-xs st-text-secondary st-surface-muted border rounded-lg p-3.5 space-y-1 list-decimal list-inside">
              <li>Buka Google Spreadsheet Anda &rarr; klik menu <strong>Ekstensi</strong> &rarr; <strong>Apps Script</strong>.</li>
              <li>Hapus kode bawaan, tempel kode hasil tombol <strong>Salin Kode Apps Script</strong> di atas, lalu tekan Simpan.</li>
              <li>Klik <strong>Terapkan (Deploy)</strong> &rarr; <strong>Deployment baru</strong> &rarr; jenis <strong>Aplikasi Web</strong>: pilih <em>Jalankan sebagai: Saya ({OWNER_GOOGLE_EMAIL})</em> dan <em>Yang memiliki akses: Siapa saja (Anyone)</em>.</li>
              <li>Salin URL Web App (berakhiran <code>/exec</code>), tempel di bawah untuk uji koneksi, dan masukkan juga ke Environment Variable <code>APPS_SCRIPT_WEBHOOK_URL</code> di Vercel/Secrets agar aktif untuk seluruh pengguna.</li>
            </ol>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSaveBridgeUrl(bridgeUrlInput);
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <input
                type="url"
                value={bridgeUrlInput}
                onChange={(e) => setBridgeUrlInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-1 min-h-[44px] px-3 py-2 text-sm font-mono-tabular st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
              />
              <button
                type="submit"
                disabled={isSyncing || !bridgeUrlInput.trim()}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                Simpan &amp; Uji Bridge
              </button>
              {localBridgeUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setBridgeUrlInput('');
                    onClearLocalBridgeUrl();
                  }}
                  className="min-h-[44px] px-3 py-2 text-xs font-medium st-text-secondary st-surface border rounded-lg hover:opacity-90 whitespace-nowrap shrink-0"
                >
                  Hapus URL Lokal
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* CONNECTION GATE */}
      {!canViewTrackingData ? (
        <div className={`st-surface border rounded-xl text-center ${isMobileLayout ? 'p-5' : 'p-8'}`}>
          <FileSpreadsheet className="w-10 h-10 text-[#0B5D3B] dark:text-emerald-400 mx-auto mb-3" />
          <h2 className="text-base font-semibold st-text-primary">
            Database Tracking Terpusat ke Akun Pemilik
          </h2>
          <p className="text-sm st-text-secondary mt-1.5 max-w-xl mx-auto mb-5">
            Masuk sebagai Admin (
            <span className="font-mono-tabular font-semibold st-text-primary">
              {OWNER_GOOGLE_EMAIL}
            </span>
            ) untuk menyiapkan spreadsheet utama dan mengaktifkan Jembatan Apps Script agar semua operator dapat menyimpan Surat Tugas langsung ke spreadsheet pemilik.
          </p>
          <div className="flex justify-center">
            <GoogleSignInButton
              onClick={onGoogleLogin}
              disabled={isConnecting}
              label={isConnecting ? 'Menghubungkan...' : 'Masuk Admin (Google)'}
            />
          </div>
        </div>
      ) : !spreadsheet ? (
        <div className={`st-surface border rounded-xl ${isMobileLayout ? 'p-5' : 'p-8'}`}>
          <div className="max-w-xl mx-auto text-center space-y-4">
            <FileSpreadsheet className="w-10 h-10 text-[#0B5D3B] dark:text-emerald-400 mx-auto" />
            <div>
              <h2 className="text-base font-semibold st-text-primary">
                {isAdminMode
                  ? 'Siapkan Spreadsheet Tracking Surat Tugas Pemilik'
                  : 'Spreadsheet Tracking Belum Disiapkan Admin'}
              </h2>
              <p className="text-sm st-text-secondary mt-1">
                {isAdminMode ? (
                  <>
                    Buat atau temukan otomatis spreadsheet{' '}
                    <span className="font-medium st-text-primary">
                      Database Tracking Surat Tugas - Kemenag Jember
                    </span>{' '}
                    di Google Drive akun {OWNER_GOOGLE_EMAIL}, atau tautkan URL Spreadsheet yang sudah ada.
                  </>
                ) : (
                  'Pengaturan spreadsheet utama hanya tersedia dalam Mode Admin.'
                )}
              </p>
            </div>

            {isAdminMode && (
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={onAutoSetupSpreadsheet}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {isSyncing
                    ? 'Menyiapkan...'
                    : 'Buat / Hubungkan Spreadsheet Pemilik'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLinkInput((v) => !v)}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium st-text-secondary st-surface border rounded-lg hover:opacity-90 transition-colors whitespace-nowrap shrink-0"
                >
                  <Link2 className="w-4 h-4" />
                  Tautkan URL / ID Spreadsheet
                </button>
              </div>
            )}

            {isAdminMode && showLinkInput && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!customUrlInput.trim()) return;
                  onConnectSpreadsheetId(customUrlInput);
                  setCustomUrlInput('');
                  setShowLinkInput(false);
                }}
                className="flex flex-col sm:flex-row gap-2 pt-3 max-w-lg mx-auto"
              >
                <input
                  type="text"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  placeholder="Tempel URL atau ID Google Spreadsheet..."
                  className="flex-1 min-h-[44px] px-3 py-2 text-sm st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
                <button
                  type="submit"
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] whitespace-nowrap shrink-0"
                >
                  Hubungkan
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* SPREADSHEET SUMMARY BAR */}
          <div className="st-surface border rounded-xl p-4 space-y-3">
            <div
              className={`flex justify-between gap-3 ${
                isMobileLayout ? 'flex-col items-stretch' : 'flex-col lg:flex-row lg:items-center'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[#0B5D3B] dark:text-emerald-400 shrink-0" />
                  <span className="text-sm font-semibold st-text-primary truncate">
                    {spreadsheet.title}
                  </span>
                </div>
                <div className="text-xs st-text-muted mt-0.5 font-mono-tabular truncate">
                  Pemilik: {OWNER_GOOGLE_EMAIL} · {spreadsheet.sheets.length} sheet tahunan
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isAdminMode && spreadsheet.spreadsheetUrl && (
                  <a
                    href={spreadsheet.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#0B5D3B] dark:text-emerald-300 bg-emerald-50 night:bg-emerald-900/15 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Buka Google Sheets
                  </a>
                )}
                {isAdminMode && (
                  <button
                    type="button"
                    onClick={() => setShowLinkInput((v) => !v)}
                    className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium st-text-secondary st-surface border rounded-lg hover:opacity-90 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Ganti Spreadsheet
                  </button>
                )}
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={onRefreshRows}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium st-text-secondary st-surface border rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  Muat Ulang
                </button>
              </div>
            </div>

            {isAdminMode && showLinkInput && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!customUrlInput.trim()) return;
                  onConnectSpreadsheetId(customUrlInput);
                  setCustomUrlInput('');
                  setShowLinkInput(false);
                }}
                className="flex flex-col sm:flex-row gap-2 pt-2 border-t st-border"
              >
                <input
                  type="text"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  placeholder="Tempel URL atau ID Google Spreadsheet tujuan milik pemilik..."
                  className="flex-1 min-h-[44px] px-3 py-2 text-sm st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
                <button
                  type="submit"
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] whitespace-nowrap shrink-0"
                >
                  Terapkan Spreadsheet
                </button>
              </form>
            )}

            {/* YEAR SHEETS BAR */}
            <div className="pt-2 border-t st-border flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium st-text-muted mr-1">
                  Sheet Tahun:
                </span>
                {sortedSheets.map((tab) => (
                  <button
                    key={tab.sheetId}
                    type="button"
                    onClick={() => onSelectYear(tab.title)}
                    className={`min-h-[40px] px-3 py-1.5 text-xs font-mono-tabular font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      selectedYear === tab.title
                        ? 'bg-[#0B5D3B] text-white'
                        : 'st-surface-muted st-text-secondary hover:opacity-90'
                    }`}
                  >
                    {tab.title}
                  </button>
                ))}
                {isAdminMode && (
                  <button
                    type="button"
                    onClick={() => setShowNewYearForm((v) => !v)}
                    className="min-h-[40px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#0B5D3B] dark:text-emerald-300 bg-emerald-50 night:bg-emerald-900/15 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Buat Sheet Tahun Baru
                  </button>
                )}
              </div>
              <span className="text-[11px] st-text-muted">
                Sheet baru otomatis dibuat saat menyimpan Surat Tugas di tahun berikutnya.
              </span>
            </div>

            {isAdminMode && showNewYearForm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const cleanYear = newYearInput.trim();
                  if (!/^\d{4}$/.test(cleanYear)) return;
                  onCreateYearSheet(cleanYear);
                  setShowNewYearForm(false);
                }}
                className="flex flex-wrap items-center gap-2 pt-2 border-t st-border"
              >
                <label className="text-xs font-medium st-text-secondary">
                  Tahun Sheet:
                </label>
                <input
                  type="text"
                  pattern="\d{4}"
                  maxLength={4}
                  value={newYearInput}
                  onChange={(e) => setNewYearInput(e.target.value)}
                  placeholder="2027"
                  className="w-24 min-h-[44px] px-2.5 py-1.5 text-sm font-mono-tabular st-input border rounded-md focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="min-h-[44px] px-3 py-1.5 text-xs font-semibold text-white bg-[#0B5D3B] rounded-md hover:bg-[#09492E] disabled:opacity-50"
                >
                  Buat Sheet {newYearInput}
                </button>
              </form>
            )}
          </div>

          {/* DATA TABLE */}
          <div className="st-surface border rounded-xl overflow-hidden">
            <div className="px-3.5 sm:px-4 py-3 border-b st-border st-surface-muted space-y-2">
              <div
                className={`flex justify-between gap-3 ${
                  isMobileLayout
                    ? 'flex-col items-stretch'
                    : 'flex-col sm:flex-row sm:items-center'
                }`}
              >
                <div className={`relative flex-1 ${isMobileLayout ? '' : 'max-w-md'}`}>
                  <Search className="w-4 h-4 st-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cari kegiatan, ID surat, nama/NIP pegawai, lokasi, atau nomor dasar..."
                    className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs st-text-muted font-mono-tabular">
                  <span>
                    Sheet {selectedYear}: {rows.length} di Sheets
                    {selectedYear === '2026' && unsyncedMigrasiRows.length > 0
                      ? ` · ${unsyncedMigrasiRows.length} migrasi lokal belum disinkron`
                      : ''}
                  </span>
                </div>
              </div>

              {selectedYear === '2026' && unsyncedMigrasiRows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <label className="inline-flex items-center gap-2 cursor-pointer st-text-secondary">
                    <input
                      type="checkbox"
                      checked={includeUnsyncedMigrasi || query.trim().length > 0}
                      disabled={query.trim().length > 0}
                      onChange={(e) => setIncludeUnsyncedMigrasi(e.target.checked)}
                      className="rounded border-slate-300 text-[#0B5D3B] focus:ring-[#0B5D3B]"
                    />
                    <span>
                      Sertakan {unsyncedMigrasiRows.length} data awal ST 2026 lokal dalam daftar/pencarian Tracking Sheets
                    </span>
                  </label>
                  <span className="st-text-muted font-mono-tabular">
                    Menampilkan {visibleRows.length}/{filteredRows.length} baris
                  </span>
                </div>
              )}
            </div>

            {isSyncing && rows.length === 0 ? (
              <div className="py-12 text-center text-sm st-text-muted">
                Memuat data dari Google Sheets ({selectedYear})...
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-12 px-6 text-center">
                <p className="text-sm font-medium st-text-primary">
                  Belum ada data Surat Tugas di Sheet {selectedYear}
                </p>
                <p className="text-xs st-text-muted mt-1">
                  Setiap Surat Tugas yang dicetak atau diunduh di Editor Surat akan tercatat wajib di sheet tahun {selectedYear}.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left border-collapse">
                    <thead>
                      <tr className="border-b st-border text-xs font-semibold st-text-secondary st-surface-muted">
                        <th className="py-2.5 px-4 w-12 text-center">No</th>
                        <th className="py-2.5 px-4">Kegiatan &amp; Dasar</th>
                        <th className="py-2.5 px-4">Pegawai Berangkat</th>
                        <th className="py-2.5 px-4">Tujuan &amp; Jadwal</th>
                        <th className="py-2.5 px-4 text-right w-40">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 night:divide-[#e4d5b3] dark:divide-slate-700/70 text-sm">
                      {visibleRows.map((row, idx) => (
                        <tr
                          key={`${row.isLocalMigrasiOnly ? 'mig' : row.rowNumber}-${row.idSurat}-${idx}`}
                          className="hover:bg-slate-50/80 night:hover:bg-[#f5ecd5] dark:hover:bg-slate-800/60 transition-colors"
                        >
                          <td className="py-3 px-4 text-center text-xs st-text-muted font-mono-tabular align-top">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 align-top max-w-md">
                            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                              <span className="text-[11px] font-mono-tabular st-text-muted">
                                {row.idSurat}
                              </span>
                              {row.isLocalMigrasiOnly && (
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded border bg-sky-50 night:bg-[#efe3c4] dark:bg-sky-950/40 text-sky-800 night:text-[#5c4b37] dark:text-sky-300 border-sky-200 night:border-[#d3c096] dark:border-sky-800">
                                  Migrasi Lokal · Belum di Sheets
                                </span>
                              )}
                            </div>
                            <div className="font-medium st-text-primary line-clamp-2">
                              {row.namaKegiatan || '-'}
                            </div>
                            <div className="text-xs st-text-muted mt-1">
                              {row.dasarAsal} ({row.dasarNomor})
                            </div>
                            <div className="text-[11px] st-text-muted mt-0.5 font-mono-tabular">
                              {row.kriteria} · {row.waktuInput}
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top text-xs st-text-secondary whitespace-pre-line max-w-xs">
                            {row.daftarPegawaiRingkas}
                          </td>
                          <td className="py-3 px-4 align-top text-xs st-text-secondary">
                            <div className="font-medium st-text-primary">
                              {row.lokasiTujuan || '-'}
                            </div>
                            <div className="font-mono-tabular st-text-muted mt-0.5">
                              {row.tanggalMulai && row.tanggalMulai !== '-'
                                ? formatTanggalIndo(row.tanggalMulai)
                                : '-'}
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top text-right">
                            {row.rawDraft ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onLoadTrackedDraft(row.rawDraft!, !isAdminMode)
                                }
                                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#0B5D3B] dark:text-emerald-300 bg-emerald-50 night:bg-emerald-900/15 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md transition-colors whitespace-nowrap shrink-0"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                                {isAdminMode ? 'Buka di Editor' : 'Salin ke Editor'}
                              </button>
                            ) : (
                              <span className="text-[11px] st-text-muted">
                                Hanya arsip tabel
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredRows.length > visibleRows.length && (
                  <div className="p-4 border-t st-border st-surface-muted flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibleRowCount((prev) => prev + TABLE_PAGE_SIZE)}
                      className="min-h-[44px] px-4 py-2 text-xs font-semibold text-[#0B5D3B] dark:text-emerald-300 st-surface border rounded-lg hover:opacity-90 transition-colors"
                    >
                      Tampilkan {Math.min(TABLE_PAGE_SIZE, filteredRows.length - visibleRows.length)} Berikutnya
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleRowCount(filteredRows.length)}
                      className="min-h-[44px] px-4 py-2 text-xs font-medium st-text-secondary st-surface border rounded-lg hover:opacity-90 transition-colors"
                    >
                      Tampilkan Semua ({filteredRows.length.toLocaleString('id-ID')})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
