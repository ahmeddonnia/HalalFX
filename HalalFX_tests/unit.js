/* HalalFX unit tests (Node, no packages needed).   Usage:  node unit.js [path-to-HalalFX-folder]  */
const vm = require("vm"), fs = require("fs"), path = require("path"), os = require("os"), http = require("http"), crypto = require("crypto"), assert = require("assert");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, "..", "HalalFX"));
const JSZipLib = require(path.join(ROOT, "client", "jszip.min.js"));
let pass = 0, failed = 0;
async function ok(name, fn) { try { await fn(); pass++; console.log("  ok   " + name); } catch (e) { failed++; console.log("  FAIL " + name + "\n         " + (e && e.message || e)); } }
const mk = p => fs.mkdtempSync(path.join(os.tmpdir(), p));
const j = x => JSON.stringify(x);

/* A fresh copy of common.js running against its own fake CEP + localStorage + AppData folder. */
function loadCommon(opts = {}) {
  const store = Object.assign({}, opts.store || {});
  const userData = opts.userData || mk("hfx-ud-"), ext = opts.ext || mk("hfx-ext-");
  const ctx = {
    require, Buffer, console, setTimeout, clearTimeout, JSZip: JSZipLib, store, userData, ext,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
      key: i => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } },
    SystemPath: { EXTENSION: "extension", USER_DATA: "userData" },
    document: { createElement: () => ({}), head: { appendChild() {} } },
    CSInterface: function () { this.getSystemPath = t => (t === "extension" ? ext : userData); this.evalScript = (c, cb) => cb(ctx.__reply); },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "client", "common.js"), "utf8"), ctx);
  ctx.run = c => vm.runInContext(c, ctx);
  return ctx;
}
const ctx = loadCommon();
const run = ctx.run;

