import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, FolderOpen, Search, Trash2 } from 'lucide-react';
import { useViewport } from '../contexts/ViewportContext';
import { ArsipSurat, KriteriaKeberangkatan } from '../types/surat';
import { formatTanggalIndo } from '../utils/dateFormat';

interface ArsipManagerProps {
  arsipList: ArsipSurat[];
  onLoadArsip: (arsip: ArsipSurat) => void;
  onSyncArsipToSheets: (arsip: ArsipSurat) => void;
  onDeleteArsip: (id: string) => void;
  onGoToEditor: () => void;
}

const KRITERIA_LABELS: Record<KriteriaKeberangkatan, string> = {
  sendiri: 'Berangkat Sendiri',
  tiga_orang: 'Berangkat 2-3 Orang',
  terlampir: '> 3 Orang (Terlampir)',
};

export const ArsipManager: React.FC<ArsipManagerProps> = ({
  arsipList,
  onLoadArsip,
  onSyncArsipToSheets,
  onDeleteArsip,
  onGoToEditor,
}) => {
  const { isMobileLayout } = useViewport();
  const [query, setQuery] = useState('');
  const [filterKriteria, setFilterKriteria] = useState<'semua' | KriteriaKeberangkatan>('semua');

  const filtered = useMemo(() => {
    return arsipList.filter((item) => {
      if (filterKriteria !== 'semua' && item.data.kriteria !== filterKriteria) {
        return false;
      }
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        item.data.namaKegiatan.toLowerCase().includes(q) ||
        item.data.lokasiTujuan.toLowerCase().includes(q) ||
        item.data.dasarAsal.toLowerCase().includes(q) ||
        item.data.pegawaiList.some((p) => p.nama.toLowerCase().includes(q))
      );
    });
  }, [arsipList, filterKriteria, query]);

  return (
    <div className={`max-w-6xl mx-auto ${isMobileLayout ? 'px-3 py-4' : 'px-4 sm:px-6 py-6 sm:py-8'}`}>
      <div
        className={`flex justify-between gap-3 mb-5 ${
          isMobileLayout ? 'flex-col items-stretch' : 'flex-col sm:flex-row sm:items-center mb-6 gap-4'
        }`}
      >
        <div>
          <h1 className="text-lg sm:text-xl font-semibold st-text-primary">
            Daftar Draft Surat Tugas
          </h1>
          <p className="text-xs sm:text-sm st-text-secondary mt-1">
            Draft tersimpan di penyimpanan lokal peramban ini untuk dibuka kembali, dicatat ke Google Sheets, atau diunduh ke Word (.docx).
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToEditor}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] transition-colors whitespace-nowrap shrink-0"
        >
          <FileText className="w-4 h-4" />
          Kembali ke Editor
        </button>
      </div>

      <div className="st-surface border rounded-xl overflow-hidden">
        <div
          className={`px-3.5 sm:px-4 py-3 border-b st-border st-surface-muted flex justify-between gap-3 ${
            isMobileLayout ? 'flex-col items-stretch' : 'flex-col lg:flex-row lg:items-center'
          }`}
        >
          <div className={`relative flex-1 ${isMobileLayout ? '' : 'max-w-md'}`}>
            <Search className="w-4 h-4 st-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kegiatan, lokasi, dasar surat, atau nama pegawai..."
              className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-200/70 night:bg-[#e7d8b4] dark:bg-slate-800 rounded-lg overflow-x-auto">
            {(
              [
                ['semua', 'Semua'],
                ['sendiri', 'Sendiri'],
                ['tiga_orang', '2-3 Orang'],
                ['terlampir', 'Terlampir'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilterKriteria(key)}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  filterKriteria === key
                    ? 'st-surface st-text-primary shadow-xs'
                    : 'st-text-secondary hover:opacity-80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {arsipList.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <p className="text-sm font-medium st-text-primary">
              Belum ada Draft Surat Tugas tersimpan
            </p>
            <p className="text-xs st-text-muted mt-1 mb-4">
              Klik tombol &ldquo;Simpan ke Draft&rdquo; pada form editor atau bilah alat pratinjau untuk menyimpan surat ke daftar draft lokal.
            </p>
            <button
              type="button"
              onClick={onGoToEditor}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E]"
            >
              Buat Surat Tugas
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 px-6 text-center text-sm st-text-muted">
            Tidak ada draft yang cocok dengan filter saat ini.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 night:divide-[#e4d5b3] dark:divide-slate-700/70">
            {filtered.map((item) => {
              const firstName = item.data.pegawaiList[0]?.nama || 'Belum ada pegawai';
              const totalPegawai = item.data.pegawaiList.length;
              const isTercatat = item.status === 'Tercatat';
              return (
                <div
                  key={item.id}
                  className={`px-4 sm:px-5 py-4 flex justify-between gap-3 hover:bg-slate-50/70 night:hover:bg-[#f5ecd5] dark:hover:bg-slate-800/60 transition-colors ${
                    isMobileLayout ? 'flex-col' : 'flex-col md:flex-row md:items-center gap-4'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${
                          isTercatat
                            ? 'bg-emerald-50 night:bg-emerald-900/15 dark:bg-emerald-950/50 text-[#0B5D3B] dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-50 night:bg-amber-900/15 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {isTercatat ? 'Tercatat' : 'Draft'}
                      </span>
                      <div className="text-sm font-semibold st-text-primary line-clamp-2 sm:line-clamp-1">
                        {item.data.namaKegiatan || 'Kegiatan belum diisi'}
                      </div>
                    </div>
                    <div className="text-xs st-text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>{KRITERIA_LABELS[item.data.kriteria]}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {totalPegawai} pegawai ({firstName}
                        {totalPegawai > 1 ? ' dkk.' : ''})
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.data.lokasiTujuan || '-'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {formatTanggalIndo(item.data.tanggalMulai)}
                      </span>
                    </div>
                    <div className="text-xs st-text-muted mt-1 break-words">
                      Dasar: {item.data.dasarAsal} ({item.data.dasarNomor})
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSyncArsipToSheets(item)}
                      className="min-h-[44px] flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[#0B5D3B] dark:text-emerald-300 bg-emerald-50 night:bg-emerald-900/15 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      {isTercatat ? 'Perbarui Sheets' : 'Kirim ke Sheets'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onLoadArsip(item)}
                      className="min-h-[44px] flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] transition-colors whitespace-nowrap shrink-0"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Buka di Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteArsip(item.id)}
                      className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center p-2 st-text-muted hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                      aria-label="Hapus draft"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
