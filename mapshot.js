// Renders the map tab with a known set of coordinates and saves a picture,
// so the drawing can be looked at without a live geocoder.
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const T = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };

const srv = http.createServer((req, res) => {
  let p = req.url.split("?")[0]; if (p === "/") p = "/index.html";
  const f = path.join(__dirname, p);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": T[path.extname(f)] || "text/plain" });
  res.end(fs.readFileSync(f));
});

// real Be'er Sheva street coordinates, invented names
const STOPS = [
  ["נקודת איסוף", "הרצל 4", 31.26995, 34.80512, "pickup"],
  ["עצירה א", "ויצמן 18", 31.26131, 34.79200, "drop"],
  ["עצירה ב", "האלון 33", 31.26063, 34.79231, "drop"],
  ["עצירה ג", "הגפן 68", 31.26104, 34.79092, "drop"],
  ["עצירה ד", "הגפן 68", 31.26104, 34.79092, "drop"],
  ["עצירה ה", "הכלנית 21", 31.26416, 34.78965, "drop"],
  ["עצירה ו", "השקד 10", 31.27279, 34.76055, "drop"]
];

(async () => {
  await new Promise(r => srv.listen(8141, r));
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const pg = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto("http://localhost:8141/", { waitUntil: "load" });

  await pg.evaluate((stops) => {
    localStorage.setItem("maslul.v1", JSON.stringify({
      settings: { driver: "אריאל", org: "עמותה", item: "הסל", city: "באר שבע" },
      raw: "",
      run: {
        deadline: "12:00", problems: [], pickupTime: "11:30", updatedAt: Date.now(),
        stops: stops.map(([name, addr, lat, lng, kind], i) => ({
          kind, name, addr, phones: [], qty: "", notes: [], warns: [],
          done: i === 1, listIndex: i, lat, lng, located: true
        }))
      }
    }));
  }, STOPS);

  await pg.reload({ waitUntil: "load" });
  await pg.click("#tabMap");
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: "map-shot.png", fullPage: false });

  // and the case where nothing was located
  await pg.evaluate(() => {
    const o = JSON.parse(localStorage.getItem("maslul.v1"));
    o.run.stops.forEach(s => { delete s.lat; delete s.lng; s.located = false; });
    localStorage.setItem("maslul.v1", JSON.stringify(o));
  });
  await pg.reload({ waitUntil: "load" });
  await pg.click("#tabMap");
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: "map-empty.png" });

  // the footer and the forced refresh live in the settings
  await pg.click("#settingsBtn");
  await pg.waitForTimeout(200);
  await pg.screenshot({ path: "map-settings.png", fullPage: true });
  const stamp = await pg.evaluate(() => ({
    footer: document.querySelector("footer").innerText.replace(/\n+/g, " | "),
    wa: document.getElementById("builder").href,
    version: document.getElementById("appver").textContent,
    hasRefresh: !!document.getElementById("refreshBtn")
  }));
  console.log(JSON.stringify(stamp, null, 1));

  console.log(errs.length ? "PAGE ERRORS: " + errs.join(" ;; ") : "no page errors");
  await b.close(); srv.close();
})();
