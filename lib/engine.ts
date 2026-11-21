import { Engine } from 'debugger-sh';

let engine: Promise<Engine> | null = null;

/**
 * The engine shared by every run, for the lifetime of the page. Its filesystem
 * persists between runs, so toolchains stay loaded and the C++ toolchain only
 * recompiles sources that changed.
 */
export function getEngine(): Promise<Engine> {
  engine ??= Engine.create().catch((error: unknown) => {
    engine = null;
    throw error;
  });
  return engine;
}

/** Downloads and compiles the C++ toolchain ahead of the first run. */
export async function warmCppToolchain(): Promise<void> {
  await (await getEngine()).run('clang', ['--version'], { sysroot: 'cpp' });
}
