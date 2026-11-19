import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DirectoryPegawaiInput {
  id?: string;
  nama: string;
  nip: string;
  pangkatGolongan: string;
  jabatan: string;
}

export interface ParsedPegawaiItem {
  nama: string;
  nip: string;
  pangkatGolongan: string;
  jabatan: string;
  sumberDeteksi: 'eksplisit' | 'direktori_jabatan';
}

export interface ParseDasarPdfOutput {
  jenisDokumen: string;
  dasarAsal: string;
  dasarNomor: string;
  dasarTanggal: string;
  namaKegiatan: string;
  lokasiTujuan: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  kriteriaDisarankan: 'sendiri' | 'tiga_orang' | 'terlampir';
  catatanDeteksi: string;
  pegawaiTerdeteksi: ParsedPegawaiItem[];
}

function loadServerDukDirectory(): DirectoryPegawaiInput[] {
  const candidates = [
    path.resolve(process.cwd(), 'src/data/dukPegawai.json'),
    path.resolve(__dirname, '../src/data/dukPegawai.json'),
    path.resolve(__dirname, 'src/data/dukPegawai.json'),
  ];
  for (const dukPath of candidates) {
    try {
      if (fs.existsSync(dukPath)) {
        const raw = fs.readFileSync(dukPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed as DirectoryPegawaiInput[];
        }
      }
    } catch (err) {
      console.error(`Failed to load ${dukPath}:`, err);
    }
  }
  return [];
}

