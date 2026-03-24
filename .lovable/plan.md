

# Plan: Convert Convoy to a PWA (Installable Web App)

## What You'll Get
Your app will be installable directly from the browser to your phone's home screen. It will work offline, load fast, and feel like a native app — no app store needed. Later, we can convert it to a full native app for the App Store / Google Play.

## Steps

### 1. Install the PWA plugin
Add `vite-plugin-pwa` as a dependency to generate the service worker and manifest automatically.

### 2. Configure Vite for PWA
Update `vite.config.ts` to add the `VitePWA` plugin with:
- App name: "Convoy"
- Theme color: `#171c26`
- Background color: `#171c26`
- Display mode: `standalone`
- Auto-register service worker
- Runtime caching for map tiles (OpenStreetMap) so the base map works offline
- `navigateFallbackDenylist: [/^\/~oauth/]` to protect auth redirects

### 3. Generate PWA icons
Create a set of icon files in `public/` for the manifest:
- `pwa-192x192.png` and `pwa-512x512.png` (standard PWA sizes)
- `apple-touch-icon-180x180.png` for iOS
These will be simple branded icons with the Convoy theme colors.

### 4. Update index.html
- Add `<link rel="apple-touch-icon">` tag
- Fix the page title from "Convoy — Live Group NavigationLovable App" to "Convoy — Live Group Navigation"

### 5. Create an Install page (`/install`)
A simple page at `/install` that:
- Detects if the app is already installed
- Shows install instructions (iOS: Share → Add to Home Screen; Android: browser menu → Install)
- Triggers the native install prompt on supported browsers

### 6. Add install prompt to main app
Add a subtle install banner or button that appears for users who haven't installed the app yet, prompting them to add it to their home screen.

---

## Technical Details

**Files to create:**
- `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/apple-touch-icon-180x180.png`
- `src/pages/Install.tsx`

**Files to modify:**
- `package.json` — add `vite-plugin-pwa`
- `vite.config.ts` — add VitePWA plugin config
- `index.html` — apple-touch-icon link, fix title
- `src/App.tsx` — add `/install` route

