// בדיקת דפדפן מקצה לקצה.
// הרשימה כאן מומצאת. אין להכניס לקובץ הזה רשימה אמיתית: הריפו ציבורי.

const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };

const server = http.createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  const f = path.join(__dirname, p);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end("no"); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "text/plain" });
  res.end(fs.readFileSync(f));
});

const LIST = `*יש לאסוף עד השעה 12:00*
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
לנסות ליצור קשר בבוקר

יעל אדרי
הדולב 21/46 קומה 3
050-0000019`;

const fails = [];
function check(label, cond, extra) {
  console.log((cond ? "  PASS  " : "  FAIL  ") + label + (extra ? "  → " + extra : ""));
  if (!cond) fails.push(label);
}

(async () => {
  await new Promise((r) => server.listen(8099, r));
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
  if (m.type() !== "error") return;
  // this sandbox has no route to the geocoder; that path is tested on its own below
  if (/nominatim|TUNNEL|ERR_NAME|ERR_INTERNET/i.test(m.text())) return;
  errors.push(m.text());
});

  await page.goto("http://localhost:8099/", { waitUntil: "load" });

  // --- settings ---
  await page.click("#settingsBtn");
  await page.fill("#setDriver", "אריאל");
  await page.fill("#setOrg", "עמותת להשביע את הלב");
  await page.fill("#setItem", "הסל לשבת");
  await page.fill("#setCity", "באר שבע");
  const preview = await page.textContent("#previewAsk");
  check("preview message builds", preview.includes("אריאל") && preview.includes("להשביע"), preview);
  await page.click("#saveSettings");

  // --- import ---
  await page.fill("#raw", LIST);
  await page.click("#parseBtn");
  await page.waitForSelector("#viewReview:not([hidden])");

  const names = await page.$$eval("#reviewList .name", (els) => els.map((e) => e.textContent));
  check("6 stops parsed", names.length === 6, names.join(" | "));
  check("pickup first", names[0] === "תחנת חלוקה", names[0]);
  const deadlineShown = await page.inputValue('input[data-f="addr"][data-i="2"]');
  check("no-phone stop keeps its address", deadlineShown.includes("הכלנית 68/18"), deadlineShown);
  const warn2 = await page.inputValue('input[data-f="warns"][data-i="2"]');
  check("ללא אורז flagged as warning", warn2.includes("ללא אורז"), warn2);

  // --- reorder: move מזל (last) up one ---
  await page.click('button[data-up="5"]');
  const after = await page.$$eval("#reviewList .name", (els) => els.map((e) => e.textContent));
  check("reorder works", after[4] === "יעל אדרי", after.join(" | "));
  await page.click('button[data-down="4"]');

  // --- edit a field ---
  await page.fill('input[data-f="phones"][data-i="3"]', "055-0000020");

  // --- run ---
  await page.click("#startBtn");
  await page.waitForSelector("#viewRun:not([hidden])");
  await page.fill("#ptime", "11:30");
  await page.dispatchEvent("#ptime", "change");

  const sub = await page.textContent("#subtitle");
  check("progress + deadline in subtitle", sub.includes("0 מתוך 5") && sub.includes("12:00"), sub);

  const etas = await page.$$eval("#runList .eta", (els) => els.map((e) => e.textContent.trim()));
  check("ETA computed per stop", etas.length === 5 && etas[0].includes("11:40"), etas.join(" | "));

  const waze = await page.getAttribute("#runList .stop.active a.btn.go", "href");
  check("Waze link uses address + city", waze.includes("waze.com") && decodeURIComponent(waze).includes("באר שבע"), decodeURIComponent(waze));

  const wa = await page.$$eval("#runList .stop.active a.btn", (els) =>
    els.map((e) => e.href).filter((h) => h.includes("wa.me")));
  check("pickup WhatsApp link built", wa.length === 1 && wa[0].includes("972500000014"), wa.join(" "));
  check("pickup asks when to collect", decodeURIComponent(wa[0] || "").includes("מתי נוח"), decodeURIComponent(wa[0] || "").slice(-60));

  // דליה's edited number must show up
  const allTel = await page.$$eval("#runList .copy", (els) => els.map((e) => e.textContent.trim()));
  check("edited phone carried into run", allTel.includes("055-0000020"), allTel.join(" | "));

  // the no-phone stop → no dial block, but still a nav link
  const haziva = await page.$$eval("#runList .stop", (els) =>
    els.map((e) => ({ name: e.querySelector(".name").textContent, dial: !!e.querySelector(".dial"), nav: !!e.querySelector("a[href*='waze']") })));
  const h = haziva.find((x) => x.name === "מרים דגן");
  check("no-phone stop still navigable", h && !h.dial && h.nav, JSON.stringify(h));

  // --- mark done ---
  await page.click("#runList [data-done='0']");
  await page.waitForTimeout(150);
  const sub2 = await page.textContent("#subtitle");
  check("pickup done does not count as delivery", sub2.includes("0 מתוך 5"), sub2);
  await page.click("#runList [data-done='1']");
  await page.waitForTimeout(150);
  const sub3 = await page.textContent("#subtitle");
  check("delivery counted", sub3.includes("1 מתוך 5"), sub3);

  // --- undo ---
  await page.click("#runList [data-undo='1']");
  await page.waitForTimeout(150);
  const sub4 = await page.textContent("#subtitle");
  check("undo restores", sub4.includes("0 מתוך 5"), sub4);

  // --- persistence ---
  await page.reload({ waitUntil: "load" });
  const runVisible = await page.isVisible("#viewRun");
  const ptime = await page.inputValue("#ptime");
  check("run survives reload", runVisible && ptime === "11:30", "visible=" + runVisible + " time=" + ptime);


  // --- finish panel offers deletion, and it works ---
  for (const i of [0,1,2,3,4,5]) {
    const btn = await page.$(`#runList [data-done='${i}']`);
    if (btn) { await btn.click(); await page.waitForTimeout(80); }
  }
  await page.waitForTimeout(150);
  const hasClear = await page.isVisible("#clearRunBtn");
  check("finish panel offers to delete the list", hasClear);
  await page.click("#clearRunBtn");
  await page.waitForTimeout(150);
  const afterClear = await page.evaluate(() => {
    const o = JSON.parse(localStorage.getItem("maslul.v1") || "{}");
    return { run: o.run, raw: o.raw, driver: o.settings && o.settings.driver };
  });
  check("deleting clears the run and the pasted text", !afterClear.run && !afterClear.raw, JSON.stringify(afterClear));
  check("deleting keeps the driver's own settings", afterClear.driver === "אריאל", afterClear.driver);

  // --- three-day expiry on open ---
  await page.fill("#raw", LIST);
  await page.click("#parseBtn");
  await page.waitForSelector("#viewReview:not([hidden])");
  await page.click("#startBtn");
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const o = JSON.parse(localStorage.getItem("maslul.v1"));
    o.run.updatedAt = Date.now() - (3 * 24 * 60 * 60 * 1000 + 60000); // 3 days + 1 min
    localStorage.setItem("maslul.v1", JSON.stringify(o));
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(200);
  const gone = await page.evaluate(() => {
    const o = JSON.parse(localStorage.getItem("maslul.v1") || "{}");
    return { run: o.run, raw: o.raw, driver: o.settings && o.settings.driver,
             onImport: !document.getElementById("viewImport").hidden,
             notice: document.getElementById("notice").hidden ? "" : document.getElementById("notice").textContent };
  });
  check("a run older than three days is cleared on open", !gone.run && !gone.raw, JSON.stringify(gone).slice(0,120));
  check("expiry keeps settings and explains itself", gone.driver === "אריאל" && gone.notice.includes("שלושה ימים"), gone.notice);

  // --- a fresh run is NOT cleared ---
  await page.fill("#raw", LIST);
  await page.click("#parseBtn");
  await page.waitForSelector("#viewReview:not([hidden])");
  await page.click("#startBtn");
  await page.waitForTimeout(150);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(200);
  const kept = await page.evaluate(() => !!JSON.parse(localStorage.getItem("maslul.v1") || "{}").run);
  check("a run from today survives", kept);


  // --- geocoding unreachable: the list order must survive, nothing may break ---
  await page.evaluate(() => localStorage.removeItem("maslul.v1"));
  await page.reload({ waitUntil: "load" });
  await page.fill("#raw", LIST);
  await page.click("#parseBtn");
  await page.waitForSelector("#viewReview:not([hidden])");
  await page.waitForTimeout(3000);
  const namesNoNet = await page.$$eval("#reviewList .name", els => els.map(e => e.textContent));
  check("stops survive a failed geocode", namesNoNet.length === 6, namesNoNet.join(" | "));
  check("pickup still first", namesNoNet[0] === "תחנת חלוקה", namesNoNet[0]);
  const autoMsg = await page.textContent("#autoStatus");
  check("the app says it fell back to the list order", /נשאר כמו ברשימה/.test(autoMsg), autoMsg.slice(0, 70));
  const canStart = await page.isEnabled("#startBtn");
  check("the route can still be started", canStart);

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" ;; "));

  await page.screenshot({ path: "shot-run.png", fullPage: false });
  await browser.close();
  server.close();

  console.log(fails.length ? "\n" + fails.length + " FAILURES" : "\nall green");
  process.exit(fails.length ? 1 : 0);
})();
