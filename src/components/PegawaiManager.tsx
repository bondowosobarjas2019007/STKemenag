import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2, UserPlus, X } from 'lucide-react';
import { PANGKAT_GOLONGAN_PRESETS, Pegawai } from '../types/surat';

interface PegawaiManagerProps {
  directory: Pegawai[];
  onAddPegawai: (pegawai: Omit<Pegawai, 'id'>) => void;
  onUpdatePegawai: (pegawai: Pegawai) => void;
  onDeletePegawai: (id: string) => void;
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

export const PegawaiManager: React.FC<PegawaiManagerProps> = ({
  directory,
  onAddPegawai,
  onUpdatePegawai,
  onDeletePegawai,
  onUsePegawaiInSurat,
}) => {
  const [query, setQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState<UnitFilter>('semua');
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Pegawai, 'id'>>(EMPTY_FORM);

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

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Direktori Pegawai Kemenag Jember
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Database DUK ASN Kantor Kementerian Agama Kabupaten Jember ({directory.length.toLocaleString('id-ID')} pegawai) untuk pengisian Surat Tugas otomatis dan manual.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Tambah Pegawai
        </button>
      </div>

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
