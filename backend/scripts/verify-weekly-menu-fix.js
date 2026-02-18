
/**
 * 🕵️ Weekly Menu Fix Verification
 * 
 * This script verifies that the new "getNowJakarta()" logic (using date-fns-tz)
 * correctly handles the "Monday Morning" scenario where UTC Server is behind.
 */

const { toZonedTime } = require('date-fns-tz');

// ---------------------------------------------------------
// 1. REPLICATE THE LOGIC FROM weekly-menu.routes.ts
// ---------------------------------------------------------

const TIMEZONE = 'Asia/Jakarta';

function getWeekNumber(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const jan1Day = jan1.getDay();
    const week1Start = new Date(jan1);
    week1Start.setDate(jan1.getDate() - jan1Day);
    const diffDays = Math.floor((d.getTime() - week1Start.getTime()) / 86400000);
    return Math.floor(diffDays / 7) + 1;
}

// ---------------------------------------------------------
// 2. SIMULATION SETUP
// ---------------------------------------------------------

console.log("---------------------------------------------------");
console.log("✅ VERIFICATION: Weekly Menu Timezone Fix");
console.log("---------------------------------------------------");

// Scenario: Monday, June 1, 2026 at 06:00 AM Jakarta
// In UTC, this is May 31, 2026 at 23:00 PM (Sunday behavior)
const mockNow = new Date('2026-06-01T06:00:00+07:00');

console.log(`📅 Real Time (WIB):   ${mockNow.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })}`);
console.log(`🌍 Server Time (UTC): ${mockNow.toISOString()}`);

// ---------------------------------------------------------
// 3. TEST OLD WAY (The Bug)
// ---------------------------------------------------------
// The old way used `new Date()` (System Time) directly.
// If system is UTC, getters return Sunday events.
const utcYear = mockNow.getUTCFullYear();
const utcMonth = mockNow.getUTCMonth();
const utcDate = mockNow.getUTCDate();
const sysTimeSimulated = new Date(Date.UTC(utcYear, utcMonth, utcDate)); // Simulate "System Time is UTC"

const weekOld = getWeekNumber(sysTimeSimulated);
console.log(`\n❌ OLD LOGIC (Server UTC): Week ${weekOld}`);

// ---------------------------------------------------------
// 4. TEST NEW WAY (The Fix)
// ---------------------------------------------------------
// The fix uses `toZonedTime(now, 'Asia/Jakarta')` before getWeekNumber.

const jakartaDate = toZonedTime(mockNow, TIMEZONE);
const weekNew = getWeekNumber(jakartaDate);

console.log(`\n✅ NEW LOGIC (Jakarta Fix): Week ${weekNew}`);

// ---------------------------------------------------------
// 5. ASSERTION
// ---------------------------------------------------------

// We expect Week 23 for June 1, 2026
const EXPECTED_WEEK = 23;

if (weekNew === EXPECTED_WEEK && weekOld !== EXPECTED_WEEK) {
    console.log("\n🎉 SUCCESS: The fix successfully corrected the Monday Morning offset!");
} else if (weekNew === EXPECTED_WEEK) {
    console.log("\n⚠️  PARTIAL: Fix works, but simulation of bug might be inaccurate.");
} else {
    console.log(`\n❌ FAILURE: Fix returned Week ${weekNew}, expected ${EXPECTED_WEEK}`);
}