(async () => {
console.log("settings");
await ok("loadJSON: fallback when nothing is stored", () => assert.strictEqual(j(run('loadJSON("k1",{a:1})')), '{"a":1}'));
await ok("loadJSON: new defaults are merged into old stored settings", () => {
  ctx.store.k2 = j({ thr: -40 });
  assert.strictEqual(j(run('loadJSON("k2",{thr:-35,jump:true})')), '{"thr":-40,"jump":true}');
});
await ok("loadJSON: nested objects merge too", () => {
  ctx.store.k3 = j({ words: { en: "um" } });
  assert.strictEqual(run('loadJSON("k3",{words:{en:"x",ar:"y"}}).words.ar'), "y");
  assert.strictEqual(run('loadJSON("k3",{words:{en:"x",ar:"y"}}).words.en'), "um");
});
await ok("loadJSON: arrays and corrupt values", () => {
  ctx.store.k4 = "{not json"; assert.strictEqual(j(run('loadJSON("k4",[])')), "[]");
  ctx.store.k5 = j({ x: 1 }); assert.strictEqual(j(run('loadJSON("k5",[])')), "[]");
  ctx.store.k6 = j(["a"]); assert.strictEqual(j(run('loadJSON("k6",[])')), '["a"]');
});
await ok("saveJSON never throws", () => { const c = loadCommon(); c.localStorage.setItem = () => { throw new Error("quota"); }; c.run('saveJSON("z",{a:1})'); });

console.log("files");
await ok("fileUrl: windows path with # ? % and spaces", () => assert.strictEqual(run('fileUrl("C:\\\\SFX\\\\My #1 100%?.mp3")'), "file:///C:/SFX/My%20%231%20100%25%3F.mp3"));
await ok("fileUrl: posix and UNC paths", () => {
  assert.strictEqual(run('fileUrl("/Users/a b/x.wav")'), "file:///Users/a%20b/x.wav");
  assert.strictEqual(run('fileUrl("\\\\\\\\srv\\\\share\\\\a.wav")'), "file://srv/share/a.wav");
});
await ok("hsMkdirp creates nested folders (no {recursive} needed)", () => {
  ctx.__d = path.join(mk("hfx-"), "a", "b", "c"); run("hsMkdirp(__d)"); assert(fs.statSync(ctx.__d).isDirectory()); run("hsMkdirp(__d)");
});
await ok("hsWriteWav -> hsReadPcm round trip", () => {
  ctx.__pcm = new Int16Array([0, 1000, -1000, 32767, -32768, 5]); ctx.__f = path.join(mk("hfx-"), "t.wav");
  run("hsWriteWav(__pcm, __f)"); assert.strictEqual(j(Array.from(run("hsReadPcm(__f)"))), j(Array.from(ctx.__pcm)));
});
await ok("hsReadPcm: extra LIST chunk before data, and empty data", () => {
  const pcm = Buffer.from(new Int16Array([7, 8, 9]).buffer), list = Buffer.from("LIST\x04\x00\x00\x00abcd", "binary");
  const hdr = Buffer.alloc(36); hdr.write("RIFF", 0); hdr.write("WAVEfmt ", 8); hdr.writeUInt32LE(16, 16);
  const dh = Buffer.alloc(8); dh.write("data", 0); dh.writeUInt32LE(pcm.length, 4); const d = mk("hfx-");
  ctx.__f = path.join(d, "l.wav"); fs.writeFileSync(ctx.__f, Buffer.concat([hdr, list, dh, pcm])); assert.strictEqual(j(Array.from(run("hsReadPcm(__f)"))), "[7,8,9]");
  ctx.__f = path.join(d, "e.wav"); fs.writeFileSync(ctx.__f, hdr); assert.strictEqual(run("hsReadPcm(__f)").length, 0);
});
await ok("hsWhisperWords joins tokens and drops [BLANK_AUDIO]", () => {
  ctx.__j = { transcription: [{ text: " Hel", offsets: { from: 0, to: 200 } }, { text: "lo", offsets: { from: 200, to: 400 } },
    { text: " [BLANK_AUDIO]", offsets: { from: 400, to: 900 } }, { text: " um", offsets: { from: 900, to: 1100 } }] };
  const w = run("hsWhisperWords(__j)"); assert.strictEqual(j(w.map(x => x.t)), '["Hello","um"]'); assert.strictEqual(w[0].e, 0.4);
});

console.log("ffmpeg lookup");
const exeName = os.platform() === "win32" ? "ffmpeg.exe" : "ffmpeg", platDir = os.platform() === "win32" ? "win" : "mac";
await ok("hsFindFfmpeg: null when it is nowhere", () => { const c = loadCommon(), old = process.env.PATH; process.env.PATH = path.join(os.tmpdir(), "nonexistent-dir"); assert.strictEqual(c.run("hsFindFfmpeg()"), null); process.env.PATH = old; });
await ok("hsFindFfmpeg: finds the copy bundled in client/bin/<os>", () => {
  const c = loadCommon(), d = path.join(c.ext, "client", "bin", platDir); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, exeName), "x");
  assert.strictEqual(c.run("hsFindFfmpeg()"), path.join(d, exeName));
});
await ok("hsFindFfmpeg: finds the copy in AppData\\HalalFX\\ffmpeg", () => {
  const c = loadCommon(), d = path.join(c.userData, "HalalFX", "ffmpeg"); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, exeName), "x");
  assert.strictEqual(c.run("hsFindFfmpeg()"), path.join(d, exeName));
});
if (os.platform() !== "win32") await ok("hsFindFfmpeg: falls back to PATH", () => {
  const c = loadCommon(), dir = mk("hfx-fake-"); fs.writeFileSync(path.join(dir, "ffmpeg"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const old = process.env.PATH; process.env.PATH = dir; assert.strictEqual(c.run("hsFindFfmpeg()"), "ffmpeg"); process.env.PATH = old;
});
await ok("hsEval wraps non-JSON replies in { error }", () => {
  let got; ctx.__cb = o => { got = o; }; ctx.__reply = "EvalScript error."; run("hsEval('x()', __cb)"); assert(/Unexpected reply/.test(got.error));
  ctx.__reply = '{"ok":true}'; run("hsEval('x()', __cb)"); assert.strictEqual(got.ok, true);
});

console.log("old-name migration");
await ok("halalsfx_* settings move to halalfx_*; existing new keys win", () => {
  const c = loadCommon({ store: { halalsfx_libraries: '[{"id":"a"}]', halalsfx_volume: "0.3", halalfx_view: "large", halalsfx_view_old: "x" } });
  assert.strictEqual(c.store.halalfx_libraries, '[{"id":"a"}]'); assert.strictEqual(c.store.halalfx_volume, "0.3");
  assert.strictEqual(c.store.halalfx_view, "large");
  assert(!Object.keys(c.store).some(k => k.indexOf("halalsfx_") === 0), "old keys left: " + Object.keys(c.store));
  const c2 = loadCommon({ store: { halalsfx_view: "list", halalfx_view: "small" } }); assert.strictEqual(c2.store.halalfx_view, "small");
});
await ok("AppData\\HalalSFX is renamed to HalalFX with the models inside intact", () => {
  const ud = mk("hfx-ud-"), m = path.join(ud, "HalalSFX", "models"); fs.mkdirSync(m, { recursive: true }); fs.writeFileSync(path.join(m, "ggml-small.en.bin"), "MODEL");
  const c = loadCommon({ userData: ud });
  assert(!fs.existsSync(path.join(ud, "HalalSFX"))); assert.strictEqual(fs.readFileSync(path.join(ud, "HalalFX", "models", "ggml-small.en.bin"), "utf8"), "MODEL");
  assert.strictEqual(c.run("HS_MODELS_DIR"), path.join(ud, "HalalFX", "models"));
});
await ok("if both folders exist nothing is overwritten", () => {
  const ud = mk("hfx-ud-"); fs.mkdirSync(path.join(ud, "HalalSFX"), { recursive: true }); fs.mkdirSync(path.join(ud, "HalalFX"), { recursive: true }); fs.writeFileSync(path.join(ud, "HalalSFX", "keep.txt"), "x");
  const c = loadCommon({ userData: ud }); assert(fs.existsSync(path.join(ud, "HalalSFX", "keep.txt"))); assert.strictEqual(c.run("HS_APP_DIR"), path.join(ud, "HalalFX"));
});

/* ---------------- downloads (local HTTP server) ---------------- */
const files = {};
async function zipOf(entries) { const z = new JSZipLib(); Object.keys(entries).forEach(n => z.file(n, entries[n])); return z.generateAsync({ type: "nodebuffer" }); }
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const FAKE = "#!/bin/sh\nexit 0\n";
files.good = await zipOf({ "ffmpeg-7.0-essentials_build/bin/ffmpeg.exe": FAKE, "ffmpeg-7.0-essentials_build/bin/ffprobe.exe": "p", "ffmpeg-7.0-essentials_build/README.txt": "r" });
files.noexe = await zipOf({ "x/readme.txt": "hi" });
const big = crypto.randomBytes(200000);
let slowSockets = [];
const server = http.createServer((req, res) => {
  const u = req.url;
  const send = (b, code = 200) => { res.writeHead(code, { "Content-Length": b.length }); res.end(b); };
  if (u === "/good.zip") return send(files.good);
  if (u === "/good.zip.sha256") return send(Buffer.from(sha(files.good) + " *ffmpeg-release-essentials.zip\n"));
  if (u === "/badsum.zip") return send(files.good);
  if (u === "/badsum.zip.sha256") return send(Buffer.from("0".repeat(64)));
  if (u === "/nohash.zip") return send(files.good);
  if (u === "/noexe.zip") return send(files.noexe);
  if (u === "/noexe.zip.sha256") return send(Buffer.from(sha(files.noexe)));
  if (u === "/redir") { res.writeHead(302, { Location: "/big.bin" }); return res.end(); }
  if (u === "/big.bin") return send(big);
  if (u === "/short.bin") { res.writeHead(200, { "Content-Length": 100000 }); res.write(Buffer.alloc(1000)); return setTimeout(() => res.socket.destroy(), 30); }
  if (u === "/slow.bin") { res.writeHead(200, { "Content-Length": 1000000 }); res.write(Buffer.alloc(1000)); slowSockets.push(res.socket); return; }
  send(Buffer.from("nope"), 404);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port;
const P = (fn, ...a) => new Promise(r => { ctx.__a = a; ctx.__r = (e, v) => r([e, v]); run(fn + "(" + a.map((_, i) => "__a[" + i + "]").join(",") + ", __r)"); });

console.log("downloads");
await ok("hsDownload: saves the file, follows a redirect, reports progress, leaves no .part", async () => {
  const dest = path.join(mk("hfx-dl-"), "out.bin"); let last = 0, total = 0; ctx.__p = (g, t) => { last = g; total = t; };
  const [e] = await new Promise(r => { ctx.__r = (e, v) => r([e, v]); run('hsDownload("' + BASE + '/redir", ' + j(dest) + ', __p, __r)'); });
  assert(!e, e && e.message); assert(fs.readFileSync(dest).equals(big)); assert.strictEqual(last, big.length); assert.strictEqual(total, big.length); assert(!fs.existsSync(dest + ".part"));
});
await ok("hsDownload: HTTP 404 is an error and leaves nothing behind", async () => {
  const dest = path.join(mk("hfx-dl-"), "o.bin"); const [e] = await new Promise(r => { ctx.__r = (e) => r([e]); run('hsDownload("' + BASE + '/missing", ' + j(dest) + ', null, __r)'); });
  assert(e && /404/.test(e.message)); assert(!fs.existsSync(dest)); assert(!fs.existsSync(dest + ".part"));
});
await ok("hsDownload: a download cut short is an error (no half file kept)", async () => {
  const dest = path.join(mk("hfx-dl-"), "o.bin"); const [e] = await new Promise(r => { ctx.__r = (e) => r([e]); run('hsDownload("' + BASE + '/short.bin", ' + j(dest) + ', null, __r)'); });
  assert(e, "expected an error"); assert(!fs.existsSync(dest)); assert(!fs.existsSync(dest + ".part"));
});
await ok("hsDownload: cancel gives Error('Cancelled') and cleans up", async () => {
  const dest = path.join(mk("hfx-dl-"), "o.bin"); let h;
  const pr = new Promise(r => { ctx.__r = (e) => r(e); ctx.__p = (g) => { if (g > 0 && h) { h.cancel(); h = null; } }; });
  ctx.__h = null; run('__h = hsDownload("' + BASE + '/slow.bin", ' + j(dest) + ', __p, __r)'); h = ctx.__h;
  const e = await pr; slowSockets.forEach(s => s.destroy()); assert(e && e.message === "Cancelled"); assert(!fs.existsSync(dest + ".part"));
});

console.log("ffmpeg installer");
const install = (c, url, platform) => new Promise(r => { const phases = []; c.__o = { url, platform: platform || "win32" }; c.__p = ph => { if (phases[phases.length - 1] !== ph) phases.push(ph); }; c.__r = (e, v) => r({ e, v, phases }); c.run("hsInstallFfmpeg(__o, __p, __r)"); });
const winOnly = os.platform() === "win32" ? "(skipped on Windows: the fake ffmpeg is a shell script)" : "";
if (!winOnly) await ok("installs ffmpeg.exe into AppData\\HalalFX\\ffmpeg after checking the checksum", async () => {
  const c = loadCommon(), r = await install(c, BASE + "/good.zip");
  assert(!r.e, r.e && r.e.message); const dest = path.join(c.userData, "HalalFX", "ffmpeg", "ffmpeg.exe");
  assert.strictEqual(r.v, dest); assert.strictEqual(fs.readFileSync(dest, "utf8"), FAKE); assert.strictEqual(c.run("hsFindFfmpeg()"), dest);
  assert.strictEqual(j(r.phases), '["download","verify","unpack"]');
  assert(!fs.existsSync(path.join(c.userData, "HalalFX", "ffmpeg", "ffprobe.exe")), "only ffmpeg.exe is extracted");
  assert(!fs.readdirSync(path.join(c.userData, "HalalFX", "ffmpeg")).some(n => /\.part$/.test(n)));
});
await ok("a wrong checksum installs nothing", async () => {
  const c = loadCommon(), r = await install(c, BASE + "/badsum.zip"); assert(r.e && /checksum/i.test(r.e.message), r.e && r.e.message);
  assert(!fs.existsSync(path.join(c.userData, "HalalFX", "ffmpeg", "ffmpeg.exe")));
});
await ok("a missing checksum file installs nothing", async () => {
  const c = loadCommon(), r = await install(c, BASE + "/nohash.zip"); assert(r.e && /checksum/i.test(r.e.message), r.e && r.e.message);
  assert(!fs.existsSync(path.join(c.userData, "HalalFX", "ffmpeg", "ffmpeg.exe")));
});
await ok("a zip without ffmpeg.exe is reported clearly", async () => {
  const c = loadCommon(), r = await install(c, BASE + "/noexe.zip"); assert(r.e && /ffmpeg\.exe was not found/.test(r.e.message), r.e && r.e.message);
});
await ok("a failed download is reported as 'Download failed'", async () => {
  const c = loadCommon(), r = await install(c, BASE + "/missing"); assert(r.e && /Download failed/.test(r.e.message));
});
await ok("non-Windows is refused with a clear message", async () => {
  const c = loadCommon(), r = await install(c, BASE + "/good.zip", "darwin"); assert(r.e && /Windows only/.test(r.e.message));
});
await ok("cancelling during the download leaves nothing behind", async () => {
  const c = loadCommon(); let h; const out = new Promise(r => { c.__r = (e) => r(e); c.__p = (ph, g) => { if (g > 0 && h) { h.cancel(); h = null; } }; });
  c.__o = { url: BASE + "/slow.bin", platform: "win32" }; c.run("__h = hsInstallFfmpeg(__o, __p, __r)"); h = c.__h; const e = await out; slowSockets.forEach(s => s.destroy());
  assert(e && e.message === "Cancelled"); assert(!fs.existsSync(path.join(c.userData, "HalalFX", "ffmpeg", "ffmpeg.exe")));
});

server.close(); slowSockets.forEach(s => s.destroy());

/* ---------------- host.jsx ---------------- */
console.log("host.jsx");
const hctx = {}; vm.createContext(hctx); vm.runInContext(fs.readFileSync(path.join(ROOT, "host", "host.jsx"), "utf8"), hctx);
await ok("hsEsc output is always valid JSON text", () => {
  for (const s of ["plain", 'a"b', "back\\slash", "tab\there", "line\r\nbreak", 'C:\\Users\\"x"\\a\tb']) { hctx.__s = s; JSON.parse(vm.runInContext("'{\"v\":\"' + hsEsc(__s) + '\"}'", hctx)); }
});
await ok("cpJson round-trips tricky strings", () => {
  hctx.__o = j({ clips: [{ path: 'C:\\a\\"b".mp4', name: "x\ty\nz", n: 1.5, f: false, nul: null, arr: [1, "a"] }] });
  const back = JSON.parse(vm.runInContext("cpJson(JSON.parse(__o))", hctx)); assert.strictEqual(back.clips[0].path, 'C:\\a\\"b".mp4'); assert.strictEqual(j(back.clips[0].arr), '[1,"a"]');
});
await ok("Gaps: markers from older versions are cleaned up; new ones are named 'HalalFX gap'", () => {
  const list = [{ comments: "HalalSFX gap", name: "Black" }, { comments: "HalalFX gap" }, { comments: "my own marker" }];
  hctx.app = { project: { activeSequence: { markers: {
    getFirstMarker: () => list[0] || null, getNextMarker: m => list[list.indexOf(m) + 1] || null,
    deleteMarker: m => { list.splice(list.indexOf(m), 1); }, createMarker: t => { const mk = { start: t }; list.push(mk); return mk; } } } } };
  hctx.__p = j({ gaps: [{ s: 1, e: 2 }] }); JSON.parse(vm.runInContext("gpMarkers(__p)", hctx));
  assert.strictEqual(j(list.map(m => m.comments)), '["my own marker","HalalFX gap"]');
});

console.log("\n" + pass + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
})();
