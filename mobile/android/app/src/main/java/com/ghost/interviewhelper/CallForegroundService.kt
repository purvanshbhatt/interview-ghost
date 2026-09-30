package com.ghost.interviewhelper

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.DisplayMetrics
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.NotificationCompat

class CallForegroundService : Service() {

    companion object {
        const val TAG = "CallForegroundService"
        const val CHANNEL_ID = "ghost_call_service_channel"
        const val NOTIFICATION_ID = 4040

        const val ACTION_START = "com.ghost.interviewhelper.START_CALL_SERVICE"
        const val ACTION_STOP = "com.ghost.interviewhelper.STOP_CALL_SERVICE"
        const val ACTION_UPDATE_OVERLAY = "com.ghost.interviewhelper.UPDATE_OVERLAY"
        const val ACTION_SET_SPEAKERPHONE = "com.ghost.interviewhelper.SET_SPEAKERPHONE"

        const val EXTRA_MODE = "extra_mode"
        const val EXTRA_ANSWER_TEXT = "extra_answer_text"
        const val EXTRA_IS_LISTENING = "extra_is_listening"
        const val EXTRA_ENABLE_SPEAKERPHONE = "extra_enable_speakerphone"
        const val EXTRA_SHOW_OVERLAY = "extra_show_overlay"

        var isRunning = false
            private set
    }

    private var windowManager: WindowManager? = null
    private var overlayRootView: View? = null
    private var overlayParams: WindowManager.LayoutParams? = null

    private var audioManager: AudioManager? = null
    private var currentMode: String = "phoneCall"
    private var isMinimized = false

