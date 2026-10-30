// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: list;

// Εξοδούχοι — γράφει τη λίστα εξόδων του θαλάμου.
// Όλα τα δεδομένα μένουν σε αυτό το κινητό (αρχείο exodouxoi.json στα έγγραφα του Scriptable).

const fm = FileManager.local();
const PATH = fm.joinPath(fm.documentsDirectory(), "exodouxoi.json");

const CODES = ["ΔΝ", "Ε", "Ο"];
const LABEL = { "ΔΝ": "ΔΝ", "Ε": "Ε", "Ο": "—" };
const WD = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];
const MODES = { auto: "Πρόταση: αυτόματη", "ΔΝ": "Πρόταση: ΔΝ", "Ε": "Πρόταση: Ε", "Ο": "Πρόταση: —" };

// ---------- Χρώματα ----------
const dyn = (l, d) => Color.dynamic(new Color(l), new Color(d));
const C_ASK = dyn("#fff4cc", "#3a3216");
const C_CODE = { "ΔΝ": dyn("#2f6b2a", "#7fc276"), "Ε": dyn("#b07800", "#f0b429"), "Ο": dyn("#9aa094", "#6b7266") };
const C_MUT = dyn("#6b7266", "#99a093");

// ---------- Δεδομένα ----------
let S;
const uid = () => Math.random().toString(36).slice(2, 9);

function load() {
  try { if (fm.fileExists(PATH)) S = JSON.parse(fm.readString(PATH)); } catch (e) { S = null; }
  if (!S || !S.people) S = { title: "Εξοδούχοι", people: [], days: {}, seed: [] };
  if (!S.seed) S.seed = [];
}
function save() {
  const cut = addDays(TODAY, -120);
  Object.keys(S.days).forEach(k => { if (k < cut) delete S.days[k]; });
  fm.writeString(PATH, JSON.stringify(S));
}

// ---------- Ημερομηνίες ----------
const pad = n => String(n).padStart(2, "0");
const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
const TODAY = ds(new Date());
const dayName = s => WD[pd(s).getDay()];
const dayShort = s => { const d = pd(s); return `${dayName(s)} ${d.getDate()}/${d.getMonth() + 1}`; };

function day(s) { return S.days[s] || (S.days[s] = { codes: {}, conf: {} }); }
// Κλειστή μέρα: έχει περάσει ή έχει σταλεί/εισαχθεί. Δείχνει μόνο την τελική λίστα.
function isClosed(s) {
  const d = S.days[s];
  if (d && d.open) return false;
  if (d && d.closed) return true;
  return s < TODAY;
}
function closeDay(s) {
  const d = day(s);
  S.people.forEach(p => { if (!d.codes[p.id]) d.codes[p.id] = eff(p, s).code; d.conf[p.id] = true; });
  d.closed = true; d.open = false;
}

// ---------- Πρόβλεψη από τις συνήθειες ----------
// Η ίδια μέρα της εβδομάδας μετράει τριπλά. Αν συνήθως βγαίνει Ε ή αλλάζει συχνά → «ρώτα τον».
function predict(p, dateStr) {
  if (MODES[p.mode] && p.mode !== "auto") return { code: p.mode, ask: true };
  const wd = pd(dateStr).getDay();
  const past = Object.keys(S.days)
    .filter(k => k < dateStr && !S.days[k].noExit && S.days[k].codes[p.id])
    .sort().reverse().slice(0, 12)
    .map(k => ({ wd: pd(k).getDay(), code: S.days[k].codes[p.id] }));
  const seed = past.length < 6 ? S.seed.map(x => ({ wd: x.wd, code: x.codes[p.id] })).filter(x => x.code) : [];
  const src = past.concat(seed);
  if (!src.length) return { code: "ΔΝ", ask: true };
  const sc = {}; let tot = 0;
  src.forEach(x => { const w = x.wd === wd ? 3 : 1; sc[x.code] = (sc[x.code] || 0) + w; tot += w; });
  const top = Object.keys(sc).sort((a, b) => sc[b] - sc[a])[0];
  return { code: top, ask: true };
}
function eff(p, s) {
  const d = S.days[s];
  if (isClosed(s)) return { code: (d && d.codes[p.id]) || "Ο", ask: false };
  const pr = predict(p, s);
  if (d && d.codes[p.id] && d.conf[p.id]) return { code: d.codes[p.id], ask: false };
  return { code: pr.code, ask: true };
}
function pendingCount(days) {
  let n = 0;
  days.forEach(s => S.people.forEach(p => { if (eff(p, s).ask) n++; }));
  return n;
}

