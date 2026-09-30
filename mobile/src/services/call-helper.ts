import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { ModeId } from '../types';

const { CallHelperModule } = NativeModules;

export interface CallStatePayload {
  state: 'RINGING' | 'OFFHOOK' | 'IDLE' | 'UNKNOWN';
  incomingNumber?: string;
}

export interface OverlayActionPayload {
  mode: ModeId;
}

class CallHelperService {
  private emitter: NativeEventEmitter | null = null;

  constructor() {
    if (Platform.OS === 'android' && CallHelperModule) {
      this.emitter = new NativeEventEmitter(CallHelperModule);
    }
  }

  async startCallService(
    mode: ModeId = 'phoneCall',
    enableSpeaker = false,
    showOverlay = true
  ): Promise<boolean> {
    if (Platform.OS !== 'android' || !CallHelperModule) return false;
    try {
      return await CallHelperModule.startCallService(mode, enableSpeaker, showOverlay);
    } catch (e) {
      console.warn('[CallHelper] startCallService failed:', e);
      return false;
    }
  }

  async stopCallService(): Promise<boolean> {
    if (Platform.OS !== 'android' || !CallHelperModule) return false;
    try {
      return await CallHelperModule.stopCallService();
    } catch (e) {
      console.warn('[CallHelper] stopCallService failed:', e);
      return false;
    }
  }

  updateFloatingOverlay(text: string, isListening: boolean, mode: ModeId): void {
    if (Platform.OS !== 'android' || !CallHelperModule) return;
    try {
      CallHelperModule.updateOverlay(text, isListening, mode);
    } catch (e) {
      console.warn('[CallHelper] updateOverlay failed:', e);
    }
  }

  async setSpeakerphone(enable: boolean): Promise<boolean> {
    if (Platform.OS !== 'android' || !CallHelperModule) return false;
    try {
      return await CallHelperModule.setSpeakerphone(enable);
    } catch (e) {
      console.warn('[CallHelper] setSpeakerphone failed:', e);
      return false;
    }
  }

  async setCommunicationMode(enable: boolean): Promise<boolean> {
    if (Platform.OS !== 'android' || !CallHelperModule) return false;
    try {
      return await CallHelperModule.setCommunicationMode(enable);
    } catch (e) {
      console.warn('[CallHelper] setCommunicationMode failed:', e);
      return false;
    }
  }

  async canDrawOverlays(): Promise<boolean> {
    if (Platform.OS !== 'android' || !CallHelperModule) return true;
    try {
      return await CallHelperModule.canDrawOverlays();
    } catch {
      return false;
    }
  }

  requestOverlayPermission(): void {
    if (Platform.OS !== 'android' || !CallHelperModule) return;
    try {
      CallHelperModule.requestOverlayPermission();
    } catch (e) {
      console.warn('[CallHelper] requestOverlayPermission failed:', e);
    }
  }

  async hasNotificationPermission(): Promise<boolean> {
    if (Platform.OS !== 'android' || !CallHelperModule) return true;
    try {
      return await CallHelperModule.hasNotificationPermission();
    } catch {
      return true;
    }
  }

  requestNotificationPermission(): void {
    if (Platform.OS !== 'android' || !CallHelperModule) return;
    try {
      CallHelperModule.requestNotificationPermission();
    } catch (e) {
      console.warn('[CallHelper] requestNotificationPermission failed:', e);
    }
  }

  async getCallState(): Promise<'RINGING' | 'OFFHOOK' | 'IDLE' | 'UNKNOWN'> {
    if (Platform.OS !== 'android' || !CallHelperModule) return 'IDLE';
    try {
      return await CallHelperModule.getCallState();
    } catch {
      return 'IDLE';
    }
  }

  async copyToClipboard(text: string): Promise<boolean> {
    if (Platform.OS === 'android' && CallHelperModule?.copyToClipboard) {
      try {
        return await CallHelperModule.copyToClipboard(text);
      } catch (e) {
        console.warn('[CallHelper] copyToClipboard failed:', e);
      }
    }
    return false;
  }

  addCallStateListener(listener: (payload: CallStatePayload) => void) {
    if (!this.emitter) return { remove: () => {} };
    const subscription = this.emitter.addListener('onCallStateChanged', listener);
    return subscription;
  }

  addOverlayActionListener(listener: (payload: OverlayActionPayload) => void) {
    if (!this.emitter) return { remove: () => {} };
    const subscription = this.emitter.addListener('onFloatingOverlayAction', listener);
    return subscription;
  }
}

export const CallHelper = new CallHelperService();
