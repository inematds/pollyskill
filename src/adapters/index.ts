/**
 * Adapter registry — the plug-and-play seam.
 *
 * To add a new runtime (Gemini CLI, Cursor, Copilot, etc.):
 *   1. Drop a new file in this directory implementing the Adapter interface.
 *   2. Add one line to `register()` below.
 *
 * That's it. The CLI, validator, builder, and reconciler all consume
 * adapters through this registry — they never reference runtimes by name.
 */

import type { Adapter } from './adapter.js';
import { PortableAdapter } from './portable.js';
import { ClaudeAdapter } from './claude.js';
import { CodexAdapter } from './codex.js';

const registry = new Map<string, Adapter>();

function register(adapter: Adapter): void {
  registry.set(adapter.name, adapter);
}

// === REGISTER ADAPTERS HERE ===
register(new PortableAdapter());
register(new ClaudeAdapter());
register(new CodexAdapter());
// To add a new runtime, drop a file and add one line above.

export function getAdapter(name: string): Adapter {
  const a = registry.get(name);
  if (!a) {
    const known = [...registry.keys()].join(', ');
    throw new Error(`Unknown adapter "${name}". Known: ${known}`);
  }
  return a;
}

export function listAdapters(): Adapter[] {
  return [...registry.values()];
}

export function listRuntimeAdapters(): Adapter[] {
  return listAdapters().filter((a) => a.name !== 'portable');
}
