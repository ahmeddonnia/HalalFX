"""HalalFX UI tests: runs the panel in a real Chromium with a fake Premiere/CEP and fake Node modules.
Needs:  pip install playwright && playwright install chromium
Usage:  python ui_test.py [path-to-HalalFX-folder]
"""
import json, os, pathlib, shutil, struct, math, sys, tempfile, wave
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / "HalalFX").resolve()
TMP = pathlib.Path(tempfile.mkdtemp(prefix="hfx_ui_"))
norm = lambda p: str(p).replace("\\", "/")
LIB = norm(TMP / "Lib"); HOME = norm(TMP / "home")

def make_wav(p, sec=0.3):
    p.parent.mkdir(parents=True, exist_ok=True)
    w = wave.open(str(p), "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
    w.writeframes(b"".join(struct.pack("<h", int(8000 * math.sin(i / 10))) for i in range(int(16000 * sec)))); w.close()
def touch(p, data=b"x"):
    p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(data)

# ---- fixtures: audio of several formats, plus files that must NOT be listed ----
L = TMP / "Lib"
make_wav(L / "Whoosh/a.wav"); make_wav(L / "Whoosh/weird #1 100%.wav"); make_wav(L / "Impacts/Deep/c.wav")
for n in ["b.mp3", "y.m4a", "x.aiff", "z.wma"]: touch(L / "Whoosh" / n, b"not really audio")
for n in ["t.flac", "t.ogg", "notes.txt", "desktop.ini"]: touch(L / "Whoosh" / n)
touch(L / "readme.txt"); touch(L / ".DS_Store"); (L / "Impacts/Light").mkdir(parents=True, exist_ok=True)
# an old-version packs folder for the migration test
make_wav(TMP / "home/Documents/HalalSFX Packs/MyPack/a.wav")

def scan(p, out):
    p = pathlib.Path(p)
    if p.is_dir():
        out[norm(p)] = {"d": sorted(os.listdir(p))}
        for n in os.listdir(p): scan(p / n, out)
    else: out[norm(p)] = {"f": 1}

def shim(seed):
    fs_map = {}; scan(TMP, fs_map)
    return """
(function(){
  var FS = %s, LOG = [], SEED = %s;
  window.__FS = FS; window.__log = LOG; window.__host = {};
  Object.keys(SEED).forEach(function(k){ if (localStorage.getItem("__seeded") === null) localStorage.setItem(k, SEED[k]); }); localStorage.setItem("__seeded", "1");
  function parent(p){ return p.replace(/\\/[^\\/]*$/, ""); }
  function leaf(p){ return p.split("/").pop(); }
  window.__addFile = function(p){ FS[p] = { f: 1 }; var d = FS[parent(p)]; if (d && d.d.indexOf(leaf(p)) < 0) d.d.push(leaf(p)); };
  var fsShim = {
    existsSync: function(p){ return !!FS[p]; },
    statSync: function(p){ var e = FS[p]; if(!e){ var er = new Error("ENOENT"); er.code="ENOENT"; throw er; } return { isDirectory: function(){ return !!e.d; }, isFile: function(){ return !e.d; } }; },
    readdirSync: function(p){ return FS[p] && FS[p].d || []; },
    renameSync: function(a, b){ if(!FS[a]) throw new Error("ENOENT");
      Object.keys(FS).forEach(function(k){ if (k === a || k.indexOf(a + "/") === 0) { FS[b + k.substring(a.length)] = FS[k]; delete FS[k]; } });
      var pa = FS[parent(a)], pb = FS[parent(b)]; if (pa) pa.d.splice(pa.d.indexOf(leaf(a)), 1); if (pb && pb.d.indexOf(leaf(b)) < 0) pb.d.push(leaf(b)); },
    mkdirSync: function(){}, writeFileSync: function(){}, unlinkSync: function(){}, readFileSync: function(){ return new Uint8Array(0); }
  };
  var pathShim = { sep: "/", join: function(){ return Array.prototype.slice.call(arguments).join("/").replace(/\\/+/g,"/"); },
    resolve: function(){ return Array.prototype.slice.call(arguments).join("/").replace(/\\/+/g,"/"); },
    dirname: function(p){ return parent(p) || "/"; }, basename: function(p,e){ var b=leaf(p); return e && b.slice(-e.length)===e ? b.slice(0,-e.length) : b; },
    extname: function(p){ var m=/\\.[^.\\/]*$/.exec(p); return m?m[0]:""; } };
  function proc(){ var o = { stdout:{on:function(){}}, stderr:{on:function(){}}, stdin:{end:function(){}}, kill:function(){},
    on:function(ev,cb){ if(ev==="error") setTimeout(function(){ cb(new Error("spawn ENOENT")); },0); return o; } }; return o; }
  var cpShim = { execSync: function(){ return "%s\\n"; }, spawnSync: function(){ return { status: 1 }; }, spawn: proc, exec: function(c,o,cb){ cb(null,""); }, execFile: function(a,b,c,cb){ cb(new Error("x")); } };
  var osShim = { platform: function(){ return "win32"; }, homedir: function(){ return "%s"; }, tmpdir: function(){ return "/tmp"; }, cpus: function(){ return [1,2,3,4]; } };
  window.require = function(m){ if(m==="fs") return fsShim; if(m==="path") return pathShim; if(m==="child_process") return cpShim; if(m==="os") return osShim; if(m==="https"||m==="url"||m==="http"||m==="crypto") return {}; throw new Error("no module "+m); };
  window.cep = { fs: { readdir: function(p){ var e = FS[p]; return e && e.d ? { err: 0, data: e.d.slice() } : { err: 1 }; } } };
  window.__adobe_cep__ = {
    getHostEnvironment: function(){ return '{"appName":"PPRO"}'; }, getSystemPath: function(t){ return "%s/ext"; },
    evalScript: function(s, cb){ LOG.push("eval:" + s.slice(0,40)); var h = window.__host[s.split("(")[0]]; setTimeout(function(){ cb(h ? (typeof h === "function" ? h(s) : h) : "EvalScript error."); }, 40); },
    getCurrentApiVersion: function(){ return '{"major":7,"minor":0,"micro":0}'; }, addEventListener: function(){}, dispatchEvent: function(){}, getExtensionId: function(){ return "x"; }
  };
  window.addEventListener("unhandledrejection", function(e){ LOG.push("UNHANDLED:" + (e.reason && e.reason.message || e.reason)); });
})();
""" % (json.dumps(fs_map), json.dumps(seed), LIB, HOME, norm(TMP))

results = []
def check(name, cond, extra=""):
    results.append(bool(cond)); print(("  ok   " if cond else "  FAIL ") + name + ((" -> " + str(extra)[:300]) if (extra and not cond) else ""))

def open_page(browser, seed):
    pg = browser.new_context(viewport={"width": 460, "height": 640}).new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console." + m.type + ": " + m.text) if m.type == "error" and "Failed to load resource" not in m.text and "blocked by CORS policy" not in m.text else None)
    pg.add_init_script(shim(seed))
    pg.goto((ROOT / "client" / "index.html").as_uri()); pg.wait_for_timeout(400)
    return pg, errors

with sync_playwright() as p:
    b = p.chromium.launch()

    # ======================= upgrade from the old names =======================
    print("== upgrade from the old names")
    old_packs = HOME + "/Documents/HalalSFX Packs/MyPack"
    pg, errors = open_page(b, {"halalsfx_libraries": json.dumps([{"id": "lib_1", "name": "MyPack", "path": old_packs}]),
                               "halalsfx_favorites": json.dumps([old_packs + "/a.wav"]), "halalsfx_volume": "0.3", "halalsfx_view": "large"})
    check("loads without script errors", not errors, errors)
    keys = pg.evaluate("Object.keys(localStorage)")
    check("old halalsfx_* settings were moved to halalfx_*", not [k for k in keys if k.startswith("halalsfx_")] and "halalfx_libraries" in keys, keys)
    libs = pg.evaluate("JSON.parse(localStorage.getItem('halalfx_libraries'))")
    check("the library now points into 'HalalFX Packs'", libs[0]["path"] == HOME + "/Documents/HalalFX Packs/MyPack", libs)
    check("favorites were re-pointed too", pg.evaluate("JSON.parse(localStorage.getItem('halalfx_favorites'))[0]") == HOME + "/Documents/HalalFX Packs/MyPack/a.wav")
    check("the packs folder itself was renamed", pg.evaluate("!!window.__FS[%s] && !window.__FS[%s]" % (json.dumps(HOME + "/Documents/HalalFX Packs"), json.dumps(HOME + "/Documents/HalalSFX Packs"))))
    pg.click('.homeCard[data-id="sfx"]'); pg.wait_for_timeout(150)
    check("the moved library still lists its files (count 1)", pg.locator("#tree .node.root .count").inner_text() == "1")
    check("saved volume (0.3) and view mode survived the rename", pg.evaluate("document.getElementById('volSlider').value") == "0.3" and pg.evaluate("localStorage.getItem('halalfx_view')") == "large")
    pg.context.close()

    # ======================= normal use =======================
    print("== normal use")
    pg, errors = open_page(b, {})
    check("loads without script errors", not errors, errors)
    check("home shows 5 feature cards", pg.locator(".homeCard").count() == 5)
    pg.click('.homeCard[data-id="sfx"]'); pg.wait_for_timeout(100)
    check("SFX view has exactly its 4 tabs", len([t for t in pg.locator(".tabBtn").all() if t.is_visible()]) == 4 and pg.locator(".tabBtn").count() == 4)
    pg.click("#addLibBtn"); pg.wait_for_timeout(200)
    check("library count = 7 (wav, mp3, m4a, aiff, wma + 2 wavs; no flac/ogg/txt/ini)", pg.locator("#tree .node.root .count").inner_text() == "7", pg.locator("#tree .node.root .count").inner_text())
    pg.click("#tree .node.root .arrow"); pg.wait_for_timeout(100)
    check("sub-folders are only Impacts and Whoosh", [l.inner_text() for l in pg.locator("#tree .children .label").all()] == ["Impacts", "Whoosh"])
    pg.click('#tree .children .node:has-text("Whoosh")'); pg.wait_for_timeout(150)
    names = [t.inner_text() for t in pg.locator("#content .tname").all()]
    check("Whoosh lists the 6 supported formats", sorted(names) == sorted(["a.wav", "b.mp3", "weird #1 100%.wav", "x.aiff", "y.m4a", "z.wma"]), names)
    check("flac / ogg are not listed", not any(n.endswith((".flac", ".ogg")) for n in names))
    pg.locator("#content .track", has_text="a.wav").click(); pg.wait_for_timeout(300)
    pg.locator("#content .track", has_text="y.m4a").click(); pg.wait_for_timeout(600)
    check("a format the panel can't preview is dimmed and not stuck 'playing'", pg.locator(".track.noPreview", has_text="y.m4a").count() == 1 and pg.locator(".track.playing").count() == 0)
    check("that row says it can still be dragged", "drag" in pg.locator(".track.noPreview", has_text="y.m4a").get_attribute("title"))
    check("no unhandled promise rejections", not [l for l in pg.evaluate("window.__log") if l.startswith("UNHANDLED")])
    # refresh
    pg.evaluate("window.__addFile(%s)" % json.dumps(LIB + "/Whoosh/new one.wav"))
    check("a file added outside the panel is not shown yet", pg.locator("#content .tname", has_text="new one").count() == 0)
    pg.click("#refreshBtn"); pg.wait_for_timeout(200)
    check("Refresh button shows it", pg.locator("#content .tname", has_text="new one").count() == 1)
    check("...and updates the library count (8)", pg.locator("#tree .node.root .count").inner_text() == "8")
    pg.evaluate("window.__addFile(%s)" % json.dumps(LIB + "/Whoosh/new two.wav"))
    pg.evaluate("window.dispatchEvent(new Event('focus'))"); pg.wait_for_timeout(200)
    check("coming back to the panel refreshes automatically", pg.locator("#content .tname", has_text="new two").count() == 1)
    pg.evaluate("window.__addFile(%s)" % json.dumps(LIB + "/Whoosh/new three.wav"))
    pg.evaluate("window.dispatchEvent(new Event('focus'))"); pg.wait_for_timeout(200)
    check("...but not more than once every 5 seconds", pg.locator("#content .tname", has_text="new three").count() == 0)
    # favorites / search / volume
    pg.locator("#content .track", has_text="a.wav").locator(".star").click(); pg.click('.tabBtn[data-tab="favorites"]'); pg.wait_for_timeout(100)
    check("favorite appears in Favorites", pg.locator("#content .tname").count() == 1)
    pg.click('.tabBtn[data-tab="search"]'); pg.fill("#searchInput", "c.wav"); pg.wait_for_timeout(400)
    check("search finds c.wav", pg.locator("#content .tname").count() == 1)
    pg.fill("#searchInput", "aiff"); pg.wait_for_timeout(400)
    check("search finds the new formats (x.aiff)", pg.locator("#content .tname").count() == 1)
    pg.evaluate("var s=document.getElementById('volSlider'); s.value=0.4; s.dispatchEvent(new Event('input'))"); pg.click("#volIcon")
    v0 = pg.evaluate("document.getElementById('volSlider').value"); pg.click("#volIcon"); v1 = pg.evaluate("document.getElementById('volSlider').value")
    check("mute -> 0, unmute restores the previous level", v0 == "0" and v1 == "0.4", (v0, v1))
    pg.click('.tabBtn[data-tab="folder"]'); pg.locator("#tree .node.root").click(button="right"); pg.click("#ctxDeleteItem"); pg.wait_for_timeout(100)
    check("library removed via right-click, favorites pruned", pg.locator("#tree .node.root").count() == 0 and pg.evaluate("JSON.parse(localStorage.getItem('halalfx_favorites')).length") == 0)

    # ---- Gaps ----
    pg.click("#fhBack"); pg.wait_for_timeout(50)
    pg.evaluate("""window.__host.gpScan = JSON.stringify({name:'Seq 01',fps:25,video:[[0,2],[3,5]],audio:[]});
                   window.__host.gpMarkers = '{"ok":true,"count":1}'; window.__host.gpGoto = '{"ok":true}';""")
    pg.click('.homeCard[data-id="gaps"]'); pg.wait_for_timeout(100); pg.click("#gpScan"); pg.wait_for_timeout(300)
    check("Gaps: one gap found and listed", pg.inner_text("#gpCount") == "1 gap" and pg.locator(".gpItem").count() == 1)
    pg.evaluate("window.__host.gpScan = JSON.stringify({name:'Seq 01',fps:25,video:[],audio:[]})")
    pg.click("#gpTrack .ddb"); pg.click('#gpTrack .ddi[data-v="V2"]'); pg.click("#gpScan"); pg.wait_for_timeout(300)
    check("Gaps: an empty track says there is nothing to scan", "Nothing to scan" in pg.inner_text("#gpBody"))

    # ---- ffmpeg setup card ----
    print("== ffmpeg setup card")
    pg.evaluate("""
      window.__ffLog = [];
      window.hsInstallFfmpeg = function(opts, onProgress, cb){
        var n = window.__ffN = (window.__ffN === undefined ? 0 : window.__ffN + 1); window.__ffLog.push("start");
        if (n === 0) { onProgress("download", 12*1048576, 86*1048576); return { cancel: function(){ window.__ffLog.push("cancel"); cb(new Error("Cancelled")); } }; }
        if (n === 1) { setTimeout(function(){ cb(new Error("Download failed: boom")); }, 20); return { cancel: function(){} }; }
        setTimeout(function(){ onProgress("verify",0,0); setTimeout(function(){ window.HS_FFMPEG = "/fake/ffmpeg.exe"; cb(null, "/fake/ffmpeg.exe"); }, 30); }, 20); return { cancel: function(){} };
      };
      undefined;""")
    pg.click("#fhBack"); pg.click('.homeCard[data-id="cut"]'); pg.wait_for_timeout(150)
    card = "#cutFfmpeg"
    check("Silence Remover shows the ffmpeg card with a Download button", "ffmpeg is missing" in pg.inner_text(card) and pg.locator(card + " .hsFfGo").count() == 1)
    pg.click(card + " .hsFfGo"); pg.wait_for_timeout(100)
    import re
    check("progress is shown (12.0 / 86.0 MB, 13%) with a Cancel button", re.search(r"12\.0 / 86\.0 MB", pg.inner_text(card)) and "13%" in pg.get_attribute(card + " .hsFfBar i", "style") and pg.locator(card + " .hsFfCancel").count() == 1, pg.inner_text(card))
    pg.click(card + " .hsFfCancel"); pg.wait_for_timeout(100)
    check("Cancel stops the job and returns to the Download button (no error shown)", pg.evaluate("window.__ffLog.indexOf('cancel')") >= 0 and pg.locator(card + " .hsFfGo").count() == 1 and pg.locator(card + " .e").count() == 0)
    pg.click(card + " .hsFfGo"); pg.wait_for_timeout(150)
    check("a failed download shows the reason and 'Try again'", "boom" in pg.inner_text(card) and "Try again" in pg.inner_text(card), pg.inner_text(card))
    pg.click(card + " .hsFfGo"); pg.wait_for_timeout(300)
    check("on success the card disappears", pg.inner_text(card).strip() == "", pg.inner_text(card))
    # Silence remover progress, now that 'ffmpeg exists'
    pg.evaluate("window.__host.flGetClips = JSON.stringify({clips:[{path:'/x/a.mp4',name:'a.mp4',inPoint:0,outPoint:5,start:0,end:5}]})")
    pg.evaluate("window.__tl=[]; var el=document.getElementById('cutStatus'); new MutationObserver(function(){ window.__tl.push([el.textContent, el.className]); }).observe(el,{childList:true,characterData:true,subtree:true,attributes:true}); undefined;")
    pg.click("#cutAnalyze"); pg.wait_for_timeout(500)
    tl = pg.evaluate("window.__tl")
    check("Silence Remover shows progress first ('Reading selection...' with the spinner class)", tl and tl[0] == ["Reading selection...", "busy"], tl)
    check("...then 'Reading audio...' while it works", any(t[0].startswith("Reading audio") and t[1] == "busy" for t in tl), tl)
    check("...and ends on a readable error, not a stuck spinner", tl and tl[-1][1] == "err" and tl[-1][0].strip() != "", tl)
    check("preview jump-cut setting is ON by default (merged defaults)", pg.is_checked("#cutJump"))
    # card in the other tools
    pg.evaluate("window.HS_FFMPEG = null")
    pg.click("#fhBack"); pg.click('.homeCard[data-id="fillers"]'); pg.wait_for_timeout(150)
    check("Filler Words shows the same card", pg.locator("#flFfmpeg .hsFf").count() == 1)
    pg.click("#fhBack"); pg.click('.homeCard[data-id="captions"]'); pg.wait_for_timeout(150)
    check("Captions shows the same card", pg.locator("#cpFfmpeg .hsFf").count() == 1)
    check("Captions: stylesheet has no stray '[object HTMLStyleElement]'", not pg.evaluate("Array.from(document.querySelectorAll('style')).some(s => s.textContent.indexOf('[object') >= 0)"))
    pg.click("#cpLang .ddb"); check("Captions: dropdown opens", pg.locator("#cpLang.open").count() == 1)
    pg.click("#fhBack"); pg.click('.homeCard[data-id="fillers"]'); pg.wait_for_timeout(100); pg.click("#flGo"); pg.wait_for_timeout(150)
    check("Fillers: asks for the speech engine first", "speech engine" in pg.inner_text("#flStatus"), pg.inner_text("#flStatus"))

    # ---- icons ----
    pg.click("#fhBack"); pg.wait_for_timeout(500)
    check("missing icon files fall back to built-in icons (incl. the new Refresh icon)",
          "data:image/svg+xml" in pg.evaluate("getComputedStyle(document.querySelector('.homeCard .icon-mask')).webkitMaskImage") and
          pg.evaluate("Array.from(document.querySelectorAll('style')).some(s => s.textContent.indexOf('.ic-refresh') === 0 && s.textContent.indexOf('data:image/svg+xml') > 0)"))
    check("no script errors during the whole run", not errors, errors)
    b.close()

shutil.rmtree(TMP, ignore_errors=True)
bad = results.count(False)
print("\n%d/%d passed" % (len(results) - bad, len(results)))
sys.exit(1 if bad else 0)
