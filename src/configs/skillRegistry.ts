/**
 * Skill Registry Configuration
 * Manages the dual-scope skill system:
 * - workspace_skills: Private skills scoped to user's private workspace
 * - marketplace_skills: Public skills available for hire/billing
 * 
 * RAG Firewall guards ensure workspace skills never leak into marketplace contexts.
 */

// Skill source enumeration
export enum SkillSource {
  WORKSPACE = 'workspace',
  MARKETPLACE = 'marketplace',
  SYSTEM = 'system', // Pre-built, non-mutable skills
}

// Skill metadata
export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  source: SkillSource;
  isPrivate: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Dual-scope registry structure
export interface SkillRegistry {
  workspaceSkills: SkillMetadata[];
  marketplaceSkills: SkillMetadata[];
  publicSkillCount: number;
  privateSkillCount: number;
}

/**
 * Registry status flags for UI display
 */
export enum RegistryStatus {
  ALL_LOADED = 'all_loaded',
  PARTIAL_LOAD = 'partial_load',
  ERROR = 'error',
  OFFLINE = 'offline',
}

/**
 * Registry event payloads
 */
export interface SkillRegistryEvent {
  type: 'skill_added' | 'skill_removed' | 'skill_updated' | 'scope_changed';
  payload: {
    skill: SkillMetadata;
    previousScope?: SkillSource;
  };
}

/**
 * Default exported registry - initialized as empty with status
 */
export const defaultRegistry: SkillRegistry = {
  workspaceSkills: [],
  marketplaceSkills: [],
  publicSkillCount: 0,
  privateSkillCount: 0,
};