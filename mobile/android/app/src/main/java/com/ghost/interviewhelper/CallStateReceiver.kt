package com.ghost.interviewhelper

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import android.util.Log

class CallStateReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "CallStateReceiver"
        var listener: ((state: String, incomingNumber: String?) -> Unit)? = null
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == TelephonyManager.ACTION_PHONE_STATE_CHANGED) {
            val stateStr = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
            val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
            Log.d(TAG, "Phone state changed: $stateStr, number: $incomingNumber")

            val normalizedState = when (stateStr) {
                TelephonyManager.EXTRA_STATE_RINGING -> "RINGING"
                TelephonyManager.EXTRA_STATE_OFFHOOK -> "OFFHOOK"
                TelephonyManager.EXTRA_STATE_IDLE -> "IDLE"
                else -> stateStr
            }

            listener?.invoke(normalizedState, incomingNumber)
            CallHelperModule.emitCallState(normalizedState, incomingNumber)
        }
    }
}
