// Runs inside Premiere Pro's ExtendScript engine.

// Fallback used by main.js if Node.js / PowerShell aren't available for
// any reason: the classic ExtendScript folder dialog (old Windows style).
function selectSFXFolderClassic() {
    var folder = Folder.selectDialog("Choose the folder that contains your SFX files");
    if (folder) return folder.fsName;
    return "";
}

// Opens a native file picker restricted to .hsfx (pack) files, for installing
// a downloaded SFX pack.
function selectPackFile() {
    var file = File.openDialog("Select a Pack file", "*.hsfx");
    if (file) return file.fsName;
    return "";
}

/* ================= Silence cutter ================= */
var HS_TICKS = 254016000000;

// Makes a text safe to put inside a JSON string that is built by hand (quotes, backslashes and control characters).
function hsEsc(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\x00-\x1f]+/g, " ");
}

// ---- audio sources behind a timeline item (a nested sequence is opened up and mapped onto the outer timeline) ----
function hsSequenceOf(pi) {
    var i, sq;
    for (i = 0; i < app.project.sequences.numSequences; i++) {
        sq = app.project.sequences[i];
        if (sq.projectItem && sq.projectItem.nodeId === pi.nodeId) return sq;
    }
    return null;
}
// Pushes {path,name,inPoint,outPoint,start,end} (seconds, start/end on the timeline that holds `item`) for every media file under it.
function hsSourcesOf(item, out, depth) {
    var pi = item.projectItem, path = "", t, n, k, c, x, sub, inner, nin, nout, ns, s, e, tr;
    if (!pi) return;
    try { path = pi.getMediaPath(); } catch (e1) {}
    if (path) {
        out.push({ path: path, name: item.name, inPoint: item.inPoint.seconds, outPoint: item.outPoint.seconds, start: item.start.seconds, end: item.end.seconds });
        return;
    }
    if (depth > 5) return;
    inner = hsSequenceOf(pi);
    if (!inner) return;
    nin = item.inPoint.seconds; nout = item.outPoint.seconds; ns = item.start.seconds;
    for (t = 0; t < inner.audioTracks.numTracks; t++) {
        tr = inner.audioTracks[t];
        try { if (tr.isMuted()) continue; } catch (e2) {}
        for (n = 0; n < tr.clips.numItems; n++) {
            c = tr.clips[n];
            sub = [];
            hsSourcesOf(c, sub, depth + 1);
            for (k = 0; k < sub.length; k++) {
                x = sub[k];
                s = Math.max(x.start, nin); e = Math.min(x.end, nout);
                if (e <= s) continue;
                x.inPoint = x.inPoint + (s - x.start);
                x.outPoint = x.inPoint + (e - s);
                x.start = ns + (s - nin);
                x.end = ns + (e - nin);
                out.push(x);
            }
        }
    }
}

