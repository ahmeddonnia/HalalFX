/* HalalFX - Gap Finder. Finds empty spaces on the timeline, marks them and jumps to them. */
(function () {
  var gaps = [];
  var scanned = false;
  var noClips = false;
  var seqName = "";
  var fps = 25;
  var busy = false;
  var errText = "";
  var S = loadJSON("halalfx_gaps2", { track: "V1" });
  var TRACKS = [["all", "All"]];
  var ti; for (ti = 1; ti <= 8; ti++) TRACKS.push(["V" + ti, "V" + ti]);
  for (ti = 1; ti <= 4; ti++) TRACKS.push(["A" + ti, "A" + ti]);

  var css = document.createElement("style");
  css.textContent =
    ".ic-gaps{width:13px;height:13px;-webkit-mask-image:url('icons/gaps.svg');mask-image:url('icons/gaps.svg');}" +
    "#gpScreen{padding:12px;display:flex;flex-direction:column;gap:10px;font-size:12px;color:var(--text);height:100%;box-sizing:border-box;overflow:auto;}" +
    ".gpTop{display:flex;gap:8px;align-items:stretch;} .gpTop #gpScan{flex:3 1 0;width:auto;min-width:0;} .gpdd{position:relative;flex:1 1 0;min-width:0;}" +
    ".gpdd .ddb{width:100%;height:100%;display:flex;align-items:center;justify-content:space-between;gap:6px;background:#1d1d1d;border:1px solid #383838;border-radius:12px;color:var(--text);padding:0 10px;font-size:12.5px;font-weight:600;cursor:pointer;}" +
    ".gpdd .ddl{display:none;position:absolute;right:0;top:100%;margin-top:4px;z-index:50;background:#1d1d1d;border:1px solid #383838;border-radius:8px;min-width:100%;max-height:190px;overflow:auto;} .gpdd.open .ddl{display:block;}" +
    ".gpdd .ddi{padding:6px 10px;cursor:pointer;white-space:nowrap;color:var(--text);} .gpdd .ddi:hover{background:rgba(30,159,214,.25);color:var(--accent-1);} .gpdd .ddi.sel{color:var(--accent-1);}" +
    "#gpScan{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border:none;border-radius:12px;padding:13px 16px;cursor:pointer;font-size:13px;font-weight:600;color:#fff;background:var(--accent-grad);}" +
    "#gpScan:disabled{opacity:.6;cursor:default;}" +
    "#gpScan,#gpClose{transition:box-shadow .15s;} #gpScan:hover:not(:disabled),#gpClose:hover:not(:disabled){box-shadow:0 0 4px 1px rgba(30,159,214,.55);}" +
    "#gpClose{width:100%;border:none;border-radius:12px;padding:13px 16px;cursor:pointer;font-size:13px;font-weight:600;color:#fff;background:var(--accent-grad);}" +
    "#gpClose:disabled{opacity:.4;cursor:default;}" +
    "#gpScan .icon-mask{background-color:#fff;}" +
    "#gpCount{text-align:center;font-weight:600;padding:11px;border-radius:12px;border:1px solid #2c2c2c;background:var(--panel);color:var(--muted);}" +
    "#gpCount.has{background:rgba(30,159,214,.12);border-color:var(--accent-2);color:var(--accent-1);}" +
    "#gpErr{color:#ff6b6b;line-height:1.5;}" +
    "#gpCard{background:var(--panel);border:1px solid #2c2c2c;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:12px;}" +
    "#gpCard .head{display:flex;align-items:center;justify-content:space-between;gap:8px;}" +
    "#gpCard .head .t{font-size:14px;font-weight:600;color:var(--text);}" +
    "#gpCard .head .r{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%;}" +
    "#gpEmpty{border:1px dashed #4a4a4a;border-radius:12px;padding:22px 16px;text-align:center;}" +
    "#gpEmpty .t{font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px;}" +
    "#gpEmpty .d{font-size:11.5px;color:var(--muted);line-height:1.5;}" +
    ".gpItem{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#1d1d1d;border:1px solid #333;border-radius:12px;padding:12px 14px;cursor:pointer;}" +
    ".gpItem:hover{border-color:var(--accent-1);}" +
    ".gpItem .n{font-size:13px;font-weight:600;color:var(--text);}" +
    ".gpItem .tc{color:var(--accent-1);font-weight:600;margin-top:4px;}" +
    ".gpItem .dur{color:var(--muted);font-size:11px;margin-top:3px;}" +
    ".gpItem .go{width:34px;height:34px;flex-shrink:0;border-radius:50%;border:1px solid #3a3a3a;background:#252525;color:var(--muted);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;}" +
    ".gpItem .go:hover{color:var(--accent-1);border-color:var(--accent-1);}";
  document.head.appendChild(css);

  var prevRender = renderActiveTab;
  renderActiveTab = function () {
    if (state.activeTab === "gaps") { crumbEl.textContent = ""; render(); }
    else prevRender();
  };

  document.addEventListener("click", function () {
    var o = document.querySelector(".gpdd.open"); if (o) o.classList.remove("open");
  });

  function tc(sec) {
    var f = Math.round(sec * fps), n = Math.round(fps);
    var ff = f % n, s = Math.floor(f / n);
    function p(x) { return (x < 10 ? "0" : "") + x; }
    return p(Math.floor(s / 3600)) + ":" + p(Math.floor(s / 60) % 60) + ":" + p(s % 60) + ":" + p(ff);
  }

  var evalHost = hsEval;

  var GO_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';

  function render() {
    contentEl.className = "";
    var count = gaps.length;
    var html =
      '<div id="gpScreen">' +
        '<div class="gpTop"><button id="gpScan"' + (busy ? " disabled" : "") + '><span class="icon-mask ic-search"></span>Scan Timeline</button>' +
          '<div class="gpdd" id="gpTrack"><button type="button" class="ddb"><span>' + S.track.replace("all", "All") + '</span><span>&#9662;</span></button><div class="ddl">' +
          TRACKS.map(function (o) { return '<div class="ddi' + (o[0] === S.track ? " sel" : "") + '" data-v="' + o[0] + '">' + o[1] + "</div>"; }).join("") + "</div></div></div>" +
        '<div id="gpCount" class="' + (count ? "has" : "") + '">' + count + (count === 1 ? " gap" : " gaps") + '</div>' +
        '<button id="gpClose"' + (busy ? " disabled" : "") + '>Close Gaps</button>' +
        (errText ? '<div id="gpErr"></div>' : "") +
        '<div id="gpCard">' +
          '<div class="head"><div class="t">Detected Intervals</div><div class="r" id="gpName"></div></div>' +
          '<div id="gpBody"></div>' +
        '</div>' +
      '</div>';
    contentEl.innerHTML = html;
    document.getElementById("gpScan").addEventListener("click", function () { scan(); });
    var dd = document.getElementById("gpTrack");
    dd.querySelector(".ddb").addEventListener("click", function (e) { e.stopPropagation(); dd.classList.toggle("open"); });
    Array.prototype.forEach.call(dd.querySelectorAll(".ddi"), function (it) {
      it.addEventListener("click", function () { S.track = it.getAttribute("data-v"); saveJSON("halalfx_gaps2", S); gaps = []; scanned = false; render(); });
    });
    document.getElementById("gpClose").addEventListener("click", closeGaps);
    document.getElementById("gpName").textContent = scanned ? seqName : "No scan yet.";
    if (errText) document.getElementById("gpErr").textContent = errText;

    var body = document.getElementById("gpBody");
    if (!count) {
      body.innerHTML = scanned
        ? (noClips
            ? '<div id="gpEmpty"><div class="t">Nothing to scan</div><div class="d">There are no clips on ' + (S.track === "all" ? "this sequence" : "track " + S.track) + '.</div></div>'
            : '<div id="gpEmpty"><div class="t">No gaps found</div><div class="d">Every part of this sequence has content.</div></div>')
        : '<div id="gpEmpty"><div class="t">No gaps yet</div><div class="d">Scan the active sequence to list its empty gaps.</div></div>';
      return;
    }
    gaps.forEach(function (g, idx) {
      var d = document.createElement("div");
      d.className = "gpItem";
      d.innerHTML = '<div><div class="n">Gap ' + (idx + 1) + '</div><div class="tc">' + tc(g.s) + ' -&gt; ' + tc(g.e) + '</div><div class="dur">Duration ' + (g.e - g.s).toFixed(2) + 's</div></div>' +
                    '<button class="go" title="Go to gap">' + GO_ICON + '</button>';
      d.addEventListener("click", function () {
        evalHost("gpGoto(" + g.s + ")", function (r) { if (r.error) { errText = r.error; render(); } });
      });
      body.appendChild(d);
    });
  }

  function merge(list) {
    list.sort(function (a, b) { return a[0] - b[0]; });
    var out = [], cur = null;
    list.forEach(function (x) {
      if (!cur) cur = [x[0], x[1]];
      else if (x[0] <= cur[1] + 1e-6) { if (x[1] > cur[1]) cur[1] = x[1]; }
      else { out.push(cur); cur = [x[0], x[1]]; }
    });
    if (cur) out.push(cur);
    return out;
  }

  function scan(msg) {
    if (busy) return;
    busy = true; errText = "";
    render();
    setTimeout(function () {
      evalHost("gpScan(" + JSON.stringify(S.track) + ")", function (r) {
        if (r.error) { busy = false; errText = r.error; return render(); }
        fps = r.fps || 25;
        seqName = r.name || "";
        var items = r.video.concat(r.audio);
        gaps = [];
        noClips = !items.length;
        if (items.length) {
          var merged = merge(items);
          var minLen = 0.5 / fps; // any gap of at least one frame
          for (var i = 1; i < merged.length; i++) {
            var s = merged[i - 1][1], e = merged[i][0];
            if (e - s >= minLen) gaps.push({ s: s, e: e });
          }
        }
        scanned = true;
        // mark every gap on the timeline as an in/out range marker (replaces previous ones)
        evalHost("gpMarkers(" + JSON.stringify(JSON.stringify({ gaps: gaps })) + ")", function (m) {
          busy = false;
          errText = m.error || msg || "";
          render();
        });
      });
    }, 30);
  }

  function closeGaps() {
    if (busy) return;
    busy = true; errText = "";
    render();
    setTimeout(function () {
      evalHost("gpCloseGaps(" + JSON.stringify(S.track) + ")", function (r) {
        busy = false;
        if (r.error) { errText = r.error; return render(); }
        var msg = "";
        if (r.failed) msg = "Some clips could not be moved (" + r.failed + "). " + (r.err || "");
        else if (r.blocked) msg = r.blocked + (r.blocked === 1 ? " gap was" : " gaps were") + " not closed: there are clips above " + (r.blocked === 1 ? "it" : "them") + " on other tracks. Move or delete them, then press Close Gaps again.";
        scan(msg); // refresh the list and markers
      });
    }, 30);
  }
})();
