

# Plan: Arrival Detection with Auto-Clear and Celebration

## What It Does
When the convoy leader gets within 50m of the destination, automatically clear the destination and show a celebration toast notification. This only triggers for the leader (who controls the destination).

## Technical Details

**File: `src/pages/Index.tsx`**

Add a `useEffect` that watches the leader's position relative to the destination:
- Use existing `haversineDistance` to check if `self` (leader) is within 50m of `destination`
- Use a ref to prevent repeated triggers
- When triggered: call `handleClearDestination()`, show a celebratory `toast.success` with a party message (e.g., "You've arrived! Destination reached.")
- Reset the arrival ref when destination changes

The effect depends on `self.lat`, `self.lng`, `destination`, `isLeader`, and `handleClearDestination`. Since `handleClearDestination` already broadcasts the clear to all convoy members via the database, all members will see the destination removed automatically.

**No other files need changes** — `haversineDistance` is already exported from `useNavigationAlerts`, `handleClearDestination` handles the full cleanup, and `toast` from Sonner is already imported.

