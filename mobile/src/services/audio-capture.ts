import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { CallHelper } from './call-helper';
import { ModeId } from '../types';

export interface AudioCaptureCallbacks {
  onSpeechDetected?: () => void;
  onSegment?: (uri: string) => void;
  onError?: (error: Error) => void;
  onAudioLevel?: (level: number, db: number) => void;
}

export interface AudioCaptureOptions {
  mode?: ModeId;
  enableSpeaker?: boolean;
  showOverlay?: boolean;
}

/** Length of each recorded chunk fed to STT, in seconds. Fast 4s for rapid live transcription. */
const SEGMENT_SECONDS = 4;

const RECORDING_OPTIONS: any = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: 2, // MPEG_4
    audioEncoder: 3, // AAC
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: 'aac ',
    audioQuality: 127,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

export class MobileAudioCapture {
  private static globalLock: Promise<void> = Promise.resolve();
  private static activeRecording: Audio.Recording | null = null;

  private recording: Audio.Recording | null = null;
  private isCapturing = false;
  private segmentLoopRunning = false;
  private segmentTimeout: ReturnType<typeof setTimeout> | null = null;
  private segmentResolve: (() => void) | null = null;
  private isStopping = false;

  async requestPermissions(): Promise<boolean> {
    try {
      const resp = await Audio.getPermissionsAsync();
      if (resp.granted || resp.status === 'granted') {
        return true;
      }
      const req = await Audio.requestPermissionsAsync();
      return req.granted || req.status === 'granted';
    } catch {
      return false;
    }
  }

  private async configureAudioMode(isRecording: boolean): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: isRecording,
        interruptionModeIOS: ((Audio as any).InterruptionModeIOS?.MixWithOthers ?? 0),
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeAndroid: ((Audio as any).InterruptionModeAndroid?.DuckOthers ?? 2),
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    } catch (e: any) {
      console.warn('[AudioCapture] setAudioModeAsync notice:', e?.message || e);
    }
  }

  private async prepareAndStart(callbacks?: AudioCaptureCallbacks): Promise<Audio.Recording> {
    // Wait for any prior teardown across any instance to fully finish
    await MobileAudioCapture.globalLock;

    // Safety: ensure any previous active recording is completely stopped and deallocated
    const prior = MobileAudioCapture.activeRecording || this.recording;
    if (prior) {
      try {
        const st = await prior.getStatusAsync().catch(() => null);
        if (st && st.canRecord) {
          await prior.stopAndUnloadAsync().catch(() => {});
        }
      } catch {}
      MobileAudioCapture.activeRecording = null;
      this.recording = null;
      await new Promise((r) => setTimeout(r, 120));
    }

    const onStatus = (status: Audio.RecordingStatus) => {
      if (status.isRecording && typeof status.metering === 'number') {
        const normalized = Math.max(0, Math.min(1, (status.metering + 55) / 50));
        callbacks?.onAudioLevel?.(normalized, status.metering);
        if (normalized > 0.12) {
          callbacks?.onSpeechDetected?.();
        }
      }
    };

    const { recording } = await Audio.Recording.createAsync(
      RECORDING_OPTIONS,
      onStatus,
      100 // High-frequency 10Hz metering update for responsive visualizer waveform
    );

    this.recording = recording;
    MobileAudioCapture.activeRecording = recording;
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

      await this.configureAudioMode(true);

      this.recording = await this.prepareAndStart(callbacks);
      this.isCapturing = true;
      return true;
    } catch (err: any) {
      this.isCapturing = false;
      this.recording = null;
      MobileAudioCapture.activeRecording = null;
      callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  /**
   * Segmented capture loop: records SEGMENT_SECONDS chunks, hands each
   * completed chunk to onSegment, and immediately starts the next one until
   * stop() is called. This is what feeds live transcription.
   */
  async startSegmented(
    callbacks?: AudioCaptureCallbacks,
    options?: AudioCaptureOptions
  ): Promise<boolean> {
    if (this.segmentLoopRunning) return true;

    try {
      const granted = await this.requestPermissions();
      if (!granted) {
        throw new Error('Microphone permission not granted.');
      }

      await this.configureAudioMode(true);

      if (Platform.OS === 'android') {
        await CallHelper.startCallService(
          options?.mode || 'phoneCall',
          options?.enableSpeaker ?? false,
          options?.showOverlay ?? true
        );
      }
    } catch (err: any) {
      callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)));
      return false;
    }

    this.segmentLoopRunning = true;
    this.isStopping = false;

    const runLoop = async () => {
      while (this.segmentLoopRunning && !this.isStopping) {
        try {
          const recording = await this.prepareAndStart(callbacks);
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

          let uri: string | null = null;
          try {
            const st = await recording.getStatusAsync().catch(() => null);
            if (st && st.canRecord) {
              await recording.stopAndUnloadAsync();
              uri = recording.getURI();
            } else {
              uri = recording.getURI();
            }
          } catch {
            uri = recording.getURI();
          }

          this.recording = null;
          MobileAudioCapture.activeRecording = null;
          this.isCapturing = false;

          if (uri) callbacks?.onSegment?.(uri);

          // Brief settle pause between segments so Android audio HAL resets cleanly
          if (Platform.OS === 'android') {
            await new Promise((r) => setTimeout(r, 200));
          }
        } catch (err: any) {
          this.recording = null;
          MobileAudioCapture.activeRecording = null;
          this.isCapturing = false;
          if (!this.segmentLoopRunning || this.isStopping) return;
          callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)));
          // Back off briefly before retrying so a hard failure doesn't spin
          await new Promise((r) => setTimeout(r, 1200));
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
    const currentRec = this.recording || MobileAudioCapture.activeRecording;
    this.recording = null;
    MobileAudioCapture.activeRecording = null;
    this.isCapturing = false;

    // Acquire global lock during teardown to prevent concurrent starts
    let unlock: () => void = () => {};
    MobileAudioCapture.globalLock = new Promise<void>((resolve) => {
      unlock = resolve;
    });

    try {
      if (currentRec) {
        try {
          const st = await currentRec.getStatusAsync().catch(() => null);
          if (st && st.canRecord) {
            await currentRec.stopAndUnloadAsync();
            uri = currentRec.getURI();
          } else {
            uri = currentRec.getURI();
          }
        } catch {
          // Ignore already unloaded
        }
      }

      // Reset audio mode to prevent holding microphone focus
      await this.configureAudioMode(false);

      if (Platform.OS === 'android') {
        await CallHelper.stopCallService();
        await new Promise((r) => setTimeout(r, 200));
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
