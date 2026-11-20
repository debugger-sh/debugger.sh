/**
 * Headless smoke test for SimpleTest sources + protocol framing (no browser).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const cpp = readFileSync(join(root, 'cs106b/cpp/src/SimpleTest.cpp'), 'utf8');
// Test events go to their own device, never interleaved with program output.
assert.match(cpp, /\/dev\/simpletest/);

const header = readFileSync(join(root, 'cs106b/cpp/include/SimpleTest.h'), 'utf8');
assert.match(header, /#define PROVIDED_TEST/);
assert.match(header, /#define STUDENT_TEST/);
assert.match(header, /#define EXPECT_EQUAL/);

const memoryHeader = readFileSync(join(root, 'cs106b/cpp/include/MemoryDiagnostics.h'), 'utf8');
assert.match(memoryHeader, /TRACK_ALLOCATIONS_OF/);
assert.match(memoryHeader, /typesWithErrors/);
assert.match(cpp, /MemoryDiagnostics::clear/);
assert.match(cpp, /test_leaked/);
assert.match(cpp, /pluralize\(delta, "object"\)/);
assert.match(cpp, /pluralize\(-delta, "more object"\)/);

const runner = readFileSync(join(root, 'cs106b/cpp/SimpleTest_runner.cpp'), 'utf8');
assert.match(runner, /simpletest::run/);
assert.match(runner, /original_main/);
assert.doesNotMatch(runner, /debugger_hidden_main/);

const generatedRunner = readFileSync(join(root, 'cs106b/generated/simpleTestRunner.ts'), 'utf8');
assert.match(generatedRunner, /simpleTestRunner/);
assert.match(generatedRunner, /original_main/);

const loadArtifacts = readFileSync(join(root, 'lib/stanford/loadArtifacts.ts'), 'utf8');
assert.match(loadArtifacts, /cs106b\.tar\.gz/);
assert.doesNotMatch(loadArtifacts, /SIMPLETEST_H/);

const prepare = readFileSync(join(root, 'lib/testing/prepare.ts'), 'utf8');
assert.match(prepare, /#define main original_main/);
assert.doesNotMatch(prepare, /tokenizeCpp/);
assert.doesNotMatch(prepare, /debugger_hidden_main/);
// Missing returns in student code must stay visible to clang (-Werror).
assert.doesNotMatch(prepare, /ignored "-Wreturn-type"/);

// Protocol decoder: one JSON event per line; anything else is ignored.
const { createTestReport } = await import(pathToFileURL(join(root, 'lib/testing/protocol.ts')).href);
const report = createTestReport();
for (const line of [
  '{"type":"run_started"}',
  '{"type":"test_discovered","key":"k","name":"Vector size","origin":"provided","line":3}',
  'not json',
  '{"type":"test_passed","key":"k","durationMs":1.5}',
  '{"type":"run_finished","durationMs":1}',
]) {
  report.push(line);
}
assert.equal(report.state.tests.length, 1);
assert.equal(report.state.results.get('k')?.status, 'passed');
assert.equal(report.state.finished, true);

console.log('smoke-prepare: ok');
