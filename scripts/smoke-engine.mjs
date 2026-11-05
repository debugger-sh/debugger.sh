/**
 * Headless Playwright smoke: compile+run Stanford Vector + SimpleTest via the forked engine.
 * Requires: built ../engine, built CS106B artifacts, PLAYWRIGHT_MODULE or playwright installed.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engineJs = await readFile(join(root, 'node_modules/debugger-sh/dist/debugger-sh.js'));
const engineWasm = await readFile(join(root, 'public/engine_bg.wasm'));
const cs106bA = await readFile(join(root, 'public/cs106b/cs106b.a'));
const pch = await readFile(join(root, 'public/cs106b/support.pch'));
const dictionary = await readFile(join(root, 'public/cs106b/EnglishWords.dat'));
const workerAssets = Object.fromEntries(
  await Promise.all(
    (await readdir(join(root, 'public/assets'))).map(async (name) => [
      `/assets/${name}`,
      await readFile(join(root, 'public/assets', name)),
    ]),
  ),
);
const { stanfordHeaders } = await import(pathToFileURL(join(root, 'cs106b/generated/headers.ts')).href);
const { simpleTestRunner } = await import(
  pathToFileURL(join(root, 'cs106b/generated/simpleTestRunner.ts')).href
);

const nonce = 'a'.repeat(32);
const student = `#include "SimpleTest.h"
#include "MemoryDiagnostics.h"
#include "vector.h"
#include <iostream>

struct LeakNode {
  int value;
  TRACK_ALLOCATIONS_OF(LeakNode);
};

PROVIDED_TEST("Vector size") {
  Vector<int> v;
  v.add(3);
  EXPECT_EQUAL(v.size(), 1);
  EXPECT_EQUAL(v[0], 3);
}

PROVIDED_TEST("intentional leak") {
  new LeakNode{1};
  EXPECT(true);
}

int main() {
  Vector<int> v;
  v.add(1);
  std::cout << "main_ran:" << v.size() << std::endl;
  return 0;
}
`;

// Minimal prepare: rename main, inject keys (hardcoded for smoke).
const preparedStudent = student
  .replace('PROVIDED_TEST("Vector size")', 'SIMPLETEST_KEY("bbbbbbbbbbbbbbbb","Vector size","provided")')
  .replace(
    'PROVIDED_TEST("intentional leak")',
    'SIMPLETEST_KEY("cccccccccccccccc","intentional leak","provided")',
  )
  .replace(/int main\(\)/, 'int original_main(int argc, char** argv)');

const config = `#define SIMPLETEST_NONCE "${nonce}"
#define SIMPLETEST_ALL true
#define SIMPLETEST_SELECTION std::vector<std::string>{}
#define DEBUGGER_HAS_USER_MAIN 1
`;

const runnerBody = simpleTestRunner.replace(/^#include\s+"SimpleTest(?:_config)?\.h"\s*\n/gm, '');

function buildFs() {
  const files = {
    ...stanfordHeaders,
    'main.c': [
      '#include "SimpleTest.h"',
      '#line 1 "/main.c"',
      preparedStudent,
      '#include "SimpleTest_config.h"',
      runnerBody,
    ].join('\n'),
    'SimpleTest_config.h': config,
  };
  const rootFs = {};
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split('/');
    let dir = rootFs;
    for (const part of parts.slice(0, -1)) {
      dir[part] ??= {};
      dir = dir[part];
    }
    dir[parts.at(-1)] = content;
  }
  return rootFs;
}

const html = `<!doctype html><meta charset="utf-8"><script type="module">
import { Engine } from '/engine.js';
window.probe = {
  async run() {
    this.stdout = '';
    this.stderr = '';
    const engine = await Engine.create('c');
    const dec = new TextDecoder();
    engine.stdout.on('data', b => this.stdout += dec.decode(b));
    engine.stderr.on('data', b => this.stderr += dec.decode(b));
    engine.fs = ${JSON.stringify(buildFs())};
    engine.binaryFiles = {
      '/__cs106b/cs106b.a': new Uint8Array(await (await fetch('/cs106b.a')).arrayBuffer()),
      '/__cs106b/support.pch': new Uint8Array(await (await fetch('/support.pch')).arrayBuffer()),
      '/__cs106b/EnglishWords.dat': new Uint8Array(await (await fetch('/EnglishWords.dat')).arrayBuffer()),
    };
    engine.cppArtifacts = {
      sources: ['/main.c'],
      archives: ['/__cs106b/cs106b.a'],
      precompiledHeader: '/__cs106b/support.pch',
    };
    engine.debugger.enabled = false;
    this.result = await engine.run();
    return { result: this.result, stdout: this.stdout, stderr: this.stderr };
  }
};
</script>`;

const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ||
  join(root, 'node_modules/playwright/index.mjs');
let chromium;
try {
  ({ chromium } = await import(pathToFileURL(playwrightPath).href));
} catch {
  // Fall back to engine sibling / web-ide playwright if present.
  const candidates = [
    join(root, '../web-ide/node_modules/playwright/index.mjs'),
    join(root, '../web-ide-cs106b/node_modules/playwright/index.mjs'),
  ];
  for (const candidate of candidates) {
    try {
      ({ chromium } = await import(pathToFileURL(candidate).href));
      break;
    } catch {
      /* try next */
    }
  }
}
if (!chromium) {
  console.error('Install playwright or set PLAYWRIGHT_MODULE');
  process.exit(2);
}

const server = createServer((req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  const url = req.url?.split('?')[0];
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else if (url === '/engine.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(engineJs);
  } else if (url === '/engine_bg.wasm') {
    res.writeHead(200, { 'Content-Type': 'application/wasm' });
    res.end(engineWasm);
  } else if (url && workerAssets[url]) {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(workerAssets[url]);
  } else if (url === '/cs106b.a') {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(cs106bA);
  } else if (url === '/support.pch') {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(pch);
  } else if (url === '/EnglishWords.dat') {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(dictionary);
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const { port } = server.address();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error('pageerror', err));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  const outcome = await page.evaluate(async () => window.probe.run());
  console.log('exit', outcome.result);
  console.log('stdout:\n', outcome.stdout);
  if (outcome.stderr) console.log('stderr:\n', outcome.stderr);
  assert.equal(outcome.result?.type, 'completed', JSON.stringify(outcome.result));
  // One intentional leak → non-zero exit, but compile/run succeeded.
  assert.equal(outcome.result?.exitCode, 1, 'leak should fail the suite');
  assert.match(outcome.stdout, /main_ran:1/);
  assert.match(outcome.stdout, new RegExp(`__SIMPLETEST_V1__:${nonce}:`));
  assert.match(outcome.stdout, /"type":"test_passed"/);
  assert.match(outcome.stdout, /"type":"test_leaked"/);
  assert.match(outcome.stdout, /Leaked 1 object/);
  console.log('smoke-engine: ok');
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
