# TigerBot Android (Capacitor)

This is a native Android shell around the existing TigerBot website. The React
frontend remains hosted by Railway; this project does not copy, rebuild, or
change its screens.

The Railway URL is centralized in `src/config.ts`. The Android WebView clears
its cache at each launch so a newly deployed website is fetched on the next
app start. The app uses immersive fullscreen; Android system bars can be temporarily
revealed with a swipe. The Android back button follows WebView history and
exits at the root. Links with `target="_blank"` are handed to Android to open
the matching app or the user's default browser.

## Requirements

- Node.js 22.12 or newer
- JDK 21 (the Android Gradle wrapper does not run with JDK 25)
- Android SDK with Android platform 36 and Build Tools 36.0.0

## Generate the debug APK

```powershell
$env:JAVA_HOME = "C:\path\to\jdk-21"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
npm install
npm run assets:android
npm run android:debug
```

The installable debug APK is written to
`android/app/build/outputs/apk/debug/app-debug.apk`.

The existing Expo project in `../app_mobile` is intentionally left unchanged.
