/* HalalFX - SFX browser (libraries, folders, favorites, search, packs). Shared helpers live in common.js. */

// Audio formats Premiere imports (per Adobe's list). Some can't be previewed in the panel; those rows are dimmed and can still be dragged in.
var AUDIO_EXTENSIONS = ["mp3", "wav", "aif", "aiff", "m4a", "aac", "wma", "ac3"];
var unplayable = {};   // paths the panel could not preview
var SEARCH_LIMIT = 300;
var SCAN_TTL = 20000;   // folder scans are reused for this long (ms), so clicking around a big library stays fast

/* ---------- persisted state ---------- */
var state = {
  libraries: loadJSON("halalfx_libraries", []),
  expanded: {},
  favorites: loadJSON("halalfx_favorites", []),
  viewMode: localStorage.getItem("halalfx_view") || "list",
  activeTab: "folder",
  selectedFolder: null,
  currentAudio: null,
  currentPlayingPath: null
};
if (["list", "large", "small"].indexOf(state.viewMode) === -1) state.viewMode = "list";

/* ---------- helpers ---------- */
function ext(name) { var p = name.split("."); return p.length > 1 ? p.pop().toLowerCase() : ""; }
function isAudio(name) { return AUDIO_EXTENSIONS.indexOf(ext(name)) !== -1; }
function join(folder, name) {
  var sep = folder.indexOf("\\") !== -1 ? "\\" : "/";
  return folder.charAt(folder.length - 1) === sep ? folder + name : folder + sep + name;
}
function baseName(p) {
  var parts = p.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || p;
}
function readDirSafe(path) {
  try {
    var r = window.cep.fs.readdir(path);
    if (r && !r.err && r.data) return r.data;
  } catch (e) {}
  return [];
}
function isFavorite(path) { return state.favorites.indexOf(path) !== -1; }
function toggleFavorite(path) {
  var i = state.favorites.indexOf(path);
  if (i === -1) state.favorites.push(path); else state.favorites.splice(i, 1);
  saveJSON("halalfx_favorites", state.favorites);
}
function isDirSafe(p) {
  try { return require("fs").statSync(p).isDirectory(); } catch (e) {}
  try { var r = window.cep.fs.stat(p); return !!(r && !r.err && r.data && r.data.isDirectory()); } catch (e2) {}
  return false;
}
function subFoldersOf(path) { return readDirSafe(path).filter(function (n) { return !isAudio(n) && isDirSafe(join(path, n)); }); }

// Folder scans are cached for a short time; adding / removing a library or a pack drops the cache at once.
var countCache = {}, audioIndex = null;
function invalidateScan() { countCache = {}; audioIndex = null; }
function countAudioFilesRecursive(path, depth) {
  var c = countCache[path], now = Date.now(), count = 0;
  if (c && now - c.t < SCAN_TTL) return c.n;
  if ((depth || 0) < 20) {
    readDirSafe(path).forEach(function (n) {
      if (isAudio(n)) count++;
      else if (isDirSafe(join(path, n))) count += countAudioFilesRecursive(join(path, n), (depth || 0) + 1);
    });
  }
  countCache[path] = { n: count, t: now };
  return count;
}
function walkAudioFiles(rootPath, out, depth) {
  if ((depth || 0) > 20) return;
  readDirSafe(rootPath).forEach(function (n) {
    var full = join(rootPath, n);
    if (isAudio(n)) out.push({ name: n, path: full });
    else if (isDirSafe(full)) walkAudioFiles(full, out, (depth || 0) + 1);
  });
}
function allAudioFiles() {
  var now = Date.now();
  if (audioIndex && now - audioIndex.t < SCAN_TTL) return audioIndex.list;
  var list = [];
  state.libraries.forEach(function (lib) { walkAudioFiles(lib.path, list, 0); });
  list.sort(function (a, b) { return a.name.localeCompare(b.name); });
  audioIndex = { list: list, t: now };
  return list;
}

