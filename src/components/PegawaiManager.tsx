import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { PANGKAT_GOLONGAN_PRESETS, Pegawai } from '../types/surat';
import { parseDukPdfBuffer, ParseDukPdfResult } from '../utils/parseDukPdf';

export type DukImportMode = 'replace_duk' | 'merge';

interface PegawaiManagerProps {
  directory: Pegawai[];
  onAddPegawai: (pegawai: Omit<Pegawai, 'id'>) => void;
  onUpdatePegawai: (pegawai: Pegawai) => void;
  onDeletePegawai: (id: string) => void;
  onBulkUpdateDirectory: (newList: Pegawai[], mode: DukImportMode, fileName: string) => void;
  onUsePegawaiInSurat: (pegawai: Pegawai) => void;
}

const PAGE_SIZE = 50;

const EMPTY_FORM: Omit<Pegawai, 'id'> = {
  nama: '',
  nip: '',
  pangkatGolongan: 'Penata Tk.I (III/d)',
  jabatan: '',
};

type UnitFilter = 'semua' | 'kantor' | 'kua' | 'madrasah';

interface PendingDukImport {
  fileName: string;
  result: ParseDukPdfResult;
  newNipCount: number;
  updatedNipCount: number;
}

export const PegawaiManager: React.FC<PegawaiManagerProps> = ({
  directory,
  onAddPegawai,
  onUpdatePegawai,
  onDeletePegawai,
  onBulkUpdateDirectory,
  onUsePegawaiInSurat,
}) => {
  const [query, setQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState<UnitFilter>('semua');
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Pegawai, 'id'>>(EMPTY_FORM);

  // DUK PDF Upload & Parse states
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [parseProgress, setParseProgress] = useState<{
    fileName: string;
    done: number;
    total: number;
  } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingDukImport | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return directory.filter((p) => {
      if (unitFilter !== 'semua') {
        const j = p.jabatan.toLowerCase();
        if (unitFilter === 'kua' && !j.includes('kua') && !j.includes('kantor urusan agama')) {
          return false;
        }
        if (
          unitFilter === 'madrasah' &&
          !j.includes('mtsn') &&
          !j.includes('man ') &&
          !j.includes('min ') &&
          !j.includes('madrasah')
        ) {
          return false;
        }
        if (
          unitFilter === 'kantor' &&
          (j.includes('kua') ||
            j.includes('kantor urusan agama') ||
            j.includes('mtsn') ||
            j.includes('man ') ||
            j.includes('min '))
        ) {
          return false;
        }
      }
      if (!q) return true;
      return (
        p.nama.toLowerCase().includes(q) ||
        p.nip.toLowerCase().includes(q) ||
        p.jabatan.toLowerCase().includes(q) ||
        p.pangkatGolongan.toLowerCase().includes(q)
      );
    });
  }, [directory, query, unitFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const visibleRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const openEdit = (peg: Pegawai) => {
    setEditingId(peg.id);
    setForm({
      nama: peg.nama,
      nip: peg.nip,
      pangkatGolongan: peg.pangkatGolongan,
      jabatan: peg.jabatan,
    });
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nama.trim() || !form.nip.trim()) return;
    if (editingId) {
      onUpdatePegawai({ id: editingId, ...form });
    } else {
      onAddPegawai(form);
    }
    setIsFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleTriggerUpload = () => {
    setParseError(null);
    fileInputRef.current?.click();
  };

  const handleDukFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (
      file.type !== 'application/pdf' &&
      !file.name.toLowerCase().endsWith('.pdf')
    ) {
      setParseError('File harus berformat PDF (.pdf) hasil ekspor DUK.');
      return;
    }

    setIsParsingPdf(true);
    setParseError(null);
    setPendingImport(null);
    setParseProgress({ fileName: file.name, done: 0, total: 0 });

    try {
      const buffer = await file.arrayBuffer();
      const result = await parseDukPdfBuffer(buffer, (done, total) => {
        setParseProgress({ fileName: file.name, done, total });
      });

      if (result.pegawaiList.length === 0) {
        setParseError(
          `Tidak ditemukan baris data pegawai dengan NIP di "${file.name}". Pastikan file merupakan PDF DUK asli (teks digital dari SISDM/spreadsheet), bukan hasil scan gambar.`
        );
        return;
      }

      const existingNips = new Set(
        directory.map((d) => d.nip.trim()).filter(Boolean)
      );
      let newNipCount = 0;
      let updatedNipCount = 0;
      for (const p of result.pegawaiList) {
        const nip = p.nip.trim();
        if (nip && existingNips.has(nip)) {
          updatedNipCount++;
        } else {
          newNipCount++;
        }
      }

      setPendingImport({
        fileName: file.name,
        result,
        newNipCount,
        updatedNipCount,
      });
    } catch (err) {
      setParseError(
        err instanceof Error
          ? `Gagal membaca file PDF DUK: ${err.message}`
          : 'Gagal memproses file PDF DUK.'
      );
    } finally {
      setIsParsingPdf(false);
      setParseProgress(null);
    }
  };

  const handleApplyImport = (mode: DukImportMode) => {
    if (!pendingImport) return;
    onBulkUpdateDirectory(
      pendingImport.result.pegawaiList,
      mode,
      pendingImport.fileName
    );
    setPendingImport(null);
    setPage(1);
    setQuery('');
    setUnitFilter('semua');
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleDukFileSelected}
        className="hidden"
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Direktori Pegawai Kemenag Jember
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Database DUK ASN Kantor Kementerian Agama Kabupaten Jember ({directory.length.toLocaleString('id-ID')} pegawai). Unggah file PDF DUK terbaru kapan saja untuk memperbarui data seluruh pegawai secara otomatis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href="/assets/aistudio/DUK_KEMENAG_JEMBER_NOVEMBER_2026_f5e6da92.pdf"
            download="DUK_KEMENAG_JEMBER_NOVEMBER_2026.pdf"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Unduh PDF DUK
          </a>
          <button
            type="button"
            disabled={isParsingPdf}
            onClick={handleTriggerUpload}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-[#0B5D3B] bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 disabled:opacity-60 disabled:cursor-wait transition-colors whitespace-nowrap shrink-0"
          >
            {isParsingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Update DUK (PDF)
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Tambah Pegawai
          </button>
        </div>
      </div>

      {isParsingPdf && parseProgress && (
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-2.5 text-xs font-semibold text-emerald-900">
              <Loader2 className="w-4 h-4 animate-spin text-[#0B5D3B] shrink-0" />
              <span>
                Membaca PDF DUK: {parseProgress.fileName}
              </span>
            </div>
            <span className="text-xs font-mono-tabular text-emerald-800">
              {parseProgress.total > 0
                ? `Halaman ${parseProgress.done} / ${parseProgress.total}`
                : 'Menyiapkan dokumen...'}
            </span>
          </div>
          <div className="w-full h-1.5 bg-emerald-100 rounded-md overflow-hidden">
            <div
              className="h-full bg-[#0B5D3B] transition-all duration-150"
              style={{
                width:
                  parseProgress.total > 0
                    ? `${Math.round((parseProgress.done / parseProgress.total) * 100)}%`
                    : '15%',
              }}
            />
          </div>
        </div>
      )}

      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Gagal Memproses PDF DUK</p>
              <p className="mt-0.5 leading-relaxed">{parseError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setParseError(null)}
            className="p-1 text-red-500 hover:text-red-800 rounded-md shrink-0"
            aria-label="Tutup pesan error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {pendingImport && (
        <div className="bg-white border-2 border-[#0B5D3B]/40 rounded-xl p-5 mb-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-50 text-[#0B5D3B] rounded-lg shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Preview Pembaruan Data DUK ({pendingImport.result.pegawaiList.length.toLocaleString('id-ID')} Pegawai Terbaca)
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  File <span className="font-medium text-slate-800">{pendingImport.fileName}</span> ({pendingImport.result.totalPages} halaman)
                  {pendingImport.result.satuanKerja
                    ? ` · ${pendingImport.result.satuanKerja}`
                    : ''}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-700">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-md font-mono-tabular">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                    {pendingImport.result.pegawaiList.length.toLocaleString('id-ID')} Total Baris
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-md font-mono-tabular">
                    +{pendingImport.newNipCount.toLocaleString('id-ID')} NIP Baru
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 rounded-md font-mono-tabular">
                    {pendingImport.updatedNipCount.toLocaleString('id-ID')} NIP Sama (Akan Diperbarui)
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPendingImport(null)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md self-end sm:self-start"
              aria-label="Tutup preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2 px-3 w-12 text-center">No</th>
                  <th className="py-2 px-3">Nama Pegawai</th>
                  <th className="py-2 px-3">NIP</th>
                  <th className="py-2 px-3">Pangkat / Golongan</th>
                  <th className="py-2 px-3">Jabatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingImport.result.pegawaiList.slice(0, 5).map((peg, idx) => (
                  <tr key={peg.id} className="bg-white">
                    <td className="py-2 px-3 text-center text-slate-500 font-mono-tabular">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-900">
                      {peg.nama}
                    </td>
                    <td className="py-2 px-3 font-mono-tabular text-slate-700 whitespace-nowrap">
                      {peg.nip}
                    </td>
                    <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                      {peg.pangkatGolongan}
                    </td>
                    <td className="py-2 px-3 text-slate-600 max-w-md truncate">
                      {peg.jabatan}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pendingImport.result.pegawaiList.length > 5 && (
            <p className="text-xs text-slate-500 mt-2">
              Menampilkan 5 baris pertama dari {pendingImport.result.pegawaiList.length.toLocaleString('id-ID')} pegawai yang siap diterapkan.
            </p>
          )}

          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              Pilih metode penerapan: <strong>Perbarui Semua Data DUK</strong> mengganti database DUK dengan file terbaru (pegawai tambahan manual tetap aman), atau <strong>Gabung</strong> untuk memperbarui &amp; menambah tanpa menghapus pegawai lama.
            </p>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleApplyImport('merge')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Gabung / Tambah Saja
              </button>
              <button
                type="button"
                onClick={() => handleApplyImport('replace_duk')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Perbarui Semua Data DUK
              </button>
            </div>
          </div>
        </div>
      )}

      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl p-5 mb-6"
        >
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">
              {editingId ? 'Ubah Data Pegawai' : 'Tambah Pegawai Baru'}
            </h2>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
              aria-label="Tutup form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nama Lengkap & Gelar
              </label>
              <input
                type="text"
                required
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
                placeholder="Contoh: Dr. Ahmad Tholabi, M.HI"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                NIP / NI PPPK
              </label>
              <input
                type="text"
                required
                value={form.nip}
                onChange={(e) => setForm({ ...form, nip: e.target.value })}
                placeholder="18 digit NIP tanpa spasi"
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Pangkat / Golongan
              </label>
              <input
                type="text"
                list="pangkat-golongan-list"
                value={form.pangkatGolongan}
                onChange={(e) => setForm({ ...form, pangkatGolongan: e.target.value })}
                placeholder="Contoh: Pembina Tk.I (IV/b)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
              />
              <datalist id="pangkat-golongan-list">
                {PANGKAT_GOLONGAN_PRESETS.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Jabatan
              </label>
              <input
                type="text"
                required
                value={form.jabatan}
                onChange={(e) => setForm({ ...form, jabatan: e.target.value })}
                placeholder="Contoh: Kepala Seksi Bimas Islam Kantor Kemenag Kab. Jember"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E]"
            >
              {editingId ? 'Simpan Perubahan' : 'Simpan Pegawai'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Cari nama, NIP, pangkat, atau jabatan..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
              />
            </div>
            <select
              value={unitFilter}
              onChange={(e) => {
                setUnitFilter(e.target.value as UnitFilter);
                setPage(1);
              }}
              aria-label="Filter unit kerja"
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
            >
              <option value="semua">Semua Unit Kerja</option>
              <option value="kantor">Kantor Kemenag / Seksi</option>
              <option value="kua">KUA Kecamatan</option>
              <option value="madrasah">Madrasah (MAN / MTsN / MIN)</option>
            </select>
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular whitespace-nowrap">
            {filtered.length.toLocaleString('id-ID')} dari {directory.length.toLocaleString('id-ID')} pegawai
          </div>
        </div>

        {directory.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <p className="text-sm font-medium text-slate-900">
              Belum ada data pegawai tersimpan
            </p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Tambahkan pegawai PNS/PPPK Kemenag Jember agar bisa langsung dipilih saat membuat Surat Tugas.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E]"
            >
              <Plus className="w-4 h-4" />
              Tambah Pegawai Pertama
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 px-6 text-center text-sm text-slate-500">
            Tidak ada pegawai yang sesuai dengan pencarian.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50/50">
                    <th className="py-2.5 px-4 w-14 text-center">No</th>
                    <th className="py-2.5 px-4">Nama Pegawai</th>
                    <th className="py-2.5 px-4">NIP</th>
                    <th className="py-2.5 px-4">Pangkat / Golongan</th>
                    <th className="py-2.5 px-4">Jabatan</th>
                    <th className="py-2.5 px-4 text-right w-40">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {visibleRows.map((peg, index) => (
                    <tr key={peg.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 text-center text-xs text-slate-500 font-mono-tabular align-top">
                        {pageStart + index + 1}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 align-top">
                        {peg.nama}
                      </td>
                      <td className="py-2.5 px-4 font-mono-tabular text-xs text-slate-700 align-top whitespace-nowrap">
                        {peg.nip}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700 align-top whitespace-nowrap">
                        {peg.pangkatGolongan}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 align-top max-w-xs">
                        {peg.jabatan}
                      </td>
                      <td className="py-2.5 px-4 align-top">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onUsePegawaiInSurat(peg)}
                            title="Masukkan ke Surat Tugas aktif"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#0B5D3B] bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Pakai
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(peg)}
                            title="Ubah pegawai"
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                            aria-label={`Ubah ${peg.nama}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeletePegawai(peg.id)}
                            title="Hapus pegawai"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            aria-label={`Hapus ${peg.nama}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4">
                <span className="text-xs text-slate-600 font-mono-tabular">
                  Menampilkan {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} dari{' '}
                  {filtered.length.toLocaleString('id-ID')}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Sebelumnya
                  </button>
                  <span className="text-xs text-slate-700 font-mono-tabular px-2">
                    Hal {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                  >
                    Berikutnya
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
