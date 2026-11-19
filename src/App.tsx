import React, { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FilePenLine,
  FileSpreadsheet,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { ArsipManager } from './components/ArsipManager';
import {
  ConfirmSheetsOverwriteModal,
  SheetsAuthPromptModal,
} from './components/ConfirmSheetsActionModal';
import {
  DasarPdfUploader,
  ParsedDasarPdfResult,
} from './components/DasarPdfUploader';
import { PegawaiDirectoryModal } from './components/PegawaiDirectoryModal';
import { PegawaiManager } from './components/PegawaiManager';
import { SuratPreview } from './components/SuratPreview';
import { TrackingSheetsManager } from './components/TrackingSheetsManager';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logoutGoogle,
} from './services/googleAuth';
import {
  appendSuratToYearSheet,
  checkExistingRecordRow,
  ensureYearSheet,
  extractSpreadsheetId,
  fetchRowsForSheet,
  findOrCreateTrackingSpreadsheet,
  getSpreadsheetMetadata,
  getTargetYearForSurat,
  SheetsAuthError,
  SpreadsheetSummary,
  TrackedSuratRow,
  updateExistingSuratRow,
} from './services/googleSheets';
import {
  ArsipSurat,
  createEmptyDraft,
  DASAR_ASAL_PRESETS,
  INITIAL_PEGAWAI_DIRECTORY,
  KOP_VARIAN_OPTIONS,
  KopVarianId,
  KriteriaKeberangkatan,
  PANGKAT_GOLONGAN_PRESETS,
  Pegawai,
  SAMPLE_TEMPLATES,
  SuratTugasData,
} from './types/surat';
import { exportSuratTugasDocx } from './utils/exportDocx';

type AppTab = 'editor' | 'pegawai' | 'sheets' | 'arsip';

const STORAGE_KEYS = {
  DRAFT: 'situgas_kemenag_jember_draft_v2',
  PEGAWAI: 'situgas_kemenag_jember_pegawai_v2',
  PEGAWAI_LEGACY: 'situgas_kemenag_jember_pegawai_v1',
  ARSIP: 'situgas_kemenag_jember_arsip_v1',
  SHEETS_ID: 'situgas_kemenag_jember_sheets_id_v1',
};

