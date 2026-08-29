// AudioWorklet processor — runs off the main thread for low-latency audio capture.
// Replaces the deprecated ScriptProcessor. Receives Float32 audio, converts to Int16 PCM,
// and sends to the main thread via MessagePort.

class CueAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 4096; // accumulate before sending (matches old ScriptProcessor)
    this._buffer = new Float32Array(this._bufferSize);
    this._writeIndex = 0;
  }

  process(inputs, _outputs, _parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono
    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._writeIndex++] = channelData[i];
      if (this._writeIndex >= this._bufferSize) {
        this._flush();
      }
    }
    return true;
  }

  _flush() {
    // Convert Float32 [-1,1] to Int16 PCM
    const pcm = new Int16Array(this._writeIndex);
    for (let i = 0; i < this._writeIndex; i++) {
      const s = Math.max(-1, Math.min(1, this._buffer[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    this._buffer = new Float32Array(this._bufferSize);
    this._writeIndex = 0;
  }
}

registerProcessor('cue-audio-processor', CueAudioProcessor);