/* ---------- audio preview ---------- */
function stopPlayback() {
  if (state.currentAudio) { state.currentAudio.pause(); state.currentAudio = null; }
  state.currentPlayingPath = null;
  document.querySelectorAll(".track.playing").forEach(function (el) { el.classList.remove("playing"); });
}
function togglePlay(path, rowEl) {
  var wasPlaying = state.currentPlayingPath === path, audio, pr;
  stopPlayback();
  if (wasPlaying) return;
  audio = new Audio(fileUrl(path));
  audio.volume = hsVolume();
  audio.addEventListener("ended", function () { if (state.currentAudio === audio) stopPlayback(); });
  function cannotPlay() {
    unplayable[path] = true;
    if (rowEl) { rowEl.classList.add("noPreview"); rowEl.title = "The panel can't preview this format. You can still drag it into the timeline.\n" + path; }
    if (state.currentAudio === audio) stopPlayback();
  }
  audio.addEventListener("error", cannotPlay);
  state.currentAudio = audio;
  state.currentPlayingPath = path;
  if (rowEl) rowEl.classList.add("playing");
  pr = audio.play();
  if (pr && pr.catch) pr.catch(function (e) { if (e && e.name === "NotSupportedError") cannotPlay(); else if (state.currentAudio === audio) stopPlayback(); });
}

/* --- volume / mute (the volume is remembered between sessions) --- */
var volSlider = document.getElementById("volSlider");
var volIcon = document.getElementById("volIcon");
var lastVolume = 1;

function hsVolume() {
  var v = volSlider ? parseFloat(volSlider.value) : 1;
  return isNaN(v) ? 1 : Math.max(0, Math.min(1, v));
}
function updateVolIcon() {
  var muted = hsVolume() === 0;
  volIcon.classList.toggle("ic-mute", muted);
  volIcon.classList.toggle("ic-volume", !muted);
}
function updateVolFill() {
  var pct = hsVolume() * 100;
  volSlider.style.background = "linear-gradient(to right, var(--accent-2) 0%, var(--accent-1) " + pct + "%, #444 " + pct + "%, #444 100%)";
}
(function () {
  var saved = parseFloat(localStorage.getItem("halalfx_volume"));
  if (!isNaN(saved) && saved >= 0 && saved <= 1) volSlider.value = saved;
  if (hsVolume() > 0) lastVolume = hsVolume();
  volSlider.addEventListener("input", function () {
    var v = hsVolume();
    if (v > 0) lastVolume = v;
    if (state.currentAudio) state.currentAudio.volume = v;
    localStorage.setItem("halalfx_volume", String(v));
    updateVolIcon();
    updateVolFill();
  });
  // clicking the speaker mutes, and clicking again brings back the previous level
  volIcon.addEventListener("click", function () {
    volSlider.value = hsVolume() === 0 ? lastVolume : 0;
    volSlider.dispatchEvent(new Event("input"));
  });
  updateVolIcon();
  updateVolFill();
})();

/* ---------- sidebar tree ---------- */
var treeEl = document.getElementById("tree");

function saveLibraries() { saveJSON("halalfx_libraries", state.libraries); }

var draggingLibId = null;

