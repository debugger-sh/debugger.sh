/**
 * Headless smoke test for SimpleTest sources + protocol framing (no browser).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const embedded = readFileSync(join(root, 'lib/simpletest/embedded.ts'), 'utf8');
assert.match(embedded, /SIMPLETEST_H/);
assert.match(embedded, /PROVIDED_TEST/);
assert.match(embedded, /original_main/);
assert.doesNotMatch(embedded, /debugger_hidden_main/);

const cpp = readFileSync(join(root, 'lib/simpletest/SimpleTest.cpp'), 'utf8');
assert.match(cpp, /__SIMPLETEST_V1__/);
// emit must not print a leading blank line before each marker
assert.doesNotMatch(cpp, /printf\("\\n__SIMPLETEST/);

const header = readFileSync(join(root, 'lib/simpletest/SimpleTest.h'), 'utf8');
assert.match(header, /#define PROVIDED_TEST/);
assert.match(header, /#define STUDENT_TEST/);
assert.match(header, /#define EXPECT_EQUAL/);

const runner = readFileSync(join(root, 'lib/simpletest/SimpleTest_runner.cpp'), 'utf8');
assert.match(runner, /original_main/);
assert.match(runner, /simpletest::run/);

const loadArtifacts = readFileSync(join(root, 'lib/stanford/loadArtifacts.ts'), 'utf8');
assert.match(loadArtifacts, /SimpleTest\.h/);
assert.match(loadArtifacts, /SIMPLETEST_H/);

const prepare = readFileSync(join(root, 'lib/testing/prepare.ts'), 'utf8');
assert.match(prepare, /original_main/);
assert.doesNotMatch(prepare, /debugger_hidden_main/);

const nonce = 'abcd'.repeat(4);
const marker = `__SIMPLETEST_V1__:${nonce}:`;
const line = `${marker}{"type":"test_passed","key":"deadbeefdeadbeef","durationMs":1.5}`;
assert.ok(line.startsWith(marker));
const event = JSON.parse(line.slice(marker.length));
assert.equal(event.type, 'test_passed');

// Protocol decoder: blank lines adjacent to markers must not leak to the terminal.
const { createTestReportDecoder } = await import(
  pathToFileURL(join(root, 'lib/testing/protocol.ts')).href
);
const decoder = createTestReportDecoder(nonce);
const visible = decoder.push(
  `hello\n\n${marker}{"type":"run_started"}\n\n${marker}{"type":"run_finished","durationMs":1}\nbye\n`
);
assert.equal(visible, 'hello\nbye\n');
assert.equal(decoder.state.finished, true);

console.log('smoke-prepare: ok');
