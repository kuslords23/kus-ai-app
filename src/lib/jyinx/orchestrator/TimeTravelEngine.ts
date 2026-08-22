"use client";

import type { StateNode, Branch, ReplayOptions } from "./StateNode";

export interface TimeTravelEvent {
  type: "snapshot" | "fork" | "rewind" | "resume" | "commit" | "branch_created";
  timestamp: Date;
  branchId: string;
  nodeId: string;
  details: string;
  metadata?: Record<string, unknown>;
}

export interface TimeTravelSnapshot {
  id: string;
  branchId: string;
  timestamp: Date;
  label: string;
  state: StateNode;
  hash: string;
}

export class TimeTravelEngine {
  private branches: Map<string, Branch> = new Map();
  private nodes: Map<string, StateNode> = new Map();
  private snapshots: Map<string, TimeTravelSnapshot> = new Map();
  private activeBranchId: string = "main";
  private listeners: Set<(event: TimeTravelEvent) => void> = new Set();
  private nodeCounter = 0;
  private snapshotCounter = 0;

  constructor() {
    // Initialize main branch
    const mainBranch: Branch = {
      id: "main",
      name: "main",
      parentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      nodeCount: 0,
      active: true,
    };
    this.branches.set("main", mainBranch);

    // Create root node
    const rootNode: StateNode = {
      id: "root",
      parentId: null,
      branch: "main",
      timestamp: new Date(),
      phase: "idle",
      userIntent: "",
      repository: "",
      tasks: [],
      logs: [],
      files: {},
      metadata: {},
    };
    this.nodes.set("root", rootNode);
    this.branches.get("main")!.nodeCount = 1;
  }

