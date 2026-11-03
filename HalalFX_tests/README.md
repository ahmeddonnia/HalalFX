# HalalFX tests

Run after every change to the plugin. Both commands take the path of the HalalFX folder (default: ..\HalalFX next to this folder).

    node unit.js  ..\HalalFX        # shared helpers, downloads (local test server), migration, host.jsx   - needs Node only
    python ui_test.py  ..\HalalFX   # the whole panel in a real Chromium with a fake Premiere              - pip install playwright, then: playwright install chromium

The UI test fakes Premiere (ExtendScript replies), the file system and Node's modules, so nothing touches your real files or the network.
It cannot test what only real Premiere does (razor / ripple delete on a real sequence, drag-and-drop into the timeline, real audio extraction with ffmpeg).
One unit test (the ffmpeg install) uses a shell script as a stand-in ffmpeg and is skipped on Windows.
