import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, FolderOpen, Search, Trash2 } from 'lucide-react';
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
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Arsip Draft Surat Tugas
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Daftar Surat Tugas yang disimpan di peramban ini untuk dibuka kembali, dikirim ke Google Sheets, atau dicetak ulang.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToEditor}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] transition-colors whitespace-nowrap shrink-0"
        >
          <FileText className="w-4 h-4" />
          Kembali ke Editor
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/70">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kegiatan, lokasi, dasar surat, atau nama pegawai..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
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
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  filterKriteria === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {arsipList.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <p className="text-sm font-medium text-slate-900">
              Belum ada Surat Tugas yang diarsipkan
            </p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Klik tombol &ldquo;Simpan Arsip&rdquo; pada bilah alat pratinjau untuk menyimpan draft Surat Tugas Anda.
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
          <div className="py-12 px-6 text-center text-sm text-slate-500">
            Tidak ada arsip yang cocok dengan filter saat ini.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((item) => {
              const firstName = item.data.pegawaiList[0]?.nama || 'Belum ada pegawai';
              const totalPegawai = item.data.pegawaiList.length;
              return (
                <div
                  key={item.id}
                  className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 line-clamp-1">
                      {item.data.namaKegiatan || 'Kegiatan belum diisi'}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
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
                    <div className="text-xs text-slate-500 mt-1">
                      Dasar: {item.data.dasarAsal} ({item.data.dasarNomor})
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSyncArsipToSheets(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#0B5D3B] bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Kirim ke Sheets
                    </button>
                    <button
                      type="button"
                      onClick={() => onLoadArsip(item)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] transition-colors whitespace-nowrap shrink-0"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Buka di Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteArsip(item.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      aria-label="Hapus arsip"
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