// payload: {silences:[{s,e}] (sequence seconds, ascending), cut:bool, markers:bool, backup:bool, label?:marker name (default "Silence")}
function hsApplyCuts(payloadStr) {
    try {
        var p = eval("(" + payloadStr + ")");
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"No active sequence."}';
        var sil = p.silences;
        var t0 = new Date().getTime();
        var i, k, t;

        if (!p.cut && !p.markers) return '{"error":"Select at least one action."}';

        if (!p.cut) {
            for (i = 0; i < sil.length; i++) {
                var m = seq.markers.createMarker(sil[i].s);
                m.name = p.label || "Silence";
                try { m.end = sil[i].e; } catch (e1) {
                    try { var te = new Time(); te.seconds = sil[i].e; m.end = te; } catch (e2) {}
                }
            }
            return '{"ok":true,"count":' + sil.length + ',"ms":' + (new Date().getTime() - t0) + '}';
        }

        var origId = seq.sequenceID;
        if (p.backup) {
            var nBefore = -1, nAfter = -1;
            try { nBefore = app.project.sequences.numSequences; } catch (en0) {}
            try { seq.clone(); } catch (eb) {}
            try { nAfter = app.project.sequences.numSequences; } catch (en1) {}
            if (app.project.activeSequence.sequenceID !== origId) {
                try { app.project.openSequence(origId); } catch (eo) {}
            }
            seq = app.project.activeSequence;
            // when the sequence count can be read and did not grow, the backup was not made: stop before touching anything
            if (nBefore >= 0 && nAfter >= 0 && nAfter <= nBefore) {
                return '{"error":"The backup copy could not be created, so nothing was changed. Turn Backup off to continue without it."}';
            }
        }

        app.enableQE();
        var q = qe.project.getActiveSequence();
        var tb = Number(seq.timebase);
        var frameDur = tb / HS_TICKS;
        var eps = frameDur * 0.6;
        var oldPos = seq.getPlayerPosition().ticks;
        var nv = q.numVideoTracks, na = q.numAudioTracks;

        function tcAt(frames) {
            seq.setPlayerPosition(String(frames * tb));
            return q.CTI.timecode;
        }
        function razorAll(tc) {
            for (t = 0; t < nv; t++) { try { q.getVideoTrackAt(t).razor(tc); } catch (e2) {} }
            for (t = 0; t < na; t++) { try { q.getAudioTrackAt(t).razor(tc); } catch (e3) {} }
        }
        function collectInside(sf, ef) {
            var out = [], tr, c, n;
            for (t = 0; t < seq.videoTracks.numTracks; t++) {
                tr = seq.videoTracks[t];
                for (n = 0; n < tr.clips.numItems; n++) {
                    c = tr.clips[n];
                    if (c.start.seconds >= sf - eps && c.end.seconds <= ef + eps) out.push(c);
                }
            }
            for (t = 0; t < seq.audioTracks.numTracks; t++) {
                tr = seq.audioTracks[t];
                for (n = 0; n < tr.clips.numItems; n++) {
                    c = tr.clips[n];
                    if (c.start.seconds >= sf - eps && c.end.seconds <= ef + eps) out.push(c);
                }
            }
            return out;
        }

        var removed = 0, failed = 0;
        for (i = sil.length - 1; i >= 0; i--) {
            var fs = Math.round(sil[i].s / frameDur);
            var fe = Math.round(sil[i].e / frameDur);
            if (fe <= fs) continue;
            razorAll(tcAt(fe));
            razorAll(tcAt(fs));
            var targets = collectInside(fs * frameDur, fe * frameDur);
            for (k = 0; k < targets.length; k++) {
                try { targets[k].remove(true, true); removed++; } catch (e4) { failed++; }
            }
        }
        // markers at the join points of the already-cut timeline
        if (p.markers) {
            var acc = 0;
            for (i = 0; i < sil.length; i++) {
                var sf = Math.round(sil[i].s / frameDur), ef = Math.round(sil[i].e / frameDur);
                if (ef <= sf) continue;
                var mk = seq.markers.createMarker((sf * frameDur) - acc);
                mk.name = (p.label || "Silence") + " cut";
                acc += (ef - sf) * frameDur;
            }
        }
        try { seq.setPlayerPosition(oldPos); } catch (e5) {}
        return '{"ok":true,"count":' + sil.length + ',"removed":' + removed + ',"failed":' + failed +
               ',"ms":' + (new Date().getTime() - t0) + '}';
    } catch (e) {
        return '{"error":"' + hsEsc(e.toString() + " (line " + e.line + ")") + '"}';
    }
}

/* ================= Gap Finder ================= */
// Track spec: "all" | "V1".."Vn" | "A1".."An"
function gpSpec(spec) {
    var m = /^([VA])(\d+)$/.exec(String(spec || "all"));
    return m ? { all: false, kind: m[1], idx: parseInt(m[2], 10) - 1 } : { all: true };
}

