import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { KOP_VARIAN_OPTIONS, Pegawai, SuratTugasData } from '../types/surat';
import {
  formatRentangHariTanggal,
  formatRentangTanggal,
  formatTanggalIndo,
  splitPangkatGolongan,
} from './dateFormat';

const NO_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const KOP_SINGLE_BOTTOM_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.SINGLE, size: 14, color: '000000' },
};

const SOLID_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
  left: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
  right: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
};

const FONT = 'Arial';
const SIZE_BODY = 21; // 10.5pt
const SIZE_TABLE = 20; // 10pt
const SIZE_FOOTER = 19; // 9.5pt

function run(text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: opts.size ?? SIZE_BODY,
    bold: opts.bold,
    italics: opts.italics,
    color: '000000',
  });
}

function buildPegawaiRowsDocx(pegawai: Pegawai, numPrefix?: number): TableRow[] {
  const rows: Array<[string, string, string]> = [
    [numPrefix !== undefined ? `${numPrefix}.` : '', 'Nama', pegawai.nama || '-'],
    ['', 'NIP', pegawai.nip || '-'],
    ['', 'Pangkat/Gol', pegawai.pangkatGolongan || '-'],
    ['', 'Jabatan', pegawai.jabatan || '-'],
  ];

  return rows.map(
    ([num, label, val], idx) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 420, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [new Paragraph({ children: [run(num)] })],
          }),
          new TableCell({
            width: { size: 1700, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [new Paragraph({ children: [run(label)] })],
          }),
          new TableCell({
            width: { size: 280, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run(':')],
              }),
            ],
          }),
          new TableCell({
            width: { size: 5900, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [
              new Paragraph({
                spacing: { after: idx === 3 ? 120 : 0 },
                children: [run(val)],
              }),
            ],
          }),
        ],
      })
  );
}

function buildSignatureParagraphs(
  tanggalDisplay: string,
  jabatanPenandatangan: string,
  modeSrikandi: boolean,
  namaPenandatangan: string
): Paragraph[] {
  const indentLeft = 5200;
  return [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: indentLeft },
      spacing: { before: 280, after: 0 },
      children: [run(`Jember, ${tanggalDisplay}`)],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: indentLeft },
      spacing: { after: 360 },
      children: [run(jabatanPenandatangan || 'Kepala Kantor')],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: indentLeft },
      spacing: { after: 360 },
      children: [run(modeSrikandi ? '${ttd_pengirim}' : '')],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: indentLeft },
      spacing: { after: 280 },
      children: [
        run(modeSrikandi ? '${nama_pengirim}' : namaPenandatangan || 'Kepala Kantor'),
      ],
    }),
  ];
}

function buildAntiGratifikasiParagraphs(): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 320, after: 0 },
      children: [
        run('SELURUH ASN DAN PETUGAS DI KANTOR KEMENTERIAN AGAMA KABUPATEN JEMBER', {
          bold: true,
          size: SIZE_FOOTER,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        run('TIDAK MENERIMA GRATIFIKASI DALAM BENTUK APAPUN', {
          bold: true,
          size: SIZE_FOOTER,
        }),
      ],
    }),
  ];
}

