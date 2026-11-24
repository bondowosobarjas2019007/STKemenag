import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
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
import { Pegawai, SpdFormData } from '../types/surat';
import { formatTanggalIndo, terbilangHari } from './dateFormat';

const FONT = 'Arial';
const SIZE_TITLE = 24; // 12pt
const SIZE_REGULAR = 19; // 9.5pt
const SIZE_SMALL = 17; // 8.5pt
const SIZE_VERY_SMALL = 15; // 7.5pt

const BORDER_BOX = {
  top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
  left: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
  right: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
};

const BORDER_NONE = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

function run(text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: opts.size ?? SIZE_REGULAR,
    bold: opts.bold,
    italics: opts.italics,
    color: '000000',
  });
}

function p(text = '', opts: { bold?: boolean; italics?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number } = {}) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 0 },
    children: [run(text, opts)],
  });
}

function sanitizeFileName(str: string): string {
  return (str || 'Pegawai')
    .replace(/[^a-zA-Z0-9_\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * Builds the official 2-page SPD docx Document structure for a given primary Pegawai (and optional pengikut).
 */
export function buildSingleSpdDocument(
  spd: SpdFormData,
  primaryPegawai: Pegawai,
  pengikutList: Pegawai[] = []
): Document {
  const tglBerangkatIndo = formatTanggalIndo(spd.tanggalBerangkat);
  const tglKembaliIndo = formatTanggalIndo(spd.tanggalKembali);
  const tglSpdIndo = formatTanggalIndo(spd.tanggalSpd);
  const lamaHariStr = terbilangHari(spd.lamaHari);

  // Table Widths (Total: 10,000 DXA)
  const colNumW = 550;
  const colLabelW = 4450;
  const colValW = 5000;

  // Header 2 columns (Top-Left Instansi, Top-Right Lembar/Nomor)
  const headerTable = new Table({
    width: { size: 10000, type: WidthType.DXA },
    borders: {
      top: BORDER_NONE.top,
      bottom: BORDER_NONE.bottom,
      left: BORDER_NONE.left,
      right: BORDER_NONE.right,
      insideHorizontal: BORDER_NONE.top,
      insideVertical: BORDER_NONE.left,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 5500, type: WidthType.DXA },
            borders: BORDER_NONE,
            children: [
              p('KEMENTERIAN NEGARA / LEMBAGA :', { size: SIZE_SMALL, bold: true }),
              p('KANTOR KEMENTERIAN AGAMA KABUPATEN JEMBER', { size: SIZE_SMALL, bold: true }),
            ],
          }),
          new TableCell({
            width: { size: 4500, type: WidthType.DXA },
            borders: BORDER_NONE,
            children: [
              new Table({
                width: { size: 4500, type: WidthType.DXA },
                borders: BORDER_NONE,
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({ width: { size: 1400, type: WidthType.DXA }, borders: BORDER_NONE, children: [p('Lembar Ke', { size: SIZE_VERY_SMALL })] }),
                      new TableCell({ width: { size: 200, type: WidthType.DXA }, borders: BORDER_NONE, children: [p(':', { size: SIZE_VERY_SMALL })] }),
                      new TableCell({ width: { size: 2900, type: WidthType.DXA }, borders: BORDER_NONE, children: [p('-', { size: SIZE_VERY_SMALL })] }),
                    ],
                  }),
                  new TableRow({
                    children: [
                      new TableCell({ width: { size: 1400, type: WidthType.DXA }, borders: BORDER_NONE, children: [p('Kode No', { size: SIZE_VERY_SMALL })] }),
                      new TableCell({ width: { size: 200, type: WidthType.DXA }, borders: BORDER_NONE, children: [p(':', { size: SIZE_VERY_SMALL })] }),
                      new TableCell({ width: { size: 2900, type: WidthType.DXA }, borders: BORDER_NONE, children: [p('-', { size: SIZE_VERY_SMALL })] }),
                    ],
                  }),
                  new TableRow({
                    children: [
                      new TableCell({ width: { size: 1400, type: WidthType.DXA }, borders: BORDER_NONE, children: [p('Nomor', { size: SIZE_VERY_SMALL })] }),
                      new TableCell({ width: { size: 200, type: WidthType.DXA }, borders: BORDER_NONE, children: [p(':', { size: SIZE_VERY_SMALL })] }),
                      new TableCell({ width: { size: 2900, type: WidthType.DXA }, borders: BORDER_NONE, children: [p(spd.nomorSpd || '-', { size: SIZE_VERY_SMALL, bold: true })] }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // Rows for Point 8 (Pengikut)
  const pengikutTableRows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({ width: { size: 600, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('No', { size: SIZE_VERY_SMALL, bold: true, align: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 2400, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('Nama', { size: SIZE_VERY_SMALL, bold: true, align: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 1000, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('Tanggal Lahir', { size: SIZE_VERY_SMALL, bold: true, align: AlignmentType.CENTER })] }),
        new TableCell({ width: { size: 1000, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('Keterangan', { size: SIZE_VERY_SMALL, bold: true, align: AlignmentType.CENTER })] }),
      ],
    }),
  ];

  if (pengikutList.length > 0) {
    pengikutList.forEach((peg, idx) => {
      pengikutTableRows.push(
        new TableRow({
          children: [
            new TableCell({ width: { size: 600, type: WidthType.DXA }, borders: BORDER_BOX, children: [p(String(idx + 1), { size: SIZE_VERY_SMALL, align: AlignmentType.CENTER })] }),
            new TableCell({
              width: { size: 2400, type: WidthType.DXA },
              borders: BORDER_BOX,
              children: [
                p(peg.nama || '-', { size: SIZE_VERY_SMALL, bold: true }),
                p(`/${peg.nip || '-'}`, { size: SIZE_VERY_SMALL }),
              ],
            }),
            new TableCell({ width: { size: 1000, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('-', { size: SIZE_VERY_SMALL, align: AlignmentType.CENTER })] }),
            new TableCell({ width: { size: 1000, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('-', { size: SIZE_VERY_SMALL, align: AlignmentType.CENTER })] }),
          ],
        })
      );
    });
  } else {
    // 3 empty standard placeholder rows
    for (let i = 1; i <= 3; i++) {
      pengikutTableRows.push(
        new TableRow({
          children: [
            new TableCell({ width: { size: 600, type: WidthType.DXA }, borders: BORDER_BOX, children: [p(String(i), { size: SIZE_VERY_SMALL, align: AlignmentType.CENTER })] }),
            new TableCell({ width: { size: 2400, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('-', { size: SIZE_VERY_SMALL, align: AlignmentType.CENTER })] }),
            new TableCell({ width: { size: 1000, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('-', { size: SIZE_VERY_SMALL, align: AlignmentType.CENTER })] }),
            new TableCell({ width: { size: 1000, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('-', { size: SIZE_VERY_SMALL, align: AlignmentType.CENTER })] }),
          ],
        })
      );
    }
  }

  const pengikutSubTable = new Table({
    width: { size: colValW, type: WidthType.DXA },
    borders: BORDER_BOX,
    rows: pengikutTableRows,
  });

  // Main 10 Points Table Page 1
  const spdTable = new Table({
    width: { size: 10000, type: WidthType.DXA },
    borders: BORDER_BOX,
    rows: [
      new TableRow({
        children: [
          new TableCell({ width: { size: colNumW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('1', { align: AlignmentType.CENTER })] }),
          new TableCell({ width: { size: colLabelW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('Pejabat Pembuat Komitmen')] }),
          new TableCell({ width: { size: colValW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p(spd.ppkNama || '-')] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ width: { size: colNumW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('2', { align: AlignmentType.CENTER })] }),
          new TableCell({ width: { size: colLabelW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('Nama / NIP Pegawai yang melaksanakan perjalanan dinas')] }),
          new TableCell({
            width: { size: colValW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p(primaryPegawai.nama || '-', { bold: true }),
              p(`NIP. ${primaryPegawai.nip || '-'}`),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ width: { size: colNumW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('3', { align: AlignmentType.CENTER })] }),
          new TableCell({
            width: { size: colLabelW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p('a. Pangkat dan Golongan'),
              p('b. Jabatan / Instansi'),
              p('c. Tingkat Biaya Perjalanan Dinas'),
            ],
          }),
          new TableCell({
            width: { size: colValW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p(`a. ${primaryPegawai.pangkatGolongan || '-'}`),
              p(`b. ${primaryPegawai.jabatan || '-'}`),
              p(`c. ${spd.tingkatBiaya || 'Tingkat C'}`),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ width: { size: colNumW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('4', { align: AlignmentType.CENTER })] }),
          new TableCell({ width: { size: colLabelW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('Maksud Perjalanan Dinas')] }),
          new TableCell({ width: { size: colValW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p(spd.maksudPerjalanan || '-')] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ width: { size: colNumW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('5', { align: AlignmentType.CENTER })] }),
          new TableCell({ width: { size: colLabelW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('Alat angkut yang dipergunakan')] }),
          new TableCell({ width: { size: colValW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p(spd.alatAngkutan || 'Kendaraan Umum / Darat')] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ width: { size: colNumW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('6', { align: AlignmentType.CENTER })] }),
          new TableCell({
            width: { size: colLabelW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p('a. Tempat berangkat'),
              p('b. Tempat tujuan'),
            ],
          }),
          new TableCell({
            width: { size: colValW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p(`a. ${spd.tempatBerangkat || 'JEMBER'}`),
              p(`b. ${spd.kotaTujuan || '-'}`),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ width: { size: colNumW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('7', { align: AlignmentType.CENTER })] }),
          new TableCell({
            width: { size: colLabelW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p('a. Lamanya Perjalanan Dinas'),
              p('b. Tanggal berangkat'),
              p('c. Tanggal harus kembali/tiba di tempat baru *)'),
            ],
          }),
          new TableCell({
            width: { size: colValW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p(`a. ${lamaHariStr}`),
              p(`b. ${tglBerangkatIndo}`),
              p(`c. ${tglKembaliIndo}`),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ width: { size: colNumW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('8', { align: AlignmentType.CENTER })] }),
          new TableCell({ width: { size: colLabelW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('Pengikut : Nama')] }),
          new TableCell({ width: { size: colValW, type: WidthType.DXA }, borders: BORDER_BOX, children: [pengikutSubTable] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ width: { size: colNumW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('9', { align: AlignmentType.CENTER })] }),
          new TableCell({
            width: { size: colLabelW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p('Pembebanan Anggaran'),
              p('a. Instansi'),
              p('b. Akun'),
            ],
          }),
          new TableCell({
            width: { size: colValW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p(''),
              p(spd.pembebananAnggaranInstansi || 'a. Kantor Kementerian Agama Kab. Jember'),
              p(spd.pembebananAnggaranAkun || 'b. '),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ width: { size: colNumW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('10', { align: AlignmentType.CENTER })] }),
          new TableCell({ width: { size: colLabelW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p('Keterangan lain-lain')] }),
          new TableCell({ width: { size: colValW, type: WidthType.DXA }, borders: BORDER_BOX, children: [p(spd.keteranganLain || '-')] }),
        ],
      }),
    ],
  });

  // Page 1 Footer Signature (Bottom Right)
  const signaturePage1 = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: 5400 },
      spacing: { before: 240, after: 20 },
      children: [run(`Dikeluarkan di : ${spd.tempatDikeluarkan || 'Jember'}`)],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: 5400 },
      spacing: { after: 40 },
      children: [run(`Pada tanggal   : ${tglSpdIndo}`)],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: 5400 },
      spacing: { after: 450 },
      children: [run('Pejabat Pembuat Komitmen,', { bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      indent: { left: 5400 },
      spacing: { after: 10 },
      children: [run(spd.ppkNama || 'Pejabat Pembuat Komitmen', { bold: true })],
    }),
    ...(spd.ppkNip
      ? [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            indent: { left: 5400 },
            children: [run(`NIP. ${spd.ppkNip}`)],
          }),
        ]
      : []),
  ];

  // ==========================================
  // PAGE 2: VISUM BELAKANG TABLE (Official Form)
  // ==========================================
  const visumColW = 5000;
  const visumTable = new Table({
    width: { size: 10000, type: WidthType.DXA },
    borders: BORDER_BOX,
    rows: [
      // BLOK I
      new TableRow({
        children: [
          new TableCell({
            width: { size: visumColW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [p('-')],
          }),
          new TableCell({
            width: { size: visumColW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p('I. Berangkat dari : Jember'),
              p('   (Tempat Kedudukan)'),
              p(`   Ke : ${spd.tujuanLengkap || spd.kotaTujuan}`),
              p(`   Pada Tanggal : ${tglBerangkatIndo}`),
              p('   Kepala Kantor Kementerian Agama Kabupaten Jember', { bold: true }),
              p('', { before: 420 }),
              p(spd.namaKepalaKantor || 'Dr. SANTOSO, S.Ag, M.Pd.', { bold: true }),
              p(`NIP. ${spd.nipKepalaKantor || '197008101998031002'}`),
            ],
          }),
        ],
      }),
      // BLOK II
      new TableRow({
        children: [
          new TableCell({
            width: { size: visumColW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p(`II. Tiba di : ${spd.kotaTujuan}`),
              p(`    Pada Tanggal : ${tglBerangkatIndo}`),
              p('    Kepala : '),
              p('', { before: 360 }),
              p('(............................................................)'),
              p('NIP. '),
            ],
          }),
          new TableCell({
            width: { size: visumColW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p(`    Berangkat dari : ${spd.kotaTujuan}`),
              p('    Ke : Jember'),
              p(`    Pada Tanggal : ${tglKembaliIndo}`),
              p('    Kepala : '),
              p('', { before: 360 }),
              p('(............................................................)'),
              p('NIP. '),
            ],
          }),
        ],
      }),
      // BLOK III
      new TableRow({
        children: [
          new TableCell({
            width: { size: visumColW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p('III. Tiba di : '),
              p('     Pada Tanggal : '),
              p('     Kepala : '),
              p('', { before: 300 }),
              p('(............................................................)'),
              p('NIP. '),
            ],
          }),
          new TableCell({
            width: { size: visumColW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p('     Berangkat dari : '),
              p('     Ke : '),
              p('     Pada Tanggal : '),
              p('     Kepala : '),
              p('', { before: 300 }),
              p('(............................................................)'),
              p('NIP. '),
            ],
          }),
        ],
      }),
      // BLOK IV
      new TableRow({
        children: [
          new TableCell({
            width: { size: visumColW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p('IV. Tiba di : '),
              p('    Pada Tanggal : '),
              p('    Kepala : '),
              p('', { before: 300 }),
              p('(............................................................)'),
              p('NIP. '),
            ],
          }),
          new TableCell({
            width: { size: visumColW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p('    Berangkat dari : '),
              p('    Ke : '),
              p('    Pada Tanggal : '),
              p('    Kepala : '),
              p('', { before: 300 }),
              p('(............................................................)'),
              p('NIP. '),
            ],
          }),
        ],
      }),
      // BLOK V
      new TableRow({
        children: [
          new TableCell({
            width: { size: visumColW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p('V. Tiba di : '),
              p('   Pada Tanggal : '),
              p('   Kepala : '),
              p('', { before: 300 }),
              p('(............................................................)'),
              p('NIP. '),
            ],
          }),
          new TableCell({
            width: { size: visumColW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p('   Berangkat dari : '),
              p('   Ke : '),
              p('   Pada Tanggal : '),
              p('   Kepala : '),
              p('', { before: 300 }),
              p('(............................................................)'),
              p('NIP. '),
            ],
          }),
        ],
      }),
      // BLOK VI (TTD PPK KIRI & KANAN)
      new TableRow({
        children: [
          new TableCell({
            width: { size: visumColW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p('VI. Tiba kembali di : Jember'),
              p('    (Tempat Kedudukan)'),
              p(`    Pada Tanggal : ${tglKembaliIndo}`),
              p('    Pejabat Pembuat Komitmen,', { bold: true }),
              p('', { before: 420 }),
              p(spd.ppkNama || 'Pejabat Pembuat Komitmen', { bold: true }),
              ...(spd.ppkNip ? [p(`NIP. ${spd.ppkNip}`)] : []),
            ],
          }),
          new TableCell({
            width: { size: visumColW, type: WidthType.DXA },
            borders: BORDER_BOX,
            children: [
              p(
                '    Telah diperiksa, dengan keterangan bahwa perjalanan tersebut diatas benar dilakukan atas perintahnya dan semata-mata untuk kepentingan jabatan dalam waktu yang sesingkat-singkatnya.',
                { size: SIZE_VERY_SMALL, italics: true }
              ),
              p('    Pejabat Pembuat Komitmen,', { bold: true }),
              p('', { before: 380 }),
              p(spd.ppkNama || 'Pejabat Pembuat Komitmen', { bold: true }),
              ...(spd.ppkNip ? [p(`NIP. ${spd.ppkNip}`)] : []),
            ],
          }),
        ],
      }),
      // BLOK VII (Catatan Lain-lain)
      new TableRow({
        children: [
          new TableCell({
            width: { size: 10000, type: WidthType.DXA },
            columnSpan: 2,
            borders: BORDER_BOX,
            children: [
              p('VII. Catatan Lain-lain :', { bold: true }),
              p('-'),
            ],
          }),
        ],
      }),
      // BLOK VIII (PERHATIAN)
      new TableRow({
        children: [
          new TableCell({
            width: { size: 10000, type: WidthType.DXA },
            columnSpan: 2,
            borders: BORDER_BOX,
            children: [
              p('VIII. PERHATIAN :', { bold: true }),
              p(
                'PPK yang menerbitkan SPD, pegawai yang melakukan perjalanan dinas, para pejabat yang mengesahkan tanggal berangkat/tiba, serta bendaharawan bertanggung jawab berdasarkan peraturan-peraturan Keuangan Negara apabila Negara mendapat rugi karena kesalahan, kealpaan atau kealpaan.',
                { size: SIZE_VERY_SMALL }
              ),
            ],
          }),
        ],
      }),
    ],
  });

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 560,
              bottom: 560,
              left: 720,
              right: 720,
            },
          },
        },
        children: [
          // ========================
          // HALAMAN 1 (MUKA SPD)
          // ========================
          headerTable,
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 180, after: 140 },
            children: [
              run('SURAT PERJALANAN DINAS (SPD)', {
                bold: true,
                size: SIZE_TITLE,
              }),
            ],
          }),
          spdTable,
          ...signaturePage1,

          // ========================
          // HALAMAN 2 (VISUM BELAKANG)
          // ========================
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 140 },
            children: [
              run('VISUM / LEMBAR PENGESAHAN PERJALANAN DINAS', {
                bold: true,
                size: SIZE_REGULAR,
              }),
            ],
          }),
          visumTable,
        ],
      },
    ],
  });
}

