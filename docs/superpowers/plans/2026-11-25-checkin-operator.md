# Check-in Operator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make check-in reliable for the correct employee, with recoverable camera and optional photo, accurate statistics, and an operator-first layout.

**Architecture:** Preserve existing QR/manual endpoints and atomic pickup updates. Add a read-only identity lookup, share photo handling across mutations, and separate local scan state from real-time activity. Release coupled API and UI changes together; verify each task independently.

**Tech Stack:** Express, Prisma, Vitest, React, Vite, html5-qrcode, react-webcam, Sharp, SSE.

**Spec:** `docs/superpowers/specs/2026-11-25-checkin-operator-design.md`

## Global Constraints

- Gunakan dependensi dan komponen yang sudah tersedia.
- Pertahankan Fake UTC dan helper tanggal proyek untuk waktu bisnis.
- Gunakan Bahasa Indonesia untuk copy operator.
- Pertahankan pembaruan atomik status `ORDERED` → `PICKED_UP`.
- Foto bukti berbeda dari foto profil; foto opsional saat kamera atau penyimpanan gagal.
- Tidak ada redesign menyeluruh, chart baru, atau perubahan aturan pemesanan.

## Review Focus

- Numeric code matches different employee identifiers: explicit selection (task 1).
- Camera startup finishes after close: release the stream and ignore callbacks (task 2).
- Pickup commits but the response is lost: do not announce success or blindly repeat the mutation (tasks 2–3).
- An older stats response arrives after changing canteen: discard it (task 4).
- Short viewport and long names at increased zoom: retain keyboard access to every action (task 5).

---

### Task 1: Resolve identity without guessing

**Files:** `backend/src/routes/order/checkin.ts`, `frontend/src/pages/canteen/CheckInPage.tsx`; add `backend/src/routes/order/checkin.identity.test.ts` for the resolution logic.

**Interfaces:** `GET /api/orders/checkin/lookup?query=<text>` returns `{ match: 'exact' | 'selection' | 'none', candidates: Array<{ userId: string; externalId: string; name: string; department: string | null }> }`. `POST /api/orders/checkin/manual` accepts `{ userId, operatorCanteenId? }` for a selected candidate and retains safe legacy exact identifiers. QR stays separate.

- [ ] Add tests `resolvesExactIdWithPunctuation`, `searchesOneWordAsNameIfNoExactMatch`, `requiresSelectionForCrossFieldCollision`, and `nameCannotMutatePickup`. Assert `EMP-001` is exact; `Budi` name-only and two owners for `1234` require selection; no mutation on an ambiguous or name-only request.
- [ ] Run `npm --prefix backend test -- checkin.identity` and verify the new cases fail before implementation.
- [ ] Add the trimmed, bounded lookup behind existing canteen authorization. Deduplicate exact matches by user ID, cap and sort results, and fall back to a name search only if no exact identifier matches. Manual mutation checks canonical user ID and revalidates order status, time and canteen; no implicit name mutation. Search UI shows candidates and their IDs; exact match and order barcode stay on the fast path.
- [ ] Re-run the targeted test and verify candidate selection on the frontend. Confirm non-canteen/non-admin accounts cannot call the lookup.

### Task 2: Serialize local scans and recover from camera failures

**Files:** `frontend/src/pages/canteen/CheckInPage.tsx`, `backend/src/routes/order/checkin.ts`, `backend/scripts/verify-checkin-race.ts`.

**Interfaces:** Local submissions share a synchronous in-flight guard. A confirmed `ALREADY_PICKED_UP` response provides the current `order` relation, `checkInTime`, and `checkedInBy` for QR and manual. If the order changed to another status, return a corresponding conflict, not a duplicate. Preserve existing error text during transition if another client depends on it.

- [ ] Extend the race check to assert one success, one duplicate, and matching winner time/operator/user for QR and manual. Record browser cases: rapid Enter, remote event during local result, camera permission failure then restart, close during pending startup, and network loss after request submission. Run against disposable data only and establish which cases fail.
- [ ] Acquire the guard before the first await and release it in `finally`; cover Enter, USB, click and decode. Keep focus/re-arm input after completion without discarding silently any accepted scan. Camera action always opens the camera; ignore stale callbacks, release the exact instance after failed/late startup, and clean up on close/unmount. Keep local status authoritative; send remote events to a separate surface. Re-fetch the committed record on race loss; display an uncertain outcome on lost response and let the operator verify by retrying deliberately.
- [ ] From `backend/`, re-run `npx ts-node scripts/verify-checkin-race.ts` using a local disposable DB. Repeat browser cases on two pos sessions.

### Task 3: Connect optional photo capture and persistence

