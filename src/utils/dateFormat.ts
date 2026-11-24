const BULAN_INDONESIA = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const HARI_INDONESIA = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

const BULAN_MAP: Record<string, number> = {
  januari: 0,
  jan: 0,
  februari: 1,
  feb: 1,
  pebruari: 1,
  maret: 2,
  mar: 2,
  april: 3,
  apr: 3,
  mei: 4,
  may: 4,
  juni: 5,
  jun: 5,
  juli: 6,
  jul: 6,
  agustus: 7,
  agu: 7,
  agt: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  oktober: 9,
  okt: 9,
  oct: 9,
  november: 10,
  nov: 10,
  nopember: 10,
  nop: 10,
  desember: 11,
  des: 11,
  dec: 11,
};

function makeLocalMidnightDate(year: number, monthIndex: number, day: number): Date | null {
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthIndex) ||
    !Number.isFinite(day) ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const d = new Date(year, monthIndex, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== monthIndex ||
    d.getDate() !== day
  ) {
    return null;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseLocalDate(isoDate: string): Date | null {
  if (!isoDate) return null;
  const match = isoDate.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (!match) return null;
  return makeLocalMidnightDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function toIsoDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseFlexibleDate(
  raw?: string | null,
  fallbackMonth?: number,
  fallbackYear?: number
): Date | null {
  if (!raw) return null;
  let cleaned = raw
    .trim()
    .replace(/^(?:minggu|senin|selasa|rabu|kamis|jumat|jum'at|sabtu)\s*,?\s+/i, '')
    .replace(/\s+/g, ' ');
  if (!cleaned || cleaned === '-') return null;

  // 1. ISO YYYY-MM-DD
  const iso = parseLocalDate(cleaned);
  if (iso) return iso;

  // 2. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    return makeLocalMidnightDate(
      Number(dmyMatch[3]),
      Number(dmyMatch[2]) - 1,
      Number(dmyMatch[1])
    );
  }

  // 3. Indonesian "25 November 2026"
  const indoFullMatch = cleaned.match(/^(\d{1,2})\s+([a-zA-Z.]+)\s+(\d{4})$/);
  if (indoFullMatch) {
    const monthKey = indoFullMatch[2].replace(/\./g, '').toLowerCase();
    const monthIdx = BULAN_MAP[monthKey];
    if (monthIdx !== undefined) {
      return makeLocalMidnightDate(
        Number(indoFullMatch[3]),
        monthIdx,
        Number(indoFullMatch[1])
      );
    }
  }

  // 4. Indonesian "25 November" (using fallbackYear)
  if (fallbackYear !== undefined) {
    const indoDayMonthMatch = cleaned.match(/^(\d{1,2})\s+([a-zA-Z.]+)$/);
    if (indoDayMonthMatch) {
      const monthKey = indoDayMonthMatch[2].replace(/\./g, '').toLowerCase();
      const monthIdx = BULAN_MAP[monthKey];
      if (monthIdx !== undefined) {
        return makeLocalMidnightDate(
          fallbackYear,
          monthIdx,
          Number(indoDayMonthMatch[1])
        );
      }
    }

    // 5. Day only "25" (using fallbackMonth & fallbackYear)
    if (fallbackMonth !== undefined) {
      const dayOnlyMatch = cleaned.match(/^(\d{1,2})$/);
      if (dayOnlyMatch) {
        return makeLocalMidnightDate(
          fallbackYear,
          fallbackMonth,
          Number(dayOnlyMatch[1])
        );
      }
    }
  }

  return null;
}

function parseSingleRangeExpression(raw?: string | null): { start: Date; end: Date } | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned === '-') return null;

  // Normalize compact numeric-month ranges like "25-27 November 2026" -> "25 - 27 November 2026"
  const normalized = cleaned.replace(
    /^(\d{1,2})\s*-\s*(\d{1,2}\s+[a-zA-Z.]+\s+\d{4})$/,
    '$1 - $2'
  );

  // Split range delimiters: s.d., s.d, s/d, sampai dengan, sampai, hingga, " - ", " dan "
  const parts = normalized.split(
    /\s+(?:s\.?d\.?|s\/d|sampai(?:\s+dengan)?|hingga|dan|-)\s+/i
  );

  if (parts.length >= 2) {
    const rightRaw = parts[parts.length - 1].trim();
    const leftRaw = parts[0].trim();
    const endDate = parseFlexibleDate(rightRaw);
    if (endDate) {
      const startDate =
        parseFlexibleDate(leftRaw, endDate.getMonth(), endDate.getFullYear()) ||
        endDate;
      return startDate.getTime() <= endDate.getTime()
        ? { start: startDate, end: endDate }
        : { start: endDate, end: startDate };
    }
  }

  const single = parseFlexibleDate(cleaned);
  return single ? { start: single, end: single } : null;
}