const SERVER_DUK_DIRECTORY = loadServerDukDirectory();

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY belum dikonfigurasi pada server. Atur di Secrets (AI Studio) atau Environment Variables (Vercel) lalu deploy ulang.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function stripAcademicTitles(name: string): string {
  return name
    .replace(
      /\b(dr|drs|dra|prof|ir|h|hj|kh|ust|m|s|sh|se|mm|spd|mpd|sag|mhi|msi|mh|mpdi|spdi|sei|shum|mhum|kom|sos|psi|si|med|skm|keb|ak|ca|st|mt|ma|msc|phd|lc|sthi|mth|pdt|rm)\b\.?/gi,
      ' '
    )
    .replace(
      /\b(s\.?\s*ag|s\.?\s*pd\.?\s*i?|s\.?\s*e\.?\s*i?|s\.?\s*h\.?\s*i?|s\.?\s*kom|s\.?\s*sos|s\.?\s*psi|s\.?\s*ip|s\.?\s*si|s\.?\s*th\.?\s*i?|m\.?\s*pd\.?\s*i?|m\.?\s*ag|m\.?\s*hi|m\.?\s*si|m\.?\s*m|m\.?\s*hum|m\.?\s*a|m\.?\s*th)\b\.?/gi,
      ' '
    )
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function mergeDirectory(
  customEntries: DirectoryPegawaiInput[]
): DirectoryPegawaiInput[] {
  if (!customEntries || customEntries.length === 0) {
    return SERVER_DUK_DIRECTORY;
  }
  const byNip = new Map<string, DirectoryPegawaiInput>();
  for (const item of SERVER_DUK_DIRECTORY) {
    const key = (item.nip || '').replace(/\D/g, '') || item.nama.toLowerCase();
    byNip.set(key, item);
  }
  for (const item of customEntries) {
    const key = (item.nip || '').replace(/\D/g, '') || item.nama.toLowerCase();
    if (key) {
      byNip.set(key, item);
    }
  }
  return Array.from(byNip.values());
}

function getLeadershipSummaryForPrompt(
  directory: DirectoryPegawaiInput[]
): DirectoryPegawaiInput[] {
  const leaderPattern =
    /^(kepala kantor|kepala sub bagian|kepala seksi|penyelenggara|kepala kua|kepala urusan|kepala mtsn|kepala man|kepala min|kasubbag|ketua tim)/i;
  const leaders = directory.filter(
    (d) =>
      leaderPattern.test(d.jabatan.trim()) ||
      /kepala m(tsn|an|in)\//i.test(d.jabatan) ||
      /penyelenggara pada penyelenggara/i.test(d.jabatan)
  );
  return leaders.slice(0, 65);
}

function enrichWithDirectory(
  detected: ParsedPegawaiItem[],
  directory: DirectoryPegawaiInput[]
): ParsedPegawaiItem[] {
  const cleanNip = (s: string) => s.replace(/\D/g, '');
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const isPlaceholderValue = (val?: string) => {
    const cleaned = (val || '').trim().toLowerCase();
    return (
      !cleaned ||
      cleaned === '-' ||
      cleaned === '--' ||
      cleaned === 'n/a' ||
      cleaned === 'none' ||
      cleaned.includes('tidak tercantum') ||
      cleaned.includes('tidak ada') ||
      cleaned.includes('tidak diketahui')
    );
  };

  return detected.map((item) => {
    const itemNip = cleanNip(item.nip || '');
    const itemName = norm(item.nama || '');
    const itemCore = stripAcademicTitles(item.nama || '');
    const itemCompact = itemCore.replace(/\s+/g, '');

    let match: DirectoryPegawaiInput | undefined;
    if (itemNip.length >= 8) {
      match = directory.find((d) => cleanNip(d.nip) === itemNip);
    }
    if (!match && itemName.length >= 4) {
      match = directory.find((d) => norm(d.nama) === itemName);
    }
    if (!match && itemCore.length >= 4) {
      const exactCoreHits = directory.filter(
        (d) => stripAcademicTitles(d.nama) === itemCore
      );
      if (exactCoreHits.length === 1) {
        match = exactCoreHits[0];
      } else if (exactCoreHits.length === 0 && itemCompact.length >= 6) {
        const compactHits = directory.filter(
          (d) => stripAcademicTitles(d.nama).replace(/\s+/g, '') === itemCompact
        );
        if (compactHits.length === 1) {
          match = compactHits[0];
        }
      }
    }
    if (!match && itemName.length >= 5) {
      const partialHits = directory.filter((d) => {
        const dirCore = stripAcademicTitles(d.nama);
        return (
          dirCore.length >= 5 &&
          (dirCore === itemCore ||
            (itemCore.length >= 8 &&
              (dirCore.includes(itemCore) || itemCore.includes(dirCore))))
        );
      });
      if (partialHits.length === 1) {
        match = partialHits[0];
      }
    }

    if (match) {
      return {
        nama: match.nama,
        nip: match.nip,
        pangkatGolongan: !isPlaceholderValue(item.pangkatGolongan)
          ? item.pangkatGolongan.trim()
          : match.pangkatGolongan,
        jabatan: match.jabatan || item.jabatan,
        sumberDeteksi: item.sumberDeteksi || 'eksplisit',
      };
    }

    return {
      nama: item.nama?.trim() || '',
      nip: cleanNip(item.nip || '') || item.nip?.trim() || '',
      pangkatGolongan: isPlaceholderValue(item.pangkatGolongan)
        ? ''
        : item.pangkatGolongan.trim(),
      jabatan: item.jabatan?.trim() || '',
      sumberDeteksi: item.sumberDeteksi || 'eksplisit',
    };
  });
}

export async function extractDasarFromPdfBase64(
  cleanBase64: string,
  fileName: string,
  customDirectory: DirectoryPegawaiInput[] = []
): Promise<ParseDasarPdfOutput> {
  const fullDirectory = mergeDirectory(customDirectory);
  const promptDirectory = [
    ...customDirectory.slice(0, 20),
    ...getLeadershipSummaryForPrompt(fullDirectory),
  ];

  const ai = getAiClient();

  const directorySummary = promptDirectory
    .map(
      (d, i) =>
        `${i + 1}. Nama: "${d.nama}" | NIP: "${d.nip}" | Pangkat/Gol: "${d.pangkatGolongan}" | Jabatan: "${d.jabatan}"`
    )
    .join('\n');

  const prompt = `Anda adalah asisten administrasi persuratan resmi Kantor Kementerian Agama Kabupaten Jember.
Analisis SELURUH HALAMAN dokumen PDF terlampir (nama file: "${fileName || 'dasar_surat.pdf'}") mulai dari halaman 1 sampai halaman terakhir (termasuk seluruh halaman LAMPIRAN).

Ekstrak informasi berikut ke dalam JSON terstruktur secara akurat:

1. jenisDokumen: "nota_dinas" | "undangan" | "permohonan" | "lainnya"
2. dasarAsal: Penyebutan asal/sumber dasar surat untuk kolom "Dasar :" pada Surat Tugas Kemenag Jember.
   ATURAN WAJIB MENENTUKAN dasarAsal (TTD/TTE + KOP SURAT):
   - Periksa SEMUA blok tanda tangan / TTE (Tanda Tangan Elektronik) di seluruh dokumen (kanan, kiri, tengah, bawah, atau bagian "Mengetahui" / "Menyetujui").
   - BILA ADA LEBIH DARI SATU TTD / TTE pada dasar surat, WAJIB pilih pejabat dengan JABATAN PALING TINGGI / yang berwenang memerintah atau mengesahkan surat tersebut (biasanya "Kepala").
     * Contoh penting: jika ada TTD/TTE "Ketua" (misal Ketua Tim ZI / Ketua Panitia / Ketua Pokja) DAN TTD/TTE "Kepala" (misal Kepala Madrasah / Kepala Kantor / Kepala Dinas / Kepala Balai / Kepala Seksi), maka gunakan jabatan yang paling tinggi yaitu Kepala-nya!
     * Urutan prioritas jabatan tertinggi: Menteri / Dirjen / Kakanwil / Kepala Kantor / Kepala Dinas / Kepala Balai / Kepala Madrasah / Rektor / Bupati / Camat -> Kepala Bagian / Kepala Bidang / Kepala Seksi / Penyelenggara -> Ketua Tim / Ketua Panitia -> Sekretaris / Koordinator.
   - Cocokkan dan lengkapi jabatan penandatangan tertinggi tersebut dengan NAMA INSTANSI LENGKAP pada kop surat di bagian atas dokumen (misalnya di TTE hanya tertulis "Kepala", sedangkan di kop surat tertulis "Madrasah Tsanawiyah Negeri 7 Jember" -> hasilkan "Surat dari Kepala Madrasah Tsanawiyah Negeri 7 Jember").
   - Jika ditandatangani 'a.n.' / 'Plt.' / 'Plh.', tentukan pejabat pengirim sesuai struktur TTD/TTE tertinggi dan instansi pada kop surat.
   Contoh format resmi Kemenag Jember:
   - Nota Dinas ditandatangani Kepala Seksi Bimas Islam: "Nota Dinas dari Kepala Seksi Bimas Islam"
   - Surat Undangan dari lembaga non-pemerintah/Paroki: 'Surat dari Gereja Katolik Paroki "Santo Paulus" Ambulu'
   - Surat Permohonan ada TTD Ketua Tim ZI dan Kepala MTsN 7 Jember: "Surat dari Kepala Madrasah Tsanawiyah Negeri 7 Jember"
   - Surat dari Kanwil Kemenag Jatim: "Surat dari Kepala Kantor Wilayah Kementerian Agama Provinsi Jawa Timur"
3. dasarNomor: Nomor surat pada dokumen dasar (apa adanya, misal "224/Kk.13.32.06./KP/11/2026").
4. dasarTanggal: Tanggal surat dasar dalam format ISO YYYY-MM-DD.
5. namaKegiatan: Frasa nama/perihal kegiatan untuk mengisi "Menimbang: Bahwa dalam rangka menghadiri [namaKegiatan]..." dan "Untuk: 1. Menghadiri [namaKegiatan]...".
   Contoh: "kegiatan Koordinasi dan Sharing Program Bimbingan Masyarakat Islam", "Kegiatan Pertemuan Tahunan Keuskupan Malang Ke-51 Tahun 2026", "kegiatan Pendampingan PMPZI Tahun 2026".
6. lokasiTujuan: Tempat/lokasi pelaksanaan kegiatan secara jelas (contoh: "Kantor Kementerian Agama Kabupaten Lumajang", "Rumah Retret St. Julie Billiart", "Ruang Laboratorium IPA MTsN 7 Jember").
7. tanggalMulai: Tanggal mulai pelaksanaan kegiatan (YYYY-MM-DD).
8. tanggalSelesai: Tanggal selesai pelaksanaan kegiatan (YYYY-MM-DD). Jika kegiatan hanya 1 hari, samakan dengan tanggalMulai.
9. pegawaiTerdeteksi: Daftar SELURUH ASN/PNS Kantor Kementerian Agama Kabupaten Jember yang dipanggil / ditugaskan berangkat berdasarkan isi surat MAUPUN HALAMAN LAMPIRAN!
   ATURAN SANGAT PENTING UNTUK pegawaiTerdeteksi:
   - WAJIB CEK HALAMAN LAMPIRAN (halaman 2, 3, dst.)! Jangan hanya membaca halaman pertama! Jika halaman pertama menyebut "daftar terlampir", "sebagaimana terlampir", atau "peserta terlampir", ekstrak semua nama/NIP/jabatan ASN Kemenag Jember dari tabel/daftar pada halaman lampiran tersebut.
   - Jika lampiran berisi daftar peserta dari berbagai kabupaten/kota atau berbagai instansi (misal se-Jawa Timur), SARING dan ambil HANYA peserta/ASN/jabatan dari wilayah/instansi Kantor Kementerian Agama Kabupaten Jember (termasuk KUA/Madrasah Negeri Kab. Jember); abaikan peserta dari daerah lain.
   - JANGAN masukkan nama penandatangan/pengirim surat dari pihak pengundang atau pemohon eksternal (misal Pastor Paroki pengundang, atau Kepala Madrasah/Ketua Tim pemohon pendampingan) kecuali mereka sendiri memang termasuk daftar peserta Kemenag Jember yang ditugaskan berangkat.
   - Ekstrak Nama, NIP (18 digit bersih tanpa spasi jika ada), Pangkat/Golongan (kosongkan "" jika tidak tertulis), dan Jabatan. Jangan mengulang pegawai yang sama jika muncul di halaman 1 dan lampiran.
   - Jika surat mengundang JABATAN tertentu tanpa nama (misal: "mengundang Penyelenggara Katolik" atau "Kepala KUA Kec. ..."), cocokkan dengan daftar Pejabat Struktural Kemenag Jember di bawah ini dan isi sumberDeteksi = "direktori_jabatan".
   - Jika surat hanya meminta "tim/pejabat terkait" tanpa menyebut nama maupun jabatan spesifik yang cocok, kembalikan array kosong [].
10. kriteriaDisarankan: Kriteria keberangkatan yang paling sesuai ("sendiri" | "tiga_orang" | "terlampir"):
   - "sendiri": jika tepat 1 pegawai yang berangkat / diminta surat.
   - "tiga_orang": jika 2 atau 3 pegawai yang berangkat / diminta surat.
   - "terlampir": jika 4 atau lebih pegawai yang berangkat / diminta surat.
11. catatanDeteksi: Ringkasan singkat 1-2 kalimat dalam bahasa Indonesia tentang asal penandatangan tertinggi (kop & TTD/TTE), jumlah ASN yang terdeteksi (termasuk jika ditemukan di halaman lampiran), atau alasan bila perlu memilih tim manual.

Daftar Pejabat Struktural / Unit Kemenag Jember untuk pencocokan jabatan (seluruh 1.372 pegawai DUK juga dicocokkan otomatis di server):
${directorySummary || '(Direktori kosong)'}`;

  const modelsToTry = [
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, timeout: 25000 },
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, timeout: 45000 },
  ];
  let responseText: string | undefined;

  for (let attempt = 1; attempt <= modelsToTry.length; attempt++) {
    const { model, thinkingLevel, timeout } = modelsToTry[attempt - 1];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          httpOptions: { timeout },
          thinkingConfig: { thinkingLevel },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              jenisDokumen: { type: Type.STRING },
              dasarAsal: { type: Type.STRING },
              dasarNomor: { type: Type.STRING },
              dasarTanggal: { type: Type.STRING },
              namaKegiatan: { type: Type.STRING },
              lokasiTujuan: { type: Type.STRING },
              tanggalMulai: { type: Type.STRING },
              tanggalSelesai: { type: Type.STRING },
              kriteriaDisarankan: { type: Type.STRING },
              catatanDeteksi: { type: Type.STRING },
              pegawaiTerdeteksi: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    nama: { type: Type.STRING },
                    nip: { type: Type.STRING },
                    pangkatGolongan: { type: Type.STRING },
                    jabatan: { type: Type.STRING },
                    sumberDeteksi: { type: Type.STRING },
                  },
                  required: [
                    'nama',
                    'nip',
                    'pangkatGolongan',
                    'jabatan',
                    'sumberDeteksi',
                  ],
                },
              },
            },
            required: [
              'jenisDokumen',
              'dasarAsal',
              'dasarNomor',
              'dasarTanggal',
              'namaKegiatan',
              'lokasiTujuan',
              'tanggalMulai',
              'tanggalSelesai',
              'kriteriaDisarankan',
              'catatanDeteksi',
              'pegawaiTerdeteksi',
            ],
          },
        },
      });
      responseText = (response.text ?? '{}').trim();
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('500') ||
        msg.includes('INTERNAL') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.toLowerCase().includes('timeout') ||
        msg.toLowerCase().includes('aborted') ||
        msg.includes('DEADLINE_EXCEEDED');
      if (!isTransient || attempt === modelsToTry.length) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }

  const rawText = responseText ?? '{}';
  const parsed = JSON.parse(rawText) as {
    jenisDokumen: string;
    dasarAsal: string;
    dasarNomor: string;
    dasarTanggal: string;
    namaKegiatan: string;
    lokasiTujuan: string;
    tanggalMulai: string;
    tanggalSelesai: string;
    kriteriaDisarankan?: string;
    catatanDeteksi: string;
    pegawaiTerdeteksi: ParsedPegawaiItem[];
  };

  const rawEnriched = enrichWithDirectory(
    Array.isArray(parsed.pegawaiTerdeteksi) ? parsed.pegawaiTerdeteksi : [],
    fullDirectory
  );

  const seenPegawai = new Set<string>();
  const enrichedPegawai = rawEnriched.filter((p) => {
    const nipKey = (p.nip || '').replace(/\D/g, '');
    const nameKey = (p.nama || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = nipKey.length >= 8 ? `nip:${nipKey}` : `name:${nameKey}`;
    if (!nameKey && !nipKey) return false;
    if (seenPegawai.has(key)) return false;
    seenPegawai.add(key);
    return true;
  });

  let kriteriaDisarankan: 'sendiri' | 'tiga_orang' | 'terlampir' = 'sendiri';
  if (enrichedPegawai.length === 1) {
    kriteriaDisarankan = 'sendiri';
  } else if (enrichedPegawai.length >= 2 && enrichedPegawai.length <= 3) {
    kriteriaDisarankan = 'tiga_orang';
  } else if (enrichedPegawai.length >= 4) {
    kriteriaDisarankan = 'terlampir';
  } else if (
    parsed.kriteriaDisarankan === 'sendiri' ||
    parsed.kriteriaDisarankan === 'tiga_orang' ||
    parsed.kriteriaDisarankan === 'terlampir'
  ) {
    kriteriaDisarankan = parsed.kriteriaDisarankan;
  }

  return {
    ...parsed,
    kriteriaDisarankan,
    pegawaiTerdeteksi: enrichedPegawai,
  };
}

