import React, { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { useViewport } from '../contexts/ViewportContext';
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
  const { isMobileLayout, isForcedMobile } = useViewport();
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
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 no-print ${
        isMobileLayout ? 'p-0' : 'p-4'
      } ${isForcedMobile ? 'max-w-[430px] mx-auto' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Direktori Pegawai Kemenag Jember"
    >
      <div
        className={`w-full st-surface flex flex-col ${
          isMobileLayout
            ? 'h-full max-h-none rounded-none border-0'
            : 'max-w-2xl border rounded-xl shadow-xl max-h-[82vh]'
        }`}
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b st-border shrink-0">
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-semibold st-text-primary truncate">
              Pilih Pegawai Kemenag Jember
            </h2>
            <p className="text-xs st-text-muted mt-0.5">
              {multiSelect
                ? 'Centang satu atau beberapa pegawai untuk ditambahkan ke daftar tugas.'
                : 'Klik pegawai untuk mengisi data secara otomatis.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center st-text-muted hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded-lg transition-colors shrink-0"
            aria-label="Tutup direktori"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-5 py-3 border-b st-border st-surface-muted shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 st-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisibleLimit(60);
              }}
              placeholder="Cari nama, NIP, pangkat/golongan, atau jabatan..."
              className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
              autoFocus={!isMobileLayout}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 night:divide-[#e4d5b3] dark:divide-slate-700/70">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm st-text-muted">
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
                    className={`w-full min-h-[56px] text-left px-4 sm:px-5 py-3.5 flex items-start justify-between gap-4 transition-colors hover:bg-slate-50 night:hover:bg-[#f5ecd5] dark:hover:bg-slate-800/60 ${
                      isChecked
                        ? 'bg-emerald-50/60 night:bg-emerald-900/15 dark:bg-emerald-950/40'
                        : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold st-text-primary truncate">
                        {peg.nama}
                      </div>
                      <div className="text-xs st-text-muted mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span className="font-mono-tabular">NIP {peg.nip}</span>
                        <span aria-hidden="true">·</span>
                        <span>{peg.pangkatGolongan}</span>
                        {isAlreadyAdded && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#0B5D3B] dark:text-emerald-400 font-medium">
                              Sudah di daftar
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-xs st-text-secondary mt-1 line-clamp-2">
                        {peg.jabatan}
                      </div>
                    </div>
                    {multiSelect && (
                      <span
                        className={`mt-1 w-6 h-6 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-[#0B5D3B] border-[#0B5D3B] text-white'
                            : 'st-input'
                        }`}
                      >
                        {isChecked && <Check className="w-4 h-4" />}
                      </span>
                    )}
                  </button>
                );
              })}
              {filtered.length > visibleLimit && (
                <div className="p-3 text-center st-surface-muted">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + 60)}
                    className="min-h-[44px] px-4 py-2 text-xs font-medium text-[#0B5D3B] dark:text-emerald-400 st-surface border rounded-lg hover:opacity-90 transition-colors"
                  >
                    Tampilkan lebih banyak ({filtered.length - visibleLimit} lagi)
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 border-t st-border st-surface-muted flex flex-wrap items-center justify-between gap-3 shrink-0">
          <span className="text-xs st-text-muted font-mono-tabular">
            {filtered.length.toLocaleString('id-ID')} pegawai tersedia
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => {
                setCheckedIds([]);
                onClose();
              }}
              className="min-h-[44px] px-4 py-2 text-xs font-medium st-text-secondary st-surface border rounded-lg hover:opacity-90 transition-colors whitespace-nowrap shrink-0"
            >
              Batal
            </button>
            {multiSelect && (
              <button
                type="button"
                disabled={checkedIds.length === 0}
                onClick={handleConfirmMultiple}
                className="min-h-[44px] px-4 py-2 text-xs font-medium text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
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
