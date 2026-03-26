

## Plan: Set Up Capacitor for Native Mobile App

Add Capacitor to the project so you can build a true native iOS/Android app with background location tracking.

### What this enables
- Full background GPS tracking (even when app is minimized/screen off)
- Push notifications, camera access, and other native features
- Publishing to App Store and Google Play

### Changes

1. **Install Capacitor dependencies**
   - `@capacitor/core` (runtime)
   - `@capacitor/cli` (dev dependency)
   - `@capacitor/ios` and `@capacitor/android` (platform packages)

2. **Create `capacitor.config.ts`** in project root with:
   - `appId`: `app.lovable.3daeaddbd8a443b7a3e165f295916c62`
   - `appName`: `convoy-connecter`
   - `webDir`: `dist`
   - Live-reload server config pointing to the sandbox preview URL for development

3. **Update `package.json`** — add convenience scripts:
   - `cap:sync` → `npx cap sync`
   - `cap:android` → `npx cap run android`
   - `cap:ios` → `npx cap run ios`

### To run on your device after setup

You'll need to do these steps locally on your machine:

1. Export to GitHub via the **Export to GitHub** button, then `git pull`
2. Run `npm install`
3. Run `npx cap add ios` and/or `npx cap add android`
4. Run `npx cap update ios` (or `android`)
5. Run `npm run build`
6. Run `npx cap sync`
7. Run `npx cap run ios` (requires Mac + Xcode) or `npx cap run android` (requires Android Studio)

For background location tracking, we'll add `@transistorsoft/capacitor-background-geolocation` as a follow-up step after the base Capacitor setup is confirmed working.

For a detailed walkthrough, check out the Lovable blog post on Capacitor mobile development.

