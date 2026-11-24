import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Briefcase,
  Check,
  ChevronDown,
  ChevronUp,
  Crown,
  Eye,
  FilePenLine,
  FileSpreadsheet,
  LogOut,
  Menu,
  Monitor,
  Plus,
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
  ConfirmDownloadSheetsModal,
  DuplicateSuratWarningModal,
  SheetsAuthPromptModal,
} from './components/ConfirmSheetsActionModal';
import { ConflictWarningModal } from './components/ConflictWarningModal';
import {
  DasarPdfUploader,
  ParsedDasarPdfResult,
} from './components/DasarPdfUploader';
import {
  DownloadSplitButton,
  ExportFormat,
} from './components/DownloadSplitButton';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { PegawaiDirectoryModal } from './components/PegawaiDirectoryModal';
import { DukImportMode, PegawaiManager } from './components/PegawaiManager';
import { SpdGeneratorModal } from './components/SpdGeneratorModal';
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
  findDuplicateSuratAcrossSources,
  findOrCreateTrackingSpreadsheet,
  findScheduleConflictsAcrossSources,
  generateSuratFingerprint,
  getSpreadsheetMetadata,
  getTargetYearForSurat,
  isOwnerAccount,
  MigrasiBatchSyncProgress,
  OWNER_GOOGLE_EMAIL,
  setSpreadsheetViewOnlyAndProtected,
  SheetsAuthError,
  SpreadsheetSummary,
  syncMigrasiDatasetToSheets,
  TrackedSuratRow,
  updateExistingSuratRow,
  upsertSpdViaBridge,
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
  ScheduleConflict,
  SpdFormData,
  SuratTugasData,
} from './types/surat';
import { exportSuratTugasDocx } from './utils/exportDocx';
import { exportSuratTugasPdf } from './utils/exportPdf';
import {
  buildMigrasiArsipEntries,
  getMigrasiSuratDataset,
  mergeMigrasiSeedsWithLocalArsip,
  MIGRASI_STORAGE_FLAGS,
} from './utils/migrasiSurat';

type AppTab = 'editor' | 'pegawai' | 'sheets' | 'arsip';

const STORAGE_KEYS = {
  DRAFT: 'situgas_kemenag_jember_draft_v2',
  PEGAWAI: 'situgas_kemenag_jember_pegawai_v2',
  PEGAWAI_LEGACY: 'situgas_kemenag_jember_pegawai_v1',
  ARSIP: 'situgas_kemenag_jember_arsip_v1',
  SHEETS_ID: 'situgas_kemenag_jember_sheets_id_v1',
  BRIDGE_URL: 'situgas_kemenag_jember_bridge_url_v1',
};

type AutoSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

function computeSuratSignature(data: SuratTugasData): string {
  return JSON.stringify(data);
}

function isSuratReadyForAutoSync(data: SuratTugasData): boolean {
  const hasDasar = Boolean(data.dasarAsal.trim() || data.dasarNomor.trim());
  const hasPegawai = data.pegawaiList.some(
    (p) => Boolean(p.nama.trim()) || Boolean(p.nip.trim())
  );
  return hasDasar && hasPegawai;
}

