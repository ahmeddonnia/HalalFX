/* HalalFX - Captions tab (offline). Speech -> words (whisper.cpp) -> reviewed captions -> SRT caption track. */
(function () {
  var fs, cp, pathMod, osMod, https;
  try { fs = require("fs"); cp = require("child_process"); pathMod = require("path"); osMod = require("os"); https = require("https"); } catch (e) {}

  function J() { return pathMod.join.apply(pathMod, arguments); }
  // Engine and models live in the user's AppData (always writable, survives plugin updates). Paths come from common.js.
  var WHISPER_DIR = HS_WHISPER_DIR, MODELS_DIR = HS_MODELS_DIR;
  var MODELS = {
    en: { name: "English model", code: "en", sizes: { large: { id: "medium.en", size: "1.5 GB" }, small: { id: "small.en", size: "466 MB" } } },
    ar: { name: "Arabic model", code: "ar", sizes: { large: { id: "large-v3", size: "3.1 GB" }, small: { id: "medium", size: "1.5 GB" } } }
  };

  var S = loadJSON("halalfx_captions2", { lang: "en", words: 2, wordsCustom: 4, track: 2, trackCustom: 4, msize: { en: "large", ar: "large" }, upper: true, noPunct: true, source: "sel" });
  var openLang = {}, manage = false;
  var pending = null;   // transcribed captions waiting for review: { caps:[{s,e,text}] }
  var busy = false, working = false, dlActive = false, cancelled = false, cur = null, genProc = null, statusText = "", statusKind = "";

  var css = document.createElement("style");
  css.textContent =
    ".ic-captions{width:13px;height:13px;-webkit-mask-image:url('icons/captions.svg');mask-image:url('icons/captions.svg');}" +
    "#cpScreen{padding:12px;display:flex;flex-direction:column;gap:10px;font-size:12px;color:var(--text);height:100%;box-sizing:border-box;overflow:auto;}" +
    "#cpGo{width:100%;border:none;border-radius:12px;padding:13px 16px;cursor:pointer;font-size:13px;font-weight:600;color:#fff;background:var(--accent-grad);}" +
    "#cpGo:disabled{opacity:.5;cursor:default;}" +
    "#cpGo,.cpCard .dl{transition:box-shadow .15s;} #cpGo:hover:not(:disabled),.cpCard .dl:hover:not(:disabled){box-shadow:0 0 4px 1px rgba(30,159,214,.55);}" +
    "#cpStatus{color:var(--muted);line-height:1.5;white-space:pre-wrap;} #cpStatus.err{color:#ff6b6b;} #cpStatus.ok{color:#5fd38d;}" +
    ".cpCard{background:var(--panel);border:1px solid #2c2c2c;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:11px;}" +
    ".cpCard .t{font-size:14px;font-weight:600;}" +
    ".cpCard .row{display:flex;align-items:center;justify-content:space-between;gap:10px;} .cpCard label{color:var(--muted);}" +
    ".cpCard select,.cpCard input[type=number]{background:#1d1d1d;border:1px solid #383838;border-radius:8px;color:var(--text);padding:5px 7px;font-size:12px;max-width:62%;}" +
    ".cpCard input.scrub{box-sizing:content-box;min-width:3ch;background:transparent;border:1px solid transparent;border-radius:6px;color:#4aa3ff;padding:4px 6px;font-size:12px;text-align:right;cursor:ew-resize;}" +
    ".cpCard input.scrub:focus{background:#1d1d1d;border-color:#383838;cursor:text;color:var(--text);outline:none;}" +
    ".cpCard .okTxt{color:#5fd38d;font-weight:600;}" +
    ".cpCard .dl{background:var(--accent-grad);border:none;border-radius:10px;color:#fff;padding:6px 10px;font-size:11.5px;cursor:pointer;}" +
    ".cpCard .dl:disabled{opacity:.5;} .cpCard .cancel{background:#2a2a2a;border:1px solid #4a4a4a;border-radius:10px;color:var(--text);padding:6px 10px;font-size:11.5px;cursor:pointer;}" +
    ".cpCard .btns{display:flex;gap:8px;} .cpCard .btns button{flex:1;background:#1d1d1d;border:1px solid #383838;border-radius:10px;color:var(--text);padding:7px;font-size:11.5px;cursor:pointer;}" +
    ".cpCard .arrow{background:none;border:none;color:var(--text);cursor:pointer;padding:0 4px;font-size:12px;}" +
    ".cpCard .sizes{display:flex;flex-direction:column;gap:6px;background:#1d1d1d;border-radius:10px;padding:9px 10px;} .cpCard label.sz{display:flex;align-items:center;gap:6px;color:var(--text);}" +
    "#cpScreen button.manage{background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;text-decoration:underline;padding:0;align-self:flex-start;}" +
    ".cpCard input[type=checkbox],.cpCard input[type=radio]{accent-color:var(--accent-1);}" +
    "#cpScreen .dd{position:relative;max-width:62%;} #cpScreen .ddb{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:90px;background:#1d1d1d;border:1px solid #383838;border-radius:8px;color:var(--text);padding:5px 9px;font-size:12px;cursor:pointer;}" +
    "#cpScreen .ddl{display:none;position:absolute;right:0;top:100%;margin-top:4px;z-index:50;background:#1d1d1d;border:1px solid #383838;border-radius:8px;min-width:100%;max-height:190px;overflow:auto;} #cpScreen .dd.open .ddl{display:block;}" +
    "#cpScreen .ddi{padding:6px 10px;cursor:pointer;white-space:nowrap;color:var(--text);} #cpScreen .ddi:hover{background:rgba(30,159,214,.25);color:var(--accent-1);} #cpScreen .ddi.sel{color:var(--accent-1);}" +
    "#cpScreen .ddsearch{position:sticky;top:0;display:block;width:100%;box-sizing:border-box;background:#252525;border:none;border-bottom:1px solid #383838;color:var(--text);padding:7px 10px;font-size:12px;outline:none;}" +
    ".cpCard .head{display:flex;align-items:center;justify-content:space-between;gap:8px;} .cpCard .head .r{font-size:11px;color:var(--muted);}" +
    "#cpRevList{max-height:280px;overflow:auto;display:flex;flex-direction:column;gap:6px;} .revRow{display:flex;align-items:center;gap:6px;} .revRow .tm{color:var(--muted);font-size:10.5px;min-width:46px;}" +
    ".revT{width:62px;flex-shrink:0;box-sizing:border-box;background:#1d1d1d;border:1px solid #383838;border-radius:8px;color:var(--accent-1);padding:5px 6px;font-size:11px;font-variant-numeric:tabular-nums;text-align:center;font-family:inherit;} .revT:focus{border-color:var(--accent-1);outline:none;}" +
    ".revAdd{background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 4px;} .revAdd:hover{color:var(--accent-1);}" +
    ".revTxt{flex:1;min-width:0;background:#1d1d1d;border:1px solid #383838;border-radius:8px;color:var(--text);padding:5px 8px;font-size:12px;font-family:inherit;} .revTxt:focus{border-color:var(--accent-1);outline:none;}" +
    ".revDel{background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 4px;} .revDel:hover{color:#ff6b6b;}" +
    "#cpInsert,#cpInsertSrt{width:100%;border:none;border-radius:12px;padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;color:#fff;background:var(--accent-grad);transition:box-shadow .15s;} #cpInsert:hover:not(:disabled),#cpInsertSrt:hover:not(:disabled){box-shadow:0 0 4px 1px rgba(30,159,214,.55);} #cpInsert:disabled,#cpInsertSrt:disabled{opacity:.5;}" +
    "#cpScreen .hint{font-size:10.5px;color:var(--muted);line-height:1.5;}" +
    ".cpCard input[type=checkbox]{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:5px;background:#1d1d1d;border:1px solid #4a4a4a;margin:0;cursor:pointer;position:relative;outline:none;flex-shrink:0;}" +
    ".cpCard input[type=checkbox]:hover{border-color:var(--accent-1);} .cpCard input[type=checkbox]:checked{background:var(--accent-grad);border-color:var(--accent-1);}" +
    ".cpCard input[type=checkbox]:checked::after{content:'';position:absolute;left:50%;top:46%;width:4px;height:8px;box-sizing:border-box;border:solid #fff;border-width:0 1.6px 1.6px 0;transform:translate(-50%,-50%) rotate(45deg);}";
  document.head.appendChild(css);

  document.addEventListener("click", function () {
    Array.prototype.forEach.call(document.querySelectorAll(".dd.open"), function (x) { x.classList.remove("open"); });
  });

  var prevRender = renderActiveTab;
  renderActiveTab = function () {
    if (state.activeTab === "captions") { crumbEl.textContent = ""; render(); } else prevRender();
  };

  function status(t, kind) {
    statusText = t || ""; statusKind = kind || "";
    var el = document.getElementById("cpStatus");
    if (el) { el.textContent = statusText; el.className = statusKind; }
  }
  var evalHost = hsEval;
  function mkdirp(d) { try { hsMkdirp(d); } catch (e) {} }
  function model() { return MODELS[S.lang] || MODELS.en; }
  function variant(lang) { return MODELS[lang].sizes[S.msize[lang] || "large"]; }
  function mPath(lang) { return J(MODELS_DIR, "ggml-" + variant(lang).id + ".bin"); }
  function modelPath() { return mPath(S.lang); }
  var findWhisper = hsFindWhisper;
  function ready() { return !!(fs && findWhisper() && fs.existsSync(modelPath())); }

  /* ---------- UI ---------- */

  function psPick(script, cb) {
    var cmd = 'powershell -NoProfile -NonInteractive -STA -Command "' + script.replace(/"/g, '\\"') + '"';
    cp.exec(cmd, { encoding: "utf8", windowsHide: true }, function (err, out) { cb((out || "").replace(/^\s+|\s+$/g, "")); });
  }
  function dd(id, list, sel, searchable) {
    var cur = list.filter(function (o) { return String(o[0]) === String(sel); })[0] || list[0];
    return '<div class="dd" id="' + id + '" data-value="' + cur[0] + '"><button type="button" class="ddb"><span>' + cur[1] + '</span><span>&#9662;</span></button><div class="ddl">' + (searchable ? '<input class="ddsearch" type="text" placeholder="Search...">' : "") +
      list.map(function (o) { return '<div class="ddi' + (String(o[0]) === String(cur[0]) ? " sel" : "") + '" data-v="' + o[0] + '">' + o[1] + "</div>"; }).join("") + "</div></div>";
  }
  function render() {
    contentEl.className = "";
    var isReady = ready(), eng = !!findWhisper();
    var html = '<div id="cpScreen"><div id="cpFfmpeg"></div>';
    if (pending) {
      html += '<div class="cpCard"><div class="head"><div class="t">Review captions</div><div class="r">' + pending.caps.length + ' captions</div></div>' +
        '<div id="cpRevList"></div><div class="hint">Start and end are in sequence time (m:ss.ss). Press + to add a caption after a row.</div>' +
        '<div class="btns"><button id="cpRevCancel">Cancel</button><button id="cpRevAdd">Add caption</button><button id="cpSrt">Export SRT</button></div>' +
        '<button id="cpInsertSrt"' + (busy ? " disabled" : "") + '>Insert SRT Captions</button></div>';
    }

    if (!isReady || manage) {
      html += '<div class="cpCard"><div class="t">Setup</div>' +
        '<div class="row"><label>Speech engine</label>' + (eng ? '<span class="okTxt">Installed</span>' : '<button class="dl" id="cpDlEngine"' + (busy ? " disabled" : "") + ">Download (github.com)</button>") + "</div>";
      ["en", "ar"].forEach(function (lg) {
        var v = variant(lg), inst = fs.existsSync(mPath(lg));
        html += '<div class="row"><label><button class="arrow" data-lg="' + lg + '">' + (openLang[lg] ? "&#9662;" : "&#9656;") + "</button> " + MODELS[lg].name + "</label>" +
          (inst ? '<span class="okTxt">Installed</span>' : '<button class="dl dlModel" data-lg="' + lg + '"' + (busy ? " disabled" : "") + ">Download " + v.size + "</button>") + "</div>";
        if (openLang[lg]) {
          html += '<div class="sizes">' + ["large", "small"].map(function (k) {
            var o = MODELS[lg].sizes[k], oi = fs.existsSync(J(MODELS_DIR, "ggml-" + o.id + ".bin"));
            return '<label class="sz"><input type="radio" name="cpSz_' + lg + '" data-lg="' + lg + '" value="' + k + '"' + (S.msize[lg] === k ? " checked" : "") + "> " + (k === "large" ? "Large" : "Small") + " (" + o.size + ")" + (oi ? " &#10003;" : "") + "</label>";
          }).join("") + "</div>";
        }
      });
      html += (dlActive ? '<div class="row"><span></span><button class="cancel" id="cpCancel">Cancel download</button></div>' : "") +
        '<div class="hint">Models come from huggingface.co. Nothing is downloaded unless you press Download. Everything runs offline after that.</div></div>';
    }

    html += '<div class="cpCard"><div class="t">Settings</div>' +
      '<div class="row"><label>Language</label>' + dd("cpLang", [["en", "English"], ["ar", "Arabic"]], S.lang) + "</div>" +
      '<div class="row"><label>Audio source</label>' + dd("cpSource", [["sel", "Selected clips"], ["V1", "Track V1"], ["V2", "Track V2"], ["V3", "Track V3"], ["A1", "Track A1"], ["A2", "Track A2"], ["A3", "Track A3"]], S.source) + "</div>" +
      '<div class="row"><label>Words per caption</label>' + dd("cpWords", [[1, "1"], [2, "2"], [3, "3"], ["custom", "Custom"]], S.words) + "</div>" +
      (S.words === "custom" ? '<div class="row"><label>Number of words</label><input id="cpWordsC" type="number" min="1" step="1" value="' + S.wordsCustom + '"></div>' : "") +
      '<div class="row"><label>UPPERCASE</label><input id="cpUpper" type="checkbox"' + (S.upper ? " checked" : "") + "></div>" +
      '<div class="row"><label>Remove punctuation</label><input id="cpPunct" type="checkbox"' + (S.noPunct ? " checked" : "") + "></div>" +
      "</div>";

    if (isReady && !manage) html += '<button class="manage" id="cpManage">Manage models</button>';
    else if (isReady) html += '<button class="manage" id="cpManage">Hide models</button>';
    html += '<button id="cpGo"' + ((busy && !working) || (!busy && (!isReady || pending)) ? " disabled" : "") + ' title="' + (isReady ? "" : "Download the speech engine and model first") + '">' + (working ? "Cancel" : "Generate Captions") + "</button>";
    html += '<div id="cpStatus" class="' + statusKind + '"></div></div>';
    contentEl.innerHTML = html;
    hsFfmpegMount(document.getElementById("cpFfmpeg"));
    document.getElementById("cpStatus").textContent = statusText;

    bindDropdowns(document);
    function on(id, ev, fn) { var el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }
    on("cpDlEngine", "click", function () { runInstall(installEngine, "Speech engine installed."); });
    Array.prototype.forEach.call(document.querySelectorAll(".dlModel"), function (bt) {
      bt.addEventListener("click", function () { var lg = bt.getAttribute("data-lg"); runInstall(installModelFor(lg), MODELS[lg].name + " installed."); });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".arrow"), function (bt) {
      bt.addEventListener("click", function () { var lg = bt.getAttribute("data-lg"); openLang[lg] = !openLang[lg]; render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name^="cpSz_"]'), function (r) {
      r.addEventListener("change", function () { S.msize[r.getAttribute("data-lg")] = r.value; saveJSON("halalfx_captions2", S); render(); });
    });
    on("cpManage", "click", function () { manage = !manage; render(); });
    on("cpCancel", "click", cancelDownload);
    on("cpGo", "click", function () { if (working) cancelGenerate(); else generate(); });
    fillReview();
    on("cpSrt", "click", exportSrt);
    on("cpInsertSrt", "click", insertSrt);
    on("cpRevAdd", "click", function () {
      var last = pending.caps[pending.caps.length - 1], st = last ? last.e : 0;
      pending.caps.push({ s: st, e: st + 0.5, text: "" }); pending.focus = pending.caps.length - 1; render();
    });
    on("cpRevCancel", "click", function () { pending = null; status(""); render(); });
    ["cpLang", "cpWords"].forEach(function (id) { on(id, "change", function () { readSettings(); render(); }); });
    ["cpSource", "cpWordsC", "cpUpper", "cpPunct"].forEach(function (id) { on(id, "change", readSettings); });
  }

  function filterDd(d, q) {
    q = q.toLowerCase();
    Array.prototype.forEach.call(d.querySelectorAll(".ddi"), function (it) {
      it.style.display = it.textContent.toLowerCase().indexOf(q) >= 0 ? "" : "none";
    });
  }
  function bindDropdowns(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll(".dd"), function (d) {
      d.querySelector(".ddb").addEventListener("click", function (e) {
        e.stopPropagation();
        var was = d.classList.contains("open");
        Array.prototype.forEach.call(document.querySelectorAll(".dd.open"), function (x) { x.classList.remove("open"); });
        if (!was) { d.classList.add("open"); var sIn = d.querySelector(".ddsearch"); if (sIn) { sIn.value = ""; filterDd(d, ""); sIn.focus(); } }
      });
      var search = d.querySelector(".ddsearch");
      if (search) {
        search.addEventListener("click", function (e) { e.stopPropagation(); });
        search.addEventListener("input", function () { filterDd(d, search.value); });
      }
      Array.prototype.forEach.call(d.querySelectorAll(".ddi"), function (it) {
        it.addEventListener("click", function () {
          d.setAttribute("data-value", it.getAttribute("data-v"));
          d.classList.remove("open");
          d.dispatchEvent(new Event("change"));
        });
      });
    });
  }

  function readSettings() {
    function v(id) { var el = document.getElementById(id); if (!el) return null; var dv = el.getAttribute("data-value"); return dv !== null ? dv : el.value; }
    function num(x) { return x === "custom" ? "custom" : parseInt(x, 10); }
    if (v("cpLang")) S.lang = v("cpLang");
    if (v("cpSource")) S.source = v("cpSource");
    if (v("cpWords")) S.words = num(v("cpWords"));
    if (v("cpWordsC")) S.wordsCustom = Math.max(1, parseInt(v("cpWordsC"), 10) || 1);
    var u = document.getElementById("cpUpper"), p = document.getElementById("cpPunct");
    if (u) S.upper = u.checked; if (p) S.noPunct = p.checked;
    saveJSON("halalfx_captions2", S);
  }
  function wordsN() { return S.words === "custom" ? S.wordsCustom : S.words; }

  /* ---------- downloads (cancellable; the downloader itself is in common.js) ---------- */
  function download(url, dest, onPct, cb) {
    var last = -1;
    cur = hsDownload(url, dest, function (got, total) {
      if (!total) return;
      var p = Math.floor(got * 100 / total);
      if (p !== last) { last = p; onPct(p); }
    }, function (err) { cur = null; cb(err); });
  }
  function cancelDownload() {
    cancelled = true;
    if (cur) cur.cancel();
  }
  function getJSON(url, cb) {
    https.get(url, { headers: { "User-Agent": "HalalFX", "Accept": "application/vnd.github+json" } }, function (res) {
      var body = "";
      res.setEncoding("utf8");
      res.on("data", function (d) { body += d; });
      res.on("end", function () {
        if (res.statusCode !== 200) return cb(new Error("GitHub returned HTTP " + res.statusCode));
        try { cb(null, JSON.parse(body)); } catch (e) { cb(e); }
      });
    }).on("error", cb);
  }
  // The newest release that actually carries a Windows CPU build (the "latest" release often has none).
  function findEngineUrl(cb) {
    getJSON("https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=40", function (err, list) {
      if (err) return cb(err);
      var want = [/^whisper-bin-x64\.zip$/i, /^whisper-bin-win-x64\.zip$/i], i, w, k, seen = "";
      for (i = 0; i < list.length; i++) {
        var as = list[i].assets || [];
        for (w = 0; w < want.length; w++) {
          for (k = 0; k < as.length; k++) if (want[w].test(as[k].name)) return cb(null, as[k].browser_download_url);
        }
        if (!seen && as.length > 2) seen = list[i].tag_name + ": " + as.map(function (x) { return x.name; }).join(", ");
      }
      cb(new Error("No Windows CPU build of whisper.cpp was found. Newest release with files - " + seen));
    });
  }
  function installEngine(cb) {
    if (osMod.platform() !== "win32") return cb(new Error("The speech engine download is for Windows only."));
    mkdirp(WHISPER_DIR);
    var zipPath = J(WHISPER_DIR, "engine.zip");
    status("Looking for the speech engine...");
    findEngineUrl(function (e0, url) {
      if (e0) return cb(e0);
      if (cancelled) return cb(new Error("Cancelled"));
      download(url, zipPath, function (p) { status("Downloading speech engine... " + p + "%"); }, function (err) {
        if (err) return cb(err.message === "Cancelled" ? err : new Error("Engine download failed: " + err.message));
        JSZip.loadAsync(fs.readFileSync(zipPath)).then(function (zip) {
          var jobs = [];
          Object.keys(zip.files).forEach(function (n) {
            var e = zip.files[n]; if (e.dir) return;
            jobs.push(e.async("nodebuffer").then(function (buf) { fs.writeFileSync(J(WHISPER_DIR, pathMod.basename(n)), buf); }));
          });
          return Promise.all(jobs);
        }).then(function () {
          try { fs.unlinkSync(zipPath); } catch (e) {}
          findWhisper() ? cb(null) : cb(new Error("whisper-cli.exe was not found inside the downloaded engine."));
        }).catch(function (e) { cb(e); });
      });
    });
  }
  function installModelFor(lg) {
    return function (cb) {
      mkdirp(MODELS_DIR);
      download("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-" + variant(lg).id + ".bin", mPath(lg),
        function (p) { status("Downloading speech model... " + p + "%"); },
        function (err) { err ? cb(new Error(err.message === "Cancelled" ? "Cancelled" : "Model download failed: " + err.message)) : cb(null); });
    };
  }
  function runInstall(fn, doneMsg) {
    if (busy) return;
    busy = true; dlActive = true; cancelled = false; status("Starting download..."); render();
    fn(function (err) {
      busy = false; dlActive = false;
      if (cancelled || (err && err.message === "Cancelled")) status("Download cancelled.");
      else if (err) status(err.message, "err");
      else status(doneMsg, "ok");
      cancelled = false;
      render();
    });
  }

  /* ---------- audio extraction (16 kHz mono wav, ffmpeg) ---------- */
  function once(fn) { var done = false; return function () { if (done) return; done = true; return fn.apply(this, arguments); }; }
  function extractWav(ffmpeg, clip, wavPath, cb) {
    cb = once(cb);   // a failed process can fire both "error" and "close"
    var args = ["-y", "-ss", String(clip.inPoint), "-t", String(clip.outPoint - clip.inPoint), "-i", clip.path, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wavPath];
    var p;
    try { p = cp.spawn(ffmpeg, args, { windowsHide: true }); } catch (e) { return cb(e); }
    genProc = p;
    p.on("error", cb);
    p.on("close", function (code) {
      if (code === 0 && fs.existsSync(wavPath)) cb(null);
      else cb(new Error("ffmpeg could not read the audio of \"" + clip.name + "\"."));
    });
  }

  /* ---------- whisper ---------- */
  var progLabel = "";
  function runWhisper(exe, wav, cb) {
    cb = once(cb);
    var base = J(osMod.tmpdir(), "halalfx_cap_" + Date.now());
    var args = ["-m", modelPath(), "-f", wav, "-ml", "1", "-sow", "-oj", "-of", base, "-l", model().code, "-bs", "1", "-bo", "1", "-pp", "-t", String(Math.max(2, osMod.cpus().length - 1))];
    var err = "", p;
    try { p = cp.spawn(exe, args, { windowsHide: true, cwd: WHISPER_DIR }); } catch (e) { return cb(e); }
    genProc = p;
    p.stderr.on("data", function (d) {
      var t = d.toString(), m = t.match(/progress\s*=\s*(\d+)%/g);
      if (m) status("Transcribing" + (progLabel ? " " + progLabel : "") + "... " + m[m.length - 1].match(/(\d+)%/)[1] + "%");
      else err += t;
    });
    p.on("error", cb);
    p.on("close", function (code) {
      var jf = base + ".json";
      if (cancelled) { try { fs.unlinkSync(jf); } catch (e) {} return cb(new Error("Cancelled")); }
      if (code !== 0 || !fs.existsSync(jf)) return cb(new Error("Speech engine failed (code " + code + "). " + err.slice(-300)));
      try { var j = JSON.parse(fs.readFileSync(jf, "utf8")); try { fs.unlinkSync(jf); } catch (e) {} cb(null, j); }
      catch (e) { cb(e); }
    });
  }
  var toWords = hsWhisperWords;
  /* Whisper's word times are estimates: a word after a pause is often stamped inside the silence before it,
     so the caption shows up early. The extracted audio is used to move each word to where the voice really is. */
  function snapWords(words, pcm) {
    if (!pcm || !pcm.length || !words.length) return words;
    var W = 160, n = Math.floor(pcm.length / W), rms = new Float32Array(n), i, j, a, sum, v;   // 10 ms windows
    for (i = 0; i < n; i++) { sum = 0; a = i * W; for (j = 0; j < W; j++) { v = pcm[a + j]; sum += v * v; } rms[i] = Math.sqrt(sum / W); }
    var sorted = Array.prototype.slice.call(rms).sort(function (x, y) { return x - y; });
    var noise = sorted[Math.floor(n * 0.1)], peak = sorted[Math.floor(n * 0.95)];
    if (!(peak > noise * 2)) return words;                       // nothing to tell speech from background
    var thr = noise + (peak - noise) * 0.06;
    function loud(k) { return k >= 0 && k + 1 < n && rms[k] >= thr && rms[k + 1] >= thr; }
    words.forEach(function (w) {
      var i0 = Math.max(0, Math.floor(w.s * 100)), i1 = Math.min(n - 1, Math.ceil(w.e * 100)), k, first = -1, last = -1;
      for (k = i0; k < i1; k++) { if (loud(k)) { first = k; break; } }
      if (first < 0) return;
      for (k = i1 - 1; k >= first; k--) { if (loud(k)) { last = k + 2; break; } }
      var ns = first / 100, ne = last / 100;
      if (ns > w.s + 0.03 && ns - w.s <= 0.8 && ns < w.e - 0.05) w.s = ns;                // starts later than Whisper said
      if (ne < w.e - 0.05 && ne > w.s + 0.08) w.e = ne;                                    // ends earlier than Whisper said
    });
    return words;
  }
  function buildCaps(words, clip) {
    var ws = [], n = wordsN();
    words.forEach(function (w) {
      var t = w.t;
      if (S.noPunct) t = t.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
      if (!t) return;
      if (S.upper) t = t.toUpperCase();
      ws.push({ s: w.s, e: w.e, t: t });
    });
    var caps = [], i, k;
    // seconds in the source file -> seconds on the timeline (clips that were sped up / slowed down)
    var srcD = clip.outPoint - clip.inPoint, tlD = clip.end - clip.start, sc = 1, rr;
    if (srcD > 0 && tlD > 0) { rr = tlD / srcD; if (rr > 0.1 && rr < 10 && Math.abs(rr - 1) > 0.002) sc = rr; }
    for (i = 0; i < ws.length; i += n) {
      var g = ws.slice(i, i + n);
      caps.push({ s: clip.start + g[0].s * sc, e: clip.start + g[g.length - 1].e * sc, text: g.map(function (x) { return x.t; }).join(" ") });
    }
    for (k = 0; k < caps.length; k++) {
      var nx = caps[k + 1], c = caps[k];
      if (nx && nx.s - c.e < 0.35) c.e = nx.s;
      if (nx) c.e = Math.min(c.e, nx.s);
      if (c.e - c.s < 0.12) c.e = c.s + 0.12;
      if (c.e - c.s > 2.9) c.e = c.s + 2.9;
    }
    return caps;
  }


  /* ---------- review panel: edit the text before it goes on the timeline ---------- */
  function fmtT(sec) { var m = Math.floor(sec / 60), x = sec - m * 60; return m + ":" + (x < 10 ? "0" : "") + x.toFixed(2); }
  function parseT(str) {
    var p = String(str).replace(/^\s+|\s+$/g, "").split(":"), v;
    if (p.length === 1) v = parseFloat(p[0]);
    else if (p.length === 2) v = parseFloat(p[0]) * 60 + parseFloat(p[1]);
    else return NaN;
    return v;
  }
  function bySt(a, b) { return a.s - b.s; }
  function srtTime(sec) {
    var ms = Math.round(sec * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, x = Math.floor(ms / 1000) % 60, r = ms % 1000;
    function p(n, l) { n = String(n); while (n.length < l) n = "0" + n; return n; }
    return p(h, 2) + ":" + p(m, 2) + ":" + p(x, 2) + "," + p(r, 3);
  }
  function exportSrt() {
    if (!pending) return;
    var caps = pending.caps.filter(function (c) { return c.text.replace(/\s/g, ""); }).sort(bySt);
    var body = caps.map(function (c, i) { return (i + 1) + "\n" + srtTime(c.s) + " --> " + srtTime(c.e) + "\n" + c.text + "\n"; }).join("\n");
    psPick("Add-Type -AssemblyName System.Windows.Forms | Out-Null;$f = New-Object System.Windows.Forms.SaveFileDialog;$f.Filter = 'SubRip subtitles|*.srt';$f.FileName = 'captions.srt';if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.FileName }", function (file) {
      if (!file) return;
      try { fs.writeFileSync(file, "\uFEFF" + body, "utf8"); status("Saved " + file, "ok"); } catch (e) { status("Could not save the file: " + e.message, "err"); }
    });
  }
  // The reviewed captions go in as Premiere's own caption track (one SRT import)
  function insertSrt() {
    if (busy || !pending) return;
    var caps = pending.caps.filter(function (c) { return c.text.replace(/\s/g, ""); }).sort(bySt), i;
    if (!caps.length) return status("There are no captions left to insert.", "err");
    for (i = 0; i < caps.length; i++) { if (!(caps[i].e > caps[i].s)) return status("\"" + caps[i].text + "\" ends before it starts. Fix its start / end first.", "err"); }
    var body = caps.map(function (c, k) { return (k + 1) + "\n" + srtTime(c.s) + " --> " + srtTime(c.e) + "\n" + c.text + "\n"; }).join("\n");
    var dir = J(HS_APP_DIR, "captions"), file;
    try {
      hsMkdirp(dir);
      var d = new Date(), pz = function (n) { return (n < 10 ? "0" : "") + n; };
      file = J(dir, "captions_" + d.getFullYear() + pz(d.getMonth() + 1) + pz(d.getDate()) + "_" + pz(d.getHours()) + pz(d.getMinutes()) + pz(d.getSeconds()) + ".srt");
      fs.writeFileSync(file, "\uFEFF" + body, "utf8");
    } catch (e) { return status("Could not save the SRT file: " + e.message, "err"); }
    busy = true; status("Adding the SRT to the sequence..."); render();
    evalHost("cpImportSrt(" + JSON.stringify(JSON.stringify({ path: file })) + ")", function (res) {
      busy = false;
      if (res.error) { status(res.error, "err"); return render(); }
      pending = null;     // the review list is only dropped once Premiere accepted the file
      status("Captions added as a caption track.\nTo style or animate them: right-click the caption track > convert to graphics.", "ok"); render();
    });
  }
  function fillReview() {
    var list = document.getElementById("cpRevList");
    if (!list || !pending) return;
    list.innerHTML = "";
    pending.caps.forEach(function (c, i) {
      var row = document.createElement("div");
      row.className = "revRow";
      row.innerHTML = '<input class="revT" data-k="s"><input class="revT" data-k="e"><input class="revTxt" dir="auto"><button class="revAdd" title="Add a caption after this one">+</button><button class="revDel" title="Remove">&times;</button>';
      var inp = row.querySelector(".revTxt"); inp.value = c.text;
      inp.addEventListener("input", function () { c.text = inp.value; });
      Array.prototype.forEach.call(row.querySelectorAll(".revT"), function (ti) {
        var k = ti.getAttribute("data-k");
        ti.value = fmtT(c[k]);
        ti.addEventListener("change", function () {
          var v = parseT(ti.value);
          if (!isNaN(v) && v >= 0) c[k] = v;
          ti.value = fmtT(c[k]);
        });
        ti.addEventListener("keydown", function (e) { if (e.key === "Enter") ti.blur(); });
      });
      row.querySelector(".revAdd").addEventListener("click", function () {
        var nx = pending.caps[i + 1], st = c.e, en = nx ? Math.max(st + 0.1, Math.min(c.e + 0.5, nx.s)) : c.e + 0.5;
        pending.caps.splice(i + 1, 0, { s: st, e: en, text: "" }); pending.focus = i + 1; render();
      });
      row.querySelector(".revDel").addEventListener("click", function () { pending.caps.splice(i, 1); render(); });
      if (pending.focus === i) setTimeout(function () { inp.focus(); row.scrollIntoView(); pending.focus = -1; }, 0);
      list.appendChild(row);
    });
  }

  /* ---------- main flow ---------- */
  function fail(msg) { busy = false; working = false; status(msg, "err"); render(); }
  function cancelGenerate() {
    cancelled = true;
    if (genProc) { try { genProc.kill(); } catch (e) {} }
    status("Cancelling...");
  }
  function generate() {
    if (busy) return;
    cancelled = false;
    readSettings();
    var exe = findWhisper();
    if (!exe || !fs.existsSync(modelPath())) return status("Setup is not complete: download the speech engine and a model first.", "err");
    var ffmpeg = hsFindFfmpeg();
    if (!ffmpeg) return status(HS_FFMPEG_MISSING, "err");
    busy = true; working = true; status("Reading clips..."); render();
    evalHost("cpGetClips(" + JSON.stringify(S.source) + ")", function (r) {
      if (r.error) return fail(r.error);
      var clips = r.clips, all = [], i = 0;
      function finish() {
        if (!all.length) return fail("No speech was found in the selected audio.");
        busy = false; working = false; pending = { caps: all };
        status("Review the text, fix any mistakes, then press Insert SRT Captions.");
        render();
      }
      function next() {
        if (i >= clips.length) return finish();
        var clip = clips[i++];
        progLabel = clips.length > 1 ? "clip " + i + " of " + clips.length : "";
        status("Transcribing" + (progLabel ? " " + progLabel : "") + " (this can take a while)...");
        var wav = J(osMod.tmpdir(), "halalfx_cap_" + Date.now() + ".wav");
        extractWav(ffmpeg, clip, wav, function (e3) {
          if (cancelled) { try { fs.unlinkSync(wav); } catch (e) {} cancelled = false; busy = false; working = false; status("Cancelled."); return render(); }
          if (e3) return fail(e3.message);
          runWhisper(exe, wav, function (e4, json) {
            var wordsT = null;
            if (!e4 && json) { try { wordsT = snapWords(toWords(json), hsReadPcm(wav)); } catch (es) { wordsT = toWords(json); } }
            try { fs.unlinkSync(wav); } catch (e) {}
            if (cancelled) { cancelled = false; busy = false; working = false; status("Cancelled."); return render(); }
            if (e4) return fail(e4.message);
            all = all.concat(buildCaps(wordsT, clip));
            next();
          });
        });
      }
      next();
    });
  }
})();
