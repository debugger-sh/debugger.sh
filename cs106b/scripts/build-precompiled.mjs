/**
 * Build the Stanford CS106B support bundle for the debugger-sh engine.
 *
 * The library archive and precompiled header are compiled with the exact clang and
 * sysroot that the installed debugger-sh version uses at run time (a PCH is only
 * accepted by the compiler that produced it). Everything is packed into a single
 * tarball which the IDE mounts into the engine's filesystem once:
 *
 *   /*.h, /private/*.h           Stanford headers (`#include "vector.h"`)
 *   /cs106b-prelude.h            the header the PCH was built from
 *   /__cs106b/cs106b.a           linked into every C++ program (`lldFlags`)
 *   /__cs106b/support.pch        included into every C++ program (`cxxFlags`)
 *   /__cs106b/EnglishWords.dat   the Lexicon dictionary
 *
 * Outputs:
 *   public/cs106b/cs106b.tar.gz
 *   cs106b/generated/{precompiled.json,precompiled.ts,simpleTestRunner.ts}
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WASI } from 'node:wasi';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { zstdDecompressSync } from 'node:zlib';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';

// Worker thread: runs one invocation of the LLVM multicall binary (clang / wasm-ld).
if (!isMainThread) {
  const { module, root, args } = workerData;
  const wasi = new WASI({ version: 'preview1', args, env: {}, preopens: { '/': root }, returnOnExit: true });
  const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
  parentPort.postMessage(wasi.start(instance));
  process.exit(0);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cs106bRoot = resolve(scriptDir, '..');
const appRoot = resolve(cs106bRoot, '..');
const generated = join(cs106bRoot, 'generated');
const publicOut = join(appRoot, 'public/cs106b');
const cache =
  process.env.CS106B_TOOLCHAIN_CACHE || join(appRoot, 'node_modules/.cache/cs106b-toolchain');
const guestRoot = join(cache, 'sysroot');
const bundleRoot = join(cache, 'bundle');

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

// The toolchain URLs are inlined into the debugger-sh bundle; read them from the installed
// version so the artifacts always match the compiler the engine runs.
const engineBundle = await readFile(fileURLToPath(import.meta.resolve('debugger-sh')), 'utf8');
const toolchainUrl = (file) => {
  const match = engineBundle.match(new RegExp(`https://[^"'\\s]+/llvm/[^"'\\s/]+/${file.replace('.', '\\.')}`));
  if (!match) throw new Error(`Cannot find the debugger-sh LLVM ${file} URL`);
  return match[0];
};
const toolchain = { llvm: toolchainUrl('llvm.wasm'), sysroot: toolchainUrl('sysroot.tar.zst') };

async function collectSources() {
  const entries = [];
  async function headers(directory, prefix = '') {
    for (const entry of (
      await readdir(join(cs106bRoot, directory), { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) await headers(`${directory}/${entry.name}`, `${name}/`);
      else if (entry.name.endsWith('.h')) entries.push({ name, path: `${directory}/${entry.name}`, compile: false });
    }
  }
  await headers('cpp/include');
  for (const file of (await readdir(join(cs106bRoot, 'cpp/src'))).sort()) {
    if (file.endsWith('.cpp')) entries.push({ name: `support_${file}`, path: `cpp/src/${file}`, compile: true });
  }
  return entries;
}

const sources = await Promise.all(
  (await collectSources()).map(async (entry) => ({
    ...entry,
    bytes: await readFile(join(cs106bRoot, entry.path)),
  })),
);

// The prelude includes SimpleTest so test macros reuse PCH'd STL headers. Avoid dumping
// every collection header into the PCH — larger PCHs slow validation. SimpleTest_runner.cpp
// is not in cpp/src: it defines main and is spliced into the student translation unit.
const preludeHeaders = ['error.h', 'vector.h', 'map.h', 'set.h', 'strlib.h', 'simpio.h'];
const prelude =
  preludeHeaders.map((name) => `#include "${name}"`).join('\n') +
  '\n#include <iostream>\n#include "SimpleTest.h"\n';

// These must match the `cpp` toolchain in debugger-sh (src/ts/toolchains.ts), or clang
// rejects the PCH. The library is built without debug info so the debugger never steps into it.
const cc1 = [
  '-cc1', '-triple', 'wasm32-wasip1', '-Werror', '-disable-free', '-isysroot', '/',
  '-internal-isystem', '/include/c++/v1', '-internal-isystem', '/include',
  '-internal-isystem', '/include/wasm32-wasip1',
];
const cxx = [
  '-std=c++23', '-O0', '-fcxx-exceptions', '-fexceptions', '-exception-model=wasm',
  '-target-feature', '+exception-handling', '-mllvm', '-wasm-enable-eh', '-mllvm',
  '-wasm-use-legacy-eh=true',
];
const debugInfo = ['-debug-info-kind=standalone', '-dwarf-version=5'];

const dictionary = await readFile(join(cs106bRoot, 'resources/EnglishWords.dat'));
const identity = {
  toolchain,
  flags: { cc1, cxx, debugInfo },
  recipeDigest: hash(await readFile(fileURLToPath(import.meta.url))),
  sources: Object.fromEntries(sources.map((s) => [s.name, hash(s.bytes)])),
  dictionaryDigest: hash(dictionary),
  prelude,
};
const buildDigest = hash(JSON.stringify(identity));
const bundlePath = join(generated, 'cs106b.tar.gz');

await mkdir(generated, { recursive: true });
await mkdir(publicOut, { recursive: true });

const existing = await readFile(join(generated, 'precompiled.json'), 'utf8')
  .then(JSON.parse)
  .catch(() => undefined);
const fresh =
  existing?.buildDigest === buildDigest &&
  hash(await readFile(bundlePath).catch(() => Buffer.alloc(0))) === existing.bundleDigest;

if (fresh) {
  console.log('CS106B precompiled artifacts unchanged');
} else {
  console.log('Building CS106B precompiled artifacts…');
  await mkdir(cache, { recursive: true });

  async function download(url) {
    const path = join(cache, url.replace(/^https:\/\//, '').replace(/[^\w.-]+/g, '_'));
    let bytes = await readFile(path).catch(() => undefined);
    if (!bytes) {
      console.log(`  fetching ${url}…`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Cannot fetch ${url}: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(path, bytes);
    }
    return bytes;
  }

  const [llvm, sysroot] = await Promise.all([download(toolchain.llvm), download(toolchain.sysroot)]);
  await rm(guestRoot, { recursive: true, force: true });
  await mkdir(join(guestRoot, '__cs106b'), { recursive: true });
  execFileSync('tar', ['-xf', '-', '-C', guestRoot], { input: zstdDecompressSync(sysroot) });
  for (const source of sources) {
    await mkdir(dirname(join(guestRoot, source.name)), { recursive: true });
    await writeFile(join(guestRoot, source.name), source.bytes);
  }
  await writeFile(join(guestRoot, 'cs106b-prelude.h'), prelude);

  const module = await WebAssembly.compile(llvm);
  const invoke = (args) =>
    new Promise((resolveRun, reject) => {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { module, root: guestRoot, args } });
      worker.once('message', (code) =>
        code ? reject(new Error(`C++ artifact build failed (${code}): ${args.join(' ')}`)) : resolveRun(),
      );
      worker.once('error', reject);
    });

  const objects = sources.filter((s) => s.compile).map((s) => ({ source: `/${s.name}`, object: `/__cs106b/${s.name}.o` }));
  const jobs = [
    () =>
      invoke([
        'clang', ...cc1, '-x', 'c++-header', ...cxx, ...debugInfo, '-emit-pch', '-fno-pch-timestamp',
        '-fvalidate-ast-input-files-content', '-o', '/__cs106b/support.pch', '/cs106b-prelude.h',
      ]),
    ...objects.map(({ source, object }) => () => invoke(['clang', ...cc1, '-emit-obj', '-x', 'c++', ...cxx, '-o', object, source])),
  ];
  await Promise.all(
    Array.from({ length: Math.min(jobs.length, availableParallelism()) }, async () => {
      for (let job; (job = jobs.shift()); ) await job();
    }),
  );

  // The toolchain has no `llvm-ar`, but wasm-ld reads archives without a symbol index.
  const members = await Promise.all(objects.map(({ object }) => readFile(join(guestRoot, object))));
  const field = (value, width) => String(value).padEnd(width, ' ');
  const archive = Buffer.concat([
    Buffer.from('!<arch>\n'),
    ...members.flatMap((data, i) => [
      Buffer.from(`${field(`${i}.o/`, 16)}${field(0, 12)}${field(0, 6)}${field(0, 6)}${field(644, 8)}${field(data.length, 10)}\`\n`),
      data,
      Buffer.from(data.length % 2 ? '\n' : ''),
    ]),
  ]);

  await rm(bundleRoot, { recursive: true, force: true });
  await mkdir(join(bundleRoot, '__cs106b'), { recursive: true });
  for (const source of sources.filter((s) => !s.compile)) {
    await mkdir(dirname(join(bundleRoot, source.name)), { recursive: true });
    await writeFile(join(bundleRoot, source.name), source.bytes);
  }
  await writeFile(join(bundleRoot, 'cs106b-prelude.h'), prelude);
  await writeFile(join(bundleRoot, '__cs106b/cs106b.a'), archive);
  await cp(join(guestRoot, '__cs106b/support.pch'), join(bundleRoot, '__cs106b/support.pch'));
  await writeFile(join(bundleRoot, '__cs106b/EnglishWords.dat'), dictionary);
  execFileSync('tar', ['-czf', bundlePath, '-C', bundleRoot, ...(await readdir(bundleRoot))], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });

  await writeFile(
    join(generated, 'precompiled.json'),
    JSON.stringify({ buildDigest, bundleDigest: hash(await readFile(bundlePath)), ...identity }, null, 2),
  );
}

const { bundleDigest } = JSON.parse(await readFile(join(generated, 'precompiled.json'), 'utf8'));
await writeFile(
  join(generated, 'precompiled.ts'),
  `/* Generated by cs106b/scripts/build-precompiled.mjs — do not edit. */\n` +
    `export const bundleDigest = ${JSON.stringify(bundleDigest)};\n`,
);
await cp(bundlePath, join(publicOut, 'cs106b.tar.gz'));

// The runner is spliced into the student file at run time. The header and
// implementation travel with the other CS106B sources, so they are not embedded.
const runnerSource = await readFile(join(cs106bRoot, 'cpp/SimpleTest_runner.cpp'), 'utf8');
await writeFile(
  join(generated, 'simpleTestRunner.ts'),
  `/* Generated by cs106b/scripts/build-precompiled.mjs from cpp/SimpleTest_runner.cpp — do not edit. */\n` +
    `export const simpleTestRunner = ${JSON.stringify(runnerSource)};\n`,
);

console.log('CS106B artifacts ready: cs106b.tar.gz');