function addLibrary() {
  function addPath(path) {
    if (!path) return;
    var already = state.libraries.some(function (l) { return l.path === path; });
    if (already) return;
    state.libraries.push({ id: "lib_" + Date.now(), name: baseName(path), path: path });
    invalidateScan();
    saveLibraries();
    renderTree();
  }

  try {
    // Runs in the panel's own Node.js context (enabled via --mixed-context),
    // not in ExtendScript — system.callSystem() only exists when After
    // Effects is the host app, so it silently fails inside Premiere.
    var cp = require("child_process");
    var ps =
      "Add-Type -AssemblyName System.Windows.Forms | Out-Null;" +
      "$f = New-Object System.Windows.Forms.OpenFileDialog;" +
      "$f.Title = 'Select a Folder';" +
      "$f.CheckFileExists = $false;" +
      "$f.CheckPathExists = $true;" +
      "$f.FileName = 'Select This Folder';" +
      "$f.Filter = 'Folders|no.files.here.dummy';" +
      "$f.ValidateNames = $false;" +
      "if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output (Split-Path $f.FileName) }";
    var cmd = 'powershell -NoProfile -NonInteractive -STA -Command "' + ps.replace(/"/g, '\\"') + '"';

    var out = cp.execSync(cmd, { encoding: "utf8", windowsHide: true });
    addPath((out || "").replace(/^\s+|\s+$/g, ""));
  } catch (e) {
    // Node/PowerShell unavailable for some reason — fall back to the classic dialog.
    csInterface.evalScript('selectSFXFolderClassic()', function (result) {
      addPath((result || "").trim());
    });
  }
}
document.getElementById("addLibBtn").addEventListener("click", addLibrary);

// Re-reads the library folders (new files copied in from outside show up). Also runs when the panel gets focus again.
function refreshLibraries() {
  var top = contentEl.scrollTop;
  invalidateScan();
  renderTree();
  renderActiveTab();
  contentEl.scrollTop = top;
}
var lastAutoRefresh = 0;
document.getElementById("refreshBtn").addEventListener("click", refreshLibraries);
window.addEventListener("focus", function () {
  var now = Date.now();
  if (now - lastAutoRefresh < 5000 || !state.libraries.length || !document.body.classList.contains("view-sfx")) return;
  lastAutoRefresh = now;
  refreshLibraries();
});

function removeLibrary(id) {
  var lib = state.libraries.filter(function (l) { return l.id === id; })[0];
  state.libraries = state.libraries.filter(function (l) { return l.id !== id; });
  invalidateScan();
  saveLibraries();

  if (lib) {
    var prefix = lib.path.replace(/[\\/]+$/, "");
    var isInside = function (p) {
      return p === prefix || p.indexOf(prefix + "\\") === 0 || p.indexOf(prefix + "/") === 0;
    };

    var favCountBefore = state.favorites.length;
    state.favorites = state.favorites.filter(function (p) { return !isInside(p); });
    if (state.favorites.length !== favCountBefore) saveJSON("halalfx_favorites", state.favorites);

    if (state.selectedFolder && isInside(state.selectedFolder)) state.selectedFolder = null;
    if (state.currentPlayingPath && isInside(state.currentPlayingPath)) stopPlayback();
    delete state.expanded[lib.path];
  }

  renderTree();
  renderActiveTab();
}

function makeNode(path, name, depth, isRoot, rootId) {
  var wrap = document.createElement("div");
  var row = document.createElement("div");
  row.className = "node" + (isRoot ? " root" : "");
  row.style.paddingLeft = (depth * 12) + "px";
  row.dataset.path = path;
  row.dataset.rootId = rootId;

  var subFolders = subFoldersOf(path);
  var hasChildren = subFolders.length > 0;

  var arrowSpan = document.createElement("span");
  arrowSpan.className = "arrow" + (hasChildren ? "" : " empty") + (state.expanded[path] ? " open" : "");
  arrowSpan.innerHTML = '<span class="icon-mask ic-arrow"></span>';
  row.appendChild(arrowSpan);

  var iconSpan = document.createElement("span");
  iconSpan.className = "icon";
  var isSelected = path === state.selectedFolder;
  iconSpan.innerHTML = '<span class="icon-mask ' + (isSelected ? "ic-folder-open" : "ic-folder") + '"></span>';
  row.appendChild(iconSpan);

  var label = document.createElement("span");
  label.className = "label";
  label.textContent = name;
  row.appendChild(label);

  var countSpan = document.createElement("span");
  countSpan.className = "count";
  countSpan.textContent = countAudioFilesRecursive(path);
  row.appendChild(countSpan);

  if (isRoot) {
    // Manual reordering of top-level libraries only (not subfolders, which
    // reflect the real folder structure on disk and aren't reorderable).
    row.setAttribute("draggable", "true");
    row.addEventListener("dragstart", function (e) {
      draggingLibId = rootId;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", rootId);
    });
    row.addEventListener("dragover", function (e) {
      if (draggingLibId === null || draggingLibId === rootId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", function () {
      row.classList.remove("drag-over");
    });
    row.addEventListener("drop", function (e) {
      e.preventDefault();
      row.classList.remove("drag-over");
      if (draggingLibId === null || draggingLibId === rootId) return;
      var fromIndex = state.libraries.findIndex(function (l) { return l.id === draggingLibId; });
      var toIndex = state.libraries.findIndex(function (l) { return l.id === rootId; });
      if (fromIndex === -1 || toIndex === -1) return;
      var moved = state.libraries.splice(fromIndex, 1)[0];
      state.libraries.splice(toIndex, 0, moved);
      saveLibraries();
      renderTree();
    });
    row.addEventListener("dragend", function () {
      draggingLibId = null;
      document.querySelectorAll(".node.drag-over").forEach(function (el) { el.classList.remove("drag-over"); });
    });
  }

  if (path === state.selectedFolder) row.classList.add("selected");
  wrap.appendChild(row);

  var childrenBox = document.createElement("div");
  childrenBox.className = "children";
  childrenBox.style.display = state.expanded[path] ? "block" : "none";
  wrap.appendChild(childrenBox);

  function renderChildren() {
    childrenBox.innerHTML = "";
    subFolders.forEach(function (n) {
      childrenBox.appendChild(makeNode(join(path, n), n, depth + 1, false, rootId));
    });
  }
  if (state.expanded[path]) renderChildren();

  function toggleExpand() {
    if (!hasChildren) return;
    state.expanded[path] = !state.expanded[path];
    arrowSpan.classList.toggle("open", state.expanded[path]);
    childrenBox.style.display = state.expanded[path] ? "block" : "none";
    if (state.expanded[path]) renderChildren();
  }
  arrowSpan.addEventListener("click", function (e) { e.stopPropagation(); toggleExpand(); });
  row.addEventListener("click", function () { selectFolder(path); });

  return wrap;
}

function renderTree() {
  treeEl.innerHTML = "";
  if (!state.libraries.length) {
    var hint = document.createElement("div");
    hint.style.cssText = "color:var(--muted);font-size:10.5px;padding:10px 4px;line-height:1.6;font-weight:500;";
    hint.textContent = "Click + to add a folder";
    treeEl.appendChild(hint);
    return;
  }
  state.libraries.forEach(function (lib) {
    treeEl.appendChild(makeNode(lib.path, lib.name, 0, true, lib.id));
  });
}

/* ---------- right-click context menu ---------- */
var ctxMenu = document.getElementById("ctxMenu");
var ctxDeleteItem = document.getElementById("ctxDeleteItem");
var ctxTargetRootId = null;

function openCtxMenu(x, y, rootId) {
  ctxTargetRootId = rootId;
  ctxMenu.style.left = x + "px";
  ctxMenu.style.top = y + "px";
  ctxMenu.classList.add("open");
}
function closeCtxMenu() { ctxMenu.classList.remove("open"); ctxTargetRootId = null; }

ctxDeleteItem.addEventListener("click", function () {
  if (ctxTargetRootId) removeLibrary(ctxTargetRootId);
  closeCtxMenu();
});
document.addEventListener("click", closeCtxMenu);

document.addEventListener("contextmenu", function (e) {
  var tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea") return;

  var nodeRow = e.target.closest ? e.target.closest(".node") : null;
  if (nodeRow && nodeRow.dataset.rootId) {
    e.preventDefault();
    openCtxMenu(e.clientX, e.clientY, nodeRow.dataset.rootId);
    return;
  }
  e.preventDefault();
});

/* ---------- main content rendering ---------- */
var contentEl = document.getElementById("content");
var crumbEl = document.getElementById("crumb");

function renderTracks(files, emptyText) {
  contentEl.innerHTML = "";

  if (!files.length) {
    contentEl.className = "content-empty";
    if (emptyText !== "") {
      var msg = document.createElement("div");
      msg.id = "emptyMsg";
      msg.textContent = emptyText;
      contentEl.appendChild(msg);
    }
    return;
  }

  contentEl.className = state.viewMode === "list" ? "content-list" : ("content-grid " + state.viewMode);

  files.forEach(function (file) {
    var row = document.createElement("div");
    row.className = "track";
    row.setAttribute("draggable", "true");
    row.title = file.path;
    if (state.currentPlayingPath === file.path) row.classList.add("playing");
    if (unplayable[file.path]) { row.classList.add("noPreview"); row.title = "The panel can't preview this format. You can still drag it into the timeline.\n" + file.path; }

    var wave = document.createElement("span");
    wave.className = "icon-mask ic-wave";
    row.appendChild(wave);

    var name = document.createElement("span");
    name.className = "tname";
    name.textContent = file.name;
    row.appendChild(name);

    var starWrap = document.createElement("span");
    starWrap.className = "star-wrap" + (isFavorite(file.path) ? " fav" : "");
    var star = document.createElement("span");
    star.className = "icon-mask ic-star star" + (isFavorite(file.path) ? " fav" : "");
    star.title = "Favorite";
    star.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleFavorite(file.path);
      var fav = isFavorite(file.path);
      star.classList.toggle("fav", fav);
      starWrap.classList.toggle("fav", fav);
      if (state.activeTab === "favorites") renderActiveTab();
    });
    starWrap.appendChild(star);
    row.appendChild(starWrap);

    row.addEventListener("click", function () { togglePlay(file.path, row); });
    row.addEventListener("dragstart", function (e) {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("com.adobe.cep.dnd.file.0", file.path);
    });

    contentEl.appendChild(row);
  });
}

