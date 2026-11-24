export type KriteriaKeberangkatan = 'sendiri' | 'tiga_orang' | 'terlampir';

export type KopVarianId = 'telepon' | 'whatsapp';

export interface KopVarian {
  id: KopVarianId;
  label: string;
  kontakBaris: string;
  email: string;
}

export interface Pegawai {
  id: string;
  nama: string;
  nip: string;
  pangkatGolongan: string;
  jabatan: string;
}

export interface SuratTugasData {
  id: string;
  kriteria: KriteriaKeberangkatan;
  modeSrikandi: boolean;
  nomorSurat: string;
  tanggalNaskah: string; // YYYY-MM-DD
  kopVarian: KopVarianId;

  // Dasar Surat Tugas
  dasarAsal: string;
  dasarNomor: string;
  dasarTanggal: string; // YYYY-MM-DD

  // Kegiatan & Lokasi
  namaKegiatan: string;
  menimbangCustom: string;
  gunakanMenimbangCustom: boolean;
  lokasiTujuan: string;
  tanggalMulai: string; // YYYY-MM-DD
  tanggalSelesai: string; // YYYY-MM-DD

  // Pegawai yang ditugaskan
  pegawaiList: Pegawai[];

  // Penandatangan
  jabatanPenandatangan: string;
  namaPenandatangan: string;
  statusSurat?: string;
}

export type StatusSurat = 'Draft' | 'Tercatat';

export interface ArsipSurat {
  id: string;
  savedAt: string;
  status?: StatusSurat;
  data: SuratTugasData;
}

export const KOP_VARIAN_OPTIONS: Record<KopVarianId, KopVarian> = {
  telepon: {
    id: 'telepon',
    label: 'Telepon (0331) 486008 · kabjember@kemenag.go.id',
    kontakBaris: 'Telepon (0331) 486008',
    email: 'kabjember@kemenag.go.id',
  },
  whatsapp: {
    id: 'whatsapp',
    label: 'WhatsApp Center: 0811 365 6262 · kemenagjember@gmail.com',
    kontakBaris: 'WhatsApp Center: 0811 365 6262',
    email: 'kemenagjember@gmail.com',
  },
};

import dukPegawaiData from '../data/dukPegawai.json';

export const PANGKAT_GOLONGAN_PRESETS: string[] = [
  'Pembina Utama (IV/e)',
  'Pembina Utama Madya (IV/d)',
  'Pembina Utama Muda (IV/c)',
  'Pembina Tk.I (IV/b)',
  'Pembina (IV/a)',
  'Pembina ( IV/a )',
  'Penata Tk.I (III/d)',
  'Penata (III/c)',
  'Penata Muda Tk.I (III/b)',
  'Penata Muda (III/a)',
  'Pengatur Tk.I (II/d)',
  'Pengatur (II/c)',
  'Pengatur Muda Tk.I (II/b)',
  'Pengatur Muda (II/a)',
  'Juru Tk.I (I/d)',
  'Juru (I/c)',
  'Juru Muda Tk.I (I/b)',
  'Juru Muda (I/a)',
  '- (IX)',
  '- (VII)',
  'IX',
  'VII',
  'V',
  'III',
  'I',
  'PPPK Paruh Waktu',
];

export const DASAR_ASAL_PRESETS: string[] = [
  'Surat dari Kepala Kantor Wilayah Kementerian Agama Provinsi Jawa Timur',
  'Nota Dinas dari Kepala Seksi Bimas Islam',
  'Nota Dinas dari Kepala Seksi Pendidikan Madrasah',
  'Nota Dinas dari Kepala Sub Bagian Tata Usaha',
  'Surat dari Direktorat Jenderal Pendidikan Islam Kementerian Agama RI',
  'Undangan dari Pemerintah Kabupaten Jember',
];

export const INITIAL_PEGAWAI_DIRECTORY: Pegawai[] = dukPegawaiData as Pegawai[];

