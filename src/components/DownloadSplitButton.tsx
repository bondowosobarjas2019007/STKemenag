import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileDown, FileText } from 'lucide-react';

export type ExportFormat = 'docx' | 'pdf';

interface DownloadSplitButtonProps {
  exportingFormat: ExportFormat | null;
  modeSrikandi: boolean;
  menuPlacement?: 'top' | 'bottom';
  fullWidth?: boolean;
  onExport: (format: ExportFormat) => void;
}

export const DownloadSplitButton: React.FC<DownloadSplitButtonProps> = ({
  exportingFormat,
  modeSrikandi,
  menuPlacement = 'bottom',
  fullWidth = false,
  onExport,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isBusy = exportingFormat !== null;

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const primaryLabel =
    exportingFormat === 'docx'
      ? 'Menyiapkan .docx...'
      : exportingFormat === 'pdf'
        ? 'Menyiapkan .pdf...'
        : 'Unduh .docx';

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex overflow-visible ${
        menuOpen ? 'z-50' : 'z-10'
      } ${fullWidth ? 'w-full' : ''}`}
    >
      <div
        className={`inline-flex items-stretch rounded-lg shadow-xs overflow-hidden bg-[#0B5D3B] ${
          fullWidth ? 'w-full' : ''
        }`}
      >
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            setMenuOpen(false);
            onExport('docx');
          }}
          className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0B5D3B] hover:bg-[#09492E] disabled:opacity-60 transition-colors whitespace-nowrap ${
            fullWidth ? 'flex-1 min-w-0' : ''
          }`}
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{primaryLabel}</span>
        </button>

        <span className="w-px bg-emerald-700/80 my-2 shrink-0" aria-hidden="true" />

        <button
          type="button"
          disabled={isBusy}
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Pilih format unduhan surat (.docx atau .pdf)"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Pilih format unduhan (.docx atau .pdf)"
          className="min-h-[44px] min-w-[34px] inline-flex items-center justify-center px-2 text-white bg-[#0B5D3B] hover:bg-[#09492E] disabled:opacity-60 transition-colors shrink-0"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-150 ${
              menuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      {menuOpen && (
        <div
          role="menu"
          aria-label="Pilihan format unduhan surat"
          className={`absolute right-0 w-72 max-w-[calc(100vw-2rem)] st-surface border st-border rounded-xl shadow-2xl p-1.5 z-50 space-y-1 ${
            menuPlacement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          <button
            type="button"
            role="menuitem"
            disabled={isBusy}
            onClick={() => {
              setMenuOpen(false);
              onExport('docx');
            }}
            className="w-full text-left flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-slate-100 night:hover:bg-[#f5ecd5] dark:hover:bg-slate-800 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-sky-50 night:bg-emerald-900/15 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 flex items-center justify-center shrink-0 mt-0.5">
              <FileText className="w-4 h-4 text-sky-700 dark:text-sky-300" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold st-text-primary">
                Unduh Word (.docx)
              </div>
              <p className="text-[11px] st-text-muted leading-snug mt-0.5">
                {modeSrikandi
                  ? 'Format dapat diedit (termasuk placeholder Srikandi ${nomor_naskah}).'
                  : 'Format dapat diedit (termasuk placeholder Srikandi jika aktif).'}
              </p>
            </div>
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={isBusy}
            onClick={() => {
              setMenuOpen(false);
              onExport('pdf');
            }}
            className="w-full text-left flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-slate-100 night:hover:bg-[#f5ecd5] dark:hover:bg-slate-800 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-50 night:bg-emerald-900/15 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
              <FileDown className="w-4 h-4 text-[#0B5D3B] dark:text-emerald-300" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold st-text-primary">
                Unduh PDF (.pdf)
              </div>
              <p className="text-[11px] st-text-muted leading-snug mt-0.5">
                Dokumen siap cetak / arsip digital A4.
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
