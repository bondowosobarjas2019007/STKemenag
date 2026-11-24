import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Crown,
  Download,
  Eye,
  FilePenLine,
  FileSpreadsheet,
  LogOut,
  Menu,
  Monitor,
  Plus,
  Printer,
  RotateCcw,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  User as UserIcon,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { ArsipManager } from './components/ArsipManager';
import {
  ConfirmDocxExportModal,
  ConfirmSheetsOverwriteModal,
  DuplicateSuratWarningModal,
  SheetsAuthPromptModal,
} from './components/ConfirmSheetsActionModal';
import {
  DasarPdfUploader,
  ParsedDasarPdfResult,
} from './components/DasarPdfUploader';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { PegawaiDirectoryModal } from './components/PegawaiDirectoryModal';
import { DukImportMode, PegawaiManager } from './components/PegawaiManager';
import { SuratPreview } from './components/SuratPreview';
import {
  applyThemeModeToDom,
  readInitialThemeMode,
  ThemeMode,
  ThemeSwitcher,
} from './components/ThemeSwitcher';
import { TrackingSheetsManager } from './components/TrackingSheetsManager';
import { useViewport, ViewportMode } from './contexts/ViewportContext';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  isAdminEmail,
  logoutGoogle,
} from './services/googleAuth';
import {
  appendSuratToYearSheet,
  checkExistingRecordRow,
  DuplicateSuratMatch,
  ensureBridgeYearSheet,
  ensureYearSheet,
  extractSpreadsheetId,
  fetchBridgeYearRows,
  fetchRowsForSheet,
  fetchSheetsBridgeStatus,
  findDuplicateTrackedRow,
  findOrCreateTrackingSpreadsheet,
  generateSuratFingerprint,
  getSpreadsheetMetadata,
  getTargetYearForSurat,
  isOwnerAccount,
  OWNER_GOOGLE_EMAIL,
  setSpreadsheetViewOnlyAndProtected,
  SheetsAuthError,
  SpreadsheetSummary,
  TrackedSuratRow,
  updateExistingSuratRow,
  upsertSuratViaBridge,
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
  BRIDGE_URL: 'situgas_kemenag_jember_bridge_url_v1',
};

function computeSuratSignature(data: SuratTugasData): string {
  return JSON.stringify(data);
}