export const SAMPLE_TEMPLATES: Record<KriteriaKeberangkatan, SuratTugasData> = {
  sendiri: {
    id: 'tpl-sendiri',
    kriteria: 'sendiri',
    modeSrikandi: true,
    nomorSurat: 'B-1024/Kk.13.32.01/KP.01/11/2026',
    tanggalNaskah: '2026-11-16',
    kopVarian: 'telepon',
    dasarAsal: 'Surat dari Gereja Katolik Paroki "Santo Paulus" Ambulu',
    dasarNomor: '081 / PSP / XI / 2026',
    dasarTanggal: '2026-11-16',
    namaKegiatan: 'Kegiatan Pertemuan Tahunan Keuskupan Malang Ke-51 Tahun 2026',
    menimbangCustom: '',
    gunakanMenimbangCustom: false,
    lokasiTujuan: 'Rumah Retret St. Julie Billiart',
    tanggalMulai: '2026-11-17',
    tanggalSelesai: '2026-11-19',
    pegawaiList: [
      {
        id: 's-1',
        nama: 'PETRUS AMAT SUTADI, S.Pd., MM.',
        nip: '197307292000031001',
        pangkatGolongan: 'Pembina ( IV/a )',
        jabatan: 'Penyelenggara pada Penyelenggara Katolik Kantor Kementerian Agama Kabupaten Jember',
      },
    ],
    jabatanPenandatangan: 'Kepala Kantor',
    namaPenandatangan: 'Dr. SANTOSO, S.Ag, M.Pd.',
  },
  tiga_orang: {
    id: 'tpl-tiga',
    kriteria: 'tiga_orang',
    modeSrikandi: true,
    nomorSurat: 'B-1025/Kk.13.32.01/KP.01/11/2026',
    tanggalNaskah: '2026-11-16',
    kopVarian: 'telepon',
    dasarAsal: 'Surat dari Kepala Kantor Wilayah Kementerian Agama Provinsi Jawa Timur',
    dasarNomor: '1134/Kw.13.02/PP.02.3/11/2026',
    dasarTanggal: '2026-11-09',
    namaKegiatan:
      'kegiatan pelaksanaan program prioritas peningkatan sarana dan prasarana madrasah melalui Program Hasil Terbaik Cepat (PHTC) Tahun Anggaran 2026',
    menimbangCustom: '',
    gunakanMenimbangCustom: false,
    lokasiTujuan: 'Jambuluwuk Convention Hall & Resort Batu',
    tanggalMulai: '2026-11-17',
    tanggalSelesai: '2026-11-18',
    pegawaiList: [
      {
        id: 't-1',
        nama: 'Dr. SANTOSO, S.Ag, M.Pd.',
        nip: '196908251991031003',
        pangkatGolongan: 'Pembina Tk.I (IV/b)',
        jabatan: 'Kepala Kantor Kementerian Agama Kabupaten Jember',
      },
      {
        id: 't-2',
        nama: 'TRI SATRIO YUNIARTO',
        nip: '197506282025211015',
        pangkatGolongan: '- (IX)',
        jabatan: 'Penata Layanan Operasional',
      },
      {
        id: 't-3',
        nama: 'Saiful Ulum, SE',
        nip: '197006172005011004',
        pangkatGolongan: 'Penata Tk.I (III/d)',
        jabatan: 'Pembimbing Teknis Urusan Agama Kantor Kementerian Agama Kabupaten Jember',
      },
    ],
    jabatanPenandatangan: 'Kepala Kantor',
    namaPenandatangan: 'Dr. SANTOSO, S.Ag, M.Pd.',
  },
  terlampir: {
    id: 'tpl-terlampir',
    kriteria: 'terlampir',
    modeSrikandi: true,
    nomorSurat: 'B-1026/Kk.13.32.01/KP.01/11/2026',
    tanggalNaskah: '2026-11-17',
    kopVarian: 'whatsapp',
    dasarAsal: 'Nota Dinas dari Kepala Seksi Bimas Islam',
    dasarNomor: '224/Kk.13.32.06./KP/11/2026',
    dasarTanggal: '2026-11-17',
    namaKegiatan: 'kegiatan Koordinasi dan Sharing Program Bimbingan Masyarakat Islam',
    menimbangCustom: '',
    gunakanMenimbangCustom: false,
    lokasiTujuan: 'Kantor Kementerian Agama Kabupaten Lumajang',
    tanggalMulai: '2026-11-18',
    tanggalSelesai: '2026-11-18',
    pegawaiList: [
      {
        id: 'l-1',
        nama: 'Dr. Ahmad Tholabi, M.HI',
        nip: '196911021995031002',
        pangkatGolongan: 'Pembina Tk.I (IV/b)',
        jabatan: 'Kepala Seksi Bimas Islam Kantor Kementerian Agama Kabupaten Jember',
      },
      {
        id: 'l-2',
        nama: 'Saiful Ulum, SE',
        nip: '197006172005011004',
        pangkatGolongan: 'Penata Tk.I (III/d)',
        jabatan:
          'Pembimbing Teknis Urusan Agama pada Seksi Bimbingan Masyarakat Islam Kantor Kementerian Agama Kabupaten Jember',
      },
      {
        id: 'l-3',
        nama: 'Linda Novalianasari, SE',
        nip: '198111252006042002',
        pangkatGolongan: 'Penata Tk.I (III/d)',
        jabatan:
          'Pembimbing Teknis Urusan Agama pada Seksi Bimbingan Masyarakat Islam Kantor Kementerian Agama Kabupaten Jember',
      },
      {
        id: 'l-4',
        nama: 'Ahmad Hariyadi',
        nip: '198909132025211010',
        pangkatGolongan: 'V',
        jabatan:
          'Pengadministrasi Perkantoran pada Seksi Bimbingan Masyarakat Islam Kantor Kementerian Agama Kabupaten Jember',
      },
    ],
    jabatanPenandatangan: 'Kepala Kantor',
    namaPenandatangan: 'Dr. SANTOSO, S.Ag, M.Pd.',
  },
};

