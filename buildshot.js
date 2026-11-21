const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const T = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json", ".png":"image/png" };
const srv = http.createServer((q,r)=>{let u=q.url.split("?")[0]; if(u==="/")u="/index.html";
  const f=path.join(__dirname,u); if(!fs.existsSync(f)){r.writeHead(404);r.end();return;}
  r.writeHead(200,{"Content-Type":T[path.extname(f)]||"text/plain"}); r.end(fs.readFileSync(f));});

const LIST = `*יש לאסוף עד השעה 12:00*
אוסף מ:
תחנת חלוקה
הערבה 4
050-0000014

ומעביר ל:
שרה אביב
הכלנית 68/1
050-0000015

מרים דגן (ללא אורז)
הכלנית 68/18 כניסה ג
אין טלפון

אורית נוי
הסביון 18
050-0000017`;

(async () => {
  await new Promise(r => srv.listen(8151, r));
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const pg = await b.newPage({ viewport: { width: 420, height: 880 }, deviceScaleFactor: 2 });
  await pg.goto("http://localhost:8151/", { waitUntil: "load" });
  await pg.fill("#raw", LIST);
  await pg.click("#parseBtn");
  await pg.waitForTimeout(150);
  await pg.screenshot({ path: "shot-building.png" });
  await pg.waitForSelector("#reviewReady:not([hidden])", { timeout: 30000 });
  // give the stops coordinates so the ready screen shows the real message
  await pg.evaluate(() => {
    const o = JSON.parse(localStorage.getItem("maslul.v1"));
    o.run.stops.forEach((s,i)=>{ s.lat=31.25+i*0.004; s.lng=34.78+i*0.003; s.located=true; });
    localStorage.setItem("maslul.v1", JSON.stringify(o));
  });
  await pg.reload({ waitUntil: "load" });
  await pg.click("#editRun");
  await pg.waitForSelector("#reviewReady:not([hidden])");
  await pg.evaluate(() => {
    const st = document.getElementById("autoStatus");
    st.hidden = false;
    st.textContent = "המסלול מוכן — 3 מסירות, מסודרות לפי קרבה מנקודת האיסוף.";
  });
  await pg.evaluate(() => window.scrollTo(0, 0));
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: "shot-ready.png" });
  // and the same screen after scrolling into the middle of the list
  await pg.evaluate(() => window.scrollTo(0, 700));
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: "shot-scrolled.png" });
  await b.close(); srv.close();
  console.log("ok");
})();
