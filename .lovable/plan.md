

## Trip Stats Page

### Overview
Add a new "/stats" page showing real-time trip statistics for every driver in the convoy. Stats are computed client-side from GPS data and stored in a new database table so all convoy members can view each other's stats.

### Stats Tracked (per driver)
- **Top Speed** — highest speed recorded during the trip
- **Average Speed** — mean of all non-zero speed readings
- **Fastest Acceleration** — largest positive speed delta between consecutive readings
- **Hardest Brake** — largest negative speed delta between consecutive readings

### Database Changes
New `convoy_trip_stats` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| convoy_id | uuid | FK to convoys |
| session_id | text | identifies the driver |
| driver_name | text | display name |
| driver_color | text | marker color |
| top_speed | double precision | m/s, default 0 |
| avg_speed | double precision | m/s, default 0 |
| fastest_acceleration | double precision | m/s², default 0 |
| hardest_brake | double precision | m/s², default 0 |
| updated_at | timestamptz | default now() |
| created_at | timestamptz | default now() |

- Unique constraint on (convoy_id, session_id)
- Public RLS policies (matching existing pattern)
- Enable realtime so stats update live across devices

### Client-Side Changes

1. **`src/hooks/useTripStats.ts`** — New hook that:
   - Tracks local speed history in a ref (previous speed + timestamp)
   - On each GPS update, computes acceleration = (speed₂ - speed₁) / Δt
   - Maintains running max/min/avg in refs
   - Upserts stats to `convoy_trip_stats` every 5 seconds (same cadence as DB position persist)
   - Subscribes to realtime changes on `convoy_trip_stats` filtered by convoy_id to display other drivers' stats

2. **`src/pages/TripStats.tsx`** — New page showing:
   - Card per driver (colored by their convoy color)
   - Four stat values displayed with icons, converted to mph for display
   - Accessible from the convoy panel via a "Trip Stats" button
   - Back button to return to map

3. **`src/components/ConvoyPanel.tsx`** — Add a "Trip Stats" link/button visible when in an active convoy

4. **`src/App.tsx`** — Add route `/stats`

5. **`src/hooks/useConvoy.ts`** — Integrate `useTripStats` hook, calling its update method from the GPS `onPosition` callback. Reset stats on convoy join/create. Clean up stats record on leave.

### Technical Notes
- Speed from GPS is in m/s; display converts to mph (×2.237)
- Acceleration is derived client-side: `(currentSpeed - previousSpeed) / timeDelta`
- Stats persist to DB so they survive page refreshes and are visible to all members
- Hardest brake is stored as a positive magnitude for display simplicity