// ---------- Μήνυμα ----------
function buildMsg(days) {
  let out = S.title + "\n";
  days.forEach(s => {
    out += "\n" + dayName(s) + "\n\n";
    if (S.days[s] && S.days[s].noExit) { out += "Καμία έξοδος\n"; return; }
    S.people.forEach(p => { const e = eff(p, s); if (e.code !== "Ο") out += `${p.name} ${e.code}\n`; });
  });
  return out.trim();
}
function commit(days) { // ό,τι στάλθηκε μένει στο ιστορικό για να μαθαίνει
  days.forEach(s => closeDay(s));
  save();
}

// ---------- Εισαγωγή από κείμενο μηνύματος ----------
const norm = x => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/\s+/g, " ").trim();
const CODE_IN = { "δν": "ΔΝ", "dn": "ΔΝ", "ε": "Ε", "e": "Ε", "ο": "Ο", "o": "Ο" };

function parseText(text) {
  const wdIdx = {}; WD.forEach((w, i) => (wdIdx[norm(w)] = i));
  const sections = []; let curSec = null;
  text.split(/\r?\n/).forEach(raw => {
    const line = raw.trim(); if (!line) return;
    const n = norm(line);
    if (n in wdIdx) { curSec = { wd: wdIdx[n], rows: [] }; sections.push(curSec); return; }
    if (!curSec) return; // τίτλος κ.λπ. πριν την πρώτη μέρα
    if (n === "καμια εξοδοσ") { curSec.noExit = true; return; }
    const parts = line.split(/\s+/);
    let code = "Ο", name = line;
    if (parts.length > 1 && CODE_IN[norm(parts[parts.length - 1])]) {
      code = CODE_IN[norm(parts[parts.length - 1])];
      name = parts.slice(0, -1).join(" ");
    }
    curSec.rows.push({ name, code });
  });
  return sections;
}

// Μαζική προσθήκη: ένα όνομα ανά γραμμή (ή με κόμματα). Δέχεται και ολόκληρο μήνυμα.
function parseNames(text) {
  const wd = new Set(WD.map(norm));
  let lines = text.split(/\r?\n/).flatMap(l => l.split(",")).map(l => l.trim());
  const firstDay = lines.findIndex(l => wd.has(norm(l)));
  if (firstDay >= 0) lines = lines.slice(firstDay);
  const out = [], seen = new Set(S.people.map(p => norm(p.name)));
  lines.forEach(l => {
    if (!l || wd.has(norm(l)) || norm(l) === "καμια εξοδοσ") return;
    const parts = l.split(/\s+/);
    if (parts.length > 1 && CODE_IN[norm(parts[parts.length - 1])]) parts.pop();
    const name = parts.join(" ");
    if (!name || seen.has(norm(name))) return;
    seen.add(norm(name)); out.push(name);
  });
  return out;
}
async function bulkNames() {
  let text = Pasteboard.paste() || "";
  let names = parseNames(text);
  if (!names.length) {
    const v = await askText("Μαζική προσθήκη", "", "Ονόματα χωρισμένα με κόμμα");
    if (!v) {
      const a = new Alert(); a.title = "Δεν βρέθηκαν νέα ονόματα";
      a.message = "Αντίγραψε πρώτα τη λίστα (ένα όνομα ανά γραμμή ή ολόκληρο μήνυμα) και ξαναπάτα. Όσα υπάρχουν ήδη παραλείπονται.";
      a.addAction("OK"); await a.presentAlert(); return;
    }
    names = parseNames(v);
    if (!names.length) return;
  }
  const a = new Alert();
  a.title = `Θα προστεθούν ${names.length}`;
  a.message = names.join("\n");
  a.addAction("Προσθήκη"); a.addCancelAction("Άκυρο");
  if ((await a.presentAlert()) === -1) return;
  names.forEach(n => S.people.push({ id: uid(), name: n, mode: "auto" }));
  save();
}

