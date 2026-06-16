import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, join, relative, dirname } from 'node:path';
import type { AgentTool } from '@addomatic/core';

function safePath(workspacePath: string, inputPath: string): string {
  const abs = resolve(workspacePath, inputPath);
  const base = resolve(workspacePath);
  if (!abs.startsWith(base + '/') && abs !== base) {
    throw new Error(`Path traversal not allowed: ${inputPath}`);
  }
  return abs;
}

export function createWorkspaceTools(workspacePath: string): AgentTool[] {
  return [
    readFileTool(workspacePath),
    writeFileTool(workspacePath),
    listDirectoryTool(workspacePath),
    searchCodeTool(workspacePath),
  ];
}

function readFileTool(workspacePath: string): AgentTool {
  return {
    name: 'read_file',
    description: 'Read the content of a file in the repository workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to workspace root (e.g. "src/index.ts")' },
      },
      required: ['path'],
    },
    async execute(input) {
      const path = safePath(workspacePath, input['path'] as string);
      return readFile(path, 'utf-8');
    },
  };
}

function writeFileTool(workspacePath: string): AgentTool {
  return {
    name: 'write_file',
    description: 'Create or completely overwrite a file in the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to workspace root' },
        content: { type: 'string', description: 'Full file content to write' },
      },
      required: ['path', 'content'],
    },
    async execute(input) {
      const path = safePath(workspacePath, input['path'] as string);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, input['content'] as string, 'utf-8');
      return `Written: ${input['path']}`;
    },
  };
}

function listDirectoryTool(workspacePath: string): AgentTool {
  return {
    name: 'list_directory',
    description: 'List files and folders at a path. Use recursive=true to see the full tree.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to workspace root (use "." for root)' },
        recursive: { type: 'boolean', description: 'If true, recurse into subdirectories' },
      },
      required: ['path'],
    },
    async execute(input) {
      const dirPath = safePath(workspacePath, input['path'] as string);
      const recursive = (input['recursive'] as boolean | undefined) ?? false;
      const SKIP = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'target', '__pycache__']);

      if (!recursive) {
        const items = await readdir(dirPath, { withFileTypes: true });
        return items
          .filter((i) => !SKIP.has(i.name))
          .map((i) => (i.isDirectory() ? `${i.name}/` : i.name))
          .join('\n');
      }

      const entries: string[] = [];
      async function walk(dir: string): Promise<void> {
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
          if (SKIP.has(item.name)) continue;
          const full = join(dir, item.name);
          const rel = relative(workspacePath, full);
          if (item.isDirectory()) {
            entries.push(`${rel}/`);
            await walk(full);
          } else {
            entries.push(rel);
          }
        }
      }
      await walk(dirPath);
      return entries.join('\n') || '(empty)';
    },
  };
}

function searchCodeTool(workspacePath: string): AgentTool {
  return {
    name: 'search_code',
    description: 'Search for a text pattern across source files. Returns file:line: match format.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Text or regex pattern to search for' },
        path: { type: 'string', description: 'Directory to search in (default: workspace root)' },
        fileExtension: { type: 'string', description: 'Only search files with this extension, e.g. "ts"' },
      },
      required: ['pattern'],
    },
    async execute(input) {
      const searchPath = safePath(workspacePath, (input['path'] as string | undefined) ?? '.');
      const ext = (input['fileExtension'] as string | undefined)?.replace(/^\./, '');
      let regex: RegExp;
      try {
        regex = new RegExp(input['pattern'] as string, 'g');
      } catch {
        regex = new RegExp(escapeRegExp(input['pattern'] as string), 'g');
      }

      const SKIP = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'target', '__pycache__']);
      const matches: string[] = [];
      const MAX_MATCHES = 50;

      async function walk(dir: string): Promise<void> {
        if (matches.length >= MAX_MATCHES) return;
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
          if (SKIP.has(item.name)) continue;
          const full = join(dir, item.name);
          if (item.isDirectory()) {
            await walk(full);
          } else {
            if (ext && !item.name.endsWith(`.${ext}`)) continue;
            const content = await readFile(full, 'utf-8').catch(() => '');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              regex.lastIndex = 0;
              if (regex.test(lines[i]!)) {
                matches.push(`${relative(workspacePath, full)}:${i + 1}: ${lines[i]!.trim()}`);
                if (matches.length >= MAX_MATCHES) return;
              }
            }
          }
        }
      }

      await walk(searchPath);
      if (matches.length === 0) return 'No matches found.';
      const suffix = matches.length >= MAX_MATCHES ? `\n... (showing first ${MAX_MATCHES} matches)` : '';
      return matches.join('\n') + suffix;
    },
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
