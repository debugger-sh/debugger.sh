/**
 * Headless Playwright smoke: compile+run Stanford Vector + SimpleTest on the engine,
 * the way the IDE does (one engine, Stanford bundle mounted, tests on a pipe device).
 * Requires: built CS106B artifacts (`npm run build:cs106b`) and playwright.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engineDist = join(root, 'node_modules/debugger-sh/dist');
const files = {
  '/engine.js': ['text/javascript', await readFile(join(engineDist, 'debugger-sh.js'))],
  '/cs106b.tar.gz': ['application/gzip', await readFile(join(root, 'public/cs106b/cs106b.tar.gz'))],
};
const { simpleTestRunner } = await import(
  pathToFileURL(join(root, 'cs106b/generated/simpleTestRunner.ts')).href
);

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

// Match prepare.ts: leave test macros alone, #define main away, append runner.
const source = ['#define main original_main', '#line 1 "/main.c"', student, '#undef main', '', simpleTestRunner].join(
  '\n',
);

const html = `<!doctype html><meta charset="utf-8"><script type="module">
import { Engine, Pipe } from '/engine.js';
window.probe = {
  async run() {
    const engine = await Engine.create({
      fs: new Uint8Array(await (await fetch('/cs106b.tar.gz')).arrayBuffer()),
    });
    await engine.fs.writeFile('/main.c', ${JSON.stringify(source)});
    const tests = new Pipe();
    const proc = engine.run('cpp', {
      sources: ['main.c'],
      cxxFlags: ['-include-pch', '/__cs106b/support.pch'],
      lldFlags: ['/__cs106b/cs106b.a'],
      devices: { '/dev/simpletest': tests },
    });
    let stdout = '', stderr = '';
    proc.stdout.on('text', (text) => (stdout += text));
    proc.stderr.on('text', (text) => (stderr += text));
    const events = [];
    const reading = (async () => { for await (const line of tests.lines()) events.push(JSON.parse(line)); })();
    const result = await proc;
    await reading;
    engine.dispose();
    return { result, stdout, stderr, events };
  }
};
</script>`;

const playwrightPath = process.env.PLAYWRIGHT_MODULE || join(root, 'node_modules/playwright/index.mjs');
let chromium;
try {
  ({ chromium } = await import(pathToFileURL(playwrightPath).href));
} catch {
  console.error('Install playwright or set PLAYWRIGHT_MODULE');
  process.exit(2);
}

const server = createServer((req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  const url = req.url?.split('?')[0] ?? '/';
  const file = url === '/' ? ['text/html', html] : files[url];
  if (!file) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': file[0] });
  res.end(file[1]);
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
  // One intentional leak → non-zero exit, but compile/run succeeded.
  assert.deepEqual(outcome.result, { exitCode: 1, killed: false }, 'leak should fail the suite');
  assert.match(outcome.stdout, /main_ran:1/);
  // Test events travel on their own pipe, never through stdout.
  assert.doesNotMatch(outcome.stdout, /"type":/);
  const types = outcome.events.map((event) => event.type);
  assert.ok(types.includes('test_passed'), types.join(', '));
  assert.ok(types.includes('test_leaked'), types.join(', '));
  assert.equal(types.at(-1), 'run_finished');
  assert.match(outcome.events.find((event) => event.type === 'test_leaked').message, /Leaked 1 object/);
  console.log('smoke-engine: ok');
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
