import crypto from 'crypto';

const LOCK_DURATION_MS = 10 * 60 * 1000; // 10 menit
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 menit
const MAX_REQUESTS_IN_WINDOW = 10;

interface SecurityState {
  lockedUntil: number;
  lockReason: string | null;
  requestTimestamps: number[];
  failedUnlockTimestamps: number[];
}

const GLOBAL_SECURITY_KEY = '__situgas_kemenag_security_guard_state__';

function getSecurityState(): SecurityState {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_SECURITY_KEY]) {
    g[GLOBAL_SECURITY_KEY] = {
      lockedUntil: 0,
      lockReason: null,
      requestTimestamps: [],
      failedUnlockTimestamps: [],
    } satisfies SecurityState;
  }
  const state = g[GLOBAL_SECURITY_KEY] as SecurityState;
  if (!Array.isArray(state.failedUnlockTimestamps)) {
    state.failedUnlockTimestamps = [];
  }
  return state;
}

function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) {
      if (Array.isArray(v)) return (v[0] || '').trim();
      return typeof v === 'string' ? v.trim() : '';
    }
  }
  return '';
}

function constantTimeEquals(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export interface SecurityCheckResult {
  allowed: boolean;
  status?: number;
  lockedUntil?: number;
  remainingSeconds?: number;
  reason?: string;
  error?: string;
}

export function checkAndRecordSecurityGuard(
  headers: Record<string, string | string[] | undefined>
): SecurityCheckResult {
  const state = getSecurityState();
  const now = Date.now();

  if (state.lockedUntil > now) {
    const remainingSeconds = Math.max(1, Math.ceil((state.lockedUntil - now) / 1000));
    const remainingMinutes = Math.ceil(remainingSeconds / 60);
    const reason =
      state.lockReason ||
      'Sistem ekstraksi dikunci sementara selama 10 menit untuk perlindungan kuota API.';
    return {
      allowed: false,
      status: 423,
      lockedUntil: state.lockedUntil,
      remainingSeconds,
      reason,
      error: `${reason} Silakan tunggu ${remainingMinutes} menit lagi atau buka kunci melalui Admin.`,
    };
  }

  // Auto-reset expired lock
  if (state.lockedUntil > 0 && state.lockedUntil <= now) {
    state.lockedUntil = 0;
    state.lockReason = null;
    state.requestTimestamps = [];
  }

  // 1. Cek geo-header Vercel (hanya aktif ketika header x-vercel-ip-country dikirim)
  const countryCode = getHeaderValue(headers, 'x-vercel-ip-country').toUpperCase();
  if (countryCode && countryCode !== 'ID') {
    state.lockedUntil = now + LOCK_DURATION_MS;
    state.lockReason = `Akses ekstraksi dari luar Indonesia (${countryCode}) terdeteksi. Sistem dikunci otomatis selama 10 menit.`;
    return {
      allowed: false,
      status: 423,
      lockedUntil: state.lockedUntil,
      remainingSeconds: Math.ceil(LOCK_DURATION_MS / 1000),
      reason: state.lockReason,
      error: state.lockReason,
    };
  }

  // 2. Cek rate-limit: maksimal 10 permintaan dalam 5 menit
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  state.requestTimestamps = state.requestTimestamps.filter((ts) => ts > windowStart);
  state.requestTimestamps.push(now);

  if (state.requestTimestamps.length > MAX_REQUESTS_IN_WINDOW) {
    state.lockedUntil = now + LOCK_DURATION_MS;
    state.lockReason =
      'Terdeteksi permintaan ekstraksi berlebihan (> 10 permintaan dalam 5 menit). Sistem dikunci otomatis selama 10 menit.';
    return {
      allowed: false,
      status: 423,
      lockedUntil: state.lockedUntil,
      remainingSeconds: Math.ceil(LOCK_DURATION_MS / 1000),
      reason: state.lockReason,
      error: state.lockReason,
    };
  }

  return { allowed: true };
}

export interface UnlockResult {
  success: boolean;
  status: number;
  message: string;
}

export function unlockSecurityLock(adminKey: string): UnlockResult {
  const state = getSecurityState();
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  state.failedUnlockTimestamps = state.failedUnlockTimestamps.filter(
    (ts) => ts > windowStart
  );

  if (state.failedUnlockTimestamps.length >= 15) {
    return {
      success: false,
      status: 429,
      message: 'Terlalu banyak percobaan kode Admin gagal. Tunggu beberapa menit.',
    };
  }

  const configuredKey = (process.env.ADMIN_UNLOCK_KEY || '').trim();
  const expectedKey = configuredKey || 'admin123';
  const candidate = typeof adminKey === 'string' ? adminKey.trim() : '';

  if (!candidate || !constantTimeEquals(candidate, expectedKey)) {
    state.failedUnlockTimestamps.push(now);
    return {
      success: false,
      status: 401,
      message: 'Kode Admin salah.',
    };
  }

  state.lockedUntil = 0;
  state.lockReason = null;
  state.requestTimestamps = [];
  state.failedUnlockTimestamps = [];

  return {
    success: true,
    status: 200,
    message: 'Sistem berhasil dibuka kembali oleh Admin.',
  };
}