async function importText() {
  let text = Pasteboard.paste() || "";
  let sections = parseText(text);
  if (!sections.length) {
    const a = new Alert();
    a.title = "Δεν βρέθηκε μήνυμα στο πρόχειρο";
    a.message = "Αντίγραψε πρώτα το μήνυμα (με τίτλο, ονόματα ημερών και ονόματα) και ξαναπάτα Εισαγωγή.";
    a.addAction("OK"); await a.presentAlert(); return;
  }

  // ποια ημερομηνία είναι η πρώτη μέρα
  const first = sections[0].wd;
  const cands = [];
  for (let i = 7; i >= -20; i--) { const d = addDays(TODAY, i); if (pd(d).getDay() === first) cands.push(d); }
  const shown = cands.filter(d => d <= addDays(TODAY, 7)).slice(0, 4);
  const a = new Alert();
  a.title = `Η πρώτη μέρα (${WD[first]}) είναι:`;
  shown.forEach(d => a.addAction(dayShort(d) + (d === TODAY ? " (σήμερα)" : d === addDays(TODAY, 1) ? " (αύριο)" : "")));
  a.addCancelAction("Άκυρο");
  const i = await a.presentSheet();
  if (i === -1) return;

  // ημερομηνίες για κάθε ενότητα, διαδοχικά
  let d0 = shown[i];
  sections[0].date = d0;
  for (let k = 1; k < sections.length; k++) {
    let d = addDays(sections[k - 1].date, 1);
    while (pd(d).getDay() !== sections[k].wd) d = addDays(d, 1);
    sections[k].date = d;
  }

  // αντιστοίχιση ονομάτων
  const byName = {}; S.people.forEach(p => (byName[norm(p.name)] = p));
  const unknown = [];
  sections.forEach(sec => sec.rows.forEach(r => {
    if (!byName[norm(r.name)] && !unknown.some(u => norm(u) === norm(r.name))) unknown.push(r.name);
  }));
  if (unknown.length) {
    const u = new Alert();
    u.title = `${unknown.length} νέα ονόματα`;
    u.message = unknown.join("\n");
    u.addAction("Πρόσθεσέ τους στη λίστα");
    u.addAction("Αγνόησέ τους");
    u.addCancelAction("Άκυρο");
    const r = await u.presentAlert();
    if (r === -1) return;
    if (r === 0) unknown.forEach(n => { const p = { id: uid(), name: n, mode: "auto" }; S.people.push(p); byName[norm(n)] = p; });
  }

  const summary = sections.map(sec => {
    const ex = S.days[sec.date] && Object.keys(S.days[sec.date].codes).length ? " (αντικατάσταση)" : "";
    if (sec.noExit) return `${dayShort(sec.date)}: Καμία έξοδος${ex}`;
    const c = { "ΔΝ": 0, "Ε": 0 }; sec.rows.forEach(r => { if (c[r.code] !== undefined) c[r.code]++; });
    return `${dayShort(sec.date)}: ΔΝ ${c["ΔΝ"]}, Ε ${c["Ε"]}${ex}`;
  }).join("\n");
  const ok = new Alert();
  ok.title = "Εισαγωγή;";
  ok.message = summary + "\n\nΌσοι δεν αναφέρονται ή δεν έχουν κωδικό μετράνε ως «—».";
  ok.addAction("Εισαγωγή"); ok.addCancelAction("Άκυρο");
  if ((await ok.presentAlert()) === -1) { save(); return; }

  sections.forEach(sec => {
    const d = (S.days[sec.date] = { codes: {}, conf: {}, closed: true });
    if (sec.noExit) d.noExit = true;
    S.people.forEach(p => { d.codes[p.id] = "Ο"; d.conf[p.id] = true; });
    sec.rows.forEach(r => { const p = byName[norm(r.name)]; if (p) d.codes[p.id] = r.code; });
  });
  save();
  cur = sections[sections.length - 1].date;
  buildMain();
}

// ---------- Βοηθητικά alerts ----------
async function confirmA(title, ok) {
  const a = new Alert(); a.title = title;
  a.addDestructiveAction(ok); a.addCancelAction("Άκυρο");
  return (await a.presentAlert()) === 0;
}
async function askText(title, value, placeholder) {
  const a = new Alert(); a.title = title;
  a.addTextField(placeholder || "", value || "");
  a.addAction("OK"); a.addCancelAction("Άκυρο");
  if ((await a.presentAlert()) === -1) return null;
  return a.textFieldValue(0).trim();
}
function rowOf(height) { const r = new UITableRow(); r.dismissOnSelect = false; if (height) r.height = height; return r; }
function btn(row, title, weight, fn) {
  const c = row.addButton(title); c.widthWeight = weight; c.dismissOnTap = false; c.centerAligned();
  c.onTap = fn; return c;
}
function txt(row, title, sub, weight) {
  const c = row.addText(title, sub); c.widthWeight = weight; return c;
}

