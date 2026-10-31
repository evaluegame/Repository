#!/usr/bin/env bash
set -euo pipefail

PACKAGE=com.ainrox.profit.app
ACTIVITY=com.ainrox.profit.MainActivity
APK=profit-mobile/android/app/build/outputs/apk/debug/app-debug.apk
mkdir -p android-test-results

# Install the exact previously published APK, then upgrade without uninstalling.
adb install --no-incremental freedom-fighter-site/downloads/Profit-Android.apk
adb shell run-as "$PACKAGE" mkdir -p files
adb shell run-as "$PACKAGE" touch files/profit-upgrade-preserve-check
adb install --no-incremental -r "$APK"
adb shell run-as "$PACKAGE" ls files/profit-upgrade-preserve-check
adb shell dumpsys package "$PACKAGE" > android-test-results/package.txt
grep -q 'versionName=1.6.3' android-test-results/package.txt

adb logcat -c
adb shell am start -W -n "$PACKAGE/$ACTIVITY"
sleep 30
adb shell pidof "$PACKAGE"
adb exec-out screencap -p > android-test-results/first-launch.png
adb shell uiautomator dump /sdcard/profit-window.xml
adb pull /sdcard/profit-window.xml android-test-results/first-launch.xml

# Exercise focus callbacks and a second cold launch, where fullscreen is reapplied.
adb shell input keyevent KEYCODE_HOME
adb shell am start -W -n "$PACKAGE/$ACTIVITY"
sleep 3
adb shell pidof "$PACKAGE"
adb shell am force-stop "$PACKAGE"
adb shell am start -W -n "$PACKAGE/$ACTIVITY"
sleep 10
adb shell pidof "$PACKAGE"
adb shell run-as "$PACKAGE" ls files/profit-upgrade-preserve-check
adb logcat -b crash -d > android-test-results/crashes.txt
adb logcat -d > android-test-results/logcat.txt
if grep -q "Process: $PACKAGE" android-test-results/crashes.txt; then
  cat android-test-results/crashes.txt
  exit 1
fi
adb exec-out screencap -p > android-test-results/relaunch.png
echo 'PASS: signed in-place upgrade, preserved app data, launch, resume and relaunch'
