"use client";

import { timeTravelEngine } from "../jyinx/orchestrator/TimeTravelEngine";

/**
 * Reality Layer - Evidence Over Authority.
 * No agent is trusted. Only compilers, test runners, execution benchmarks,
 * sandboxed verification, and security fuzzers provide ground truth.
 */

export interface RealityCheckResult {
  passed: boolean;
  category: "compilation" | "tests" | "lint" | "types" | "performance" | "security";
  output: string;
  errors: string[];
  warnings: string[];
  durationMs: number;
  benchmark?: { before: number; after: number; unit: string };
}

export async function verifyCompilation(files: Array<{ path: string; content: string }>): Promise<RealityCheckResult> {
  const start = Date.now();
  try {
    const res = await fetch("/api/jyinx/reality/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    const data = await res.json();
    return {
      passed: data.passed ?? false,
      category: "compilation",
      output: data.output ?? "",
      errors: data.errors ?? [],
      warnings: data.warnings ?? [],
      durationMs: Date.now() - start,
    };
  } catch {
    return { passed: false, category: "compilation", output: "", errors: ["Network error"], warnings: [], durationMs: Date.now() - start };
  }
}

export async function verifyTypes(files: Array<{ path: string; content: string }>): Promise<RealityCheckResult> {
  const start = Date.now();
  try {
    const res = await fetch("/api/jyinx/reality/typecheck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    const data = await res.json();
    return {
      passed: data.passed ?? false,
      category: "types",
      output: data.output ?? "",
      errors: data.errors ?? [],
      warnings: data.warnings ?? [],
      durationMs: Date.now() - start,
    };
  } catch {
    return { passed: false, category: "types", output: "", errors: ["Type check unavailable"], warnings: [], durationMs: Date.now() - start };
  }
}

export async function runTests(testFiles: string[]): Promise<RealityCheckResult> {
  const start = Date.now();
  try {
    const res = await fetch("/api/jyinx/reality/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testFiles }),
    });
    const data = await res.json();
    return {
      passed: data.passed ?? false,
      category: "tests",
      output: data.output ?? "",
      errors: data.errors ?? [],
      warnings: data.warnings ?? [],
      durationMs: Date.now() - start,
    };
  } catch {
    return { passed: false, category: "tests", output: "", errors: ["Test runner unavailable"], warnings: [], durationMs: Date.now() - start };
  }
}

export async function verifySecurity(files: Array<{ path: string; content: string }>): Promise<RealityCheckResult> {
  const start = Date.now();
  try {
    const res = await fetch("/api/jyinx/reality/security", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    const data = await res.json();
    return {
      passed: data.passed ?? false,
      category: "security",
      output: data.output ?? "",
      errors: data.errors ?? [],
      warnings: data.warnings ?? [],
      durationMs: Date.now() - start,
    };
  } catch {
    return { passed: false, category: "security", output: "", errors: ["Security check unavailable"], warnings: [], durationMs: Date.now() - start };
  }
}
