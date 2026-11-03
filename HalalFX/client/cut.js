/* HalalFX - Silence Cutter (Cut tab) - v2 preview
   - Waveform preview with ALWAYS-visible cut regions
   - "Preview with jump cuts": playback skips removed parts
   - -10s / +10s skip, scrubber, play/pause
   - Duration auto-detected (ffmpeg -> metadata -> decoded buffer) */
(function () {
  var fs = null, cp = null, pathMod = null, osMod = null;
  try {
    fs = require("fs");
    cp = require("child_process");
    pathMod = require("path");
    osMod = require("os");
  } catch (e) {}

  /* ---------- CSS ---------- */
  var css = document.createElement("style");
  css.textContent =
    "#cutScreen{-webkit-user-select:none;user-select:none;padding:12px;display:flex;flex-direction:column;gap:12px;overflow:auto;height:100%;box-sizing:border-box;}" +
    ".ac-preview{background:var(--panel);border:1px solid #383838;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;}" +
    ".cut-top{display:flex;align-items:center;justify-content:space-between;gap:8px;}" +
    ".cut-toggle{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text);cursor:pointer;user-select:none;}" +
    ".cut-toggle input{-webkit-appearance:none;appearance:none;width:30px;height:16px;border-radius:16px;background:#444;position:relative;cursor:pointer;margin:0;outline:none;flex-shrink:0;}" +
    ".cut-toggle input::before{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#bbb;transition:left .15s;}" +
    ".cut-toggle input:checked{background:var(--accent-grad);}" +
    ".cut-toggle input:checked::before{left:16px;background:#fff;}" +
    ".cut-stats{font-size:11px;color:var(--accent-1);font-weight:600;text-align:right;letter-spacing:.3px;}" +
    ".cut-stats.empty{color:var(--muted);font-weight:500;}" +
    ".ac-waveform-wrap{width:100%;line-height:0;background:#0a0a0a;border:1px solid #2c2c2c;border-radius:6px;overflow:hidden;}" +
    "#cutWaveCanvas{display:block;width:100%;height:190px;}" +
    ".ac-controls{display:flex;align-items:center;gap:8px;}" +
    ".cut-skip{flex-shrink:0;background:var(--bg);border:1px solid #383838;color:var(--text);border-radius:12px;padding:5px 10px;cursor:pointer;font-size:10.5px;font-weight:600;font-family:inherit;}" +
    ".cut-skip:hover{background:var(--hover);}" +
    ".cut-skip:disabled{opacity:.4;cursor:default;}" +
    "#cutPlayBtn{flex-shrink:0;width:28px;height:28px;border-radius:50%;border:none;background:var(--accent-grad);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;padding:0;}" +
    "#cutPlayBtn:hover{opacity:.92;}" +
    "#cutPlayBtn:disabled{opacity:.4;cursor:default;}" +
    "#cutPlayBtn{outline:none;}" +
    "#cutPlayBtn::after{content:'';display:block;width:0;height:0;border-left:9px solid #fff;border-top:6px solid transparent;border-bottom:6px solid transparent;margin-left:3px;}" +
    "#cutPlayBtn.playing::after{width:10px;height:12px;border:none;margin:0;background:linear-gradient(to right,#fff 0,#fff 3px,transparent 3px,transparent 7px,#fff 7px,#fff 10px);}" +
    "#cutPlayDel{flex-shrink:0;width:22px;height:22px;border-radius:50%;border:none;background:linear-gradient(135deg,#d65cf0,#a53bc4);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;outline:none;} #cutPlayDel:hover{opacity:.92;} #cutPlayDel:disabled{opacity:.4;cursor:default;}" +
    "#cutPlayDel::after{content:'';display:block;width:0;height:0;border-left:7px solid #fff;border-top:5px solid transparent;border-bottom:5px solid transparent;margin-left:2px;}" +
    "#cutPlayDel.playing::after{width:8px;height:10px;border:none;margin:0;background:linear-gradient(to right,#fff 0,#fff 3px,transparent 3px,transparent 5px,#fff 5px,#fff 8px);}" +
    "#cutTime{flex-shrink:0;font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums;min-width:84px;}" +
    "#cutScrubber{-webkit-appearance:none;appearance:none;flex:1;height:4px;border-radius:4px;outline:none;border:none;cursor:pointer;background:#333;}" +
    "#cutScrubber::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:transparent;}" +
    "#cutScrubber::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;border-radius:50%;background:var(--accent-1);border:none;outline:none;margin-top:-4px;}" +
    ".cut-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}" +
    ".cut-card{background:var(--panel);border:1px solid #383838;border-radius:10px;padding:12px;display:flex;flex-direction:column;justify-content:center;}" +
    ".cut-card.gauge{grid-row:span 2;align-items:center;}" +
    ".cut-card.full{grid-column:1 / -1;}" +
    ".cut-card .ac-row{margin-bottom:0;}" +
    ".cut-gauge-title{align-self:flex-start;font-size:11.5px;font-weight:500;color:var(--text);}" +
    "#cutGauge{width:100%;max-width:170px;touch-action:none;cursor:pointer;}" +
    ".ac-section{background:var(--panel);border:1px solid #383838;border-radius:10px;padding:12px;}" +
    ".ac-row{display:flex;flex-direction:column;gap:4px;margin-bottom:12px;}" +
    ".ac-row:last-child{margin-bottom:0;}" +
    ".ac-row-head{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;}" +
    ".ac-row-label{color:var(--text);font-weight:500;}" +
    ".ac-row-value{color:var(--accent-1);font-weight:600;font-variant-numeric:tabular-nums;}" +
    ".ac-row input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:4px;outline:none;border:none;box-shadow:none;cursor:pointer;background:#444;}" +
    ".ac-row input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:transparent;border:none;}" +
    ".ac-row input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:var(--accent-1);border:none;outline:none;box-shadow:none;margin-top:-4px;}" +
    ".ac-check{display:flex;align-items:center;gap:5px;font-size:10.5px;white-space:nowrap;color:var(--text);cursor:pointer;}" +
    ".ac-check input{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:5px;background:var(--bg);border:1px solid #4a4a4a;margin:0;cursor:pointer;position:relative;outline:none;flex-shrink:0;}" +
    ".ac-check input:checked{background:var(--accent-1);border-color:var(--accent-1);}" +
    ".ac-check input:checked::after{content:'';position:absolute;left:50%;top:44%;width:4px;height:8px;box-sizing:border-box;border:solid #fff;border-width:0 1.5px 1.5px 0;transform:translate(-50%,-50%) rotate(45deg);}" +
    ".ac-actions{display:flex;gap:8px;}" +
    ".ac-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;border-radius:16px;padding:8px 14px;cursor:pointer;font-size:12px;font-weight:500;font-family:inherit;}" +
    ".ac-btn-primary{background:var(--accent-grad);color:#fff;}" +
    ".ac-btn-primary{transition:box-shadow .15s;} .ac-btn-primary:hover:not(:disabled){box-shadow:0 0 4px 1px rgba(30,159,214,.55);}" +
    "#cutGaugeVal{transition:filter .15s;} .cut-glow #cutGaugeVal{filter:drop-shadow(0 0 4px rgba(30,159,214,.9));}" +
    ".ac-btn-primary:hover{opacity:.92;}" +
    ".ac-btn-secondary{background:var(--panel);color:var(--text);border:1px solid #383838;}" +
    ".ac-btn-secondary:hover{background:var(--hover);}" +
    ".ac-btn:disabled{opacity:.5;cursor:default;}" +
    "#cutStatus{font-size:11.5px;color:var(--muted);min-height:14px;line-height:1.5;white-space:pre-wrap;}" +
    "#cutStatus.ok{color:#3ecf6e;}#cutStatus.err{color:#e05656;}#cutStatus.busy{color:var(--text);}" +
    "#cutStatus.busy::before{content:'';display:inline-block;width:9px;height:9px;margin-right:7px;border:2px solid #444;border-top-color:var(--accent-1);border-radius:50%;animation:cutSpin .8s linear infinite;vertical-align:-1px;}" +
    "@keyframes cutSpin{to{transform:rotate(360deg);}}";
  document.head.appendChild(css);

  /* ---------- state ---------- */
  var S = loadJSON("halalfx_cut_v3", { thr: -35, minDur: 0.4, pad: 120, minSpeech: 0.45, cut: true, markers: false, backup: true, jump: true });

  var clip = null;             // selection info from host
  var rawSilences = null;      // detection output (file seconds) [{s,e}]
  var regions = [];            // refined regions (file seconds)
  var mediaDuration = 0;       // full media file duration (seconds)
  var durTrusted = false;      // true when duration came from ffmpeg / metadata
  var wfImg = null;            // waveform image (ffmpeg png)
  var lastAudioBuffer = null;  // decoded buffer (fallback engine / waveform)
  var lastBufferPath = null;
  var busy = false;
  var PB = { audio: null, playing: false, rafId: null, mode: "normal" };

  /* ---------- small helpers ---------- */
  function setStatus(t, kind) {
    var el = document.getElementById("cutStatus");
    if (!el) return;
    // kind: "err" (red), "ok" (green), "busy" (progress, with a small spinner), or "" (plain note)
    el.textContent = t || "";
    el.className = kind || "";
  }
  function setBusy(b) {
    busy = b;
    var a = document.getElementById("cutAnalyze"), p = document.getElementById("cutApply");
    if (a) a.disabled = b;
    if (p) p.disabled = b || !regions.length || !clip;
    var pl = document.getElementById("cutPlayBtn");
    var b10 = document.getElementById("cutBack10"), f10 = document.getElementById("cutFwd10");
    if (pl) pl.disabled = b || !clip;
    var pd = document.getElementById("cutPlayDel"); if (pd) pd.disabled = b || !clip || !regions.length;
    if (b10) b10.disabled = b || !clip;
    if (f10) f10.disabled = b || !clip;
  }
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var s = Math.floor(sec), m = Math.floor(s / 60);
    s = s % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function fillSlider(input) {
    var min = parseFloat(input.min), max = parseFloat(input.max);
    var pct = ((parseFloat(input.value) - min) / (max - min)) * 100;
    input.style.background = "linear-gradient(to right, var(--accent-2) 0%, var(--accent-1) " + pct + "%, #444 " + pct + "%, #444 100%)";
  }
  function fillScrubber(p) {
    var sc = document.getElementById("cutScrubber");
    if (sc) sc.style.background = "linear-gradient(to right, var(--accent-2) 0%, var(--accent-1) " + (p * 100) + "%, #333 " + (p * 100) + "%, #333 100%)";
  }
  function sliderRow(id, label, min, max, step, value, unit) {
    return '<div class="ac-row">' +
      '<div class="ac-row-head">' +
        '<span class="ac-row-label">' + label + '</span>' +
        '<span class="ac-row-value" id="' + id + 'Val">' + value + unit + '</span>' +
      '</div>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">' +
    '</div>';
  }
  function evalHost(fn, arg, cb) {
    var call = arg === undefined ? fn + "()" : fn + "(" + JSON.stringify(arg) + ")";
    hsEval(call, cb);
  }

  /* ---------- ffmpeg (lookup lives in common.js) ---------- */
  function parseSilences(text) {
    var out = [], cur = null, m;
    var reStart = /silence_start:\s*(-?[\d.]+)/;
    var reEnd = /silence_end:\s*(-?[\d.]+)(?:\s*\|\s*silence_duration:\s*(-?[\d.]+))?/;
    text.split(/\r?\n/).forEach(function (line) {
      if ((m = line.match(reStart))) {
        if (cur !== null) out.push({ s: cur, e: -1 });
        cur = Math.max(0, parseFloat(m[1]));
      } else if ((m = line.match(reEnd))) {
        var e = parseFloat(m[1]);
        if (cur !== null) { out.push({ s: cur, e: e }); cur = null; }
        else out.push({ s: Math.max(0, e - (m[2] ? parseFloat(m[2]) : 0)), e: e });
      }
    });
    if (cur !== null) out.push({ s: cur, e: -1 });
    return out;
  }

  function detectFFmpeg(path, cb) {
    var exe = hsFindFfmpeg();
    if (!exe) return cb(new Error("no ffmpeg"));
    var args = ["-hide_banner", "-nostats", "-i", path, "-vn",
                "-af", "silencedetect=noise=" + S.thr + "dB:d=" + S.minDur, "-f", "null", "-"];
    var err = "", done = false, proc;
    try { proc = cp.spawn(exe, args, { windowsHide: true }); } catch (e) { return cb(e); }
    proc.stderr.on("data", function (d) { err += d.toString(); });
    proc.on("error", function (e) { if (!done) { done = true; cb(e); } });
    proc.on("close", function (code) {
      if (done) return; done = true;
      // ffmpeg prints the real file duration in its info output
      var dur = 0, m = err.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
      if (m) dur = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
      if (code !== 0 && !dur) return cb(new Error("ffmpeg exit " + code));
      cb(null, parseSilences(err), dur);
    });
  }

  /* ---------- built-in decoder (fallback) ---------- */
  function decodeFile(path, cb) {
    if (!fs) return cb(new Error("Node.js not available"));
    if (lastBufferPath === path && lastAudioBuffer) return cb(null, lastAudioBuffer);
    fs.readFile(path, function (er, buf) {
      if (er) return cb(er);
      var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      var AC = window.AudioContext || window.webkitAudioContext;
      var ctx = new AC();
      ctx.decodeAudioData(ab, function (audio) {
        try { ctx.close(); } catch (x) {}
        lastAudioBuffer = audio; lastBufferPath = path;
        cb(null, audio);
      }, function () {
        try { ctx.close(); } catch (x) {}
        cb(new Error("Could not decode audio"));
      });
    });
  }

  function detectBuiltin(path, cb) {
    decodeFile(path, function (err, audio) {
      if (err) return cb(err);
      if (audio.duration > 0 && !durTrusted) { mediaDuration = audio.duration; durTrusted = true; }
      var sr = audio.sampleRate, ch = audio.numberOfChannels;
      var win = Math.max(1, Math.floor(sr * 0.01));
      var datas = [], k;
      for (k = 0; k < ch; k++) datas.push(audio.getChannelData(k));
      var thrLin = Math.pow(10, S.thr / 20);
      var out = [], runStart = -1, i, j, sum;
      for (i = 0; i < audio.length; i += win) {
        var end = Math.min(audio.length, i + win);
        sum = 0;
        for (k = 0; k < datas.length; k++) { var d = datas[k]; for (j = i; j < end; j++) sum += d[j] * d[j]; }
        var rms = Math.sqrt(sum / ((end - i) * datas.length));
        var t = i / sr;
        if (rms < thrLin) { if (runStart < 0) runStart = t; }
        else if (runStart >= 0) { if (t - runStart >= S.minDur) out.push({ s: runStart, e: t }); runStart = -1; }
      }
      if (runStart >= 0) out.push({ s: runStart, e: audio.duration });
      cb(null, out);
    });
  }

  /* ---------- waveform image (ffmpeg) ---------- */
  var wfCache = {};
  function generateWaveformPng(path, cb) {
    if (wfCache[path]) return cb(wfCache[path]);
    var exe = hsFindFfmpeg();
    if (!exe || !osMod) return cb(null);
    var out = pathMod.join(osMod.tmpdir(), "halalfx_wf_" + Date.now() + ".png");
    var args = ["-hide_banner", "-nostats", "-y", "-i", path,
                "-filter_complex", "showwavespic=s=1600x400:colors=#1e9fd6", "-frames:v", "1", out];
    try {
      cp.execFile(exe, args, { maxBuffer: 10 * 1024 * 1024, timeout: 120000, windowsHide: true }, function () {
        if (!fs.existsSync(out)) return cb(null);
        var b64 = fs.readFileSync(out).toString("base64");
        try { fs.unlinkSync(out); } catch (e) {}
        wfCache[path] = b64;
        cb(b64);
      });
    } catch (e) { cb(null); }
  }

  function ensureWaveform(cb) {
    if (wfImg) return cb(true);
    generateWaveformPng(clip.path, function (b64) {
      if (b64) {
        var img = new Image();
        img.onload = function () { wfImg = img; cb(true); };
        img.onerror = function () { decodeFile(clip.path, function () { cb(!!lastAudioBuffer); }); };
        img.src = "data:image/png;base64," + b64;
      } else {
        decodeFile(clip.path, function () { cb(!!lastAudioBuffer); });
      }
    });
  }

  var peaksCache = null, peaksSrc = null;
  function getPeaks() {
    var src = wfImg || lastAudioBuffer;
    if (!src) return null;
    if (peaksCache && peaksSrc === src) return peaksCache;
    var N = 800, p = [], i, j, mx = 0;
    if (wfImg) {
      var oc = document.createElement("canvas");
      oc.width = wfImg.width; oc.height = wfImg.height;
      var x = oc.getContext("2d");
      x.drawImage(wfImg, 0, 0);
      var W = oc.width, H = oc.height, half = H / 2;
      var d = x.getImageData(0, 0, W, H).data;
      for (i = 0; i < N; i++) {
        var c0 = Math.floor(i * W / N), c1 = Math.max(c0 + 1, Math.floor((i + 1) * W / N)), top = half;
        for (var col = c0; col < c1 && col < W; col++) {
          for (var y = 0; y < top; y++) {
            if (d[(y * W + col) * 4 + 2] > 60) { top = y; break; }
          }
        }
        p.push((half - top) / half);
      }
    } else {
      var b = lastAudioBuffer, step = Math.max(1, Math.floor(b.length / N));
      for (i = 0; i < N; i++) {
        var m = 0;
        for (var ch = 0; ch < b.numberOfChannels; ch++) {
          var dd = b.getChannelData(ch), end = Math.min(b.length, (i + 1) * step);
          for (j = i * step; j < end; j++) { var v = Math.abs(dd[j]); if (v > m) m = v; }
        }
        p.push(m);
      }
    }
    for (i = 0; i < N; i++) if (p[i] > mx) mx = p[i];
    if (mx > 0) for (i = 0; i < N; i++) p[i] = p[i] / mx;   // normalize so the track fills the height
    peaksCache = p; peaksSrc = src;
    return p;
  }

  function drawBars(c, w, h, dpr) {
    var peaks = getPeaks();
    if (!peaks) return false;
    var barW = 3 * dpr, gap = 2 * dpr, n = Math.max(1, Math.floor(w / (barW + gap)));
    var mid = h / 2, per = peaks.length / n;
    c.fillStyle = "#1e9fd6";
    for (var k = 0; k < n; k++) {
      var m = 0, i0 = Math.floor(k * per), i1 = Math.max(i0 + 1, Math.floor((k + 1) * per));
      for (var i = i0; i < i1 && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
      var bh = Math.max(2 * dpr, m * h * 0.66);
      c.fillRect(k * (barW + gap), mid - bh / 2, barW, bh);
    }
    return true;
  }

  /* ---------- refine (merge close silences + padding + clip range) ---------- */
  function refineRegions(raw, dur, lo, hi) {
    var padSec = (parseFloat(S.pad) || 0) / 1000;
    var minSpeechSec = parseFloat(S.minSpeech) || 0;
    if (!lo || lo < 0) lo = 0;
    if (!hi || hi <= lo) hi = dur > 0 ? dur : Infinity;
    var filled = (raw || []).map(function (r) {
      var e = r.e;
      if (e < 0 && dur > 0) e = dur;
      return { s: Math.max(0, r.s), e: e };
    }).filter(function (r) { return r.e > r.s; });
    filled.sort(function (a, b) { return a.s - b.s; });
    var merged = [];
    filled.forEach(function (r) {
      if (!merged.length) { merged.push({ s: r.s, e: r.e }); return; }
      var last = merged[merged.length - 1];
      if (r.s - last.e < minSpeechSec) { if (r.e > last.e) last.e = r.e; }
      else merged.push({ s: r.s, e: r.e });
    });
    return merged.map(function (m) {
      var s = m.s + padSec, e = m.e - padSec;
      if (s < lo) s = lo;
      if (e > hi) e = hi;
      return e - s > 0.02 ? { s: s, e: e } : null;
    }).filter(Boolean);
  }

  /* ---------- duration resolution (bulletproof) ---------- */
  function resolveDuration() {
    if (mediaDuration > 0) return mediaDuration;
    if (PB.audio && isFinite(PB.audio.duration) && PB.audio.duration > 0) return PB.audio.duration;
    if (lastAudioBuffer && lastAudioBuffer.duration > 0) return lastAudioBuffer.duration;
    if (clip && isFinite(clip.inPoint) && isFinite(clip.outPoint) && clip.outPoint > clip.inPoint) return clip.outPoint + 0.5;
    var mx = 0;
    regions.forEach(function (r) { if (r.e > mx) mx = r.e; });
    return mx > 0 ? mx + 0.5 : 0;
  }

  /* ---------- drawing (regions are ALWAYS drawn) ---------- */
  function drawAll(tOverride) {
    var cv = document.getElementById("cutWaveCanvas");
    if (!cv || !cv.clientWidth) return;
    var dpr = window.devicePixelRatio || 1;
    var cw = Math.round(cv.clientWidth * dpr), ch = Math.round(cv.clientHeight * dpr);
    if (cv.width !== cw) cv.width = cw;
    if (cv.height !== ch) cv.height = ch;
    var c = cv.getContext("2d");
    var w = cv.width, h = cv.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#0a0a0a";
    c.fillRect(0, 0, w, h);

    if (!drawBars(c, w, h, dpr)) {
      c.strokeStyle = "#2a5a75"; c.lineWidth = 2 * dpr;
      c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
    }

    var dur = resolveDuration();
    if (dur > 0) {
      regions.forEach(function (r) {
        var x1 = (r.s / dur) * w, x2 = (r.e / dur) * w;
        c.fillStyle = "rgba(205,80,235,0.35)";
        c.fillRect(x1, 0, Math.max(2 * dpr, x2 - x1), h);
        c.strokeStyle = "rgba(225,110,245,0.95)";
        c.lineWidth = 2 * dpr;
        c.beginPath(); c.moveTo(x1, 0); c.lineTo(x1, h); c.stroke();
        c.beginPath(); c.moveTo(x2, 0); c.lineTo(x2, h); c.stroke();
      });
    }

    var t = (tOverride === undefined) ? (PB.audio ? PB.audio.currentTime : 0) : tOverride;
    if (dur > 0) {
      var x = (Math.max(0, Math.min(t, dur)) / dur) * w;
      c.strokeStyle = "#ffffff"; c.lineWidth = 2 * dpr;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
    }
  }

  function updateStats() {
    var pd = document.getElementById("cutPlayDel"); if (pd) pd.disabled = busy || !clip || !regions.length;
    var el = document.getElementById("cutStats");
    if (!el) return;
    if (!rawSilences) { el.className = "cut-stats empty"; el.textContent = "No scan yet"; return; }
    if (!regions.length) { el.className = "cut-stats empty"; el.textContent = "No regions found"; return; }
    var total = 0;
    regions.forEach(function (r) { total += r.e - r.s; });
    var dur = resolveDuration();
    el.className = "cut-stats";
    el.textContent = regions.length + " regions · " + total.toFixed(2) + "s removed" +
                     (dur > total ? " · output " + fmtTime(dur - total) : "");
  }
  function updateTime(t) {
    var el = document.getElementById("cutTime");
    if (!el) return;
    var dur = resolveDuration() || (PB.audio && PB.audio.duration) || 0;
    el.textContent = fmtTime(t) + " / " + fmtTime(dur);
  }

  /* ---------- playback with jump cuts ---------- */
  function setPlayIcon(on) {
    var b = document.getElementById("cutPlayBtn"), d = document.getElementById("cutPlayDel");
    if (b) b.classList.toggle("playing", on && PB.mode !== "deleted");
    if (d) d.classList.toggle("playing", on && PB.mode === "deleted");
  }
  function stopPB(reset) {
    if (PB.rafId) { cancelAnimationFrame(PB.rafId); PB.rafId = null; }
    PB.playing = false;
    if (PB.audio) {
      try { PB.audio.pause(); } catch (e) {}
      if (reset) { try { PB.audio.currentTime = 0; } catch (e) {} }
    }
    setPlayIcon(false);
    drawAll(reset ? 0 : undefined);
  }
  function ensureAudio() {
    if (!clip || !clip.path) return null;
    if (PB.audio) return PB.audio;
    var a = new Audio(fileUrl(clip.path));
    a.addEventListener("loadedmetadata", function () {
      if (isFinite(a.duration) && a.duration > 0 && !durTrusted) {
        mediaDuration = a.duration; durTrusted = true;
        updateStats(); updateTime(PB.audio.currentTime); drawAll();
      }
    });
    a.addEventListener("ended", function () { stopPB(true); updateTime(0); fillScrubber(0); });
    PB.audio = a;
    return a;
  }
  function loop() {
    if (!PB.playing) return;
    var a = PB.audio;
    if (a) {
      var t = a.currentTime;
      if (PB.mode === "deleted" && regions.length) {
        var inside = false, nx = null;
        for (var q = 0; q < regions.length; q++) {
          var rq = regions[q];
          if (t >= rq.s - 0.001 && t < rq.e) { inside = true; break; }
          if (rq.s > t && (nx === null || rq.s < nx)) nx = rq.s;
        }
        if (!inside) {
          if (nx === null) { stopPB(false); return; }
          try { a.currentTime = nx; } catch (e) {}
          t = nx;
        }
      } else if (S.jump && regions.length) {
        for (var i = 0; i < regions.length; i++) {
          var r = regions[i];
          if (t >= r.s - 0.03 && t < r.e - 0.001) {
            try { a.currentTime = r.e + 0.002; } catch (e) {}
            t = r.e;
            break;
          }
        }
      }
      updateTime(t);
      var dur = resolveDuration() || a.duration || 0;
      var sc = document.getElementById("cutScrubber");
      if (sc && dur > 0 && document.activeElement !== sc) {
        var p = Math.max(0, Math.min(1, t / dur));
        sc.value = p; fillScrubber(p);
      }
    }
    drawAll();
    PB.rafId = requestAnimationFrame(loop);
  }
  function playMode(mode) {
    if (!clip) { setStatus("Select a clip on the timeline and press Analyze first.", ""); return; }
    var a = ensureAudio();
    if (!a) return;
    if (PB.playing && PB.mode === mode) { stopPB(false); return; }
    if (mode === "deleted") {
      if (!regions.length) return;
      var cur = a.currentTime;
      if (!regions.some(function (r) { return r.e > cur; })) { try { a.currentTime = regions[0].s; } catch (e) {} }
    }
    PB.mode = mode;
    if (!PB.playing) {
      try { var pr = a.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
      PB.playing = true;
      setPlayIcon(true);
      loop();
    } else setPlayIcon(true);
  }
  function togglePlay() { playMode("normal"); }
  function skip(sec) {
    if (!PB.audio) return;
    var dur = resolveDuration() || PB.audio.duration || 0;
    var t = Math.max(0, Math.min(dur, PB.audio.currentTime + sec));
    try { PB.audio.currentTime = t; } catch (e) {}
    updateTime(t); drawAll(t);
    if (dur > 0) {
      var scEl = document.getElementById("cutScrubber");
      if (scEl) scEl.value = t / dur;
      fillScrubber(t / dur);
    }
  }

  /* ---------- timeline audio: what the selected clips sound like on the timeline right now ---------- */
  var viewWav = null;   // temp wav of the current analysis
  function dropView() { if (viewWav) { try { fs.unlinkSync(viewWav); } catch (e) {} viewWav = null; } }

  // clips: [{path,name,inPoint,outPoint,start,end}] -> cb(err, { path, start, end, dur, cover:[{s,e}] }) ; times relative to `start`
  function buildTimelineAudio(clips, cb) {
    var exe = hsFindFfmpeg(), stamp = Date.now(), segs = [], idx = 0;
    if (!exe) return cb(new Error(HS_FFMPEG_MISSING));
    clips = clips.slice().sort(function (a, b) { return a.start - b.start; });
    var minStart = clips[0].start, maxEnd = clips[0].end;
    clips.forEach(function (c) { if (c.end > maxEnd) maxEnd = c.end; });
    var span = Math.ceil((maxEnd - minStart) * 16000);
    if (span > 16000 * 3 * 3600) return cb(new Error("The selection is too long (more than 3 hours)."));
    function next() {
      if (idx >= clips.length) return finishMix();
      var c = clips[idx++], wav = pathMod.join(osMod.tmpdir(), "halalfx_cut_" + stamp + "_" + idx + ".wav");
      setStatus((clips.length > 1 ? "Clip " + idx + " of " + clips.length + ": " : "") + "Reading audio...", "busy");
      var args = ["-y", "-ss", String(c.inPoint), "-t", String(c.outPoint - c.inPoint), "-i", c.path, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav], p;
      try { p = cp.spawn(exe, args, { windowsHide: true }); } catch (e) { return cb(e); }
      var fin = false;   // "error" and "close" can both fire for one process
      p.on("error", function (e) { if (fin) return; fin = true; cb(e); });
      p.on("close", function (code) {
        if (fin) return; fin = true;
        var pcm = null;
        if (code === 0 && fs.existsSync(wav)) { try { pcm = hsReadPcm(wav); } catch (e) {} }
        try { fs.unlinkSync(wav); } catch (e) {}
        if (!pcm) return cb(new Error('Could not read the audio of "' + c.name + '".'));
        segs.push({ c: c, pcm: pcm });
        next();
      });
    }
    function finishMix() {
      var mix = new Int16Array(span), cover = [];
      segs.forEach(function (sg) {
        var o = Math.round((sg.c.start - minStart) * 16000), i, v, n = Math.min(sg.pcm.length, Math.round((sg.c.end - sg.c.start) * 16000));
        for (i = 0; i < n && o + i < span; i++) { v = mix[o + i] + sg.pcm[i]; mix[o + i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v; }
        var cs = sg.c.start - minStart, ce = sg.c.end - minStart, l = cover[cover.length - 1];
        if (l && cs <= l.e + 0.001) { if (ce > l.e) l.e = ce; } else cover.push({ s: cs, e: ce });
      });
      var out = pathMod.join(osMod.tmpdir(), "halalfx_cut_" + stamp + "_view.wav");
      try { hsWriteWav(mix, out); } catch (e) { return cb(e); }
      cb(null, { path: out, start: minStart, end: maxEnd, dur: span / 16000, cover: cover });
    }
    next();
  }
  // keep only the parts of the regions that lie over clips (the gaps between clips are not silence to cut)
  function limitToCover(list, cover) {
    var out = [];
    list.forEach(function (r) {
      cover.forEach(function (c) {
        var s = Math.max(r.s, c.s), e = Math.min(r.e, c.e);
        if (e - s > 0.02) out.push({ s: s, e: e });
      });
    });
    return out;
  }

  /* ---------- analyze / apply ---------- */
  var cover = [];
  function clearScan() {
    stopPB(true); dropView();
    clip = null; rawSilences = null; regions = []; cover = [];
    wfImg = null; lastAudioBuffer = null; lastBufferPath = null;
    if (PB.audio) PB.audio = null;
    mediaDuration = 0; durTrusted = false;
  }
  function analyze() {
    if (busy) return;
    readSettings();
    clearScan();
    setBusy(true);
    setStatus("Reading selection...", "busy");
    updateStats(); drawAll(0);
    evalHost("flGetClips", undefined, function (res) {
      if (res.error) { setStatus(res.error, "err"); return setBusy(false); }
      buildTimelineAudio(res.clips, function (err, tl) {
        if (err) { setStatus(err.message, "err"); return setBusy(false); }
        viewWav = tl.path; cover = tl.cover;
        var c = { path: tl.path, name: res.clips.length > 1 ? res.clips.length + " clips" : res.clips[0].name, inPoint: 0, outPoint: tl.dur, start: tl.start, end: tl.end, speedWarn: false };
        clip = c;
        mediaDuration = tl.dur; durTrusted = true;
        ensureAudio();
        setStatus('Analyzing "' + c.name + '"...', "busy");
        detectFFmpeg(c.path, function (err2, raw) {
          if (err2) {
            return detectBuiltin(c.path, function (err3, raw2) { finish(err3, raw2, true); });
          }
          finish(null, raw, false);
        });
      });
    });

    function finish(err, raw, fallback) {
      if (err) { setStatus("Analysis failed: " + err.message, "err"); return setBusy(false); }
      rawSilences = raw;
      var lo = clip.inPoint || 0;
      var hi = (clip.outPoint && clip.outPoint > lo) ? clip.outPoint : 0;
      regions = limitToCover(refineRegions(rawSilences, mediaDuration, lo, hi), cover);
      updateStats(); updateTime(0); drawAll(0);
      ensureWaveform(function () { drawAll(0); });
      var total = 0;
      regions.forEach(function (r) { total += r.e - r.s; });
      var dur = resolveDuration();
      var msg;
      if (regions.length) {
        msg = regions.length + " region(s) · " + total.toFixed(1) + "s of " +
              (dur > 0 ? dur.toFixed(1) + "s" : "?") + " will be removed" +
              (dur > total ? " · output " + fmtTime(dur - total) : "") +
              (fallback ? "  (built-in decoder)" : "");
      } else {
        msg = "No silences found — try a higher Threshold (e.g. -30) or shorter Min silence.";
      }
      if (clip.speedWarn) msg += "\nWarning: clip looks speed-changed; positions may be off.";
      setStatus(msg, regions.length ? "ok" : "");
      setBusy(false);
    }
  }

  function readSettings() {
    S.thr = parseFloat(document.getElementById("cutThr").value);
    S.minDur = parseFloat(document.getElementById("cutMin").value);
    S.pad = parseFloat(document.getElementById("cutPad").value);
    S.minSpeech = parseFloat(document.getElementById("cutMinSpeech").value);
    if (isNaN(S.thr)) S.thr = -35;
    if (isNaN(S.minDur) || S.minDur < 0.05) S.minDur = 0.4;
    if (isNaN(S.pad) || S.pad < 0) S.pad = 120;
    if (isNaN(S.minSpeech) || S.minSpeech < 0) S.minSpeech = 0.45;
    saveJSON("halalfx_cut_v3", S);
  }

  function apply() {
    if (busy || !regions.length || !clip) return;
    if (!S.cut && !S.markers) { setStatus("Select at least one action: Cut or Markers.", "err"); return; }
    stopPB(false);
    setBusy(true);
    setStatus("Working in Premiere, please wait... (long clips can take a minute)", "busy");
    var c = clip, tl = [];
    regions.forEach(function (r) {
      var ts = c.start + (r.s - c.inPoint);
      var te = c.start + (r.e - c.inPoint);
      if (te <= c.start || ts >= c.end) return;
      if (ts < c.start) ts = c.start;
      if (te > c.end) te = c.end;
      if (te - ts > 0.02) tl.push({ s: ts, e: te });
    });
    if (!tl.length) { setStatus("Nothing to cut inside the selected clip range.", ""); return setBusy(false); }
    var payload = JSON.stringify({ silences: tl, cut: S.cut, markers: S.markers, backup: S.backup });
    setTimeout(function () {
      evalHost("hsApplyCuts", payload, function (r) {
        if (r.error) { setStatus("Error: " + r.error, "err"); return setBusy(false); }
        if (r.failed) { setStatus(r.failed + " clip(s) could not be removed.", "err"); return setBusy(false); }
        if (S.cut) { clearScan(); updateStats(); updateTime(0); drawAll(0); }   // the timeline changed: scan again
        setStatus("Done.", "ok");
        setBusy(false);
      });
    }, 50);
  }

  /* ---------- cut screen ---------- */
  function renderCutScreen() {
    contentEl.className = "";
    contentEl.innerHTML =
      '<div id="cutScreen">' +
        '<div id="cutFfmpeg"></div>' +
        '<div class="ac-preview">' +
          '<div class="cut-top">' +
            '<label class="cut-toggle"><input id="cutJump" type="checkbox"' + (S.jump ? " checked" : "") + '>Preview with jump cuts</label>' +
          '</div>' +
          '<div class="ac-waveform-wrap"><canvas id="cutWaveCanvas" width="1600" height="400"></canvas></div>' +
          '<div class="ac-controls">' +
            '<button id="cutBack10" class="cut-skip" title="Back 10s">-10s</button>' +
            '<button id="cutPlayBtn" title="Play / Pause"></button>' +
            '<button id="cutPlayDel" title="Play only the parts that will be removed"></button>' +
            '<button id="cutFwd10" class="cut-skip" title="Forward 10s">+10s</button>' +
            '<span id="cutTime">0:00 / 0:00</span>' +
            '<input id="cutScrubber" type="range" min="0" max="1" step="0.001" value="0">' +
          '</div>' +
        '</div>' +
        '<div class="cut-grid">' +
          '<div class="cut-card gauge">' +
            '<span class="cut-gauge-title">Silence Cutoff</span>' +
            '<input type="range" id="cutThr" min="-60" max="-10" step="1" value="' + S.thr + '" style="display:none">' +
            '<svg id="cutGauge" viewBox="0 0 140 130">' +
              '<path id="cutGaugeTrack" fill="none" stroke="#333" stroke-width="9" stroke-linecap="round"></path>' +
              '<path id="cutGaugeVal" fill="none" stroke="var(--accent-1)" stroke-width="9" stroke-linecap="round"></path>' +
              '<circle id="cutGaugeKnob" r="7" fill="#fff" stroke="var(--accent-1)" stroke-width="3"></circle>' +
              '<text id="cutThrVal" x="70" y="76" text-anchor="middle" fill="#E0E0E0" font-size="17" font-weight="600">' + S.thr + ' dB</text>' +
            '</svg>' +
          '</div>' +
          '<div class="cut-card">' + sliderRow("cutMin", "Min silence length", 0.1, 3, 0.05, S.minDur, " s") + '</div>' +
          '<div class="cut-card">' + sliderRow("cutMinSpeech", "Min speech length", 0.05, 1, 0.05, S.minSpeech, " s") + '</div>' +
          '<div class="cut-card full">' + sliderRow("cutPad", "Padding around speech", 0, 500, 10, S.pad, " ms") + '</div>' +
        '</div>' +
        '<div class="ac-section">' +
          '<div class="ac-row-label" style="margin-bottom:10px;">Action</div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
            '<label class="ac-check"><input id="cutBackup" type="checkbox"' + (S.backup ? " checked" : "") + '>Backup sequence first</label>' +
            '<label class="ac-check"><input id="cutDoCut" type="checkbox"' + (S.cut ? " checked" : "") + '>Cut &amp; ripple delete</label>' +
            '<label class="ac-check"><input id="cutDoMarkers" type="checkbox"' + (S.markers ? " checked" : "") + '>Add markers</label>' +
          '</div>' +
        '</div>' +
        '<div class="ac-actions">' +
          '<button id="cutAnalyze" class="ac-btn ac-btn-primary">Analyze selected clips</button>' +
          '<button id="cutApply" class="ac-btn ac-btn-secondary" disabled>Run Silence Remover</button>' +
        '</div>' +
        '<div id="cutStatus"></div>' +
      '</div>';

    hsFfmpegMount(document.getElementById("cutFfmpeg"));
    document.getElementById("cutAnalyze").addEventListener("click", analyze);
    document.getElementById("cutApply").addEventListener("click", apply);
    document.getElementById("cutPlayBtn").addEventListener("click", togglePlay);
    document.getElementById("cutPlayDel").addEventListener("click", function () { playMode("deleted"); });
    document.getElementById("cutBack10").addEventListener("click", function () { skip(-10); });
    document.getElementById("cutFwd10").addEventListener("click", function () { skip(10); });
    document.getElementById("cutDoCut").addEventListener("change", function () { S.cut = this.checked; saveJSON("halalfx_cut_v3", S); });
    document.getElementById("cutDoMarkers").addEventListener("change", function () { S.markers = this.checked; saveJSON("halalfx_cut_v3", S); });
    document.getElementById("cutBackup").addEventListener("change", function () { S.backup = this.checked; saveJSON("halalfx_cut_v3", S); });
    document.getElementById("cutJump").addEventListener("change", function () { S.jump = this.checked; saveJSON("halalfx_cut_v3", S); });

    var sc = document.getElementById("cutScrubber");
    sc.addEventListener("input", function () {
      var dur = resolveDuration() || (PB.audio && PB.audio.duration) || 0;
      if (!dur) return;
      var v = parseFloat(sc.value);
      var t = v * dur;
      if (PB.audio) { try { PB.audio.currentTime = t; } catch (e) {} }
      updateTime(t); drawAll(t); fillScrubber(v);
    });
    fillScrubber(0);

    var thrIn = document.getElementById("cutThr"), gauge = document.getElementById("cutGauge");
    function polar(deg) {
      var r = deg * Math.PI / 180;
      return { x: 70 + 52 * Math.cos(r), y: 66 + 52 * Math.sin(r) };
    }
    function arc(from, to) {
      var a = polar(from), b = polar(to);
      return "M" + a.x + " " + a.y + " A52 52 0 " + ((to - from) > 180 ? 1 : 0) + " 1 " + b.x + " " + b.y;
    }
    function drawGauge() {
      var mn = parseFloat(thrIn.min), mx = parseFloat(thrIn.max);
      var frac = (parseFloat(thrIn.value) - mn) / (mx - mn);
      var ang = 135 + 270 * frac, k = polar(ang);
      document.getElementById("cutGaugeTrack").setAttribute("d", arc(135, 405));
      document.getElementById("cutGaugeVal").setAttribute("d", frac > 0.003 ? arc(135, ang) : "");
      var knob = document.getElementById("cutGaugeKnob");
      knob.setAttribute("cx", k.x); knob.setAttribute("cy", k.y);
    }
    function gaugePointer(e) {
      var rc = gauge.getBoundingClientRect();
      var cx = rc.left + rc.width * 70 / 140, cy = rc.top + rc.height * 66 / 130;
      var deg = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      var rel = ((deg - 135) % 360 + 360) % 360;
      if (rel > 270) rel = rel > 315 ? 0 : 270;
      var mn = parseFloat(thrIn.min), mx = parseFloat(thrIn.max);
      thrIn.value = Math.round(mn + (rel / 270) * (mx - mn));
      thrIn.dispatchEvent(new Event("input"));
    }
    var dragging = false;
    gauge.addEventListener("pointerdown", function (e) { dragging = true; gauge.classList.add("cut-glow"); try { gauge.setPointerCapture(e.pointerId); } catch (x) {} gaugePointer(e); });
    gauge.addEventListener("pointermove", function (e) { if (dragging) gaugePointer(e); });
    function gaugeRelease() { dragging = false; gauge.classList.remove("cut-glow"); }
    gauge.addEventListener("pointerup", gaugeRelease);
    gauge.addEventListener("pointercancel", gaugeRelease);
    gauge.addEventListener("lostpointercapture", gaugeRelease);
    thrIn.addEventListener("input", drawGauge);
    drawGauge();

    [
      { id: "cutThr", key: "thr", unit: " dB", live: false },
      { id: "cutMin", key: "minDur", unit: " s", live: false },
      { id: "cutPad", key: "pad", unit: " ms", live: true },
      { id: "cutMinSpeech", key: "minSpeech", unit: " s", live: true }
    ].forEach(function (cfg) {
      var input = document.getElementById(cfg.id);
      var val = document.getElementById(cfg.id + "Val");
      input.addEventListener("input", function () {
        S[cfg.key] = parseFloat(input.value);
        val.textContent = input.value + cfg.unit;
        saveJSON("halalfx_cut_v3", S);
        fillSlider(input);
        if (rawSilences) {
          if (cfg.live) {
            var lo = clip ? (clip.inPoint || 0) : 0;
            var hi = (clip && clip.outPoint > lo) ? clip.outPoint : 0;
            regions = limitToCover(refineRegions(rawSilences, mediaDuration, lo, hi), cover);
            drawAll(); updateStats();
          } else {
            setStatus("Press Analyze to re-detect with the new value.", "");
          }
        }
      });
      fillSlider(input);
    });

    if (clip && rawSilences) {
      drawAll(0);
      updateStats();
      updateTime(0);
      setStatus("", "");
    }
    setBusy(false);
  }

  window.addEventListener("resize", function () { drawAll(); });
  window.addEventListener("unload", function () { stopPB(false); dropView(); });   // no temp audio left behind when the panel closes

  /* ---------- hooks into main.js ---------- */
  var prevRender = renderActiveTab;
  renderActiveTab = function () {
    if (state.activeTab === "cut") { crumbEl.textContent = ""; renderCutScreen(); }
    else prevRender();
  };
  var prevSetTab = setActiveTab;
  setActiveTab = function (tab) {
    if (state.activeTab === "cut" && tab !== "cut") stopPB(false);
    prevSetTab(tab);
  };
})();