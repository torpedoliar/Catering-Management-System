
/**
 * 🕵️ Weekly Menu Bug Simulator
 * 
 * This script proves how "getWeekNumber(new Date())" fails when the Server is in UTC
 * but the User is in Jakarta (+7).
 * 
 * Scenario: Monday 06:00 AM Jakarta
 * - Jakarta: 2026-06-01 06:00:00 (Monday) -> Should be Week 23
 * - UTC:     2026-05-31 23:00:00 (Sunday) -> Still Week 22
 */

function getWeekNumber(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const jan1Day = jan1.getDay();
    const week1Start = new Date(jan1);
    week1Start.setDate(jan1.getDate() - jan1Day);
    const diffDays = Math.floor((d.getTime() - week1Start.getTime()) / 86400000);
    return Math.floor(diffDays / 7) + 1;
}

console.log("---------------------------------------------------");
console.log("🐛 BUG SIMULATION: The 'Monday Morning' UTC Gap");
console.log("---------------------------------------------------");

// 1. Simulate "Monday Morning" in Jakarta
// Date: June 1, 2026 (Monday) at 06:00 AM WIB
// In UTC, this is: May 31, 2026 (Sunday) at 23:00 PM
const mondayMorningJakarta = new Date('2026-06-01T06:00:00+07:00');

console.log(`📅 Real Time (WIB):   ${mondayMorningJakarta.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })}`);
console.log(`🌍 Server Time (UTC): ${mondayMorningJakarta.toISOString()}`);

// 2. Simulate Server Logic (running in UTC environment)
// breakdown:
// new Date() returns the point in time (mondayMorningJakarta)
// But getWeekNumber uses .getFullYear(), .getDate() which depend on local system time.

// We need to simulate the "System Time" being UTC.
// In Node.js, we can't easily switch process.env.TZ on the fly for Date methods 
// without restarting, but we can simulate what the getters return.

const utcYear = mondayMorningJakarta.getUTCFullYear();
const utcMonth = mondayMorningJakarta.getUTCMonth();
const utcDate = mondayMorningJakarta.getUTCDate();
const utcDay = mondayMorningJakarta.getUTCDay(); // 0 = Sunday

console.log(`\n🔍 Server sees:`);
console.log(`   Year: ${utcYear}, Month: ${utcMonth + 1}, Date: ${utcDate}, Day: ${utcDay} (Sunday)`);

// 3. Run the exact logic from weekly-menu.routes.ts
const serverDateObj = new Date(Date.UTC(utcYear, utcMonth, utcDate)); // Server creates date based on its local time
// Note: getWeekNumber creates 'd' using local parts. 
// If server is UTC, 'new Date(year, month, date)' creates a date at 00:00 UTC.

const weekNumber = getWeekNumber(serverDateObj);

console.log(`\n🧮 Calculation Result:`);
console.log(`   Calculated Week: ${weekNumber}`);

// 4. Expected (Correct) Result for Jakarta User
// They expect Week 23 (because it's Monday)
const jakartaDateObj = new Date(2026, 5, 1); // June 1 Local
const correctWeek = getWeekNumber(jakartaDateObj);

console.log(`   Expected Week:   ${correctWeek}`);

if (weekNumber !== correctWeek) {
    console.log(`\n❌ BUG CONFIRMED: User sees Week ${weekNumber} instead of Week ${correctWeek}!`);
    console.log("   Impact: Users cannot see this week's menu until 07:00 AM.");
} else {
    console.log("\n✅ No Bug? (Check simulation logic)");
}
