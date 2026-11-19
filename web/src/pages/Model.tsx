import { useEffect, useState } from 'react';
import { WHISPER_MODEL, downloadWhisperModel } from '../speech/whisperWeb';
import { useNotebook } from '../notebook';
import { go } from '../route';

export function ModelPage() {
  const db = useNotebook();
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('The tiny English model stays in this browser. Nothing downloads until you tap the button.');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void db.getSetting('whisperReady').then((value) => setReady(value === '1'));
  }, [db]);

  async function download() {
    setBusy(true);
    try {
      await downloadWhisperModel(true, setMessage);
      await db.setSetting('whisperReady', '1');
      setReady(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The model download failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <button type="button" className="ink" onClick={() => go({ name: 'home' })}>Sessions</button>
      <h1>Speech model</h1>
      <p className={`banner ${ready ? 'info' : 'warn'}`}>{ready ? 'Tiny English model is marked ready in this browser.' : 'No model downloaded yet.'}</p>
      <p>{message}</p>
      <p>Model: {WHISPER_MODEL}, quantized (q8), run with WebAssembly in one thread so iPhone Safari does not need special headers. The ONNX runtime is part of this app. Only the model weights come from Hugging Face, and only after this tap.</p>
      <button type="button" disabled={busy} onClick={() => void download()}>{busy ? 'Downloading…' : 'Download tiny English model'}</button>
      <button type="button" className="danger" disabled={!ready || busy} onClick={() => {
        void db.setSetting('whisperReady', '0').then(() => {
          setReady(false);
          setMessage('Marked unused. Cached weights remain until you clear this site’s data. Transcription will ask you to download again.');
        });
      }}>Forget model</button>
    </main>
  );
}
