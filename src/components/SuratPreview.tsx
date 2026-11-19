import React from 'react';
import {
  KOP_VARIAN_OPTIONS,
  Pegawai,
  SuratTugasData,
} from '../types/surat';
import {
  formatRentangHariTanggal,
  formatRentangTanggal,
  formatTanggalIndo,
  splitPangkatGolongan,
} from '../utils/dateFormat';

interface SuratPreviewProps {
  data: SuratTugasData;
  zoom?: number;
}

function buildKegiatanPhrase(namaKegiatan: string): string {
  const clean = namaKegiatan.trim();
  if (!clean) return 'kegiatan ...';
  return clean;
}

function AntiGratifikasiFooter() {
  return (
    <div className="pt-4 mt-auto text-center font-bold uppercase text-[9.5pt] leading-[1.3] tracking-[0.01em] text-black">
      <div>SELURUH ASN DAN PETUGAS DI KANTOR KEMENTERIAN AGAMA KABUPATEN JEMBER</div>
      <div>TIDAK MENERIMA GRATIFIKASI DALAM BENTUK APAPUN</div>
    </div>
  );
}

function SignatureBlock({
  tanggalDisplay,
  jabatanPenandatangan,
  modeSrikandi,
  namaPenandatangan,
}: {
  tanggalDisplay: string;
  jabatanPenandatangan: string;
  modeSrikandi: boolean;
  namaPenandatangan: string;
}) {
  return (
    <div className="ml-[58%] mt-6 text-[10.5pt] leading-[1.35] text-black">
      <div>Jember, {tanggalDisplay}</div>
      <div>{jabatanPenandatangan || 'Kepala Kantor'}</div>
      <div className="h-[58px] flex items-center">
        {modeSrikandi ? (
          <span className="text-black">${'{ttd_pengirim}'}</span>
        ) : null}
      </div>
      <div>
        {modeSrikandi ? '${nama_pengirim}' : (namaPenandatangan || 'Kepala Kantor')}
      </div>
    </div>
  );
}

function PegawaiDetailRows({
  pegawai,
  numberPrefix,
}: {
  pegawai: Pegawai;
  numberPrefix?: number;
}) {
  return (
    <table className="w-full text-[10.5pt] leading-[1.32] mb-2.5 last:mb-0">
      <tbody>
        <tr>
          <td className="w-[22px] align-top">
            {numberPrefix !== undefined ? `${numberPrefix}.` : ''}
          </td>
          <td className="w-[95px] align-top whitespace-nowrap">Nama</td>
          <td className="w-[14px] align-top text-center">:</td>
          <td className="align-top">{pegawai.nama || '-'}</td>
        </tr>
        <tr>
          <td className="align-top" />
          <td className="align-top whitespace-nowrap">NIP</td>
          <td className="align-top text-center">:</td>
          <td className="align-top">{pegawai.nip || '-'}</td>
        </tr>
        <tr>
          <td className="align-top" />
          <td className="align-top whitespace-nowrap">Pangkat/Gol</td>
          <td className="align-top text-center">:</td>
          <td className="align-top">{pegawai.pangkatGolongan || '-'}</td>
        </tr>
        <tr>
          <td className="align-top" />
          <td className="align-top whitespace-nowrap">Jabatan</td>
          <td className="align-top text-center">:</td>
          <td className="align-top">{pegawai.jabatan || '-'}</td>
        </tr>
      </tbody>
    </table>
  );
}

