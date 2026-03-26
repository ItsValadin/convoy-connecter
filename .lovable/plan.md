

## Plan: Remove PTT / Walkie-Talkie Feature

Remove all push-to-talk functionality from the app.

### Changes

1. **Delete `src/hooks/useWalkieTalkie.ts`** — the entire hook file

2. **Update `src/pages/Index.tsx`**:
   - Remove `useWalkieTalkie` import and hook call
   - Remove `Mic` from lucide imports
   - Remove the PTT button (the `<button>` with `onPointerDown`/`onPointerUp` for recording)
   - Remove the active speaker indicator pill
   - Remove `recording`, `activeSpeaker`, `startRecording`, `stopRecording` references

No database or backend changes needed.