function isSuratReadyForTracking(data: SuratTugasData): boolean {
  const hasKegiatan = Boolean(
    data.namaKegiatan.trim() || data.dasarNomor.trim() || data.dasarAsal.trim()
  );
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

function clearActiveDraftStorage(): void {
  const draftKeys = [STORAGE_KEYS.DRAFT, 'stkemenag_current_draft'];
  for (const key of draftKeys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage errors
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('editor');
  const [mobilePane, setMobilePane] = useState<'form' | 'preview'>('form');
  const [zoom, setZoom] = useState<number>(0.85);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(
    null
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pdfUploaderKey, setPdfUploaderKey] = useState<number>(0);

  const [surat, setSurat] = useState<SuratTugasData>(() =>
    createEmptyDraft('sendiri', { emptyPegawai: true })
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
  const [downloadConfirmModal, setDownloadConfirmModal] = useState<{
    format: ExportFormat;
    errorMessage: string | null;
    isBusy: boolean;
  } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    format: ExportFormat;
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
  const [autoSyncStatus, setAutoSyncStatus] = useState<AutoSyncStatus>('idle');
  const [autoSyncError, setAutoSyncError] = useState<string | null>(null);
  const [spdModalSurat, setSpdModalSurat] = useState<SuratTugasData | null>(null);
  const [scheduleConflicts, setScheduleConflicts] = useState<ScheduleConflict[]>([]);
  const [pendingProceedAction, setPendingProceedAction] = useState<(() => void) | null>(null);
  const [copiedSourceRef, setCopiedSourceRef] = useState<{
    sourceId: string;
    fingerprint: string;
  } | null>(null);
  const latestSuratRef = useRef<SuratTugasData>(surat);
  latestSuratRef.current = surat;
  const initialSigRef = useRef<string>(computeSuratSignature(surat));
  const lastSyncedSigRef = useRef<string>('');
  const lastAttemptedSigRef = useRef<string>('');
  const sessionAutoSavedIdRef = useRef<string | null>(null);
  const inFlightPromiseRef = useRef<Promise<boolean> | null>(null);
  const queuedAutoSyncRef = useRef<{
    surat: SuratTugasData;
    silent: boolean;
    markTercatat: boolean;
  } | null>(null);
  const debounceSyncTimerRef = useRef<number | null>(null);
  const [migrasiSyncProgress, setMigrasiSyncProgress] =
    useState<MigrasiBatchSyncProgress | null>(null);
  const [isSyncingMigrasi, setIsSyncingMigrasi] = useState<boolean>(false);

  const migrasiSt2026Items = useMemo(() => getMigrasiSuratDataset('ST_2026'), []);

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

  // Keep editor blank on fresh page load / refresh; preserve Daftar Draft & Pegawai
  useEffect(() => {
    clearActiveDraftStorage();
  }, []);

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

  // One-time auto-seed ST 2026 Excel migration history without overwriting existing manual drafts
  useEffect(() => {
    try {
      const alreadyMigrated = localStorage.getItem(MIGRASI_STORAGE_FLAGS.ST_2026);
      if (alreadyMigrated === 'true') return;

      const seeds = buildMigrasiArsipEntries('ST_2026');
      setArsipList((prev) => {
        const { merged } = mergeMigrasiSeedsWithLocalArsip(
          prev,
          seeds,
          generateSuratFingerprint
        );
        return merged;
      });
      localStorage.setItem(MIGRASI_STORAGE_FLAGS.ST_2026, 'true');
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
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

  const performBackgroundUpsert = useCallback(
    async (
      targetSurat: SuratTugasData,
      options?: {
        silent?: boolean;
        markTercatat?: boolean;
        tokenOverride?: string;
        ownerEmailOverride?: string | null;
      }
    ): Promise<boolean> => {
      const silent = options?.silent ?? true;
      const markTercatat = options?.markTercatat ?? false;

      if (inFlightPromiseRef.current) {
        if (silent) {
          const prevQueued = queuedAutoSyncRef.current;
          queuedAutoSyncRef.current = {
            surat: targetSurat,
            silent: prevQueued ? prevQueued.silent && silent : silent,
            markTercatat: prevQueued
              ? prevQueued.markTercatat || markTercatat
              : markTercatat,
          };
          return false;
        }
        while (inFlightPromiseRef.current) {
          try {
            await inFlightPromiseRef.current;
          } catch {
            // proceed after previous request settles
          }
        }
      }

      const payloadSurat: SuratTugasData = {
        ...targetSurat,
        statusSurat: markTercatat
          ? 'Tercatat / Final'
          : targetSurat.statusSurat || 'Draft',
        pegawaiList: targetSurat.pegawaiList.map((p) => ({ ...p })),
      };
      const payloadSig = computeSuratSignature(payloadSurat);
      const targetYear = getTargetYearForSurat(payloadSurat);
      const token = options?.tokenOverride || getAccessToken();
      const effectiveEmail = options?.ownerEmailOverride ?? googleUser?.email;
      const canUseOwnerDirect = Boolean(token) && isOwnerAccount(effectiveEmail);

      if (!canUseOwnerDirect && !bridgeConnected) {
        if (silent) {
          setAutoSyncStatus('idle');
          return false;
        }
        lastAttemptedSigRef.current = payloadSig;
        setAutoSyncStatus('error');
        setAutoSyncError(
          'Jembatan Apps Script belum aktif dan akun Admin Google belum terhubung.'
        );
        return false;
      }

      lastAttemptedSigRef.current = payloadSig;
      setAutoSyncStatus('syncing');
      setAutoSyncError(null);

      const executeRun = (async (): Promise<boolean> => {
        try {
          let syncedViaOwner = false;

          if (canUseOwnerDirect && token) {
            try {
              const summary = await ensureConnectedSpreadsheet(token, targetYear);
              const { summary: ensuredSummary } = await ensureYearSheet(
                summary.spreadsheetId,
                targetYear,
                token
              );
              setSpreadsheet(ensuredSummary);

              const { existingRowNumber, nextRowNumberDisplay } =
                await checkExistingRecordRow(
                  ensuredSummary.spreadsheetId,
                  targetYear,
                  payloadSurat.id,
                  token
                );

              if (existingRowNumber !== null) {
                await updateExistingSuratRow(
                  ensuredSummary.spreadsheetId,
                  targetYear,
                  existingRowNumber,
                  payloadSurat,
                  token
                );
              } else {
                await appendSuratToYearSheet(
                  ensuredSummary.spreadsheetId,
                  targetYear,
                  nextRowNumberDisplay,
                  payloadSurat,
                  token
                );
              }

              syncedViaOwner = true;
              if (targetYear === selectedYear) {
                void fetchRowsForSheet(
                  ensuredSummary.spreadsheetId,
                  targetYear,
                  token
                )
                  .then((refreshed) => {
                    setSheetRows(refreshed);
                  })
                  .catch(() => {
                    // non-blocking refresh
                  });
              }
            } catch (ownerErr) {
              if (ownerErr instanceof SheetsAuthError) {
                clearAccessToken();
                setNeedsAuth(true);
                if (!bridgeConnected) throw ownerErr;
              } else if (!bridgeConnected) {
                throw ownerErr;
              }
            }
          }

          if (!syncedViaOwner) {
            if (!bridgeConnected) {
              throw new Error('Koneksi Google Sheets belum tersedia.');
            }
            const bridgeRes = await upsertSuratViaBridge(
              targetYear,
              payloadSurat,
              true,
              customBridgeHeader
            );
            if (!bridgeRes.ok && bridgeRes.error) {
              throw new Error(bridgeRes.error);
            }
            if (targetYear === selectedYear) {
              void fetchBridgeYearRows(targetYear, customBridgeHeader)
                .then((res) => {
                  setSpreadsheet(res.summary);
                  setSheetRows(res.rows);
                })
                .catch(() => {
                  // non-blocking refresh
                });
            }
          }

          lastSyncedSigRef.current = payloadSig;
          if (silent && !markTercatat) {
            sessionAutoSavedIdRef.current = payloadSurat.id;
          }
          setSheetsError(null);

          const currentLatestSig = computeSuratSignature(latestSuratRef.current);
          if (currentLatestSig === payloadSig) {
            setAutoSyncStatus('synced');
          } else {
            setAutoSyncStatus('idle');
          }
          setAutoSyncError(null);
          return true;
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : 'Gagal menyinkronkan otomatis ke Google Sheets.';
          setAutoSyncStatus('error');
          setAutoSyncError(msg);
          if (!silent) {
            setSheetsError(msg);
          }
          return false;
        } finally {
          inFlightPromiseRef.current = null;
          const queued = queuedAutoSyncRef.current;
          if (queued) {
            queuedAutoSyncRef.current = null;
            void performBackgroundUpsert(queued.surat, {
              silent: queued.silent,
              markTercatat: queued.markTercatat,
            });
          }
        }
      })();

      inFlightPromiseRef.current = executeRun;
      return executeRun;
    },
    [
      bridgeConnected,
      customBridgeHeader,
      ensureConnectedSpreadsheet,
      googleUser?.email,
      selectedYear,
    ]
  );

  const handleRetryAutoSync = useCallback(() => {
    const current = latestSuratRef.current;
    const token = getAccessToken();
    const canUseOwnerDirect = Boolean(token) && isOwnerAccount(googleUser?.email);
    if (!bridgeConnected && !canUseOwnerDirect) {
      setAuthPromptDraft(current);
      return;
    }
    if (!isSuratReadyForAutoSync(current)) {
      showToast(
        'Lengkapi minimal Dasar Surat dan 1 Pegawai untuk menyinkronkan ke Google Sheets'
      );
      return;
    }
    void performBackgroundUpsert(current, {
      silent: false,
      markTercatat: current.statusSurat === 'Tercatat / Final',
    }).then((ok) => {
      if (ok) {
        showToast('Surat berhasil disinkronkan ulang ke Google Sheets');
      }
    });
  }, [bridgeConnected, googleUser?.email, performBackgroundUpsert, showToast]);

  // Trigger 2: Silent 3-second debounced auto-save after form edits
  useEffect(() => {
    if (debounceSyncTimerRef.current !== null) {
      window.clearTimeout(debounceSyncTimerRef.current);
      debounceSyncTimerRef.current = null;
    }

    if (!isSuratReadyForAutoSync(surat)) {
      if (autoSyncStatus === 'synced') {
        setAutoSyncStatus('idle');
      }
      return;
    }

    const token = getAccessToken();
    const canUseOwnerDirect = Boolean(token) && isOwnerAccount(googleUser?.email);
    if (!bridgeConnected && !canUseOwnerDirect) {
      return;
    }

    const sig = computeSuratSignature(surat);
    if (
      sig === initialSigRef.current ||
      sig === lastSyncedSigRef.current ||
      sig === lastAttemptedSigRef.current
    ) {
      return;
    }

    const snapshot: SuratTugasData = {
      ...surat,
      pegawaiList: surat.pegawaiList.map((p) => ({ ...p })),
    };

    debounceSyncTimerRef.current = window.setTimeout(() => {
      debounceSyncTimerRef.current = null;
      void performBackgroundUpsert(snapshot, {
        silent: true,
        markTercatat: snapshot.statusSurat === 'Tercatat / Final',
      });
    }, 3000);

    return () => {
      if (debounceSyncTimerRef.current !== null) {
        window.clearTimeout(debounceSyncTimerRef.current);
        debounceSyncTimerRef.current = null;
      }
    };
  }, [
    autoSyncStatus,
    bridgeConnected,
    googleUser?.email,
    isAdminMode,
    performBackgroundUpsert,
    surat,
  ]);

  // Keep Tracking Sheets table fresh via doGet when operator switches to Tracking Sheets tab
  useEffect(() => {
    if (activeTab !== 'sheets') return;
    const token = getAccessToken();
    if (isOwner && token && spreadsheet) {
      void loadYearRows(spreadsheet.spreadsheetId, selectedYear, token);
    } else if (bridgeConnected) {
      void loadBridgeYearData(selectedYear, customBridgeHeader);
    }
  }, [
    activeTab,
    bridgeConnected,
    customBridgeHeader,
    isOwner,
    loadBridgeYearData,
    loadYearRows,
    selectedYear,
    spreadsheet?.spreadsheetId,
  ]);

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
        setAuthPromptDraft(null);
        if (draftToSync) {
          await performBackgroundUpsert(draftToSync, {
            silent: false,
            markTercatat: draftToSync.statusSurat === 'Tercatat / Final',
            tokenOverride: res.accessToken,
            ownerEmailOverride: res.user.email,
          });
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

  const handleBatchSyncMigrasiSt2026 = async () => {
    if (isSyncingMigrasi) return;
    const token = getAccessToken();
    if (!token || !isOwner) {
      setNeedsAuth(true);
      setMigrasiSyncProgress({
        phase: 'error',
        currentBatch: 0,
        totalBatches: 0,
        processed: 0,
        totalPending: 0,
        inserted: 0,
        skipped: 0,
        totalSource: migrasiSt2026Items.length,
        message: 'Masuk sebagai Admin Google terlebih dahulu untuk menyinkronkan data awal ST 2026.',
      });
      return;
    }

    setIsSyncingMigrasi(true);
    setSheetsError(null);
    try {
      const summary = await ensureConnectedSpreadsheet(token, '2026');
      const result = await syncMigrasiDatasetToSheets({
        spreadsheetId: summary.spreadsheetId,
        year: '2026',
        items: migrasiSt2026Items,
        accessToken: token,
        batchSize: 25,
        onProgress: setMigrasiSyncProgress,
      });

      setSpreadsheet(result.summary);
      setSelectedYear('2026');
      await loadYearRows(result.summary.spreadsheetId, '2026', token);
      showToast(
        `${result.inserted} data awal ST 2026 disinkronkan ke Sheet 2026 (${result.skipped} dilewati)`
      );
    } catch (err) {
      if (err instanceof SheetsAuthError) {
        clearAccessToken();
        setNeedsAuth(true);
      }
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal menyinkronkan data awal ST 2026 ke Google Sheets.';
      setMigrasiSyncProgress({
        phase: 'error',
        currentBatch: 0,
        totalBatches: 0,
        processed: 0,
        totalPending: 0,
        inserted: 0,
        skipped: 0,
        totalSource: migrasiSt2026Items.length,
        message: msg,
      });
      setSheetsError(msg);
      showToast(msg);
    } finally {
      setIsSyncingMigrasi(false);
    }
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

  const handleKriteriaChange = (nextKriteria: KriteriaKeberangkatan) => {
    setSurat((prev) => {
      let nextList = [...prev.pegawaiList];
      if (nextList.length > 0) {
        if (nextKriteria === 'sendiri') {
          nextList = [nextList[0]];
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

  const resetFormAfterDownload = useCallback(() => {
    if (debounceSyncTimerRef.current !== null) {
      window.clearTimeout(debounceSyncTimerRef.current);
      debounceSyncTimerRef.current = null;
    }
    clearActiveDraftStorage();
    queuedAutoSyncRef.current = null;
    sessionAutoSavedIdRef.current = null;
    setCopiedSourceRef(null);

    const current = latestSuratRef.current;
    const baseBlank = createEmptyDraft('sendiri', { emptyPegawai: true });
    const freshDraft: SuratTugasData = {
      ...baseBlank,
      jabatanPenandatangan:
        current.jabatanPenandatangan || baseBlank.jabatanPenandatangan,
      namaPenandatangan:
        current.namaPenandatangan || baseBlank.namaPenandatangan,
      kopVarian: current.kopVarian || baseBlank.kopVarian,
      modeSrikandi: current.modeSrikandi,
    };

    initialSigRef.current = computeSuratSignature(freshDraft);
    lastSyncedSigRef.current = '';
    lastAttemptedSigRef.current = '';
    setAutoSyncStatus('idle');
    setAutoSyncError(null);
    setSurat(freshDraft);
    setPdfUploaderKey((prev) => prev + 1);
    if (isMobileLayout) {
      setMobilePane('form');
    }
  }, [isMobileLayout]);

  const handleResetBlank = () => {
    resetFormAfterDownload();
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

  // Check schedule conflicts across sheet rows, local archive, and 2026 migration (Anti SPJ Ganda)
  const checkConflictsAndProceed = useCallback(
    (targetSurat: SuratTugasData, onProceed: () => void) => {
      const targetYear = getTargetYearForSurat(targetSurat);
      const extraMigrasi = targetYear === '2026' ? migrasiSt2026Items : [];
      const conflicts = findScheduleConflictsAcrossSources(
        targetSurat,
        sheetRows,
        arsipList,
        extraMigrasi
      );
      if (conflicts.length > 0) {
        setScheduleConflicts(conflicts);
        setPendingProceedAction(() => onProceed);
        return;
      }
      onProceed();
    },
    [sheetRows, arsipList, migrasiSt2026Items]
  );

  const handleSaveToDraft = () => {
    checkConflictsAndProceed(surat, () => {
      upsertLocalDraftEntry(surat, 'Draft');
      showToast('Surat berhasil disimpan ke Draft');
    });
  };

  const handleOpenSpd = useCallback(
    (targetSurat: SuratTugasData) => {
      if (targetSurat.pegawaiList.length === 0) {
        showToast(
          'Tambahkan minimal 1 orang pegawai ke dalam Surat Tugas terlebih dahulu untuk membuat SPD'
        );
        return;
      }
      checkConflictsAndProceed(targetSurat, () => {
        setSpdModalSurat(targetSurat);
      });
    },
    [checkConflictsAndProceed, showToast]
  );

  const handleAutoSyncSpd = useCallback(
    async (spd: SpdFormData) => {
      const targetYear = spd.tanggalSpd
        ? spd.tanggalSpd.slice(0, 4)
        : String(new Date().getFullYear());
      await upsertSpdViaBridge(targetYear, spd, customBridgeHeader);
    },
    [customBridgeHeader]
  );

  const runFileExport = useCallback(
    async (format: ExportFormat, targetSurat: SuratTugasData) => {
      if (format === 'docx') {
        await exportSuratTugasDocx(targetSurat);
      } else {
        await exportSuratTugasPdf(targetSurat);
      }
    },
    []
  );

  // Trigger 1: Halt immediate export and ask operator to confirm auto-record to Google Spreadsheet
  const handleExportSurat = (format: ExportFormat) => {
    if (
      exportingFormat !== null ||
      downloadConfirmModal?.isBusy ||
      duplicateBusyAction !== null
    ) {
      return;
    }
    if (!isSuratReadyForTracking(surat)) {
      showToast(
        'Lengkapi isi Surat Tugas (kegiatan/dasar & pegawai) terlebih dahulu sebelum mengunduh'
      );
      return;
    }

    if (debounceSyncTimerRef.current !== null) {
      window.clearTimeout(debounceSyncTimerRef.current);
      debounceSyncTimerRef.current = null;
    }

    checkConflictsAndProceed(surat, () => {
      setDownloadConfirmModal({
        format,
        errorMessage: null,
        isBusy: false,
      });
    });
  };

  const handleConfirmSaveAndDownload = async () => {
    if (!downloadConfirmModal || downloadConfirmModal.isBusy) return;
    const { format } = downloadConfirmModal;

    setDownloadConfirmModal({ format, errorMessage: null, isBusy: true });

    if (inFlightPromiseRef.current) {
      try {
        await inFlightPromiseRef.current;
      } catch {
        // continue after in-flight sync finishes
      }
    }

    const finalSurat: SuratTugasData = {
      ...surat,
      statusSurat: 'Tercatat / Final',
      pegawaiList: surat.pegawaiList.map((p) => ({ ...p })),
    };
    const targetYear = getTargetYearForSurat(finalSurat);
    const token = getAccessToken();
    const canUseOwnerDirect = Boolean(token) && isOwnerAccount(googleUser?.email);

    try {
      if (!canUseOwnerDirect && !bridgeConnected) {
        throw new Error(
          'Jembatan Google Sheets belum terhubung. Masuk sebagai Admin atau aktifkan Apps Script Bridge di menu Tracking Sheets.'
        );
      }

      let spreadsheetId = '';
      let viaBridge = false;
      let liveRows: TrackedSuratRow[] = [];

      if (canUseOwnerDirect && token) {
        try {
          const summary = await ensureConnectedSpreadsheet(token, targetYear);
          const { summary: ensuredSummary } = await ensureYearSheet(
            summary.spreadsheetId,
            targetYear,
            token
          );
          setSpreadsheet(ensuredSummary);
          spreadsheetId = ensuredSummary.spreadsheetId;
          liveRows = await fetchRowsForSheet(spreadsheetId, targetYear, token);
        } catch (ownerErr) {
          if (ownerErr instanceof SheetsAuthError) {
            clearAccessToken();
            setNeedsAuth(true);
            if (!bridgeConnected) throw ownerErr;
          } else if (!bridgeConnected) {
            throw ownerErr;
          }
          viaBridge = true;
        }
      } else {
        viaBridge = true;
      }

      if (viaBridge) {
        const bridgeRowsRes = await fetchBridgeYearRows(
          targetYear,
          customBridgeHeader
        );
        setSpreadsheet(bridgeRowsRes.summary);
        spreadsheetId = bridgeRowsRes.summary.spreadsheetId || '';
        liveRows = bridgeRowsRes.rows;
      }

      const excludeAutoSavedId =
        !copiedSourceRef &&
        sessionAutoSavedIdRef.current &&
        sessionAutoSavedIdRef.current === finalSurat.id
          ? sessionAutoSavedIdRef.current
          : null;

      const filteredLiveRows = excludeAutoSavedId
        ? liveRows.filter((r) => r.idSurat.trim() !== excludeAutoSavedId)
        : liveRows;
      const filteredArsip = excludeAutoSavedId
        ? arsipList.filter((a) => a.data.id.trim() !== excludeAutoSavedId)
        : arsipList;

      const duplicateMatch = findDuplicateSuratAcrossSources(
        finalSurat,
        filteredLiveRows,
        filteredArsip,
        targetYear === '2026' ? migrasiSt2026Items : []
      );

      if (duplicateMatch) {
        setDownloadConfirmModal(null);
        setDuplicateError(null);
        setDuplicateBusyAction(null);
        setDuplicateWarning({
          format,
          draft: finalSurat,
          targetYear,
          match: duplicateMatch,
          spreadsheetId,
          viaBridge,
        });
        return;
      }

      if (!viaBridge && token) {
        const { existingRowNumber, nextRowNumberDisplay } =
          await checkExistingRecordRow(
            spreadsheetId,
            targetYear,
            finalSurat.id,
            token
          );
        if (existingRowNumber !== null) {
          await updateExistingSuratRow(
            spreadsheetId,
            targetYear,
            existingRowNumber,
            finalSurat,
            token
          );
        } else {
          await appendSuratToYearSheet(
            spreadsheetId,
            targetYear,
            nextRowNumberDisplay,
            finalSurat,
            token
          );
        }
        if (targetYear === selectedYear) {
          void fetchRowsForSheet(spreadsheetId, targetYear, token)
            .then(setSheetRows)
            .catch(() => {});
        }
      } else {
        const bridgeRes = await upsertSuratViaBridge(
          targetYear,
          finalSurat,
          true,
          customBridgeHeader
        );
        if (!bridgeRes.ok && bridgeRes.error) {
          throw new Error(bridgeRes.error);
        }
        if (targetYear === selectedYear) {
          void fetchBridgeYearRows(targetYear, customBridgeHeader)
            .then((res) => {
              setSpreadsheet(res.summary);
              setSheetRows(res.rows);
            })
            .catch(() => {});
        }
      }

      upsertLocalDraftEntry(finalSurat, 'Tercatat');

      // Export file BEFORE clearing/resetting form state so #surat-preview-paper stays intact for PDF capture
      setExportingFormat(format);
      await runFileExport(format, finalSurat);

      setDownloadConfirmModal(null);
      resetFormAfterDownload();
      showToast(
        'File berhasil diunduh, dicatat ke Spreadsheet, dan formulir telah dikosongkan untuk surat berikutnya.'
      );
    } catch (err) {
      if (err instanceof SheetsAuthError) {
        clearAccessToken();
        setNeedsAuth(true);
      }
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan atau mengunduh Surat Tugas.';
      setDownloadConfirmModal({
        format,
        isBusy: false,
        errorMessage: msg,
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const handleForceDownloadOnly = async () => {
    if (!downloadConfirmModal || downloadConfirmModal.isBusy) return;
    const { format } = downloadConfirmModal;

    setDownloadConfirmModal({ format, errorMessage: null, isBusy: true });
    setExportingFormat(format);
    try {
      const exportDraft: SuratTugasData = {
        ...surat,
        pegawaiList: surat.pegawaiList.map((p) => ({ ...p })),
      };
      await runFileExport(format, exportDraft);
      setDownloadConfirmModal(null);
      resetFormAfterDownload();
      showToast(
        'File berhasil diunduh (tanpa mencatat ke Spreadsheet) dan formulir telah dikosongkan untuk surat berikutnya.'
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : format === 'docx'
            ? 'Gagal mengekspor file Word (.docx)'
            : 'Gagal mengekspor file PDF (.pdf)';
      setDownloadConfirmModal({
        format,
        isBusy: false,
        errorMessage: msg,
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const handleDuplicateDownloadOnly = async () => {
    if (!duplicateWarning || duplicateBusyAction !== null) return;
    const { format, draft } = duplicateWarning;
    setDuplicateBusyAction('download_only');
    setDuplicateError(null);
    setExportingFormat(format);
    try {
      await runFileExport(format, draft);
      setDuplicateWarning(null);
      resetFormAfterDownload();
      showToast(
        'File berhasil diunduh (tanpa mencatat ulang ke Spreadsheet) dan formulir telah dikosongkan untuk surat berikutnya.'
      );
    } catch (err) {
      setDuplicateError(
        err instanceof Error ? err.message : 'Gagal mengekspor file surat.'
      );
    } finally {
      setDuplicateBusyAction(null);
      setExportingFormat(null);
    }
  };

  const handleDuplicateOverwriteOld = async () => {
    if (!duplicateWarning || duplicateBusyAction !== null) return;
    const { format, draft, targetYear, match, spreadsheetId, viaBridge } =
      duplicateWarning;

    setDuplicateBusyAction('overwrite');
    setDuplicateError(null);
    setExportingFormat(format);
    try {
      const overwriteDraft: SuratTugasData = {
        ...draft,
        id: match.row.idSurat || draft.id,
        statusSurat: 'Tercatat / Final',
      };
      const token = getAccessToken();

      if (!viaBridge && token && spreadsheetId) {
        if (match.source === 'sheets' && match.row.rowNumber >= 2) {
          await updateExistingSuratRow(
            spreadsheetId,
            targetYear,
            match.row.rowNumber,
            overwriteDraft,
            token
          );
        } else {
          const { existingRowNumber, nextRowNumberDisplay } =
            await checkExistingRecordRow(
              spreadsheetId,
              targetYear,
              overwriteDraft.id,
              token
            );
          if (existingRowNumber !== null) {
            await updateExistingSuratRow(
              spreadsheetId,
              targetYear,
              existingRowNumber,
              overwriteDraft,
              token
            );
          } else {
            await appendSuratToYearSheet(
              spreadsheetId,
              targetYear,
              nextRowNumberDisplay,
              overwriteDraft,
              token
            );
          }
        }
        if (targetYear === selectedYear) {
          void fetchRowsForSheet(spreadsheetId, targetYear, token)
            .then(setSheetRows)
            .catch(() => {});
        }
      } else {
        const bridgeRes = await upsertSuratViaBridge(
          targetYear,
          overwriteDraft,
          true,
          customBridgeHeader
        );
        if (!bridgeRes.ok && bridgeRes.error) {
          throw new Error(bridgeRes.error);
        }
        if (targetYear === selectedYear) {
          void fetchBridgeYearRows(targetYear, customBridgeHeader)
            .then((res) => {
              setSpreadsheet(res.summary);
              setSheetRows(res.rows);
            })
            .catch(() => {});
        }
      }

      upsertLocalDraftEntry(overwriteDraft, 'Tercatat');
      await runFileExport(format, overwriteDraft);
      setDuplicateWarning(null);
      resetFormAfterDownload();
      showToast(
        'File berhasil diunduh, data lama di Spreadsheet diperbarui, dan formulir telah dikosongkan untuk surat berikutnya.'
      );
    } catch (err) {
      setDuplicateError(
        err instanceof Error
          ? err.message
          : 'Gagal memperbarui data lama di Spreadsheet.'
      );
    } finally {
      setDuplicateBusyAction(null);
      setExportingFormat(null);
    }
  };

  const handleDuplicateSaveAsNew = async () => {
    if (!duplicateWarning || duplicateBusyAction !== null) return;
    const { format, draft, targetYear, spreadsheetId, viaBridge } =
      duplicateWarning;

    setDuplicateBusyAction('save_new');
    setDuplicateError(null);
    setExportingFormat(format);
    try {
      const newDraft: SuratTugasData = {
        ...draft,
        id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        statusSurat: 'Tercatat / Final',
      };
      const token = getAccessToken();

      if (!viaBridge && token && spreadsheetId) {
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
        if (targetYear === selectedYear) {
          void fetchRowsForSheet(spreadsheetId, targetYear, token)
            .then(setSheetRows)
            .catch(() => {});
        }
      } else {
        const bridgeRes = await upsertSuratViaBridge(
          targetYear,
          newDraft,
          true,
          customBridgeHeader
        );
        if (!bridgeRes.ok && bridgeRes.error) {
          throw new Error(bridgeRes.error);
        }
        if (targetYear === selectedYear) {
          void fetchBridgeYearRows(targetYear, customBridgeHeader)
            .then((res) => {
              setSpreadsheet(res.summary);
              setSheetRows(res.rows);
            })
            .catch(() => {});
        }
      }

      upsertLocalDraftEntry(newDraft, 'Tercatat');
      await runFileExport(format, newDraft);
      setDuplicateWarning(null);
      resetFormAfterDownload();
      showToast(
        'File berhasil diunduh, dicatat sebagai baris baru di Spreadsheet, dan formulir telah dikosongkan untuk surat berikutnya.'
      );
    } catch (err) {
      setDuplicateError(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan baris baru ke Spreadsheet.'
      );
    } finally {
      setDuplicateBusyAction(null);
      setExportingFormat(null);
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
    (surat.kriteria === 'sendiri' && surat.pegawaiList.length < 1) ||
    (surat.kriteria === 'tiga_orang' && surat.pegawaiList.length < 3) ||
    surat.kriteria === 'terlampir';

  const minPegawaiAllowed = 0;

  const renderSyncStatusPill = () => {
    const token = getAccessToken();
    const canUseOwnerDirect = Boolean(token) && isOwnerAccount(googleUser?.email);
    const hasSheetsTransport = bridgeConnected || canUseOwnerDirect;
    const currentSig = computeSuratSignature(surat);
    const hasPendingDebounce =
      hasSheetsTransport &&
      isSuratReadyForAutoSync(surat) &&
      currentSig !== initialSigRef.current &&
      currentSig !== lastSyncedSigRef.current &&
      currentSig !== lastAttemptedSigRef.current;

    if (autoSyncStatus === 'syncing') {
      return (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full border bg-amber-50 night:bg-amber-100/80 dark:bg-amber-950/50 text-amber-800 night:text-[#5c4314] dark:text-amber-300 border-amber-200 dark:border-amber-800 whitespace-nowrap shrink-0"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
          Menyimpan...
        </span>
      );
    }

    if (autoSyncStatus === 'error') {
      return (
        <button
          type="button"
          onClick={handleRetryAutoSync}
          title={autoSyncError || 'Sinkronisasi ke Google Sheets gagal — klik untuk mencoba ulang'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full border bg-red-50 night:bg-red-100/80 dark:bg-red-950/50 text-red-700 night:text-red-900 dark:text-red-300 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-950/80 transition-colors whitespace-nowrap shrink-0"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          Gagal Sync — Klik untuk Ulang
        </button>
      );
    }

    if (autoSyncStatus === 'synced') {
      return (
        <span
          role="status"
          aria-live="polite"
          title={`Tersinkron otomatis ke Google Sheets (Sheet ${getTargetYearForSurat(surat)})`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full border bg-emerald-50 night:bg-emerald-900/15 dark:bg-emerald-950/50 text-[#0B5D3B] dark:text-emerald-300 border-emerald-200 night:border-emerald-700/35 dark:border-emerald-800 whitespace-nowrap shrink-0"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          Tersinkron ke Sheets
        </span>
      );
    }

    if (!hasSheetsTransport) {
      return (
        <button
          type="button"
          onClick={() => setActiveTab('sheets')}
          title="Hubungkan Jembatan Apps Script atau login Admin untuk mengaktifkan auto-sync"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full border st-surface-muted st-text-secondary hover:opacity-90 transition-colors whitespace-nowrap shrink-0"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
          Mode Lokal
        </button>
      );
    }

    if (hasPendingDebounce) {
      return (
        <span
          role="status"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full border st-surface-muted st-text-secondary whitespace-nowrap shrink-0"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          Menyimpan...
        </span>
      );
    }

    return (
      <span
        role="status"
        title={`Auto-sync Google Sheets aktif (Sheet ${getTargetYearForSurat(surat)})`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full border st-surface-muted st-text-secondary whitespace-nowrap shrink-0"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 shrink-0" />
        Siap Auto-Sync
      </span>
    );
  };

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
            <header className="no-print sticky top-0 z-30 st-surface border-b overflow-visible">
              <div className="px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2">
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

                <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-0">
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
              </div>

              <div className="px-2.5 py-1 border-t st-border flex items-center justify-between gap-2 text-[11px] st-surface-muted/60">
                {renderSyncStatusPill()}
                <span className="font-mono-tabular text-[10px] st-text-muted truncate">
                  Sheet {getTargetYearForSurat(surat)}
                </span>
              </div>
            </header>

            {mobileMenuOpen && (
              <div className="no-print st-surface border-b st-border shadow-lg z-20 px-3 py-3 space-y-3.5 max-h-[calc(100vh-5.5rem)] overflow-y-auto">
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
                </div>
              </div>
            )}
          </>
        ) : (
          /* TOP BAR CONTRACT: 3 zones on desktop/tablet */
          <header className="no-print sticky top-0 z-30 st-surface border-b px-3 sm:px-6 py-2 xl:py-0 xl:h-14 flex flex-wrap xl:flex-nowrap items-center justify-between gap-2 xl:gap-4 overflow-visible">
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
              className="order-3 xl:order-2 w-full xl:w-auto xl:min-w-0 border-t border-slate-100 night:border-[#e4d5b3] dark:border-slate-700/70 xl:border-t-0 pt-1.5 xl:pt-0 flex items-center justify-between sm:justify-start gap-2.5 sm:gap-5 xl:gap-5 text-[11px] sm:text-xs xl:text-sm font-medium overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <button
                type="button"
                onClick={() => setActiveTab('editor')}
                className={`py-1.5 xl:py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
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
                className={`py-1.5 xl:py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
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
                className={`py-1.5 xl:py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
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
                className={`py-1.5 xl:py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeTab === 'arsip'
                    ? 'text-[#0B5D3B] dark:text-emerald-400 border-[#0B5D3B] dark:border-emerald-400'
                    : 'st-text-secondary border-transparent hover:text-slate-900 night:hover:text-[#3b3228] dark:hover:text-slate-100'
                }`}
              >
                Daftar Draft ({arsipList.length})
              </button>
            </nav>

            <div className="order-2 xl:order-3 flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 min-w-0">
              {renderSyncStatusPill()}

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
            migrasiSt2026Items={migrasiSt2026Items}
            migrasiSyncProgress={migrasiSyncProgress}
            isSyncingMigrasi={isSyncingMigrasi}
            onBatchSyncMigrasiSt2026={() => void handleBatchSyncMigrasiSt2026()}
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
              const loadedSig = computeSuratSignature(loadedDraft);
              initialSigRef.current = loadedSig;
              lastAttemptedSigRef.current = '';
              setAutoSyncError(null);
              if (asTemplateCopy) {
                setCopiedSourceRef({
                  sourceId: loadedDraft.id,
                  fingerprint: generateSuratFingerprint(loadedDraft),
                });
                lastSyncedSigRef.current = '';
                setAutoSyncStatus('idle');
              } else {
                setCopiedSourceRef(null);
                lastSyncedSigRef.current = loadedSig;
                setAutoSyncStatus('synced');
              }
              setSurat(loadedDraft);
              setActiveTab('editor');
              showToast(
                asTemplateCopy
                  ? 'Salinan Surat Tugas dimuat ke editor (referensi asal dipertahankan hingga data inti diubah)'
                  : 'Data Surat Tugas dari Google Sheets dimuat ke editor'
              );
            }}
            onOpenSpd={handleOpenSpd}
          />
        </main>
      )}

      {activeTab === 'arsip' && (
        <main className="flex-1 no-print">
          <ArsipManager
            arsipList={arsipList}
            onLoadArsip={(item) => {
              const loadedDraft: SuratTugasData = {
                ...item.data,
                pegawaiList: item.data.pegawaiList.map((p) => ({ ...p })),
              };
              const loadedSig = computeSuratSignature(loadedDraft);
              setCopiedSourceRef(null);
              initialSigRef.current = loadedSig;
              lastSyncedSigRef.current =
                item.status === 'Tercatat' ? loadedSig : '';
              lastAttemptedSigRef.current = '';
              setAutoSyncError(null);
              setAutoSyncStatus(item.status === 'Tercatat' ? 'synced' : 'idle');
              setSurat(loadedDraft);
              setActiveTab('editor');
              showToast('Draft dimuat ke editor');
            }}
            onDeleteArsip={(id) => {
              setArsipList((prev) => prev.filter((a) => a.id !== id));
              showToast('Draft dihapus');
            }}
            onGoToEditor={() => setActiveTab('editor')}
            onOpenSpd={handleOpenSpd}
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
              key={pdfUploaderKey}
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
                {surat.pegawaiList.length === 0 && (
                  <div className="border border-dashed st-border rounded-lg p-4 st-surface-muted text-center space-y-2.5">
                    <p className="text-xs st-text-secondary">
                      Belum ada pegawai dipilih. Pilih pegawai dari direktori, unggah PDF surat dasar di atas, atau isi manual.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDirTargetIndex(
                            surat.kriteria === 'sendiri' ? 0 : null
                          );
                          setDirModalOpen(true);
                        }}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B5D3B] hover:bg-[#09492E] rounded-md transition-colors"
                      >
                        <Users className="w-3.5 h-3.5" />
                        Pilih dari Direktori
                      </button>
                      <button
                        type="button"
                        onClick={handleAddPegawaiSlot}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium st-text-primary st-surface border st-border rounded-md hover:opacity-90 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Isi Manual
                      </button>
                    </div>
                  </div>
                )}
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
              className={`relative z-20 overflow-visible pt-3 border-t st-border ${
                isMobileLayout
                  ? 'flex flex-col sm:grid sm:grid-cols-3 gap-2'
                  : 'flex flex-wrap items-center justify-between gap-2.5'
              }`}
            >
              <button
                type="button"
                onClick={handleSaveToDraft}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold st-text-primary st-surface border rounded-lg hover:bg-slate-50 night:hover:bg-[#efe3c4] dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5 text-[#0B5D3B] dark:text-emerald-400" />
                Simpan ke Draft
              </button>
              <button
                type="button"
                onClick={() => handleOpenSpd(surat)}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 bg-amber-50 night:bg-amber-900/20 dark:bg-amber-950/60 border border-amber-300/80 dark:border-amber-700/60 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors whitespace-nowrap shrink-0"
                title="Buat SPD (Surat Perjalanan Dinas) dari Surat Tugas ini"
              >
                <Briefcase className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                Buat SPD
              </button>
              <DownloadSplitButton
                exportingFormat={exportingFormat}
                modeSrikandi={surat.modeSrikandi}
                menuPlacement="top"
                fullWidth={isMobileLayout}
                onExport={(format) => void handleExportSurat(format)}
              />
            </div>
          </div>
        </section>

        {/* RIGHT PANE: LIVE A4 PREVIEW CANVAS */}
        <section
          className={`st-desk flex flex-col print-only-container ${
            !isMobileLayout
              ? 'lg:h-[calc(100vh-3.5rem)] flex'
              : mobilePane === 'preview'
                ? 'flex flex-1 min-w-0'
                : 'hidden'
          }`}
        >
          {/* WORKSPACE TOOLBAR */}
          <div
            className={`no-print relative z-30 overflow-visible st-surface border-b ${
              isMobileLayout
                ? 'px-3 py-2.5 flex flex-col gap-2 w-full'
                : 'px-5 py-2.5 flex flex-wrap items-center justify-between gap-2.5'
            }`}
          >
            <div
              className={
                isMobileLayout
                  ? 'w-full space-y-1'
                  : 'flex flex-wrap items-center gap-1.5 max-w-full'
              }
            >
              <span className="block text-[11px] sm:text-xs font-medium st-text-muted whitespace-nowrap shrink-0">
                Muat Contoh:
              </span>
              <div
                className={
                  isMobileLayout
                    ? 'grid grid-cols-3 gap-1.5 w-full'
                    : 'flex flex-wrap items-center gap-1.5'
                }
              >
                <button
                  type="button"
                  onClick={() => handleLoadSample('sendiri')}
                  className="min-h-[38px] px-2 sm:px-2.5 py-1.5 text-xs font-medium st-text-secondary st-surface-muted hover:opacity-90 rounded-md transition-colors whitespace-nowrap text-center"
                >
                  1 Orang
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample('tiga_orang')}
                  className="min-h-[38px] px-2 sm:px-2.5 py-1.5 text-xs font-medium st-text-secondary st-surface-muted hover:opacity-90 rounded-md transition-colors whitespace-nowrap text-center"
                >
                  2-3 Orang
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample('terlampir')}
                  className="min-h-[38px] px-2 sm:px-2.5 py-1.5 text-xs font-medium st-text-secondary st-surface-muted hover:opacity-90 rounded-md transition-colors whitespace-nowrap text-center"
                >
                  &gt; 3 Terlampir
                </button>
              </div>
            </div>

            <div
              className={
                isMobileLayout
                  ? 'flex flex-col gap-2 w-full overflow-visible'
                  : 'flex flex-wrap items-center gap-2 overflow-visible'
              }
            >
              <div
                className={
                  isMobileLayout
                    ? 'grid grid-cols-3 gap-1 w-full p-0.5 st-surface-muted rounded-lg border'
                    : 'flex items-center gap-1 p-0.5 st-surface-muted rounded-md border'
                }
              >
                {[0.7, 0.85, 1].map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZoom(z)}
                    className={`min-h-[34px] sm:min-h-0 px-2 py-1 text-xs font-mono-tabular rounded transition-colors text-center ${
                      zoom === z
                        ? 'st-surface st-text-primary shadow-xs font-medium'
                        : 'st-text-muted hover:text-slate-900 night:hover:text-[#3b3228] dark:hover:text-slate-100'
                    }`}
                  >
                    {Math.round(z * 100)}%
                  </button>
                ))}
              </div>

              <div
                className={
                  isMobileLayout
                    ? 'flex flex-col sm:grid sm:grid-cols-3 gap-2 w-full overflow-visible'
                    : 'flex flex-wrap items-center gap-2 overflow-visible'
                }
              >
                <button
                  type="button"
                  onClick={handleSaveToDraft}
                  className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium st-text-primary st-surface border rounded-lg hover:bg-slate-50 night:hover:bg-[#efe3c4] dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <Save className="w-3.5 h-3.5 text-[#0B5D3B] dark:text-emerald-400 shrink-0" />
                  <span className="truncate">Simpan ke Draft</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenSpd(surat)}
                  className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200 bg-amber-50 night:bg-amber-900/20 dark:bg-amber-950/60 border border-amber-300/80 dark:border-amber-700/60 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors whitespace-nowrap shrink-0"
                  title="Buat SPD (Surat Perjalanan Dinas) dari Surat Tugas ini"
                >
                  <Briefcase className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                  <span className="truncate">Buat SPD</span>
                </button>

                <DownloadSplitButton
                  exportingFormat={exportingFormat}
                  modeSrikandi={surat.modeSrikandi}
                  menuPlacement="bottom"
                  fullWidth={isMobileLayout}
                  onExport={(format) => void handleExportSurat(format)}
                />
              </div>
            </div>
          </div>

          {/* A4 DOCUMENT VIEWPORT */}
          <div
            className={`relative z-0 flex-1 overflow-auto ${
              isMobileLayout ? 'p-2.5 sm:p-3' : 'p-6 sm:p-8'
            } flex justify-center items-start print-only-container`}
          >
            <SuratPreview
              data={surat}
              zoom={zoom}
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

      {/* GOOGLE SHEETS SIGN-IN PROMPT MODAL (only when user clicks retry without Bridge/Admin connection) */}
      <SheetsAuthPromptModal
        isOpen={authPromptDraft !== null}
        targetYear={
          authPromptDraft
            ? getTargetYearForSurat(authPromptDraft)
            : String(new Date().getFullYear())
        }
        isConnecting={isGoogleConnecting}
        pendingActionLabel={null}
        onSignIn={() => void handleGoogleLogin()}
        onOpenTrackingTab={() => setActiveTab('sheets')}
        onClose={() => setAuthPromptDraft(null)}
      />

      {/* PRE-DOWNLOAD CONFIRMATION & AUTO-SAVE TO GOOGLE SPREADSHEET MODAL */}
      <ConfirmDownloadSheetsModal
        isOpen={downloadConfirmModal !== null}
        format={downloadConfirmModal?.format || 'docx'}
        namaKegiatan={surat.namaKegiatan}
        targetYear={getTargetYearForSurat(surat)}
        isBusy={Boolean(downloadConfirmModal?.isBusy)}
        errorMessage={downloadConfirmModal?.errorMessage || null}
        onConfirmSaveAndDownload={() => void handleConfirmSaveAndDownload()}
        onForceDownloadOnly={() => void handleForceDownloadOnly()}
        onCancel={() => {
          if (!downloadConfirmModal?.isBusy) {
            setDownloadConfirmModal(null);
          }
        }}
      />

      {/* DUPLICATE SURAT WARNING MODAL */}
      <DuplicateSuratWarningModal
        isOpen={duplicateWarning !== null}
        format={duplicateWarning?.format || 'docx'}
        waktuInputSebelumnya={
          duplicateWarning?.match.row.waktuInput || ''
        }
        rowNumber={duplicateWarning?.match.row.rowNumber || 0}
        targetYear={
          duplicateWarning?.targetYear || String(new Date().getFullYear())
        }
        namaKegiatan={duplicateWarning?.draft.namaKegiatan || ''}
        matchedBy={duplicateWarning?.match.matchedBy || 'fingerprint'}
        source={duplicateWarning?.match.source || 'sheets'}
        busyAction={duplicateBusyAction}
        errorMessage={duplicateError}
        onDownloadOnly={() => void handleDuplicateDownloadOnly()}
        onOverwriteOld={() => void handleDuplicateOverwriteOld()}
        onSaveAsNew={() => void handleDuplicateSaveAsNew()}
        onCancel={() => {
          if (duplicateBusyAction === null) {
            setDuplicateWarning(null);
            setDuplicateError(null);
          }
        }}
      />

      {/* CONFLICT SCHEDULE WARNING MODAL (ANTI SPJ GANDA) */}
      <ConflictWarningModal
        isOpen={scheduleConflicts.length > 0}
        conflicts={scheduleConflicts}
        onProceed={() => {
          const act = pendingProceedAction;
          setScheduleConflicts([]);
          setPendingProceedAction(null);
          act?.();
        }}
        onCancel={() => {
          setScheduleConflicts([]);
          setPendingProceedAction(null);
        }}
      />

      {/* SPD GENERATOR MODAL */}
      {spdModalSurat && (
        <SpdGeneratorModal
          isOpen={spdModalSurat !== null}
          surat={spdModalSurat}
          onClose={() => setSpdModalSurat(null)}
          onAutoSyncSpd={handleAutoSyncSpd}
          showToast={showToast}
        />
      )}
      </div>
    </div>
  );
}
