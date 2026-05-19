/**
 * Library entry point — for consumers who want to use polyskill
 * programmatically (e.g. to write their own adapter).
 */

export * from './ir.js';
export type { Adapter, ParseResult, EmitResult, ValidationResult, ValidationIssue, WrittenFile } from './adapters/adapter.js';
export { getAdapter, listAdapters, listRuntimeAdapters } from './adapters/index.js';
export { PortableAdapter } from './adapters/portable.js';
export { ClaudeAdapter } from './adapters/claude.js';
export { CodexAdapter } from './adapters/codex.js';