export function createKopSuratTable(
  data: SuratTugasData,
  logoBytes: Uint8Array | null
): Table {
  const kop = KOP_VARIAN_OPTIONS[data.kopVarian] ?? KOP_VARIAN_OPTIONS.telepon;
  return new Table({
    width: { size: 10000, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.SINGLE, size: 14, color: '000000' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1500, type: WidthType.DXA },
            borders: KOP_SINGLE_BOTTOM_BORDER,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: logoBytes
                  ? [
                      new ImageRun({
                        data: logoBytes,
                        transformation: { width: 68, height: 62 },
                        type: 'png',
                      }),
                    ]
                  : [run('')],
              }),
            ],
          }),
          new TableCell({
            width: { size: 8500, type: WidthType.DXA },
            borders: KOP_SINGLE_BOTTOM_BORDER,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run('KEMENTERIAN AGAMA REPUBLIK INDONESIA', { bold: true, size: 25 }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run('KANTOR KEMENTERIAN AGAMA KABUPATEN JEMBER', {
                    bold: true,
                    size: 22,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run('Jalan KH. Wahid Hasyim Nomor.01 Jember, 68137', { size: 18 }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run(kop.kontakBaris, { size: 18 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 100 },
                children: [
                  run(`Website: jember.kemenag.go.id; E-mail: ${kop.email}`, {
                    size: 18,
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

export const createKopSurat = createKopSuratTable;

export async function exportSuratTugasDocx(data: SuratTugasData): Promise<void> {
  const nomorDisplay = data.modeSrikandi
    ? '${nomor_naskah}'
    : data.nomorSurat.trim() || '-';
  const tanggalDisplay = data.modeSrikandi
    ? '${tanggal_naskah}'
    : formatTanggalIndo(data.tanggalNaskah);

  const kegiatanPhrase = data.namaKegiatan.trim() || 'kegiatan ...';
  const menimbangAText =
    data.gunakanMenimbangCustom && data.menimbangCustom.trim()
      ? data.menimbangCustom.trim()
      : `Bahwa dalam rangka menghadiri ${kegiatanPhrase}, maka Aparatur Sipil Negara dibawah ini dipandang mampu melaksanakan tugas pada kegiatan tersebut.`;

  const rentangTanggal = formatRentangTanggal(data.tanggalMulai, data.tanggalSelesai);
  const rentangHariTanggal = formatRentangHariTanggal(
    data.tanggalMulai,
    data.tanggalSelesai
  );

  // Fetch official Kemenag logo as ArrayBuffer
  let logoBytes: Uint8Array | null = null;
  try {
    const res = await fetch('/assets/kemenag-logo.png');
    if (res.ok) {
      logoBytes = new Uint8Array(await res.arrayBuffer());
    }
  } catch {
    logoBytes = null;
  }

  const kopTable = createKopSuratTable(data, logoBytes);

  // Kepada sub-table
  const isTerlampir = data.kriteria === 'terlampir';
  const displayedPegawai =
    data.kriteria === 'sendiri'
      ? data.pegawaiList.slice(0, 1)
      : data.kriteria === 'tiga_orang'
      ? data.pegawaiList.slice(0, 3)
      : data.pegawaiList;

  const kepadaInnerRows: TableRow[] = [];
  if (isTerlampir) {
    kepadaInnerRows.push(
      ...buildPegawaiRowsDocx({
        id: 'lamp',
        nama: 'Terlampir',
        nip: 'Terlampir',
        pangkatGolongan: 'Terlampir',
        jabatan: 'Terlampir',
      })
    );
  } else if (data.kriteria === 'sendiri') {
    kepadaInnerRows.push(
      ...buildPegawaiRowsDocx(
        displayedPegawai[0] || {
          id: 'empty',
          nama: '-',
          nip: '-',
          pangkatGolongan: '-',
          jabatan: '-',
        }
      )
    );
  } else {
    displayedPegawai.forEach((p, idx) => {
      kepadaInnerRows.push(...buildPegawaiRowsDocx(p, idx + 1));
    });
  }

  const kepadaSubTable = new Table({
    width: { size: 8300, type: WidthType.DXA },
    borders: NO_BORDER,
    rows: kepadaInnerRows,
  });

  // Main body table (Menimbang, Dasar)
  const bodyTopTable = new Table({
    width: { size: 10000, type: WidthType.DXA },
    borders: NO_BORDER,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1400, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [new Paragraph({ children: [run('Menimbang')] })],
          }),
          new TableCell({
            width: { size: 300, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(':')] }),
            ],
          }),
          new TableCell({
            width: { size: 8300, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [
              new Paragraph({
                alignment: AlignmentType.BOTH,
                spacing: { after: 80 },
                children: [run(`a. ${menimbangAText}`)],
              }),
              new Paragraph({
                alignment: AlignmentType.BOTH,
                spacing: { after: 140 },
                children: [
                  run(
                    'b. Bahwa berdasarkan pertimbangan sebagaimana pada huruf a dipandang perlu untuk memberi tugas Aparatur Sipil Negara dimaksud.'
                  ),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1400, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [new Paragraph({ children: [run('Dasar')] })],
          }),
          new TableCell({
            width: { size: 300, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(':')] }),
            ],
          }),
          new TableCell({
            width: { size: 8300, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [
              new Paragraph({ children: [run(data.dasarAsal || '-')] }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1400, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [new Paragraph({ children: [run('Nomor')] })],
          }),
          new TableCell({
            width: { size: 300, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(':')] }),
            ],
          }),
          new TableCell({
            width: { size: 8300, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [
              new Paragraph({
                children: [
                  run(
                    `${data.dasarNomor || '-'}          Tanggal ${formatTanggalIndo(
                      data.dasarTanggal
                    )}`
                  ),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // Kepada & Untuk table
  const bodyBottomTable = new Table({
    width: { size: 10000, type: WidthType.DXA },
    borders: NO_BORDER,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1400, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [new Paragraph({ children: [run('Kepada')] })],
          }),
          new TableCell({
            width: { size: 300, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(':')] }),
            ],
          }),
          new TableCell({
            width: { size: 8300, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [kepadaSubTable, new Paragraph({ spacing: { after: 100 }, children: [] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1400, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [new Paragraph({ children: [run('Untuk')] })],
          }),
          new TableCell({
            width: { size: 300, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(':')] }),
            ],
          }),
          new TableCell({
            width: { size: 8300, type: WidthType.DXA },
            borders: NO_BORDER,
            children: [
              new Paragraph({
                alignment: AlignmentType.BOTH,
                spacing: { after: 60 },
                children: [
                  run(
                    `1. Menghadiri ${kegiatanPhrase}, yang dilaksanakan pada ${rentangTanggal} di ${
                      data.lokasiTujuan || '-'
                    }.`
                  ),
                ],
              }),
              new Paragraph({
                spacing: { after: 60 },
                children: [run('2. Setelah melaksanakan tugas, melaporkan pada Pimpinan;')],
              }),
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  run('3. Surat tugas ini untuk dilaksanakan sebagaimana mestinya.'),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.BOTH,
                children: [
                  run(
                    '4. Dalam pelaksanaan layanan ini ASN Kemenag Jember tidak menerima gratifikasi dalam bentuk apapun dan jika penerima layanan tetap memberikan imbalan maka ASN wajib membuat laporan kepada Unit Pengendalian Gratifikasi Kantor Kemenag Kabupaten Jember.'
                  ),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const page1Children: (Paragraph | Table)[] = [
    kopTable,
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 40 },
      children: [run('SURAT TUGAS', { bold: true, size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [run(`Nomor : ${nomorDisplay}`)],
    }),
    bodyTopTable,
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 180 },
      children: [run('Memberi Tugas', { bold: true })],
    }),
    bodyBottomTable,
    ...buildSignatureParagraphs(
      tanggalDisplay,
      data.jabatanPenandatangan,
      data.modeSrikandi,
      data.namaPenandatangan
    ),
    ...buildAntiGratifikasiParagraphs(),
  ];

  // Page 2 Lampiran if terlampir
  if (isTerlampir) {
    const lampiranRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            width: { size: 650, type: WidthType.DXA },
            borders: SOLID_BORDER,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run('NO', { bold: true, size: SIZE_TABLE })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 2450, type: WidthType.DXA },
            borders: SOLID_BORDER,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run('NAMA', { bold: true, size: SIZE_TABLE })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 2100, type: WidthType.DXA },
            borders: SOLID_BORDER,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run('NIP', { bold: true, size: SIZE_TABLE })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 1550, type: WidthType.DXA },
            borders: SOLID_BORDER,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run('Pangkat/', { bold: true, size: SIZE_TABLE })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run('Golongan', { bold: true, size: SIZE_TABLE })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 3250, type: WidthType.DXA },
            borders: SOLID_BORDER,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run('JABATAN', { bold: true, size: SIZE_TABLE })],
              }),
            ],
          }),
        ],
      }),
      ...displayedPegawai.map((peg, idx) => {
        const { pangkat, golongan } = splitPangkatGolongan(peg.pangkatGolongan);
        const pgParagraphs: Paragraph[] = [];
        if (pangkat) {
          pgParagraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [run(pangkat, { size: SIZE_TABLE })],
            })
          );
        }
        if (golongan) {
          pgParagraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [run(golongan, { size: SIZE_TABLE })],
            })
          );
        }
        if (pgParagraphs.length === 0) {
          pgParagraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [run('-', { size: SIZE_TABLE })],
            })
          );
        }

        return new TableRow({
          children: [
            new TableCell({
              borders: SOLID_BORDER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [run(String(idx + 1), { size: SIZE_TABLE })],
                }),
              ],
            }),
            new TableCell({
              borders: SOLID_BORDER,
              children: [
                new Paragraph({
                  children: [run(peg.nama || '-', { size: SIZE_TABLE })],
                }),
              ],
            }),
            new TableCell({
              borders: SOLID_BORDER,
              children: [
                new Paragraph({
                  children: [run(peg.nip || '-', { size: SIZE_TABLE })],
                }),
              ],
            }),
            new TableCell({
              borders: SOLID_BORDER,
              children: pgParagraphs,
            }),
            new TableCell({
              borders: SOLID_BORDER,
              children: [
                new Paragraph({
                  children: [run(peg.jabatan || '-', { size: SIZE_TABLE })],
                }),
              ],
            }),
          ],
        });
      }),
    ];

    page1Children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          run(`Lampiran Surat Tugas Nomor : ${nomorDisplay} Tanggal : ${tanggalDisplay}`),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          run(
            `Tentang ${kegiatanPhrase}, yang dilaksanakan pada ${rentangHariTanggal} di ${
              data.lokasiTujuan || '-'
            }`
          ),
        ],
      }),
      new Table({
        width: { size: 10000, type: WidthType.DXA },
        rows: lampiranRows,
      }),
      ...buildSignatureParagraphs(
        tanggalDisplay,
        data.jabatanPenandatangan,
        data.modeSrikandi,
        data.namaPenandatangan
      ),
      ...buildAntiGratifikasiParagraphs()
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              bottom: 720,
              left: 960,
              right: 960,
            },
          },
        },
        children: page1Children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `${buildSuratFileBaseName(data)}.docx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildSuratFileBaseName(data: SuratTugasData): string {
  const firstPerson = (data.pegawaiList[0]?.nama || 'Surat_Tugas')
    .replace(/[^a-zA-Z0-9._\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  const safePerson = firstPerson || 'Surat_Tugas';
  const suffix = data.kriteria === 'sendiri' ? '' : '_DKK';
  return `ST_${safePerson}${suffix}`;
}

