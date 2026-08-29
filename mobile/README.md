# Ghost Mobile — Android & iOS Interview & Call Copilot

The native mobile edition of Ghost, built with **Material 3 (Material You)** for Android and **Cupertino Frosted Glass / Dynamic Island UI** for iOS, designed to provide real-time interview coaching, phone call transcription, and live answer generation directly on your mobile device.

---

## 🎨 Dual-Platform Adaptive Design

Ghost Mobile automatically adapts its design system based on the host operating system:

### Android: Material 3 (Material You)
* **Tonal Elevation & Surfaces**: `surfaceContainerLowest`, `surfaceContainerLow`, `surfaceContainer`, `surfaceContainerHigh`, `surfaceContainerHighest`.
* **Material 3 Navigation Bar**: Bottom navigation with rounded pill active indicators (`M3NavigationBar.tsx`).
* **Material 3 Cards & Action Chips**: Elevated, filled, and outlined cards with M3 shape scales (`extraLarge: 28dp`, `full: 9999dp`).
* **Material 3 Top App Bar**: Headline styling with dynamic subtitle and contextual action slots.
* **Material 3 Color Roles**: Primary (`#A8C7FA`), OnPrimary (`#083063`), SecondaryContainer (`#005047`), and Semantic Live Tones (`#4ADE80`).

### iOS: Cupertino Translucent Glass & Dynamic Island
* **Dynamic Island Pill**: Real-time listening indicator and quick controls (`DynamicIslandPill.tsx`).
* **Frosted Glass Tab Bar**: Translucent blurred navigation bar (`GlassTabBar.tsx`).
* **Cupertino Top Bar**: Native iOS header with blur backing and haptic touch (`IOSTopBar.tsx`).
* **iPad Sidebar**: Responsive dual-pane layout for iPadOS (`IPadSidebar.tsx`).

---

## 🚀 Key Mobile Features

1. **Android Floating Call Overlay**:
   * Uses Android `SYSTEM_ALERT_WINDOW` permission to float unobtrusively over your phone dialer, WhatsApp calls, Zoom, Google Meet, or Microsoft Teams apps.
2. **iOS Standalone & Dynamic Island Modes**:
   * Seamless background audio transcription and live coaching notifications on iPhone and iPad.
3. **Phone Call Helper Mode (`phoneCall`)**:
   * Tailored audio-first assistance crafted for phone screenings with vocal signposting and punchy answers.
4. **Cross-Platform Audio & Security**:
   * Native audio streaming and recording (`expo-av`).
   * Secure credential persistence (`expo-secure-store`).
5. **Multi-Model LLM Streaming**:
   * Direct integration with OpenAI, Google Gemini, Anthropic Claude, Groq, Ollama, MiniMax, Azure OpenAI, and custom endpoints.
6. **Interview Prep Hub**:
   * Injects your résumé, job description, STAR stories, and motivation directly into responses.

---

## 📱 Getting Started with Expo

1. Navigate to the mobile folder:
   ```bash
   cd mobile
   npm install
   ```

2. Start the Expo development server:
   ```bash
   npx expo start
   ```

3. **Run on Android**:
   * Press `a` in the terminal to launch on connected Android emulator or device via ADB.
   * Or scan the terminal QR code with the **Expo Go** app on Android.

4. **Run on iOS**:
   * Press `i` to launch in the iOS Simulator on macOS.
   * Or scan the terminal QR code using the Camera app on iPhone.

---

## 🛠️ Native Development & IDE Setup

### 1. Android Studio
To open and build the native Android project:
1. Open **Android Studio**.
2. Click **Open** (or **File** → **Open...**).
3. Select the `./mobile/android` directory inside the repository.
4. Wait for Gradle sync to complete.
5. You can now:
   * Run the app directly using Android Studio's **Run (Shift+F10)** / **Debug (Shift+F9)**.
   * Inspect real-time logs using **Logcat** (`tag:ReactNativeJS` or `tag:AudioRecord`).
   * Profile memory and CPU usage using the **Android Profiler**.
   * Build signed release APKs / App Bundles via **Build** → **Generate Signed Bundle / APK**.

### 2. Xcode (macOS)
To open and build the native iOS project:
1. Ensure CocoaPods dependencies are installed:
   ```bash
   cd mobile/ios && pod install && cd ../..
   ```
2. Open `mobile/ios/Ghost.xcworkspace` in **Xcode**.
3. Select your target simulator (e.g., iPhone 16 Pro) or physical device.
4. Press **⌘R** to build and run.

---

## 🔒 Permissions Configured
* **Android**: `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`, `READ_PHONE_STATE`, `MODIFY_AUDIO_SETTINGS`.
* **iOS**: `NSMicrophoneUsageDescription`, Background Audio Mode (`UIBackgroundModes: ["audio"]`).
