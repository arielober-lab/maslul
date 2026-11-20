// ---- PARSER START ----
(function (root) {
  "use strict";

  var PICKUP_RE = /(אוסף\s+מ|לאסוף\s+מ|איסוף\s+מ|אתה\s+אוסף\s+מ)/;
  var DELIVER_RE = /(מעביר\s+ל|מוסר\s+ל|להעביר\s+ל|מחלק\s+ל|ומעביר\s+ל)/;
  var ALSO_RE = /^ו?ל\s*:\s*/;
  var DEADLINE_RE = /(?:לאסוף|איסוף|להגיע)[^\n]*?עד[^\n]*?(\d{1,2}[:.]\d{2})/;
  var PHONE_RE = /(?:^|[^\d])(0\d{1,2}[-\s.]?\d{3}[-\s.]?\d{4}|0\d{1,2}[-\s.]?\d{7}|0\d{9,10})(?!\d)/g;

  // Lines that describe how to reach the door — folded into the address.
  var ADDR_EXTRA_RE = /(כניסה|קומה|דירה|קרקע|דלת|בניין|מול\s|פינת|שכונה)/;
  // Lines that are instructions to the driver — kept as notes.
  var NOTE_RE = /(קוד|מעלית|אינטרקום|אין\s+טלפון|להתקשר|לתאם|ליצור\s+קשר|ביד|כתוב|בעלה|אשתו|איש\s+קשר|להשתדל|לנסות)/;
  // Only these open a line that can never be the address, even with a number in it.
  var PURE_NOTE_RE = /^\s*(אין|יש|כתוב|להתקשר|לתאם|לנסות|ליצור|להשתדל|למסור|רצוי|עדיף|איש\s+קשר|קוד|טל|נייד)/;

  function stripEmphasis(s) {
    return s.replace(/\*+/g, "").trim();
  }

  function isEmphasised(s) {
    return /^\s*\*{1,3}[^*]+\*{1,3}\s*$/.test(s);
  }

  function hasDigit(s) {
    return /\d/.test(s);
  }

  function findPhones(s) {
    var out = [];
    var m;
    PHONE_RE.lastIndex = 0;
    while ((m = PHONE_RE.exec(s)) !== null) {
      out.push(m[1].replace(/[\s.]/g, "-").replace(/--+/g, "-"));
    }
    return out;
  }

  function isPhoneLine(s) {
    var bare = s.replace(/[^\d]/g, "");
    if (bare.length < 9) return false;
    var phones = findPhones(s);
    if (!phones.length) return false;
    // A phone line is mostly digits, separators and commas.
    var rest = s;
    phones.forEach(function (p) {
      rest = rest.replace(new RegExp(p.replace(/-/g, "[-\\s.]?"), ""), "");
    });
    return rest.replace(/[\s,\-:/]|טל|טלפון|נייד/g, "").length <= 3;
  }

  function normalizeName(line) {
    var name = stripEmphasis(line);
    var qty = "";
    var note = "";

    // "שגית - 2 חלות"  →  name + quantity
    var dash = name.match(/^(.+?)\s+[-–]\s+(.*\d.*)$/);
    if (dash) {
      name = dash[1].trim();
      qty = dash[2].trim();
    }

    // "חציבה אסרף (ללא אורז)"  →  name + note
    var paren = name.match(/^(.*?)\s*[(（]([^)）]+)[)）]\s*$/);
    if (paren) {
      name = paren[1].trim();
      note = paren[2].trim();
    }

    return { name: name.replace(/[:：]\s*$/, "").trim(), qty: qty, note: note };
  }

  function parseBlock(lines) {
    var stop = {
      name: "",
      addr: "",
      phones: [],
      qty: "",
      notes: [],
      warns: []
    };

    var rest = [];
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      if (isPhoneLine(line)) {
        findPhones(line).forEach(function (p) {
          if (stop.phones.indexOf(p) === -1) stop.phones.push(p);
        });
        return;
      }
      rest.push(line);
    });

    if (!rest.length) return null;

    // A block may open with an emphasised instruction ("***מנה צמחונית***")
    // before the name. Those are warnings, not the name.
    while (rest.length > 1 && isEmphasised(rest[0])) {
      stop.warns.push(stripEmphasis(rest.shift()));
    }

    var first = normalizeName(rest.shift());
    stop.name = first.name;
    stop.qty = first.qty;
    if (first.note) stop.warns.push(first.note);

    rest.forEach(function (line) {
      var emphasised = isEmphasised(line);
      var text = stripEmphasis(line);
      if (!text) return;

      // A phone hiding at the end of a descriptive line.
      var inline = findPhones(text);
      if (inline.length) {
        inline.forEach(function (p) {
          if (stop.phones.indexOf(p) === -1) stop.phones.push(p);
        });
        text = text.replace(/[֐-׿\w'" ]*[:：]?\s*0[\d\-\s.]{8,}/g, "").trim();
        text = text.replace(/[,\-–:]\s*$/, "").trim();
        // What survives a phone line is usually a bare label ("בעלה") — drop it.
        if (text.length < 5) return;
      }

      if (emphasised) {
        stop.warns.push(text);
        return;
      }

      var isNoteish = NOTE_RE.test(text);
      var isAddrExtra = ADDR_EXTRA_RE.test(text);

      // The first line after the name that carries a number is the address,
      // even when it also mentions a building code or a floor.
      if (!stop.addr && hasDigit(text) && !PURE_NOTE_RE.test(text)) {
        stop.addr = text;
        return;
      }
      if (!stop.addr && !isNoteish && !hasDigit(text) && rest.indexOf(line) === 0) {
        stop.addr = text;
        return;
      }
      if (stop.addr && isAddrExtra && !isNoteish && text.length < 40) {
        if (stop.addr.split(" · ").indexOf(text) === -1) stop.addr += " · " + text;
        return;
      }
      if (stop.notes.indexOf(text) === -1) stop.notes.push(text);
    });

    // "אהרון מסקין 24 (בית כנסת)" — the name itself is the address.
    if (!stop.addr && hasDigit(stop.name)) stop.addr = stop.name;
    if (!stop.addr && stop.notes.length) stop.addr = stop.notes.shift();

    return stop;
  }

  // "מאפיית מישייב ,כתובת: שאול המלך 111" — one line holding name and address.
  function splitHead(text) {
    var m = text.match(/^(.*?)[,\s]*כתובת\s*[:：]\s*(.+)$/);
    if (m && m[1].trim() && m[2].trim()) return [m[1].trim(), m[2].trim()];
    return null;
  }

  function cleanHead(text, marker) {
    var out = stripEmphasis(text).replace(marker, "");
    out = out.replace(/^[ו\s:：,־\-]+/, "").replace(/[\s:：,]+$/, "");
    return out.length > 1 ? out : "";
  }

  function splitBlocks(lines) {
    var blocks = [];
    var current = [];
    lines.forEach(function (raw) {
      var line = raw.trim();
      var starter = ALSO_RE.test(line);
      if (!line) {
        if (current.length) { blocks.push(current); current = []; }
        return;
      }
      if (starter) {
        if (current.length) { blocks.push(current); current = []; }
        var remainder = line.replace(ALSO_RE, "").trim();
        if (remainder) current.push(remainder);
        return;
      }
      current.push(line);
    });
    if (current.length) blocks.push(current);
    return blocks;
  }

  function parseList(text) {
    var result = { deadline: "", stops: [], problems: [] };
    if (!text || !text.trim()) {
      result.problems.push("הרשימה ריקה");
      return result;
    }

    var raw = text.replace(/\r/g, "").split("\n");
    var lines = [];

    raw.forEach(function (line) {
      var plain = stripEmphasis(line);
      var dl = plain.match(DEADLINE_RE);
      if (dl && !result.deadline) {
        result.deadline = dl[1].replace(".", ":");
        var leftover = plain.replace(DEADLINE_RE, "").replace(/[*]/g, "").trim();
        if (!leftover || leftover.length < 4) return;
      }
      lines.push(line);
    });

    var pickupAt = -1;
    var deliverAt = -1;
    for (var i = 0; i < lines.length; i++) {
      var plain = stripEmphasis(lines[i]);
      if (pickupAt === -1 && PICKUP_RE.test(plain)) pickupAt = i;
      if (deliverAt === -1 && DELIVER_RE.test(plain)) deliverAt = i;
    }

    var pickupLines = [];
    var deliverLines = [];

    if (pickupAt !== -1) {
      var pHead = cleanHead(lines[pickupAt], PICKUP_RE);
      if (pHead) {
        var split = splitHead(pHead);
        if (split) { pickupLines.push(split[0]); pickupLines.push(split[1]); }
        else pickupLines.push(pHead);
      }
      var pEnd = deliverAt !== -1 && deliverAt > pickupAt ? deliverAt : lines.length;
      for (var j = pickupAt + 1; j < pEnd; j++) pickupLines.push(lines[j]);
    }

    if (deliverAt !== -1) {
      var dHead = cleanHead(lines[deliverAt], DELIVER_RE);
      if (dHead) deliverLines.push(dHead);
      for (var k = deliverAt + 1; k < lines.length; k++) deliverLines.push(lines[k]);
    } else if (pickupAt === -1) {
      deliverLines = lines.slice();
    }

    var pickupBlocks = splitBlocks(pickupLines).filter(function (b) { return b.length; });
    if (pickupBlocks.length) {
      var p = parseBlock(pickupBlocks[0]);
      if (p) {
        p.kind = "pickup";
        // Anything else in the pickup section is what to collect — a checklist.
        for (var q = 1; q < pickupBlocks.length; q++) {
          pickupBlocks[q].forEach(function (line) {
            var t = stripEmphasis(line);
            if (t && p.notes.indexOf(t) === -1) p.notes.push(t);
          });
        }
        result.stops.push(p);
      }
    }

    splitBlocks(deliverLines).forEach(function (b) {
      var s = parseBlock(b);
      if (s && s.name) {
        s.kind = "drop";
        result.stops.push(s);
      }
    });

    result.stops.forEach(function (s) {
      if (!s.addr) result.problems.push("לא זוהתה כתובת עבור " + (s.name || "עצירה"));
    });

    if (!result.stops.length) result.problems.push("לא זוהו עצירות ברשימה");

    return result;
  }

  root.parseList = parseList;
})(typeof module !== "undefined" && module.exports ? module.exports : (window.RouteParse = {}));
// ---- PARSER END ----
