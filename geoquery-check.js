// Checks the address → geocoder-query rule against every address shape that has
// actually turned up in a real distribution list.
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const src = html.match(/function geoQuery\(stop, attempt\) \{[\s\S]*?\n  \}/)[0];

const state = { settings: { city: "באר שבע" } };
let geoQuery;
eval("geoQuery = " + src.replace("function geoQuery", "function"));

const cases = [
  ["בר הלל 4 - מול מקיף ז׳", "בר הלל 4"],
  ["עקיבא 68/1 · כניסה א קרקע", "עקיבא 68"],
  ["עקיבא 68/18 כניסה ג · דלת ימנית, קומת קרקע · דלת ימנית", "עקיבא 68"],
  ["בר גיורא 18 א׳, 18/1", "בר גיורא 18"],
  ["בר גיורא 33/10 קומה 3", "בר גיורא 33"],
  ["דוד המלך 21/46 קומה 3", "דוד המלך 21"],
  ["רחבת שמגר השופט 13", "רחבת שמגר השופט 13"],
  ["שאול המלך 111", "שאול המלך 111"],
  ["אהרון מסקין 24", "אהרון מסקין 24"],
  ["הגר 11 / דרך מצדה 78", "הגר 11"],
  ["גוש עציון 48/2", "גוש עציון 48"],
  ["מבצע יואב 43 קומה 8 דירה 111", "מבצע יואב 43"],
  ["הכותל המערבי 57/1", "הכותל המערבי 57"],
  ["אבשלום 2/18 קומה שניה אחרונה", "אבשלום 2"],
  ["רוזמרין 26 דירה 1 קוד #5749", "רוזמרין 26"],
  ["חמדה וצבי זינדר 2", "חמדה וצבי זינדר 2"],
  ["עמוס ירקוני 9/9", "עמוס ירקוני 9"],
  ["מנחם דונקלבלום 3 דירה 2 קומה 0", "מנחם דונקלבלום 3"],
  ["אליהו בן חור 6/6", "אליהו בן חור 6"],
  ["דוד אלעזר 20/9 קומה רביעית", "דוד אלעזר 20"],
  ["כצנלסון 15/1", "כצנלסון 15"],
  ["סוקולוב 30/8 קומה 3", "סוקולוב 30"]
];

let bad = 0;
for (const [addr, want] of cases) {
  const got = geoQuery({ addr }, 0).replace(", באר שבע", "");
  const ok = got === want;
  if (!ok) bad++;
  console.log((ok ? "  ok   " : "  FAIL ") + addr.padEnd(52) + " → " + got +
    (ok ? "" : "   (wanted: " + want + ")"));
}

// the second attempt drops a leading noun that Nominatim does not know
const second = geoQuery({ addr: "רחבת שמגר השופט 13" }, 1).replace(", באר שבע", "");
if (second !== "שמגר השופט 13") { bad++; console.log("  FAIL second attempt → " + second); }
else console.log("  ok   second attempt drops ״רחבת״                       → " + second);

// the third falls back to the street alone
const third = geoQuery({ addr: "בר גיורא 33/10 קומה 3" }, 2).replace(", באר שבע", "");
if (third !== "בר גיורא") { bad++; console.log("  FAIL third attempt → " + third); }
else console.log("  ok   third attempt falls back to the street             → " + third);

console.log(bad ? "\n" + bad + " FAILURES" : "\nall green");
process.exit(bad ? 1 : 0);
