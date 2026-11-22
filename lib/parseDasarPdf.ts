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

export type ExtractionPrecisionMode = 'cepat' | 'teliti';

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
  modelUsed?: string;
  extractionSource?: 'text' | 'pdf';
}

export interface ExtractDasarInput {
  base64Pdf?: string;
  textContent?: string;
  isTextOnly?: boolean;
  fileName: string;
  customDirectory?: DirectoryPegawaiInput[];
  precisionMode?: ExtractionPrecisionMode;
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

function normalizeJabatanText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bkec\.?\b/g, 'kecamatan')
    .replace(/\bkab\.?\b/g, 'kabupaten')
    .replace(/\bkasubbag\b/g, 'kepala sub bagian')
    .replace(/\bkasi\b/g, 'kepala seksi')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface RawGeminiPegawaiItem {
  nama: string;
  nip: string;
}

function enrichWithDirectory(
  detected: RawGeminiPegawaiItem[],
  directory: DirectoryPegawaiInput[]
): ParsedPegawaiItem[] {
  const cleanNip = (s: string) => s.replace(/\D/g, '');
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  return detected.map((item) => {
    const itemNip = cleanNip(item.nip || '');
    const itemName = norm(item.nama || '');
    const itemCore = stripAcademicTitles(item.nama || '');
    const itemCompact = itemCore.replace(/\s+/g, '');

    let match: DirectoryPegawaiInput | undefined;
    let sumberDeteksi: 'eksplisit' | 'direktori_jabatan' = 'eksplisit';

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
    // Local jabatan fallback when invitation only mentions an official position (e.g. "Kepala KUA Kecamatan Ambulu")
    if (!match && itemNip.length < 8 && itemName.length >= 6) {
      const normItemJab = normalizeJabatanText(item.nama || '');
      const jabHits = directory.filter((d) => {
        const normDirJab = normalizeJabatanText(d.jabatan || '');
        if (!normDirJab) return false;
        return (
          normDirJab === normItemJab ||
          (normItemJab.length >= 10 && normDirJab.includes(normItemJab))
        );
      });
      if (jabHits.length === 1) {
        match = jabHits[0];
        sumberDeteksi = 'direktori_jabatan';
      }
    }

    if (match) {
      return {
        nama: match.nama,
        nip: match.nip,
        pangkatGolongan: match.pangkatGolongan || '',
        jabatan: match.jabatan || '',
        sumberDeteksi,
      };
    }

    return {
      nama: item.nama?.trim() || '',
      nip: cleanNip(item.nip || '') || item.nip?.trim() || '',
      pangkatGolongan: '',
      jabatan: '',
      sumberDeteksi: 'eksplisit',
    };
  });
}

const COMPACT_SYSTEM_INSTRUCTION = `Anda asisten persuratan Kantor Kementerian Agama Kabupaten Jember. Ekstrak metadata surat dasar dan daftar pegawai Kemenag Kab. Jember secara ringkas ke JSON.
Aturan ringkas:
1. dasarAsal: Cek semua TTD/TTE & kop surat. Jika lebih dari 1 TTD/TTE, pilih jabatan TERTINGGI (Kepala > Kepala Seksi/Penyelenggara > Ketua Tim/Panitia) lalu lengkapi dengan nama instansi dari kop surat (mis. "Surat dari Kepala MTsN 7 Jember", "Nota Dinas dari Kepala Seksi Bimas Islam").
2. tanggalMulai & tanggalSelesai: Format YYYY-MM-DD (samakan jika 1 hari). dasarTanggal juga YYYY-MM-DD.
3. namaKegiatan: Frasa inti kegiatan untuk kalimat "dalam rangka menghadiri [namaKegiatan]".
4. pegawaiTerdeteksi: Periksa seluruh halaman & lampiran. Ambil HANYA ASN/pegawai Kemenag Kab. Jember yang ditugaskan (saring peserta luar Kab. Jember, abaikan pengundang eksternal kecuali ikut ditugaskan). Isi cukup { nama, nip } — JANGAN tulis pangkat/jabatan panjang (sistem mencocokkan NIP/nama ke DUK lokal). Jika surat hanya menyebut jabatan spesifik tanpa nama (mis. "Penyelenggara Katolik"), tulis nama jabatan itu di field nama dengan nip "". Jika hanya tertulis "tim terkait" tanpa nama/jabatan spesifik, kembalikan [].
5. kriteriaDisarankan: "sendiri" (1 orang), "tiga_orang" (2-3 orang), "terlampir" (>=4 orang).
6. catatanDeteksi: 1 kalimat ringkas asal penandatangan tertinggi & jumlah pegawai terdeteksi.`;

export async function extractDasarFromInput(
  input: ExtractDasarInput
): Promise<ParseDasarPdfOutput> {
  const fullDirectory = mergeDirectory(input.customDirectory || []);
  const ai = getAiClient();
  const useTextOnly = Boolean(input.isTextOnly && input.textContent?.trim());
  const precisionMode: ExtractionPrecisionMode =
    input.precisionMode === 'teliti' ? 'teliti' : 'cepat';

  const userPrompt = useTextOnly
    ? `Ekstrak data dari teks digital PDF "${input.fileName || 'dasar_surat.pdf'}" berikut:\n\n${input.textContent!.trim()}`
    : `Ekstrak data dari dokumen PDF "${input.fileName || 'dasar_surat.pdf'}" terlampir (periksa seluruh halaman termasuk lampiran).`;

  const parts = useTextOnly
    ? [{ text: userPrompt }]
    : [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: input.base64Pdf || '',
          },
        },
        { text: userPrompt },
      ];

  const modelsToTry =
    precisionMode === 'teliti'
      ? [
          { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, timeout: 45000 },
          { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, timeout: 30000 },
        ]
      : [
          { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, timeout: 25000 },
          { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, timeout: 45000 },
        ];

  let responseText: string | undefined;
  let usedModel = modelsToTry[0].model;

  for (let attempt = 1; attempt <= modelsToTry.length; attempt++) {
    const { model, thinkingLevel, timeout } = modelsToTry[attempt - 1];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          systemInstruction: COMPACT_SYSTEM_INSTRUCTION,
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
                  },
                  required: ['nama', 'nip'],
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
      usedModel = model;
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
      await new Promise((r) => setTimeout(r, 500 * attempt));
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
    pegawaiTerdeteksi: RawGeminiPegawaiItem[];
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
    modelUsed: usedModel,
    extractionSource: useTextOnly ? 'text' : 'pdf',
  };
}

export async function extractDasarFromPdfBase64(
  cleanBase64: string,
  fileName: string,
  customDirectory: DirectoryPegawaiInput[] = [],
  precisionMode: ExtractionPrecisionMode = 'cepat'
): Promise<ParseDasarPdfOutput> {
  return extractDasarFromInput({
    base64Pdf: cleanBase64,
    fileName,
    customDirectory,
    precisionMode,
  });
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