**Files:** `backend/src/routes/settings.routes.ts`, `backend/src/routes/order/checkin.ts`, `backend/src/routes/order/shared.ts`, `frontend/src/pages/SettingsPage.tsx`, `frontend/src/pages/canteen/CheckInPage.tsx`; add `backend/src/routes/order/checkin.photo.test.ts`.

**Interfaces:** Admin `PUT /api/settings` persists boolean `checkinPhotoEnabled`. QR and manual accept optional `photo` multipart data, with manual also accepting its current JSON payload. Successful mutations return `photoStatus: 'saved' | 'not_requested' | 'failed'`. Capture receives the selected request intent and passes its Blob directly; it is never parsed as a code. The pos displays saved server settings and a `Lanjut tanpa foto` action.

- [ ] Add tests `persistsPhotoSetting`, `optionalPhotoFailurePreservesPickup`, `cleansUnattachedPhotoOnConflict`, and `keepsPhotoWhenResponseFailsAfterCommit`. Assert persistence after reload; one pickup with `failed` on image processing error; removal after known noncommit; no removal of a file referenced by the committed row. Include QR, manual, and skip cases in the browser checklist.
- [ ] Run `npm --prefix backend test -- checkin.photo` before implementation, expecting the new cases to fail.
- [ ] Persist the flag in admin settings and refresh pos state on settings events. Reuse the existing upload size cap and Sharp pipeline; store new evidence outside the public `/uploads` tree with durable storage for deployment. Do not add a public retrieval route. If capture or storage fails before pickup, allow the pickup and return explicit photo status; after a started transaction never auto-resubmit on unknown response. Use unique filenames and clean only files known to be unattached. Preserve previously stored photos and profile photo behavior.
- [ ] Re-run the targeted tests. Verify ON/OFF across reload, camera refusal and retry/skip, both capture routes, and private storage with a disposable DB and temporary photo directory.

### Task 4: Correct stats scope and recovery copy

**Files:** `backend/src/routes/order/stats.ts`, `backend/src/utils/shift-utils.ts` (reuse date/window helpers), `frontend/src/pages/canteen/CheckInPage.tsx`; add `backend/src/routes/order/checkin.stats.test.ts`.

**Interfaces:** Each resolved focus window retains `shiftId` and the catering `orderDate` key. `/api/orders/stats/today` adds `focus.nextRefreshAt` as a real UTC instant, or uses bounded refresh fallback when absent. Use server `message` for actionable rejection details with a fallback to `error`.

- [ ] Add tests `focusBeforeMidnightUsesTodayOrder`, `focusAfterMidnightUsesPriorOrder`, `mergesOnlyMatchingShiftDatePairs`, `keepsCanteenScope`, and `allDayDropsExpiredOvernightOrders`. Use explicit shifted timestamps and freeze the clock; cover a configured day-specific break and a boundary with no orders.
- [ ] Run `npm --prefix backend test -- checkin.stats` before implementation, expecting the new cases to fail.
- [ ] Keep the existing one-hour lead window, key focus by shift/date instead of overnight flag, and derive the next change from the same windows. Distinguish current break from upcoming in copy. Refresh when the boundary passes, on pos change, and on SSE reconnect; ignore stale results from a previous request/pos. Show `Memuat`, `Data belum diperbarui`, or valid counts. Display the server's target canteen and time guidance instead of the generic retry line.
- [ ] Re-run targeted tests. Simulate switching canteen with a delayed response and crossing a break boundary without SSE events. Verify failed fetches are not rendered as zero.

### Task 5: Make the page scan-first and verify the release

**Files:** `frontend/src/pages/canteen/CheckInPage.tsx`, existing frontend style/token files only if necessary.

**Interfaces:** No API changes. First viewport: pos + connection → labeled scan input + camera → latest local result. Shift summary follows. Success is inline; any modal has a title, focus containment, Escape, and focus restoration. Use text and icons, not color alone.

- [ ] Record baseline failures with a short viewport, keyboard only, and 200% zoom. Include long operator/employee names and audit contrast for normal text (4.5:1) and large text (3:1).
- [ ] Reorder the existing page, remove disruptive success overlay, reflow stats below scan controls, unify Indonesian copy, and provide status/error announcements. Respect reduced motion and keep camera cancel operable at short heights.
- [ ] Run `npm --prefix backend test`, `npm --prefix backend run build`, `npm --prefix frontend run build`, and `npm --prefix frontend run lint`. Record any baseline failure separately from new failures. Re-run browser checks at 1366×768, 360 px wide, and 200% zoom; run the two-pos/USB/camera scenarios from tasks 1–4 with a test account and no real employee photos. Run `graphify update .` after application changes.
- [ ] Review work after every task; commit only if requested. Do not treat hardware-dependent checks as passing until run.