  /**
   * Subscribe to time-travel events
   */
  subscribe(listener: (event: TimeTravelEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: TimeTravelEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private generateNodeId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateSnapshotId(): string {
    return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private hashState(state: StateNode): string {
    // Simple hash for state fingerprinting
    const str = JSON.stringify(state);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `hash_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Create a new node (snapshot) in the current branch
   */
  snapshot(state: StateNode, label?: string): string {
    const nodeId = this.generateNodeId();
    const node: StateNode = {
      ...state,
      id: nodeId,
      parentId: this.getCurrentNodeId(),
      branch: this.activeBranchId,
      timestamp: new Date(),
    };
    this.nodes.set(nodeId, node);

    // Update parent's children
    const parent = this.nodes.get(node.parentId!);
    if (parent) {
      // Parent is implicitly linked via parentId
    }

    const branch = this.branches.get(this.activeBranchId)!;
    branch.nodeCount++;
    branch.updatedAt = new Date();

    const hash = this.hashState(node);
    const snapshot: TimeTravelSnapshot = {
      id: this.generateSnapshotId(),
      branchId: this.activeBranchId,
      timestamp: new Date(),
      label: label || `Snapshot at ${node.timestamp.toISOString()}`,
      state: node,
      hash,
    };
    this.snapshots.set(snapshot.id, snapshot);

    this.emit({
      type: "snapshot",
      timestamp: new Date(),
      branchId: this.activeBranchId,
      nodeId,
      details: `Created snapshot: ${snapshot.label}`,
      metadata: { hash, snapshotId: snapshot.id },
    });

    return nodeId;
  }

  /**
   * Fork a new branch from a node
   */
  fork(fromNodeId: string, branchName: string, label?: string): Branch {
    const sourceNode = this.nodes.get(fromNodeId);
    if (!sourceNode) {
      throw new Error(`Source node ${fromNodeId} not found`);
    }

    const branchId = `branch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newBranch: Branch = {
      id: branchId,
      name: branchName,
      parentId: fromNodeId,
      createdAt: new Date(),
      updatedAt: new Date(),
      nodeCount: 1,
      active: false,
    };
    this.branches.set(branchId, newBranch);

    // Create forked node
    const forkedNode: StateNode = {
      ...sourceNode,
      id: this.generateNodeId(),
      parentId: fromNodeId,
      branch: branchId,
      timestamp: new Date(),
      label: label || `Fork from ${sourceNode.id}`,
    };
    this.nodes.set(forkedNode.id, forkedNode);

    this.emit({
      type: "branch_created",
      timestamp: new Date(),
      branchId,
      nodeId: forkedNode.id,
      details: `Created branch "${branchName}" from node ${fromNodeId}`,
    });

    return newBranch;
  }

  /**
   * Rewind to a previous node (time-travel)
   */
  rewind(toNodeId: string, options: ReplayOptions = {}): StateNode {
    const targetNode = this.nodes.get(toNodeId);
    if (!targetNode) {
      throw new Error(`Target node ${toNodeId} not found`);
    }

    // Switch to the target branch
    const targetBranch = this.branches.get(targetNode.branch);
    if (targetBranch) {
      this.activeBranchId = targetNode.branch;
      targetBranch.active = true;
    }

    this.emit({
      type: "rewind",
      timestamp: new Date(),
      branchId: targetNode.branch,
      nodeId: toNodeId,
      details: `Rewound to node ${toNodeId} (${targetNode.phase})`,
      metadata: { preserveCurrent: options.preserveCurrent },
    });

    return { ...targetNode };
  }

  /**
   * Resume execution from a node (after rewind/fork)
   */
  resume(fromNodeId: string, overrides: Partial<StateNode> = {}): StateNode {
    const sourceNode = this.nodes.get(fromNodeId);
    if (!sourceNode) {
      throw new Error(`Source node ${fromNodeId} not found`);
    }

    const resumedNode: StateNode = {
      ...sourceNode,
      ...overrides,
      id: this.generateNodeId(),
      parentId: fromNodeId,
      branch: this.activeBranchId,
      timestamp: new Date(),
      phase: overrides.phase || "executing",
    };
    this.nodes.set(resumedNode.id, resumedNode);

    const branch = this.branches.get(this.activeBranchId)!;
    branch.nodeCount++;
    branch.updatedAt = new Date();

    this.emit({
      type: "resume",
      timestamp: new Date(),
      branchId: this.activeBranchId,
      nodeId: resumedNode.id,
      details: `Resumed from node ${fromNodeId}`,
    });

    return resumedNode;
  }

  /**
   * Get all branches
   */
  getBranches(): Branch[] {
    return Array.from(this.branches.values());
  }

  /**
   * Get active branch
   */
  getActiveBranch(): Branch | undefined {
    return this.branches.get(this.activeBranchId);
  }

  /**
   * Get all nodes in a branch
   */
  getBranchNodes(branchId: string): StateNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.branch === branchId);
  }

  /**
   * Get node by ID
   */
  getNode(nodeId: string): StateNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get current node ID (last node in active branch)
   */
  private getCurrentNodeId(): string {
    const branchNodes = this.getBranchNodes(this.activeBranchId);
    return branchNodes.length > 0 ? branchNodes[branchNodes.length - 1].id : "root";
  }

  /**
   * Get timeline for a branch
   */
  getTimeline(branchId: string): StateNode[] {
    return this.getBranchNodes(branchId).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  /**
   * Get snapshots for a branch
   */
  getSnapshots(branchId: string): TimeTravelSnapshot[] {
    return Array.from(this.snapshots.values()).filter(
      (s) => s.branchId === branchId
    );
  }

  /**
   * Switch active branch
   */
  switchBranch(branchId: string): Branch {
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch ${branchId} not found`);
    }

    // Deactivate all branches
    for (const b of this.branches.values()) {
      b.active = false;
    }

    branch.active = true;
    this.activeBranchId = branchId;

    this.emit({
      type: "branch_created",
      timestamp: new Date(),
      branchId,
      nodeId: this.getCurrentNodeId(),
      details: `Switched to branch "${branch.name}"`,
    });

    return branch;
  }

  /**
   * Get current state
   */
  getCurrentState(): StateNode | undefined {
    const nodeId = this.getCurrentNodeId();
    return this.nodes.get(nodeId);
  }

  /**
   * Commit a branch (mark as completed)
   */
  commitBranch(branchId: string, message: string): void {
    const branch = this.branches.get(branchId);
    if (branch) {
      this.emit({
        type: "commit",
        timestamp: new Date(),
        branchId,
        nodeId: this.getCurrentNodeId(),
        details: `Committed branch "${branch.name}": ${message}`,
      });
    }
  }
}

// Singleton instance
export const timeTravelEngine = new TimeTravelEngine();