export function createEmptyDraft(
  kriteria: KriteriaKeberangkatan = 'sendiri',
  options?: { emptyPegawai?: boolean }
): SuratTugasData {
  const today = new Date().toISOString().slice(0, 10);
  const count = options?.emptyPegawai
    ? 0
    : kriteria === 'sendiri'
      ? 1
      : kriteria === 'tiga_orang'
        ? 2
        : 4;
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kriteria,
    modeSrikandi: true,
    nomorSurat: '',
    tanggalNaskah: today,
    kopVarian: 'telepon',
    dasarAsal: '',
    dasarNomor: '',
    dasarTanggal: today,
    namaKegiatan: '',
    menimbangCustom: '',
    gunakanMenimbangCustom: false,
    lokasiTujuan: '',
    tanggalMulai: today,
    tanggalSelesai: today,
    pegawaiList: Array.from({ length: count }, (_, i) => ({
      id: `peg-empty-${Date.now()}-${i}`,
      nama: '',
      nip: '',
      pangkatGolongan: '',
      jabatan: '',
    })),
    jabatanPenandatangan: 'Kepala Kantor',
    namaPenandatangan: 'Dr. SANTOSO, S.Ag, M.Pd.',
  };
}

export type SpdFormatMode = 'per_file' | 'gabung';

export interface SpdPpkPreset {
  id: 'triastono' | 'pitono';
  nama: string;
  nip: string;
  keterangan: string;
}

export const SPD_PPK_PRESETS: SpdPpkPreset[] = [
  {
    id: 'triastono',
    nama: 'Triastono Rokhman, S.E.',
    nip: '197505122005011004',
    keterangan: 'Sekjen, Haji, Peny. Katolik',
  },
  {
    id: 'pitono',
    nama: 'Pitono, S.Sos.',
    nip: '196811201994031003',
    keterangan: 'Pendis, Bimas Islam, Peny. Zawa, Kristen & Buddha',
  },
];

