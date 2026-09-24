export type ConfidenceSource = 'EVIDENCE_TRACED' | 'HEURISTIC' | 'UNKNOWN';

export interface ConfidenceState {
  score: number; // 0.0 to 1.0
  source: ConfidenceSource;
  evidence_references: string[];
  justification: string;
}

export interface UncertaintyState {
  entropy_level: number;
  unresolved_hypotheses: string[];
  bounded_risk_index: number;
  quarantined_subsystems: string[];
}

export interface AgenticGoalNode {
  node_id: string;
  parent_id?: string;
  title: string;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'QUARANTINED';
  priority: number;
  invariants_enforced: string[];
  created_at: number;
}

export interface ReasoningState {
  current_objective: string;
  active_constraints: string[];
  candidate_solutions: string[];
  rejected_solutions: { solution_id: string; rejection_reason: string; gate: string }[];
  working_hypotheses: string[];
  last_inference_hash: string;
}

export interface AgentBrainState {
  state_id: string;
  timestamp: number;
  goals: AgenticGoalNode[];
  reasoning: ReasoningState;
  discovered_paradoxes: string[];
  invariants: string[];
  candidate_solutions: string[];
  rejected_solutions: { solution_id: string; rejection_reason: string }[];
  verification_state: {
    verified_count: number;
    failed_count: number;
    hold_count: number;
    last_verified_proof_id?: string;
  };
  proof_state: {
    active_proof_bundles: string[];
    formal_proof_systems_online: string[];
  };
  authorization_state: {
    active_role: string;
    capabilities_assigned: string[];
    tokens_consumed: number;
  };
  execution_state: {
    active_nodes: string[];
    execution_mode_distribution: Record<string, number>;
  };
  deployment_state: {
    active_deployments: number;
    sandboxes_active: number;
  };
  telemetry_state: {
    cycle_count: number;
    memory_footprint_bytes: number;
    active_subsystems: string[];
  };
  checkpoint_state: {
    latest_checkpoint_id?: string;
    total_checkpoints: number;
  };
  rollback_state: {
    total_rollbacks: number;
    last_rollback_status?: string;
  };
  failure_state: {
    total_failures: number;
    last_failed_gate?: string;
    fail_closed_active: boolean;
  };
  confidence: ConfidenceState;
  uncertainty: UncertaintyState;
  evidence_references: string[];
}