// Returns clip intervals [start,end] (seconds) for the chosen track(s).
function gpScan(spec) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"No active sequence. Open a sequence first."}';
        var sp = gpSpec(spec);
        var tb = Number(seq.timebase);
        var v = [], a = [], t, n, cl, c;
        if (!sp.all) {
            var coll = sp.kind === "V" ? seq.videoTracks : seq.audioTracks;
            if (sp.idx >= coll.numTracks) return '{"error":"Track ' + sp.kind + (sp.idx + 1) + ' does not exist in this sequence."}';
        }
        for (t = 0; t < seq.videoTracks.numTracks; t++) {
            if (!sp.all && !(sp.kind === "V" && sp.idx === t)) continue;
            cl = seq.videoTracks[t].clips;
            for (n = 0; n < cl.numItems; n++) { c = cl[n]; v.push("[" + c.start.seconds + "," + c.end.seconds + "]"); }
        }
        for (t = 0; t < seq.audioTracks.numTracks; t++) {
            if (!sp.all && !(sp.kind === "A" && sp.idx === t)) continue;
            cl = seq.audioTracks[t].clips;
            for (n = 0; n < cl.numItems; n++) { c = cl[n]; a.push("[" + c.start.seconds + "," + c.end.seconds + "]"); }
        }
        return '{"name":"' + hsEsc(seq.name) + '","fps":' + (HS_TICKS / tb) + ',"video":[' + v.join(",") + '],"audio":[' + a.join(",") + ']}';
    } catch (e) {
        return '{"error":"' + hsEsc(e.toString()) + '"}';
    }
}

// Moves the playhead to a time in seconds (snapped to a frame).
function gpGoto(sec) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"No active sequence."}';
        var tb = Number(seq.timebase);
        var frames = Math.round(sec * HS_TICKS / tb);
        seq.setPlayerPosition(String(frames * tb));
        return '{"ok":true}';
    } catch (e) {
        return '{"error":"' + hsEsc(e.toString()) + '"}';
    }
}

// payload: {gaps:[{s,e}]} -> replaces old "Black" gap markers with fresh ones (in/out range).
function gpMarkers(payloadStr) {
    try {
        var p = eval("(" + payloadStr + ")");
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"No active sequence."}';
        var i, old = [], m = seq.markers.getFirstMarker();
        while (m) {
            if (m.comments === "HalalFX gap" || m.comments === "HalalSFX gap") old.push(m);   // "HalalSFX gap" = markers made by older versions
            m = seq.markers.getNextMarker(m);
        }
        for (i = 0; i < old.length; i++) { try { seq.markers.deleteMarker(old[i]); } catch (e0) {} }
        for (i = 0; i < p.gaps.length; i++) {
            var mk = seq.markers.createMarker(p.gaps[i].s);
            mk.name = "Black";
            mk.comments = "HalalFX gap";
            try { mk.end = p.gaps[i].e; } catch (e1) {
                try { var te = new Time(); te.seconds = p.gaps[i].e; mk.end = te; } catch (e2) {}
            }
        }
        return '{"ok":true,"count":' + p.gaps.length + '}';
    } catch (e) {
        return '{"error":"' + hsEsc(e.toString()) + '"}';
    }
}

