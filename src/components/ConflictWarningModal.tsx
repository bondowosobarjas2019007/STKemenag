import React from 'react';
import { AlertTriangle, Calendar, UserX, X } from 'lucide-react';
import { useViewport } from '../contexts/ViewportContext';
import { ScheduleConflict } from '../types/surat';

interface ConflictWarningModalProps {
  isOpen: boolean;
  conflicts: ScheduleConflict[];
  onProceed: () => void;
  onCancel: () => void;
}

export const ConflictWarningModal: React.FC<ConflictWarningModalProps> = ({
  isOpen,
  conflicts,
  onProceed,
  onCancel,
}) => {
  const { isMobileLayout, isForcedMobile } = useViewport();
  if (!isOpen || conflicts.length === 0) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 no-print ${
        isMobileLayout ? 'p-3' : 'p-4'
      } ${isForcedMobile ? 'max-w-[430px] mx-auto' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
    >
      <div className="w-full max-w-lg st-surface border st-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b st-border bg-amber-500/10 night:bg-[#efe3c4] dark:bg-amber-950/40 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <h2
              id="conflict-modal-title"
              className="text-sm font-bold st-text-primary truncate"
            >
              Peringatan: Jadwal Tugas Pegawai Bentrok (Anti SPJ Ganda)
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-w-[38px] min-h-[38px] inline-flex items-center justify-center st-text-muted hover:text-slate-800 dark:hover:text-slate-200 rounded-lg shrink-0"
            aria-label="Tutup dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="px-4 sm:px-5 py-4 text-xs st-text-secondary space-y-3 leading-relaxed max-h-[60vh] overflow-y-auto">
          <p className="st-text-primary">
            Ditemukan pegawai pada Surat Tugas ini yang jadwal keberangkatannya <strong>beririsan dengan penugasan lain</strong> yang sudah tercatat pada buku kendali tahun berjalan:
          </p>

          <div className="space-y-2.5">
            {conflicts.map((conflict, idx) => (
              <div
                key={`${conflict.pegawaiNip}-${conflict.existingIdSurat}-${idx}`}
                className="p-3 rounded-lg border border-amber-200 dark:border-amber-800/70 bg-amber-50/80 night:bg-[#f5ecd5] dark:bg-amber-950/30 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-amber-900 night:text-[#423425] dark:text-amber-200 flex items-center gap-1.5">
                    <UserX className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    {conflict.pegawaiNama}
                  </span>
                  {conflict.pegawaiNip && (
                    <span className="font-mono-tabular text-[11px] text-amber-800/80 dark:text-amber-300">
                      NIP. {conflict.pegawaiNip}
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-amber-900/90 night:text-[#423425] dark:text-amber-200/90 pt-0.5">
                  <span className="font-medium">Kegiatan Sebelumnya: </span>
                  <span className="italic">{conflict.existingKegiatan}</span>
                  {conflict.existingNomorSurat !== '-' && (
                    <span> ({conflict.existingNomorSurat})</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                  <Calendar className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Jadwal Terdaftar: {conflict.overlapDatesDisplay}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-2.5 rounded-lg border st-border st-surface-muted text-[11px] st-text-secondary">
            Periksa kembali tanggal pelaksanaan atau tim pegawai yang ditugaskan agar tidak terjadi duplikasi pembayaran SPJ perjalanan dinas.
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div
          className={`px-4 sm:px-5 py-3 st-surface-muted border-t st-border flex gap-2 shrink-0 ${
            isMobileLayout ? 'flex-col-reverse' : 'flex-row items-center justify-end'
          }`}
        >
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[42px] px-4 py-2 text-xs font-semibold st-text-primary st-surface border st-border rounded-lg hover:opacity-90"
          >
            Periksa Kembali
          </button>
          <button
            type="button"
            onClick={onProceed}
            className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-xs"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Tetap Lanjutkan
          </button>
        </div>
      </div>
    </div>
  );
};
