import { createWriteStream, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

const ortDir = join(publicDir, 'ort');
mkdirSync(ortDir, { recursive: true });
const ortDist = join(root, 'node_modules', 'onnxruntime-web', 'dist');
for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  copy(join(ortDist, name), join(ortDir, name));
}

const tessDir = join(publicDir, 'tesseract');
mkdirSync(tessDir, { recursive: true });
copy(join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'), join(tessDir, 'worker.min.js'));
const core = join(root, 'node_modules', 'tesseract.js-core');
copy(join(core, 'tesseract-core-simd-lstm.wasm.js'), join(tessDir, 'tesseract-core-simd-lstm.wasm.js'));
copy(join(core, 'tesseract-core-simd-lstm.wasm'), join(tessDir, 'tesseract-core-simd-lstm.wasm'));

const trained = join(publicDir, 'tessdata', 'eng.traineddata.gz');
if (!existsSync(trained) || statSync(trained).size < 1000) {
  mkdirSync(dirname(trained), { recursive: true });
  const response = await fetch('https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/eng.traineddata.gz');
  if (!response.ok) throw new Error(`Could not download English OCR data (${response.status}).`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(trained));
}
