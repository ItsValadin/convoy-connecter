

# Implement Google AdSense Interstitial Ads for Past Trip Stats

## Overview
Add a Google AdSense interstitial ad gate that shows before users can view **past** trip history, while keeping **live convoy stats** completely free.

## How It Works
1. User navigates to Stats page — sees trip list freely
2. User taps a **past trip** (not the live convoy) → interstitial ad appears
3. After ad closes (or after a timeout/skip), the trip stats load
4. A sessionStorage flag prevents repeat ads within the same browser session (one ad per session)
5. Tapping the **Live Convoy** card skips the ad entirely

## Prerequisites (User Action Required)
You'll need a Google AdSense account and an approved ad unit:
1. Sign up at [adsense.google.com](https://adsense.google.com)
2. Add your published domain (`convoy-connecter.lovable.app`) for verification
3. Get your **publisher ID** (ca-pub-XXXXX) and create an ad unit
4. Once approved, provide the publisher ID so it can be added to the app

## Technical Changes

### 1. Add AdSense script to `index.html`
- Add the Google AdSense script tag in `<head>` with the user's publisher ID

### 2. Create `src/hooks/useAdGate.ts`
- A hook that manages the ad interstitial state
- Tracks whether ad has been shown this session (via `sessionStorage`)
- Exposes `showAd()` → returns a Promise that resolves when ad completes
- For development/testing: includes a mock mode that shows a 3-second countdown overlay instead of a real ad

### 3. Create `src/components/AdInterstitial.tsx`
- Full-screen overlay component with a countdown timer (e.g., 5 seconds)
- Shows the AdSense ad unit in the center
- "Skip" button appears after the countdown
- Styled to match the app's dark theme

### 4. Modify `src/pages/TripStats.tsx`
- When user clicks a **past trip** (not the active convoy), trigger the ad gate
- Only show ad if not already shown this session
- After ad completes/skips, proceed to load the selected trip stats
- Live convoy card remains ad-free

### Important Notes
- **AdSense approval takes 1-2 days** — until then, the app will show a placeholder/mock ad
- The publisher ID will be stored directly in the codebase (it's a public key, not a secret)
- No database changes needed