/**
 * Generates single SPD docx blob.
 */
export async function generateSpdDocxBlob(
  spd: SpdFormData,
  primaryPegawai: Pegawai,
  pengikutList: Pegawai[] = []
): Promise<Blob> {
  const doc = buildSingleSpdDocument(spd, primaryPegawai, pengikutList);
  return await Packer.toBlob(doc);
}

/**
 * Exports SPD in docx format based on formatMode:
 * 1. 'gabung': Single file SPD <PEMIMPIN> DKK (<TANGGAL>).docx
 * 2. 'per_file':
 *    - 1 person: SPD <NAMA> (<TANGGAL>).docx
 *    - >1 person: Packages all individual docx into one zip file using JSZip!
 */
export async function exportSpdDocx(spd: SpdFormData): Promise<void> {
  const tglBerangkat = spd.tanggalBerangkat || new Date().toISOString().slice(0, 10);
  const pegawaiList = spd.pegawaiList.length > 0
    ? spd.pegawaiList
    : [{ id: '1', nama: 'Pegawai', nip: '-', pangkatGolongan: '-', jabatan: '-' }];

  if (spd.formatMode === 'gabung') {
    const leader = pegawaiList[0];
    const followers = pegawaiList.slice(1);
    const blob = await generateSpdDocxBlob(spd, leader, followers);
    const suffix = followers.length > 0 ? '_DKK' : '';
    const fileName = `SPD_${sanitizeFileName(leader.nama)}${suffix}_(${tglBerangkat}).docx`;
    downloadBlob(blob, fileName);
    return;
  }

  // Mode per_file (1 Nama = 1 SPD)
  if (pegawaiList.length === 1) {
    const p1 = pegawaiList[0];
    const blob = await generateSpdDocxBlob(spd, p1, []);
    const fileName = `SPD_${sanitizeFileName(p1.nama)}_(${tglBerangkat}).docx`;
    downloadBlob(blob, fileName);
    return;
  }

  // Multiple files -> Pack into ZIP
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  for (let i = 0; i < pegawaiList.length; i++) {
    const peg = pegawaiList[i];
    const blob = await generateSpdDocxBlob(spd, peg, []);
    const individualName = `SPD_${String(i + 1).padStart(2, '0')}_${sanitizeFileName(peg.nama)}_(${tglBerangkat}).docx`;
    zip.file(individualName, blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipFileName = `SPD_${pegawaiList.length}_Pegawai_(${tglBerangkat}).zip`;
  downloadBlob(zipBlob, zipFileName);
}

/**
 * Exports all rendered `.spd-page-a4` elements inside containerEl into a combined multi-page A4 PDF.
 */
export async function exportSpdPdf(
  containerEl: HTMLElement,
  fileName: string
): Promise<void> {
  const html2canvas = (await import('html2canvas-pro')).default;
  const { jsPDF } = await import('jspdf');

  const pages = Array.from(
    containerEl.querySelectorAll<HTMLElement>('.spd-page-a4')
  );
  if (pages.length === 0) {
    throw new Error('Halaman pratinjau SPD belum siap untuk diekspor ke PDF.');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pdfW = 210;
  const pdfH = 297;

  for (let i = 0; i < pages.length; i++) {
    const pageEl = pages[i];
    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }

    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 794,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');
  }

  pdf.save(fileName);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
