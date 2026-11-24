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

function parseLocalDate(isoDate: string): Date | null {
  if (!isoDate) return null;
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

export function formatTanggalIndo(isoDate: string): string {
  const date = parseLocalDate(isoDate);
  if (!date) return isoDate || '-';
  const day = date.getDate();
  const month = BULAN_INDONESIA[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export function getNamaHariIndo(isoDate: string): string {
  const date = parseLocalDate(isoDate);
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
  const d1 = new Date(mulai).getTime();
  const d2 = new Date(selesai || mulai).getTime();
  if (isNaN(d1) || isNaN(d2)) return 1;
  const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diffDays);
}

export function terbilangHari(num: number): string {
  const kata = [
    '',
    'Satu',
    'Dua',
    'Tiga',
    'Empat',
    'Lima',
    'Enam',
    'Tujuh',
    'Delapan',
    'Sembilan',
    'Sepuluh',
    'Sebelas',
    'Dua Belas',
    'Tiga Belas',
    'Empat Belas',
    'Lima Belas',
  ];
  const t = kata[num] || String(num);
  return `${num} (${t}) Hari`;
}
