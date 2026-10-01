package com.ghost.interviewhelper

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class CallHelperModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "CallHelperModule"
        private const val TAG = "CallHelperModule"
        private var instance: CallHelperModule? = null

        fun emitCallState(state: String, incomingNumber: String?) {
            val reactCtx = instance?.reactApplicationContext ?: return
            if (!reactCtx.hasActiveReactInstance()) return

            val params = Arguments.createMap().apply {
                putString("state", state)
                if (incomingNumber != null) {
                    putString("incomingNumber", incomingNumber)
                }
            }

            try {
                reactCtx
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onCallStateChanged", params)
            } catch (e: Exception) {
                Log.e(TAG, "Error emitting onCallStateChanged: ${e.message}")
            }
        }

        fun emitOverlayAction(mode: String) {
            val reactCtx = instance?.reactApplicationContext ?: return
            if (!reactCtx.hasActiveReactInstance()) return

            val params = Arguments.createMap().apply {
                putString("mode", mode)
            }

            try {
                reactCtx
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onFloatingOverlayAction", params)
            } catch (e: Exception) {
                Log.e(TAG, "Error emitting onFloatingOverlayAction: ${e.message}")
            }
        }
    }

    init {
        instance = this
    }

    override fun getName(): String = NAME

    private val audioManager: AudioManager by lazy {
        reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

    private val telephonyManager: TelephonyManager by lazy {
        reactApplicationContext.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    }

    @ReactMethod
    fun startCallService(mode: String, enableSpeaker: Boolean, showOverlay: Boolean, promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, CallForegroundService::class.java).apply {
                action = CallForegroundService.ACTION_START
                putExtra(CallForegroundService.EXTRA_MODE, mode)
                putExtra(CallForegroundService.EXTRA_ENABLE_SPEAKERPHONE, enableSpeaker)
                putExtra(CallForegroundService.EXTRA_SHOW_OVERLAY, showOverlay)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start call foreground service: ${e.message}", e)
            promise.reject("CALL_SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopCallService(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, CallForegroundService::class.java).apply {
                action = CallForegroundService.ACTION_STOP
            }
            reactApplicationContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop call foreground service: ${e.message}", e)
            promise.reject("CALL_SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun updateOverlay(text: String, isListening: Boolean, mode: String) {
        try {
            val intent = Intent(reactApplicationContext, CallForegroundService::class.java).apply {
                action = CallForegroundService.ACTION_UPDATE_OVERLAY
                putExtra(CallForegroundService.EXTRA_ANSWER_TEXT, text)
                putExtra(CallForegroundService.EXTRA_IS_LISTENING, isListening)
                putExtra(CallForegroundService.EXTRA_MODE, mode)
            }
            reactApplicationContext.startService(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update overlay: ${e.message}")
        }
    }

    @ReactMethod
    fun setSpeakerphone(enable: Boolean, promise: Promise) {
        try {
            if (enable) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val speaker = audioManager.availableCommunicationDevices.firstOrNull {
                        it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                    }
                    if (speaker != null) {
                        audioManager.setCommunicationDevice(speaker)
                    }
                }
                @Suppress("DEPRECATION")
                audioManager.isSpeakerphoneOn = true
            } else {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    audioManager.clearCommunicationDevice()
                }
                @Suppress("DEPRECATION")
                audioManager.isSpeakerphoneOn = false
            }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error toggling speakerphone: ${e.message}", e)
            promise.reject("SPEAKERPHONE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setCommunicationMode(enable: Boolean, promise: Promise) {
        try {
            audioManager.mode = if (enable) AudioManager.MODE_IN_COMMUNICATION else AudioManager.MODE_NORMAL
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error setting communication mode: ${e.message}", e)
            promise.reject("COMMUNICATION_MODE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun canDrawOverlays(promise: Promise) {
        val canDraw = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(reactApplicationContext)
        } else {
            true
        }
        promise.resolve(canDraw)
    }

    @ReactMethod
    fun requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(reactApplicationContext)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${reactApplicationContext.packageName}")
                ).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactApplicationContext.startActivity(intent)
            }
        }
    }

    @ReactMethod
    fun hasNotificationPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                reactApplicationContext,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            promise.resolve(granted)
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val activity = currentActivity
            activity?.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 101)
        }
    }

    @ReactMethod
    fun getCallState(promise: Promise) {
        try {
            val stateInt = telephonyManager.callState
            val stateStr = when (stateInt) {
                TelephonyManager.CALL_STATE_RINGING -> "RINGING"
                TelephonyManager.CALL_STATE_OFFHOOK -> "OFFHOOK"
                TelephonyManager.CALL_STATE_IDLE -> "IDLE"
                else -> "UNKNOWN"
            }
            promise.resolve(stateStr)
        } catch (e: Exception) {
            promise.resolve("IDLE")
        }
    }

    @ReactMethod
    fun copyToClipboard(text: String, promise: Promise) {
        try {
            val clipboard = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            val clip = android.content.ClipData.newPlainText("Ghost Transcript", text)
            clipboard.setPrimaryClip(clip)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLIPBOARD_ERROR", e.message)
        }
    }

    // Required for React Native event emitter listener registration
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
