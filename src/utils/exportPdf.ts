import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { SuratTugasData } from '../types/surat';
import { buildSuratFileBaseName } from './exportDocx';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_WIDTH_PX = 794; // 210mm at 96dpi

async function waitForImagesLoaded(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => {
          img.removeEventListener('load', done);
          img.removeEventListener('error', done);
          resolve();
        };
        img.addEventListener('load', done);
        img.addEventListener('error', done);
        window.setTimeout(done, 2500);
      });
    })
  );
}

function sliceCanvasVertically(
  source: HTMLCanvasElement,
  sliceTopPx: number,
  sliceHeightPx: number
): HTMLCanvasElement {
  const slice = document.createElement('canvas');
  slice.width = source.width;
  slice.height = sliceHeightPx;
  const ctx = slice.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(
      source,
      0,
      sliceTopPx,
      source.width,
      sliceHeightPx,
      0,
      0,
      source.width,
      sliceHeightPx
    );
  }
  return slice;
}

/**
 * Exports `#surat-preview-paper` (all `.surat-a4` pages) into a crisp A4 portrait PDF
 * with pure white paper background and sharp black text regardless of active UI theme or zoom.
 */
export async function exportSuratTugasPdf(data: SuratTugasData): Promise<void> {
  const previewRoot = document.getElementById('surat-preview-paper');
  if (!previewRoot) {
    throw new Error('Elemen pratinjau surat (#surat-preview-paper) tidak ditemukan.');
  }

  const sourcePages = Array.from(
    previewRoot.querySelectorAll<HTMLElement>('.surat-a4')
  );
  if (sourcePages.length === 0) {
    throw new Error('Halaman pratinjau A4 belum siap untuk diekspor ke PDF.');
  }

  // Clone into an isolated offscreen light-mode host so Dark Mode, Night Light,
  // viewport zoom transforms, or mobile hidden panes never affect PDF rendering.
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${A4_WIDTH_MM}mm`;
  host.style.background = '#ffffff';
  host.style.color = '#000000';
  host.style.colorScheme = 'light';
  host.style.margin = '0';
  host.style.padding = '0';
  host.style.zIndex = '-1';
  host.style.pointerEvents = 'none';
  host.style.display = 'block';

  document.body.appendChild(host);

  try {
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      await document.fonts.ready;
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    let pdfPageAdded = false;

    for (const sourcePage of sourcePages) {
      const pageClone = sourcePage.cloneNode(true) as HTMLElement;
      pageClone.style.width = `${A4_WIDTH_MM}mm`;
      pageClone.style.minHeight = `${A4_HEIGHT_MM}mm`;
      pageClone.style.margin = '0';
      pageClone.style.border = 'none';
      pageClone.style.boxShadow = 'none';
      pageClone.style.background = '#ffffff';
      pageClone.style.backgroundColor = '#ffffff';
      pageClone.style.color = '#000000';
      pageClone.style.colorScheme = 'light';
      pageClone.style.transform = 'none';

      host.innerHTML = '';
      host.appendChild(pageClone);
      await waitForImagesLoaded(pageClone);

      const canvas = await html2canvas(pageClone, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: pageClone.offsetWidth || A4_WIDTH_PX,
        windowWidth: pageClone.offsetWidth || A4_WIDTH_PX,
        onclone: (clonedDoc) => {
          clonedDoc.documentElement.classList.remove('dark', 'theme-night');
          clonedDoc.documentElement.style.colorScheme = 'light';
          if (clonedDoc.body) {
            clonedDoc.body.style.background = '#ffffff';
          }
        },
      });

      const totalHeightMm = (canvas.height * A4_WIDTH_MM) / canvas.width;

      // Single A4 page (allow minor 1.5mm subpixel tolerance so no accidental blank trailing page)
      if (totalHeightMm <= A4_HEIGHT_MM + 1.5) {
        if (pdfPageAdded) pdf.addPage('a4', 'portrait');
        pdf.addImage(
          canvas.toDataURL('image/png'),
          'PNG',
          0,
          0,
          A4_WIDTH_MM,
          Math.min(totalHeightMm, A4_HEIGHT_MM),
          undefined,
          'FAST'
        );
        pdfPageAdded = true;
        continue;
      }

      // Overflowing Lampiran page: slice cleanly into exact A4 portrait heights
      const sliceHeightPx = Math.floor((canvas.width * A4_HEIGHT_MM) / A4_WIDTH_MM);
      let offsetY = 0;
      while (offsetY < canvas.height) {
        const remainingPx = canvas.height - offsetY;
        const currentSliceHeightPx = Math.min(sliceHeightPx, remainingPx);
        const sliceCanvas = sliceCanvasVertically(
          canvas,
          offsetY,
          currentSliceHeightPx
        );
        const sliceHeightMm = (currentSliceHeightPx * A4_WIDTH_MM) / canvas.width;

        if (pdfPageAdded) pdf.addPage('a4', 'portrait');
        pdf.addImage(
          sliceCanvas.toDataURL('image/png'),
          'PNG',
          0,
          0,
          A4_WIDTH_MM,
          Math.min(sliceHeightMm, A4_HEIGHT_MM),
          undefined,
          'FAST'
        );
        pdfPageAdded = true;
        offsetY += currentSliceHeightPx;
      }
    }

    const fileName = `${buildSuratFileBaseName(data)}.pdf`;
    pdf.save(fileName);
  } finally {
    host.remove();
  }
}
