import riwayatSt2026 from '../data/riwayat_st_2026.json';
import {
  ArsipSurat,
  KriteriaKeberangkatan,
  Pegawai,
  SuratTugasData,
} from '../types/surat';

export type JenisSuratMigrasi = 'ST' | 'SPD';

export interface RawMigrasiPegawai {
  nama?: string;
  nip?: string;
  pangkatGolongan?: string;
  jabatan?: string;
}

export interface RawMigrasiSuratItem {
  id: string;
  noUrutExcel?: string;
  jenisSurat?: string;
  kriteria?: string;
  pegawai?: RawMigrasiPegawai[];
  namaTampilan?: string;
  nipTampilan?: string;
  kegiatan?: string;
  tempat?: string;
  alamatTempat?: string;
  lokasiLengkap?: string;
  tanggalMulai?: string;
  tanggalSelesai?: string;
  dasarAsal?: string;
  dasarNomor?: string;
  dasarTanggal?: string;
  dasarLengkap?: string;
  tanggalPembuatan?: string;
  status?: string;
}

export interface MigrasiDatasetDescriptor {
  key: 'ST_2026' | string;
  storageFlagKey: string;
  jenisSurat: JenisSuratMigrasi;
  year: string;
  label: string;
  rawItems: RawMigrasiSuratItem[];
}

export const MIGRASI_STORAGE_FLAGS = {
  ST_2026: 'stkemenag_migrasi_st_2026_v1',
} as const;

export const MIGRASI_DATASETS: Record<'ST_2026', MigrasiDatasetDescriptor> = {
  ST_2026: {
    key: 'ST_2026',
    storageFlagKey: MIGRASI_STORAGE_FLAGS.ST_2026,
    jenisSurat: 'ST',
    year: '2026',
    label: 'Riwayat ST 2026 (Migrasi Excel)',
    rawItems: riwayatSt2026 as RawMigrasiSuratItem[],
  },
};

const BULAN_MAP: Record<string, string> = {
  januari: '01',
  jan: '01',
  februari: '02',
  pebruari: '02',
  feb: '02',
  maret: '03',
  mar: '03',
  april: '04',
  apr: '04',
  mei: '05',
  juni: '06',
  jun: '06',
  juli: '07',
  jul: '07',
  agustus: '08',
  agu: '08',
  agst: '08',
  september: '09',
  sepember: '09',
  sept: '09',
  sep: '09',
  oktober: '10',
  okt: '10',
  november: '11',
  nopember: '11',
  nov: '11',
  desember: '12',
  des: '12',
};

function pad2(val: number): string {
  return String(val).padStart(2, '0');
}

