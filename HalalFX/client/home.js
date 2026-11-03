/* HalalFX - Home screen. Opens on 5 feature cards; each feature gets a back-arrow header. Loaded last. */
(function () {
  var FEATURES = [
    { id: "sfx", title: "SFX", desc: "Browse and import sound effects", icon: "ic-wave", tab: "folder" },
    { id: "cut", title: "Silence Remover", desc: "Remove pauses from clips", icon: "ic-scissors", tab: "cut" },
    { id: "fillers", title: "Filler Words", desc: "Remove um, uh and filler words", icon: "ic-fillers", tab: "fillers" },
    { id: "captions", title: "Captions", desc: "Generate captions from speech", icon: "ic-captions", tab: "captions" },
    { id: "gaps", title: "Gaps", desc: "Find and close empty gaps", icon: "ic-gaps", tab: "gaps" }
  ];

  var css = document.createElement("style");
  css.textContent =
    ".ic-scissors{-webkit-mask-image:url('icons/scissors.svg');mask-image:url('icons/scissors.svg');}" +
    // feature tabs are opened from the home cards, never from the tab bar
    "body.view-home #tabs,body.view-home #body,body.view-home #footer,body.view-home #featHead{display:none !important;}" +
    "body.view-feat #tabs{display:none !important;}" +
    "body.view-sfx #tabs{display:flex !important;}" +
    // Libraries panel: Folder only. Bottom bar (volume / view): SFX tabs only (not Pack, Silence Remover, Gaps, Captions, Filler Words).
    "body:not([data-tab=\"folder\"]) #sidebar,body:not([data-tab=\"folder\"]) #sidebarResizer{display:none !important;}" +
    "body[data-tab=\"pack\"] #footer,body[data-tab=\"cut\"] #footer,body[data-tab=\"gaps\"] #footer,body[data-tab=\"captions\"] #footer,body[data-tab=\"fillers\"] #footer{display:none !important;}" +
    "#homeScreen{display:none;flex:1;overflow:auto;padding:14px;box-sizing:border-box;}" +
    "body.view-home #homeScreen{display:block;}" +
    "#homeGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}" +
    ".homeCard{background:var(--panel);border:1px solid #2c2c2c;border-radius:14px;padding:18px 12px 16px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;color:var(--text);font-family:inherit;text-align:center;transition:box-shadow .15s,border-color .15s;}" +
    ".homeCard:hover{border-color:var(--accent-1);box-shadow:0 0 4px 1px rgba(30,159,214,.55);}" +
    ".homeCard .icon-mask{width:30px;height:30px;color:var(--accent-1);}" +
    ".homeCard .hn{font-size:13px;font-weight:600;}" +
    ".homeCard .hd{font-size:10.5px;color:var(--muted);line-height:1.4;}" +
    "#featHead{display:flex;align-items:center;gap:8px;padding:4px 10px;border-bottom:2px solid var(--border);flex-shrink:0;}" +
    "#fhBack{width:24px;height:24px;border-radius:7px;border:1px solid #383838;background:var(--panel);color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}" +
    "#fhBack:hover{border-color:var(--accent-1);color:var(--accent-1);}" +
    "#fhBack svg{width:13px;height:13px;}" +
    "#fhTitle{font-size:12.5px;font-weight:600;color:var(--text);}" +
    // empty states ("Empty", "No results") centered in the middle of the page
    "#content.content-empty{display:flex;align-items:center;justify-content:center;}" +
    "#content.content-empty #emptyMsg{padding:0;}" +
    // space for the logo, to the left of the brand name
    "#brand{align-items:center;gap:3px;user-select:none;-webkit-user-select:none;}" +
    "#brand .name{line-height:1;padding-top:2px;}" +
    "#brandLogo{width:30px;height:30px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;}" +
    "#brandLogo img{display:block;max-width:100%;max-height:100%;object-fit:contain;pointer-events:none;-webkit-user-drag:none;}";
  document.head.appendChild(css);

  var header = document.getElementById("header");

  var feat = document.createElement("div");
  feat.id = "featHead";
  feat.innerHTML = '<button id="fhBack" title="Back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button><span id="fhTitle"></span>';
  header.parentNode.insertBefore(feat, header.nextSibling);

  var home = document.createElement("div");
  home.id = "homeScreen";
  home.innerHTML = '<div id="homeGrid">' + FEATURES.map(function (f) {
    return '<button class="homeCard" data-id="' + f.id + '"><span class="icon-mask ' + f.icon + '"></span><span class="hn">' + f.title + '</span><span class="hd">' + f.desc + "</span></button>";
  }).join("") + "</div>";
  feat.parentNode.insertBefore(home, feat.nextSibling);

  function setView(v) {
    var b = document.body.classList;
    b.remove("view-home", "view-feat", "view-sfx");
    if (v === "home") b.add("view-home"); else b.add("view-feat");
    if (v === "sfx") b.add("view-sfx");
  }

  function openFeature(id) {
    var f = FEATURES.filter(function (x) { return x.id === id; })[0];
    document.getElementById("fhTitle").textContent = f.title;
    setView(id);
    setActiveTab(f.tab);
  }

  function goHome() {
    stopPlayback();         // SFX preview
    setActiveTab("folder"); // also stops any running preview of the other features
    setView("home");
  }

  Array.prototype.forEach.call(home.querySelectorAll(".homeCard"), function (c) {
    c.addEventListener("click", function () { openFeature(c.getAttribute("data-id")); });
  });
  document.getElementById("fhBack").addEventListener("click", goHome);

  // Libraries panel shows on Folder only; the Pack page also hides the bottom bar
  var prevSetTab = setActiveTab;
  setActiveTab = function (tab) {
    prevSetTab(tab);
    document.body.setAttribute("data-tab", tab);
  };

  document.body.setAttribute("data-tab", "folder");
  // logo: icons/logo.svg (or .png / .webp) shows up automatically next to the brand name
  var logoSlot = document.getElementById("brandLogo");
  (function tryLogo(names) {
    if (!logoSlot || !names.length) return;
    var im = new Image();
    im.draggable = false;
    im.onload = function () { logoSlot.appendChild(im); };
    im.onerror = function () { tryLogo(names.slice(1)); };
    im.src = "icons/" + names[0];
  })(["logo.svg", "logo.png", "logo.webp"]);

  /* ---------- fallback icons ----------
     Every icon is icons/<name>.svg. If one of those files is missing, a simple built-in outline icon takes its place,
     so a missing file never shows up as a solid square. Existing files are never replaced. */
  var FALLBACK = {
    arrow: '<polyline points="9 6 15 12 9 18"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    "folder-open": '<path d="M3 9V6a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1"/><path d="M3 10h18l-2 8H5z"/>',
    wave: '<path d="M4 10v4M8 6v12M12 3v18M16 8v8M20 11v2"/>',
    star: '<polygon points="12 3 14.8 9 21 9.7 16.4 14 17.8 20.5 12 17.2 6.2 20.5 7.6 14 3 9.7 9.2 9"/>',
    "list-view": '<path d="M4 6h16M4 12h16M4 18h16"/>',
    "large-view": '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
    "small-view": '<rect x="3" y="3" width="4" height="4"/><rect x="10" y="3" width="4" height="4"/><rect x="17" y="3" width="4" height="4"/><rect x="3" y="10" width="4" height="4"/><rect x="10" y="10" width="4" height="4"/><rect x="17" y="10" width="4" height="4"/><rect x="3" y="17" width="4" height="4"/><rect x="10" y="17" width="4" height="4"/><rect x="17" y="17" width="4" height="4"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><polyline points="20 4 20 11 13 11"/>',
    volume: '<polygon points="4 9 8 9 13 5 13 19 8 15 4 15"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    mute: '<polygon points="4 9 8 9 13 5 13 19 8 15 4 15"/><path d="M17 9l5 6M22 9l-5 6"/>',
    pack: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l5 5"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8l11 11M8.5 16l11-11"/>',
    fillers: '<path d="M5 8h14M5 12h14M5 16h8"/>',
    captions: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 11h4M13 11h4M7 15h2M12 15h5"/>',
    gaps: '<path d="M4 6v12M20 6v12M8 12h8M10 9l-2 3 2 3M14 9l2 3-2 3"/>'
  };
  Object.keys(FALLBACK).forEach(function (name) {
    var im = new Image();
    im.onerror = function () {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + FALLBACK[name] + "</svg>";
      var url = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")';
      var sel = ".ic-" + name + (name === "pack" ? ",.ic-pack-lg" : "");
      var st = document.createElement("style");
      st.textContent = sel + "{-webkit-mask-image:" + url + ";mask-image:" + url + ";}";
      document.head.appendChild(st);
    };
    im.src = "icons/" + name + ".svg";
  });

  setView("home");
})();