// ---------- Κύρια οθόνη ----------
let cur = TODAY;
let onlyAsk = false;
const table = new UITable();
table.showSeparators = true;

function buildMain() {
  table.removeAllRows();

  const h = rowOf(44); h.isHeader = true;
  const ht = txt(h, S.title, null, 100); ht.titleFont = Font.boldSystemFont(18);
  table.addRow(h);

  // επιλογή ημέρας
  const dr = rowOf(50);
  btn(dr, "◀", 15, () => { cur = addDays(cur, -1); buildMain(); });
  const dt = txt(dr, dayShort(cur), cur === TODAY ? "σήμερα" : (cur === addDays(TODAY, 1) ? "αύριο" : null), 55);
  dt.centerAligned(); dt.titleFont = Font.boldSystemFont(17);
  btn(dr, "▶", 15, () => { cur = addDays(cur, 1); buildMain(); });
  btn(dr, "Σήμ.", 15, () => { cur = TODAY; buildMain(); });
  table.addRow(dr);

  if (!S.people.length) {
    const er = rowOf(60); const ec = txt(er, "Δεν υπάρχουν ακόμα άτομα", "πρόσθεσε ονόματα για να ξεκινήσεις", 100); ec.centerAligned(); table.addRow(er);
    const b1 = rowOf(50); btn(b1, "📋 Μαζική προσθήκη (από πρόχειρο)", 100, async () => { await bulkNames(); buildMain(); }); table.addRow(b1);
    const b2 = rowOf(50); btn(b2, "📥 Εισαγωγή από παλιό μήνυμα", 100, () => importText()); table.addRow(b2);
    const b3 = rowOf(50); btn(b3, "⚙️ Λίστα", 100, () => settings()); table.addRow(b3);
    table.reload(); return;
  }
  if (isClosed(cur)) { buildClosed(); return; }

  // σύνολα
  const cnt = { "ΔΝ": 0, "Ε": 0, "Ο": 0 }; let ask = 0;
  S.people.forEach(p => { const e = eff(p, cur); cnt[e.code]++; if (e.ask) ask++; });
  const sr = rowOf(34);
  const st = txt(sr, `ΔΝ ${cnt["ΔΝ"]}   Ε ${cnt["Ε"]}   — ${cnt["Ο"]}`, null, 60);
  st.titleFont = Font.systemFont(14); st.titleColor = C_MUT;
  const sa = txt(sr, ask ? `Έμειναν: ${ask}` : "✓ όλοι", null, 40);
  sa.rightAligned(); sa.titleFont = Font.boldSystemFont(14);
  if (ask) sr.backgroundColor = C_ASK;
  table.addRow(sr);

  // ενέργειες
  const ar = rowOf(46);
  btn(ar, onlyAsk ? "Όλοι" : "Μόνο εκκρεμή", 36, () => { onlyAsk = !onlyAsk; buildMain(); });
  btn(ar, "✉️ Μήνυμα", 34, () => messageFlow());
  btn(ar, "⚙️ Λίστα", 30, () => settings());
  table.addRow(ar);

  // άτομα
  let shown = 0;
  S.people.forEach(p => {
    const e = eff(p, cur);
    if (onlyAsk && !e.ask) return;
    shown++;
    const r = rowOf(54);
    if (e.ask) r.backgroundColor = C_ASK;
    const n = txt(r, p.name, e.ask ? "πρόταση" : null, 34);
    n.titleFont = Font.semiboldSystemFont(16);
    const v = txt(r, LABEL[e.code] + (e.ask ? "?" : ""), null, 12);
    v.centerAligned(); v.titleFont = Font.boldSystemFont(17); v.titleColor = C_CODE[e.code];
    const setCode = c => () => { const d = day(cur); d.codes[p.id] = c; d.conf[p.id] = true; save(); buildMain(); };
    btn(r, "ΔΝ", 13, setCode("ΔΝ"));
    btn(r, "Ε", 11, setCode("Ε"));
    btn(r, "—", 11, setCode("Ο"));
    if (e.ask) btn(r, "✓", 11, setCode(e.code));
    else txt(r, "", null, 11);
    table.addRow(r);
  });
  if (onlyAsk && !shown) {
    const r = rowOf(50); const c = txt(r, "Όλοι επιβεβαιωμένοι 👍", null, 100); c.centerAligned(); table.addRow(r);
  }

  const cr = rowOf(46);
  btn(cr, "🚫 Καμία έξοδος", 45, async () => {
    if (!(await confirmA(`${dayShort(cur)}: κανείς δεν βγαίνει;`, "Καμία έξοδος"))) return;
    const d = (S.days[cur] = { codes: {}, conf: {}, noExit: true });
    S.people.forEach(p => { d.codes[p.id] = "Ο"; d.conf[p.id] = true; });
    d.closed = true; save(); buildMain();
  });
  btn(cr, "🔒 Κλείσε (τελική)", 55, async () => {
    if (ask && !(await confirmA(`${ask} δεν έχουν επιβεβαιωθεί. Κλείσιμο με τις προτάσεις;`, "Κλείσιμο"))) return;
    closeDay(cur); save(); buildMain();
  });
  table.addRow(cr);

  const rr = rowOf(46);
  btn(rr, "📥 Εισαγωγή κειμένου", 55, () => importText());
  btn(rr, "↺ Μηδένισε μέρα", 45, async () => {
    if (await confirmA(`Μηδενισμός: ${dayShort(cur)};`, "Μηδενισμός")) { delete S.days[cur]; save(); buildMain(); }
  });
  table.addRow(rr);

  table.reload();
}

