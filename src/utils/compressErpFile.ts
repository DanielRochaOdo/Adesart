import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ERP_MAX_FILE_SIZE } from './uploadFile';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const TARGET_BYTES = Math.floor(ERP_MAX_FILE_SIZE * 0.94);

type CompressionAttempt = {
  scale: number;
  quality: number;
};

const IMAGE_ATTEMPTS: CompressionAttempt[] = [
  { scale: 1, quality: 0.82 },
  { scale: 0.88, quality: 0.74 },
  { scale: 0.76, quality: 0.66 },
  { scale: 0.64, quality: 0.58 },
  { scale: 0.52, quality: 0.5 },
];

const PDF_ATTEMPTS: CompressionAttempt[] = [
  { scale: 1.25, quality: 0.78 },
  { scale: 1.05, quality: 0.7 },
  { scale: 0.9, quality: 0.62 },
  { scale: 0.76, quality: 0.54 },
  { scale: 0.64, quality: 0.48 },
];

function compressedName(fileName: string, extension: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${base}_comprimido.${extension}`;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Não foi possível gerar o arquivo comprimido.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

async function loadImageSource(file: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Não foi possível abrir a imagem para compressão.'));
    element.src = url;
  });

  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

async function compressImage(file: File): Promise<File> {
  const image = await loadImageSource(file);
  try {
    for (const attempt of IMAGE_ATTEMPTS) {
      const width = Math.max(1, Math.round(image.width * attempt.scale));
      const height = Math.max(1, Math.round(image.height * attempt.scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Navegador sem suporte à compressão da imagem.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image.source, 0, 0, width, height);

      const blob = await canvasToJpeg(canvas, attempt.quality);
      if (blob.size <= TARGET_BYTES) {
        return new File(
          [blob],
          compressedName(file.name, 'jpg'),
          { type: 'image/jpeg', lastModified: Date.now() },
        );
      }
    }
  } finally {
    image.cleanup();
  }

  throw new Error(
    'A imagem não pôde ser reduzida para menos de 5 MB. Selecione outro arquivo.',
  );
}

async function renderPdfAttempt(
  source: Uint8Array,
  fileName: string,
  attempt: CompressionAttempt,
): Promise<File> {
  const loadingTask = pdfjsLib.getDocument({
    data: source,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const sourcePdf = await loadingTask.promise;
  const outputPdf = await PDFDocument.create();

  try {
    for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber += 1) {
      const sourcePage = await sourcePdf.getPage(pageNumber);
      const originalViewport = sourcePage.getViewport({ scale: 1 });
      const renderViewport = sourcePage.getViewport({ scale: attempt.scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(renderViewport.width));
      canvas.height = Math.max(1, Math.ceil(renderViewport.height));

      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Navegador sem suporte à compressão do PDF.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await sourcePage.render({
        canvasContext: context,
        viewport: renderViewport,
        background: '#ffffff',
      }).promise;

      const imageBlob = await canvasToJpeg(canvas, attempt.quality);
      const imageBytes = new Uint8Array(await imageBlob.arrayBuffer());
      const embeddedImage = await outputPdf.embedJpg(imageBytes);
      const targetPage = outputPdf.addPage([
        originalViewport.width,
        originalViewport.height,
      ]);
      targetPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: originalViewport.width,
        height: originalViewport.height,
      });

      sourcePage.cleanup();
      canvas.width = 1;
      canvas.height = 1;
    }

    const bytes = await outputPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 25,
    });

    return new File(
      [bytes],
      compressedName(fileName, 'pdf'),
      { type: 'application/pdf', lastModified: Date.now() },
    );
  } finally {
    await sourcePdf.destroy();
  }
}

async function compressPdf(file: File): Promise<File> {
  const source = new Uint8Array(await file.arrayBuffer());

  for (const attempt of PDF_ATTEMPTS) {
    const compressed = await renderPdfAttempt(source, file.name, attempt);
    if (compressed.size <= TARGET_BYTES) return compressed;
  }

  throw new Error(
    'O PDF não pôde ser reduzido para menos de 5 MB automaticamente. Envie uma versão menor.',
  );
}

export async function compressFileForErp(file: File): Promise<File> {
  if (file.size <= ERP_MAX_FILE_SIZE) return file;

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return compressPdf(file);
  }

  if (
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    file.type === 'image/png'
  ) {
    return compressImage(file);
  }

  throw new Error('Compressão automática disponível apenas para PDF, JPG e PNG.');
}