// Closes gaps on the chosen track (or the gaps empty on ALL tracks when spec is "all").
// A gap is only closed when nothing on any other track overlaps it; blocked gaps are counted and left alone.
// Everything after a closed gap shifts left by the same amount on every track, so sync is kept.
function gpCloseGaps(spec) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"No active sequence."}';
        var sp = gpSpec(spec);
        var tb = Number(seq.timebase);
        var frameDur = tb / HS_TICKS;
        var eps = frameDur * 0.5;
        var iv = [], t, n, cl, c, i, k;
        function gather(coll, kind) {
            for (t = 0; t < coll.numTracks; t++) {
                cl = coll[t].clips;
                for (n = 0; n < cl.numItems; n++) {
                    c = cl[n];
                    iv.push({ s: c.start.seconds, e: c.end.seconds, c: c, own: (!sp.all && sp.kind === kind && sp.idx === t) });
                }
            }
        }
        gather(seq.videoTracks, "V");
        gather(seq.audioTracks, "A");
        if (!iv.length) return '{"ok":true,"closed":0,"blocked":0,"moved":0,"failed":0}';
        iv.sort(function (a, b) { return a.s - b.s; });

        var gaps = [], blocked = 0, src = [], curEnd;
        for (i = 0; i < iv.length; i++) { if (sp.all || iv[i].own) src.push(iv[i]); }
        if (src.length) {
            curEnd = src[0].e;
            for (i = 1; i < src.length; i++) {
                if (src[i].s - curEnd >= eps) {
                    var g = { s: curEnd, e: src[i].s, f: Math.round((src[i].s - curEnd) / frameDur) };
                    var isBlocked = false;
                    if (!sp.all) {
                        for (k = 0; k < iv.length; k++) {
                            if (!iv[k].own && iv[k].s < g.e - eps && iv[k].e > g.s + eps) { isBlocked = true; break; }
                        }
                    }
                    if (isBlocked) blocked++; else gaps.push(g);
                }
                if (src[i].e > curEnd) curEnd = src[i].e;
            }
        }

        var moved = 0, failed = 0, firstErr = "", gi = 0, shiftFrames = 0;
        for (i = 0; i < iv.length; i++) {
            while (gi < gaps.length && gaps[gi].e <= iv[i].s + eps) { shiftFrames += gaps[gi].f; gi++; }
            if (shiftFrames <= 0) continue;
            try {
                var tm = new Time();
                tm.seconds = -(shiftFrames * frameDur);
                iv[i].c.move(tm);
                moved++;
            } catch (em) {
                failed++;
                if (!firstErr) firstErr = String(em);
            }
        }

        // remove the "Black" gap markers added by the Gaps tab
        var old = [], m = seq.markers.getFirstMarker();
        while (m) {
            if (m.comments === "HalalFX gap" || m.comments === "HalalSFX gap") old.push(m);   // "HalalSFX gap" = markers made by older versions
            m = seq.markers.getNextMarker(m);
        }
        for (k = 0; k < old.length; k++) { try { seq.markers.deleteMarker(old[k]); } catch (ed) {} }

        return '{"ok":true,"closed":' + gaps.length + ',"blocked":' + blocked + ',"moved":' + moved + ',"failed":' + failed +
               ',"err":"' + hsEsc(firstErr) + '"}';
    } catch (e) {
        return '{"error":"' + hsEsc(e.toString() + " (line " + e.line + ")") + '"}';
    }
}

/* ================= Captions ================= */
function cpJson(v) {
    var t = typeof v, i, out;
    if (v === null || v === undefined) return "null";
    if (t === "string") return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n").replace(/[\x00-\x1f]/g, " ") + '"';
    if (t === "number" || t === "boolean") return String(v);
    if (v instanceof Array) {
        out = [];
        for (i = 0; i < v.length; i++) out.push(cpJson(v[i]));
        return "[" + out.join(",") + "]";
    }
    out = [];
    for (var k in v) { if (v.hasOwnProperty(k)) out.push(cpJson(k) + ":" + cpJson(v[k])); }
    return "{" + out.join(",") + "}";
}


