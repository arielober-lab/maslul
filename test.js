// בדיקות למפענח.
//
// כל הרשימות כאן מומצאות. הן נבנו כדי לשחזר את המבנים שמופיעים
// ברשימות אמיתיות — אבל השמות, הכתובות והטלפונים אינם של אף אדם.
// אין להכניס לקובץ הזה רשימה אמיתית: הריפו ציבורי.

const { parseList } = require("./parser.js");

const cases = {
  "פתיחה ׳ומוסר ל׳ + הערות רב-שורתיות": `אתה אוסף מ:

מרכז חלוקה
הרצל 12
050-0000001

ומוסר ל:

דוד כהן
ויצמן 8/17 – קומה רביעית. קוד לבניין 1111*
להתקשר באינטרקום
*מס 17* כמה פעמים

רונית לוי
ויצמן 4 קומה 6 דירה 26
050-0000002

יוסי מזרחי
האלון 58 דירה ב
050-0000003`,

  "שעת יעד + מפריד ׳ול:׳": `*יש לאסוף עד השעה 13:00*
אוסף מ:
נקודת איסוף מרכזית
בן גוריון 15/1
050-0000004

מעביר ל:
אבי שמש
הזית 30/8 קומה 3
050-0000005

ול:
נעמי ברק
התמר 57/1
050-0000006
עדיפות למסור לה ביד`,

  "כמויות, שם שהוא גם כתובת, שני טלפונים בשורה": `אתה אוסף מ: *מאפייה מרכזית* ,כתובת: הדקל 111

50 לחמניות
11 חלות

ומעביר ל:

מיכל אורן - 2 חלות
הגפן 9/9
050-0000007

איתי שגב - 4 לחמניות
רחבת האורן 13
050-0000008 , 050-0000009

קייטרינג הדרום - 30 לחמניות
השקד 3 דירה 2 קומה 0
050-0000010

בית כנסת הרימון 24 (בית כנסת) - 7 חלות
איש קשר: 050-0000011

טל נחום - 4 לחמניות
הברוש 26 דירה 1 קוד #1234
050-0000012   בן הזוג- 050-0000013`,

  "הערה בסוגריים, עצירה בלי טלפון, קו נייח": `*יש לאסוף עד השעה 12:00*
אוסף מ:
תחנת חלוקה
הערבה 4 - מול בית הספר
050-0000014

ומעביר ל:
שרה אביב
הכלנית 68/1
כניסה א קרקע
כתוב על הדלת "שלום"
050-0000015
077-0000016

מרים דגן (ללא אורז)
הכלנית 68/18 כניסה ג
דלת ימנית, קומת קרקע
אין טלפון

אורית נוי
הסביון 18 א', 18/1
דירה ראשונה מימין. להשתדל למסור לה את האוכל ביד
050-0000017

גלית שחר
הסביון 33/10 קומה 3
050-0000018
לנסות ליצור קשר בבוקר`,

  "שורה מודגשת מעל השם + קוד מעלית": `אוסף מ:
תחנה צפונית
הנרקיס 48/2
050-0000019

מעביר ל:
חנה פלד
היסמין 6/6
050-0000020

ול:
***מנה צמחונית***
עדי רון
הרקפת 20/9 קומה רביעית
יש מעלית 2222#
050-0000021

ול:
משה גל
הכרמל 43 קומה 8 דירה 111
050-0000022`
};

let failures = 0;

function expect(label, actual, wanted) {
  const ok = actual === wanted;
  if (!ok) failures++;
  console.log((ok ? "  PASS  " : "  FAIL  ") + label +
    (ok ? "" : "\n          got:    " + JSON.stringify(actual) +
               "\n          wanted: " + JSON.stringify(wanted)));
}

for (const [label, text] of Object.entries(cases)) {
  const r = parseList(text);
  console.log("\n==================== " + label);
  console.log("deadline:", r.deadline || "(none)");
  r.stops.forEach((s, i) => {
    console.log(`  ${i}. [${s.kind}] ${s.name}`);
    console.log(`     addr : ${s.addr}`);
    if (s.qty) console.log(`     qty  : ${s.qty}`);
    if (s.phones.length) console.log(`     tel  : ${s.phones.join(" | ")}`);
    if (s.warns.length) console.log(`     WARN : ${s.warns.join(" ~ ")}`);
    if (s.notes.length) console.log(`     note : ${s.notes.join(" ~ ")}`);
  });
  if (r.problems.length) console.log("  problems:", r.problems.join("; "));
}

console.log("\n==================== assertions");
const a = parseList(cases["פתיחה ׳ומוסר ל׳ + הערות רב-שורתיות"]);
expect("no ghost stop from the 'ומוסר ל' header", a.stops.length, 4);
expect("address survives the word 'קוד'", a.stops[1].addr, "ויצמן 8/17 – קומה רביעית. קוד לבניין 1111");

const b = parseList(cases["שעת יעד + מפריד ׳ול:׳"]);
expect("deadline read", b.deadline, "13:00");

const c = parseList(cases["כמויות, שם שהוא גם כתובת, שני טלפונים בשורה"]);
expect("name and address split out of the header", c.stops[0].name, "מאפייה מרכזית");
expect("header address", c.stops[0].addr, "הדקל 111");
expect("quantity split from name", c.stops[1].qty, "2 חלות");
expect("two phones on one line", c.stops[2].phones.length, 2);
expect("name doubles as address", c.stops[4].addr, "בית כנסת הרימון 24");
// A label sitting next to a second number ("בעלה- 05…") says whose number it is.
// Short labels are dropped as noise; longer ones are kept as a note.
expect("label beside a second number is kept", c.stops[5].notes[0], "בן הזוג");
expect("both numbers captured", c.stops[5].phones.length, 2);

const d = parseList(cases["הערה בסוגריים, עצירה בלי טלפון, קו נייח"]);
expect("parenthetical becomes a warning", d.stops[2].warns[0], "ללא אורז");
expect("stop with no phone", d.stops[2].phones.length, 0);
expect("landline kept alongside mobile", d.stops[1].phones.length, 2);

const e = parseList(cases["שורה מודגשת מעל השם + קוד מעלית"]);
expect("emphasised line above the name is a warning", e.stops[2].warns[0], "מנה צמחונית");
expect("name after the emphasised line", e.stops[2].name, "עדי רון");

console.log(failures ? "\n" + failures + " FAILURES" : "\nall green");
process.exit(failures ? 1 : 0);