function filesInFolder(folderPath) {
  return readDirSafe(folderPath)
    .filter(isAudio)
    .map(function (n) { return { name: n, path: join(folderPath, n) }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function selectFolder(path) {
  state.selectedFolder = path;
  setActiveTab("folder");   // also renders the file list
  renderTree();
}

function renderActiveTab() {
  if (state.activeTab === "folder") {
    if (!state.selectedFolder) { crumbEl.textContent = ""; renderTracks([], "No folder selected"); return; }
    crumbEl.textContent = "";
    renderTracks(filesInFolder(state.selectedFolder), "No audio files here");
  } else if (state.activeTab === "favorites") {
    crumbEl.textContent = "";
    var favFiles = state.favorites.map(function (p) { return { name: baseName(p), path: p }; });
    renderTracks(favFiles, "Empty");
  } else if (state.activeTab === "search") {
    var q = document.getElementById("searchInput").value.trim().toLowerCase();
    if (!q) { crumbEl.textContent = ""; renderTracks([], ""); return; }
    var results = allAudioFiles().filter(function (f) { return f.name.toLowerCase().indexOf(q) !== -1; });
    var total = results.length;
    if (total > SEARCH_LIMIT) results = results.slice(0, SEARCH_LIMIT);
    crumbEl.textContent = "Results for: " + q + (total > SEARCH_LIMIT ? " (first " + SEARCH_LIMIT + " of " + total + ")" : "");
    renderTracks(results, "No results");
  } else if (state.activeTab === "pack") {
    crumbEl.textContent = "";
    renderPackScreen();
  }
}

function renderPackScreen() {
  contentEl.className = "";
  contentEl.innerHTML =
    '<div id="packScreen">' +
      '<span class="icon-mask ic-pack-lg"></span>' +
      '<div class="packTitle">No packs installed</div>' +
      '<button id="packInstallBtn"><span class="icon-mask ic-download"></span>Install a Pack</button>' +
      '<div id="packStatus"></div>' +
    '</div>';
  document.getElementById("packInstallBtn").addEventListener("click", installPack);
}

function setPackStatus(text, kind) {
  var el = document.getElementById("packStatus");
  if (!el) return;
  el.textContent = text || "";
  el.className = kind || "";
}

// Packs always extract into a fixed, predictable location instead of asking
// the user to pick a destination each time — matches how Motion Bro etc. do it.
// Documents\HalalFX Packs. An existing Documents\HalalSFX Packs (older versions) is renamed once, and the libraries /
// favorites that pointed into it are re-pointed, so nothing is lost. If the rename fails the old folder keeps being used.
var packsRoot = null;
function getPacksRootDir() {
  if (packsRoot) return packsRoot;
  var fs = require("fs"), path = require("path"), os = require("os");
  var docs = path.join(os.homedir(), "Documents"), nd = path.join(docs, "HalalFX Packs"), od = path.join(docs, "HalalSFX Packs");
  packsRoot = nd;
  if (!fs.existsSync(nd) && fs.existsSync(od)) {
    try { fs.renameSync(od, nd); } catch (e) { packsRoot = od; return packsRoot; }
    var inside = function (p) { return p.indexOf(od) === 0 && (p.length === od.length || /[\\\/]/.test(p.charAt(od.length))); };
    var moved = function (p) { return inside(p) ? nd + p.substring(od.length) : p; };
    state.libraries.forEach(function (l) { l.path = moved(l.path); });
    state.favorites = state.favorites.map(moved);
    saveLibraries();
    saveJSON("halalfx_favorites", state.favorites);
    invalidateScan();
  }
  return packsRoot;
}

function installPack() {
  var btn = document.getElementById("packInstallBtn");
  csInterface.evalScript('selectPackFile()', function (result) {
    var zipPath = (result || "").trim();
    if (!zipPath || zipPath === "null" || zipPath === "undefined") return;

    btn.disabled = true;
    setPackStatus("Installing…", "");

    try {
      var fs = require("fs");
      var path = require("path");

      var packName = path.basename(zipPath, path.extname(zipPath));
      var destDir = path.join(getPacksRootDir(), packName);
      var destRoot = path.resolve(destDir) + path.sep;

      var zipData = fs.readFileSync(zipPath);

      JSZip.loadAsync(zipData).then(function (zip) {
        var entries = Object.keys(zip.files);
        var writeNext = function (i) {
          if (i >= entries.length) {
            hsMkdirp(destDir); // in case the zip had zero folder entries
            invalidateScan();
            var already = state.libraries.some(function (l) { return l.path === destDir; });
            if (!already) {
              state.libraries.push({ id: "lib_" + Date.now(), name: packName, path: destDir });
              saveLibraries();
            }
            renderTree();
            btn.disabled = false;
            setPackStatus("Installed: " + packName, "success");
            return;
          }
          var entryName = entries[i];
          var entry = zip.files[entryName];
          var outPath = path.join(destDir, entryName);
          // never write outside the pack folder (an entry like ..\\..\\x would otherwise escape it)
          if ((path.resolve(outPath) + path.sep).indexOf(destRoot) !== 0) {
            return writeNext(i + 1);
          }
          if (entry.dir) {
            hsMkdirp(outPath);
            writeNext(i + 1);
          } else {
            entry.async("nodebuffer").then(function (content) {
              hsMkdirp(path.dirname(outPath));
              fs.writeFileSync(outPath, content);
              writeNext(i + 1);
            }).catch(function (err) {
              btn.disabled = false;
              setPackStatus("Failed to extract " + entryName, "error");
            });
          }
        };
        writeNext(0);
      }).catch(function (err) {
        btn.disabled = false;
        setPackStatus("This file isn't a valid pack (zip).", "error");
      });
    } catch (e) {
      btn.disabled = false;
      setPackStatus("Install failed: " + e.message, "error");
    }
  });
}

/* ---------- tabs ---------- */
function setActiveTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tabBtn").forEach(function (b) {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.getElementById("searchBar").style.display = tab === "search" ? "flex" : "none";
  renderActiveTab();
}
document.querySelectorAll(".tabBtn").forEach(function (b) {
  b.addEventListener("click", function () { setActiveTab(b.dataset.tab); });
});
var searchTimer = null;
document.getElementById("searchInput").addEventListener("input", function () {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function () { if (state.activeTab === "search") renderActiveTab(); }, 150);
});

/* ---------- view mode toggle ---------- */
function applyViewButtons() {
  document.querySelectorAll(".viewBtn").forEach(function (b) {
    b.classList.toggle("active", b.dataset.view === state.viewMode);
  });
}
document.querySelector('[data-view="list"]').innerHTML = '<span class="icon-mask ic-list-view"></span>';
document.querySelector('[data-view="large"]').innerHTML = '<span class="icon-mask ic-large-view"></span>';
document.querySelector('[data-view="small"]').innerHTML = '<span class="icon-mask ic-small-view"></span>';
document.querySelectorAll(".viewBtn").forEach(function (b) {
  b.addEventListener("click", function () {
    state.viewMode = b.dataset.view;
    localStorage.setItem("halalfx_view", state.viewMode);
    applyViewButtons();
    renderActiveTab();
  });
});

/* ---------- sidebar resize handle ---------- */
(function () {
  var sidebar = document.getElementById("sidebar");
  var resizer = document.getElementById("sidebarResizer");
  if (!sidebar || !resizer) return;

  var MIN_WIDTH = 120;
  var MAX_WIDTH = 340;

  var savedWidth = parseInt(localStorage.getItem("halalfx_sidebar_width"), 10);
  if (savedWidth && savedWidth >= MIN_WIDTH && savedWidth <= MAX_WIDTH) {
    sidebar.style.width = savedWidth + "px";
  }

  var dragging = false;
  var startX = 0;
  var startWidth = 0;

  resizer.addEventListener("mousedown", function (e) {
    dragging = true;
    startX = e.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    resizer.classList.add("dragging");
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    var newWidth = startWidth + (e.clientX - startX);
    newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
    sidebar.style.width = newWidth + "px";
  });

  document.addEventListener("mouseup", function () {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    document.body.style.userSelect = "";
    localStorage.setItem("halalfx_sidebar_width", Math.round(sidebar.getBoundingClientRect().width));
  });
})();

/* ---------- init ---------- */
try { getPacksRootDir(); } catch (e) {}   // moves an old "HalalSFX Packs" folder before the first render
applyViewButtons();
renderTree();
renderActiveTab();