export function mapGeminiErrorToFriendlyMessage(err: unknown): string {
  const rawMessage =
    err instanceof Error
      ? err.message
      : 'Gagal membaca dan menganalisis file PDF.';
  if (
    rawMessage.includes('500') ||
    rawMessage.includes('INTERNAL') ||
    rawMessage.includes('503') ||
    rawMessage.includes('UNAVAILABLE')
  ) {
    return 'Layanan pembacaan PDF sedang sibuk atau mengalami gangguan sementara. Silakan klik coba unggah kembali.';
  }
  if (
    rawMessage.includes('429') ||
    rawMessage.includes('RESOURCE_EXHAUSTED')
  ) {
    return 'Batas permintaan sementara tercapai. Silakan tunggu beberapa detik lalu coba unggah kembali.';
  }
  if (rawMessage.includes('403') || rawMessage.includes('API_KEY_INVALID')) {
    return 'API key tidak valid atau belum diatur. Periksa Secrets (AI Studio) atau Environment Variables GEMINI_API_KEY (Vercel).';
  }
  if (
    rawMessage.toLowerCase().includes('timeout') ||
    rawMessage.includes('DEADLINE_EXCEEDED')
  ) {
    return 'Waktu pembacaan PDF habis. Pastikan file PDF tidak terlalu besar dan coba kembali.';
  }
  return rawMessage;
}
