"use strict";

/**
 * DSA Repetition Tracker — front-end logic.
 *
 * Spaced-repetition study tracker with two review systems:
 *   System 1 — per problem: review 1 day (+1) and 3 days (+3) after solving.
 *   System 2 — per block: review the whole block 7 days (+7) and 30 days (+30)
 *              after finishing it, with an 80% pass rule.
 *
 * State is a single plain object (problems, blocks, a break flag). It is kept in
 * two places: the local server's data.json (source of truth when running via
 * server.py) and localStorage (fallback / cache). Everything is date-driven —
 * dates are stored as "YYYY-MM-DD" strings and compared against today.
 */

/* ------------------------------------------------------------------ *
 * Date helpers — all dates are local "YYYY-MM-DD" strings.
 * ------------------------------------------------------------------ */

const DAY = 86400000; // one day in milliseconds

// Today as a local "YYYY-MM-DD" string (en-CA gives that exact format).
const todayISO = () => new Date().toLocaleDateString("en-CA");

// Parse a "YYYY-MM-DD" string into a local Date (no timezone surprises).
function parseISO(s) {
  const p = s.split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

// Return the date `n` days after the given ISO date, as an ISO string.
function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

// Whole-day difference a - b (positive if a is later than b).
function diffDays(a, b) {
  return Math.round((parseISO(a) - parseISO(b)) / DAY);
}

// Human-friendly label for the UI, e.g. "Fri 18 Sep".
function fmt(iso) {
  return parseISO(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// A review is overdue if its due date is strictly before today.
function overdue(iso) {
  return diffDays(iso, todayISO()) < 0;
}

// A review is "due" if its due date is today or earlier.
function isDue(iso) {
  return diffDays(iso, todayISO()) <= 0;
}

// Escape user text before putting it into innerHTML.
function esc(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

/* ------------------------------------------------------------------ *
 * Default data — used on first run (or when no saved data exists).
 * Each problem tracks its +1 and +3 reviews; the block tracks +7/+30.
 * ------------------------------------------------------------------ */

function buildDefault() {
  // [problem name, date solved]
  const P = [
    ["Concatenation of Array", "2026-09-18"],
    ["Contains Duplicate", "2026-09-18"],
    ["Two Sum", "2026-09-18"],
    ["Valid Anagram", "2026-09-18"],
    ["LRU Cache", "2026-09-18"],
    ["Range Sum Query - Immutable", "2026-09-19"],
    ["Range Sum Query 2D - Immutable", "2026-09-19"],
    ["Find Pivot Index", "2026-09-19"],
    ["Product of Array Except Self", "2026-09-19"],
    ["Subarray Sum Equals K", "2026-09-19"],
    ["Longest Common Prefix", "2026-09-20"],
    ["Group Anagrams", "2026-09-20"],
    ["Remove Element", "2026-09-20"],
    ["Majority Element", "2026-09-20"],
    ["Design HashSet", "2026-09-20"],
    ["Design HashMap", "2026-09-22"],
    ["Top K Frequent Elements", "2026-09-22"],
    ["Encode and Decode Strings", "2026-09-22"],
    ["Sort an Array", "2026-09-23"],
    ["Sort Colors", "2026-09-23"],
    ["Valid Sudoku", "2026-09-24"],
    ["Longest Consecutive Sequence", "2026-09-24"],
    ["Best Time to Buy and Sell Stock II", "2026-09-24"],
    ["Majority Element II", "2026-09-25"],
    ["First Missing Positive", "2026-09-25"],
  ];

  // Turn each [name, solved] pair into a full problem record, with the
  // +1 and +3 review dates computed from the solved date.
  const problems = P.map((p, i) => ({
    id: "p" + i,
    name: p[0],
    block: "Arrays & Hashing",
    solved: p[1],
    p1due: addDays(p[1], 1),
    p1done: false,
    p3due: addDays(p[1], 3),
    p3done: false,
    note: "",
  }));

  // The starting block, already finished, so its +7/+30 reviews are scheduled.
  const blocks = [{
    id: "b0",
    name: "Arrays & Hashing",
    finished: "2026-09-25",
    s7due: addDays("2026-09-25", 7),
    s7done: false,
    s30due: addDays("2026-09-25", 30),
    s30done: false,
    status: "review",
  }];

  return { problems, blocks, brk: { active: false, startedAt: null }, v: 2 };
}

/* ------------------------------------------------------------------ *
 * State + persistence.
 * `state` is the single source of truth in memory. It is mirrored to
 * localStorage always, and to the server's data.json when we're served
 * over http (i.e. launched through server.py rather than opened as a file).
 * ------------------------------------------------------------------ */

let state = null;   // the whole app state (problems, blocks, break flag)
let review = null;  // scratch object while a block review modal is open
const LS = "dsa_tracker_state";

// True when the page is served by server.py (http/https), false for file://.
const SERVER = location.protocol === "http:" || location.protocol === "https:";

// Read state from localStorage (returns null if empty or unreadable).
function loadLS() {
  try {
    const r = localStorage.getItem(LS);
    return r ? JSON.parse(r) : null;
  } catch (e) {
    return null;
  }
}

// Mirror state into localStorage (best-effort, never throws).
function saveLS() {
  try {
    localStorage.setItem(LS, JSON.stringify(state));
  } catch (e) { }
}

// Load state from the local server's data.json, or null if unavailable.
async function serverLoad() {
  try {
    const r = await fetch("/data", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      if (d && d.problems) {
        return d;
      }
    }
  } catch (e) { }
  return null;
}

// Write the current state to the server's data.json (fire-and-forget).
async function serverSave() {
  try {
    await fetch("/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch (e) { }
}

// Single entry point after any change: persist everywhere, then re-render.
function save() {
  saveLS();
  render();
  if (SERVER) {
    serverSave();
  }
}

/* ------------------------------------------------------------------ *
 * Scheduling — decide what shows up under "Due today".
 * ------------------------------------------------------------------ */

// Collect every review that is due today (or overdue). Nothing is due while
// a break is active.
function dueItems() {
  if (state.brk.active) {
    return [];
  }

  const out = [];

  // System 1: each problem's +1 and +3 reviews, if not done and due.
  for (const p of state.problems) {
    if (!p.p1done && isDue(p.p1due)) {
      out.push({ kind: "s1", stage: "+1", p });
    }
    if (!p.p3done && isDue(p.p3due)) {
      out.push({ kind: "s1", stage: "+3", p });
    }
  }

  // System 2: a finished block's +7 first, then its +30 once +7 is done.
  for (const b of state.blocks) {
    if (!b.finished) {
      continue;
    }
    if (!b.s7done && b.s7due && isDue(b.s7due)) {
      out.push({ kind: "s2", stage: "+7", b });
    } else if (b.s7done && !b.s30done && b.s30due && isDue(b.s30due)) {
      out.push({ kind: "s2", stage: "+30", b });
    }
  }

  return out;
}

// Lookups by id.
function findP(id) {
  return state.problems.find((x) => x.id === id);
}

function findB(id) {
  return state.blocks.find((x) => x.id === id);
}

// Drop a problem back into System 1 (used when it fails a block review):
// its +1 and +3 are rescheduled from today and marked not done.
function recycle(p) {
  p.p1done = false;
  p.p1due = addDays(todayISO(), 1);
  p.p3done = false;
  p.p3due = addDays(todayISO(), 3);
}

/* ------------------------------------------------------------------ *
 * Break / resume.
 * On resume we shift the whole schedule FORWARD so the earliest pending
 * review lands on the day you came back, keeping the gaps between reviews.
 * That way you return to a normal pace instead of a pile of overdue items.
 * The shift is forward-only: if nothing is overdue, nothing moves.
 * ------------------------------------------------------------------ */

function endBreak() {
  const t = todayISO();

  // Find the earliest pending due date across all reviews.
  let earliest = null;
  const consider = (iso) => {
    if (iso && (earliest === null || diffDays(iso, earliest) < 0)) {
      earliest = iso;
    }
  };

  for (const p of state.problems) {
    if (!p.p1done) {
      consider(p.p1due);
    }
    if (!p.p3done) {
      consider(p.p3due);
    }
  }

  for (const b of state.blocks) {
    if (b.finished) {
      if (!b.s7done) {
        consider(b.s7due);
      } else if (!b.s30done) {
        consider(b.s30due);
      }
    }
  }

  // How many days to push everything forward so `earliest` becomes today.
  let offset = 0;
  if (earliest !== null) {
    const gap = diffDays(t, earliest);
    if (gap > 0) {
      offset = gap;
    }
  }

  // Apply the same forward shift to every pending due date.
  if (offset > 0) {
    for (const p of state.problems) {
      if (!p.p1done) {
        p.p1due = addDays(p.p1due, offset);
      }
      if (!p.p3done) {
        p.p3due = addDays(p.p3due, offset);
      }
    }

    for (const b of state.blocks) {
      if (b.finished) {
        if (!b.s7done && b.s7due) {
          b.s7due = addDays(b.s7due, offset);
        } else if (b.s7done && !b.s30done && b.s30due) {
          b.s30due = addDays(b.s30due, offset);
        }
      }
    }
  }

  state.brk = { active: false, startedAt: null };
  save();
}

/* ------------------------------------------------------------------ *
 * Rendering — rebuild the page from `state`. Called after every change.
 * ------------------------------------------------------------------ */

function render() {
  if (!state) {
    return;
  }

  document.getElementById("datesub").textContent = fmt(todayISO());
  const bb = document.getElementById("breakbanner");

  // Break banner (only while paused).
  if (state.brk.active) {
    bb.className = "banner";
    bb.innerHTML = `<span>On break since ${fmt(state.brk.startedAt)} — reviews paused</span><button class="btn sm" data-act="resume">Resume</button>`;
  } else {
    bb.className = "";
    bb.innerHTML = "";
  }

  // "Due today" list.
  const items = dueItems();
  document.getElementById("duecount").textContent = items.length;
  const dl = document.getElementById("dueList");

  if (state.brk.active) {
    dl.innerHTML = '<div class="empty">Paused. Hit Resume to continue.</div>';
  } else if (!items.length) {
    dl.innerHTML = '<div class="empty">Nothing due right now. 🎉</div>';
  } else {
    dl.innerHTML = items.map((it) => {
      // System 1 card: a single problem with Pass / Fail.
      if (it.kind === "s1") {
        const od = overdue(it.stage === "+1" ? it.p.p1due : it.p.p3due);
        return `<div class="card due"><span class="tag s1 ${it.stage === "+3" ? "plus3" : ""}">S1 ${it.stage}</span>
              <span class="name">${esc(it.p.name)}</span>${od ? '<span class="tag od">overdue</span>' : ""}
      <button class="btn pass sm" data-act="passS1" data-id="${it.p.id}" data-stage="${it.stage}">Pass</button>
      <button class="btn fail sm" data-act="failS1" data-id="${it.p.id}" data-stage="${it.stage}">Fail</button></div>`;
      }

      // System 2 card: a whole block review (opens the review modal).
      const tot = state.problems.filter((p) => p.block === it.b.name).length;
      const prog = it.b.reviewProgress ? Object.keys(it.b.reviewProgress.results).length : 0;
      const lbl = prog ? `Resume (${prog}/${tot})` : "Start review";
      return `<div class="card due"><span class="tag s2 ${it.stage === "+30" ? "plus30" : ""}">S2 ${it.stage}${it.b.retry ? " retry" : ""}</span>
      <span class="name">${esc(it.b.name)} — review block</span>
      <button class="btn pass sm" data-act="startReview" data-id="${it.b.id}" data-stage="${it.stage}">${lbl}</button></div>`;
    }).join("");
  }

  // System 1 section: problems grouped by block, each block as a collapsible card.
  const byBlock = {};
  for (const p of state.problems) {
    (byBlock[p.block] = byBlock[p.block] || []).push(p);
  }

  // Remember which blocks were expanded so a re-render doesn't collapse them.
  const openSet = new Set(
    [...document.querySelectorAll("#blocksAccordion details[open]")].map((d) => d.dataset.bn),
  );

  document.getElementById("blocksAccordion").innerHTML = Object.keys(byBlock).map((bn) => {
    const ps = byBlock[bn];
    const done = ps.filter((p) => p.p1done && p.p3done).length; // fully reviewed = both +1 and +3
    const rows = ps.map((p) => `<div class="pline"><span class="pn">${esc(p.name)}<br><span style="font-size:11px;color:var(--muted);font-weight:400">solved ${fmt(p.solved)}</span></span>
      <span class="chip ${p.p1done ? "on-pass" : ""}" style="cursor:default">+1</span>
      <span class="chip ${p.p3done ? "on-pass" : ""}" style="cursor:default">+3</span>
      <button class="linkbtn" data-act="note" data-id="${p.id}">note</button>
      <button class="linkbtn" data-act="log" data-kind="p" data-id="${p.id}">log${p.log && p.log.length ? ` (${p.log.length})` : ""}</button></div>
      ${p.note ? `<div class="note">${esc(p.note)}</div>` : ""}`).join("");
    const complete = done === ps.length; // whole block fully reviewed → green ✓

    return `<details data-bn="${esc(bn)}" ${openSet.has(bn) ? "open" : ""}>
          <summary class="blockhead">
            <span style="font-weight:600;font-size:14px;flex:1">${esc(bn)}</span>
            <span class="tag ${complete ? "s1" : ""}">${done}/${ps.length} reviewed${complete ? " ✓" : ""}</span>
          </summary>${rows}</details>`;
  }).join("");

  // System 2 section: one row per block with its next review (or "locked ✓").
  document.getElementById("blockList").innerHTML = state.blocks.map((b) => {
    let st;
    let cls;

    if (!b.finished) {
      st = "not started";
      cls = "";
    } else if (b.status === "locked") {
      st = "locked ✓";
      cls = "s1";
    } else {
      const stg = !b.s7done ? "+7" : "+30";
      const dt = !b.s7done ? b.s7due : b.s30due;
      st = `next: ${stg}${b.retry ? " (retry)" : ""} · ${fmt(dt)}`;
      cls = "s2" + (stg === "+30" ? " plus30" : "");
    }

    return `<div class="card row" style="justify-content:space-between">
      <span style="font-weight:600;font-size:14px">${esc(b.name)}</span>
      <span class="row" style="gap:10px"><button class="linkbtn" data-act="log" data-kind="b" data-id="${b.id}">log${b.log && b.log.length ? ` (${b.log.length})` : ""}</button><span class="tag ${cls}">${st}</span></span></div>`;
  }).join("");

  // Footer status: where data is being saved.
  const fs = document.getElementById("fileStatus");
  if (fs) {
    fs.innerHTML = SERVER
      ? "Saving automatically to <b>data.json</b> ✓ (on your computer)"
      : "Data is in this browser only. To save into a file, run <b>server.py</b> (or the start script) and open the link it shows.";
  }
}

/* ------------------------------------------------------------------ *
 * Modal helpers.
 * ------------------------------------------------------------------ */

function modal(html) {
  document.getElementById("modalRoot").innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
}

function closeModal() {
  document.getElementById("modalRoot").innerHTML = "";
}

/* ------------------------------------------------------------------ *
 * Block review flow (System 2).
 * You mark every problem Pass/Fail; marks are saved as you go (so you can
 * close and finish tomorrow). On Submit the 80% rule decides the outcome.
 * ------------------------------------------------------------------ */

function openBlockReview(bid, stage) {
  const b = findB(bid);
  const ps = state.problems.filter((p) => p.block === b.name);
  const total = ps.length;
  const need = Math.ceil(total * 0.8); // how many passes are needed to clear the block
  // Restore any in-progress marks for this same stage.
  const saved = b.reviewProgress && b.reviewProgress.stage === stage ? b.reviewProgress.results : {};

  review = { bid, stage, results: Object.assign({}, saved), total, need };

  const rows = ps.map((p) => {
    const mk = review.results[p.id];
    return `<div class="pline"><span class="pn">${esc(p.name)}</span>
    <span class="chip${mk === true ? " on-pass" : ""}" data-act="setReview" data-id="${p.id}" data-val="1">Pass</span>
    <span class="chip${mk === false ? " on-fail" : ""}" data-act="setReview" data-id="${p.id}" data-val="0">Fail</span></div>`;
  }).join("");

  modal(`<h1 style="font-size:16px">Review: ${esc(b.name)} <span class="tag s2">${stage}</span></h1>
    <p class="muted">Re-solve all <b>${total}</b> problems from memory. Mark <b>Pass</b> if you solved it cleanly, <b>Fail</b> if you struggled or peeked.<br><br>
    <b>Target: ${need}/${total} passed to clear the block.</b><br>
    • Hit ${need}+ → block clears and moves to its next review. Any you failed come back individually in System 1.<br>
    • Under ${need} → block didn't stick; you'll review the whole thing again in 7 days.<br><br>
    Your marks save as you go — you can <b>Save &amp; close</b> and finish tomorrow.</p>
    ${rows}<div class="foot"><button class="btn ghost" data-act="close">Save &amp; close</button>
    <button class="btn pass" data-act="submitReview">Submit</button></div>
    <p class="muted" id="rvstatus" style="text-align:right"></p>`);

  updateReviewStatus();
}

// Record a Pass/Fail mark, update the chips, and persist progress immediately.
function setReviewMark(id, val) {
  review.results[id] = val;

  const line = document.querySelector(`[data-act="setReview"][data-id="${id}"][data-val="1"]`).parentElement;
  line.querySelector('[data-val="1"]').className = "chip" + (val ? " on-pass" : "");
  line.querySelector('[data-val="0"]').className = "chip" + (!val ? " on-fail" : "");

  // Save partial progress on the block so a Save & close can be resumed.
  const b = findB(review.bid);
  b.reviewProgress = { stage: review.stage, results: Object.assign({}, review.results) };
  save();
  updateReviewStatus();
}

// Live counter at the bottom of the review modal.
function updateReviewStatus() {
  const marked = Object.keys(review.results).length;
  const pass = Object.values(review.results).filter(Boolean).length;
  const fail = marked - pass;
  const s = document.getElementById("rvstatus");

  if (!s) {
    return;
  }

  s.style.color = "var(--muted)";
  s.innerHTML = `Marked ${marked}/${review.total}<br>Passed ${pass}/${review.total}<br>Failed ${fail}/${review.total}`;
}

// Finalize the review — only once every problem is marked.
function submitReview() {
  const b = findB(review.bid);
  const ps = state.problems.filter((p) => p.block === b.name);

  // Require every problem marked; otherwise keep the modal open.
  if (Object.keys(review.results).length < ps.length) {
    const s = document.getElementById("rvstatus");
    s.style.color = "var(--danger)";
    s.innerHTML = "Mark every problem before submitting.<br>(Your marks are saved — use Save &amp; close to finish later.)";
    return;
  }

  const ids = Object.keys(review.results);
  const passed = ids.filter((i) => review.results[i]).length;
  const rate = passed / ids.length;

  if (rate >= 0.8) {
    // Passed the block: advance the stage (+7 → +30, +30 → locked)…
    b.retry = false;
    if (review.stage === "+7") {
      b.s7done = true;
    } else {
      b.s30done = true;
      b.status = "locked";
    }

    // …and send the individually failed problems back into System 1.
    for (const id of ids) {
      if (!review.results[id]) {
        const p = findP(id);
        if (p) {
          recycle(p);
        }
      }
    }
  } else {
    // Failed the block: it didn't stick, so re-review the whole thing in 7 days.
    b.retry = true;
    if (review.stage === "+7") {
      b.s7due = addDays(todayISO(), 7);
    } else {
      b.s30due = addDays(todayISO(), 7);
    }
  }

  delete b.reviewProgress; // review finished — clear saved progress
  closeModal();
  save();
}

/* ------------------------------------------------------------------ *
 * Small modals: note, add problem, add block, finish block, break.
 * ------------------------------------------------------------------ */

// One-line "trigger → idea" note on a problem.
function openNote(id) {
  const p = findP(id);

  modal(`<h1 style="font-size:16px">${esc(p.name)}</h1><p class="muted">One-line note: trigger → key idea.</p>
    <input id="noteInput" value="${esc(p.note)}" placeholder="e.g. need counts → HashMap freq, O(n)">
    <div class="foot"><button class="btn ghost" data-act="close">Cancel</button>
    <button class="btn pass" data-act="saveNote" data-id="${id}">Save</button></div>`);

  setTimeout(() => {
    const i = document.getElementById("noteInput");
    if (i) {
      i.focus();
    }
  }, 60);
}

// Find a problem or block by kind ("p" or "b") and id.
function itemById(kind, id) {
  return kind === "p" ? findP(id) : findB(id);
}

// Change log for a problem or block: a list of auto-dated notes about manual
// changes (date shifts, etc.), so odd-looking dates can be explained later.
function openLog(kind, id) {
  const item = itemById(kind, id);
  const entries = item.log || [];

  const list = entries.length
    ? entries.map((e, i) => `<div class="pline"><span class="pn"><span style="color:var(--muted);font-size:11px">${fmt(e.ts)}</span><br>${esc(e.text)}</span>
        <button class="linkbtn" data-act="delLog" data-kind="${kind}" data-id="${id}" data-idx="${i}">delete</button></div>`).join("")
    : '<div class="empty">No log entries yet.</div>';

  modal(`<h1 style="font-size:16px">Log: ${esc(item.name)}</h1>
    <p class="muted">Track manual changes (date shifts, etc.). Each entry is auto-dated.</p>
    ${list}
    <input id="logInput" placeholder="e.g. shifted +3 because I was away" style="margin-top:10px">
    <div class="foot"><button class="btn ghost" data-act="close">Close</button>
    <button class="btn pass" data-act="addLog" data-kind="${kind}" data-id="${id}">Add entry</button></div>`);

  setTimeout(() => {
    const i = document.getElementById("logInput");
    if (i) {
      i.focus();
    }
  }, 60);
}

// Add a new problem (schedules its +1 and +3 from today).
function openAddProblem() {
  const blocks = [...new Set(state.blocks.map((b) => b.name))];

  modal(`<h1 style="font-size:16px">Add problem</h1><p class="muted">Sets +1 and +3 from today.</p>
    <input id="apName" placeholder="Problem name" style="margin-bottom:8px">
    <select id="apBlock">${blocks.map((b) => `<option>${esc(b)}</option>`).join("")}</select>
    <div class="foot"><button class="btn ghost" data-act="close">Cancel</button>
    <button class="btn pass" data-act="doAddProblem">Add</button></div>`);

  setTimeout(() => {
    const i = document.getElementById("apName");
    if (i) {
      i.focus();
    }
  }, 60);
}

// Add a new (not-yet-finished) block.
function openAddBlock() {
  modal(`<h1 style="font-size:16px">Add block</h1><input id="abName" placeholder="Block name (e.g. Two Pointers)">
    <div class="foot"><button class="btn ghost" data-act="close">Cancel</button>
    <button class="btn pass" data-act="doAddBlock">Add</button></div>`);

  setTimeout(() => {
    const i = document.getElementById("abName");
    if (i) {
      i.focus();
    }
  }, 60);
}

// Mark a block finished — this starts its +7 and +30 reviews.
function openFinishBlock() {
  const opts = state.blocks
    .filter((b) => !b.finished)
    .map((b) => `<option value="${b.id}">${esc(b.name)}</option>`)
    .join("");

  if (!opts) {
    modal(`<p>All blocks are already finished.</p><div class="foot"><button class="btn" data-act="close">OK</button></div>`);
    return;
  }

  modal(`<h1 style="font-size:16px">Finish a block</h1><p class="muted">Starts its +7 and +30 reviews from today.</p>
    <select id="fbSel">${opts}</select><div class="foot"><button class="btn ghost" data-act="close">Cancel</button>
    <button class="btn pass" data-act="doFinishBlock">Finish</button></div>`);
}

// Start a break (or, if already on a break, resume immediately).
function openBreak() {
  if (state.brk.active) {
    endBreak();
    return;
  }

  modal(`<h1 style="font-size:16px">Take a break</h1>
    <p class="muted">Reviews pause. When you resume, every pending due date shifts forward by however long you were away.</p>
    <div class="foot"><button class="btn ghost" data-act="close">Cancel</button>
    <button class="btn pass" data-act="doBreak">Start break</button></div>`);
}

/* ------------------------------------------------------------------ *
 * Export / Import (manual JSON backup — kept for the file:// mode).
 * ------------------------------------------------------------------ */

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "data.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importJSON() {
  document.getElementById("fileInput").click();
}

document.getElementById("fileInput").addEventListener("change", function (e) {
  const f = e.target.files[0];
  if (!f) {
    return;
  }

  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (d.problems && d.blocks) {
        state = d;
        save();
      }
    } catch (_) {
      alert("Bad JSON file");
    }
  };
  r.readAsText(f);
  e.target.value = "";
});

/* ------------------------------------------------------------------ *
 * Event handling — one delegated click listener for the whole page.
 * Every interactive element carries a data-act (and often data-id / data-stage);
 * we read those and dispatch. This keeps handlers working even though the DOM
 * is rebuilt on every render.
 * ------------------------------------------------------------------ */

document.addEventListener("click", function (e) {
  // Click on the dark backdrop closes any open modal.
  if (e.target.classList && e.target.classList.contains("modal-bg")) {
    closeModal();
    return;
  }

  const el = e.target.closest("[data-act]");
  if (!el) {
    return;
  }

  const a = el.dataset.act;
  const id = el.dataset.id;
  const stage = el.dataset.stage;

  // Theme toggle: cycle system → dark → light.
  if (a === "theme") {
    const r = document.documentElement;
    const cur = r.getAttribute("data-theme");
    const nx = cur === "dark" ? "light" : cur === "light" ? "" : "dark";
    if (nx) {
      r.setAttribute("data-theme", nx);
    } else {
      r.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("dsa_theme", nx);
    } catch (_) { }
    return;
  }

  // System 1 — Pass: mark this stage done.
  if (a === "passS1") {
    const p = findP(id);
    if (stage === "+1") {
      p.p1done = true;
    } else {
      p.p3done = true;
    }
    save();
    return;
  }

  // System 1 — Fail: reschedule this stage to tomorrow.
  if (a === "failS1") {
    const p = findP(id);
    if (stage === "+1") {
      p.p1due = addDays(todayISO(), 1);
    } else {
      p.p3due = addDays(todayISO(), 1);
    }
    save();
    return;
  }

  // (Legacy) toggle a +1/+3 chip directly — no longer wired in the UI.
  if (a === "toggle") {
    const p = findP(id);
    if (el.dataset.which === "p1") {
      p.p1done = !p.p1done;
    } else {
      p.p3done = !p.p3done;
    }
    save();
    return;
  }

  if (a === "note") {
    openNote(id);
    return;
  }

  if (a === "saveNote") {
    const p = findP(id);
    const i = document.getElementById("noteInput");
    p.note = i ? i.value.trim() : "";
    save();
    closeModal();
    return;
  }

  if (a === "log") {
    openLog(el.dataset.kind, id);
    return;
  }

  if (a === "addLog") {
    const item = itemById(el.dataset.kind, id);
    const inp = document.getElementById("logInput");
    const txt = inp ? inp.value.trim() : "";
    if (!txt) {
      return;
    }
    if (!item.log) {
      item.log = [];
    }
    item.log.unshift({ ts: todayISO(), text: txt }); // newest first
    save();
    openLog(el.dataset.kind, id); // refresh the modal with the new entry
    return;
  }

  if (a === "delLog") {
    const item = itemById(el.dataset.kind, id);
    const idx = Number(el.dataset.idx);
    if (item.log) {
      item.log.splice(idx, 1);
    }
    save();
    openLog(el.dataset.kind, id);
    return;
  }

  if (a === "startReview") {
    openBlockReview(id, stage);
    return;
  }

  if (a === "setReview") {
    setReviewMark(id, el.dataset.val === "1");
    return;
  }

  if (a === "submitReview") {
    submitReview();
    return;
  }

  if (a === "addProblem") {
    openAddProblem();
    return;
  }

  // Create the problem entered in the Add-problem modal.
  if (a === "doAddProblem") {
    const n = document.getElementById("apName").value.trim();
    if (!n) {
      return;
    }

    const bl = document.getElementById("apBlock").value;
    const t = todayISO();
    state.problems.push({
      id: "p" + Date.now(),
      name: n,
      block: bl,
      solved: t,
      p1due: addDays(t, 1),
      p1done: false,
      p3due: addDays(t, 3),
      p3done: false,
      note: "",
    });
    closeModal();
    save();
    return;
  }

  if (a === "addBlock") {
    openAddBlock();
    return;
  }

  // Create the block entered in the Add-block modal.
  if (a === "doAddBlock") {
    const n = document.getElementById("abName").value.trim();
    if (!n) {
      return;
    }

    state.blocks.push({
      id: "b" + Date.now(),
      name: n,
      finished: null,
      s7due: null,
      s7done: false,
      s30due: null,
      s30done: false,
      status: "todo",
    });
    closeModal();
    save();
    return;
  }

  if (a === "finishBlock") {
    openFinishBlock();
    return;
  }

  // Finish the chosen block — schedule its +7 and +30 from today.
  if (a === "doFinishBlock") {
    const b = findB(document.getElementById("fbSel").value);
    const t = todayISO();
    b.finished = t;
    b.s7due = addDays(t, 7);
    b.s30due = addDays(t, 30);
    b.status = "review";
    closeModal();
    save();
    return;
  }

  if (a === "break") {
    openBreak();
    return;
  }

  // Confirm starting a break (records the start date).
  if (a === "doBreak") {
    state.brk = { active: true, startedAt: todayISO() };
    closeModal();
    save();
    return;
  }

  if (a === "resume") {
    endBreak();
    return;
  }

  if (a === "export") {
    exportJSON();
    return;
  }

  if (a === "import") {
    importJSON();
    return;
  }

  if (a === "close") {
    closeModal();
    return;
  }
});

/* ------------------------------------------------------------------ *
 * Startup.
 * ------------------------------------------------------------------ */

// Apply the saved theme before anything renders, to avoid a flash.
(function () {
  try {
    const t = localStorage.getItem("dsa_theme");
    if (t) {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) { }
})();

// Load state (server file first when available, else localStorage, else defaults),
// render once, and make sure both stores hold the current state.
async function boot() {
  if (SERVER) {
    const d = await serverLoad();
    if (d) {
      state = d;
    }
  }

  if (!state) {
    state = loadLS() || buildDefault();
  }

  render();
  saveLS();
  if (SERVER) {
    serverSave();
  }
}

boot();