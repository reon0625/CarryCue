# CarryCue — Product Requirements (living doc)

## Original problem statement
Build the first UI-only version of CarryCue, a mobile app that helps users remember what they
need before leaving home. Tagline: "Never forget it twice." Core experience:
Capture → Before You Go → Leave → Forgot Something? → Remember next time.
STEP 1 = UI + navigation only. No real notifications, geofencing, location, Siri, App Intents,
widgets, subscriptions, cloud sync, auth, or backend. Mock/local in-memory data only.

## User choices (this build)
- Lightly persist state locally so the checklist survives reloads (still no backend).
- Show First Launch screen only once, then go straight to Home.
- Native-feel bottom sheets per platform (iOS-style sheet, Android Material sheet).

## Architecture
- React Native + Expo (SDK 54) + TypeScript, expo-router file-based navigation. NO bottom tab bar.
- Local state via React Context (`src/state/store.tsx`), persisted as JSON string through
  `@/src/utils/storage`. No FastAPI/Mongo used (UI-only step).
- Keyboard UX via `react-native-keyboard-controller`; animations via `react-native-reanimated`.

## Personas
- Student / commuter who repeatedly forgets everyday items (wallet, ID, charger) when leaving home.

## Core requirements (static)
- Calm, simple, fast, native, lightweight, utility-focused. No gradients, no big illustrations,
  no oversized cards, whitespace + simple lists. Orange (#FF6B35) used sparingly.
- Screens: First Launch, Home/Before You Go, Quick Add sheet, Trigger Setup, Routines,
  Routine Detail, Forgot Something, Notification & Location permission explainers (UI-only), Settings.

## Implemented (2026-06 / step 1)
- **Onboarding** (`onboarding.tsx`): brand + headline + tagline + Get started → Home (once only).
- **Home** (`home.tsx`): CarryCue header + settings icon; BEFORE YOU GO, "Leaving around 8:30",
  N-things count, checklist with circular checkboxes, completed items lighten + sink below,
  "All set" state, "+ Add something", FREQUENTLY USED chips, empty state.
- **Quick Add** (`QuickAddSheet.tsx`): autofocus input, REMIND ME options, blank→Frequently Used
  chips, Add + keyboard-Done save, "Choose time or place" → Trigger.
- **Trigger Setup** (`trigger.tsx`): Leaving home / At a time / Arriving somewhere states (mock).
- **Routines** (`routines/index.tsx`) + **Routine Detail** (`routines/[id].tsx`): check/add/delete/
  rename, "Use this routine" adds items to Home.
- **Forgot Something** (`forgot.tsx`): input → Saved state → Done; adds to Frequently Used + Home.
- **Settings** (`settings.tsx`): rows + UI-only Notification/Location permission explainers +
  "Demo: Forgot Something".
- Reusable components: ChecklistItem, PrimaryButton, TextButton, Chip, SectionLabel, BottomSheet,
  TriggerRow, EmptyState, PermissionExplanation, ScreenHeader, QuickAddSheet.
- All required flows A–F verified passing by testing agent (iteration_1).

## iOS / Android differences (intentional)
- BottomSheet: iOS shows grabber handle + rounded top; Android renders as Material rounded modal
  sheet. Trigger & Forgot use expo-router modal presentation (iOS card modal; Android modal with
  native hardware-back support).
- Icons use Ionicons for cross-platform consistency (equivalent to SF Symbols on iOS).
- Home checklist items are name-only (no delete gesture) per spec.

## Backlog (future steps — NOT in step 1)
- P1: real notifications, geofencing/location triggers.
- P2: Siri/App Intents, widgets, subscriptions, cloud sync, auth.

## Next tasks
- Await next development instruction (step 1 UI complete).

## Refinement pass (2026-06, visual/interaction only)
- Home made compact & glanceable: smaller checkbox (22), item name dominant (medium), row ~52pt;
  "BEFORE YOU GO" is 12–13pt medium label; count changed to "N left" (incomplete only); tighter
  vertical spacing so FREQUENTLY USED is visible without scrolling; no cards around the checklist.
- Completed items: filled check + lighter secondary text, strikethrough removed; still sink below.
- Duplicate prevention: `addItem` is case-insensitive + trimmed and returns whether it added;
  Quick Add shows inline "Already on your list" (sheet stays open), Home chips show a subtle Toast.
- Forgot Something: reduced typography, smaller/calmer success checkmark, removed "Always remind me"
  (Done only).
- Routines: removed card container, calmer plain grouped rows with hairline separators.
- Onboarding: improved vertical balance (content sits slightly above center, CTA near safe area).
- All flows re-verified by testing agent (iteration_2): duplicate prevention, incomplete count,
  completed styling, all-set, forgot success, trigger, persistence — all passing.

## Step 1 bug fixes (2026-06)
- Quick Add reliability: `add-something-button` always opens the sheet; input now uses `autoFocus`
  + a delayed `ref.focus()` after the open animation so it focuses and raises the keyboard on
  native every time (verified across open/close cycles).
- Duplicate prevention hardened: `addItem` blocks duplicates case-insensitively + trimmed across
  BOTH completed and incomplete items; added `dedupeItems` on hydration to heal any stale persisted
  duplicates (e.g., Umbrella/Student ID left over from earlier runs). Quick Add shows inline
  "Already on your list"; Home chips show a subtle toast.
- Verified flows (testing agent iteration_3): Home → Add something → type new item → Add → appears
  on Home; Quick Add → Choose time or place → Trigger Setup. All passing.

## Step 2 (2026-06, refinement pass)
- Renamed "Frequently Used" → "Suggestions" everywhere (Home, QuickAddSheet).
- Free limit changed to total items per departure (completed + incomplete both count),
  centralized in `src/data/limits.ts` (`maxDepartureItems`).
- Forgot Something always persists the forgotten signal even when the departure is at the
  limit; shows Saved + limit note + Upgrade prompt instead of silently failing.
- Home: swipe-to-delete (native, `react-native-gesture-handler` Swipeable) / inline delete
  button (web) with a 3s Undo toast (`restoreItem` re-inserts at original index); Undo does not
  touch historical usage stats.
- Verified by `testing_agent_v4_expo` — 14/14 scenarios passing.

## Step 3A (2026-06) — Real device-local notifications
- New `src/services/notifications.ts` — the only module importing `expo-notifications`.
  Safe no-op on web (throws typed `unavailable-on-web`, never fakes success). Exposes
  permission status/request, `scheduleAt` (cancels+replaces by id), `cancel`,
  `scheduleDevTestNotification`, and tap-response helpers (cold start + listener).
- `CarryItem.trigger.config` gained `notificationId` (optional, backward compatible).
  `TriggerType` dropped the unused `tomorrowMorning` value.
- Android "Reminders" channel (`reminders`) created at runtime via
  `setNotificationChannelAsync`, `channelId: 'reminders'` passed on every scheduled call.
- Permission UX: never requested at launch. User picks a time in Trigger Setup → taps
  "Set reminder" → CarryCue's own explanation sheet (reused `PermissionExplanation`,
  "Get reminded before it's too late" / "Remind me" / "Not now") → only then the native OS
  dialog. Permanently blocked → "Open Settings" sheet (`Linking.openSettings()`), never
  re-prompts silently.