export const SuratPreview: React.FC<SuratPreviewProps> = ({ data, zoom = 1 }) => {
  const kop = KOP_VARIAN_OPTIONS[data.kopVarian] ?? KOP_VARIAN_OPTIONS.telepon;
  const nomorDisplay = data.modeSrikandi
    ? '${nomor_naskah}'
    : data.nomorSurat.trim() || '-';
  const tanggalNaskahDisplay = data.modeSrikandi
    ? '${tanggal_naskah}'
    : formatTanggalIndo(data.tanggalNaskah);

  const kegiatanPhrase = buildKegiatanPhrase(data.namaKegiatan);
  const menimbangAText =
    data.gunakanMenimbangCustom && data.menimbangCustom.trim()
      ? data.menimbangCustom.trim()
      : `Bahwa dalam rangka menghadiri ${kegiatanPhrase}, maka Aparatur Sipil Negara dibawah ini dipandang mampu melaksanakan tugas pada kegiatan tersebut.`;

  const rentangTanggal = formatRentangTanggal(
    data.tanggalMulai,
    data.tanggalSelesai
  );
  const rentangHariTanggal = formatRentangHariTanggal(
    data.tanggalMulai,
    data.tanggalSelesai
  );

  const isTerlampir = data.kriteria === 'terlampir';
  const displayedPegawai =
    data.kriteria === 'sendiri'
      ? data.pegawaiList.slice(0, 1)
      : data.kriteria === 'tiga_orang'
      ? data.pegawaiList.slice(0, 3)
      : data.pegawaiList;

  const scaleWrapperStyle: React.CSSProperties =
    zoom !== 1
      ? {
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
          width: '210mm',
          marginBottom: `calc((${zoom} - 1) * ${isTerlampir ? '594mm' : '297mm'})`,
        }
      : { width: '210mm' };

  return (
    <div className="flex flex-col items-center print-scale-reset" style={scaleWrapperStyle}>
      {/* HALAMAN 1: SURAT TUGAS UTAMA */}
      <div className="surat-a4 shadow-[0_6px_28px_rgba(15,23,42,0.12)] border border-slate-300/80 mb-6 print:mb-0">
        <div>
          {/* KOP SURAT RESMI KEMENAG JEMBER */}
          <div className="flex items-center gap-3 pb-2 border-b-[1.5px] border-black">
            <div className="w-[74px] shrink-0 flex items-center justify-center">
              <img
                src="/assets/kemenag-logo.png"
                alt="Logo Kementerian Agama RI"
                className="w-[68px] h-[62px] object-contain"
              />
            </div>
            <div className="flex-1 text-center text-black leading-[1.22] pr-4">
              <div className="font-bold text-[12.5pt] tracking-[0.01em]">
                KEMENTERIAN AGAMA REPUBLIK INDONESIA
              </div>
              <div className="font-bold text-[11pt]">
                KANTOR KEMENTERIAN AGAMA KABUPATEN JEMBER
              </div>
              <div className="text-[9pt] mt-0.5">
                Jalan KH. Wahid Hasyim Nomor.01 Jember, 68137
              </div>
              <div className="text-[9pt]">{kop.kontakBaris}</div>
              <div className="text-[9pt] italic">
                Website: jember.kemenag.go.id; E-mail: {kop.email}
              </div>
            </div>
          </div>

          {/* JUDUL & NOMOR */}
          <div className="text-center mt-4 mb-3.5 text-black">
            <div className="font-bold text-[12pt] tracking-[0.02em]">
              SURAT TUGAS
            </div>
            <div className="text-[10.5pt] mt-0.5">
              Nomor : {nomorDisplay}
            </div>
          </div>

          {/* MENIMBANG & DASAR */}
          <table className="w-full text-[10.5pt] leading-[1.35] text-black">
            <tbody>
              <tr>
                <td className="w-[92px] align-top pb-1.5">Menimbang</td>
                <td className="w-[16px] align-top text-center pb-1.5">:</td>
                <td className="align-top pb-1.5">
                  <div className="flex gap-2">
                    <span className="shrink-0">a.</span>
                    <span className="text-justify">{menimbangAText}</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td className="align-top pb-2.5" />
                <td className="align-top pb-2.5" />
                <td className="align-top pb-2.5">
                  <div className="flex gap-2">
                    <span className="shrink-0">b.</span>
                    <span className="text-justify">
                      Bahwa berdasarkan pertimbangan sebagaimana pada huruf a dipandang perlu untuk memberi tugas Aparatur Sipil Negara dimaksud.
                    </span>
                  </div>
                </td>
              </tr>

              <tr>
                <td className="align-top pb-0.5">Dasar</td>
                <td className="align-top text-center pb-0.5">:</td>
                <td className="align-top pb-0.5">{data.dasarAsal || '-'}</td>
              </tr>
              <tr>
                <td className="align-top pb-3">Nomor</td>
                <td className="align-top text-center pb-3">:</td>
                <td className="align-top pb-3">
                  <div className="flex justify-between gap-4">
                    <span>{data.dasarNomor || '-'}</span>
                    <span className="whitespace-nowrap pr-8">
                      Tanggal {formatTanggalIndo(data.dasarTanggal)}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* MEMBERI TUGAS */}
          <div className="text-center font-bold text-[10.5pt] my-2.5 text-black">
            Memberi Tugas
          </div>

          {/* KEPADA */}
          <table className="w-full text-[10.5pt] leading-[1.35] text-black">
            <tbody>
              <tr>
                <td className="w-[92px] align-top pb-3">Kepada</td>
                <td className="w-[16px] align-top text-center pb-3">:</td>
                <td className="align-top pb-3">
                  {isTerlampir ? (
                    <table className="w-full text-[10.5pt] leading-[1.35]">
                      <tbody>
                        <tr>
                          <td className="w-[22px]" />
                          <td className="w-[95px]">Nama</td>
                          <td className="w-[14px] text-center">:</td>
                          <td>Terlampir</td>
                        </tr>
                        <tr>
                          <td />
                          <td>NIP</td>
                          <td className="text-center">:</td>
                          <td>Terlampir</td>
                        </tr>
                        <tr>
                          <td />
                          <td>Pangkat/Gol</td>
                          <td className="text-center">:</td>
                          <td>Terlampir</td>
                        </tr>
                        <tr>
                          <td />
                          <td>Jabatan</td>
                          <td className="text-center">:</td>
                          <td>Terlampir</td>
                        </tr>
                      </tbody>
                    </table>
                  ) : data.kriteria === 'sendiri' ? (
                    <PegawaiDetailRows
                      pegawai={
                        displayedPegawai[0] || {
                          id: 'empty',
                          nama: '-',
                          nip: '-',
                          pangkatGolongan: '-',
                          jabatan: '-',
                        }
                      }
                    />
                  ) : (
                    displayedPegawai.map((peg, idx) => (
                      <PegawaiDetailRows
                        key={peg.id}
                        pegawai={peg}
                        numberPrefix={idx + 1}
                      />
                    ))
                  )}
                </td>
              </tr>

              {/* UNTUK */}
              <tr>
                <td className="w-[92px] align-top">Untuk</td>
                <td className="w-[16px] align-top text-center">:</td>
                <td className="align-top">
                  <div className="space-y-0.5 text-justify">
                    <div className="flex gap-2">
                      <span className="shrink-0">1.</span>
                      <span>
                        Menghadiri {kegiatanPhrase}, yang dilaksanakan pada{' '}
                        {rentangTanggal} di {data.lokasiTujuan || '-'}.
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="shrink-0">2.</span>
                      <span>Setelah melaksanakan tugas, melaporkan pada Pimpinan;</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="shrink-0">3.</span>
                      <span>Surat tugas ini untuk dilaksanakan sebagaimana mestinya.</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="shrink-0">4.</span>
                      <span>
                        Dalam pelaksanaan layanan ini ASN Kemenag Jember tidak menerima gratifikasi dalam bentuk apapun dan jika penerima layanan tetap memberikan imbalan maka ASN wajib membuat laporan kepada Unit Pengendalian Gratifikasi Kantor Kemenag Kabupaten Jember.
                      </span>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* TANDA TANGAN */}
          <SignatureBlock
            tanggalDisplay={tanggalNaskahDisplay}
            jabatanPenandatangan={data.jabatanPenandatangan}
            modeSrikandi={data.modeSrikandi}
            namaPenandatangan={data.namaPenandatangan}
          />
        </div>

        {/* FOOTER ANTI GRATIFIKASI */}
        <AntiGratifikasiFooter />
      </div>

      {/* HALAMAN 2: LAMPIRAN (KHUSUS KRITERIA > 3 ORANG TERLAMPIR) */}
      {isTerlampir && (
        <div className="surat-a4 shadow-[0_6px_28px_rgba(15,23,42,0.12)] border border-slate-300/80">
          <div>
            <div className="text-center text-[10.5pt] leading-[1.35] text-black mb-3">
              <div>
                Lampiran Surat Tugas Nomor : {nomorDisplay} Tanggal : {tanggalNaskahDisplay}
              </div>
              <div>
                Tentang {kegiatanPhrase}, yang dilaksanakan pada {rentangHariTanggal} di{' '}
                {data.lokasiTujuan || '-'}
              </div>
            </div>

            <table className="w-full border-collapse border border-black text-[10pt] leading-[1.3] text-black">
              <thead>
                <tr>
                  <th className="border border-black px-2 py-1.5 text-center font-bold w-[38px]">
                    NO
                  </th>
                  <th className="border border-black px-2.5 py-1.5 text-center font-bold w-[170px]">
                    NAMA
                  </th>
                  <th className="border border-black px-2.5 py-1.5 text-center font-bold w-[145px]">
                    NIP
                  </th>
                  <th className="border border-black px-2 py-1.5 text-center font-bold w-[110px]">
                    Pangkat/
                    <br />
                    Golongan
                  </th>
                  <th className="border border-black px-2.5 py-1.5 text-center font-bold">
                    JABATAN
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedPegawai.map((peg, index) => {
                  const { pangkat, golongan } = splitPangkatGolongan(
                    peg.pangkatGolongan
                  );
                  return (
                    <tr key={peg.id}>
                      <td className="border border-black px-2 py-1.5 align-top text-center">
                        {index + 1}
                      </td>
                      <td className="border border-black px-2.5 py-1.5 align-top">
                        {peg.nama || '-'}
                      </td>
                      <td className="border border-black px-2.5 py-1.5 align-top">
                        {peg.nip || '-'}
                      </td>
                      <td className="border border-black px-2 py-1.5 align-top text-center">
                        {pangkat && <div>{pangkat}</div>}
                        {golongan && <div>{golongan}</div>}
                        {!pangkat && !golongan && <div>-</div>}
                      </td>
                      <td className="border border-black px-2.5 py-1.5 align-top">
                        {peg.jabatan || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <SignatureBlock
              tanggalDisplay={tanggalNaskahDisplay}
              jabatanPenandatangan={data.jabatanPenandatangan}
              modeSrikandi={data.modeSrikandi}
              namaPenandatangan={data.namaPenandatangan}
            />
          </div>

          <AntiGratifikasiFooter />
        </div>
      )}
    </div>
  );
};