export interface SpdFormData {
  formatMode: SpdFormatMode; // 'per_file' | 'gabung'
  nomorSpd: string;
  ppkMode: 'triastono' | 'pitono' | 'manual';
  ppkNama: string;
  ppkNip: string;
  tingkatBiaya: string; // default "Tingkat C"
  maksudPerjalanan: string;
  alatAngkutan: string; // default "Kendaraan Umum / Darat"
  tempatBerangkat: string; // default "JEMBER"
  kotaTujuan: string; // e.g. "di Probolinggo"
  tujuanLengkap: string; // e.g. "di Kantor Kementerian Agama Kabupaten Probolinggo"
  tanggalBerangkat: string; // YYYY-MM-DD
  tanggalKembali: string; // YYYY-MM-DD
  lamaHari: number;
  pembebananAnggaranInstansi: string; // default "a. Kantor Kementerian Agama Kab. Jember"
  pembebananAnggaranAkun: string; // default "b. "
  keteranganLain: string; // default "-"
  tanggalSpd: string; // YYYY-MM-DD
  tempatDikeluarkan: string; // default "Jember"
  namaKepalaKantor: string; // default "Dr. SANTOSO, S.Ag, M.Pd."
  nipKepalaKantor: string;
  pegawaiList: Pegawai[];
}

export interface ScheduleConflict {
  pegawaiNama: string;
  pegawaiNip: string;
  existingIdSurat: string;
  existingNomorSurat: string;
  existingKegiatan: string;
  existingTanggalMulai: string;
  existingTanggalSelesai: string;
  overlapDatesDisplay: string;
  source: 'sheets' | 'local_tercatat';
}

export function normalizeNip(val?: string | null): string {
  if (!val) return '';
  return val.replace(/[^0-9]/g, '');
}

export function extractKotaTujuan(lokasiTujuan: string): string {
  const clean = (lokasiTujuan || '').trim();
  if (!clean) return 'di Tempat Tujuan';
  const cityMatch = clean.match(/(?:Kabupaten|Kab\.|Kota)\s+([A-Za-z\s]+)/i);
  if (cityMatch?.[1]) {
    const rawCity = cityMatch[1].trim().split(/\s*,\s*|\s+Provinsi|\s+Jawa/)[0];
    return `di ${rawCity}`;
  }
  return clean.startsWith('di ') ? clean : `di ${clean}`;
}

export function generateDefaultNomorSpd(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const validD = isNaN(d.getTime()) ? new Date() : d;
  const month = String(validD.getMonth() + 1).padStart(2, '0');
  const year = String(validD.getFullYear());
  return `/Kk.13.32.04/SPD/${month}/${year}`;
}

export function createInitialSpdData(surat: SuratTugasData): SpdFormData {
  const today = new Date().toISOString().slice(0, 10);
  const tanggalBerangkat = surat.tanggalMulai || today;
  const tanggalKembali = surat.tanggalSelesai || tanggalBerangkat;

  const d1 = new Date(tanggalBerangkat).getTime();
  const d2 = new Date(tanggalKembali).getTime();
  const diffDays =
    isNaN(d1) || isNaN(d2)
      ? 1
      : Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);

  const defaultPpk = SPD_PPK_PRESETS[0];

  return {
    formatMode: surat.pegawaiList.length > 1 ? 'gabung' : 'per_file',
    nomorSpd: generateDefaultNomorSpd(surat.tanggalNaskah || tanggalBerangkat),
    ppkMode: defaultPpk.id,
    ppkNama: defaultPpk.nama,
    ppkNip: defaultPpk.nip,
    tingkatBiaya: 'Tingkat C',
    maksudPerjalanan: surat.namaKegiatan || '',
    alatAngkutan: 'Kendaraan Umum / Darat',
    tempatBerangkat: 'JEMBER',
    kotaTujuan: extractKotaTujuan(surat.lokasiTujuan),
    tujuanLengkap: surat.lokasiTujuan.startsWith('di ')
      ? surat.lokasiTujuan
      : surat.lokasiTujuan
        ? `di ${surat.lokasiTujuan}`
        : 'di Tempat Kegiatan',
    tanggalBerangkat,
    tanggalKembali,
    lamaHari: diffDays,
    pembebananAnggaranInstansi: 'a. Kantor Kementerian Agama Kab. Jember',
    pembebananAnggaranAkun: 'b. ',
    keteranganLain: '-',
    tanggalSpd: surat.tanggalNaskah || today,
    tempatDikeluarkan: 'Jember',
    namaKepalaKantor: 'Dr. SANTOSO, S.Ag, M.Pd.',
    nipKepalaKantor: '197008101998031002',
    pegawaiList: surat.pegawaiList.map((p) => ({ ...p })),
  };
}


