

# Plan: Connection Lost Banner with Auto-Reconnect

## What It Does
Shows a warning banner when the Supabase Realtime channel disconnects, and automatically attempts to reconnect. The banner dismisses once the connection is restored.

## Changes

### 1. Add `connectionStatus` state to `useConvoy.ts`
- Track channel status (`connected` | `disconnected`) as a new state variable
- Listen to the channel's `subscribe` callback status — Supabase channels emit `SUBSCRIBED`, `CLOSED`, `CHANNEL_ERROR`, `TIMED_OUT`
- On disconnect/error: set status to `disconnected`, attempt to resubscribe after a short delay (2s, with exponential backoff up to 15s)
- On successful resubscribe: set status back to `connected`
- Return `connectionStatus` from the hook

### 2. Create `ConnectionBanner.tsx` component
- Simple fixed banner at top of screen with yellow/orange warning styling
- Shows "Connection lost — reconnecting..." with a wifi-off icon
- Animate in/out with a fade+slide transition
- Only renders when `connectionStatus === "disconnected"` and user is in a convoy

### 3. Wire it up in `Index.tsx`
- Import `ConnectionBanner`, render it conditionally based on `connectionStatus` from `useConvoy`

## Technical Details

**`src/hooks/useConvoy.ts`**:
- Add `const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected">("connected")`
- In `subscribeToConvoy`, use `.subscribe((status) => { ... })` callback to detect `SUBSCRIBED` vs error states
- On error/closed: set disconnected, schedule `channelRef.current?.subscribe()` retry with backoff
- Return `connectionStatus`

**`src/components/ConnectionBanner.tsx`** (new file):
- Fixed position top banner, z-50, amber/warning colors
- WifiOff icon + "Connection lost — reconnecting..." text
- CSS transition for smooth appear/disappear

**`src/pages/Index.tsx`**:
- Destructure `connectionStatus` from `useConvoy`
- Render `<ConnectionBanner />` when in convoy and disconnected