// spec: "sel" (selected clips) or a track like "V1" / "A2". Linked video+audio of the same media count once.
function cpGetClips(spec) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"No active sequence. Open a sequence first."}';
        var items = [], i, n, coll, idx;
        if (spec === "sel") {
            var sel = seq.getSelection();
            for (i = 0; i < sel.length; i++) items.push(sel[i]);
            if (!items.length) return '{"error":"Select one or more clips on the timeline, or choose a track as the source."}';
        } else {
            coll = spec.charAt(0) === "A" ? seq.audioTracks : seq.videoTracks;
            idx = parseInt(spec.substring(1), 10) - 1;
            if (!(idx >= 0 && idx < coll.numTracks)) return '{"error":"Track ' + hsEsc(spec) + ' does not exist in this sequence."}';
            for (n = 0; n < coll[idx].clips.numItems; n++) items.push(coll[idx].clips[n]);
        }
        var out = [], seen = {}, found = [], c, key, k;
        for (i = 0; i < items.length; i++) hsSourcesOf(items[i], found, 0);
        for (k = 0; k < found.length; k++) {
            c = found[k];
            key = c.path + "|" + c.start + "|" + c.inPoint;
            if (seen[key]) continue;
            seen[key] = true;
            out.push(c);
        }
        out.sort(function (a, b) { return a.start - b.start; });
        if (!out.length) return '{"error":"No clips with media files were found."}';
        return cpJson({ clips: out });
    } catch (e) {
        return '{"error":"' + hsEsc(e.toString() + " (line " + e.line + ")") + '"}';
    }
}

// payload: {path: full path of a .srt file}. Imports the file and puts it on the sequence as a native caption track.
function cpImportSrt(payloadStr) {
    try {
        var p = eval("(" + payloadStr + ")");
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"No active sequence."}';
        var bin = app.project.getInsertionBin(), name = String(p.path).split(/[\\\/]/).pop(), item = null, i, n, made = false, err = "";
        if (!app.project.importFiles([p.path], true, bin, false)) return '{"error":"Premiere could not import the SRT file."}';
        n = bin.children.numItems;
        for (i = n - 1; i >= 0; i--) { if (bin.children[i].name === name) { item = bin.children[i]; break; } }
        if (!item) return '{"error":"The SRT was imported but could not be found in the project. Drag it onto the sequence manually: ' + hsEsc(p.path) + '"}';
        var fmts = [];
        try { if (Sequence.CAPTION_FORMAT_SUBTITLE !== undefined) fmts.push(Sequence.CAPTION_FORMAT_SUBTITLE); } catch (ef) {}
        fmts.push(1, 0);
        for (i = 0; i < fmts.length && !made; i++) {
            try { seq.createCaptionTrack(item, 0, fmts[i]); made = true; } catch (ec) { err = String(ec); }
        }
        if (!made) return '{"error":"The SRT is in the project (' + hsEsc(name) + ') but a caption track could not be created from the script. Drag it onto the sequence manually. ' + hsEsc(err) + '"}';
        return '{"ok":true}';
    } catch (e) {
        return '{"error":"' + hsEsc(e.toString() + " (line " + e.line + ")") + '"}';
    }
}

/* ================= Filler Words: all selected clips ================= */
// Returns every selected clip that has media (audio clips first; video clips if no audio clip is selected).
function flGetClips() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return '{"error":"No active sequence. Open a sequence first."}';
        var sel = seq.getSelection();
        if (!sel || sel.length === 0) return '{"error":"Select one or more clips on the timeline first."}';
        var a = [], v = [], i, k, seen = {}, key, x, rows = [], list;
        for (i = 0; i < sel.length; i++) {
            if (!sel[i].projectItem) continue;
            hsSourcesOf(sel[i], sel[i].mediaType === "Audio" ? a : v, 0);
        }
        list = a.length ? a : v;
        for (k = 0; k < list.length; k++) {
            x = list[k];
            key = x.path + "|" + x.start + "|" + x.inPoint;
            if (seen[key]) continue;
            seen[key] = true;
            rows.push(cpJson(x));
        }
        if (!rows.length) return '{"error":"The selected items have no audio. Select clips that have audio."}';
        return '{"clips":[' + rows.join(",") + ']}';
    } catch (e) {
        return '{"error":"' + hsEsc(e.toString()) + '"}';
    }
}
