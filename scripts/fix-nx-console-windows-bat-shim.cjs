#!/usr/bin/env node
// Nx Console (VS Code extension) resolves the local `nx` executable on
// Windows by checking specifically for `node_modules/.bin/nx.bat`. npm's
// Windows shim generator only ever produces `nx.cmd` (never `.bat`), so that
// check always fails, and the extension ends up calling `spawn(undefined, ...)`
// when it tries to launch the project graph, crashing with
// "TypeError [ERR_INVALID_ARG_TYPE]: The "file" argument must be of type
// string. Received undefined". This creates a tiny nx.bat that forwards to
// the real nx.cmd, so it exists for Nx Console to find. Runs on every
// `npm install` because node_modules is regenerated each time.
const fs = require('node:fs');
const path = require('node:path');

if (process.platform !== 'win32') {
  process.exit(0);
}

const binDir = path.join(__dirname, '..', 'node_modules', '.bin');
const cmdPath = path.join(binDir, 'nx.cmd');
const batPath = path.join(binDir, 'nx.bat');

if (fs.existsSync(cmdPath) && !fs.existsSync(batPath)) {
  fs.writeFileSync(batPath, '@echo off\r\n"%~dp0nx.cmd" %*\r\nexit /b %errorlevel%\r\n');
}