function isSuratReadyForTracking(data: SuratTugasData): boolean {
  const hasKegiatan = Boolean(data.namaKegiatan.trim() || data.dasarNomor.trim());
  const hasPegawai = data.pegawaiList.some(
    (p) => Boolean(p.nama.trim()) || Boolean(p.nip.trim())
  );
  return hasKegiatan && hasPegawai;
}

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
  const [isProtectingSheets, setIsProtectingSheets] = useState<boolean>(false);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  const [savedSpreadsheetId, setSavedSpreadsheetId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.SHEETS_ID) || '';
    } catch {
      return '';
    }
  });
  const [localBridgeUrl, setLocalBridgeUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.BRIDGE_URL) || '';
    } catch {
      return '';
    }
  });
  const [serverBridgeConfigured, setServerBridgeConfigured] =
    useState<boolean>(false);
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
    viaBridge?: boolean;
  } | null>(null);
  const [lastSyncedSignature, setLastSyncedSignature] = useState<string>('');
  const [pendingOutputAction, setPendingOutputAction] = useState<
    'print' | 'docx' | null
  >(null);
  const [docxConfirmOpen, setDocxConfirmOpen] = useState<boolean>(false);
  const [isProcessingDocxConfirm, setIsProcessingDocxConfirm] =
    useState<boolean>(false);
  const [docxConfirmError, setDocxConfirmError] = useState<string | null>(null);
  const [copiedSourceRef, setCopiedSourceRef] = useState<{
    sourceId: string;
    fingerprint: string;
  } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    draft: SuratTugasData;
    targetYear: string;
    match: DuplicateSuratMatch;
    spreadsheetId: string;
    viaBridge: boolean;
  } | null>(null);
  const [duplicateBusyAction, setDuplicateBusyAction] = useState<
    'download_only' | 'overwrite' | 'save_new' | null
  >(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const {
    viewportMode,
    setViewportMode,
    toggleMobileDesktop,
    isForcedMobile,
    isMobileLayout,
  } = useViewport();

  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);
  const [roleMenuOpen, setRoleMenuOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const roleMenuRef = useRef<HTMLDivElement | null>(null);
  const adminWelcomedEmailRef = useRef<string | null>(null);

  const isOwner = isOwnerAccount(googleUser?.email) || isAdminEmail(googleUser?.email);
  const isAdminMode = isOwner && !needsAuth;
  const bridgeConnected = serverBridgeConfigured || Boolean(localBridgeUrl.trim());
  const bridgeSource: 'server' | 'local' | 'none' = serverBridgeConfigured
    ? 'server'
    : localBridgeUrl.trim()
      ? 'local'
      : 'none';
  const customBridgeHeader = serverBridgeConfigured
    ? undefined
    : localBridgeUrl.trim() || undefined;

  useEffect(() => {
    applyThemeModeToDom(themeMode);
  }, [themeMode]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activeTab, isMobileLayout]);

  useEffect(() => {
    if (!copiedSourceRef) return;
    if (surat.id !== copiedSourceRef.sourceId) {
      setCopiedSourceRef(null);
      return;
    }
    if (generateSuratFingerprint(surat) !== copiedSourceRef.fingerprint) {
      const nextId = `draft-${Date.now()}`;
      setCopiedSourceRef(null);
      setSurat((prev) =>
        prev.id === copiedSourceRef.sourceId ? { ...prev, id: nextId } : prev
      );
    }
  }, [surat, copiedSourceRef]);

  useEffect(() => {
    if (!roleMenuOpen && !mobileMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        roleMenuOpen &&
        roleMenuRef.current &&
        !roleMenuRef.current.contains(event.target as Node)
      ) {
        setRoleMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRoleMenuOpen(false);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [roleMenuOpen, mobileMenuOpen]);

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

  const loadBridgeYearData = useCallback(
    async (yearTitle: string, webhookHeader?: string) => {
      setIsSyncingSheets(true);
      setSheetsError(null);
      try {
        const res = await fetchBridgeYearRows(yearTitle, webhookHeader);
        setSpreadsheet(res.summary);
        setSheetRows(res.rows);
      } catch (err) {
        setSheetsError(
          err instanceof Error
            ? err.message
            : 'Gagal memuat data dari Jembatan Google Sheets.'
        );
      } finally {
        setIsSyncingSheets(false);
      }
    },
    []
  );

  // Check if central Apps Script Bridge is configured on server (or local browser)
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const status = await fetchSheetsBridgeStatus(localBridgeUrl || undefined);
        if (!active) return;
        setServerBridgeConfigured(status.serverConfigured);
        if (status.bridgeConfigured) {
          const headerOverride = localBridgeUrl.trim() || undefined;
          const res = await fetchBridgeYearRows(selectedYear, headerOverride);
          if (!active) return;
          setSpreadsheet(res.summary);
          setSheetRows(res.rows);
        }
      } catch {
        // Bridge optional until owner sets APPS_SCRIPT_WEBHOOK_URL
      }
    })();
    return () => {
      active = false;
    };
  }, [localBridgeUrl]);

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

  const runOutputAction = useCallback(
    async (action: 'print' | 'docx', targetSurat: SuratTugasData) => {
      if (action === 'print') {
        window.setTimeout(() => {
          window.print();
        }, 80);
      } else {
        setIsExportingDocx(true);
        try {
          await exportSuratTugasDocx(targetSurat);
          showToast('Tercatat di Google Sheets & file Word (.docx) diunduh');
        } catch (err) {
          console.error(err);
          showToast('Gagal mengekspor file Word (.docx)');
        } finally {
          setIsExportingDocx(false);
        }
      }
    },
    [showToast]
  );

  const upsertLocalDraftEntry = useCallback(
    (targetSurat: SuratTugasData, status: 'Draft' | 'Tercatat') => {
      const cloned: SuratTugasData = {
        ...targetSurat,
        statusSurat: status === 'Tercatat' ? 'Tercatat / Final' : 'Draft',
        pegawaiList: targetSurat.pegawaiList.map((p) => ({ ...p })),
      };
      const nowIso = new Date().toISOString();
      setArsipList((prev) => {
        const existingIdx = prev.findIndex((item) => item.data.id === cloned.id);
        if (existingIdx !== -1) {
          const existing = prev[existingIdx];
          const updated: ArsipSurat = {
            ...existing,
            savedAt: nowIso,
            status,
            data: cloned,
          };
          return [updated, ...prev.filter((_, i) => i !== existingIdx)];
        }
        return [
          {
            id: `arsip-${Date.now()}`,
            savedAt: nowIso,
            status,
            data: cloned,
          },
          ...prev,
        ];
      });
    },
    []
  );

  const syncDraftToGoogleSheets = useCallback(
    async (
      draft: SuratTugasData,
      tokenOverride?: string,
      afterAction?: 'print' | 'docx' | null,
      ownerEmailOverride?: string | null
    ): Promise<boolean> => {
      const token = tokenOverride || getAccessToken();
      const targetYear = getTargetYearForSurat(draft);
      const effectiveEmail = ownerEmailOverride ?? googleUser?.email;
      const canUseOwnerDirect = Boolean(token) && isOwnerAccount(effectiveEmail);

      // 1. Prefer direct Owner OAuth if logged in as bondowosobarjas2019.007@gmail.com
      if (canUseOwnerDirect && token) {
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
            setPendingOutputAction(afterAction || null);
            setOverwriteConfirm({
              spreadsheetId: ensuredSummary.spreadsheetId,
              year: targetYear,
              rowNumber: existingRowNumber,
              draft: {
                ...draft,
                pegawaiList: draft.pegawaiList.map((p) => ({ ...p })),
              },
              viaBridge: false,
            });
            setIsSyncingSheets(false);
            return false;
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
          setLastSyncedSignature(computeSuratSignature(draft));
          upsertLocalDraftEntry(draft, 'Tercatat');
          setPendingOutputAction(null);

          showToast(
            createdNew
              ? `Sheet baru "${targetYear}" dibuat & Surat Tugas tersimpan ke Google Sheets`
              : `Tersimpan ke Google Sheets Pemilik (Sheet ${targetYear})`
          );

          if (afterAction) {
            await runOutputAction(afterAction, draft);
          }
          return true;
        } catch (err) {
          if (err instanceof SheetsAuthError) {
            clearAccessToken();
            setNeedsAuth(true);
            setPendingOutputAction(afterAction || null);
            setAuthPromptDraft(draft);
            return false;
          }
          const msg =
            err instanceof Error
              ? err.message
              : 'Gagal menyimpan ke Google Sheets.';
          setSheetsError(msg);
          showToast(msg);
          return false;
        } finally {
          setIsSyncingSheets(false);
        }
      }

      // 2. Centralized Bridge Relay (for other users without Owner Google login)
      if (bridgeConnected) {
        setIsSyncingSheets(true);
        setSheetsError(null);
        try {
          const res = await upsertSuratViaBridge(
            targetYear,
            draft,
            false,
            customBridgeHeader
          );

          if (res.needsOverwriteConfirm && res.existingRowNumber) {
            setPendingOutputAction(afterAction || null);
            setOverwriteConfirm({
              spreadsheetId: res.spreadsheetId || 'owner-sheet',
              year: targetYear,
              rowNumber: res.existingRowNumber,
              draft: {
                ...draft,
                pegawaiList: draft.pegawaiList.map((p) => ({ ...p })),
              },
              viaBridge: true,
            });
            setIsSyncingSheets(false);
            return false;
          }

          setSelectedYear(targetYear);
          await loadBridgeYearData(targetYear, customBridgeHeader);
          setLastSyncedSignature(computeSuratSignature(draft));
          upsertLocalDraftEntry(draft, 'Tercatat');
          setPendingOutputAction(null);

          showToast(
            res.createdNew
              ? `Sheet baru "${targetYear}" dibuat & tersimpan ke Spreadsheet Pemilik`
              : `Tersimpan ke Spreadsheet Pemilik (Sheet ${targetYear})`
          );

          if (afterAction) {
            await runOutputAction(afterAction, draft);
          }
          return true;
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : 'Gagal menyimpan ke Spreadsheet Pemilik.';
          setSheetsError(msg);
          showToast(msg);
          return false;
        } finally {
          setIsSyncingSheets(false);
        }
      }

      // 3. Neither Owner OAuth nor Bridge is configured -> block output & prompt
      setNeedsAuth(true);
      setPendingOutputAction(afterAction || null);
      setAuthPromptDraft(draft);
      return false;
    },
    [
      bridgeConnected,
      customBridgeHeader,
      ensureConnectedSpreadsheet,
      googleUser?.email,
      loadBridgeYearData,
      runOutputAction,
      showToast,
      upsertLocalDraftEntry,
    ]
  );

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        if (!isOwnerAccount(user.email)) {
          setNeedsAuth(true);
          adminWelcomedEmailRef.current = null;
          setSheetsError(
            `Akun ${user.email} bukan pemilik database (${OWNER_GOOGLE_EMAIL}). Penyimpanan database hanya terpusat ke spreadsheet akun pemilik.`
          );
          return;
        }
        setNeedsAuth(false);
        setSheetsError(null);
        if (user.email && adminWelcomedEmailRef.current !== user.email) {
          adminWelcomedEmailRef.current = user.email;
          showToast(`Selamat datang, Admin (${user.email}). Akses penuh aktif.`);
        }
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
        adminWelcomedEmailRef.current = null;
      }
    );
    return unsubscribe;
  }, [loadYearRows, savedSpreadsheetId, selectedYear, showToast]);

  const handleGoogleLogin = async () => {
    setIsGoogleConnecting(true);
    setSheetsError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        if (!isOwnerAccount(res.user.email)) {
          await logoutGoogle();
          setGoogleUser(null);
          setNeedsAuth(true);
          adminWelcomedEmailRef.current = null;
          const msg = `Akses ditolak: akun ${res.user.email} bukan pemilik database (${OWNER_GOOGLE_EMAIL}). Hanya akun pemilik yang dapat menghubungkan spreadsheet utama.`;
          setSheetsError(msg);
          showToast(msg);
          return;
        }

        const adminEmail = res.user.email || OWNER_GOOGLE_EMAIL;
        adminWelcomedEmailRef.current = adminEmail;
        setGoogleUser(res.user);
        setNeedsAuth(false);
        setRoleMenuOpen(false);
        showToast(`Selamat datang, Admin (${adminEmail}). Akses penuh aktif.`);

        const draftToSync = authPromptDraft;
        const queuedAction = pendingOutputAction;
        setAuthPromptDraft(null);
        if (draftToSync) {
          await syncDraftToGoogleSheets(
            draftToSync,
            res.accessToken,
            queuedAction,
            res.user.email
          );
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
    adminWelcomedEmailRef.current = null;
    setRoleMenuOpen(false);
    setGoogleUser(null);
    setNeedsAuth(true);
    if (!bridgeConnected) {
      setSpreadsheet(null);
      setSheetRows([]);
    }
    showToast('Sesi Admin diputuskan (Kembali ke Mode: Operator)');
  };

  const handleAutoSetupSpreadsheet = async () => {
    const token = getAccessToken();
    if (!token || !isOwner) {
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
    if (!token || !isOwner) {
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
          : 'Gagal membaca Google Spreadsheet tersebut. Pastikan URL/ID benar dan dimiliki akun Anda.'
      );
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleProtectSpreadsheet = async () => {
    const token = getAccessToken();
    if (!token || !isOwner || !spreadsheet) {
      showToast('Masuk sebagai pemilik terlebih dahulu.');
      return;
    }
    setIsProtectingSheets(true);
    setSheetsError(null);
    try {
      const res = await setSpreadsheetViewOnlyAndProtected(
        spreadsheet.spreadsheetId,
        token
      );
      showToast(
        res.protectedTabsCount > 0
          ? `Spreadsheet dikunci View-Only & ${res.protectedTabsCount} sheet diproteksi dari edit langsung`
          : 'Spreadsheet dikunci View-Only (hanya dapat diedit oleh pemilik / via aplikasi)'
      );
    } catch (err) {
      setSheetsError(
        err instanceof Error
          ? err.message
          : 'Gagal mengunci proteksi Google Spreadsheet.'
      );
    } finally {
      setIsProtectingSheets(false);
    }
  };

  const handleSaveBridgeUrl = async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    setIsSyncingSheets(true);
    setSheetsError(null);
    try {
      const status = await fetchSheetsBridgeStatus(trimmed);
      if (!status.bridgeConfigured) {
        throw new Error(
          'URL Apps Script tidak valid. Harus berbentuk https://script.google.com/macros/s/.../exec'
        );
      }
      const res = await fetchBridgeYearRows(selectedYear, trimmed);
      try {
        localStorage.setItem(STORAGE_KEYS.BRIDGE_URL, trimmed);
      } catch {
        // ignore storage quota errors
      }
      setLocalBridgeUrl(trimmed);
      setSpreadsheet(res.summary);
      setSheetRows(res.rows);
      showToast('Jembatan Apps Script terhubung & siap digunakan');
    } catch (err) {
      setSheetsError(
        err instanceof Error
          ? err.message
          : 'Gagal menguji URL Web App Apps Script.'
      );
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleClearLocalBridgeUrl = () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.BRIDGE_URL);
    } catch {
      // ignore storage errors
    }
    setLocalBridgeUrl('');
    showToast('URL Bridge lokal dihapus');
  };

  const handleCreateYearSheetManual = async (year: string) => {
    const token = getAccessToken();
    if (isOwner && token && spreadsheet) {
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
      return;
    }

    if (bridgeConnected) {
      setIsSyncingSheets(true);
      setSheetsError(null);
      try {
        const { createdNew, summary } = await ensureBridgeYearSheet(
          year,
          customBridgeHeader
        );
        setSpreadsheet(summary);
        setSelectedYear(year);
        await loadBridgeYearData(year, customBridgeHeader);
        showToast(
          createdNew
            ? `Sheet baru "${year}" berhasil dibuat di Spreadsheet Pemilik`
            : `Sheet "${year}" sudah tersedia`
        );
      } catch (err) {
        setSheetsError(
          err instanceof Error ? err.message : 'Gagal membuat sheet tahun baru.'
        );
      } finally {
        setIsSyncingSheets(false);
      }
      return;
    }

    setNeedsAuth(true);
  };

  const handleConfirmOverwriteRow = async () => {
    if (!overwriteConfirm) return;
    const queuedAction = pendingOutputAction;

    if (overwriteConfirm.viaBridge) {
      setIsSyncingSheets(true);
      setSheetsError(null);
      try {
        await upsertSuratViaBridge(
          overwriteConfirm.year,
          overwriteConfirm.draft,
          true,
          customBridgeHeader
        );
        await loadBridgeYearData(overwriteConfirm.year, customBridgeHeader);
        setLastSyncedSignature(computeSuratSignature(overwriteConfirm.draft));
        upsertLocalDraftEntry(overwriteConfirm.draft, 'Tercatat');
        const savedDraft = overwriteConfirm.draft;
        showToast(
          `Baris ${overwriteConfirm.rowNumber} di Sheet ${overwriteConfirm.year} diperbarui`
        );
        setOverwriteConfirm(null);
        setPendingOutputAction(null);
        if (queuedAction) {
          await runOutputAction(queuedAction, savedDraft);
        }
      } catch (err) {
        setSheetsError(
          err instanceof Error
            ? err.message
            : 'Gagal memperbarui baris melalui Jembatan Sheets.'
        );
      } finally {
        setIsSyncingSheets(false);
      }
      return;
    }

    const token = getAccessToken();
    if (!token || !isOwner) {
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
      setLastSyncedSignature(computeSuratSignature(overwriteConfirm.draft));
      upsertLocalDraftEntry(overwriteConfirm.draft, 'Tercatat');
      const savedDraft = overwriteConfirm.draft;
      showToast(
        `Baris ${overwriteConfirm.rowNumber} di Sheet ${overwriteConfirm.year} diperbarui`
      );
      setOverwriteConfirm(null);
      setPendingOutputAction(null);
      if (queuedAction) {
        await runOutputAction(queuedAction, savedDraft);
      }
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

  const handleSaveToDraft = () => {
    upsertLocalDraftEntry(surat, 'Draft');
    showToast('Surat berhasil disimpan ke Draft');
  };

  const handlePrintPdf = async () => {
    if (!isSuratReadyForTracking(surat)) {
      showToast(
        'Lengkapi isi Surat Tugas (kegiatan/dasar & pegawai) terlebih dahulu sebelum mencetak'
      );
      return;
    }
    if (lastSyncedSignature === computeSuratSignature(surat)) {
      window.print();
      return;
    }
    await syncDraftToGoogleSheets(surat, undefined, 'print');
  };

  const handleExportDocx = () => {
    if (!isSuratReadyForTracking(surat)) {
      showToast(
        'Lengkapi isi Surat Tugas (kegiatan/dasar & pegawai) terlebih dahulu sebelum mengunduh'
      );
      return;
    }
    setDocxConfirmError(null);
    setDocxConfirmOpen(true);
  };

  const handleConfirmRecordAndDownloadDocx = async () => {
    if (isProcessingDocxConfirm) return;
    setIsProcessingDocxConfirm(true);
    setDocxConfirmError(null);

    const finalSurat: SuratTugasData = {
      ...surat,
      statusSurat: 'Tercatat / Final',
      pegawaiList: surat.pegawaiList.map((p) => ({ ...p })),
    };
    const targetYear = getTargetYearForSurat(finalSurat);
    const token = getAccessToken();
    const canUseOwnerDirect = Boolean(token) && isOwnerAccount(googleUser?.email);

    try {
      // Langkah A: Cek data existing di tab tahun berjalan untuk pencegahan duplikasi
      if (bridgeConnected) {
        const bridgeRes = await fetchBridgeYearRows(targetYear, customBridgeHeader);
        setSpreadsheet(bridgeRes.summary);
        setSelectedYear(targetYear);
        setSheetRows(bridgeRes.rows);

        const match = findDuplicateTrackedRow(finalSurat, bridgeRes.rows);
        if (match) {
          setDocxConfirmOpen(false);
          setDocxConfirmError(null);
          setDuplicateError(null);
          setDuplicateWarning({
            draft: finalSurat,
            targetYear,
            match,
            spreadsheetId: bridgeRes.summary.spreadsheetId,
            viaBridge: true,
          });
          return;
        }

        await upsertSuratViaBridge(
          targetYear,
          finalSurat,
          false,
          customBridgeHeader
        );
        void loadBridgeYearData(targetYear, customBridgeHeader);
      } else if (canUseOwnerDirect && token) {
        const summary = await ensureConnectedSpreadsheet(token, targetYear);
        const { summary: ensuredSummary } = await ensureYearSheet(
          summary.spreadsheetId,
          targetYear,
          token
        );
        setSpreadsheet(ensuredSummary);
        setSelectedYear(targetYear);

        const existingRows = await fetchRowsForSheet(
          ensuredSummary.spreadsheetId,
          targetYear,
          token
        );
        setSheetRows(existingRows);

        const match = findDuplicateTrackedRow(finalSurat, existingRows);
        if (match) {
          setDocxConfirmOpen(false);
          setDocxConfirmError(null);
          setDuplicateError(null);
          setDuplicateWarning({
            draft: finalSurat,
            targetYear,
            match,
            spreadsheetId: ensuredSummary.spreadsheetId,
            viaBridge: false,
          });
          return;
        }

        const { nextRowNumberDisplay } = await checkExistingRecordRow(
          ensuredSummary.spreadsheetId,
          targetYear,
          finalSurat.id,
          token
        );

        await appendSuratToYearSheet(
          ensuredSummary.spreadsheetId,
          targetYear,
          nextRowNumberDisplay,
          finalSurat,
          token
        );

        const refreshed = await fetchRowsForSheet(
          ensuredSummary.spreadsheetId,
          targetYear,
          token
        );
        setSheetRows(refreshed);
      } else {
        throw new Error(
          'Jembatan Apps Script (APPS_SCRIPT_WEBHOOK_URL) belum aktif dan akun Google Pemilik belum terhubung.'
        );
      }

      // Perbarui status lokal & form aktif menjadi Tercatat
      setCopiedSourceRef(null);
      setSurat(finalSurat);
      setLastSyncedSignature(computeSuratSignature(finalSurat));
      upsertLocalDraftEntry(finalSurat, 'Tercatat');

      // Langkah B: Unduh file .docx segera setelah pencatatan Google Sheets berhasil
      setIsExportingDocx(true);
      try {
        await exportSuratTugasDocx(finalSurat);
      } finally {
        setIsExportingDocx(false);
      }

      setDocxConfirmOpen(false);
      setDocxConfirmError(null);
      showToast('Surat berhasil dicatat di Worksheet dan file .docx diunduh');
    } catch (err) {
      if (err instanceof SheetsAuthError) {
        clearAccessToken();
        setNeedsAuth(true);
      }
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal mencatat data ke Google Sheets. Periksa koneksi internet atau konfigurasi Apps Script.';
      setDocxConfirmError(msg);
    } finally {
      setIsProcessingDocxConfirm(false);
    }
  };

  const handleForceDownloadDocxOnly = async () => {
    if (isProcessingDocxConfirm) return;
    setIsProcessingDocxConfirm(true);
    setIsExportingDocx(true);
    try {
      await exportSuratTugasDocx(surat);
      setDocxConfirmOpen(false);
      setDocxConfirmError(null);
      showToast('File .docx diunduh (belum tercatat di Worksheet Google Sheets)');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal mengekspor file .docx.';
      setDocxConfirmError(msg);
    } finally {
      setIsExportingDocx(false);
      setIsProcessingDocxConfirm(false);
    }
  };

  const handleDuplicateDownloadOnly = async () => {
    if (!duplicateWarning || duplicateBusyAction) return;
    setDuplicateBusyAction('download_only');
    setDuplicateError(null);
    setIsExportingDocx(true);
    try {
      await exportSuratTugasDocx(duplicateWarning.draft);
      setDuplicateWarning(null);
      showToast('File .docx diunduh (tanpa mencatat ulang ke Google Sheets)');
    } catch (err) {
      setDuplicateError(
        err instanceof Error ? err.message : 'Gagal mengekspor file .docx.'
      );
    } finally {
      setIsExportingDocx(false);
      setDuplicateBusyAction(null);
    }
  };

  const handleDuplicateOverwriteOld = async () => {
    if (!duplicateWarning || duplicateBusyAction) return;
    const { draft, targetYear, match, spreadsheetId, viaBridge } =
      duplicateWarning;
    setDuplicateBusyAction('overwrite');
    setDuplicateError(null);

    const updatedDraft: SuratTugasData = {
      ...draft,
      id: match.row.idSurat.trim() || draft.id,
      statusSurat: 'Tercatat / Final',
      pegawaiList: draft.pegawaiList.map((p) => ({ ...p })),
    };

    try {
      if (viaBridge) {
        await upsertSuratViaBridge(
          targetYear,
          updatedDraft,
          true,
          customBridgeHeader
        );
        await loadBridgeYearData(targetYear, customBridgeHeader);
      } else {
        const token = getAccessToken();
        if (!token || !isOwnerAccount(googleUser?.email)) {
          clearAccessToken();
          setNeedsAuth(true);
          throw new Error(
            'Sesi admin Google berakhir. Silakan masuk ulang untuk menimpa baris.'
          );
        }
        await updateExistingSuratRow(
          spreadsheetId,
          targetYear,
          match.row.rowNumber,
          updatedDraft,
          token
        );
        const refreshed = await fetchRowsForSheet(
          spreadsheetId,
          targetYear,
          token
        );
        setSheetRows(refreshed);
      }

      setCopiedSourceRef(null);
      setSurat(updatedDraft);
      setLastSyncedSignature(computeSuratSignature(updatedDraft));
      upsertLocalDraftEntry(updatedDraft, 'Tercatat');

      setIsExportingDocx(true);
      try {
        await exportSuratTugasDocx(updatedDraft);
      } finally {
        setIsExportingDocx(false);
      }

      setDuplicateWarning(null);
      showToast(
        `Baris ${match.row.rowNumber} (Sheet ${targetYear}) diperbarui & .docx diunduh`
      );
    } catch (err) {
      if (err instanceof SheetsAuthError) {
        clearAccessToken();
        setNeedsAuth(true);
      }
      setDuplicateError(
        err instanceof Error
          ? err.message
          : 'Gagal memperbarui data lama di Google Sheets.'
      );
    } finally {
      setDuplicateBusyAction(null);
    }
  };

  const handleDuplicateSaveAsNew = async () => {
    if (!duplicateWarning || duplicateBusyAction) return;
    const { draft, targetYear, spreadsheetId, viaBridge } = duplicateWarning;
    setDuplicateBusyAction('save_new');
    setDuplicateError(null);

    const newDraft: SuratTugasData = {
      ...draft,
      id: `draft-${Date.now()}`,
      statusSurat: 'Tercatat / Final',
      pegawaiList: draft.pegawaiList.map((p) => ({ ...p })),
    };

    try {
      if (viaBridge) {
        await upsertSuratViaBridge(
          targetYear,
          newDraft,
          false,
          customBridgeHeader
        );
        await loadBridgeYearData(targetYear, customBridgeHeader);
      } else {
        const token = getAccessToken();
        if (!token || !isOwnerAccount(googleUser?.email)) {
          clearAccessToken();
          setNeedsAuth(true);
          throw new Error(
            'Sesi admin Google berakhir. Silakan masuk ulang untuk menyimpan data baru.'
          );
        }
        const { nextRowNumberDisplay } = await checkExistingRecordRow(
          spreadsheetId,
          targetYear,
          newDraft.id,
          token
        );
        await appendSuratToYearSheet(
          spreadsheetId,
          targetYear,
          nextRowNumberDisplay,
          newDraft,
          token
        );
        const refreshed = await fetchRowsForSheet(
          spreadsheetId,
          targetYear,
          token
        );
        setSheetRows(refreshed);
      }

      setCopiedSourceRef(null);
      setSurat(newDraft);
      setLastSyncedSignature(computeSuratSignature(newDraft));
      upsertLocalDraftEntry(newDraft, 'Tercatat');

      setIsExportingDocx(true);
      try {
        await exportSuratTugasDocx(newDraft);
      } finally {
        setIsExportingDocx(false);
      }

      setDuplicateWarning(null);
      showToast(
        `Surat dicatat sebagai data baru di Sheet ${targetYear} & .docx diunduh`
      );
    } catch (err) {
      if (err instanceof SheetsAuthError) {
        clearAccessToken();
        setNeedsAuth(true);
      }
      setDuplicateError(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan surat sebagai data baru ke Google Sheets.'
      );
    } finally {
      setDuplicateBusyAction(null);
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
    <div
      className={
        isForcedMobile
          ? 'min-h-screen st-desk flex justify-center overflow-x-hidden print:block print:bg-white'
          : 'min-h-screen flex flex-col st-app overflow-x-hidden'
      }
    >
      <div
        className={
          isForcedMobile
            ? 'w-full max-w-[430px] min-h-screen flex flex-col st-app border-x st-border shadow-xl relative print:max-w-none print:border-0 print:shadow-none'
            : 'flex-1 flex flex-col min-h-screen'
        }
      >
        {isMobileLayout ? (
          <>
            <header className="no-print sticky top-0 z-30 st-surface border-b px-2.5 py-1.5 flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((open) => !open)}
                  aria-label={mobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
                  aria-expanded={mobileMenuOpen}
                  className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg border st-surface-muted st-text-primary hover:opacity-90 shrink-0"
                >
                  {mobileMenuOpen ? (
                    <X className="w-5 h-5" />
                  ) : (
                    <Menu className="w-5 h-5" />
                  )}
                </button>
                <a
                  href="#editor"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab('editor');
                    setMobileMenuOpen(false);
                  }}
                  className="font-display text-sm font-bold tracking-tight st-text-primary truncate min-w-0"
                >
                  SiTugas Kemenag
                </a>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <ThemeSwitcher themeMode={themeMode} onChange={setThemeMode} />

                <button
                  type="button"
                  onClick={toggleMobileDesktop}
                  title="Beralih ke Desktop View"
                  aria-label="Beralih ke Desktop View"
                  className="min-h-[38px] inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-lg border st-surface-muted st-text-primary hover:opacity-90 whitespace-nowrap shrink-0"
                >
                  <Monitor className="w-3.5 h-3.5 text-[#0B5D3B] dark:text-emerald-400 shrink-0" />
                  <span className={isForcedMobile ? 'inline' : 'hidden min-[410px]:inline'}>
                    Desktop View
                  </span>
                </button>

                <div className="relative" ref={roleMenuRef}>
                  <button
                    type="button"
                    onClick={() => setRoleMenuOpen((open) => !open)}
                    aria-expanded={roleMenuOpen}
                    aria-haspopup="dialog"
                    aria-label={isAdminMode ? 'Mode: Admin' : 'Mode: Operator'}
                    title={
                      isAdminMode
                        ? `Mode: Admin (${googleUser?.email || OWNER_GOOGLE_EMAIL}) — Akses penuh aktif`
                        : 'Mode: Operator — Siap membuat & mencatat Surat Tugas'
                    }
                    className={`min-h-[38px] inline-flex items-center gap-1 px-2 py-1.5 text-[11px] rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      isAdminMode
                        ? 'bg-amber-50 night:bg-amber-200/60 dark:bg-amber-950/60 text-amber-900 night:text-[#4e340b] dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold'
                        : 'bg-sky-50 night:bg-emerald-900/15 dark:bg-sky-950/50 text-sky-800 night:text-[#0B5D3B] dark:text-sky-300 border-sky-200 night:border-emerald-700/35 dark:border-sky-800 font-medium'
                    }`}
                  >
                    {isAdminMode ? (
                      <Crown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    ) : (
                      <UserIcon className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="hidden min-[380px]:inline">
                      {isAdminMode ? 'Admin' : 'Operator'}
                    </span>
                  </button>

                  {roleMenuOpen && (
                    <div
                      role="dialog"
                      aria-label="Status peran pengguna"
                      className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] st-surface border rounded-xl shadow-xl p-3.5 z-50 space-y-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isAdminMode
                              ? 'bg-amber-100 night:bg-amber-200/70 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300'
                              : 'bg-sky-100 night:bg-emerald-900/20 dark:bg-sky-950/70 text-sky-700 night:text-[#0B5D3B] dark:text-sky-300'
                          }`}
                        >
                          {isAdminMode ? (
                            <Crown className="w-4 h-4" />
                          ) : (
                            <UserIcon className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold st-text-primary flex items-center gap-1.5">
                            <span>{isAdminMode ? 'Mode: Admin' : 'Mode: Operator'}</span>
                            {isAdminMode && (
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] st-text-muted mt-0.5 leading-relaxed">
                            {isAdminMode
                              ? `${googleUser?.email || OWNER_GOOGLE_EMAIL} — Akses penuh aktif (Proteksi & Jembatan Pemilik, Spreadsheet, dan Buka Kunci Sistem).`
                              : 'Akses Operator — Siap membuat & mencatat Surat Tugas ke Worksheet.'}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t st-border space-y-2">
                        {isAdminMode ? (
                          <button
                            type="button"
                            onClick={() => void handleGoogleLogout()}
                            className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 night:bg-red-100/70 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/70 transition-colors"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            Keluar Mode Admin
                          </button>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <GoogleSignInButton
                              onClick={() => void handleGoogleLogin()}
                              disabled={isGoogleConnecting}
                              label={
                                isGoogleConnecting
                                  ? 'Menghubungkan...'
                                  : 'Masuk Admin (Google)'
                              }
                            />
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setRoleMenuOpen(false);
                            setActiveTab('sheets');
                          }}
                          className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium st-text-secondary st-surface-muted border rounded-lg hover:opacity-90 transition-colors"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-[#0B5D3B] dark:text-emerald-400" />
                          Buka Tracking Sheets
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {mobileMenuOpen && (
              <div className="no-print st-surface border-b st-border shadow-lg z-20 px-3 py-3 space-y-3.5 max-h-[calc(100vh-3.75rem)] overflow-y-auto">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide st-text-muted mb-1.5">
                    Menu Utama
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['editor', 'Editor Surat'],
                        ['pegawai', `Data Pegawai (${directory.length.toLocaleString('id-ID')})`],
                        ['sheets', 'Tracking Sheets'],
                        ['arsip', `Daftar Draft (${arsipList.length})`],
                      ] as const
                    ).map(([tabId, label]) => (
                      <button
                        key={tabId}
                        type="button"
                        onClick={() => {
                          setActiveTab(tabId);
                          setMobileMenuOpen(false);
                        }}
                        className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg border text-left transition-colors ${
                          activeTab === tabId
                            ? 'bg-[#0B5D3B] text-white border-[#0B5D3B]'
                            : 'st-surface-muted st-text-primary hover:opacity-90'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide st-text-muted mb-1.5">
                    Mode Layar
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 p-1 st-surface-muted border rounded-lg">
                    {(
                      [
                        ['auto', 'Otomatis'],
                        ['mobile', 'Mobile'],
                        ['desktop', 'Desktop'],
                      ] as Array<[ViewportMode, string]>
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setViewportMode(mode);
                          setMobileMenuOpen(false);
                        }}
                        className={`min-h-[40px] px-2 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                          viewportMode === mode
                            ? 'bg-[#0B5D3B] text-white shadow-xs'
                            : 'st-text-secondary hover:opacity-90'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t st-border flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 text-xs st-text-secondary">
                    <span className="font-semibold st-text-primary">
                      {isAdminMode ? 'Mode: Admin' : 'Mode: Operator'}
                    </span>
                    <span className="text-[11px] st-text-muted truncate">
                      {isAdminMode
                        ? googleUser?.email || OWNER_GOOGLE_EMAIL
                        : 'Operator Surat Tugas'}
                    </span>
                  </div>
                  {isAdminMode ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        void handleGoogleLogout();
                      }}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Keluar Mode Admin
                    </button>
                  ) : (
                    <GoogleSignInButton
                      onClick={() => {
                        setMobileMenuOpen(false);
                        void handleGoogleLogin();
                      }}
                      disabled={isGoogleConnecting}
                      label={
                        isGoogleConnecting
                          ? 'Menghubungkan...'
                          : 'Masuk Admin (Google)'
                      }
                    />
                  )}
                  <button
                    type="button"
                    disabled={isSyncingSheets}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      void handlePrintPdf();
                    }}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60"
                  >
                    <Printer className="w-4 h-4" />
                    {isSyncingSheets ? 'Menyimpan...' : 'Cetak / PDF'}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* TOP BAR CONTRACT: 3 zones on desktop/tablet */
          <header className="no-print sticky top-0 z-30 st-surface border-b px-3 sm:px-6 py-2 lg:py-0 lg:h-14 flex flex-wrap lg:flex-nowrap items-center justify-between gap-x-3 gap-y-1.5 lg:gap-4">
            <a
              href="#editor"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('editor');
              }}
              className="order-1 font-display text-sm sm:text-base font-bold tracking-tight st-text-primary whitespace-nowrap shrink-0"
            >
              SiTugas Kemenag Jember
            </a>

            <nav
              aria-label="Menu utama"
              className="order-3 lg:order-2 w-full lg:w-auto lg:min-w-0 border-t border-slate-100 night:border-[#e4d5b3] dark:border-slate-700/70 lg:border-t-0 pt-1.5 lg:pt-0 flex items-center justify-between sm:justify-start gap-2.5 sm:gap-5 lg:gap-5 text-[11px] sm:text-xs lg:text-sm font-medium overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <button
                type="button"
                onClick={() => setActiveTab('editor')}
                className={`py-1.5 lg:py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeTab === 'editor'
                    ? 'text-[#0B5D3B] dark:text-emerald-400 border-[#0B5D3B] dark:border-emerald-400'
                    : 'st-text-secondary border-transparent hover:text-slate-900 night:hover:text-[#3b3228] dark:hover:text-slate-100'
                }`}
              >
                Editor Surat
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pegawai')}
                className={`py-1.5 lg:py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeTab === 'pegawai'
                    ? 'text-[#0B5D3B] dark:text-emerald-400 border-[#0B5D3B] dark:border-emerald-400'
                    : 'st-text-secondary border-transparent hover:text-slate-900 night:hover:text-[#3b3228] dark:hover:text-slate-100'
                }`}
              >
                Data Pegawai ({directory.length.toLocaleString('id-ID')})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('sheets')}
                className={`py-1.5 lg:py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeTab === 'sheets'
                    ? 'text-[#0B5D3B] dark:text-emerald-400 border-[#0B5D3B] dark:border-emerald-400'
                    : 'st-text-secondary border-transparent hover:text-slate-900 night:hover:text-[#3b3228] dark:hover:text-slate-100'
                }`}
              >
                Tracking Sheets
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('arsip')}
                className={`py-1.5 lg:py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeTab === 'arsip'
                    ? 'text-[#0B5D3B] dark:text-emerald-400 border-[#0B5D3B] dark:border-emerald-400'
                    : 'st-text-secondary border-transparent hover:text-slate-900 night:hover:text-[#3b3228] dark:hover:text-slate-100'
                }`}
              >
                Daftar Draft ({arsipList.length})
              </button>
            </nav>

            <div className="order-2 lg:order-3 flex items-center gap-1.5 sm:gap-2 shrink-0">
              <ThemeSwitcher themeMode={themeMode} onChange={setThemeMode} />

              <button
                type="button"
                onClick={toggleMobileDesktop}
                title={`Mode Layar: ${
                  viewportMode === 'desktop' ? 'Desktop' : 'Otomatis'
                } — Klik untuk pratinjau Mobile View`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg border st-surface-muted st-text-primary hover:opacity-90 transition-colors whitespace-nowrap shrink-0"
              >
                <Smartphone className="w-3.5 h-3.5 text-[#0B5D3B] dark:text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">Mobile View</span>
              </button>

              {/* INDIKATOR ROLE PENGGUNA (OPERATOR VS ADMIN) */}
              <div className="relative" ref={roleMenuRef}>
                <button
                  type="button"
                  onClick={() => setRoleMenuOpen((open) => !open)}
                  aria-expanded={roleMenuOpen}
                  aria-haspopup="dialog"
                  title={
                    isAdminMode
                      ? `Mode: Admin (${googleUser?.email || OWNER_GOOGLE_EMAIL}) — Akses penuh aktif`
                      : 'Akses Operator — Siap membuat & mencatat Surat Tugas'
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    isAdminMode
                      ? 'bg-amber-50 night:bg-amber-200/60 dark:bg-amber-950/60 text-amber-900 night:text-[#4e340b] dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold hover:bg-amber-100 night:hover:bg-amber-200/80 dark:hover:bg-amber-950/80'
                      : 'bg-sky-50 night:bg-emerald-900/15 dark:bg-sky-950/50 text-sky-800 night:text-[#0B5D3B] dark:text-sky-300 border-sky-200 night:border-emerald-700/35 dark:border-sky-800 font-medium hover:bg-sky-100 night:hover:bg-emerald-900/25 dark:hover:bg-sky-950/70'
                  }`}
                >
                  {isAdminMode ? (
                    <Crown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  ) : (
                    <UserIcon className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="hidden md:inline">
                    {isAdminMode ? 'Mode: Admin' : 'Mode: Operator'}
                  </span>
                  <span className="md:hidden">
                    {isAdminMode ? 'Admin' : 'Operator'}
                  </span>
                </button>

                {roleMenuOpen && (
                  <div
                    role="dialog"
                    aria-label="Status peran pengguna"
                    className="absolute right-0 mt-2 w-72 st-surface border rounded-xl shadow-xl p-3.5 z-50 space-y-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isAdminMode
                            ? 'bg-amber-100 night:bg-amber-200/70 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300'
                            : 'bg-sky-100 night:bg-emerald-900/20 dark:bg-sky-950/70 text-sky-700 night:text-[#0B5D3B] dark:text-sky-300'
                        }`}
                      >
                        {isAdminMode ? (
                          <Crown className="w-4 h-4" />
                        ) : (
                          <UserIcon className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold st-text-primary flex items-center gap-1.5">
                          <span>{isAdminMode ? 'Mode: Admin' : 'Mode: Operator'}</span>
                          {isAdminMode && (
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] st-text-muted mt-0.5 leading-relaxed">
                          {isAdminMode
                            ? `${googleUser?.email || OWNER_GOOGLE_EMAIL} — Akses penuh aktif (Proteksi & Jembatan Pemilik, Spreadsheet, dan Buka Kunci Sistem).`
                            : 'Akses Operator — Siap membuat & mencatat Surat Tugas ke Worksheet.'}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t st-border space-y-2">
                      {isAdminMode ? (
                        <button
                          type="button"
                          onClick={() => void handleGoogleLogout()}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 night:bg-red-100/70 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/70 transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Keluar Mode Admin
                        </button>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <GoogleSignInButton
                            onClick={() => void handleGoogleLogin()}
                            disabled={isGoogleConnecting}
                            label={
                              isGoogleConnecting
                                ? 'Menghubungkan...'
                                : 'Masuk Admin (Google)'
                            }
                          />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setRoleMenuOpen(false);
                          setActiveTab('sheets');
                        }}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium st-text-secondary st-surface-muted border rounded-lg hover:opacity-90 transition-colors"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-[#0B5D3B] dark:text-emerald-400" />
                        Buka Tracking Sheets
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={isSyncingSheets}
                onClick={() => void handlePrintPdf()}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {isSyncingSheets ? 'Menyimpan...' : 'Cetak / PDF'}
                </span>
              </button>
            </div>
          </header>
        )}

        {/* TOAST FEEDBACK */}
        {toastMessage && (
          <div
            className={`no-print fixed z-50 flex items-center gap-2 px-4 py-2.5 bg-slate-900 night:bg-[#3b3228] dark:bg-slate-800 dark:border dark:border-slate-700 text-white text-xs font-medium rounded-lg shadow-lg ${
              isMobileLayout && activeTab === 'editor'
                ? 'bottom-[4.5rem] left-3 right-3 max-w-[400px] mx-auto'
                : 'bottom-5 right-5 max-w-md'
            }`}
          >
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
            onBulkUpdateDirectory={(newList: Pegawai[], mode: DukImportMode, fileName: string) => {
              setDirectory((prev) => {
                if (mode === 'replace_duk') {
                  const newNips = new Set(newList.map((n) => n.nip.trim()).filter(Boolean));
                  // Preserve custom non-DUK manually added entries whose NIP isn't in the new DUK
                  const customEntries = prev.filter(
                    (item) => !item.id.startsWith('duk-') && (!item.nip.trim() || !newNips.has(item.nip.trim()))
                  );
                  return [...customEntries, ...newList];
                }
                // Merge by NIP: update existing matching NIPs, keep old non-matching ones, append new ones
                const incomingByNip = new Map<string, Pegawai>();
                const incomingWithoutNip: Pegawai[] = [];
                for (const item of newList) {
                  const key = item.nip.trim();
                  if (key) {
                    incomingByNip.set(key, item);
                  } else {
                    incomingWithoutNip.push(item);
                  }
                }
                const updatedExisting = prev.map((item) => {
                  const key = item.nip.trim();
                  if (key && incomingByNip.has(key)) {
                    const matched = incomingByNip.get(key)!;
                    incomingByNip.delete(key);
                    return {
                      ...item,
                      nama: matched.nama,
                      pangkatGolongan: matched.pangkatGolongan || item.pangkatGolongan,
                      jabatan: matched.jabatan || item.jabatan,
                    };
                  }
                  return item;
                });
                return [
                  ...updatedExisting,
                  ...Array.from(incomingByNip.values()),
                  ...incomingWithoutNip,
                ];
              });
              showToast(
                mode === 'replace_duk'
                  ? `Database DUK diperbarui dari ${fileName} (${newList.length.toLocaleString('id-ID')} pegawai)`
                  : `Data DUK digabung dari ${fileName} (${newList.length.toLocaleString('id-ID')} pegawai)`
              );
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
            isOwner={isOwner}
            bridgeConnected={bridgeConnected}
            bridgeSource={bridgeSource}
            localBridgeUrl={localBridgeUrl}
            isConnecting={isGoogleConnecting}
            isSyncing={isSyncingSheets}
            isProtecting={isProtectingSheets}
            spreadsheet={spreadsheet}
            selectedYear={selectedYear}
            rows={sheetRows}
            errorMessage={sheetsError}
            onGoogleLogin={() => void handleGoogleLogin()}
            onGoogleLogout={() => void handleGoogleLogout()}
            onAutoSetupSpreadsheet={() => void handleAutoSetupSpreadsheet()}
            onConnectSpreadsheetId={(raw) => void handleConnectSpreadsheetId(raw)}
            onProtectSpreadsheet={() => void handleProtectSpreadsheet()}
            onSaveBridgeUrl={(url) => void handleSaveBridgeUrl(url)}
            onClearLocalBridgeUrl={handleClearLocalBridgeUrl}
            onSelectYear={(year) => {
              setSelectedYear(year);
              const token = getAccessToken();
              if (isOwner && token && spreadsheet) {
                void loadYearRows(spreadsheet.spreadsheetId, year, token);
              } else if (bridgeConnected) {
                void loadBridgeYearData(year, customBridgeHeader);
              }
            }}
            onCreateYearSheet={(year) => void handleCreateYearSheetManual(year)}
            onRefreshRows={() => {
              const token = getAccessToken();
              if (isOwner && token && spreadsheet) {
                void loadYearRows(spreadsheet.spreadsheetId, selectedYear, token);
              } else if (bridgeConnected) {
                void loadBridgeYearData(selectedYear, customBridgeHeader);
              }
            }}
            onLoadTrackedDraft={(draft, asTemplateCopy) => {
              const loadedDraft: SuratTugasData = {
                ...draft,
                pegawaiList: draft.pegawaiList.map((p) => ({ ...p })),
              };
              setSurat(loadedDraft);
              if (asTemplateCopy) {
                setCopiedSourceRef({
                  sourceId: loadedDraft.id,
                  fingerprint: generateSuratFingerprint(loadedDraft),
                });
                setLastSyncedSignature('');
              } else {
                setCopiedSourceRef(null);
                setLastSyncedSignature(computeSuratSignature(loadedDraft));
              }
              setActiveTab('editor');
              showToast(
                asTemplateCopy
                  ? 'Salinan Surat Tugas dimuat ke editor (referensi asal dipertahankan hingga data inti diubah)'
                  : 'Data Surat Tugas dari Google Sheets dimuat ke editor'
              );
            }}
          />
        </main>
      )}

      {activeTab === 'arsip' && (
        <main className="flex-1 no-print">
          <ArsipManager
            arsipList={arsipList}
            onLoadArsip={(item) => {
              setCopiedSourceRef(null);
              setSurat({
                ...item.data,
                pegawaiList: item.data.pegawaiList.map((p) => ({ ...p })),
              });
              setActiveTab('editor');
              showToast('Draft dimuat ke editor');
            }}
            onSyncArsipToSheets={(item) => void syncDraftToGoogleSheets(item.data)}
            onDeleteArsip={(id) => {
              setArsipList((prev) => prev.filter((a) => a.id !== id));
              showToast('Draft dihapus');
            }}
            onGoToEditor={() => setActiveTab('editor')}
          />
        </main>
      )}

      {/* EDITOR VIEW (stays mounted during print if active, or print preview renders cleanly) */}
      <main
        className={`flex-1 flex flex-col ${
          !isMobileLayout
            ? 'lg:grid lg:grid-cols-[490px_1fr] xl:grid-cols-[520px_1fr]'
            : ''
        } ${activeTab !== 'editor' ? 'hidden print:block' : ''}`}
      >
        {/* LEFT PANE: FORM STUDIO */}
        <section
          className={`no-print st-surface ${
            !isMobileLayout
              ? 'border-r lg:h-[calc(100vh-3.5rem)] lg:overflow-y-auto block'
              : mobilePane === 'form'
                ? 'block flex-1'
                : 'hidden'
          }`}
        >
          <div className={isMobileLayout ? 'p-3.5 space-y-5' : 'p-5 space-y-6'}>
            {/* 0. DETEKSI OTOMATIS DARI FILE PDF DASAR */}
            <DasarPdfUploader
              directory={directory}
              isAdminMode={isAdminMode}
              onRequestAdminSignIn={() => void handleGoogleLogin()}
              onApplyParsedResult={handleApplyParsedPdf}
              onOpenDirectoryMulti={() => {
                setDirTargetIndex(null);
                setDirForceMulti(true);
                setDirModalOpen(true);
              }}
            />

            <hr className="st-border" />

            {/* 1. KRITERIA KEBERANGKATAN */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold st-text-primary">
                  1. Kriteria Keberangkatan
                </label>
                <button
                  type="button"
                  onClick={handleResetBlank}
                  className="inline-flex items-center gap-1 text-xs font-medium st-text-muted hover:text-slate-900 night:hover:text-[#3b3228] dark:hover:text-slate-100 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Kosongkan
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 p-1 st-surface-muted rounded-lg border">
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
                    className={`min-h-[40px] py-2 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      surat.kriteria === key
                        ? 'st-surface text-[#0B5D3B] dark:text-emerald-400 shadow-xs'
                        : 'st-text-secondary hover:text-slate-900 night:hover:text-[#3b3228] dark:hover:text-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs st-text-muted mt-2">
                {surat.kriteria === 'sendiri' &&
                  'Format 1 pegawai langsung di halaman utama tanpa nomor urut.'}
                {surat.kriteria === 'tiga_orang' &&
                  'Format 2–3 pegawai bernomor (1, 2, 3) langsung di halaman utama.'}
                {surat.kriteria === 'terlampir' &&
                  'Untuk 4 orang atau lebih: halaman utama menampilkan "Terlampir" dan tabel Lampiran pada halaman ke-2.'}
              </p>
            </div>

            <hr className="st-border" />

            {/* 2. DASAR SURAT TUGAS */}
            <div className="space-y-3">
              <h2 className="text-xs font-semibold st-text-primary">
                2. Dasar Surat Tugas
              </h2>
              <div>
                <label className="block text-xs font-medium st-text-secondary mb-1">
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
                  className="w-full px-3 py-2 text-sm st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
                <datalist id="dasar-asal-presets">
                  {DASAR_ASAL_PRESETS.map((preset) => (
                    <option key={preset} value={preset} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium st-text-secondary mb-1">
                    Nomor Surat Dasar
                  </label>
                  <input
                    type="text"
                    value={surat.dasarNomor}
                    onChange={(e) =>
                      setSurat((prev) => ({ ...prev, dasarNomor: e.target.value }))
                    }
                    placeholder="Contoh: 1134/Kw.13.02/PP.02.3/11/2026"
                    className="w-full px-3 py-2 text-sm font-mono-tabular st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium st-text-secondary mb-1">
                    Tanggal Surat Dasar
                  </label>
                  <input
                    type="date"
                    value={surat.dasarTanggal}
                    onChange={(e) =>
                      setSurat((prev) => ({ ...prev, dasarTanggal: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono-tabular st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
              </div>
            </div>

            <hr className="st-border" />

            {/* 3. KEGIATAN, TUJUAN & WAKTU */}
            <div className="space-y-3">
              <h2 className="text-xs font-semibold st-text-primary">
                3. Kegiatan, Lokasi Tujuan & Tanggal Pelaksanaan
              </h2>

              <div>
                <label className="block text-xs font-medium st-text-secondary mb-1">
                  Nama / Perihal Kegiatan (untuk Menimbang & Untuk)
                </label>
                <textarea
                  rows={2}
                  value={surat.namaKegiatan}
                  onChange={(e) =>
                    setSurat((prev) => ({ ...prev, namaKegiatan: e.target.value }))
                  }
                  placeholder="Contoh: kegiatan Koordinasi dan Sharing Program Bimbingan Masyarakat Islam"
                  className="w-full px-3 py-2 text-sm st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
                <label className="inline-flex items-center gap-2 mt-1.5 text-xs st-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={surat.gunakanMenimbangCustom}
                    onChange={(e) =>
                      setSurat((prev) => ({
                        ...prev,
                        gunakanMenimbangCustom: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 night:border-[#d3c096] dark:border-slate-600 text-[#0B5D3B] focus:ring-[#0B5D3B]"
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
                    className="w-full mt-2 px-3 py-2 text-xs st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium st-text-secondary mb-1">
                  Lokasi Tujuan
                </label>
                <input
                  type="text"
                  value={surat.lokasiTujuan}
                  onChange={(e) =>
                    setSurat((prev) => ({ ...prev, lokasiTujuan: e.target.value }))
                  }
                  placeholder="Contoh: Kantor Kementerian Agama Kabupaten Lumajang"
                  className="w-full px-3 py-2 text-sm st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium st-text-secondary mb-1">
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
                    className="w-full px-3 py-2 text-sm font-mono-tabular st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium st-text-secondary mb-1">
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
                    className="w-full px-3 py-2 text-sm font-mono-tabular st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                  />
                </div>
              </div>
            </div>

            <hr className="st-border" />

            {/* 4. DAFTAR PEGAWAI YANG DITUGASKAN */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-semibold st-text-primary">
                    4. Data Pegawai ({surat.pegawaiList.length} Orang)
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDirTargetIndex(surat.kriteria === 'sendiri' ? 0 : null);
                      setDirModalOpen(true);
                    }}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#0B5D3B] dark:text-emerald-300 bg-emerald-50 night:bg-emerald-900/15 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-950/80 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Pilih dari Direktori
                  </button>
                  {canAddMorePegawai && (
                    <button
                      type="button"
                      onClick={handleAddPegawaiSlot}
                      className="min-h-[40px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium st-text-secondary st-surface-muted hover:opacity-90 rounded-md transition-colors whitespace-nowrap shrink-0"
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
                      className="border rounded-lg p-3.5 st-surface-muted space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold st-text-secondary font-mono-tabular">
                          Pegawai {idx + 1}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setDirTargetIndex(idx);
                              setDirModalOpen(true);
                            }}
                            className="text-xs font-medium text-[#0B5D3B] dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
                          >
                            Isi dari Direktori
                          </button>
                          <span className="st-text-muted" aria-hidden="true">
                            ·
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSavePegawaiToDirectory(peg)}
                            title="Simpan pegawai ini ke Direktori Pegawai"
                            className="inline-flex items-center gap-1 text-xs font-medium st-text-secondary hover:text-slate-900 night:hover:text-[#3b3228] dark:hover:text-slate-100 whitespace-nowrap shrink-0"
                          >
                            <UserCheck className="w-3 h-3" />
                            Simpan
                          </button>
                          {surat.pegawaiList.length > minPegawaiAllowed && (
                            <button
                              type="button"
                              onClick={() => handleRemovePegawaiSlot(idx)}
                              className="p-1 st-text-muted hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                              aria-label={`Hapus pegawai ${idx + 1}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium st-text-secondary mb-0.5">
                            Nama Lengkap & Gelar
                          </label>
                          <input
                            type="text"
                            value={peg.nama}
                            onChange={(e) =>
                              updatePegawaiField(idx, 'nama', e.target.value)
                            }
                            placeholder={ph.nama}
                            className="w-full px-2.5 py-1.5 text-sm st-input border rounded-md focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium st-text-secondary mb-0.5">
                            NIP / NI PPPK
                          </label>
                          <input
                            type="text"
                            value={peg.nip}
                            onChange={(e) =>
                              updatePegawaiField(idx, 'nip', e.target.value)
                            }
                            placeholder={ph.nip}
                            className="w-full px-2.5 py-1.5 text-sm font-mono-tabular st-input border rounded-md focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium st-text-secondary mb-0.5">
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
                            className="w-full px-2.5 py-1.5 text-sm st-input border rounded-md focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium st-text-secondary mb-0.5">
                            Jabatan
                          </label>
                          <input
                            type="text"
                            value={peg.jabatan}
                            onChange={(e) =>
                              updatePegawaiField(idx, 'jabatan', e.target.value)
                            }
                            placeholder={ph.jabatan}
                            className="w-full px-2.5 py-1.5 text-sm st-input border rounded-md focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
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
                  className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-[#0B5D3B] dark:text-emerald-300 bg-emerald-50/80 night:bg-emerald-900/15 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 border border-dashed border-emerald-300 dark:border-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
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

            <hr className="st-border" />

            {/* 5. PENGATURAN PENOMORAN SRIKANDI, KOP & PENANDATANGAN */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between py-1 text-xs font-semibold st-text-primary"
              >
                <span>5. Pengaturan Srikandi, Kop Surat & Penandatangan</span>
                {showAdvanced ? (
                  <ChevronUp className="w-4 h-4 st-text-muted" />
                ) : (
                  <ChevronDown className="w-4 h-4 st-text-muted" />
                )}
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-3 pt-2">
                  <div className="p-3 st-surface-muted border rounded-lg">
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
                        className="mt-0.5 rounded border-slate-300 night:border-[#d3c096] dark:border-slate-600 text-[#0B5D3B] focus:ring-[#0B5D3B]"
                      />
                      <div>
                        <div className="text-xs font-semibold st-text-primary">
                          Gunakan Variabel Template Srikandi
                        </div>
                        <div className="text-[11px] st-text-secondary mt-0.5">
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
                        <label className="block text-xs font-medium st-text-secondary mb-1">
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
                          className="w-full px-3 py-2 text-xs font-mono-tabular st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium st-text-secondary mb-1">
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
                          className="w-full px-3 py-2 text-xs font-mono-tabular st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium st-text-secondary mb-1">
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
                      className="w-full px-3 py-2 text-xs st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
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
                      <label className="block text-xs font-medium st-text-secondary mb-1">
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
                        className="w-full px-3 py-2 text-sm st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium st-text-secondary mb-1">
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
                        className="w-full px-3 py-2 text-sm st-input border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5D3B]/20 focus:border-[#0B5D3B]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* EDITOR ACTION FOOTER */}
            <div
              className={`pt-3 border-t st-border ${
                isMobileLayout
                  ? 'grid grid-cols-2 gap-2.5'
                  : 'flex flex-wrap items-center justify-between gap-2.5'
              }`}
            >
              <button
                type="button"
                onClick={handleSaveToDraft}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold st-text-primary st-surface border rounded-lg hover:bg-slate-50 night:hover:bg-[#efe3c4] dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5 text-[#0B5D3B] dark:text-emerald-400" />
                Simpan ke Draft
              </button>
              <button
                type="button"
                disabled={isExportingDocx || isSyncingSheets || isProcessingDocxConfirm}
                onClick={handleExportDocx}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                {isExportingDocx ? 'Menyiapkan...' : 'Unduh .docx'}
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT PANE: LIVE A4 PREVIEW CANVAS */}
        <section
          className={`st-desk flex flex-col print-only-container ${
            !isMobileLayout
              ? 'lg:h-[calc(100vh-3.5rem)] flex'
              : mobilePane === 'preview'
                ? 'flex flex-1'
                : 'hidden'
          }`}
        >
          {/* WORKSPACE TOOLBAR */}
          <div
            className={`no-print st-surface backdrop-blur-xs border-b flex flex-wrap items-center justify-between gap-2.5 ${
              isMobileLayout ? 'px-3 py-2.5' : 'px-5 py-2.5'
            }`}
          >
            <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-w-full">
              <span className="text-xs font-medium st-text-muted whitespace-nowrap shrink-0">
                Muat Contoh:
              </span>
              <button
                type="button"
                onClick={() => handleLoadSample('sendiri')}
                className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium st-text-secondary st-surface-muted hover:opacity-90 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                1 Orang
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample('tiga_orang')}
                className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium st-text-secondary st-surface-muted hover:opacity-90 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                2-3 Orang
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample('terlampir')}
                className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium st-text-secondary st-surface-muted hover:opacity-90 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                &gt; 3 Terlampir
              </button>
            </div>

            <div
              className={
                isMobileLayout
                  ? 'grid grid-cols-2 gap-2 w-full'
                  : 'flex flex-wrap items-center gap-2'
              }
            >
              {!isMobileLayout && (
                <div className="hidden sm:flex items-center gap-1 p-0.5 st-surface-muted rounded-md border">
                  {[0.7, 0.85, 1].map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setZoom(z)}
                      className={`px-2 py-1 text-xs font-mono-tabular rounded transition-colors ${
                        zoom === z
                          ? 'st-surface st-text-primary shadow-xs font-medium'
                          : 'st-text-muted hover:text-slate-900 night:hover:text-[#3b3228] dark:hover:text-slate-100'
                      }`}
                    >
                      {Math.round(z * 100)}%
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveToDraft}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium st-text-primary st-surface border rounded-lg hover:bg-slate-50 night:hover:bg-[#efe3c4] dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5 text-[#0B5D3B] dark:text-emerald-400" />
                Simpan ke Draft
              </button>

              <button
                type="button"
                disabled={isSyncingSheets}
                onClick={() => void syncDraftToGoogleSheets(surat)}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0B5D3B] dark:text-emerald-300 bg-emerald-50 night:bg-emerald-900/15 dark:bg-emerald-950/50 border border-emerald-200 night:border-emerald-700/35 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-950/75 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {isSyncingSheets
                  ? 'Menyimpan...'
                  : lastSyncedSignature === computeSuratSignature(surat)
                    ? 'Tercatat di Sheets'
                    : isMobileLayout
                      ? 'Simpan ke Sheets'
                      : 'Simpan ke Sheets (Wajib)'}
              </button>

              <button
                type="button"
                disabled={isExportingDocx || isSyncingSheets || isProcessingDocxConfirm}
                onClick={handleExportDocx}
                className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0B5D3B] rounded-lg hover:bg-[#09492E] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 ${
                  isMobileLayout ? 'col-span-2' : ''
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                {isExportingDocx
                  ? 'Menyiapkan...'
                  : isSyncingSheets || isProcessingDocxConfirm
                    ? 'Menyimpan ke Sheets...'
                    : 'Unduh .docx'}
              </button>
            </div>
          </div>

          {/* A4 DOCUMENT VIEWPORT */}
          <div
            className={`flex-1 overflow-auto ${
              isMobileLayout ? 'p-2.5 sm:p-3' : 'p-6 sm:p-8'
            } flex justify-center items-start print-only-container`}
          >
            <SuratPreview
              data={surat}
              zoom={isMobileLayout ? 1 : zoom}
              fitToContainer
            />
          </div>
        </section>

        {/* MOBILE BOTTOM STICKY BAR */}
        {isMobileLayout && (
          <nav
            aria-label="Navigasi editor surat"
            className="no-print sticky bottom-0 z-30 mt-auto st-surface border-t st-border px-2.5 py-1 grid grid-cols-2 gap-2 shadow-[0_-4px_12px_rgba(15,23,42,0.06)]"
          >
            <button
              type="button"
              onClick={() => setMobilePane('form')}
              className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                mobilePane === 'form'
                  ? 'bg-[#0B5D3B] text-white shadow-xs'
                  : 'st-surface-muted st-text-secondary border'
              }`}
            >
              <FilePenLine className="w-4 h-4 shrink-0" />
              <span>1. Isi Data Surat</span>
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('preview')}
              className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                mobilePane === 'preview'
                  ? 'bg-[#0B5D3B] text-white shadow-xs'
                  : 'st-surface-muted st-text-secondary border'
              }`}
            >
              <Eye className="w-4 h-4 shrink-0" />
              <span>2. Pratinjau &amp; Unduh</span>
            </button>
          </nav>
        )}
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
        targetYear={
          authPromptDraft
            ? getTargetYearForSurat(authPromptDraft)
            : String(new Date().getFullYear())
        }
        isConnecting={isGoogleConnecting}
        pendingActionLabel={
          pendingOutputAction === 'print'
            ? 'Cetak / PDF'
            : pendingOutputAction === 'docx'
              ? 'Unduh Word (.docx)'
              : null
        }
        onSignIn={() => void handleGoogleLogin()}
        onOpenTrackingTab={() => setActiveTab('sheets')}
        onClose={() => {
          setAuthPromptDraft(null);
          setPendingOutputAction(null);
        }}
      />

      {/* GOOGLE SHEETS OVERWRITE CONFIRMATION MODAL */}
      <ConfirmSheetsOverwriteModal
        isOpen={overwriteConfirm !== null}
        year={overwriteConfirm?.year || ''}
        rowNumber={overwriteConfirm?.rowNumber || 0}
        namaKegiatan={overwriteConfirm?.draft.namaKegiatan || ''}
        isBusy={isSyncingSheets}
        onConfirm={() => void handleConfirmOverwriteRow()}
        onCancel={() => {
          setOverwriteConfirm(null);
          setPendingOutputAction(null);
        }}
      />

      {/* KONFIRMASI UNDUH .DOCX & PENCATATAN OTOMATIS WORKSHEET */}
      <ConfirmDocxExportModal
        isOpen={docxConfirmOpen}
        namaKegiatan={surat.namaKegiatan}
        targetYear={getTargetYearForSurat(surat)}
        isBusy={isProcessingDocxConfirm}
        errorMessage={docxConfirmError}
        onConfirmRecordAndDownload={() => void handleConfirmRecordAndDownloadDocx()}
        onForceDownloadOnly={() => void handleForceDownloadDocxOnly()}
        onCancel={() => {
          if (isProcessingDocxConfirm) return;
          setDocxConfirmOpen(false);
          setDocxConfirmError(null);
        }}
      />

      {/* PERINGATAN DUPLIKASI SURAT TUGAS DI WORKSHEET */}
      <DuplicateSuratWarningModal
        isOpen={duplicateWarning !== null}
        waktuInputSebelumnya={duplicateWarning?.match.row.waktuInput || ''}
        rowNumber={duplicateWarning?.match.row.rowNumber || 0}
        targetYear={duplicateWarning?.targetYear || ''}
        namaKegiatan={
          duplicateWarning?.draft.namaKegiatan ||
          duplicateWarning?.match.row.namaKegiatan ||
          ''
        }
        matchedBy={duplicateWarning?.match.matchedBy || 'fingerprint'}
        busyAction={duplicateBusyAction}
        errorMessage={duplicateError}
        onDownloadOnly={() => void handleDuplicateDownloadOnly()}
        onOverwriteOld={() => void handleDuplicateOverwriteOld()}
        onSaveAsNew={() => void handleDuplicateSaveAsNew()}
        onCancel={() => {
          if (duplicateBusyAction) return;
          setDuplicateWarning(null);
          setDuplicateError(null);
        }}
      />
      </div>
    </div>
  );
}
