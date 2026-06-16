import { access, rm, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { LanguageProfile } from '../types.js';

const DETECTION_RULES: Array<{ files: string[]; profile: LanguageProfile }> = [
  { files: ['tsconfig.json', 'package.json'], profile: { language: 'typescript', dockerImage: 'node:20' } },
  { files: ['package.json'], profile: { language: 'javascript', dockerImage: 'node:20' } },
  { files: ['Cargo.toml'], profile: { language: 'rust', dockerImage: 'rust:1.82' } },
  { files: ['go.mod'], profile: { language: 'go', dockerImage: 'golang:1.23' } },
  { files: ['pyproject.toml'], profile: { language: 'python', dockerImage: 'python:3.12' } },
  { files: ['requirements.txt'], profile: { language: 'python', dockerImage: 'python:3.12' } },
  { files: ['pom.xml'], profile: { language: 'java', dockerImage: 'eclipse-temurin:21-jdk' } },
  { files: ['build.gradle'], profile: { language: 'java', dockerImage: 'eclipse-temurin:21-jdk' } },
];

export async function createWorkspace(workspaceRoot?: string): Promise<string> {
  const base = workspaceRoot ?? tmpdir();
  return mkdtemp(join(base, 'dev-ai-'));
}

export async function removeWorkspace(workspacePath: string): Promise<void> {
  await rm(workspacePath, { recursive: true, force: true });
}

export async function detectLanguageFromHost(workspacePath: string): Promise<LanguageProfile> {
  const exists = async (file: string): Promise<boolean> => {
    try {
      await access(join(workspacePath, file));
      return true;
    } catch {
      return false;
    }
  };

  for (const { files, profile } of DETECTION_RULES) {
    const allPresent = await Promise.all(files.map(exists));
    if (allPresent.every(Boolean)) return profile;
  }

  return { language: 'unknown', dockerImage: 'ubuntu:24.04' };
}

export function generateTaskId(): string {
  return randomBytes(4).toString('hex');
}