    private var overlayAnswerTv: TextView? = null
    private var overlayModeTv: TextView? = null
    private var overlayStatusDot: View? = null
    private var expandedContainer: LinearLayout? = null
    private var minimizedPill: LinearLayout? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        createNotificationChannel()
        isRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        when (action) {
            ACTION_STOP -> {
                stopCallService()
                return START_NOT_STICKY
            }
            ACTION_SET_SPEAKERPHONE -> {
                val enable = intent?.getBooleanExtra(EXTRA_ENABLE_SPEAKERPHONE, true) ?: true
                setSpeakerphone(enable)
            }
            ACTION_UPDATE_OVERLAY -> {
                val text = intent?.getStringExtra(EXTRA_ANSWER_TEXT) ?: ""
                val isListening = intent?.getBooleanExtra(EXTRA_IS_LISTENING, true) ?: true
                val mode = intent?.getStringExtra(EXTRA_MODE) ?: currentMode
                currentMode = mode
                updateOverlayContent(text, isListening, mode)
            }
            ACTION_START -> {
                currentMode = intent?.getStringExtra(EXTRA_MODE) ?: "phoneCall"
                val enableSpeaker = intent?.getBooleanExtra(EXTRA_ENABLE_SPEAKERPHONE, false) ?: false
                val showOverlay = intent?.getBooleanExtra(EXTRA_SHOW_OVERLAY, true) ?: true

                startForegroundServiceWithNotification()

                // Phone call audio optimizations
                setCommunicationMode(true)
                if (enableSpeaker) {
                    setSpeakerphone(true)
                }

                if (showOverlay && checkOverlayPermission()) {
                    showOverlayWindow()
                }
            }
        }

        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Ghost Call & Meeting Assistant",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps audio capture and AI coaching active during phone and meeting calls"
                enableLights(false)
                enableVibration(false)
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundServiceWithNotification() {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = if (launchIntent != null) {
            PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else null

        val stopIntent = Intent(this, CallForegroundService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val modeLabel = when (currentMode) {
            "phoneCall" -> "Phone Call Helper"
            "say" -> "Say Next"
            "assist" -> "Smart Assist"
            else -> "Copilot"
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Ghost Active ($modeLabel)")
            .setContentText("Listening and assisting live during call...")
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "End Copilot", stopPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start foreground service: ${e.message}", e)
        }
    }

    private fun setCommunicationMode(enable: Boolean) {
        try {
            audioManager?.mode = if (enable) AudioManager.MODE_IN_COMMUNICATION else AudioManager.MODE_NORMAL
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set audio mode: ${e.message}")
        }
    }

    private fun setSpeakerphone(enable: Boolean) {
        try {
            val am = audioManager ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (enable) {
                    val speaker = am.availableCommunicationDevices.firstOrNull {
                        it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                    }
                    if (speaker != null) {
                        am.setCommunicationDevice(speaker)
                    }
                } else {
                    am.clearCommunicationDevice()
                }
            }
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = enable
            Log.d(TAG, "Speakerphone set to $enable")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set speakerphone: ${e.message}")
        }
    }

    private fun checkOverlayPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(this)
        } else {
            true
        }
    }

    private fun dpToPx(dp: Float): Int {
        val metrics: DisplayMetrics = resources.displayMetrics
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp, metrics).toInt()
    }

    private fun showOverlayWindow() {
        if (overlayRootView != null) return

        try {
            windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

            val layoutFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            }

            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutFlag,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                        WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                x = dpToPx(16f)
                y = dpToPx(80f)
            }
            overlayParams = params

            val root = FrameLayout(this)

            // 1. Minimized Pill
            val pill = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dpToPx(12f), dpToPx(8f), dpToPx(14f), dpToPx(8f))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(24f).toFloat()
                    setColor(Color.parseColor("#1D1F24")) // M3 surfaceContainer
                    setStroke(dpToPx(1.5f), Color.parseColor("#A8C7FA")) // M3 primary
                }
                visibility = View.GONE
            }

            val pillDot = View(this).apply {
                layoutParams = LinearLayout.LayoutParams(dpToPx(8f), dpToPx(8f)).apply {
                    marginEnd = dpToPx(8f)
                }
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#4ADE80")) // Live green
                }
            }
            val pillText = TextView(this).apply {
                text = "Ghost Copilot ▾"
                setTextColor(Color.parseColor("#E2E2E9"))
                textSize = 12f
                typeface = Typeface.DEFAULT_BOLD
            }
            pill.addView(pillDot)
            pill.addView(pillText)
            minimizedPill = pill

            // 2. Expanded Card View (Material 3 style)
            val expanded = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = FrameLayout.LayoutParams(dpToPx(320f), FrameLayout.LayoutParams.WRAP_CONTENT)
                setPadding(dpToPx(14f), dpToPx(12f), dpToPx(14f), dpToPx(14f))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(20f).toFloat()
                    setColor(Color.parseColor("#1D1F24")) // M3 surfaceContainer
                    setStroke(dpToPx(1.5f), Color.parseColor("#44474F")) // M3 outlineVariant
                }
                elevation = dpToPx(8f).toFloat()
            }

            // Top Header: Live dot, Title, Mode chip, Minimize, Close
            val header = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dpToPx(8f)
                }
            }

            val statusDot = View(this).apply {
                layoutParams = LinearLayout.LayoutParams(dpToPx(9f), dpToPx(9f)).apply {
                    marginEnd = dpToPx(8f)
                }
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#4ADE80")) // live
                }
            }
            overlayStatusDot = statusDot

            val titleTv = TextView(this).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                text = "Ghost Call Copilot"
                setTextColor(Color.parseColor("#E2E2E9"))
                textSize = 13f
                typeface = Typeface.DEFAULT_BOLD
            }

            val modeChip = TextView(this).apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginEnd = dpToPx(8f)
                }
                text = currentMode.uppercase()
                setTextColor(Color.parseColor("#083063")) // onPrimary
                textSize = 10f
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dpToPx(8f), dpToPx(3f), dpToPx(8f), dpToPx(3f))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(12f).toFloat()
                    setColor(Color.parseColor("#A8C7FA")) // M3 primary
                }
            }
            overlayModeTv = modeChip

            val minBtn = TextView(this).apply {
                text = "—"
                setTextColor(Color.parseColor("#C4C6D0"))
                textSize = 14f
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dpToPx(6f), dpToPx(2f), dpToPx(6f), dpToPx(2f))
            }

            val closeBtn = TextView(this).apply {
                text = "✕"
                setTextColor(Color.parseColor("#C4C6D0"))
                textSize = 12f
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dpToPx(6f), dpToPx(2f), dpToPx(6f), dpToPx(2f))
            }

            header.addView(statusDot)
            header.addView(titleTv)
            header.addView(modeChip)
            header.addView(minBtn)
            header.addView(closeBtn)

            // Content Suggestion Box
            val answerBox = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dpToPx(10f)
                }
                setPadding(dpToPx(10f), dpToPx(8f), dpToPx(10f), dpToPx(8f))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dpToPx(12f).toFloat()
                    setColor(Color.parseColor("#23252B")) // surfaceContainerHigh
                    setStroke(dpToPx(1f), Color.parseColor("#1D4984")) // primaryContainer
                }
            }

            val scrollView = ScrollView(this).apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    dpToPx(90f)
                )
            }

            val answerTv = TextView(this).apply {
                text = "Listening for phone call conversation... Tap an action below to get an instant answer."
                setTextColor(Color.parseColor("#E2E2E9"))
                textSize = 12.5f
                setLineSpacing(dpToPx(2f).toFloat(), 1f)
            }
            overlayAnswerTv = answerTv
            scrollView.addView(answerTv)
            answerBox.addView(scrollView)

            // Quick Action Buttons Row (Material 3 pill buttons)
            val actionRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            }

            fun createPillButton(label: String, modeId: String, isPrimary: Boolean = false): TextView {
                return TextView(this).apply {
                    layoutParams = LinearLayout.LayoutParams(0, dpToPx(34f), 1f).apply {
                        marginEnd = dpToPx(4f)
                    }
                    text = label
                    gravity = Gravity.CENTER
                    textSize = 11.5f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(if (isPrimary) Color.parseColor("#083063") else Color.parseColor("#E2E2E9"))
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.RECTANGLE
                        cornerRadius = dpToPx(17f).toFloat()
                        setColor(if (isPrimary) Color.parseColor("#A8C7FA") else Color.parseColor("#282A30"))
                    }
                    setOnClickListener {
                        CallHelperModule.emitOverlayAction(modeId)
                    }
                }
            }

            actionRow.addView(createPillButton("Say", "say", true))
            actionRow.addView(createPillButton("Phone", "phoneCall"))
            actionRow.addView(createPillButton("Assist", "assist"))
            actionRow.addView(createPillButton("Recap", "recap"))

            expanded.addView(header)
            expanded.addView(answerBox)
            expanded.addView(actionRow)
            expandedContainer = expanded

            root.addView(expanded)
            root.addView(pill)

            // Minimize / Expand toggling
            minBtn.setOnClickListener {
                isMinimized = true
                expanded.visibility = View.GONE
                pill.visibility = View.VISIBLE
            }

            closeBtn.setOnClickListener {
                hideOverlayWindow()
            }

            val setupDrag = { targetView: View, isPill: Boolean ->
                var initialX = 0
                var initialY = 0
                var initialTouchX = 0f
                var initialTouchY = 0f
                var isMoving = false

                targetView.setOnTouchListener { _, event ->
                    val p = overlayParams ?: return@setOnTouchListener false
                    when (event.action) {
                        MotionEvent.ACTION_DOWN -> {
                            initialX = p.x
                            initialY = p.y
                            initialTouchX = event.rawX
                            initialTouchY = event.rawY
                            isMoving = false
                            true
                        }
                        MotionEvent.ACTION_MOVE -> {
                            val dx = (event.rawX - initialTouchX).toInt()
                            val dy = (event.rawY - initialTouchY).toInt()
                            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                                isMoving = true
                            }
                            p.x = initialX + dx
                            p.y = initialY + dy
                            try {
                                windowManager?.updateViewLayout(overlayRootView, p)
                            } catch (_: Exception) {}
                            true
                        }
                        MotionEvent.ACTION_UP -> {
                            if (!isMoving && isPill) {
                                isMinimized = false
                                pill.visibility = View.GONE
                                expanded.visibility = View.VISIBLE
                            }
                            true
                        }
                        else -> false
                    }
                }
            }

            setupDrag(header, false)
            setupDrag(pill, true)

            overlayRootView = root
            windowManager?.addView(root, params)
            Log.d(TAG, "Floating overlay window added successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show floating overlay: ${e.message}", e)
        }
    }

    private fun updateOverlayContent(text: String, isListening: Boolean, mode: String) {
        overlayAnswerTv?.text = if (text.isNotBlank()) text else "Listening for speech..."
        overlayModeTv?.text = mode.uppercase()

        val dotColor = if (isListening) Color.parseColor("#4ADE80") else Color.parseColor("#8E9099")
        overlayStatusDot?.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(dotColor)
        }
    }

    private fun hideOverlayWindow() {
        if (overlayRootView != null) {
            try {
                windowManager?.removeView(overlayRootView)
            } catch (e: Exception) {
                Log.e(TAG, "Error removing overlay view: ${e.message}")
            }
            overlayRootView = null
        }
    }

    private fun stopCallService() {
        hideOverlayWindow()
        setCommunicationMode(false)
        setSpeakerphone(false)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }

        isRunning = false
        stopSelf()
        Log.d(TAG, "CallForegroundService stopped")
    }

    override fun onDestroy() {
        stopCallService()
        super.onDestroy()
    }
}
