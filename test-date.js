const dateStr = "2026-03-04";

// Create a valid date object parsing "2026-03-04"
// Without a time, "2026-03-04" parses as UTC midnight. So we add "T00:00:00" to enforce LOCAL time parsing
const date = new Date(`${dateStr}T00:00:00`);

// The 'date' object now represents exactly Midnight local time for the provided date string.
const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const startOfWeek = new Date(startOfDay);
startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay() + 1); // Monday
startOfWeek.setHours(0, 0, 0, 0);

const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1, 0, 0, 0, 0);

console.log("Input string   :", dateStr);
console.log("startOfDay     :", startOfDay.toString());
console.log("startOfDay UTC :", startOfDay.toISOString());
console.log("endOfDay       :", endOfDay.toString());
console.log("endOfDay UTC   :", endOfDay.toISOString());
console.log("startOfWeek    :", startOfWeek.toString());
console.log("startOfMonth   :", startOfMonth.toString());
