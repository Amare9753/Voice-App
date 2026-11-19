import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

export async function recognizeImage(image: Blob): Promise<{ text: string; engine: string }> {
  const worker = await getWorker();
  const result = await worker.recognize(image);
  return { text: result.data.text ?? '', engine: 'tesseract.js' };
}

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    const base = import.meta.env.BASE_URL;
    workerPromise = createWorker('eng', 1, {
      workerPath: `${base}tesseract/worker.min.js`,
      corePath: `${base}tesseract/tesseract-core-simd-lstm.wasm.js`,
      langPath: `${base}tessdata`,
      gzip: true,
      workerBlobURL: true,
    });
  }
  return workerPromise;
}