function buildClosed() {
  const d = S.days[cur];
  const hasData = d && Object.keys(d.codes).length;
  const noExit = d && d.noExit;
  const cnt = { "ΔΝ": 0, "Ε": 0, "Ο": 0 };
  S.people.forEach(p => cnt[eff(p, cur).code]++);

  const sr = rowOf(34);
  const st = txt(sr, noExit ? "🚫 Καμία έξοδος" : hasData ? `ΔΝ ${cnt["ΔΝ"]}   Ε ${cnt["Ε"]}   — ${cnt["Ο"]}` : "Δεν υπάρχουν δεδομένα", null, 70);
  st.titleFont = Font.systemFont(14); st.titleColor = C_MUT;
  const lk = txt(sr, hasData ? "🔒 τελική" : "", null, 30); lk.rightAligned(); lk.titleFont = Font.boldSystemFont(14);
  table.addRow(sr);

  const ar = rowOf(46);
  btn(ar, "✉️ Μήνυμα", 34, () => messageFlow());
  btn(ar, "✎ Αλλαγή", 33, async () => {
    if (await confirmA(`Άνοιγμα της ${dayShort(cur)} για αλλαγές;`, "Άνοιγμα")) {
      if (noExit) { S.days[cur] = { codes: {}, conf: {}, open: true }; }
      else { const x = day(cur); x.open = true; x.closed = false; }
      save(); buildMain();
    }
  });
  btn(ar, "⚙️ Λίστα", 33, () => settings());
  table.addRow(ar);

  if (noExit) {
    const r = rowOf(60); const c = txt(r, "🚫 Καμία έξοδος", null, 100);
    c.centerAligned(); c.titleFont = Font.boldSystemFont(18); table.addRow(r);
  } else if (hasData) {
    S.people.forEach(p => {
      const e = eff(p, cur);
      if (e.code === "Ο") return;
      const r = rowOf(40);
      const n = txt(r, p.name, null, 75); n.titleFont = Font.systemFont(16);
      const v = txt(r, e.code, null, 25); v.rightAligned(); v.titleFont = Font.boldSystemFont(16); v.titleColor = C_CODE[e.code];
      table.addRow(r);
    });
  }

  const rr = rowOf(46);
  btn(rr, "📥 Εισαγωγή κειμένου", 100, () => importText());
  table.addRow(rr);
  table.reload();
}

async function messageFlow() {
  const a = new Alert();
  a.title = "Ποιες μέρες στο μήνυμα;";
  const opts = [1, 2, 3, 4];
  opts.forEach(n => {
    const list = Array.from({ length: n }, (_, i) => dayName(addDays(cur, i)));
    a.addAction(list.join(" + "));
  });
  a.addCancelAction("Άκυρο");
  const i = await a.presentSheet();
  if (i === -1) return;
  const days = Array.from({ length: opts[i] }, (_, k) => addDays(cur, k));
  const text = buildMsg(days);
  const pend = pendingCount(days);

  const b = new Alert();
  b.title = pend ? `⚠️ ${pend} δεν έχουν επιβεβαιωθεί` : "Μήνυμα";
  b.message = text;
  b.addAction("Αποστολή");
  b.addAction("Αντιγραφή");
  b.addCancelAction("Άκυρο");
  const r = await b.presentAlert();
  if (r === 0) { commit(days); await ShareSheet.present([text]); }
  else if (r === 1) {
    commit(days); Pasteboard.copy(text);
    const ok = new Alert(); ok.title = "Αντιγράφηκε ✓"; ok.addAction("OK"); await ok.presentAlert();
  }
  buildMain();
}

