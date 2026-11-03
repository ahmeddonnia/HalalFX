/* HalalFX - shared helpers. Loaded first; every tab uses these instead of keeping its own copy. */

var csInterface = new CSInterface();

/* ---------- persisted settings ---------- */
function hsIsObj(x) { return !!x && typeof x === "object" && !(x instanceof Array); }

// Stored settings are merged over the defaults, so a setting added in a newer version never comes back undefined.
function hsMerge(def, val) {
  if (def instanceof Array) return val instanceof Array ? val : def;
  if (!hsIsObj(def)) return (val === null || val === undefined) ? def : val;
  if (!hsIsObj(val)) return def;
  var out = {}, k;
  for (k in def) { if (def.hasOwnProperty(k)) out[k] = hsMerge(def[k], val.hasOwnProperty(k) ? val[k] : undefined); }
  for (k in val) { if (val.hasOwnProperty(k) && !out.hasOwnProperty(k)) out[k] = val[k]; }
  return out;
}
function loadJSON(key, fallback) {
  try {
    var v = localStorage.getItem(key);
    return v ? hsMerge(fallback, JSON.parse(v)) : fallback;
  } catch (e) { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

/* ---------- files ---------- */
// file:// URL for an absolute path; every segment is encoded, so names containing # ? % or spaces still load.
function fileUrl(p) {
  var s = String(p).replace(/\\/g, "/"), m = /^[A-Za-z]:/.exec(s);
  function enc(x) { return x.split("/").map(encodeURIComponent).join("/"); }
  if (m) return "file:///" + m[0] + enc(s.substring(2));
  if (s.indexOf("//") === 0) return "file:" + enc(s);
  return "file://" + enc(s);
}

// mkdir -p that also works on the older Node versions inside CEP (no { recursive: true } there).
function hsMkdirp(dir) {
  var fs = require("fs"), path = require("path"), parent;
  if (!dir || fs.existsSync(dir)) return;
  parent = path.dirname(dir);
  if (parent && parent !== dir) hsMkdirp(parent);
  try { fs.mkdirSync(dir); } catch (e) { if (!fs.existsSync(dir)) throw e; }
}

/* ---------- app data folder, and the one-time move from the old "HalalSFX" names ---------- */
var HS_DATA_DIR = (function () {
  var d = "";
  try { d = csInterface.getSystemPath(SystemPath.USER_DATA); } catch (e) {}
  if (!d) { try { d = require("os").homedir(); } catch (e2) {} }
  return d;
})();
var HS_APP_DIR = "";   // <AppData>\HalalFX : speech engine, models, ffmpeg, saved SRT files
(function () {
  // settings saved by older versions under halalsfx_* keys
  try {
    var old = [], i, k;
    for (i = 0; i < localStorage.length; i++) { k = localStorage.key(i); if (k && k.indexOf("halalsfx_") === 0) old.push(k); }
    old.forEach(function (key) {
      var nk = "halalfx_" + key.substring(9);
      if (localStorage.getItem(nk) === null) localStorage.setItem(nk, localStorage.getItem(key));
      localStorage.removeItem(key);
    });
  } catch (e) {}
  // <AppData>\HalalSFX -> <AppData>\HalalFX (a rename, so the downloaded models are kept and not downloaded again)
  try {
    var fs = require("fs"), path = require("path"), od, nd;
    if (HS_DATA_DIR) {
      od = path.join(HS_DATA_DIR, "HalalSFX"); nd = path.join(HS_DATA_DIR, "HalalFX");
      HS_APP_DIR = nd;
      if (!fs.existsSync(nd) && fs.existsSync(od)) { try { fs.renameSync(od, nd); } catch (e1) { HS_APP_DIR = od; } }
    }
  } catch (e2) {}
})();

/* ---------- Premiere (ExtendScript) bridge ---------- */
// call: the full ExtendScript call as a string. cb receives the parsed JSON reply, or { error } when the reply is not JSON.
function hsEval(call, cb) {
  csInterface.evalScript(call, function (r) {
    var o;
    try { o = JSON.parse(r); } catch (e) { o = { error: "Unexpected reply from Premiere: " + r }; }
    cb(o);
  });
}

/* ---------- ffmpeg ---------- */
var HS_FFMPEG = null;
// Looks in the panel folder, then AppData\HalalFX\ffmpeg (where the Download button puts it), then on PATH. Returns a path / command name, or null.
function hsFindFfmpeg() {
  if (HS_FFMPEG) return HS_FFMPEG;
  var fs, cp, path, os, list = [], i, bin, pd, base, r;
  try { fs = require("fs"); cp = require("child_process"); path = require("path"); os = require("os"); } catch (e) { return null; }
  bin = os.platform() === "win32" ? "ffmpeg.exe" : "ffmpeg";
  pd = os.platform() === "win32" ? "win" : "mac";
  try {
    base = csInterface.getSystemPath(SystemPath.EXTENSION);
    list.push(path.join(base, "bin", pd, bin), path.join(base, "client", "bin", pd, bin), path.join(base, "bin", bin),
              path.join(base, pd, bin), path.join(base, "client", "bin", bin), path.join(base, bin));
  } catch (e1) {}
  if (HS_APP_DIR) list.push(path.join(HS_APP_DIR, "ffmpeg", bin));
  for (i = 0; i < list.length; i++) {
    try { if (fs.existsSync(list[i])) { HS_FFMPEG = list[i]; return HS_FFMPEG; } } catch (e3) {}
  }
  try {
    r = cp.spawnSync(bin, ["-version"], { windowsHide: true, timeout: 5000 });
    if (r && r.status === 0) { HS_FFMPEG = bin; return HS_FFMPEG; }
  } catch (e4) {}
  return null;
}
var HS_FFMPEG_MISSING = "ffmpeg was not found. Press Download ffmpeg at the top of this screen, or put ffmpeg.exe in the panel's client\\bin\\win folder.";

/* ---------- speech engine (whisper.cpp), shared by Captions and Filler Words ---------- */
var HS_WHISPER_DIR = "", HS_MODELS_DIR = "";
try {
  if (HS_APP_DIR) {
    HS_WHISPER_DIR = require("path").join(HS_APP_DIR, "whisper");
    HS_MODELS_DIR = require("path").join(HS_APP_DIR, "models");
  }
} catch (e) {}   // Node.js unavailable: the speech tabs report it when used

function hsFindWhisper() {
  var fs = require("fs"), path = require("path"), names = ["whisper-cli.exe", "main.exe"], i, f;
  for (i = 0; i < names.length; i++) { f = path.join(HS_WHISPER_DIR, names[i]); if (fs.existsSync(f)) return f; }
  return null;
}

// whisper.cpp JSON (one token per entry) -> [{ s, e, t }] words in seconds; a token without a leading space continues the previous word.
function hsWhisperWords(j) {
  var words = [];
  (j.transcription || []).forEach(function (x) {
    var t = x.text || ""; if (!t) return;
    if (/^\s*[\[\(].*[\]\)]\s*$/.test(t)) return;   // [BLANK_AUDIO], (music)
    var clean = t.replace(/^\s+|\s+$/g, ""); if (!clean) return;
    var from = x.offsets.from / 1000, to = x.offsets.to / 1000;
    if (/^\s/.test(t) || !words.length) words.push({ s: from, e: to, t: clean });
    else { var l = words[words.length - 1]; l.t += clean; l.e = to; }
  });
  return words;
}

/* ---------- 16 kHz mono WAV ---------- */
function hsReadPcm(wavPath) {
  var buf = require("fs").readFileSync(wavPath), off = 12, len = 0, id, sz, ab;
  while (off + 8 <= buf.length) {
    id = buf.toString("ascii", off, off + 4); sz = buf.readUInt32LE(off + 4);
    if (id === "data") { off += 8; len = Math.min(sz, buf.length - off); break; }
    off += 8 + sz + (sz & 1);
  }
  len -= len % 2;
  if (len <= 0) return new Int16Array(0);
  ab = new ArrayBuffer(len);
  new Uint8Array(ab).set(buf.subarray(off, off + len));
  return new Int16Array(ab);
}
function hsWriteWav(pcm, wavPath) {
  var n = pcm.length, buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(16000, 24);
  buf.writeUInt32LE(32000, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, n * 2).copy(buf, 44);
  require("fs").writeFileSync(wavPath, buf);
}

/* ---------- downloads ---------- */
// Streams url into dest (through dest + ".part"), follows redirects, reports (received, total) bytes.
// cb(err) / cb(null, dest). Returns { cancel() }; a cancelled download calls cb(Error("Cancelled")).
function hsDownload(url, dest, onProgress, cb) {
  var fs = require("fs"), path = require("path"), urlMod = require("url"), part = dest + ".part", req = null, out = null, finished = false;
  function done(err) {
    if (finished) return; finished = true;
    try { if (out) out.destroy(); } catch (e) {}
    if (err) { try { fs.unlinkSync(part); } catch (e1) {} return cb(err); }
    try { if (fs.existsSync(dest)) fs.unlinkSync(dest); fs.renameSync(part, dest); } catch (e2) { return cb(e2); }
    cb(null, dest);
  }
  function get(u, hops) {
    var lib = /^http:/i.test(u) ? require("http") : require("https");
    req = lib.get(u, { headers: { "User-Agent": "HalalFX" } }, function (res) {
      if ([301, 302, 303, 307, 308].indexOf(res.statusCode) >= 0 && res.headers.location) {
        res.resume();
        if (hops >= 6) return done(new Error("Too many redirects"));
        return get(urlMod.resolve(u, res.headers.location), hops + 1);
      }
      if (res.statusCode !== 200) { res.resume(); return done(new Error("HTTP " + res.statusCode)); }
      var total = parseInt(res.headers["content-length"] || "0", 10), got = 0;
      out = fs.createWriteStream(part);
      res.on("data", function (d) { got += d.length; if (onProgress) onProgress(got, total); });
      res.on("error", done);
      res.on("aborted", function () { done(new Error("Connection lost")); });
      out.on("error", done);
      out.on("close", function () { done(total && got < total ? new Error("Download was cut short") : null); });
      res.pipe(out);
    });
    req.on("error", done);
    req.setTimeout(30000, function () { req.destroy(new Error("Connection timed out")); });
  }
  try { hsMkdirp(path.dirname(dest)); } catch (e) { setTimeout(function () { done(e); }, 0); return { cancel: function () {} }; }
  get(url, 0);
  return { cancel: function () { try { if (req) req.destroy(); } catch (e) {} done(new Error("Cancelled")); } };
}

// A small text file (a checksum, say). cb(err, text)
function hsFetchText(url, cb, hops) {
  var urlMod = require("url"), lib = /^http:/i.test(url) ? require("http") : require("https"), called = false;
  function end(err, t) { if (!called) { called = true; cb(err, t); } }
  var req = lib.get(url, { headers: { "User-Agent": "HalalFX" } }, function (res) {
    if ([301, 302, 303, 307, 308].indexOf(res.statusCode) >= 0 && res.headers.location) {
      res.resume();
      if ((hops || 0) >= 6) return end(new Error("Too many redirects"));
      called = true; return hsFetchText(urlMod.resolve(url, res.headers.location), cb, (hops || 0) + 1);
    }
    if (res.statusCode !== 200) { res.resume(); return end(new Error("HTTP " + res.statusCode)); }
    var body = "";
    res.setEncoding("utf8");
    res.on("data", function (d) { if (body.length < 65536) body += d; });
    res.on("end", function () { end(null, body); });
    res.on("error", end);
  });
  req.on("error", end);
  req.setTimeout(15000, function () { req.destroy(new Error("Connection timed out")); });
}

/* ---------- ffmpeg download (Windows) ---------- */
// gyan.dev "release essentials" build; its .sha256 file sits next to the zip and is checked before anything is unpacked.
var HS_FFMPEG_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

// opts: { url, platform } (both only for tests). onProgress(phase, got, total) with phase = "download" | "verify" | "unpack".
// cb(err) / cb(null, ffmpegPath). Returns { cancel() }.
function hsInstallFfmpeg(opts, onProgress, cb) {
  opts = opts || {};
  var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto");
  var url = opts.url || HS_FFMPEG_URL, cancelled = false, dl = null, finished = false, zipPath = "", part = "", dest = "";
  function end(err, p) {
    if (finished) return; finished = true;
    try { if (zipPath) fs.unlinkSync(zipPath); } catch (e) {}
    if (err) { try { if (part) fs.unlinkSync(part); } catch (e1) {} return cb(err); }
    cb(null, p);
  }
  var handle = { cancel: function () { cancelled = true; if (dl) dl.cancel(); end(new Error("Cancelled")); } };
  if ((opts.platform || os.platform()) !== "win32") { setTimeout(function () { end(new Error("The automatic ffmpeg download is for Windows only. Install ffmpeg so it is available on PATH.")); }, 0); return handle; }
  if (!HS_APP_DIR) { setTimeout(function () { end(new Error("No place to save ffmpeg (AppData folder not found).")); }, 0); return handle; }
  var dir = path.join(HS_APP_DIR, "ffmpeg");
  dest = path.join(dir, "ffmpeg.exe"); part = dest + ".part";
  zipPath = path.join(os.tmpdir(), "halalfx_ffmpeg_" + Date.now() + ".zip");

  dl = hsDownload(url, zipPath, function (got, total) { if (onProgress) onProgress("download", got, total); }, function (err) {
    if (finished) return;
    if (err) return end(err.message === "Cancelled" ? err : new Error("Download failed: " + err.message));
    if (cancelled) return end(new Error("Cancelled"));
    if (onProgress) onProgress("verify", 0, 0);
    hsFetchText(url + ".sha256", function (e1, txt) {
      if (finished) return;
      var m = !e1 && /\b([a-f0-9]{64})\b/i.exec(txt || "");
      if (!m) return end(new Error("Could not get the checksum to verify the download" + (e1 ? " (" + e1.message + ")" : "") + ". Nothing was installed."));
      var h = crypto.createHash("sha256"), rs = fs.createReadStream(zipPath);
      rs.on("error", function (e) { end(e); });
      rs.on("data", function (d) { h.update(d); });
      rs.on("end", function () {
        if (finished) return;
        if (h.digest("hex").toLowerCase() !== m[1].toLowerCase()) return end(new Error("The download is damaged (checksum does not match). Nothing was installed."));
        if (onProgress) onProgress("unpack", 0, 0);
        JSZip.loadAsync(fs.readFileSync(zipPath)).then(function (zip) {
          if (finished) return;
          var name = Object.keys(zip.files).filter(function (n) { return !zip.files[n].dir && /(^|\/)bin\/ffmpeg\.exe$/i.test(n); })[0];
          if (!name) return end(new Error("ffmpeg.exe was not found inside the downloaded file."));
          hsMkdirp(dir);
          var src = zip.files[name].nodeStream("nodebuffer"), ws = fs.createWriteStream(part);
          src.on("error", function (e) { end(e); });
          ws.on("error", function (e) { end(e); });
          ws.on("close", function () {   // "close", not "finish": the file handle must be released before it is renamed and run
            if (finished) return;
            try {
              if (fs.existsSync(dest)) fs.unlinkSync(dest);
              fs.renameSync(part, dest);
              try { fs.chmodSync(dest, 493); } catch (ec) {}
              var r = cp.spawnSync(dest, ["-version"], { windowsHide: true, timeout: 15000 });
              if (!r || r.status !== 0) { try { fs.unlinkSync(dest); } catch (ed) {} return end(new Error("The downloaded ffmpeg would not start (an antivirus may have blocked it).")); }
            } catch (e) { return end(e); }
            HS_FFMPEG = dest;
            end(null, dest);
          });
          src.pipe(ws);
        }).catch(function (e) { end(new Error("Could not open the download: " + e.message)); });
      });
    });
  });
  return handle;
}

/* ---------- ffmpeg setup card (shown at the top of every tool that needs ffmpeg) ---------- */
var HS_FF = { active: false, phase: "", got: 0, total: 0, error: "", job: null, subs: [] };
(function () {
  var css = document.createElement("style");
  css.id = "hsCommonCss";
  css.textContent =
    ".hsFf{margin:10px;padding:12px;border:1px solid #383838;border-radius:12px;background:#262626;font-size:11.5px;color:var(--text);}" +
    ".hsFf .t{font-weight:600;margin-bottom:4px;}.hsFf .d{color:var(--muted);line-height:1.5;}.hsFf .e{color:#e05656;margin-top:6px;line-height:1.5;white-space:pre-wrap;}" +
    ".hsFf button{margin-top:10px;padding:7px 12px;border-radius:8px;border:none;background:var(--accent-1);color:#fff;font-weight:600;font-size:11.5px;cursor:pointer;font-family:inherit;}" +
    ".hsFf button.sec{background:#383838;color:var(--text);}" +
    ".hsFfBar{height:6px;border-radius:3px;background:#383838;margin:8px 0 6px;overflow:hidden;}.hsFfBar i{display:block;height:100%;background:var(--accent-1);width:0;}";
  document.head.appendChild(css);
})();
function hsFfmpegNotify() { HS_FF.subs.slice().forEach(function (f) { f(); }); }
function hsFfmpegStart() {
  if (HS_FF.active) return;
  HS_FF.active = true; HS_FF.error = ""; HS_FF.phase = "download"; HS_FF.got = 0; HS_FF.total = 0;
  HS_FF.job = hsInstallFfmpeg({}, function (phase, got, total) { HS_FF.phase = phase; HS_FF.got = got; HS_FF.total = total; hsFfmpegNotify(); }, function (err) {
    HS_FF.active = false; HS_FF.job = null;
    HS_FF.error = err && err.message !== "Cancelled" ? err.message : "";
    hsFfmpegNotify();
  });
  hsFfmpegNotify();
}
// Fills el with the setup card while ffmpeg is missing; leaves it empty once ffmpeg is found (also right after the download ends).
function hsFfmpegMount(el) {
  if (!el) return;
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function mb(n) { return (n / 1048576).toFixed(n >= 104857600 ? 0 : 1); }
  function draw() {
    if (!el.isConnected) { HS_FF.subs = HS_FF.subs.filter(function (f) { return f !== draw; }); return; }
    if (!HS_FF.active && hsFindFfmpeg()) { el.innerHTML = ""; return; }
    var win = false, html;
    try { win = require("os").platform() === "win32"; } catch (e) {}
    if (HS_FF.active) {
      var label = HS_FF.phase === "verify" ? "Checking the download..." : HS_FF.phase === "unpack" ? "Unpacking..." : "Downloading ffmpeg...";
      var pct = HS_FF.phase === "download" && HS_FF.total ? Math.floor(HS_FF.got * 100 / HS_FF.total) : (HS_FF.phase === "download" ? 0 : 100);
      html = '<div class="hsFf"><div class="t">' + label + '</div><div class="hsFfBar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="d">' + (HS_FF.phase === "download" ? mb(HS_FF.got) + (HS_FF.total ? " / " + mb(HS_FF.total) : "") + " MB" : "Almost done") + '</div>' +
        '<button class="sec hsFfCancel">Cancel</button></div>';
    } else {
      html = '<div class="hsFf"><div class="t">ffmpeg is missing</div><div class="d">' +
        (win ? "This tool reads audio with ffmpeg. Download it once (about 86 MB from gyan.dev, checked before use). Nothing is downloaded unless you press the button. You can also put ffmpeg.exe in the panel's client\\bin\\win folder."
             : "This tool reads audio with ffmpeg. Install ffmpeg so it is available on PATH.") + '</div>' +
        (HS_FF.error ? '<div class="e">' + esc(HS_FF.error) + '</div>' : "") +
        (win ? '<button class="hsFfGo">' + (HS_FF.error ? "Try again" : "Download ffmpeg") + '</button>' : "") + '</div>';
    }
    el.innerHTML = html;
    var go = el.querySelector(".hsFfGo"), cn = el.querySelector(".hsFfCancel");
    if (go) go.addEventListener("click", hsFfmpegStart);
    if (cn) cn.addEventListener("click", function () { if (HS_FF.job) HS_FF.job.cancel(); });
  }
  HS_FF.subs.push(draw);
  draw();
}