function createEmptyPegawai(suffix = ''): Pegawai {
  return {
    id: `peg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${suffix}`,
    nama: '',
    nip: '',
    pangkatGolongan: '',
    jabatan: '',
  };
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadPegawaiDirectory(): Pegawai[] {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEYS.PEGAWAI);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Pegawai[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    const rawV1 = localStorage.getItem(STORAGE_KEYS.PEGAWAI_LEGACY);
    if (rawV1) {
      const legacy = JSON.parse(rawV1) as Pegawai[];
      if (Array.isArray(legacy)) {
        const dukNips = new Set(INITIAL_PEGAWAI_DIRECTORY.map((d) => d.nip.trim()));
        const customEntries = legacy.filter(
          (item) => item.nip && !dukNips.has(item.nip.trim())
        );
        return [...customEntries, ...INITIAL_PEGAWAI_DIRECTORY];
      }
    }
  } catch {
    // ignore storage errors
  }
  return INITIAL_PEGAWAI_DIRECTORY;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('editor');
  const [mobilePane, setMobilePane] = useState<'form' | 'preview'>('form');
  const [zoom, setZoom] = useState<number>(0.85);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [isExportingDocx, setIsExportingDocx] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [surat, setSurat] = useState<SuratTugasData>(() =>
    loadFromStorage<SuratTugasData>(STORAGE_KEYS.DRAFT, createEmptyDraft('sendiri'))
  );
  const [directory, setDirectory] = useState<Pegawai[]>(loadPegawaiDirectory);
  const [arsipList, setArsipList] = useState<ArsipSurat[]>(() =>
    loadFromStorage<ArsipSurat[]>(STORAGE_KEYS.ARSIP, [])
  );

  // Directory modal state
  const [dirModalOpen, setDirModalOpen] = useState(false);
  const [dirTargetIndex, setDirTargetIndex] = useState<number | null>(null);
  const [dirForceMulti, setDirForceMulti] = useState(false);

  // Google Sheets tracking state
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isGoogleConnecting, setIsGoogleConnecting] = useState<boolean>(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  const [savedSpreadsheetId, setSavedSpreadsheetId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.SHEETS_ID) || '';
    } catch {
      return '';
    }
  });
  const [spreadsheet, setSpreadsheet] = useState<SpreadsheetSummary | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>(() =>
    String(new Date().getFullYear())
  );
  const [sheetRows, setSheetRows] = useState<TrackedSuratRow[]>([]);
  const [authPromptDraft, setAuthPromptDraft] = useState<SuratTugasData | null>(null);
  const [overwriteConfirm, setOverwriteConfirm] = useState<{
    spreadsheetId: string;
    year: string;
    rowNumber: number;
    draft: SuratTugasData;
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DRAFT, JSON.stringify(surat));
    } catch {
      // ignore storage quota errors
    }
  }, [surat]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PEGAWAI, JSON.stringify(directory));
    } catch {
      // ignore storage quota errors
    }
  }, [directory]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ARSIP, JSON.stringify(arsipList));
    } catch {
      // ignore storage quota errors
    }
  }, [arsipList]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const persistSpreadsheetId = useCallback((id: string) => {
    setSavedSpreadsheetId(id);
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEYS.SHEETS_ID, id);
      } else {
        localStorage.removeItem(STORAGE_KEYS.SHEETS_ID);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const loadYearRows = useCallback(
    async (ssId: string, yearTitle: string, token: string) => {
      setIsSyncingSheets(true);
      setSheetsError(null);
      try {
        const fetched = await fetchRowsForSheet(ssId, yearTitle, token);
        setSheetRows(fetched);
      } catch (err) {
        if (err instanceof SheetsAuthError) {
          clearAccessToken();
          setNeedsAuth(true);
        }
        setSheetsError(
          err instanceof Error ? err.message : 'Gagal memuat data Google Sheets.'
        );
      } finally {
        setIsSyncingSheets(false);
      }
    },
    []
  );

  const ensureConnectedSpreadsheet = useCallback(
    async (token: string, preferredYear: string): Promise<SpreadsheetSummary> => {
      let summary: SpreadsheetSummary;
      if (savedSpreadsheetId) {
        try {
          summary = await getSpreadsheetMetadata(savedSpreadsheetId, token);
        } catch (err) {
          if (err instanceof SheetsAuthError) throw err;
          summary = await findOrCreateTrackingSpreadsheet(token, preferredYear);
        }
      } else {
        summary = await findOrCreateTrackingSpreadsheet(token, preferredYear);
      }
      persistSpreadsheetId(summary.spreadsheetId);
      setSpreadsheet(summary);
      return summary;
    },
    [persistSpreadsheetId, savedSpreadsheetId]
  );

  const syncDraftToGoogleSheets = useCallback(
    async (draft: SuratTugasData, tokenOverride?: string) => {
      const token = tokenOverride || getAccessToken();
      const targetYear = getTargetYearForSurat(draft);

      if (!token) {
        setNeedsAuth(true);
        setAuthPromptDraft(draft);
        return;
      }

      setIsSyncingSheets(true);
      setSheetsError(null);
      try {
        const summary = await ensureConnectedSpreadsheet(token, targetYear);
        const { createdNew, summary: ensuredSummary } = await ensureYearSheet(
          summary.spreadsheetId,
          targetYear,
          token
        );
        setSpreadsheet(ensuredSummary);
        setSelectedYear(targetYear);

        const { existingRowNumber, nextRowNumberDisplay } =
          await checkExistingRecordRow(
            ensuredSummary.spreadsheetId,
            targetYear,
            draft.id,
            token
          );

        if (existingRowNumber !== null) {
          // Mandatory explicit confirmation before mutating an existing row
          setOverwriteConfirm({
            spreadsheetId: ensuredSummary.spreadsheetId,
            year: targetYear,
            rowNumber: existingRowNumber,
            draft: {
              ...draft,
              pegawaiList: draft.pegawaiList.map((p) => ({ ...p })),
            },
          });
          setIsSyncingSheets(false);
          return;
        }

        await appendSuratToYearSheet(
          ensuredSummary.spreadsheetId,
          targetYear,
          nextRowNumberDisplay,
          draft,
          token
        );

        const refreshed = await fetchRowsForSheet(
          ensuredSummary.spreadsheetId,
          targetYear,
          token
        );
        setSheetRows(refreshed);

        showToast(
          createdNew
            ? `Sheet baru "${targetYear}" dibuat & Surat Tugas tersimpan ke Google Sheets`
            : `Tersimpan ke Google Sheets (Sheet ${targetYear})`
        );
      } catch (err) {
        if (err instanceof SheetsAuthError) {
          clearAccessToken();
          setNeedsAuth(true);
          setAuthPromptDraft(draft);
        }
        const msg =
          err instanceof Error
            ? err.message
            : 'Gagal menyimpan ke Google Sheets.';
        setSheetsError(msg);
        showToast(msg);
      } finally {
        setIsSyncingSheets(false);
      }
    },
    [ensureConnectedSpreadsheet, showToast]
  );

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setNeedsAuth(false);
        if (savedSpreadsheetId) {
          void (async () => {
            try {
              const meta = await getSpreadsheetMetadata(savedSpreadsheetId, token);
              setSpreadsheet(meta);
              const yearToUse =
                meta.sheets.find((s) => s.title === selectedYear)?.title ||
                meta.sheets[0]?.title ||
                selectedYear;
              setSelectedYear(yearToUse);
              await loadYearRows(meta.spreadsheetId, yearToUse, token);
            } catch {
              // Wait for user interaction in Tracking Sheets tab
            }
          })();
        }
      },
      (user) => {
        setGoogleUser(user);
        setNeedsAuth(true);
      }
    );
    return unsubscribe;
  }, [loadYearRows, savedSpreadsheetId, selectedYear]);

  const handleGoogleLogin = async () => {
    setIsGoogleConnecting(true);
    setSheetsError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setNeedsAuth(false);
        const draftToSync = authPromptDraft;
        setAuthPromptDraft(null);
        if (draftToSync) {
          await syncDraftToGoogleSheets(draftToSync, res.accessToken);
        } else {
          const currentYear = String(new Date().getFullYear());
          const summary = await ensureConnectedSpreadsheet(
            res.accessToken,
            currentYear
          );
          const tabToLoad =
            summary.sheets.find((s) => s.title === selectedYear)?.title ||
            summary.sheets[0]?.title ||
            currentYear;
          setSelectedYear(tabToLoad);
          await loadYearRows(summary.spreadsheetId, tabToLoad, res.accessToken);
          showToast('Berhasil terhubung ke Google Sheets');
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal masuk dengan Google.';
      setSheetsError(msg);
      showToast(msg);
    } finally {
      setIsGoogleConnecting(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setNeedsAuth(true);
    setSpreadsheet(null);
    setSheetRows([]);
    showToast('Akun Google diputuskan');
  };

  const handleAutoSetupSpreadsheet = async () => {
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setIsSyncingSheets(true);
    setSheetsError(null);
    try {
      const currentYear = String(new Date().getFullYear());
      const summary = await findOrCreateTrackingSpreadsheet(token, currentYear);
      persistSpreadsheetId(summary.spreadsheetId);
      setSpreadsheet(summary);
      const tabToLoad =
        summary.sheets.find((s) => s.title === currentYear)?.title ||
        summary.sheets[0]?.title ||
        currentYear;
      setSelectedYear(tabToLoad);
      await loadYearRows(summary.spreadsheetId, tabToLoad, token);
      showToast(`Terhubung ke "${summary.title}"`);
    } catch (err) {
      if (err instanceof SheetsAuthError) {
        clearAccessToken();
        setNeedsAuth(true);
      }
      setSheetsError(
        err instanceof Error ? err.message : 'Gagal menyiapkan spreadsheet.'
      );
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleConnectSpreadsheetId = async (rawIdOrUrl: string) => {
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    const id = extractSpreadsheetId(rawIdOrUrl);
    if (!id) return;
    setIsSyncingSheets(true);
    setSheetsError(null);
    try {
      const summary = await getSpreadsheetMetadata(id, token);
      persistSpreadsheetId(summary.spreadsheetId);
      setSpreadsheet(summary);
      const currentYear = String(new Date().getFullYear());
      const tabToLoad =
        summary.sheets.find((s) => s.title === currentYear)?.title ||
        summary.sheets[0]?.title ||
        currentYear;
      setSelectedYear(tabToLoad);
      await loadYearRows(summary.spreadsheetId, tabToLoad, token);
      showToast(`Terhubung ke "${summary.title}"`);
    } catch (err) {
      if (err instanceof SheetsAuthError) {
        clearAccessToken();
        setNeedsAuth(true);
      }
      setSheetsError(
        err instanceof Error
          ? err.message
          : 'Gagal membaca Google Spreadsheet tersebut. Pastikan URL/ID benar dan dapat diakses.'
      );
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleCreateYearSheetManual = async (year: string) => {
    const token = getAccessToken();
    if (!token || !spreadsheet) {
      setNeedsAuth(!token);
      return;
    }
    setIsSyncingSheets(true);
    setSheetsError(null);
    try {
      const { createdNew, summary } = await ensureYearSheet(
        spreadsheet.spreadsheetId,
        year,
        token
      );
      setSpreadsheet(summary);
      setSelectedYear(year);
      await loadYearRows(summary.spreadsheetId, year, token);
      showToast(
        createdNew
          ? `Sheet baru "${year}" berhasil dibuat`
          : `Sheet "${year}" sudah tersedia`
      );
    } catch (err) {
      if (err instanceof SheetsAuthError) {
        clearAccessToken();
        setNeedsAuth(true);
      }
      setSheetsError(
        err instanceof Error ? err.message : 'Gagal membuat sheet tahun baru.'
      );
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleConfirmOverwriteRow = async () => {
    if (!overwriteConfirm) return;
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      setOverwriteConfirm(null);
      return;
    }
    setIsSyncingSheets(true);
    setSheetsError(null);
    try {
      await updateExistingSuratRow(
        overwriteConfirm.spreadsheetId,
        overwriteConfirm.year,
        overwriteConfirm.rowNumber,
        overwriteConfirm.draft,
        token
      );
      const refreshed = await fetchRowsForSheet(
        overwriteConfirm.spreadsheetId,
        overwriteConfirm.year,
        token
      );
      setSheetRows(refreshed);
      showToast(
        `Baris ${overwriteConfirm.rowNumber} di Sheet ${overwriteConfirm.year} diperbarui`
      );
      setOverwriteConfirm(null);
    } catch (err) {
      if (err instanceof SheetsAuthError) {
        clearAccessToken();
        setNeedsAuth(true);
      }
      setSheetsError(
        err instanceof Error ? err.message : 'Gagal memperbarui baris di Sheets.'
      );
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleKriteriaChange = (nextKriteria: KriteriaKeberangkatan) => {
    setSurat((prev) => {
      let nextList = [...prev.pegawaiList];
      if (nextKriteria === 'sendiri') {
        nextList = nextList.length > 0 ? [nextList[0]] : [createEmptyPegawai()];
      } else if (nextKriteria === 'tiga_orang') {
        while (nextList.length < 2) {
          nextList.push(createEmptyPegawai(`-${nextList.length + 1}`));
        }
        if (nextList.length > 3) {
          nextList = nextList.slice(0, 3);
        }
      } else if (nextKriteria === 'terlampir') {
        while (nextList.length < 4) {
          nextList.push(createEmptyPegawai(`-${nextList.length + 1}`));
        }
      }
      return {
        ...prev,
        kriteria: nextKriteria,
        pegawaiList: nextList,
      };
    });
  };

  const handleLoadSample = (kriteria: KriteriaKeberangkatan) => {
    const sample = SAMPLE_TEMPLATES[kriteria];
    setSurat({
      ...sample,
      id: `draft-${Date.now()}`,
      pegawaiList: sample.pegawaiList.map((p) => ({ ...p })),
    });
    showToast(
      kriteria === 'sendiri'
        ? 'Contoh Surat Tugas Berangkat Sendiri dimuat'
        : kriteria === 'tiga_orang'
        ? 'Contoh Surat Tugas 2-3 Orang dimuat'
        : 'Contoh Surat Tugas > 3 Orang (Terlampir) dimuat'
    );
  };

  const handleResetBlank = () => {
    const today = new Date().toISOString().slice(0, 10);
    const defaultCount =
      surat.kriteria === 'sendiri' ? 1 : surat.kriteria === 'tiga_orang' ? 2 : 4;
    setSurat((prev) => ({
      ...prev,
      id: `draft-${Date.now()}`,
      dasarAsal: '',
      dasarNomor: '',
      dasarTanggal: today,
      namaKegiatan: '',
      menimbangCustom: '',
      gunakanMenimbangCustom: false,
      lokasiTujuan: '',
      tanggalMulai: today,
      tanggalSelesai: today,
      pegawaiList: Array.from({ length: defaultCount }, (_, i) =>
        createEmptyPegawai(`-${i}`)
      ),
    }));
    showToast('Formulir dikosongkan');
  };

  const updatePegawaiField = (
    index: number,
    field: keyof Omit<Pegawai, 'id'>,
    value: string
  ) => {
    setSurat((prev) => {
      const next = [...prev.pegawaiList];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, pegawaiList: next };
    });
  };

  const handleAddPegawaiSlot = () => {
    setSurat((prev) => ({
      ...prev,
      pegawaiList: [...prev.pegawaiList, createEmptyPegawai()],
    }));
  };

  const handleRemovePegawaiSlot = (index: number) => {
    setSurat((prev) => {
      if (prev.kriteria === 'sendiri' && prev.pegawaiList.length <= 1) return prev;
      if (prev.kriteria === 'tiga_orang' && prev.pegawaiList.length <= 2) return prev;
      if (prev.kriteria === 'terlampir' && prev.pegawaiList.length <= 4) return prev;
      const next = prev.pegawaiList.filter((_, i) => i !== index);
      return { ...prev, pegawaiList: next };
    });
  };

  const handleSavePegawaiToDirectory = (peg: Pegawai) => {
    if (!peg.nama.trim() || !peg.nip.trim()) {
      showToast('Isi Nama dan NIP terlebih dahulu untuk menyimpan ke direktori');
      return;
    }
    const exists = directory.some((d) => d.nip.trim() === peg.nip.trim());
    if (exists) {
      setDirectory((prev) =>
        prev.map((d) =>
          d.nip.trim() === peg.nip.trim()
            ? {
                ...d,
                nama: peg.nama,
                pangkatGolongan: peg.pangkatGolongan,
                jabatan: peg.jabatan,
              }
            : d
        )
      );
      showToast(`Data ${peg.nama} diperbarui di direktori`);
    } else {
      setDirectory((prev) => [
        { ...peg, id: `dir-${Date.now()}` },
        ...prev,
      ]);
      showToast(`${peg.nama} disimpan ke direktori pegawai`);
    }
  };

  const handleSelectSingleFromDir = (peg: Pegawai) => {
    if (dirTargetIndex === null) return;
    setSurat((prev) => {
      const next = [...prev.pegawaiList];
      next[dirTargetIndex] = {
        ...peg,
        id: next[dirTargetIndex]?.id || `peg-${Date.now()}`,
      };
      return { ...prev, pegawaiList: next };
    });
    setDirTargetIndex(null);
  };

  const handleSelectMultipleFromDir = (selectedList: Pegawai[]) => {
    setSurat((prev) => {
      const baseList = dirForceMulti
        ? []
        : prev.pegawaiList.filter(
            (p) => p.nama.trim() || p.nip.trim() || p.jabatan.trim()
          );
      const merged = [...baseList];
      selectedList.forEach((sel) => {
        if (!merged.some((m) => m.nip === sel.nip)) {
          merged.push({ ...sel, id: `peg-${Date.now()}-${Math.random()}` });
        }
      });

      let nextKriteria = prev.kriteria;
      if (merged.length === 1) {
        nextKriteria = 'sendiri';
      } else if (merged.length <= 3) {
        nextKriteria = 'tiga_orang';
      } else {
        nextKriteria = 'terlampir';
      }

      return {
        ...prev,
        kriteria: nextKriteria,
        pegawaiList: merged,
      };
    });
    setDirForceMulti(false);
    showToast(`${selectedList.length} pegawai ditambahkan ke Surat Tugas`);
  };

  const handleSaveToArsip = () => {
    const newEntry: ArsipSurat = {
      id: `arsip-${Date.now()}`,
      savedAt: new Date().toISOString(),
      data: {
        ...surat,
        pegawaiList: surat.pegawaiList.map((p) => ({ ...p })),
      },
    };
    setArsipList((prev) => [newEntry, ...prev]);
    showToast('Surat Tugas disimpan ke Arsip Draft');
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const handleExportDocx = async () => {
    setIsExportingDocx(true);
    try {
      await exportSuratTugasDocx(surat);
      showToast('File Word (.docx) berhasil diunduh');
    } catch (err) {
      console.error(err);
      showToast('Gagal mengekspor file Word (.docx)');
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handleUsePegawaiFromManager = (peg: Pegawai) => {
    setSurat((prev) => {
      const emptyIdx = prev.pegawaiList.findIndex(
        (p) => !p.nama.trim() && !p.nip.trim()
      );
      if (emptyIdx !== -1) {
        const next = [...prev.pegawaiList];
        next[emptyIdx] = { ...peg, id: next[emptyIdx].id };
        return { ...prev, pegawaiList: next };
      }
      if (prev.kriteria === 'sendiri') {
        return { ...prev, pegawaiList: [{ ...peg, id: prev.pegawaiList[0]?.id || peg.id }] };
      }
      const appended = [...prev.pegawaiList, { ...peg, id: `peg-${Date.now()}` }];
      return {
        ...prev,
        kriteria: appended.length > 3 ? 'terlampir' : prev.kriteria,
        pegawaiList: appended,
      };
    });
    setActiveTab('editor');
    showToast(`${peg.nama} dimasukkan ke Surat Tugas`);
  };

  const handleApplyParsedPdf = (
    parsed: ParsedDasarPdfResult,
    fileName: string
  ) => {
    const detected = Array.isArray(parsed.pegawaiTerdeteksi)
      ? parsed.pegawaiTerdeteksi
      : [];

    let resolvedKriteria: KriteriaKeberangkatan = surat.kriteria;
    if (detected.length === 1) {
      resolvedKriteria = 'sendiri';
    } else if (detected.length >= 2 && detected.length <= 3) {
      resolvedKriteria = 'tiga_orang';
    } else if (detected.length >= 4) {
      resolvedKriteria = 'terlampir';
    } else if (
      parsed.kriteriaDisarankan === 'sendiri' ||
      parsed.kriteriaDisarankan === 'tiga_orang' ||
      parsed.kriteriaDisarankan === 'terlampir'
    ) {
      resolvedKriteria = parsed.kriteriaDisarankan;
    }

    setSurat((prev) => {
      let nextPegawaiList: Pegawai[];
      if (detected.length > 0) {
        nextPegawaiList = detected.map((d, i) => ({
          id: `pdf-peg-${Date.now()}-${i}`,
          nama: d.nama,
          nip: d.nip,
          pangkatGolongan: d.pangkatGolongan,
          jabatan: d.jabatan,
        }));
      } else {
        const minCount =
          resolvedKriteria === 'sendiri'
            ? 1
            : resolvedKriteria === 'tiga_orang'
              ? 2
              : 4;
        nextPegawaiList = Array.from({ length: minCount }, (_, i) => ({
          id: `pdf-empty-${Date.now()}-${i}`,
          nama: '',
          nip: '',
          pangkatGolongan: '',
          jabatan: '',
        }));
      }

      const startDate = parsed.tanggalMulai || prev.tanggalMulai;
      const endDate =
        parsed.tanggalSelesai && parsed.tanggalSelesai >= startDate
          ? parsed.tanggalSelesai
          : startDate;

      return {
        ...prev,
        kriteria: resolvedKriteria,
        dasarAsal: parsed.dasarAsal || prev.dasarAsal,
        dasarNomor: parsed.dasarNomor || prev.dasarNomor,
        dasarTanggal: parsed.dasarTanggal || prev.dasarTanggal,
        namaKegiatan: parsed.namaKegiatan || prev.namaKegiatan,
        gunakanMenimbangCustom: false,
        lokasiTujuan: parsed.lokasiTujuan || prev.lokasiTujuan,
        tanggalMulai: startDate,
        tanggalSelesai: endDate,
        pegawaiList: nextPegawaiList,
      };
    });

    const kriteriaLabel =
      resolvedKriteria === 'sendiri'
        ? 'Sendiri (1)'
        : resolvedKriteria === 'tiga_orang'
          ? '2-3 Orang'
          : '> 3 Terlampir';
    const count = detected.length;
    showToast(
      count > 0
        ? `${fileName}: ${count} pegawai terdeteksi · Kriteria ${kriteriaLabel}`
        : `${fileName} terbaca (${kriteriaLabel}), silakan pilih tim dari direktori`
    );
  };

  const canAddMorePegawai =
    (surat.kriteria === 'tiga_orang' && surat.pegawaiList.length < 3) ||
    surat.kriteria === 'terlampir';

  const minPegawaiAllowed =
    surat.kriteria === 'sendiri' ? 1 : surat.kriteria === 'tiga_orang' ? 2 : 4;

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F5] text-slate-900">
      {/* TOP BAR CONTRACT: 3 zones separated by gap-8 */}
      <header className="no-print sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8">
        <a
          href="#editor"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('editor');
          }}
          className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          SiTugas Kemenag Jember
        </a>

        <nav className="flex items-center gap-6 text-sm font-medium overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'editor'
                ? 'text-[#0B5D3B] border-[#0B5D3B]'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Editor Surat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pegawai')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'pegawai'
                ? 'text-[#0B5D3B] border-[#0B5D3B]'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Data Pegawai ({directory.length.toLocaleString('id-ID')})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sheets')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'sheets'
                ? 'text-[#0B5D3B] border-[#0B5D3B]'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Tracking Sheets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('arsip')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'arsip'
                ? 'text-[#0B5D3B] border-[#0B5D3B]'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Arsip Draft ({arsipList.length})
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handlePrintPdf}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] transition-colors whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            Cetak / PDF
          </button>
        </div>
      </header>

      {/* TOAST FEEDBACK */}
      {toastMessage && (
        <div className="no-print fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-lg">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* MAIN CONTENT */}
      {activeTab === 'pegawai' && (
        <main className="flex-1 no-print">
          <PegawaiManager
            directory={directory}
            onAddPegawai={(peg) => {
              setDirectory((prev) => [{ ...peg, id: `dir-${Date.now()}` }, ...prev]);
              showToast(`Pegawai ${peg.nama} ditambahkan`);
            }}
            onUpdatePegawai={(updated) => {
              setDirectory((prev) =>
                prev.map((p) => (p.id === updated.id ? updated : p))
              );
              showToast(`Data ${updated.nama} diperbarui`);
            }}
            onDeletePegawai={(id) => {
              setDirectory((prev) => prev.filter((p) => p.id !== id));
              showToast('Pegawai dihapus dari direktori');
            }}
            onUsePegawaiInSurat={handleUsePegawaiFromManager}
          />
        </main>
      )}

      {activeTab === 'sheets' && (
        <main className="flex-1 no-print">
          <TrackingSheetsManager
            googleUser={googleUser}
            needsAuth={needsAuth}
            isConnecting={isGoogleConnecting}
            isSyncing={isSyncingSheets}
            spreadsheet={spreadsheet}
            selectedYear={selectedYear}
            rows={sheetRows}
            errorMessage={sheetsError}
            onGoogleLogin={() => void handleGoogleLogin()}
            onGoogleLogout={() => void handleGoogleLogout()}
            onAutoSetupSpreadsheet={() => void handleAutoSetupSpreadsheet()}
            onConnectSpreadsheetId={(raw) => void handleConnectSpreadsheetId(raw)}
            onSelectYear={(year) => {
              setSelectedYear(year);
              const token = getAccessToken();
              if (token && spreadsheet) {
                void loadYearRows(spreadsheet.spreadsheetId, year, token);
              }
            }}
            onCreateYearSheet={(year) => void handleCreateYearSheetManual(year)}
            onRefreshRows={() => {
              const token = getAccessToken();
              if (token && spreadsheet) {
                void loadYearRows(spreadsheet.spreadsheetId, selectedYear, token);
              }
            }}
            onLoadTrackedDraft={(draft) => {
              setSurat({
                ...draft,
                pegawaiList: draft.pegawaiList.map((p) => ({ ...p })),
              });
              setActiveTab('editor');
              showToast('Data Surat Tugas dari Google Sheets dimuat ke editor');
            }}
          />
        </main>
      )}

      {activeTab === 'arsip' && (
        <main className="flex-1 no-print">
          <ArsipManager
            arsipList={arsipList}
            onLoadArsip={(item) => {
              setSurat({
                ...item.data,
                pegawaiList: item.data.pegawaiList.map((p) => ({ ...p })),
              });
              setActiveTab('editor');
              showToast('Draft arsip dimuat ke editor');
            }}
            onSyncArsipToSheets={(item) => void syncDraftToGoogleSheets(item.data)}
            onDeleteArsip={(id) => {
              setArsipList((prev) => prev.filter((a) => a.id !== id));
              showToast('Arsip dihapus');
            }}
            onGoToEditor={() => setActiveTab('editor')}
          />
        </main>
      )}

      {/* EDITOR VIEW (stays mounted during print if active, or print preview renders cleanly) */}
      <main
        className={`flex-1 flex flex-col lg:grid lg:grid-cols-[490px_1fr] xl:grid-cols-[520px_1fr] ${
          activeTab !== 'editor' ? 'hidden print:block' : ''
        }`}
      >
        {/* MOBILE PANE SWITCHER */}
        <div className="no-print lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobilePane('form')}
            className={`flex-1 inline-flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-colors ${
              mobilePane === 'form'
                ? 'bg-[#0B5D3B] text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            <FilePenLine className="w-3.5 h-3.5" />
            Form Isian
          </button>
          <button
            type="button"
            onClick={() => setMobilePane('preview')}
            className={`flex-1 inline-flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-colors ${
              mobilePane === 'preview'
                ? 'bg-[#0B5D3B] text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Pratinjau A4
          </button>
        </div>

        {/* LEFT PANE: FORM STUDIO */}
        <section
          className={`no-print bg-white border-r border-slate-200 lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto ${
            mobilePane === 'form' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="p-5 space-y-6">
            {/* 0. DETEKSI OTOMATIS DARI FILE PDF DASAR */}
            <DasarPdfUploader
              directory={directory}
              onApplyParsedResult={handleApplyParsedPdf}
              onOpenDirectoryMulti={() => {
                setDirTargetIndex(null);
                setDirForceMulti(true);
                setDirModalOpen(true);
              }}
            />

            <hr className="border-slate-200" />

            {/* 1. KRITERIA KEBERANGKATAN */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-900">
                  1. Kriteria Keberangkatan
                </label>
                <button
                  type="button"
                  onClick={handleResetBlank}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Kosongkan
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200/80">
                {(
                  [
                    ['sendiri', 'Sendiri (1)'],
                    ['tiga_orang', '2-3 Orang'],
                    ['terlampir', '> 3 Terlampir'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKriteriaChange(key)}
                    className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      surat.kriteria === key
                        ? 'bg-white text-[#0B5D3B] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {surat.kriteria === 'sendiri' &&
                  'Format 1 pegawai langsung di halaman utama tanpa nomor urut.'}
                {surat.kriteria === 'tiga_orang' &&
                  'Format 2–3 pegawai bernomor (1, 2, 3) langsung di halaman utama.'}
                {surat.kriteria === 'terlampir' &&
                  'Untuk 4 orang atau lebih: halaman utama menampilkan "Terlampir" dan tabel Lampiran pada halaman ke-2.'}
              </p>
            </div>

            <hr className="border-slate-200" />

            {/* 2. DASAR SURAT TUGAS */}
            <div className="space-y-3">
              <h2 className="text-xs font-semibold text-slate-900">
                2. Dasar Surat Tugas
              </h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Asal / Sumber Dasar Surat
                </label>
                <input
                  type="text"
                  list="dasar-asal-presets"
                  value={surat.dasarAsal}
                  onChange={(e) =>
                    setSurat((prev) => ({ ...prev, dasarAsal: e.target.value }))
                  }
                  placeholder="Contoh: Surat dari Kepala Kanwil Kemenag Prov. Jawa Timur"
                  className="w-full px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
                <datalist id="dasar-asal-presets">
                  {DASAR_ASAL_PRESETS.map((preset) => (
                    <option key={preset} value={preset} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nomor Surat Dasar
                  </label>
                  <input
                    type="text"
                    value={surat.dasarNomor}
                    onChange={(e) =>
                      setSurat((prev) => ({ ...prev, dasarNomor: e.target.value }))
                    }
                    placeholder="Contoh: 1134/Kw.13.02/PP.02.3/11/2026"
                    className="w-full px-3 py-2 text-sm font-mono-tabular text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Surat Dasar
                  </label>
                  <input
                    type="date"
                    value={surat.dasarTanggal}
                    onChange={(e) =>
                      setSurat((prev) => ({ ...prev, dasarTanggal: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono-tabular text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* 3. KEGIATAN, TUJUAN & WAKTU */}
            <div className="space-y-3">
              <h2 className="text-xs font-semibold text-slate-900">
                3. Kegiatan, Lokasi Tujuan & Tanggal Pelaksanaan
              </h2>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama / Perihal Kegiatan (untuk Menimbang & Untuk)
                </label>
                <textarea
                  rows={2}
                  value={surat.namaKegiatan}
                  onChange={(e) =>
                    setSurat((prev) => ({ ...prev, namaKegiatan: e.target.value }))
                  }
                  placeholder="Contoh: kegiatan Koordinasi dan Sharing Program Bimbingan Masyarakat Islam"
                  className="w-full px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
                <label className="inline-flex items-center gap-2 mt-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={surat.gunakanMenimbangCustom}
                    onChange={(e) =>
                      setSurat((prev) => ({
                        ...prev,
                        gunakanMenimbangCustom: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 text-[#0B5D3B] focus:ring-[#0B5D3B]"
                  />
                  Ubah redaksi lengkap Menimbang huruf a secara manual
                </label>
                {surat.gunakanMenimbangCustom && (
                  <textarea
                    rows={3}
                    value={surat.menimbangCustom}
                    onChange={(e) =>
                      setSurat((prev) => ({
                        ...prev,
                        menimbangCustom: e.target.value,
                      }))
                    }
                    placeholder="Contoh: Bahwa dalam rangka menghadiri ..., maka Aparatur Sipil Negara dibawah ini dipandang mampu..."
                    className="w-full mt-2 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Lokasi Tujuan
                </label>
                <input
                  type="text"
                  value={surat.lokasiTujuan}
                  onChange={(e) =>
                    setSurat((prev) => ({ ...prev, lokasiTujuan: e.target.value }))
                  }
                  placeholder="Contoh: Kantor Kementerian Agama Kabupaten Lumajang"
                  className="w-full px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Mulai Pelaksanaan
                  </label>
                  <input
                    type="date"
                    value={surat.tanggalMulai}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSurat((prev) => ({
                        ...prev,
                        tanggalMulai: val,
                        tanggalSelesai:
                          prev.tanggalSelesai < val ? val : prev.tanggalSelesai,
                      }));
                    }}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Selesai Pelaksanaan
                  </label>
                  <input
                    type="date"
                    value={surat.tanggalSelesai}
                    min={surat.tanggalMulai}
                    onChange={(e) =>
                      setSurat((prev) => ({
                        ...prev,
                        tanggalSelesai: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* 4. DAFTAR PEGAWAI YANG DITUGASKAN */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-semibold text-slate-900">
                    4. Data Pegawai ({surat.pegawaiList.length} Orang)
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDirTargetIndex(surat.kriteria === 'sendiri' ? 0 : null);
                      setDirModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#0B5D3B] bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Pilih dari Direktori
                  </button>
                  {canAddMorePegawai && (
                    <button
                      type="button"
                      onClick={handleAddPegawaiSlot}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Tambah
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {surat.pegawaiList.map((peg, idx) => {
                  const exampleSamples = [
                    {
                      nama: 'Contoh: PETRUS AMAT SUTADI, S.Pd., MM.',
                      nip: 'Contoh: 197307292000031001',
                      pangkat: 'Contoh: Pembina ( IV/a )',
                      jabatan:
                        'Contoh: Penyelenggara Katolik Kantor Kemenag Kab. Jember',
                    },
                    {
                      nama: 'Contoh: Saiful Ulum, SE',
                      nip: 'Contoh: 197006172005011004',
                      pangkat: 'Contoh: Penata Tk.I (III/d)',
                      jabatan:
                        'Contoh: Pembimbing Teknis Urusan Agama Kantor Kemenag Kab. Jember',
                    },
                    {
                      nama: 'Contoh: Linda Novalianasari, SE',
                      nip: 'Contoh: 198111252006042002',
                      pangkat: 'Contoh: Penata Tk.I (III/d)',
                      jabatan:
                        'Contoh: Pembimbing Teknis Urusan Agama Kantor Kemenag Kab. Jember',
                    },
                    {
                      nama: 'Contoh: Ahmad Hariyadi',
                      nip: 'Contoh: 198909132025211010',
                      pangkat: 'Contoh: V',
                      jabatan:
                        'Contoh: Pengadministrasi Perkantoran Kantor Kemenag Kab. Jember',
                    },
                  ];
                  const ph = exampleSamples[idx % exampleSamples.length];

                  return (
                    <div
                      key={peg.id}
                      className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-700 font-mono-tabular">
                          Pegawai {idx + 1}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setDirTargetIndex(idx);
                              setDirModalOpen(true);
                            }}
                            className="text-xs font-medium text-[#0B5D3B] hover:underline whitespace-nowrap shrink-0"
                          >
                            Isi dari Direktori
                          </button>
                          <span className="text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSavePegawaiToDirectory(peg)}
                            title="Simpan pegawai ini ke Direktori Pegawai"
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
                          >
                            <UserCheck className="w-3 h-3" />
                            Simpan
                          </button>
                          {surat.pegawaiList.length > minPegawaiAllowed && (
                            <button
                              type="button"
                              onClick={() => handleRemovePegawaiSlot(idx)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                              aria-label={`Hapus pegawai ${idx + 1}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                            Nama Lengkap & Gelar
                          </label>
                          <input
                            type="text"
                            value={peg.nama}
                            onChange={(e) =>
                              updatePegawaiField(idx, 'nama', e.target.value)
                            }
                            placeholder={ph.nama}
                            className="w-full px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                            NIP / NI PPPK
                          </label>
                          <input
                            type="text"
                            value={peg.nip}
                            onChange={(e) =>
                              updatePegawaiField(idx, 'nip', e.target.value)
                            }
                            placeholder={ph.nip}
                            className="w-full px-2.5 py-1.5 text-sm font-mono-tabular text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                            Pangkat / Golongan
                          </label>
                          <input
                            type="text"
                            list="pangkat-presets-editor"
                            value={peg.pangkatGolongan}
                            onChange={(e) =>
                              updatePegawaiField(
                                idx,
                                'pangkatGolongan',
                                e.target.value
                              )
                            }
                            placeholder={ph.pangkat}
                            className="w-full px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                            Jabatan
                          </label>
                          <input
                            type="text"
                            value={peg.jabatan}
                            onChange={(e) =>
                              updatePegawaiField(idx, 'jabatan', e.target.value)
                            }
                            placeholder={ph.jabatan}
                            className="w-full px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {canAddMorePegawai && (
                <button
                  type="button"
                  onClick={handleAddPegawaiSlot}
                  className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-[#0B5D3B] bg-emerald-50/80 hover:bg-emerald-100 border border-dashed border-emerald-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Pegawai yang Berangkat
                  {surat.kriteria === 'tiga_orang' ? ' (Maks. 3 Orang)' : ''}
                </button>
              )}

              <datalist id="pangkat-presets-editor">
                {PANGKAT_GOLONGAN_PRESETS.map((pg) => (
                  <option key={pg} value={pg} />
                ))}
              </datalist>
            </div>

            <hr className="border-slate-200" />

            {/* 5. PENGATURAN PENOMORAN SRIKANDI, KOP & PENANDATANGAN */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between py-1 text-xs font-semibold text-slate-900"
              >
                <span>5. Pengaturan Srikandi, Kop Surat & Penandatangan</span>
                {showAdvanced ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-3 pt-2">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={surat.modeSrikandi}
                        onChange={(e) =>
                          setSurat((prev) => ({
                            ...prev,
                            modeSrikandi: e.target.checked,
                          }))
                        }
                        className="mt-0.5 rounded border-slate-300 text-[#0B5D3B] focus:ring-[#0B5D3B]"
                      />
                      <div>
                        <div className="text-xs font-semibold text-slate-900">
                          Gunakan Variabel Template Srikandi
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5">
                          Menampilkan{' '}
                          <span className="font-mono-tabular">${'{nomor_naskah}'}</span>,{' '}
                          <span className="font-mono-tabular">${'{tanggal_naskah}'}</span>,{' '}
                          <span className="font-mono-tabular">${'{ttd_pengirim}'}</span>, dan{' '}
                          <span className="font-mono-tabular">${'{nama_pengirim}'}</span>{' '}
                          sesuai contoh PDF Srikandi.
                        </div>
                      </div>
                    </label>
                  </div>

                  {!surat.modeSrikandi && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Nomor Surat Tugas
                        </label>
                        <input
                          type="text"
                          value={surat.nomorSurat}
                          onChange={(e) =>
                            setSurat((prev) => ({
                              ...prev,
                              nomorSurat: e.target.value,
                            }))
                          }
                          placeholder="B-1024/Kk.13.32.01/KP.01/11/2026"
                          className="w-full px-3 py-2 text-xs font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Tanggal Surat Tugas
                        </label>
                        <input
                          type="date"
                          value={surat.tanggalNaskah}
                          onChange={(e) =>
                            setSurat((prev) => ({
                              ...prev,
                              tanggalNaskah: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 text-xs font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Varian Kontak Kop Surat
                    </label>
                    <select
                      value={surat.kopVarian}
                      onChange={(e) =>
                        setSurat((prev) => ({
                          ...prev,
                          kopVarian: e.target.value as KopVarianId,
                        }))
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                    >
                      {Object.values(KOP_VARIAN_OPTIONS).map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Jabatan Penandatangan
                      </label>
                      <input
                        type="text"
                        value={surat.jabatanPenandatangan}
                        onChange={(e) =>
                          setSurat((prev) => ({
                            ...prev,
                            jabatanPenandatangan: e.target.value,
                          }))
                        }
                        placeholder="Kepala Kantor"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nama Penandatangan (Non-Srikandi)
                      </label>
                      <input
                        type="text"
                        value={surat.namaPenandatangan}
                        onChange={(e) =>
                          setSurat((prev) => ({
                            ...prev,
                            namaPenandatangan: e.target.value,
                          }))
                        }
                        placeholder="Dr. SANTOSO, S.Ag, M.Pd."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT PANE: LIVE A4 PREVIEW CANVAS */}
        <section
          className={`bg-[#E6EAE8] flex flex-col lg:h-[calc(100vh-3.5rem)] print-only-container ${
            mobilePane === 'preview' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* WORKSPACE TOOLBAR */}
          <div className="no-print bg-white/95 backdrop-blur-xs border-b border-slate-200 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
                Muat Contoh:
              </span>
              <button
                type="button"
                onClick={() => handleLoadSample('sendiri')}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                1 Orang
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample('tiga_orang')}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                2-3 Orang
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample('terlampir')}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                &gt; 3 Terlampir
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1 p-0.5 bg-slate-100 rounded-md border border-slate-200">
                {[0.7, 0.85, 1].map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZoom(z)}
                    className={`px-2 py-1 text-xs font-mono-tabular rounded transition-colors ${
                      zoom === z
                        ? 'bg-white text-slate-900 shadow-xs font-medium'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {Math.round(z * 100)}%
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleSaveToArsip}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                Simpan Arsip
              </button>

              <button
                type="button"
                disabled={isSyncingSheets}
                onClick={() => void syncDraftToGoogleSheets(surat)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0B5D3B] bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {isSyncingSheets ? 'Menyimpan...' : 'Simpan ke Sheets'}
              </button>

              <button
                type="button"
                disabled={isExportingDocx}
                onClick={handleExportDocx}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                {isExportingDocx ? 'Menyiapkan...' : 'Unduh Word (.docx)'}
              </button>
            </div>
          </div>

          {/* A4 DOCUMENT VIEWPORT */}
          <div className="flex-1 overflow-auto p-6 sm:p-8 flex justify-center items-start print-only-container">
            <SuratPreview data={surat} zoom={zoom} />
          </div>
        </section>
      </main>

      {/* DIRECTORY PICKER MODAL */}
      <PegawaiDirectoryModal
        isOpen={dirModalOpen}
        directory={directory}
        multiSelect={
          dirForceMulti ||
          (dirTargetIndex === null && surat.kriteria !== 'sendiri')
        }
        alreadySelectedNips={surat.pegawaiList.map((p) => p.nip)}
        onClose={() => {
          setDirModalOpen(false);
          setDirTargetIndex(null);
          setDirForceMulti(false);
        }}
        onSelectSingle={(peg) => {
          if (dirTargetIndex !== null) {
            handleSelectSingleFromDir(peg);
          } else {
            // Single mode directly from top button
            setSurat((prev) => ({
              ...prev,
              pegawaiList: [{ ...peg, id: prev.pegawaiList[0]?.id || peg.id }],
            }));
          }
        }}
        onSelectMultiple={handleSelectMultipleFromDir}
      />

      {/* GOOGLE SHEETS SIGN-IN PROMPT MODAL */}
      <SheetsAuthPromptModal
        isOpen={authPromptDraft !== null}
        targetYear={authPromptDraft ? getTargetYearForSurat(authPromptDraft) : String(new Date().getFullYear())}
        isConnecting={isGoogleConnecting}
        onSignIn={() => void handleGoogleLogin()}
        onClose={() => setAuthPromptDraft(null)}
      />

      {/* GOOGLE SHEETS OVERWRITE CONFIRMATION MODAL */}
      <ConfirmSheetsOverwriteModal
        isOpen={overwriteConfirm !== null}
        year={overwriteConfirm?.year || ''}
        rowNumber={overwriteConfirm?.rowNumber || 0}
        namaKegiatan={overwriteConfirm?.draft.namaKegiatan || ''}
        isBusy={isSyncingSheets}
        onConfirm={() => void handleConfirmOverwriteRow()}
        onCancel={() => setOverwriteConfirm(null)}
      />
    </div>
  );
}
