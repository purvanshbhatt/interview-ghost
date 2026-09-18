import { Audio } from 'expo-av';
import { Platform } from 'react-native';

export interface AudioCaptureCallbacks {
  onSpeechDetected?: () => void;
  onSegment?: (uri: string) => void;
  onError?: (error: Error) => void;
}

/** Length of each recorded chunk fed to STT, in seconds. */
const SEGMENT_SECONDS = 12;

export class MobileAudioCapture {
  private static globalLock: Promise<void> = Promise.resolve();
  private recording: Audio.Recording | null = null;
  private isCapturing = false;
  private segmentLoopRunning = false;
  private segmentTimeout: ReturnType<typeof setTimeout> | null = null;
  private segmentResolve: (() => void) | null = null;
  private isStopping = false;

  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  private async prepareAndStart(): Promise<Audio.Recording> {
    // Wait for any prior teardown across any instance to fully finish
    await MobileAudioCapture.globalLock;

    try {
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      return recording;
    } catch (err: any) {
      // If a stale native recorder exists from an unexpected interruption, attempt reset
      try {
        const dummy = new Audio.Recording();
        await dummy.stopAndUnloadAsync().catch(() => {});
      } catch {}

      // Fallback: direct prepare using universal high quality preset
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      return recording;
    }
  }

  /** Continuous capture (no segmentation). Returns success. */
  async start(callbacks?: AudioCaptureCallbacks): Promise<boolean> {
    if (this.isCapturing) return true;

    try {
      const granted = await this.requestPermissions();
      if (!granted) {
        throw new Error('Microphone permission not granted.');
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      this.recording = await this.prepareAndStart();
      this.isCapturing = true;
      return true;
    } catch (err: any) {
      this.isCapturing = false;
      this.recording = null;
      callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)));
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

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (err: any) {
      callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)));
      return false;
    }

    this.segmentLoopRunning = true;
    this.isStopping = false;

    const runLoop = async () => {
      while (this.segmentLoopRunning && !this.isStopping) {
        try {
          const recording = await this.prepareAndStart();
          this.recording = recording;
          this.isCapturing = true;

          await new Promise<void>((resolve) => {
            this.segmentResolve = resolve;
            this.segmentTimeout = setTimeout(() => {
              this.segmentResolve = null;
              resolve();
            }, SEGMENT_SECONDS * 1000);
          });

          if (!this.segmentLoopRunning || this.isStopping) {
            return;
          }

          await recording.stopAndUnloadAsync();
          this.recording = null;
          const uri = recording.getURI();
          if (uri) callbacks?.onSegment?.(uri);

          // Brief settle pause between segments so Android audio HAL resets cleanly
          if (Platform.OS === 'android') {
            await new Promise((r) => setTimeout(r, 150));
          }
        } catch (err: any) {
          this.recording = null;
          this.isCapturing = false;
          if (!this.segmentLoopRunning || this.isStopping) return;
          callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)));
          // Back off briefly before retrying so a hard failure doesn't spin
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    };

    runLoop().catch((err) => {
      callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)));
    });
    return true;
  }

  async stop(): Promise<string | null> {
    this.isStopping = true;
    this.segmentLoopRunning = false;

    if (this.segmentTimeout) {
      clearTimeout(this.segmentTimeout);
      this.segmentTimeout = null;
    }
    if (this.segmentResolve) {
      this.segmentResolve();
      this.segmentResolve = null;
    }

    let uri: string | null = null;
    const currentRec = this.recording;
    this.recording = null;
    this.isCapturing = false;

    // Acquire global lock during teardown to prevent concurrent starts
    let unlock: () => void = () => {};
    MobileAudioCapture.globalLock = new Promise<void>((resolve) => {
      unlock = resolve;
    });

    try {
      if (currentRec) {
        try {
          await currentRec.stopAndUnloadAsync();
          uri = currentRec.getURI();
        } catch {
          // Ignore already unloaded
        }
      }

      // Reset audio mode to prevent holding Android microphone focus
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      } catch {}

      // Safe settle buffer on Android for MediaRecorder hardware release
      if (Platform.OS === 'android') {
        await new Promise((r) => setTimeout(r, 300));
      }
    } finally {
      this.isStopping = false;
      unlock();
    }

    return uri;
  }

  isActive(): boolean {
    return this.isCapturing || this.segmentLoopRunning;
  }
}

