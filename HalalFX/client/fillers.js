/* HalalFX - Filler Words tab (step 1: detect and list only, nothing is cut). */
(function () {
  var fs, cp, pathMod, osMod;
  try { fs = require("fs"); cp = require("child_process"); pathMod = require("path"); osMod = require("os"); } catch (e) {}
  function J() { return pathMod.join.apply(pathMod, arguments); }

  // Same install locations as the Captions tab (AppData\HalalFX), defined in common.js.
  var WHISPER_DIR = HS_WHISPER_DIR, MODELS_DIR = HS_MODELS_DIR;
  var MODEL_IDS = { en: { large: "medium.en", small: "small.en" }, ar: { large: "large-v3", small: "medium" } };
  var DEFAULT_WORDS = { en: "um, uh, er, erm, ah, hmm", ar: "امم, اا, آه, يعني" };
  // a prompt full of fillers nudges Whisper to write them down instead of skipping them
  var PROMPT = { en: "Umm, uh, let me think, hmm... okay, so, uh, yeah. Er, well, ah.", ar: "امم، اا، يعني، آه، خليني أفكر... اممم." };

  var S = loadJSON("halalfx_fillers", { lang: "en", words: { en: DEFAULT_WORDS.en, ar: DEFAULT_WORDS.ar }, cut: true, markers: false, backup: true });
  var busy = false, statusText = "", statusKind = "", found = null, cancelled = false, curProc = null;

  var css = document.createElement("style");
  css.textContent =
    ".ic-fillers{-webkit-mask-image:url('icons/fillers.svg');mask-image:url('icons/fillers.svg');}" +
    "#flScreen{padding:12px;display:flex;flex-direction:column;gap:10px;font-size:12px;color:var(--text);height:100%;box-sizing:border-box;overflow:auto;}" +
    "#flGo{width:100%;border:none;border-radius:12px;padding:13px 16px;cursor:pointer;font-size:13px;font-weight:600;color:#fff;background:var(--accent-grad);transition:box-shadow .15s;}" +
    "#flGo:hover:not(:disabled){box-shadow:0 0 4px 1px rgba(30,159,214,.55);} #flGo:disabled{opacity:.5;cursor:default;}" +
    "#flStatus{color:var(--muted);line-height:1.5;white-space:pre-wrap;} #flStatus.err{color:#ff6b6b;} #flStatus.ok{color:#5fd38d;}" +
    ".flCard{background:var(--panel);border:1px solid #2c2c2c;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:11px;}" +
    ".flCard .t{font-size:14px;font-weight:600;} .flCard .head{display:flex;align-items:center;justify-content:space-between;gap:8px;} .flCard .r{font-size:11px;color:var(--muted);}" +
    ".flCard .row{display:flex;align-items:center;justify-content:space-between;gap:10px;} .flCard label{color:var(--muted);}" +
    ".flSeg{display:flex;gap:6px;} .flSeg button{background:#1d1d1d;border:1px solid #383838;border-radius:8px;color:var(--text);padding:5px 12px;font-size:12px;cursor:pointer;}" +
    ".flSeg button.on{border-color:var(--accent-1);color:var(--accent-1);background:rgba(30,159,214,.12);}" +
    "#flWords{width:100%;box-sizing:border-box;min-height:54px;resize:vertical;background:#1d1d1d;border:1px solid #383838;border-radius:8px;color:var(--text);padding:7px 9px;font-size:12px;font-family:inherit;}" +
    "#flHeard{font-size:12px;line-height:1.8;max-height:200px;overflow:auto;color:var(--text);}" +
    "#flCanvas{display:block;width:100%;height:190px;touch-action:none;cursor:pointer;}" +
    "#flPlay{flex-shrink:0;width:28px;height:28px;border-radius:50%;border:none;background:var(--accent-grad);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;outline:none;} #flPlay:hover{opacity:.92;}" +
    "#flPlay::after{content:'';display:block;width:0;height:0;border-left:9px solid #fff;border-top:6px solid transparent;border-bottom:6px solid transparent;margin-left:3px;}" +
    "#flPlay.playing::after{width:10px;height:12px;border:none;margin:0;background:linear-gradient(to right,#fff 0,#fff 3px,transparent 3px,transparent 7px,#fff 7px,#fff 10px);}" +
    "#flPlayDel{flex-shrink:0;width:22px;height:22px;border-radius:50%;border:none;background:linear-gradient(135deg,#d65cf0,#a53bc4);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;outline:none;} #flPlayDel:hover{opacity:.92;}" +
    "#flPlayDel::after{content:'';display:block;width:0;height:0;border-left:7px solid #fff;border-top:5px solid transparent;border-bottom:5px solid transparent;margin-left:2px;}" +
    "#flPlayDel.playing::after{width:8px;height:10px;border:none;margin:0;background:linear-gradient(to right,#fff 0,#fff 3px,transparent 3px,transparent 5px,#fff 5px,#fff 8px);}" +
    "#flTime{flex-shrink:0;font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums;min-width:84px;}" +
    "#flScrub{-webkit-appearance:none;appearance:none;flex:1;height:4px;border-radius:4px;outline:none;border:none;cursor:pointer;background:#333;} #flScrub::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:transparent;} #flScrub::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;border-radius:50%;background:var(--accent-1);border:none;outline:none;margin-top:-4px;}" +
    ".flItem.sel{border-color:var(--accent-1);} .flItem .x{background:none;border:none;color:var(--muted);font-size:17px;cursor:pointer;padding:0 4px;} .flItem .x:hover{color:#ff6b6b;}" +
    ".flHint{font-size:10.5px;color:var(--muted);line-height:1.5;}" +
    "#flEmpty{border:1px dashed #4a4a4a;border-radius:12px;padding:20px 14px;text-align:center;color:var(--muted);line-height:1.5;}" +
    ".flItem{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#1d1d1d;border:1px solid #333;border-radius:12px;padding:10px 14px;cursor:pointer;}" +
    "#flRun{width:100%;border:none;border-radius:12px;padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;color:#fff;background:var(--accent-grad);transition:box-shadow .15s;} #flRun:hover:not(:disabled){box-shadow:0 0 4px 1px rgba(30,159,214,.55);} #flRun:disabled{opacity:.5;cursor:default;}" +
    ".flChecks{display:flex;justify-content:space-between;align-items:center;gap:8px;}" +
    ".flItem:hover{border-color:var(--accent-1);} .flItem .w{font-size:13px;font-weight:600;color:var(--accent-1);} .flItem .tm{color:var(--muted);font-size:11px;margin-top:3px;}";
  document.head.appendChild(css);

  var prevSetTab = setActiveTab;
  setActiveTab = function (tab) {
    if (state.activeTab === "fillers" && tab !== "fillers") stopPB(false);
    prevSetTab(tab);
  };
  var prevRender = renderActiveTab;
  renderActiveTab = function () {
    if (state.activeTab === "fillers") { crumbEl.textContent = ""; render(); } else prevRender();
  };

  function status(t, kind) {
    statusText = t || ""; statusKind = kind || "";
    var el = document.getElementById("flStatus");
    if (el) { el.textContent = statusText; el.className = statusKind; }
  }
  var evalHost = hsEval;
  function fmt(sec) {
    var m = Math.floor(sec / 60), s = sec - m * 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
  }


  /* ---------- waveform preview: draggable cut edges + jump-cut playback ---------- */
  var A = { audio: null, playing: false, raf: 0 }, selIdx = -1, drag = null;
  function $(id) { return document.getElementById(id); }
  function mss(t) { t = Math.max(0, t); var m = Math.floor(t / 60), x = Math.floor(t % 60); return m + ":" + (x < 10 ? "0" : "") + x; }
  function computePeaks(wavPath, bins) {
    var pcm = hsReadPcm(wavPath), n = pcm.length;
    if (n <= 0) return { peaks: [], dur: 0, max: 0 };
    var peaks = new Array(bins), per = n / bins, i, j, m, v, a, b, mx = 0;
    for (i = 0; i < bins; i++) {
      m = 0; a = Math.floor(i * per); b = Math.min(n, Math.floor((i + 1) * per));
      for (j = a; j < b; j++) { v = pcm[j] < 0 ? -pcm[j] : pcm[j]; if (v > m) m = v; }
      peaks[i] = m / 32768; if (peaks[i] > mx) mx = peaks[i];
    }
    return { peaks: peaks, dur: n / 16000, max: mx };
  }
  function rel(it) { return { s: it.s - found.clipStart, e: it.e - found.clipStart }; }
  function drawAll() {
    var cv = $("flCanvas"); if (!cv || !found) return;
    var dpr = window.devicePixelRatio || 1, w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (!w || !h) return;
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    var c = cv.getContext("2d"), dur = found.dur, pk = found.peaks || [], n = pk.length;
    c.clearRect(0, 0, w, h); c.fillStyle = "#0a0a0a"; c.fillRect(0, 0, w, h);
    // dotted centre line
    c.save(); c.strokeStyle = "rgba(30,159,214,0.7)"; c.lineWidth = dpr; c.setLineDash([2 * dpr, 4 * dpr]);
    c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke(); c.restore();
    // bars (same look as Silence Remover)
    var barW = 3 * dpr, gap = 2 * dpr, nb = Math.max(1, Math.floor(w / (barW + gap))), per = n / nb, k, i;
    c.fillStyle = "#1e9fd6";
    for (k = 0; k < nb; k++) {
      var m = 0, i0 = Math.floor(k * per), i1 = Math.max(i0 + 1, Math.floor((k + 1) * per));
      for (i = i0; i < i1 && i < n; i++) if (pk[i] > m) m = pk[i];
      var bh = Math.max(2 * dpr, m * h * 0.66);
      c.fillRect(k * (barW + gap), h / 2 - bh / 2, barW, bh);
    }
    found.items.forEach(function (it, idx) {
      var r = rel(it), x1 = r.s / dur * w, x2 = r.e / dur * w;
      c.fillStyle = idx === selIdx ? "rgba(225,100,245,0.55)" : "rgba(205,80,235,0.35)";
      c.fillRect(x1, 0, Math.max(2 * dpr, x2 - x1), h);
      c.fillStyle = "rgba(225,110,245,0.95)";
      c.fillRect(x1 - dpr, 0, 2 * dpr, h); c.fillRect(x2 - dpr, 0, 2 * dpr, h);
      c.fillRect(x1 - 3 * dpr, h / 2 - 9 * dpr, 6 * dpr, 18 * dpr); c.fillRect(x2 - 3 * dpr, h / 2 - 9 * dpr, 6 * dpr, 18 * dpr);
    });
    var t = A.audio ? A.audio.currentTime : 0;
    c.fillStyle = "#ffffff"; c.fillRect(Math.max(0, Math.min(t, dur)) / dur * w - dpr, 0, 2 * dpr, h);
  }
  function updateTime() {
    if (!found) return;
    var t = A.audio ? A.audio.currentTime : 0, el = $("flTime"), sc = $("flScrub");
    if (el) el.textContent = mss(t) + " / " + mss(found.dur);
    if (sc) { var p = found.dur ? Math.min(1, t / found.dur) : 0; sc.value = p; sc.style.background = "linear-gradient(to right,var(--accent-1) " + p * 100 + "%,#333 " + p * 100 + "%)"; }
  }
  function setPlayLabel() {
    var b = $("flPlay"), d = $("flPlayDel");
    if (b) b.classList.toggle("playing", A.playing && A.mode !== "deleted");
    if (d) d.classList.toggle("playing", A.playing && A.mode === "deleted");
  }
  function ensureAudio() {
    if (A.audio || !found) return;
    A.audio = new Audio(); A.audio.src = fileUrl(found.wav);
    A.audio.addEventListener("ended", function () { stopPB(true); });
  }
  function stopPB(reset) {
    A.playing = false; if (A.raf) cancelAnimationFrame(A.raf); A.raf = 0;
    if (A.audio) { try { A.audio.pause(); if (reset) A.audio.currentTime = 0; } catch (e) {} }
    setPlayLabel(); drawAll(); updateTime();
  }
  function loop() {
    if (!A.playing || !A.audio || !found) return;
    var t = A.audio.currentTime, i, r;
    if (A.mode === "deleted") {
      var inside = false, nx = null;
      for (i = 0; i < found.items.length; i++) {
        r = rel(found.items[i]);
        if (t >= r.s - 0.001 && t < r.e) { inside = true; break; }
        if (r.s > t && (nx === null || r.s < nx)) nx = r.s;
      }
      if (!inside) { if (nx === null) return stopPB(false); A.audio.currentTime = nx; t = nx; }
    } else if ($("flJump") && $("flJump").checked) {
      for (i = 0; i < found.items.length; i++) {
        r = rel(found.items[i]);
        if (t >= r.s - 0.005 && t < r.e) { A.audio.currentTime = r.e; t = r.e; break; }
      }
    }
    drawAll(); updateTime();
    A.raf = requestAnimationFrame(loop);
  }
  function playMode(mode) {
    if (!found) return;
    ensureAudio();
    if (A.playing && A.mode === mode) return stopPB(false);
    if (mode === "deleted") {
      if (!found.items.length) return;
      var cur = A.audio.currentTime;
      if (!found.items.some(function (it) { return rel(it).e > cur; })) A.audio.currentTime = rel(found.items[0]).s;
    }
    A.mode = mode;
    if (!A.playing) {
      A.playing = true;
      var p = A.audio.play(); if (p && p.catch) p.catch(function () { A.playing = false; setPlayLabel(); });
      A.raf = requestAnimationFrame(loop);
    }
    setPlayLabel();
  }
  function togglePlay() { playMode("normal"); }
  function seek(t) { ensureAudio(); if (A.audio) A.audio.currentTime = Math.max(0, Math.min(found.dur, t)); drawAll(); updateTime(); }
  function dropFound() {
    stopPB(false); A.audio = null; selIdx = -1; drag = null;
    if (found && found.wav) { try { fs.unlinkSync(found.wav); } catch (e) {} }
    found = null;
  }
  function pt(e) {
    var r = $("flCanvas").getBoundingClientRect();
    return { x: e.clientX - r.left, w: r.width, t: Math.max(0, Math.min(found.dur, (e.clientX - r.left) / r.width * found.dur)) };
  }
  function hitEdge(px, w) {
    var best = null, bd = 9;
    found.items.forEach(function (it, i) {
      var r = rel(it), d1 = Math.abs(px - r.s / found.dur * w), d2 = Math.abs(px - r.e / found.dur * w);
      if (d1 < bd) { bd = d1; best = { i: i, edge: "s" }; }
      if (d2 < bd) { bd = d2; best = { i: i, edge: "e" }; }
    });
    return best;
  }
  function markSel() {
    Array.prototype.forEach.call(document.querySelectorAll(".flItem"), function (el) { el.classList.toggle("sel", +el.getAttribute("data-i") === selIdx); });
  }
  function updateItemText(i) {
    var el = document.querySelector('.flItem[data-i="' + i + '"] .tm'), it = found.items[i];
    if (el) el.innerHTML = fmt(it.s) + " &middot; " + (it.e - it.s).toFixed(2) + "s";
  }
  function onDown(e) {
    if (!found) return;
    var c = pt(e), h = hitEdge(c.x, c.w);
    if (h) { drag = h; selIdx = h.i; try { e.target.setPointerCapture(e.pointerId); } catch (x) {} }
    else {
      selIdx = -1;
      found.items.forEach(function (it, i) { var r = rel(it); if (c.t >= r.s && c.t <= r.e) selIdx = i; });
      seek(c.t);
    }
    markSel(); drawAll();
  }
  function onMove(e) {
    if (!found) return;
    var c = pt(e);
    if (!drag) { e.target.style.cursor = hitEdge(c.x, c.w) ? "ew-resize" : "pointer"; return; }
    var it = found.items[drag.i], prev = found.items[drag.i - 1], next = found.items[drag.i + 1], MIN = 0.04, GAP = 0.01, lo, hi;
    if (drag.edge === "s") {
      lo = prev ? prev.e - found.clipStart + GAP : 0; hi = it.e - found.clipStart - MIN;
      it.s = found.clipStart + Math.max(lo, Math.min(hi, c.t));
    } else {
      lo = it.s - found.clipStart + MIN; hi = next ? next.s - found.clipStart - GAP : found.dur;
      it.e = found.clipStart + Math.max(lo, Math.min(hi, c.t));
    }
    updateItemText(drag.i); drawAll();
  }
  function onUp() { drag = null; }

  window.addEventListener("unload", function () { dropFound(); });   // no temp audio left behind when the panel closes

  /* ---------- UI ---------- */
  function render() {
    contentEl.className = "";
    var items = found ? found.items : [];
    var html = '<div id="flScreen"><div id="flFfmpeg"></div><button id="flGo">' + (busy ? "Cancel" : "Find Filler Words") + "</button>" +
      '<div id="flStatus" class="' + statusKind + '"></div>' +
      '<div class="flCard"><div class="t">Settings</div>' +
        '<div class="row"><label>Language</label><div class="flSeg"><button data-l="en" class="' + (S.lang === "en" ? "on" : "") + '">English</button><button data-l="ar" class="' + (S.lang === "ar" ? "on" : "") + '">Arabic</button></div></div>' +
        '<div><label>Words to find</label></div><textarea id="flWords"></textarea>' +
        '<div class="flHint">Separate words with commas.</div>' +
      "</div>" +
      (found ? '<div class="ac-preview"><div class="cut-top"><label class="cut-toggle"><input id="flJump" type="checkbox"' + (S.jump !== false ? " checked" : "") + '>Preview with jump cuts</label></div>' +
        '<div class="ac-waveform-wrap"><canvas id="flCanvas"></canvas></div>' +
        '<div class="ac-controls"><button id="flBack10" class="cut-skip" title="Back 10s">-10s</button><button id="flPlay" title="Play / Pause"></button><button id="flPlayDel" title="Play only the parts that will be removed"></button><button id="flFwd10" class="cut-skip" title="Forward 10s">+10s</button>' +
        '<span id="flTime">0:00 / 0:00</span><input id="flScrub" type="range" min="0" max="1" step="0.001" value="0"></div>' +
        '<div class="flHint">Drag the pink edges to set where each cut starts and ends. Click the waveform to move the playhead.</div></div>' : "") +
      '<div class="flCard"><div class="t">Action</div><div class="flChecks">' +
        '<label class="ac-check"><input id="flBackup" type="checkbox"' + (S.backup ? " checked" : "") + '>Backup sequence first</label>' +
        '<label class="ac-check"><input id="flDoCut" type="checkbox"' + (S.cut ? " checked" : "") + '>Cut &amp; ripple delete</label>' +
        '<label class="ac-check"><input id="flDoMarkers" type="checkbox"' + (S.markers ? " checked" : "") + '>Add markers</label></div>' +
        '<button id="flRun"' + (busy || !items.length ? " disabled" : "") + '>Run Filler Remover</button>' +
        '<div class="flHint">Detection is not complete: Whisper can skip some fillers, and word timing is approximate. Review the list, or start with Add markers only.</div></div>' +
      '<div class="flCard"><div class="head"><div class="t">Detected Words</div><div class="r">' + (found ? items.length + " of " + found.total + " words" : "No scan yet.") + "</div></div><div id=\"flBody\"></div></div>" +
      (found ? '<div class="flCard"><div class="head"><div class="t">What Whisper heard</div><div class="r">' + found.model + '</div></div><div id="flHeard" dir="auto"></div></div>' : "") + "</div>";
    contentEl.innerHTML = html;
    hsFfmpegMount(document.getElementById("flFfmpeg"));
    document.getElementById("flStatus").textContent = statusText;
    var ta = document.getElementById("flWords"); ta.value = S.words[S.lang];
    ta.addEventListener("change", function () { S.words[S.lang] = ta.value; saveJSON("halalfx_fillers", S); });
    document.getElementById("flGo").addEventListener("click", function () { if (busy) cancel(); else detect(); });
    var cv = $("flCanvas");
    if (cv) {
      cv.addEventListener("pointerdown", onDown); cv.addEventListener("pointermove", onMove);
      cv.addEventListener("pointerup", onUp); cv.addEventListener("pointercancel", onUp);
      $("flPlay").addEventListener("click", togglePlay);
      $("flPlayDel").addEventListener("click", function () { playMode("deleted"); });
      $("flBack10").addEventListener("click", function () { seek((A.audio ? A.audio.currentTime : 0) - 10); });
      $("flFwd10").addEventListener("click", function () { seek((A.audio ? A.audio.currentTime : 0) + 10); });
      $("flScrub").addEventListener("input", function () { seek(parseFloat(this.value) * found.dur); });
      $("flJump").addEventListener("change", function () { S.jump = this.checked; saveJSON("halalfx_fillers", S); });
      setPlayLabel(); updateTime(); drawAll();
    }
    document.getElementById("flRun").addEventListener("click", run);
    [["flBackup", "backup"], ["flDoCut", "cut"], ["flDoMarkers", "markers"]].forEach(function (x) {
      document.getElementById(x[0]).addEventListener("change", function () { S[x[1]] = this.checked; saveJSON("halalfx_fillers", S); });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".flSeg button"), function (b) {
      b.addEventListener("click", function () { S.words[S.lang] = ta.value; S.lang = b.getAttribute("data-l"); saveJSON("halalfx_fillers", S); render(); });
    });
    var hd = document.getElementById("flHeard");
    if (hd) hd.textContent = found.heard.length ? found.heard.join(" ") : "(nothing)";
    var body = document.getElementById("flBody");
    if (!items.length) {
      body.innerHTML = '<div id="flEmpty">' + (found ? "No filler words found.<br>Whisper may skip some fillers: try a larger model or add more words." : "Select a clip on the timeline, then press Find Filler Words.") + "</div>";
      return;
    }
    items.forEach(function (it, idx) {
      var d = document.createElement("div");
      d.className = "flItem" + (idx === selIdx ? " sel" : "");
      d.setAttribute("data-i", idx);
      d.innerHTML = '<div><div class="w"></div><div class="tm">' + fmt(it.s) + " &middot; " + (it.e - it.s).toFixed(2) + 's</div></div><button class="x" title="Remove from the list">&times;</button>';
      d.querySelector(".w").textContent = it.word;
      d.querySelector(".x").addEventListener("click", function (e) { e.stopPropagation(); found.items.splice(idx, 1); selIdx = -1; render(); });
      d.addEventListener("click", function () {
        selIdx = idx; markSel(); seek(it.s - found.clipStart); 
        evalHost("gpGoto(" + it.s + ")", function (r) { if (r.error) status(r.error, "err"); });
      });
      body.appendChild(d);
    });
  }

  /* ---------- helpers ---------- */
  var findWhisper = hsFindWhisper;
  function findModel(lang) {
    // the size chosen in Captions comes first (same setting), the other installed size is the fallback
    var pref = "large";
    try { var cs = JSON.parse(localStorage.getItem("halalfx_captions2") || "{}"); if (cs.msize && cs.msize[lang]) pref = cs.msize[lang]; } catch (e) {}
    var order = pref === "small" ? ["small", "large"] : ["large", "small"];
    for (var i = 0; i < order.length; i++) {
      var f = J(MODELS_DIR, "ggml-" + MODEL_IDS[lang][order[i]] + ".bin");
      if (fs.existsSync(f)) return f;
    }
    return null;
  }
  // Arabic spelling variants (hamza forms, diacritics, tatweel) must compare equal; repeated letters collapse (umm = um)
  function norm(w) {
    return w.toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي")
      .replace(/[^\p{L}\p{N}']/gu, "").replace(/(.)\1+/g, "$1");
  }
  // Hesitation sounds Whisper spells in many ways (ممم / امم / أمم, uhm / umm / hmm ...). If the list holds one of them, all spellings match.
  var SOUND = { en: /^(?:um|uh|uhm|er|erm|eh|em|ah|hm|m)$/, ar: /^(?:[اء]?م|[اءع]+ه?|[اءع]?ه)$/ };
  var toWords = hsWhisperWords;
  function findFillers(words, listText, offset, lang) {
    var set = {};
    listText.split(/[,\n،]+/).forEach(function (x) { var n = norm(x); if (n) set[n] = 1; });
    var out = [], sound = SOUND[lang], soundWanted = Object.keys(set).some(function (k) { return sound.test(k); });
    words.forEach(function (w) { var n = norm(w.t); if (set[n] || (soundWanted && sound.test(n))) out.push({ word: w.t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""), s: offset + w.s, e: offset + w.e }); });
    return out;
  }

  /* ---------- cut / markers (same engine as Silence Remover) ---------- */
  function run() {
    if (busy || !found || !found.items.length) return;
    if (!S.cut && !S.markers) return status("Select at least one action: Cut or Markers.", "err");
    busy = true; status("Working in Premiere, please wait..."); render();
    // the host cuts from the end backwards, so it needs ascending, non-overlapping ranges
    var ranges = found.items.map(function (x) { return { s: x.s, e: x.e }; }).sort(function (a, b) { return a.s - b.s; }), merged = [];
    ranges.forEach(function (x) { var l = merged[merged.length - 1]; if (l && x.s <= l.e) { if (x.e > l.e) l.e = x.e; } else merged.push(x); });
    var payload = JSON.stringify({ silences: merged, cut: S.cut, markers: S.markers, backup: S.backup, label: "Filler" });
    evalHost("hsApplyCuts(" + JSON.stringify(payload) + ")", function (r) {
      busy = false;
      if (r.error) return fail(r.error);
      if (r.failed) return fail(r.failed + " clip(s) could not be removed.");
      if (S.cut) { dropFound(); status("Removed " + r.count + " filler words. Run Find Filler Words again to rescan.", "ok"); }
      else status("Added " + r.count + " markers.", "ok");
      render();
    });
  }

  /* ---------- detection (one or many selected clips) ---------- */
  function fail(msg) { busy = false; status(msg, "err"); render(); }
  function mergeHits(list) {
    list.sort(function (a, b) { return a.s - b.s; });
    var out = [];
    list.forEach(function (h) {
      var l = out[out.length - 1];
      if (l && h.s <= l.e + 0.02) { if (h.e > l.e) l.e = h.e; } else out.push({ word: h.word, s: h.s, e: h.e });
    });
    return out;
  }
  function cancel() {
    cancelled = true;
    if (curProc) { try { curProc.kill(); } catch (e) {} }
    status("Cancelling...");
  }
  function stopped(files) {
    files.forEach(function (f) { try { fs.unlinkSync(f); } catch (e) {} });
    cancelled = false; curProc = null; busy = false; status("Cancelled."); render();
  }
  function detect() {
    if (busy) return;
    cancelled = false;
    S.words[S.lang] = document.getElementById("flWords").value; saveJSON("halalfx_fillers", S);
    var lang = S.lang, listText = S.words[lang];
    var exe = findWhisper(), model = findModel(lang), ffmpeg = hsFindFfmpeg();
    if (!exe || !model) return status("Install the speech engine and a " + (lang === "ar" ? "Arabic" : "English") + " model first (Captions > Setup).", "err");
    if (!ffmpeg) return status(HS_FFMPEG_MISSING, "err");
    busy = true; dropFound(); status("Reading selection..."); render();
    evalHost("flGetClips()", function (res) {
      if (res.error) return fail(res.error);
      var clips = res.clips.sort(function (a, b) { return a.start - b.start; });
      var minStart = clips[0].start, maxEnd = clips[0].end;
      clips.forEach(function (c) { if (c.end > maxEnd) maxEnd = c.end; });
      var span = Math.ceil((maxEnd - minStart) * 16000) + 16000;
      if (span > 16000 * 3 * 3600) return fail("The selection is too long (more than 3 hours).");
      var segs = [], idx = 0, skipped = 0, stamp = Date.now();
      function nextClip() {
        if (idx >= clips.length) return transcribe();
        var clip = clips[idx++];
        status((clips.length > 1 ? "Clip " + idx + " of " + clips.length + ": " : "") + "Preparing audio...");
        var wav = J(osMod.tmpdir(), "halalfx_fl_" + stamp + "_" + idx + ".wav");
        var args = ["-y", "-ss", String(clip.inPoint), "-t", String(clip.outPoint - clip.inPoint), "-i", clip.path, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav];
        var p; try { p = cp.spawn(ffmpeg, args, { windowsHide: true }); } catch (e) { skipped++; return nextClip(); }
        curProc = p;
        var fin = false;   // "error" and "close" can both fire for one process: move to the next clip only once
        p.on("error", function () { if (fin) return; fin = true; skipped++; nextClip(); });
        p.on("close", function (code) {
          if (fin) return; fin = true;
          if (cancelled) return stopped([wav]);
          var pcm = null;
          if (code === 0 && fs.existsSync(wav)) { try { pcm = hsReadPcm(wav); } catch (e) {} }
          try { fs.unlinkSync(wav); } catch (e) {}
          var mx = 0; if (pcm) for (var i = 0; i < pcm.length; i++) { var v = pcm[i] < 0 ? -pcm[i] : pcm[i]; if (v > mx) mx = v; }
          if (!pcm || pcm.length < 16000 * 0.3 || mx < 100) { skipped++; return nextClip(); }
          segs.push({ clip: clip, pcm: pcm });
          nextClip();
        });
      }
      function transcribe() {
        if (!segs.length) return fail("No audio was found in the selected " + (clips.length > 1 ? "clips" : "clip \"" + clips[0].name + "\"") + ". Select clips that have the speech (not captions or graphics).");
        // 1) one continuous file for Whisper (clips back to back), 2) a timeline-aligned file for the preview
        var total = 0; segs.forEach(function (sg) { sg.off = total; total += sg.pcm.length; });
        var cat = new Int16Array(total), mix = new Int16Array(span);
        segs.forEach(function (sg) {
          cat.set(sg.pcm, sg.off);
          var o = Math.round((sg.clip.start - minStart) * 16000), i, v;
          for (i = 0; i < sg.pcm.length && o + i < span; i++) { v = mix[o + i] + sg.pcm[i]; mix[o + i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v; }
        });
        var catWav = J(osMod.tmpdir(), "halalfx_fl_" + stamp + "_all.wav"), mixWav = J(osMod.tmpdir(), "halalfx_fl_" + stamp + "_view.wav");
        try { hsWriteWav(cat, catWav); hsWriteWav(mix, mixWav); } catch (e) { return fail("Could not write temporary audio: " + e.message); }
        status("Transcribing " + (segs.length > 1 ? segs.length + " clips" : "") + " with " + pathMod.basename(model).replace(/^ggml-|\.bin$/g, "") + " (this can take a while)...");
        var base = J(osMod.tmpdir(), "halalfx_fl_" + stamp);
        var wargs = ["-m", model, "-f", catWav, "-ml", "1", "-sow", "-oj", "-of", base, "-l", lang, "--prompt", PROMPT[lang], "-bs", "1", "-bo", "1", "-pp", "-t", String(Math.max(2, osMod.cpus().length - 1))];
        var err = "", w; try { w = cp.spawn(exe, wargs, { windowsHide: true, cwd: WHISPER_DIR }); } catch (e) { return fail(e.message); }
        curProc = w;
        w.stderr.on("data", function (d) {
          var t = d.toString(), m = t.match(/progress\s*=\s*(\d+)%/g);
          if (m) status("Transcribing" + (segs.length > 1 ? " " + segs.length + " clips" : "") + "... " + m[m.length - 1].match(/(\d+)%/)[1] + "%");
          else err += t;
        });
        var wfin = false;
        w.on("error", function (e) { if (wfin) return; wfin = true; fail(e.message); });
        w.on("close", function (c2) {
          if (wfin) return; wfin = true;
          try { fs.unlinkSync(catWav); } catch (e) {}
          if (cancelled) return stopped([mixWav, base + ".json"]);
          var jf = base + ".json";
          if (c2 !== 0 || !fs.existsSync(jf)) { try { fs.unlinkSync(mixWav); } catch (e) {} return fail("Speech engine failed (code " + c2 + "). " + err.slice(-300)); }
          var words;
          try { words = toWords(JSON.parse(fs.readFileSync(jf, "utf8"))); fs.unlinkSync(jf); } catch (e) { return fail(e.message); }
          // word times -> sequence times (find the clip each word belongs to)
          var hits = [];
          segs.forEach(function (sg, si) {
            var t0 = sg.off / 16000, t1 = (sg.off + sg.pcm.length) / 16000;
            var mine = words.filter(function (wd) { return wd.s >= t0 - 0.001 && wd.s < t1; })
              .map(function (wd) { return { t: wd.t, s: wd.s - t0, e: Math.min(wd.e, t1) - t0 }; });
            hits = hits.concat(findFillers(mine, listText, sg.clip.start, lang));
          });
          hits = mergeHits(hits);
          var pk = null; try { pk = computePeaks(mixWav, 900); } catch (e) {}
          if (!pk) return fail("Could not draw the waveform.");
          found = { items: hits, total: words.length, heard: words.map(function (wd) { return wd.t; }), wav: mixWav, dur: pk.dur, clipStart: minStart, peaks: pk.peaks, model: pathMod.basename(model).replace(/^ggml-|\.bin$/g, "") };
          busy = false;
          var note = skipped ? skipped + " selected clip" + (skipped > 1 ? "s" : "") + " had no audio and " + (skipped > 1 ? "were" : "was") + " skipped." : "";
          status(note, note ? "err" : ""); render();
        });
      }
      nextClip();
    });
  }
})();