export function normalizeMigrasiDate(
  raw?: string | null,
  fallback = '2026-01-01'
): string {
  const cleaned = (raw || '').trim();
  if (!cleaned) return fallback;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // YYYY/MM/DD or YYYY-M-D
  const isoSlashMatch = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoSlashMatch) {
    const [, y, m, d] = isoSlashMatch;
    return `${y}-${pad2(Number(m))}-${pad2(Number(d))}`;
  }

  // DD/MM/YYYY or D-M-YYYY
  const dmyMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${pad2(Number(m))}-${pad2(Number(d))}`;
  }

  // "04 Maret 2026", "6 Maret 2026", "23 Sepember 2026"
  const indoMatch = cleaned.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
  if (indoMatch) {
    const dayNum = Number(indoMatch[1]);
    const monthKey = indoMatch[2].toLowerCase();
    const yearNum = indoMatch[3];
    const monthIso = BULAN_MAP[monthKey];
    if (monthIso && dayNum >= 1 && dayNum <= 31) {
      return `${yearNum}-${monthIso}-${pad2(dayNum)}`;
    }
  }

  return fallback;
}

function resolveKriteria(
  rawKriteria: string | undefined,
  pegawaiCount: number
): KriteriaKeberangkatan {
  if (rawKriteria === 'terlampir') return 'terlampir';
  if (rawKriteria === 'tiga_orang') return 'tiga_orang';
  if (rawKriteria === 'sendiri') return 'sendiri';
  if (pegawaiCount > 3) return 'terlampir';
  if (pegawaiCount >= 2) return 'tiga_orang';
  return 'sendiri';
}

export function mapMigrasiItemToSuratTugas(
  raw: RawMigrasiSuratItem,
  index: number,
  defaultYear = '2026',
  resolvedId?: string
): SuratTugasData {
  const baseDate = `${defaultYear}-01-01`;
  const tanggalNaskah = normalizeMigrasiDate(
    raw.tanggalPembuatan,
    normalizeMigrasiDate(raw.tanggalMulai, baseDate)
  );
  const dasarTanggal = normalizeMigrasiDate(raw.dasarTanggal, tanggalNaskah);
  const tanggalMulai = normalizeMigrasiDate(raw.tanggalMulai, tanggalNaskah);
  const rawSelesai = normalizeMigrasiDate(raw.tanggalSelesai, tanggalMulai);
  const tanggalSelesai = rawSelesai < tanggalMulai ? tanggalMulai : rawSelesai;

  const rawPegawai = Array.isArray(raw.pegawai) ? raw.pegawai : [];
  const pegawaiList: Pegawai[] = rawPegawai.map((p, pIdx) => ({
    id: `peg-mig-${defaultYear}-${index}-${pIdx}`,
    nama: (p.nama || '').trim(),
    nip: (p.nip || '').trim(),
    pangkatGolongan: (p.pangkatGolongan || '').trim(),
    jabatan: (p.jabatan || '').trim(),
  }));

  const kriteria = resolveKriteria(raw.kriteria, pegawaiList.length);
  const lokasiTujuan =
    (raw.lokasiLengkap || '').trim() ||
    [raw.tempat, raw.alamatTempat]
      .map((v) => (v || '').trim())
      .filter(Boolean)
      .join(', ') ||
    'Jember';

  return {
    id: (resolvedId || raw.id || `ST-${defaultYear}-MIG-${index + 1}`).trim(),
    kriteria,
    modeSrikandi: true,
    nomorSurat: '',
    tanggalNaskah,
    kopVarian: 'telepon',
    dasarAsal: (raw.dasarAsal || '').trim(),
    dasarNomor: (raw.dasarNomor || '').trim(),
    dasarTanggal,
    namaKegiatan: (raw.kegiatan || '').trim(),
    menimbangCustom: '',
    gunakanMenimbangCustom: false,
    lokasiTujuan,
    tanggalMulai,
    tanggalSelesai,
    pegawaiList,
    jabatanPenandatangan: 'Kepala Kantor',
    namaPenandatangan: 'Dr. SANTOSO, S.Ag, M.Pd.',
    statusSurat:
      (raw.status || '').trim() || `Tercatat (Migrasi Excel ${defaultYear})`,
  };
}

export function getMigrasiSuratDataset(
  datasetKey: keyof typeof MIGRASI_DATASETS = 'ST_2026'
): SuratTugasData[] {
  const descriptor = MIGRASI_DATASETS[datasetKey];
  const seenIds = new Map<string, number>();

  return descriptor.rawItems.map((raw, idx) => {
    const baseId = (raw.id || `${descriptor.jenisSurat}-${descriptor.year}-${idx + 1}`).trim();
    const count = (seenIds.get(baseId) || 0) + 1;
    seenIds.set(baseId, count);
    const uniqueId = count === 1 ? baseId : `${baseId}-${count}`;
    return mapMigrasiItemToSuratTugas(raw, idx, descriptor.year, uniqueId);
  });
}

export function buildMigrasiArsipEntries(
  datasetKey: keyof typeof MIGRASI_DATASETS = 'ST_2026'
): ArsipSurat[] {
  const descriptor = MIGRASI_DATASETS[datasetKey];
  const mapped = getMigrasiSuratDataset(datasetKey);

  return mapped.map((data, idx) => ({
    id: `arsip-migrasi-${descriptor.jenisSurat.toLowerCase()}-${descriptor.year}-${idx}-${data.id}`,
    savedAt: `${data.tanggalNaskah}T08:00:00.000Z`,
    status: 'Tercatat',
    data,
  }));
}

export function mergeMigrasiSeedsWithLocalArsip(
  existing: ArsipSurat[],
  seeds: ArsipSurat[],
  getFingerprint: (surat: SuratTugasData) => string
): { merged: ArsipSurat[]; addedCount: number } {
  const existingIds = new Set(
    existing.map((item) => (item.data.id || '').trim()).filter(Boolean)
  );
  const existingFingerprints = new Set(
    existing.map((item) => getFingerprint(item.data)).filter(Boolean)
  );

  const additions: ArsipSurat[] = [];
  for (const seed of seeds) {
    const id = (seed.data.id || '').trim();
    const fp = getFingerprint(seed.data);
    if ((id && existingIds.has(id)) || (fp && existingFingerprints.has(fp))) {
      continue;
    }
    if (id) existingIds.add(id);
    additions.push(seed);
  }

  // Keep user-created drafts/archives first, then append chronological seed records
  // sorted newest-first by tanggalNaskah so recent 2026 records appear near the top.
  const sortedAdditions = [...additions].sort((a, b) =>
    (b.data.tanggalNaskah || '').localeCompare(a.data.tanggalNaskah || '')
  );

  return {
    merged: [...existing, ...sortedAdditions],
    addedCount: sortedAdditions.length,
  };
}
