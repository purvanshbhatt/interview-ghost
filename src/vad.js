// Voice Activity Detection (VAD) — Adaptive energy-based VAD with speech state machine.
// This is a lightweight VAD that runs in the main process on the PCM buffers.
// It provides much better segmentation than a simple RMS gate by tracking
// speech onset, continuation, and offset with hysteresis.
//
// For the renderer side, we integrate @ricky0123/vad-web (Silero VAD via ONNX)
// which is the gold standard for browser-based VAD. This file handles the
// server/main-process side.

class AdaptiveVAD {
  constructor(options = {}) {
    // Configurable thresholds
    this.sampleRate = options.sampleRate || 16000;
    this.frameDurationMs = options.frameDurationMs || 30; // 30ms frames
    this.frameSize = Math.floor(this.sampleRate * this.frameDurationMs / 1000);

    // Energy thresholds with hysteresis
    this.onsetThreshold = options.onsetThreshold || 250;   // RMS to trigger speech start
    this.offsetThreshold = options.offsetThreshold || 150;  // RMS to trigger speech end (lower = hysteresis)
    this.silenceFrames = options.silenceFrames || 15;       // frames of silence before end (~450ms)
    this.minSpeechFrames = options.minSpeechFrames || 4;   // minimum frames to count as speech (~120ms)

    // Adaptive noise floor
    this.noiseFloor = 80;
    this.noiseAdaptRate = 0.02;    // how fast noise floor adapts
    this.noiseMaxAdapt = 400;      // don't adapt above this

    // State machine
    this.state = 'silence'; // 'silence' | 'speech' | 'trailing'
    this.speechFrameCount = 0;
    this.silenceFrameCount = 0;
    this.totalSpeechFrames = 0;

    // Callbacks
    this.onSpeechStart = options.onSpeechStart || (() => {});
    this.onSpeechEnd = options.onSpeechEnd || (() => {});
    this.onVADState = options.onVADState || (() => {});
  }

  // Process a chunk of Int16 PCM audio
  processChunk(pcmBuffer) {
    const samples = pcmBuffer.length / 2;
    let offset = 0;

    while (offset + this.frameSize * 2 <= pcmBuffer.length) {
      const frame = pcmBuffer.slice(offset, offset + this.frameSize * 2);
      const energy = this._computeRMS(frame);
      this._processFrame(energy);
      offset += this.frameSize * 2;
    }
  }

  _computeRMS(frame) {
    let sum = 0;
    const n = frame.length / 2;
    for (let i = 0; i < frame.length; i += 2) {
      const s = frame.readInt16LE(i);
      sum += s * s;
    }
    return Math.sqrt(sum / n);
  }

  _processFrame(energy) {
    // Adapt noise floor during silence
    if (this.state === 'silence') {
      if (energy < this.noiseMaxAdapt) {
        this.noiseFloor = this.noiseFloor * (1 - this.noiseAdaptRate) + energy * this.noiseAdaptRate;
      }
    }

    // Dynamic thresholds based on noise floor
    const dynamicOnset = Math.max(this.onsetThreshold, this.noiseFloor * 2.5);
    const dynamicOffset = Math.max(this.offsetThreshold, this.noiseFloor * 1.5);

    const isSpeech = energy > dynamicOnset;
    const isSilence = energy < dynamicOffset;

    switch (this.state) {
      case 'silence':
        if (isSpeech) {
          this.speechFrameCount = 1;
          this.state = 'speech';
          this.onSpeechStart();
          this.onVADState('speech');
        }
        break;

      case 'speech':
        if (isSpeech) {
          this.speechFrameCount++;
          this.totalSpeechFrames++;
        } else if (isSilence) {
          this.silenceFrameCount = 1;
          this.state = 'trailing';
        }
        break;

      case 'trailing':
        if (isSpeech) {
          // Speech resumed — reset silence counter
          this.silenceFrameCount = 0;
          this.speechFrameCount++;
          this.state = 'speech';
        } else {
          this.silenceFrameCount++;
          if (this.silenceFrameCount >= this.silenceFrames) {
            // Confirmed end of speech
            const wasSpeech = this.speechFrameCount >= this.minSpeechFrames;
            if (wasSpeech) {
              this.onSpeechEnd(this.speechFrameCount * this.frameDurationMs);
            }
            this.state = 'silence';
            this.speechFrameCount = 0;
            this.silenceFrameCount = 0;
            this.onVADState('silence');
          }
        }
        break;
    }
  }

  // Get current state info
  getState() {
    return {
      state: this.state,
      isSpeaking: this.state !== 'silence',
      noiseFloor: Math.round(this.noiseFloor),
      speechDurationMs: this.speechFrameCount * this.frameDurationMs
    };
  }

  reset() {
    this.state = 'silence';
    this.speechFrameCount = 0;
    this.silenceFrameCount = 0;
    this.totalSpeechFrames = 0;
    this.noiseFloor = 80;
  }
}

// Ring buffer for keeping pre-speech audio (so we don't lose the first word)
class AudioRingBuffer {
  constructor(durationMs, sampleRate = 16000) {
    this.capacity = Math.floor(sampleRate * 2 * durationMs / 1000); // bytes
    this.buffer = Buffer.alloc(this.capacity);
    this.writePos = 0;
    this.filled = false;
  }

  write(pcm) {
    if (pcm.length >= this.capacity) {
      pcm.copy(this.buffer, 0, pcm.length - this.capacity);
      this.writePos = 0;
      this.filled = true;
      return;
    }
    const space = this.capacity - this.writePos;
    if (pcm.length <= space) {
      pcm.copy(this.buffer, this.writePos);
      this.writePos += pcm.length;
    } else {
      pcm.copy(this.buffer, this.writePos, 0, space);
      pcm.copy(this.buffer, 0, space);
      this.writePos = pcm.length - space;
      this.filled = true;
    }
  }

  // Get all buffered audio in order
  read() {
    if (!this.filled) return this.buffer.slice(0, this.writePos);
    return Buffer.concat([
      this.buffer.slice(this.writePos),
      this.buffer.slice(0, this.writePos)
    ]);
  }

  clear() {
    this.writePos = 0;
    this.filled = false;
  }
}

module.exports = { AdaptiveVAD, AudioRingBuffer };
