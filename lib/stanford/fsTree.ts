import type { DirNode } from 'debugger-sh';

/** Convert flat `"a/b/c": "…"` paths into a nested engine `DirNode`. */
export function pathsToDirNode(files: Record<string, string>): DirNode {
  const root: DirNode = {};
  for (const [path, content] of Object.entries(files)) {
    const segments = path.replace(/^\//, '').split('/').filter(Boolean);
    if (segments.length === 0) continue;
    let directory = root;
    for (const segment of segments.slice(0, -1)) {
      const existing = directory[segment];
      if (typeof existing === 'string') {
        throw new TypeError(`Path is both a file and directory: ${path}`);
      }
      if (existing === undefined) {
        const child: DirNode = {};
        directory[segment] = child;
        directory = child;
      } else {
        directory = existing;
      }
    }
    directory[segments.at(-1)!] = content;
  }
  return root;
}

/** Shallow-merge DirNodes (later entries overwrite file collisions). */
export function mergeDirNodes(...trees: DirNode[]): DirNode {
  const result: DirNode = {};
  for (const tree of trees) {
    for (const [name, node] of Object.entries(tree)) {
      const existing = result[name];
      if (
        existing &&
        typeof existing !== 'string' &&
        typeof node !== 'string'
      ) {
        result[name] = mergeDirNodes(existing, node);
      } else {
        result[name] = node;
      }
    }
  }
  return result;
}
