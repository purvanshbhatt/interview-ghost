import { Audio } from 'expo-av';

export interface AudioCaptureCallbacks {
  onSpeechDetected?: () => void;
  onSegment?: (uri: string) => void;
  onError?: (error: Error) => void;
}

/** Length of each recorded chunk fed to STT, in seconds. */
const SEGMENT_SECONDS = 12;

export class MobileAudioCapture {
  private recording: Audio.Recording | null = null;
  private isCapturing = false;
  private segmentLoopRunning = false;
  private segmentTimeout: ReturnType<typeof setTimeout> | null = null;

  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  private async prepareAndStart(): Promise<Audio.Recording> {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      android: {
        extension: '.m4a',
        outputFormat: Audio.AndroidOutputFormat.MPEG_4,
        audioEncoder: Audio.AndroidAudioEncoder.AAC,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 64000,
      },
      ios: {
        extension: '.m4a',
        audioQuality: Audio.IOSAudioQuality.HIGH,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 64000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: {
        mimeType: 'audio/webm',
        bitsPerSecond: 64000,
      },
    });
    await recording.startAsync();
    return recording;
  }

  /** Continuous capture (no segmentation). Returns success. */
  async start(callbacks?: AudioCaptureCallbacks): Promise<boolean> {
    if (this.isCapturing) return true;

    try {
      const granted = await this.requestPermissions();
      if (!granted) {
        throw new Error('Microphone permission not granted.');
      }

      this.recording = await this.prepareAndStart();
      this.isCapturing = true;
      return true;
    } catch (err: any) {
      this.isCapturing = false;
      this.recording = null;
      callbacks?.onError?.(err);
      return false;
    }
  }

  /**
   * Segmented capture loop: records SEGMENT_SECONDS chunks, hands each
   * completed chunk to onSegment, and immediately starts the next one until
   * stop() is called. This is what feeds live transcription.
   */
  async startSegmented(callbacks?: AudioCaptureCallbacks): Promise<boolean> {
    if (this.segmentLoopRunning) return true;

    try {
      const granted = await this.requestPermissions();
      if (!granted) {
        throw new Error('Microphone permission not granted.');
      }
    } catch (err: any) {
      callbacks?.onError?.(err);
      return false;
    }

    this.segmentLoopRunning = true;

    const runLoop = async () => {
      while (this.segmentLoopRunning) {
        try {
          const recording = await this.prepareAndStart();
          this.recording = recording;
          this.isCapturing = true;

          await new Promise<void>((resolve) => {
            this.segmentTimeout = setTimeout(resolve, SEGMENT_SECONDS * 1000);
          });

          if (!this.segmentLoopRunning) {
            // stop() already handled unloading
            return;
          }

          await recording.stopAndUnloadAsync();
          this.recording = null;
          const uri = recording.getURI();
          if (uri) callbacks?.onSegment?.(uri);
        } catch (err: any) {
          this.recording = null;
          this.isCapturing = false;
          if (!this.segmentLoopRunning) return;
          callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)));
          // Back off briefly before retrying so a hard failure doesn't spin
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    };

    // Fire and forget; lifecycle is controlled via stop()
    runLoop();
    return true;
  }

  async stop(): Promise<string | null> {
    this.segmentLoopRunning = false;
    if (this.segmentTimeout) {
      clearTimeout(this.segmentTimeout);
      this.segmentTimeout = null;
    }
    if (!this.recording) {
      this.isCapturing = false;
      return null;
    }

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.recording = null;
      this.isCapturing = false;
      return uri;
    } catch {
      this.recording = null;
      this.isCapturing = false;
      return null;
    }
  }

  isActive(): boolean {
    return this.isCapturing || this.segmentLoopRunning;
  }
}
