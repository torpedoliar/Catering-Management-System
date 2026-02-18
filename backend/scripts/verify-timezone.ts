
import { parseDateToCateringTime } from '../src/services/time.service';

console.log("---------------------------------------------------");
console.log("🧪 VERIFICATION: Timezone Logic (The '7-Hour' Bug)");
console.log("---------------------------------------------------");

// Test Cases
const testCases = [
    { input: "2026-02-18", expected: "2026-02-18T00:00:00.000Z" },
    { input: "2026-01-01", expected: "2026-01-01T00:00:00.000Z" },
    { input: "2026-12-31", expected: "2026-12-31T00:00:00.000Z" }
];

let failed = false;

testCases.forEach(({ input, expected }) => {
    const result = parseDateToCateringTime(input);
    const resultIso = result.toISOString();

    if (resultIso === expected) {
        console.log(`✅ PASS: ${input} -> ${resultIso}`);
    } else {
        console.error(`❌ FAIL: ${input}`);
        console.error(`   Expected: ${expected}`);
        console.error(`   Actual:   ${resultIso}`);
        failed = true;
    }
});

if (failed) {
    console.error("\n💥 VERIFICATION FAILED: Dates are NOT aligning to UTC midnight!");
    process.exit(1);
} else {
    console.log("\n✨ VERIFICATION SUCCESS: All dates aligned to UTC midnight.");
    console.log("   The system is now safe from Server Timezone Offsets.");
}
