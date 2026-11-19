import React, { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { Pegawai } from '../types/surat';

interface PegawaiDirectoryModalProps {
  isOpen: boolean;
  directory: Pegawai[];
  multiSelect: boolean;
  alreadySelectedNips: string[];
  onClose: () => void;
  onSelectSingle?: (pegawai: Pegawai) => void;
  onSelectMultiple?: (pegawaiList: Pegawai[]) => void;
}

export const PegawaiDirectoryModal: React.FC<PegawaiDirectoryModalProps> = ({
  isOpen,
  directory,
  multiSelect,
  alreadySelectedNips,
  onClose,
  onSelectSingle,
  onSelectMultiple,
}) => {
  const [query, setQuery] = useState('');
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(60);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return directory;
    return directory.filter(
      (p) =>
        p.nama.toLowerCase().includes(q) ||
        p.nip.toLowerCase().includes(q) ||
        p.jabatan.toLowerCase().includes(q) ||
        p.pangkatGolongan.toLowerCase().includes(q)
    );
  }, [directory, query]);

  const visibleItems = useMemo(
    () => filtered.slice(0, visibleLimit),
    [filtered, visibleLimit]
  );

  if (!isOpen) return null;

  const toggleId = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleConfirmMultiple = () => {
    const selected = directory.filter((p) => checkedIds.includes(p.id));
    if (selected.length > 0 && onSelectMultiple) {
      onSelectMultiple(selected);
    }
    setCheckedIds([]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Direktori Pegawai Kemenag Jember"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col max-h-[82vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Pilih Pegawai Kemenag Jember
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {multiSelect
                ? 'Centang satu atau beberapa pegawai untuk ditambahkan ke daftar tugas.'
                : 'Klik pegawai untuk mengisi data secara otomatis.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Tutup direktori"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisibleLimit(60);
              }}
              placeholder="Cari nama, NIP, pangkat/golongan, atau jabatan..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Tidak ada pegawai yang cocok dengan pencarian &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <>
              {visibleItems.map((peg) => {
                const isChecked = checkedIds.includes(peg.id);
                const isAlreadyAdded = alreadySelectedNips.includes(peg.nip);
                return (
                  <button
                    key={peg.id}
                    type="button"
                    onClick={() => {
                      if (multiSelect) {
                        toggleId(peg.id);
                      } else if (onSelectSingle) {
                        onSelectSingle(peg);
                        onClose();
                      }
                    }}
                    className={`w-full text-left px-5 py-3.5 flex items-start justify-between gap-4 transition-colors hover:bg-slate-50 ${
                      isChecked ? 'bg-emerald-50/60' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {peg.nama}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span className="font-mono-tabular">NIP {peg.nip}</span>
                        <span aria-hidden="true">·</span>
                        <span>{peg.pangkatGolongan}</span>
                        {isAlreadyAdded && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#0B5D3B] font-medium">
                              Sudah di daftar
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 mt-1 line-clamp-2">
                        {peg.jabatan}
                      </div>
                    </div>
                    {multiSelect && (
                      <span
                        className={`mt-1 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-[#0B5D3B] border-[#0B5D3B] text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5" />}
                      </span>
                    )}
                  </button>
                );
              })}
              {filtered.length > visibleLimit && (
                <div className="p-3 text-center bg-slate-50/50">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + 60)}
                    className="px-4 py-2 text-xs font-medium text-[#0B5D3B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Tampilkan lebih banyak ({filtered.length - visibleLimit} lagi)
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          <span className="text-xs text-slate-500 font-mono-tabular">
            {filtered.length.toLocaleString('id-ID')} pegawai tersedia
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCheckedIds([]);
                onClose();
              }}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Batal
            </button>
            {multiSelect && (
              <button
                type="button"
                disabled={checkedIds.length === 0}
                onClick={handleConfirmMultiple}
                className="px-4 py-2 text-xs font-medium text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
              >
                Tambahkan ({checkedIds.length})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