// ---------- Ρυθμίσεις / λίστα ----------
async function settings() {
  const t = new UITable();
  t.showSeparators = true;

  function build() {
    t.removeAllRows();
    const h = rowOf(44); h.isHeader = true;
    txt(h, "Λίστα ατόμων", "με τη σειρά του μηνύματος", 100).titleFont = Font.boldSystemFont(18);
    t.addRow(h);

    const tr = rowOf(50);
    txt(tr, "Τίτλος", S.title, 75);
    btn(tr, "✎", 25, async () => { const v = await askText("Τίτλος μηνύματος", S.title); if (v) { S.title = v; save(); build(); } });
    t.addRow(tr);

    const hint = rowOf(60);
    const hc = txt(hint, "Η πρόταση απλώς προσυμπληρώνει. Κάθε μέρα επιβεβαιώνεις τον καθένα με ✓ ή αλλάζεις. «Αυτόματη»: μαθαίνει από τις προηγούμενες μέρες.", null, 100);
    hc.titleFont = Font.systemFont(13); hc.titleColor = C_MUT;
    t.addRow(hint);

    S.people.forEach((p, i) => {
      const r = rowOf(54);
      const n = txt(r, p.name, MODES[p.mode] || MODES.auto, 46);
      n.titleFont = Font.semiboldSystemFont(16);
      btn(r, "✎", 13, async () => { const v = await askText("Όνομα", p.name); if (v) { p.name = v; save(); build(); } });
      btn(r, "⚙︎", 13, async () => {
        const a = new Alert(); a.title = p.name;
        const keys = Object.keys(MODES);
        keys.forEach(k => a.addAction((p.mode === k ? "✓ " : "") + MODES[k]));
        a.addCancelAction("Άκυρο");
        const k = await a.presentSheet();
        if (k !== -1) { p.mode = keys[k]; save(); build(); }
      });
      btn(r, "↑", 13, () => {
        if (i > 0) { [S.people[i - 1], S.people[i]] = [S.people[i], S.people[i - 1]]; save(); build(); }
      });
      btn(r, "✕", 15, async () => {
        if (await confirmA(`Διαγραφή ${p.name};`, "Διαγραφή")) { S.people.splice(i, 1); save(); build(); }
      });
      t.addRow(r);
    });

    const ad = rowOf(50);
    btn(ad, "+ Προσθήκη ατόμου", 100, async () => {
      const v = await askText("Νέο άτομο", "", "Επώνυμο");
      if (v) { S.people.push({ id: uid(), name: v, mode: "auto" }); save(); build(); }
    });
    t.addRow(ad);
    const bk = rowOf(50);
    btn(bk, "📋 Μαζική προσθήκη (από πρόχειρο)", 100, async () => { await bulkNames(); build(); });
    t.addRow(bk);

    const bh = rowOf(40); bh.isHeader = true;
    txt(bh, "Αντίγραφο ασφαλείας", "τα δεδομένα είναι μόνο σε αυτό το κινητό", 100);
    t.addRow(bh);
    const br = rowOf(50);
    btn(br, "Εξαγωγή", 50, async () => { await ShareSheet.present([JSON.stringify(S)]); });
    btn(br, "Εισαγωγή", 50, async () => {
      const v = await askText("Επικόλλησε το αντίγραφο", "");
      if (!v) return;
      try {
        const o = JSON.parse(v); if (!o.people) throw 0;
        S = o; save(); build();
      } catch (e) {
        const er = new Alert(); er.title = "Μη έγκυρο αντίγραφο"; er.addAction("OK"); await er.presentAlert();
      }
    });
    t.addRow(br);

    t.reload();
  }

  build();
  await t.present(false);
  buildMain();
}

// ---------- Έναρξη ----------
load();
save();
buildMain();
await table.present(true);
save();
Script.complete();
