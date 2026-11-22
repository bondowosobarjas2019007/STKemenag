import React, { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  Link2,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import {
  OWNER_GOOGLE_EMAIL,
  SpreadsheetSummary,
  TrackedSuratRow,
} from '../services/googleSheets';
import { SuratTugasData } from '../types/surat';
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

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.namaKegiatan.toLowerCase().includes(q) ||
        r.daftarPegawaiRingkas.toLowerCase().includes(q) ||
        r.lokasiTujuan.toLowerCase().includes(q) ||
        r.dasarAsal.toLowerCase().includes(q) ||
        r.dasarNomor.toLowerCase().includes(q) ||
        r.nomorSurat.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const sortedSheets = useMemo(() => {
    if (!spreadsheet) return [];
    return [...spreadsheet.sheets].sort((a, b) =>
      b.title.localeCompare(a.title, 'id-ID', { numeric: true })
    );
  }, [spreadsheet]);

  const canViewTrackingData = bridgeConnected || (isOwner && !needsAuth);

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
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Tracking Database Google Sheets
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Database terpusat akun pemilik (
            <span className="font-mono-tabular font-medium text-slate-800">
              {OWNER_GOOGLE_EMAIL}
            </span>
            ). Seluruh Surat Tugas wajib tercatat dan otomatis dikelompokkan per sheet tahun (
            <span className="font-mono-tabular font-medium text-slate-800">2026</span>,{' '}
            <span className="font-mono-tabular font-medium text-slate-800">2027</span>).
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {needsAuth || !googleUser ? (
            <GoogleSignInButton
              onClick={onGoogleLogin}
              disabled={isConnecting}
              label={isConnecting ? 'Menghubungkan...' : 'Masuk Pemilik (Google)'}
            />
          ) : (
            <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3.5 py-2">
              <div className="text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                  <span>{googleUser.displayName || 'Akun Google'}</span>
                  {isOwner && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded">
                      Pemilik
                    </span>
                  )}
                </div>
                <div className="text-slate-500">{googleUser.email}</div>
              </div>
              <button
                type="button"
                onClick={onGoogleLogout}
                title="Keluar dari akun Google"
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                aria-label="Keluar akun Google"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CENTRALIZED SECURITY STATUS BANNER */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-lg shrink-0 ${
              bridgeConnected || isOwner
                ? 'bg-emerald-50 text-[#0B5D3B]'
                : 'bg-amber-50 text-amber-700'
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="text-xs space-y-0.5">
            <div className="font-semibold text-slate-900">
              {bridgeConnected
                ? 'Mode Terpusat Aktif — Orang Lain Dapat Melihat & Menyimpan Hanya Lewat Aplikasi'
                : isOwner && !needsAuth
                  ? 'Terhubung sebagai Pemilik Spreadsheet (Mode Langsung)'
                  : 'Menunggu Koneksi Pemilik atau Jembatan Aplikasi'}
            </div>
            <p className="text-slate-600 leading-relaxed">
              {bridgeConnected
                ? `Seluruh pengajuan Surat Tugas otomatis disimpan ke spreadsheet milik ${OWNER_GOOGLE_EMAIL} (${
                    bridgeSource === 'server' ? 'Bridge Server Global' : 'Bridge Browser Lokal'
                  }). Orang lain tidak dapat mengedit isi spreadsheet secara langsung di luar aplikasi ini.`
                : isOwner && !needsAuth
                  ? 'Aktifkan kunci View-Only dan Jembatan Apps Script di bawah agar pengguna lain juga dapat menyimpan otomatis ke spreadsheet Anda tanpa login sebagai editor.'
                  : `Spreadsheet hanya terpusat pada akun ${OWNER_GOOGLE_EMAIL}. Pengaturan dan perubahan struktur spreadsheet dikunci khusus pemilik.`}
            </p>
          </div>
        </div>
        {isOwner && !needsAuth && (
          <button
            type="button"
            onClick={() => setShowOwnerSetup((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B5D3B] bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap shrink-0"
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

      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
          {errorMessage}
        </div>
      )}

      {/* OWNER PROTECTION & APPS SCRIPT BRIDGE PANEL */}
      {isOwner && !needsAuth && showOwnerSetup && (
        <div className="bg-white border-2 border-[#0B5D3B]/30 rounded-xl p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                1. Kunci Spreadsheet agar Orang Lain Tidak Bisa Edit di Google Sheets
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Mengatur tautan Google Sheets menjadi <strong>Hanya Lihat (Viewer)</strong> untuk orang lain dan memproteksi seluruh sheet agar hanya akun Anda (<code>{OWNER_GOOGLE_EMAIL}</code>) &amp; aplikasi yang bisa menulis data.
              </p>
            </div>
            <button
              type="button"
              disabled={!spreadsheet || isProtecting}
              onClick={onProtectSpreadsheet}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-50 whitespace-nowrap shrink-0"
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
                <h2 className="text-sm font-semibold text-slate-900">
                  2. Jembatan Aplikasi (Wajib Agar Orang Lain Bisa Simpan ke Spreadsheet Anda)
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Karena Google Drive tidak mengizinkan orang lain mengedit file Anda tanpa izin Editor, pasang skrip Apps Script berikut pada spreadsheet Anda dan deploy sebagai Web App (<strong>Execute as: Me</strong>, <strong>Who has access: Anyone</strong>).
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyAppsScript()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 whitespace-nowrap shrink-0"
              >
                {copiedScript ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#0B5D3B]" />
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

            <ol className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-1 list-decimal list-inside">
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
                className="flex-1 px-3 py-2 text-xs font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
              />
              <button
                type="submit"
                disabled={isSyncing || !bridgeUrlInput.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-50 whitespace-nowrap shrink-0"
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
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
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
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <FileSpreadsheet className="w-10 h-10 text-[#0B5D3B] mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-900">
            Database Tracking Terpusat ke Akun Pemilik
          </h2>
          <p className="text-sm text-slate-600 mt-1.5 max-w-xl mx-auto mb-5">
            Masuk dengan akun Google pemilik (
            <span className="font-mono-tabular font-semibold text-slate-800">
              {OWNER_GOOGLE_EMAIL}
            </span>
            ) untuk menyiapkan spreadsheet utama dan mengaktifkan Jembatan Apps Script agar semua pengguna dapat menyimpan Surat Tugas langsung ke spreadsheet pemilik.
          </p>
          <div className="flex justify-center">
            <GoogleSignInButton
              onClick={onGoogleLogin}
              disabled={isConnecting}
              label={isConnecting ? 'Menghubungkan...' : 'Masuk Pemilik (Google)'}
            />
          </div>
        </div>
      ) : !spreadsheet ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8">
          <div className="max-w-xl mx-auto text-center space-y-4">
            <FileSpreadsheet className="w-10 h-10 text-[#0B5D3B] mx-auto" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Siapkan Spreadsheet Tracking Surat Tugas Pemilik
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Buat atau temukan otomatis spreadsheet{' '}
                <span className="font-medium text-slate-800">
                  Database Tracking Surat Tugas - Kemenag Jember
                </span>{' '}
                di Google Drive akun {OWNER_GOOGLE_EMAIL}, atau tautkan URL Spreadsheet yang sudah ada.
              </p>
            </div>

            {isOwner && !needsAuth && (
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={onAutoSetupSpreadsheet}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {isSyncing
                    ? 'Menyiapkan...'
                    : 'Buat / Hubungkan Spreadsheet Pemilik'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLinkInput((v) => !v)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Link2 className="w-4 h-4" />
                  Tautkan URL / ID Spreadsheet
                </button>
              </div>
            )}

            {isOwner && showLinkInput && (
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
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] whitespace-nowrap shrink-0"
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
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[#0B5D3B] shrink-0" />
                  <span className="text-sm font-semibold text-slate-900 truncate">
                    {spreadsheet.title}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 font-mono-tabular truncate">
                  Pemilik: {OWNER_GOOGLE_EMAIL} · {spreadsheet.sheets.length} sheet tahunan
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {spreadsheet.spreadsheetUrl && (
                  <a
                    href={spreadsheet.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0B5D3B] bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {isOwner ? 'Buka Google Sheets' : 'Lihat Google Sheets (Read-Only)'}
                  </a>
                )}
                {isOwner && !needsAuth && (
                  <button
                    type="button"
                    onClick={() => setShowLinkInput((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Ganti Spreadsheet
                  </button>
                )}
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={onRefreshRows}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  Muat Ulang
                </button>
              </div>
            </div>

            {isOwner && showLinkInput && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!customUrlInput.trim()) return;
                  onConnectSpreadsheetId(customUrlInput);
                  setCustomUrlInput('');
                  setShowLinkInput(false);
                }}
                className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100"
              >
                <input
                  type="text"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  placeholder="Tempel URL atau ID Google Spreadsheet tujuan milik pemilik..."
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] whitespace-nowrap shrink-0"
                >
                  Terapkan Spreadsheet
                </button>
              </form>
            )}

            {/* YEAR SHEETS BAR */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500 mr-1">
                  Sheet Tahun:
                </span>
                {sortedSheets.map((tab) => (
                  <button
                    key={tab.sheetId}
                    type="button"
                    onClick={() => onSelectYear(tab.title)}
                    className={`px-3 py-1.5 text-xs font-mono-tabular font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      selectedYear === tab.title
                        ? 'bg-[#0B5D3B] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {tab.title}
                  </button>
                ))}
                {(isOwner || bridgeConnected) && (
                  <button
                    type="button"
                    onClick={() => setShowNewYearForm((v) => !v)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#0B5D3B] bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Buat Sheet Tahun Baru
                  </button>
                )}
              </div>
              <span className="text-[11px] text-slate-500">
                Sheet baru otomatis dibuat saat menyimpan Surat Tugas di tahun berikutnya.
              </span>
            </div>

            {showNewYearForm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const cleanYear = newYearInput.trim();
                  if (!/^\d{4}$/.test(cleanYear)) return;
                  onCreateYearSheet(cleanYear);
                  setShowNewYearForm(false);
                }}
                className="flex items-center gap-2 pt-2 border-t border-slate-100"
              >
                <label className="text-xs font-medium text-slate-700">
                  Tahun Sheet:
                </label>
                <input
                  type="text"
                  pattern="\d{4}"
                  maxLength={4}
                  value={newYearInput}
                  onChange={(e) => setNewYearInput(e.target.value)}
                  placeholder="2027"
                  className="w-24 px-2.5 py-1.5 text-sm font-mono-tabular border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0B5D3B] rounded-md hover:bg-[#09492E] disabled:opacity-50"
                >
                  Buat Sheet {newYearInput}
                </button>
              </form>
            )}
          </div>

          {/* DATA TABLE */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari kegiatan, nama pegawai, lokasi, atau nomor dasar..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
              </div>
              <div className="text-xs text-slate-500 font-mono-tabular">
                Sheet {selectedYear}: {filteredRows.length} data tercatat
              </div>
            </div>

            {isSyncing && rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Memuat data dari Google Sheets ({selectedYear})...
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-12 px-6 text-center">
                <p className="text-sm font-medium text-slate-900">
                  Belum ada data Surat Tugas di Sheet {selectedYear}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Setiap Surat Tugas yang dicetak atau diunduh di Editor Surat akan tercatat wajib di sheet tahun {selectedYear}.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50/50">
                      <th className="py-2.5 px-4 w-12 text-center">No</th>
                      <th className="py-2.5 px-4">Kegiatan &amp; Dasar</th>
                      <th className="py-2.5 px-4">Pegawai Berangkat</th>
                      <th className="py-2.5 px-4">Tujuan &amp; Jadwal</th>
                      <th className="py-2.5 px-4 text-right w-40">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredRows.map((row, idx) => (
                      <tr
                        key={`${row.rowNumber}-${row.idSurat}`}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-3 px-4 text-center text-xs text-slate-500 font-mono-tabular align-top">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4 align-top max-w-md">
                          <div className="font-medium text-slate-900 line-clamp-2">
                            {row.namaKegiatan || '-'}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {row.dasarAsal} ({row.dasarNomor})
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 font-mono-tabular">
                            {row.kriteria} · Diinput {row.waktuInput}
                          </div>
                        </td>
                        <td className="py-3 px-4 align-top text-xs text-slate-700 whitespace-pre-line max-w-xs">
                          {row.daftarPegawaiRingkas}
                        </td>
                        <td className="py-3 px-4 align-top text-xs text-slate-600">
                          <div className="font-medium text-slate-800">
                            {row.lokasiTujuan || '-'}
                          </div>
                          <div className="font-mono-tabular text-slate-500 mt-0.5">
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
                                onLoadTrackedDraft(row.rawDraft!, !isOwner)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0B5D3B] bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors whitespace-nowrap shrink-0"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                              {isOwner ? 'Buka di Editor' : 'Salin ke Editor'}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Hanya arsip tabel
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
