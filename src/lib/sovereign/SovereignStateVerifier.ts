/**
 * Lightweight sovereign integrity checks for orchestrator + time-travel + skill isolation.
 */

import { timeTravelEngine } from "@/lib/jyinx/orchestrator/TimeTravelEngine";
import { kusOrchestrator } from "@/lib/jyinx/orchestrator/KusOrchestrator";
import { skillRegistryService } from "@/lib/skillRegistryService";
import { ragFirewall } from "@/utils/RagFirewall";

export type VerificationCheck = {
  name: string;
  passed: boolean;
  details: string;
};

export type VerificationResult = {
  id: string;
  timestamp: Date;
  passed: boolean;
  integrityScore: number;
  checks: VerificationCheck[];
};

export function verifySovereignState(userId = "system"): VerificationResult {
  const checks: VerificationCheck[] = [];

  const orch = kusOrchestrator.getState();
  checks.push({
    name: "Orchestrator reachable",
    passed: Boolean(orch),
    details: `phase=${orch.currentPhase} tasks=${orch.tasks.length}`,
  });

  const branch = timeTravelEngine.getActiveBranch();
  const nodes = branch ? timeTravelEngine.getBranchNodes(branch.id) : [];
  checks.push({
    name: "Time-travel branch",
    passed: Boolean(branch) && nodes.length >= 1,
    details: branch ? `${branch.name} nodes=${nodes.length}` : "no active branch",
  });

  const snap = skillRegistryService.snapshot();
  const leaked = snap.marketplace.filter((s) => s.scope === "workspace");
  checks.push({
    name: "Skill isolation",
    passed: leaked.length === 0,
    details: leaked.length === 0 ? "No workspace skills in marketplace list" : `${leaked.length} leaks`,
  });

  const sample = snap.workspace[0];
  if (sample) {
    const decision = ragFirewall.checkAccess(sample, { userId, purpose: "training_export" });
    checks.push({
      name: "RAG firewall training block",
      passed: !decision.allowed,
      details: decision.reason,
    });
  } else {
    checks.push({
      name: "RAG firewall training block",
      passed: true,
      details: "No private skills loaded — firewall idle",
    });
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const integrityScore = Math.round((passedCount / checks.length) * 100);

  return {
    id: `verify_${Date.now().toString(36)}`,
    timestamp: new Date(),
    passed: checks.every((c) => c.passed),
    integrityScore,
    checks,
  };
}