export function parseDateRange(
  mulaiStr?: string | null,
  selesaiStr?: string | null
): { start: Date; end: Date } | null {
  const mulaiRange = parseSingleRangeExpression(mulaiStr);
  const selesaiRange = parseSingleRangeExpression(selesaiStr);

  if (mulaiRange && selesaiRange) {
    const start =
      mulaiRange.start.getTime() <= selesaiRange.start.getTime()
        ? mulaiRange.start
        : selesaiRange.start;
    const end =
      selesaiRange.end.getTime() >= mulaiRange.end.getTime()
        ? selesaiRange.end
        : mulaiRange.end;
    return { start, end };
  }

  if (mulaiRange) {
    return mulaiRange;
  }

  if (selesaiRange) {
    const fallbackStart = parseFlexibleDate(
      mulaiStr,
      selesaiRange.end.getMonth(),
      selesaiRange.end.getFullYear()
    );
    if (fallbackStart) {
      return fallbackStart.getTime() <= selesaiRange.end.getTime()
        ? { start: fallbackStart, end: selesaiRange.end }
        : { start: selesaiRange.end, end: fallbackStart };
    }
    return selesaiRange;
  }

  return null;
}

export function formatTanggalIndo(isoDate: string): string {
  const date = parseLocalDate(isoDate) || parseFlexibleDate(isoDate);
  if (!date) return isoDate || '-';
  const day = date.getDate();
  const month = BULAN_INDONESIA[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export function getNamaHariIndo(isoDate: string): string {
  const date = parseLocalDate(isoDate) || parseFlexibleDate(isoDate);
  if (!date) return '-';
  return HARI_INDONESIA[date.getDay()];
}

export function formatRentangTanggal(mulai: string, selesai: string): string {
  const tMulai = formatTanggalIndo(mulai);
  const tSelesai = formatTanggalIndo(selesai || mulai);
  return `${tMulai} s.d ${tSelesai}`;
}

export function formatRentangHariTanggal(mulai: string, selesai: string): string {
  const hMulai = getNamaHariIndo(mulai);
  const hSelesai = getNamaHariIndo(selesai || mulai);
  const tMulai = formatTanggalIndo(mulai);
  const tSelesai = formatTanggalIndo(selesai || mulai);
  return `Hari: ${hMulai} s.d. ${hSelesai}, ${tMulai} s.d ${tSelesai}`;
}

/**
 * Splits "Pembina Tk.I (IV/b)" into two lines for the Lampiran table cell,
 * matching the official PDF ("Pembina Tk.I" on line 1, "IV/b" on line 2).
 */
export function splitPangkatGolongan(value: string): { pangkat: string; golongan: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*?)\s*\(\s*([^)]+)\s*\)\s*$/);
  if (match) {
    const pangkat = match[1].trim();
    const golongan = match[2].trim();
    return {
      pangkat: pangkat === '-' ? '' : pangkat,
      golongan,
    };
  }
  return { pangkat: trimmed, golongan: '' };
}

export function computeDaysDifference(mulai: string, selesai: string): number {
  if (!mulai) return 1;
  const range = parseDateRange(mulai, selesai || mulai);
  if (!range) return 1;
  const diffDays =
    Math.round((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diffDays);
}

const TERBILANG_SATUAN = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
  'sepuluh',
  'sebelas',
];

export function terbilang(num: number): string {
  const n = Math.floor(Math.abs(num));
  if (!Number.isFinite(n) || n === 0) return 'nol';
  if (n < 12) return TERBILANG_SATUAN[n];
  if (n < 20) return `${terbilang(n - 10)} belas`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const rem = n % 10;
    return `${terbilang(tens)} puluh${rem ? ` ${terbilang(rem)}` : ''}`;
  }
  if (n < 200) {
    const rem = n - 100;
    return `seratus${rem ? ` ${terbilang(rem)}` : ''}`;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rem = n % 100;
    return `${terbilang(hundreds)} ratus${rem ? ` ${terbilang(rem)}` : ''}`;
  }
  if (n < 2000) {
    const rem = n - 1000;
    return `seribu${rem ? ` ${terbilang(rem)}` : ''}`;
  }
  if (n < 1000000) {
    const thousands = Math.floor(n / 1000);
    const rem = n % 1000;
    return `${terbilang(thousands)} ribu${rem ? ` ${terbilang(rem)}` : ''}`;
  }
  return String(n);
}

export function terbilangHari(num: number): string {
  const days = Math.max(1, Math.floor(Number.isFinite(num) ? num : 1));
  return `${days} (${terbilang(days)}) hari`;
}