- Trigger Setup (`trigger.tsx`) "At a time" is now functional: Later today (+3h), Tomorrow
  morning (8am), or Choose date & time (iOS inline spinner, Android
  `DateTimePickerAndroid.open` two-step date→time dialog). "Set reminder" schedules/replaces
  the OS notification and persists `{type:"time", config:{time, notificationId}}`. Existing
  time reminders show a "Remove reminder" action. Leaving-home/Arriving-somewhere tabs remain
  visual-only (Step 3B).
- Quick Add "Choose time or place" no longer persists the item immediately — it's carried as
  a draft via route params (`draftName`/`draftSource`) and only written to the store
  (`addItemWithTrigger`, single atomic write) once "Set reminder" succeeds. Closing without
  confirming discards the draft.
- Home: each item shows an alarm icon (outline = none, filled + time label = scheduled) that
  opens Trigger Setup for that item (`store.setItemTrigger` is the only writer of an existing
  item's trigger).
- Deleting an item cancels its scheduled notification (`removeItem`). Undo reschedules a
  fresh notification only if the persisted time is still in the future; expired reminders are
  not restored (avoids orphaned/duplicate OS notifications).
- Dev-only "Send test notification (10s)" row in Settings → Developer tools (`__DEV__` gated,
  also no-ops safely on web).
- `_layout.tsx` configures the Android channel on mount and routes any notification tap
  (cold start via `getLastNotificationResponseAsync` + live listener) to `/home` — no
  per-notification details screen.
- Verified by `testing_agent_v4_expo` on web preview (draft flow, permission-explanation copy,
  honest web-fallback messaging, edit/remove reminder, delete+undo, dev button, no
  regressions). Real OS notification delivery, native permission dialogs, and iOS/Android
  pickers require a real device/emulator build — not testable in Expo Go web preview.

## Backlog (future — NOT in Step 3A)
- Step 3B: real geofencing for Leaving home / Arriving somewhere.
- P1: backend + auth + cloud sync.
- P2: RevenueCat/purchases, Siri/App Intents, widgets.
