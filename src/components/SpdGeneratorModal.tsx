import React, { useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  Check,
  ChevronDown,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useViewport } from '../contexts/ViewportContext';
import {
  createInitialSpdData,
  Pegawai,
  SPD_PPK_PRESETS,
  SpdFormData,
  SpdFormatMode,
  SuratTugasData,
} from '../types/surat';
import {
  computeDaysDifference,
  formatTanggalIndo,
  terbilangHari,
} from '../utils/dateFormat';
import { exportSpdDocx, exportSpdPdf } from '../utils/exportSpd';

interface SpdGeneratorModalProps {
  isOpen: boolean;
  surat: SuratTugasData;
  onClose: () => void;
  onAutoSyncSpd?: (spd: SpdFormData) => Promise<void>;
  showToast: (msg: string) => void;
}

export const SpdGeneratorModal: React.FC<SpdGeneratorModalProps> = ({
  isOpen,
  surat,
  onClose,
  onAutoSyncSpd,
  showToast,
}) => {
  const { isMobileLayout, isForcedMobile } = useViewport();
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form');
  const [formData, setFormData] = useState<SpdFormData>(() =>
    createInitialSpdData(surat)
  );
  const [previewPegawaiIndex, setPreviewPegawaiIndex] = useState<number>(0);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportType, setExportType] = useState<'docx' | 'pdf' | null>(null);

  const printContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync state if source surat changes when modal opens
  const suratId = surat.id;
  const initialData = useMemo(() => createInitialSpdData(surat), [suratId]);

  if (!isOpen) return null;

  const handlePpkPresetChange = (presetId: 'triastono' | 'pitono' | 'manual') => {
    if (presetId === 'manual') {
      setFormData((prev) => ({
        ...prev,
        ppkMode: 'manual',
      }));
    } else {
      const preset = SPD_PPK_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        setFormData((prev) => ({
          ...prev,
          ppkMode: preset.id,
          ppkNama: preset.nama,
          ppkNip: preset.nip,
        }));
      }
    }
  };

  const handleDateChange = (field: 'tanggalBerangkat' | 'tanggalKembali', val: string) => {
    setFormData((prev) => {
      const tBerangkat = field === 'tanggalBerangkat' ? val : prev.tanggalBerangkat;
      const tKembali =
        field === 'tanggalKembali'
          ? val < tBerangkat
            ? tBerangkat
            : val
          : prev.tanggalKembali < tBerangkat
            ? tBerangkat
            : prev.tanggalKembali;
      const diffDays = computeDaysDifference(tBerangkat, tKembali);
      return {
        ...prev,
        tanggalBerangkat: tBerangkat,
        tanggalKembali: tKembali,
        lamaHari: diffDays,
      };
    });
  };

  const handleDownloadDocx = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportType('docx');
    try {
      await exportSpdDocx(formData);

      // Background auto-sync to Sheets
      if (onAutoSyncSpd) {
        void onAutoSyncSpd(formData).catch(() => {});
      }

      const totalPegawai = formData.pegawaiList.length;
      if (formData.formatMode === 'per_file' && totalPegawai > 1) {
        showToast(
          `Arsip ZIP berisi ${totalPegawai} file SPD Word (.docx) berhasil diunduh & dicatat ke Spreadsheet`
        );
      } else {
        showToast('File SPD (.docx) berhasil diunduh & dicatat ke Spreadsheet');
      }
    } catch (err) {
      console.error(err);
      showToast(
        err instanceof Error ? err.message : 'Gagal mengekspor file SPD (.docx)'
      );
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (isExporting || !printContainerRef.current) return;
    setIsExporting(true);
    setExportType('pdf');
    try {
      const leaderName =
        formData.pegawaiList[0]?.nama || 'Pegawai';
      const cleanLeader = leaderName.replace(/[^a-zA-Z0-9_\s-]/g, '').trim().replace(/\s+/g, '_');
      const suffix =
        formData.formatMode === 'gabung' && formData.pegawaiList.length > 1
          ? '_DKK'
          : formData.formatMode === 'per_file' && formData.pegawaiList.length > 1
            ? `_${formData.pegawaiList.length}_Pegawai`
            : '';
      const pdfFileName = `SPD_${cleanLeader}${suffix}_(${formData.tanggalBerangkat}).pdf`;

      await exportSpdPdf(printContainerRef.current, pdfFileName);

      // Background auto-sync to Sheets
      if (onAutoSyncSpd) {
        void onAutoSyncSpd(formData).catch(() => {});
      }

      showToast('File SPD (.pdf) berhasil diunduh & dicatat ke Spreadsheet');
    } catch (err) {
      console.error(err);
      showToast(
        err instanceof Error ? err.message : 'Gagal mengekspor file SPD (.pdf)'
      );
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  };

  const effectivePegawaiList =
    formData.pegawaiList.length > 0
      ? formData.pegawaiList
      : [{ id: '1', nama: '-', nip: '-', pangkatGolongan: '-', jabatan: '-' }];

  const previewCurrentPegawai =
    formData.formatMode === 'gabung'
      ? effectivePegawaiList[0]
      : effectivePegawaiList[previewPegawaiIndex] || effectivePegawaiList[0];

  const previewFollowers =
    formData.formatMode === 'gabung' ? effectivePegawaiList.slice(1) : [];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 no-print ${
        isMobileLayout ? 'p-0' : 'p-3 sm:p-5'
      } ${isForcedMobile ? 'max-w-[430px] mx-auto' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Generator Surat Perjalanan Dinas (SPD)"
    >
      <div
        className={`w-full st-surface overflow-hidden flex flex-col shadow-2xl ${
          isMobileLayout
            ? 'h-full rounded-none border-0'
            : 'max-w-5xl h-[92vh] border st-border rounded-2xl'
        }`}
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b st-border bg-[#0B5D3B]/5 night:bg-[#efe3c4] dark:bg-emerald-950/30 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Briefcase className="w-5 h-5 text-[#0B5D3B] dark:text-emerald-400 shrink-0" />
            <div>
              <h2 className="text-sm sm:text-base font-bold st-text-primary truncate">
                Generator Surat Perjalanan Dinas (SPD)
              </h2>
              <p className="text-[11px] st-text-muted truncate">
                Terintegrasi otomatis dari Surat Tugas · 2 Halaman Resmi (Muka + Visum Belakang)
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center st-text-muted hover:text-slate-800 dark:hover:text-slate-200 rounded-lg shrink-0 disabled:opacity-50"
            aria-label="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MOBILE VIEW SWITCHER TABS (FORM vs PRATINJAU) */}
        <div className="flex lg:hidden border-b st-border st-surface-muted p-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'form'
                ? 'st-surface text-[#0B5D3B] dark:text-emerald-400 shadow-xs'
                : 'st-text-secondary'
            }`}
          >
            <FileText className="w-4 h-4" />
            1. Atur Data SPD
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'preview'
                ? 'st-surface text-[#0B5D3B] dark:text-emerald-400 shadow-xs'
                : 'st-text-secondary'
            }`}
          >
            <Eye className="w-4 h-4" />
            2. Pratinjau Kertas A4
          </button>
        </div>

        {/* MODAL MAIN BODY (SPLIT 2 COLUMNS ON DESKTOP) */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[480px_1fr] overflow-hidden">
          {/* LEFT COLUMN: FORM CONTROLS */}
          <div
            className={`overflow-y-auto p-4 sm:p-5 space-y-4 border-r st-border ${
              activeTab === 'form' || !isMobileLayout ? 'block' : 'hidden'
            }`}
          >
            {/* 1. PILIHAN MODE FORMAT SPD */}
            <div className="p-3.5 st-surface-muted border st-border rounded-xl space-y-2">
              <label className="block text-xs font-bold st-text-primary">
                1. Mode Format Dokumen SPD
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, formatMode: 'per_file' }))
                  }
                  className={`p-2.5 text-left border rounded-lg transition-colors text-xs flex flex-col justify-between ${
                    formData.formatMode === 'per_file'
                      ? 'border-[#0B5D3B] bg-[#0B5D3B]/10 text-[#0B5D3B] dark:text-emerald-300 font-semibold shadow-xs'
                      : 'st-surface st-text-secondary border-slate-200 dark:border-slate-700 hover:opacity-90'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>SPD Per File</span>
                    {formData.formatMode === 'per_file' && (
                      <Check className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span className="text-[10.5px] font-normal opacity-85 mt-1 leading-snug">
                    1 Nama Pegawai = 1 Dokumen SPD (dikemas .zip jika &gt; 1 orang)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, formatMode: 'gabung' }))
                  }
                  className={`p-2.5 text-left border rounded-lg transition-colors text-xs flex flex-col justify-between ${
                    formData.formatMode === 'gabung'
                      ? 'border-[#0B5D3B] bg-[#0B5D3B]/10 text-[#0B5D3B] dark:text-emerald-300 font-semibold shadow-xs'
                      : 'st-surface st-text-secondary border-slate-200 dark:border-slate-700 hover:opacity-90'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>SPD Gabung (DKK)</span>
                    {formData.formatMode === 'gabung' && (
                      <Check className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span className="text-[10.5px] font-normal opacity-85 mt-1 leading-snug">
                    Pemimpin di Poin 2 + Pegawai berikutnya di Poin 8 (Pengikut)
                  </span>
                </button>
              </div>
            </div>

            {/* 2. PILIHAN PEJABAT PEMBUAT KOMITMEN (PPK) */}
            <div className="p-3.5 st-surface-muted border st-border rounded-xl space-y-2.5">
              <label className="block text-xs font-bold st-text-primary">
                2. Pejabat Pembuat Komitmen (PPK)
              </label>
              <div className="space-y-1.5">
                {SPD_PPK_PRESETS.map((preset) => (
                  <label
                    key={preset.id}
                    className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                      formData.ppkMode === preset.id
                        ? 'border-[#0B5D3B] bg-[#0B5D3B]/5 dark:bg-emerald-950/40 text-[#0B5D3B] dark:text-emerald-300 font-semibold'
                        : 'st-surface st-text-secondary border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ppk-mode"
                      checked={formData.ppkMode === preset.id}
                      onChange={() => handlePpkPresetChange(preset.id)}
                      className="mt-0.5 text-[#0B5D3B] focus:ring-[#0B5D3B]"
                    />
                    <div className="min-w-0">
                      <div>{preset.nama}</div>
                      <div className="text-[10.5px] font-normal opacity-80 font-mono-tabular">
                        NIP. {preset.nip} · {preset.keterangan}
                      </div>
                    </div>
                  </label>
                ))}

                <label
                  className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                    formData.ppkMode === 'manual'
                      ? 'border-[#0B5D3B] bg-[#0B5D3B]/5 dark:bg-emerald-950/40 text-[#0B5D3B] dark:text-emerald-300 font-semibold'
                      : 'st-surface st-text-secondary border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="ppk-mode"
                    checked={formData.ppkMode === 'manual'}
                    onChange={() => handlePpkPresetChange('manual')}
                    className="mt-0.5 text-[#0B5D3B] focus:ring-[#0B5D3B]"
                  />
                  <span>Isi Manual Nama PPK Lainnya...</span>
                </label>
              </div>

              {formData.ppkMode === 'manual' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t st-border">
                  <div>
                    <label className="block text-[11px] font-medium st-text-secondary mb-1">
                      Nama Lengkap PPK &amp; Gelar
                    </label>
                    <input
                      type="text"
                      value={formData.ppkNama}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          ppkNama: e.target.value,
                        }))
                      }
                      placeholder="Contoh: Drs. H. Ahmad Fauzi, M.Pd.I"
                      className="w-full px-2.5 py-1.5 text-xs st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium st-text-secondary mb-1">
                      NIP PPK (Opsional)
                    </label>
                    <input
                      type="text"
                      value={formData.ppkNip}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          ppkNip: e.target.value,
                        }))
                      }
                      placeholder="197205121998031002"
                      className="w-full px-2.5 py-1.5 text-xs font-mono-tabular st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. RINCIAN NOMOR, TUJUAN & KELENGKAPAN SPD */}
            <div className="space-y-3 pt-1">
              <h3 className="text-xs font-bold st-text-primary">
                3. Rincian Isian Surat Perjalanan Dinas
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium st-text-secondary mb-1">
                    Nomor SPD
                  </label>
                  <input
                    type="text"
                    value={formData.nomorSpd}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        nomorSpd: e.target.value,
                      }))
                    }
                    placeholder="/Kk.13.32.04/SPD/02/2026"
                    className="w-full px-2.5 py-1.5 text-xs font-mono-tabular st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium st-text-secondary mb-1">
                    Tingkat Biaya
                  </label>
                  <input
                    type="text"
                    value={formData.tingkatBiaya}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        tingkatBiaya: e.target.value,
                      }))
                    }
                    placeholder="Tingkat C"
                    className="w-full px-2.5 py-1.5 text-xs st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium st-text-secondary mb-1">
                  Maksud Perjalanan Dinas (Poin 4)
                </label>
                <textarea
                  rows={2}
                  value={formData.maksudPerjalanan}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      maksudPerjalanan: e.target.value,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium st-text-secondary mb-1">
                    Tempat Berangkat (Poin 6a)
                  </label>
                  <input
                    type="text"
                    value={formData.tempatBerangkat}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        tempatBerangkat: e.target.value,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium st-text-secondary mb-1">
                    Alat Angkutan (Poin 5)
                  </label>
                  <input
                    type="text"
                    value={formData.alatAngkutan}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        alatAngkutan: e.target.value,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium st-text-secondary mb-1">
                    Kota Tujuan (Poin 6b Muka)
                  </label>
                  <input
                    type="text"
                    value={formData.kotaTujuan}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        kotaTujuan: e.target.value,
                      }))
                    }
                    placeholder="Contoh: di Probolinggo"
                    className="w-full px-2.5 py-1.5 text-xs st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium st-text-secondary mb-1">
                    Tujuan Lengkap (Blok I Belakang)
                  </label>
                  <input
                    type="text"
                    value={formData.tujuanLengkap}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        tujuanLengkap: e.target.value,
                      }))
                    }
                    placeholder="Contoh: di Kantor Kementerian Agama Kabupaten Probolinggo"
                    className="w-full px-2.5 py-1.5 text-xs st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium st-text-secondary mb-1">
                    Tanggal Berangkat
                  </label>
                  <input
                    type="date"
                    value={formData.tanggalBerangkat}
                    onChange={(e) =>
                      handleDateChange('tanggalBerangkat', e.target.value)
                    }
                    className="w-full px-2 py-1.5 text-xs font-mono-tabular st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium st-text-secondary mb-1">
                    Tanggal Kembali
                  </label>
                  <input
                    type="date"
                    min={formData.tanggalBerangkat}
                    value={formData.tanggalKembali}
                    onChange={(e) =>
                      handleDateChange('tanggalKembali', e.target.value)
                    }
                    className="w-full px-2 py-1.5 text-xs font-mono-tabular st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium st-text-secondary mb-1">
                    Lama Hari (Poin 7a)
                  </label>
                  <div className="px-2 py-1.5 text-xs font-medium st-surface-muted border st-border rounded-lg">
                    {terbilangHari(formData.lamaHari)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium st-text-secondary mb-1">
                    Pembebanan Instansi (Poin 9a)
                  </label>
                  <input
                    type="text"
                    value={formData.pembebananAnggaranInstansi}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        pembebananAnggaranInstansi: e.target.value,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium st-text-secondary mb-1">
                    Pembebanan Akun / MAK (Poin 9b)
                  </label>
                  <input
                    type="text"
                    value={formData.pembebananAnggaranAkun}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        pembebananAnggaranAkun: e.target.value,
                      }))
                    }
                    placeholder="Contoh: b. 524111"
                    className="w-full px-2.5 py-1.5 text-xs st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: LIVE INTERACTIVE PREVIEW */}
          <div
            className={`flex-1 flex flex-col min-h-0 st-desk overflow-hidden ${
              activeTab === 'preview' || !isMobileLayout ? 'flex' : 'hidden'
            }`}
          >
            {/* PREVIEW TOOLBAR */}
            <div className="px-4 py-2.5 border-b st-border st-surface flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold st-text-primary">
                  Pratinjau SPD 2 Halaman
                </span>
                {formData.formatMode === 'per_file' &&
                  effectivePegawaiList.length > 1 && (
                    <div className="flex items-center gap-1 text-xs">
                      <span className="st-text-muted">· Pratinjau Pegawai:</span>
                      <select
                        value={previewPegawaiIndex}
                        onChange={(e) =>
                          setPreviewPegawaiIndex(Number(e.target.value))
                        }
                        className="px-2 py-0.5 text-xs st-input border rounded"
                      >
                        {effectivePegawaiList.map((p, idx) => (
                          <option key={p.id || idx} value={idx}>
                            {idx + 1}. {p.nama}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
              </div>
              <div className="text-[11px] st-text-muted font-mono-tabular">
                {formData.formatMode === 'gabung'
                  ? `Mode Gabung: 1 Pemimpin + ${previewFollowers.length} Pengikut`
                  : `Mode Per File: ${effectivePegawaiList.length} Lembar Terpisah`}
              </div>
            </div>

            {/* PREVIEW CANVAS */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center">
              <div
                ref={printContainerRef}
                id="spd-print-container"
                className="w-full max-w-[794px] space-y-6"
              >
                {/* RENDER ALL PAGES FOR PDF EXPORT */}
                {(formData.formatMode === 'per_file' && isExporting
                  ? effectivePegawaiList
                  : [previewCurrentPegawai]
                ).map((pegawaiTarget, pIdx) => {
                  const followers =
                    formData.formatMode === 'gabung' ? previewFollowers : [];
                  return (
                    <React.Fragment key={pegawaiTarget.id || pIdx}>
                      {/* ========================================================= */}
                      {/* HALAMAN 1 (MUKA): SURAT PERJALANAN DINAS (SPD)            */}
                      {/* ========================================================= */}
                      <div className="spd-page-a4 bg-white text-black p-8 sm:p-10 shadow-lg border border-slate-300 text-[10pt] leading-[1.35] font-sans min-h-[1050px] flex flex-col justify-between">
                        <div>
                          {/* TOP HEADER */}
                          <div className="grid grid-cols-[1.4fr_1fr] gap-4 pb-3">
                            <div>
                              <div className="text-[9pt] font-bold tracking-tight">
                                KEMENTERIAN NEGARA / LEMBAGA :
                              </div>
                              <div className="text-[9.5pt] font-bold tracking-tight">
                                KANTOR KEMENTERIAN AGAMA KABUPATEN JEMBER
                              </div>
                            </div>
                            <table className="w-full text-[9pt]">
                              <tbody>
                                <tr>
                                  <td className="w-20">Lembar Ke</td>
                                  <td className="w-3 text-center">:</td>
                                  <td>-</td>
                                </tr>
                                <tr>
                                  <td>Kode No</td>
                                  <td className="text-center">:</td>
                                  <td>-</td>
                                </tr>
                                <tr>
                                  <td>Nomor</td>
                                  <td className="text-center">:</td>
                                  <td className="font-semibold font-mono-tabular">
                                    {formData.nomorSpd || '-'}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* JUDUL */}
                          <div className="text-center font-bold text-[12pt] mt-3 mb-4 tracking-wide border-t border-black pt-2">
                            SURAT PERJALANAN DINAS (SPD)
                          </div>

                          {/* TABEL 10 POIN */}
                          <table className="w-full border-collapse border border-black text-[9.5pt]">
                            <tbody>
                              <tr>
                                <td className="border border-black px-2 py-1 w-7 text-center align-top">
                                  1
                                </td>
                                <td className="border border-black px-2.5 py-1 w-64 align-top">
                                  Pejabat Pembuat Komitmen
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  {formData.ppkNama || '-'}
                                </td>
                              </tr>
                              <tr>
                                <td className="border border-black px-2 py-1 text-center align-top">
                                  2
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  Nama / NIP Pegawai yang melaksanakan perjalanan dinas
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  <div className="font-bold">
                                    {pegawaiTarget.nama || '-'}
                                  </div>
                                  <div className="font-mono-tabular text-[9pt]">
                                    NIP. {pegawaiTarget.nip || '-'}
                                  </div>
                                </td>
                              </tr>
                              <tr>
                                <td className="border border-black px-2 py-1 text-center align-top">
                                  3
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  <div>a. Pangkat dan Golongan</div>
                                  <div>b. Jabatan / Instansi</div>
                                  <div>c. Tingkat Biaya Perjalanan Dinas</div>
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  <div>a. {pegawaiTarget.pangkatGolongan || '-'}</div>
                                  <div>b. {pegawaiTarget.jabatan || '-'}</div>
                                  <div>c. {formData.tingkatBiaya || 'Tingkat C'}</div>
                                </td>
                              </tr>
                              <tr>
                                <td className="border border-black px-2 py-1 text-center align-top">
                                  4
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  Maksud Perjalanan Dinas
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top text-justify">
                                  {formData.maksudPerjalanan || '-'}
                                </td>
                              </tr>
                              <tr>
                                <td className="border border-black px-2 py-1 text-center align-top">
                                  5
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  Alat angkut yang dipergunakan
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  {formData.alatAngkutan || 'Kendaraan Umum / Darat'}
                                </td>
                              </tr>
                              <tr>
                                <td className="border border-black px-2 py-1 text-center align-top">
                                  6
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  <div>a. Tempat berangkat</div>
                                  <div>b. Tempat tujuan</div>
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  <div>a. {formData.tempatBerangkat || 'JEMBER'}</div>
                                  <div>b. {formData.kotaTujuan || '-'}</div>
                                </td>
                              </tr>
                              <tr>
                                <td className="border border-black px-2 py-1 text-center align-top">
                                  7
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  <div>a. Lamanya Perjalanan Dinas</div>
                                  <div>b. Tanggal berangkat</div>
                                  <div>c. Tanggal harus kembali/tiba di tempat baru *)</div>
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  <div>a. {terbilangHari(formData.lamaHari)}</div>
                                  <div>b. {formatTanggalIndo(formData.tanggalBerangkat)}</div>
                                  <div>c. {formatTanggalIndo(formData.tanggalKembali)}</div>
                                </td>
                              </tr>
                              <tr>
                                <td className="border border-black px-2 py-1 text-center align-top">
                                  8
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  Pengikut : Nama
                                </td>
                                <td className="border border-black px-1 py-1 align-top">
                                  <table className="w-full border-collapse border border-black text-[8.5pt]">
                                    <thead>
                                      <tr>
                                        <th className="border border-black px-1 py-0.5 text-center w-6">
                                          No
                                        </th>
                                        <th className="border border-black px-1 py-0.5 text-center">
                                          Nama
                                        </th>
                                        <th className="border border-black px-1 py-0.5 text-center w-24">
                                          Tanggal Lahir
                                        </th>
                                        <th className="border border-black px-1 py-0.5 text-center w-24">
                                          Keterangan
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {followers.length > 0 ? (
                                        followers.map((f, i) => (
                                          <tr key={f.id || i}>
                                            <td className="border border-black px-1 py-0.5 text-center">
                                              {i + 1}
                                            </td>
                                            <td className="border border-black px-1 py-0.5">
                                              <div className="font-semibold">{f.nama}</div>
                                              <div className="text-[8pt] text-slate-600">/{f.nip}</div>
                                            </td>
                                            <td className="border border-black px-1 py-0.5 text-center">-</td>
                                            <td className="border border-black px-1 py-0.5 text-center">-</td>
                                          </tr>
                                        ))
                                      ) : (
                                        [1, 2, 3].map((num) => (
                                          <tr key={num}>
                                            <td className="border border-black px-1 py-0.5 text-center">
                                              {num}
                                            </td>
                                            <td className="border border-black px-1 py-0.5 text-center">-</td>
                                            <td className="border border-black px-1 py-0.5 text-center">-</td>
                                            <td className="border border-black px-1 py-0.5 text-center">-</td>
                                          </tr>
                                        ))
                                      )}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                              <tr>
                                <td className="border border-black px-2 py-1 text-center align-top">
                                  9
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  <div>Pembebanan Anggaran</div>
                                  <div>a. Instansi</div>
                                  <div>b. Akun</div>
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  <div className="h-4" />
                                  <div>{formData.pembebananAnggaranInstansi}</div>
                                  <div>{formData.pembebananAnggaranAkun}</div>
                                </td>
                              </tr>
                              <tr>
                                <td className="border border-black px-2 py-1 text-center align-top">
                                  10
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  Keterangan lain-lain
                                </td>
                                <td className="border border-black px-2.5 py-1 align-top">
                                  {formData.keteranganLain || '-'}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* TTD KANAN BAWAH */}
                        <div className="ml-[54%] mt-4 text-left text-[9.5pt] leading-[1.35]">
                          <div>Dikeluarkan di : {formData.tempatDikeluarkan || 'Jember'}</div>
                          <div>Pada tanggal   : {formatTanggalIndo(formData.tanggalSpd)}</div>
                          <div className="font-bold mt-1">Pejabat Pembuat Komitmen,</div>
                          <div className="min-h-[64px]" />
                          <div className="font-bold underline">{formData.ppkNama}</div>
                          {formData.ppkNip && (
                            <div className="font-mono-tabular">NIP. {formData.ppkNip}</div>
                          )}
                        </div>
                      </div>

                      {/* ========================================================= */}
                      {/* HALAMAN 2 (VISUM BELAKANG): LEMBAR PENGESAHAN RESMI       */}
                      {/* ========================================================= */}
                      <div className="spd-page-a4 bg-white text-black p-8 sm:p-10 shadow-lg border border-slate-300 text-[9.5pt] leading-[1.3] font-sans min-h-[1050px]">
                        <div className="text-center font-bold text-[11pt] mb-3">
                          VISUM / LEMBAR PENGESAHAN PERJALANAN DINAS
                        </div>

                        <table className="w-full border-collapse border border-black text-[9pt]">
                          <tbody>
                            {/* BLOK I */}
                            <tr>
                              <td className="border border-black p-2.5 w-1/2 align-top text-center text-slate-400">
                                -
                              </td>
                              <td className="border border-black p-2.5 w-1/2 align-top space-y-0.5">
                                <div>I. Berangkat dari : Jember</div>
                                <div className="text-[8.5pt] text-slate-700">(Tempat Kedudukan)</div>
                                <div>Ke : {formData.tujuanLengkap || formData.kotaTujuan}</div>
                                <div>Pada Tanggal : {formatTanggalIndo(formData.tanggalBerangkat)}</div>
                                <div className="font-bold pt-1">
                                  Kepala Kantor Kementerian Agama Kabupaten Jember
                                </div>
                                <div className="h-12" />
                                <div className="font-bold underline">
                                  {formData.namaKepalaKantor || 'Dr. SANTOSO, S.Ag, M.Pd.'}
                                </div>
                                <div className="font-mono-tabular text-[8.5pt]">
                                  NIP. {formData.nipKepalaKantor || '197008101998031002'}
                                </div>
                              </td>
                            </tr>

                            {/* BLOK II */}
                            <tr>
                              <td className="border border-black p-2.5 align-top space-y-0.5">
                                <div>II. Tiba di : {formData.kotaTujuan}</div>
                                <div>Pada Tanggal : {formatTanggalIndo(formData.tanggalBerangkat)}</div>
                                <div>Kepala :</div>
                                <div className="h-10" />
                                <div>(............................................................)</div>
                                <div>NIP. </div>
                              </td>
                              <td className="border border-black p-2.5 align-top space-y-0.5">
                                <div>Berangkat dari : {formData.kotaTujuan}</div>
                                <div>Ke : Jember</div>
                                <div>Pada Tanggal : {formatTanggalIndo(formData.tanggalKembali)}</div>
                                <div>Kepala :</div>
                                <div className="h-10" />
                                <div>(............................................................)</div>
                                <div>NIP. </div>
                              </td>
                            </tr>

                            {/* BLOK III */}
                            <tr>
                              <td className="border border-black p-2.5 align-top space-y-0.5">
                                <div>III. Tiba di : </div>
                                <div>Pada Tanggal : </div>
                                <div>Kepala :</div>
                                <div className="h-9" />
                                <div>(............................................................)</div>
                                <div>NIP. </div>
                              </td>
                              <td className="border border-black p-2.5 align-top space-y-0.5">
                                <div>Berangkat dari : </div>
                                <div>Ke : </div>
                                <div>Pada Tanggal : </div>
                                <div>Kepala :</div>
                                <div className="h-9" />
                                <div>(............................................................)</div>
                                <div>NIP. </div>
                              </td>
                            </tr>

                            {/* BLOK IV */}
                            <tr>
                              <td className="border border-black p-2.5 align-top space-y-0.5">
                                <div>IV. Tiba di : </div>
                                <div>Pada Tanggal : </div>
                                <div>Kepala :</div>
                                <div className="h-9" />
                                <div>(............................................................)</div>
                                <div>NIP. </div>
                              </td>
                              <td className="border border-black p-2.5 align-top space-y-0.5">
                                <div>Berangkat dari : </div>
                                <div>Ke : </div>
                                <div>Pada Tanggal : </div>
                                <div>Kepala :</div>
                                <div className="h-9" />
                                <div>(............................................................)</div>
                                <div>NIP. </div>
                              </td>
                            </tr>

                            {/* BLOK V */}
                            <tr>
                              <td className="border border-black p-2.5 align-top space-y-0.5">
                                <div>V. Tiba di : </div>
                                <div>Pada Tanggal : </div>
                                <div>Kepala :</div>
                                <div className="h-9" />
                                <div>(............................................................)</div>
                                <div>NIP. </div>
                              </td>
                              <td className="border border-black p-2.5 align-top space-y-0.5">
                                <div>Berangkat dari : </div>
                                <div>Ke : </div>
                                <div>Pada Tanggal : </div>
                                <div>Kepala :</div>
                                <div className="h-9" />
                                <div>(............................................................)</div>
                                <div>NIP. </div>
                              </td>
                            </tr>

                            {/* BLOK VI (TTD PPK KIRI & KANAN) */}
                            <tr>
                              <td className="border border-black p-2.5 align-top space-y-0.5">
                                <div>VI. Tiba kembali di : Jember</div>
                                <div className="text-[8.5pt] text-slate-700">(Tempat Kedudukan)</div>
                                <div>Pada Tanggal : {formatTanggalIndo(formData.tanggalKembali)}</div>
                                <div className="font-bold pt-1">Pejabat Pembuat Komitmen,</div>
                                <div className="h-11" />
                                <div className="font-bold underline">{formData.ppkNama}</div>
                                {formData.ppkNip && (
                                  <div className="font-mono-tabular text-[8.5pt]">
                                    NIP. {formData.ppkNip}
                                  </div>
                                )}
                              </td>
                              <td className="border border-black p-2.5 align-top space-y-0.5">
                                <div className="text-[8.5pt] italic text-justify leading-tight">
                                  Telah diperiksa, dengan keterangan bahwa perjalanan tersebut diatas benar dilakukan atas perintahnya dan semata-mata untuk kepentingan jabatan dalam waktu yang sesingkat-singkatnya.
                                </div>
                                <div className="font-bold pt-1">Pejabat Pembuat Komitmen,</div>
                                <div className="h-10" />
                                <div className="font-bold underline">{formData.ppkNama}</div>
                                {formData.ppkNip && (
                                  <div className="font-mono-tabular text-[8.5pt]">
                                    NIP. {formData.ppkNip}
                                  </div>
                                )}
                              </td>
                            </tr>

                            {/* BLOK VII */}
                            <tr>
                              <td colSpan={2} className="border border-black p-2 align-top">
                                <div className="font-bold">VII. Catatan Lain-lain :</div>
                                <div className="text-slate-500">-</div>
                              </td>
                            </tr>

                            {/* BLOK VIII */}
                            <tr>
                              <td colSpan={2} className="border border-black p-2.5 align-top space-y-0.5">
                                <div className="font-bold">VIII. PERHATIAN :</div>
                                <div className="text-[8pt] text-justify leading-tight">
                                  PPK yang menerbitkan SPD, pegawai yang melakukan perjalanan dinas, para pejabat yang mengesahkan tanggal berangkat/tiba, serta bendaharawan bertanggung jawab berdasarkan peraturan-peraturan Keuangan Negara apabila Negara mendapat rugi karena kesalahan, kealpaan atau kealpaan.
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER ACTION BAR */}
        <div className="px-4 sm:px-6 py-3.5 border-t st-border st-surface-muted flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 text-xs st-text-muted">
            <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>
              {formData.formatMode === 'gabung'
                ? `1 Dokumen Gabung · ${effectivePegawaiList.length} Pegawai`
                : `${effectivePegawaiList.length} Dokumen Terpisah (.zip)`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isExporting}
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 text-xs font-medium st-text-secondary st-surface border st-border rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              Tutup
            </button>

            <button
              type="button"
              disabled={isExporting}
              onClick={handleDownloadDocx}
              className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-60 transition-colors shadow-xs"
            >
              {isExporting && exportType === 'docx' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Membuat Word...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Unduh Word (.docx)</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isExporting}
              onClick={handleDownloadPdf}
              className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] hover:bg-[#09492E] rounded-lg disabled:opacity-60 transition-colors shadow-xs"
            >
              {isExporting && exportType === 'pdf' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyiapkan PDF...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  <span>Unduh PDF (.pdf)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
