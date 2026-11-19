export class BenchRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private chunks: Float32Array[] = [];
  sampleRate = 48_000;

  async start(onFrame: (frame: Float32Array, sampleRate: number) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not expose the microphone.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) throw new Error('This browser cannot record audio.');
    this.context = new Context();
    await this.context.resume();
    this.sampleRate = this.context.sampleRate;
    await this.context.audioWorklet.addModule(`${import.meta.env.BASE_URL}capture-processor.js`);
    this.source = this.context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.context, 'capture-processor');
    this.chunks = [];
    this.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const frame = event.data instanceof Float32Array ? event.data : new Float32Array(event.data);
      this.chunks.push(frame);
      onFrame(frame, this.sampleRate);
    };
    const silent = this.context.createGain();
    silent.gain.value = 0;
    this.source.connect(this.node);
    this.node.connect(silent);
    silent.connect(this.context.destination);
  }

  takeSamples(): { samples: Float32Array; sampleRate: number } {
    const length = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    return { samples, sampleRate: this.sampleRate };
  }

  async stop(): Promise<void> {
    this.node?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    await this.context?.close().catch(() => undefined);
    this.node = null;
    this.source = null;
    this.stream = null;
    this.context = null;
  }
}
