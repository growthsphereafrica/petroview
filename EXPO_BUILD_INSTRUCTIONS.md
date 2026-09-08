# Master View Petroleum — Expo & App Store Deployment Guide

This project is configured with **React Native + Expo SDK 52+** and **EAS (Expo Application Services)** to build and ship native apps for **Google Play Store (Android)**, **Apple App Store (iOS)**, and **Web**.

---

## 📱 1. Running the App Locally / In Expo Go

### Start Development Server:
```bash
npx expo start
```
- **On Android**: Open the **Expo Go** app on your phone and scan the QR code displayed in the terminal.
- **On iPhone / iOS**: Open the Camera app on your iPhone and scan the QR code to open in **Expo Go**.
- **On Web**: Press `w` in the terminal or run `npm run dev` to test in your web browser.

---

## 🤖 2. Building for Android (Google Play Store & APK)

### Step 1: Install EAS CLI & Login to your Expo Account
```bash
npm install -g eas-cli
eas login
```

### Step 2: Configure EAS Project (First time only)
```bash
eas project:init
```

### Step 3: Build Standalone Android APK (For Direct Device Testing)
```bash
eas build -p android --profile preview
```
> This generates a direct `.apk` download link that you or attendants can install on any Android phone or rugged forecourt terminal.

### Step 4: Build Production Android App Bundle (`.aab` for Google Play Store)
```bash
eas build -p android --profile production
```
> Submit the resulting `.aab` directly to Google Play Console.

---

## 🍏 3. Building for iOS (Apple App Store & TestFlight)

### Step 1: Build Production iOS Archive (`.ipa`)
```bash
eas build -p ios --profile production
```
> Expo EAS will automatically handle Apple code signing certificates and provisioning profiles.

### Step 2: Submit to TestFlight / App Store
```bash
eas submit -p ios
```

---

## 🌐 4. Building for Web (Station Office Computers)

To generate the production web bundle for station supervisor computers:
```bash
npm run build
```
The output will be in `dist/` ready to host on any server or run locally on station computers.

---

## ⚙️ Configuration Files Reference

- **`app.json`**: Contains App Name (`Master View Petroleum`), Bundle Identifier (`com.masterview.forecourt`), splash screens, icons, and camera/bluetooth hardware permissions.
- **`eas.json`**: Build profiles (`preview` APK, `production` App Bundle & IPA).
- **`package.json`**: Dependencies and convenience build scripts (`npm run build:android`, `npm run build:ios`).
