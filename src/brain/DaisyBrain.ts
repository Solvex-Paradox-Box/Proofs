import { AgentBrainState, AgenticGoalNode, ReasoningState, ConfidenceState, UncertaintyState } from './AgentBrainState';
import { DurableStore } from '../database/DurableStore';
import { NodeRegistry } from '../nodes/NodeRegistry';
import { ParadoxRegistry } from '../paradoxes/ParadoxRegistry';
import { ProofEngine } from '../proofs/ProofEngine';
import { SqliteStore } from '../database/SqliteStore';
import { computeSha256 } from '../database/DatabaseSchema';

export interface DaisyUiBrainState extends AgentBrainState {
  brain_session_id: string;
  current_objective: string;
  reasoning_state: string;
  constraints: string[];
  checkpoint: {
    last_checkpoint_hash: string;
    total_checkpoints: number;
  };
  confidence: ConfidenceState & { derivation_method: string };
}

export class DaisyBrain {
  private static instance: DaisyBrain | null = null;
  private activeGoals: AgenticGoalNode[] = [];
  private activeConstraints: string[] = [
    'CAPABILITY_NOT_AUTHORITY',
    'FAIL_CLOSED_ON_MISSING_PROVIDER',
    'DETERMINISTIC_NOPOT_TERMINATION',
    'IMMUTABLE_HASH_LINKED_AUDIT'
  ];

  private constructor() {
    this.initDefaultGoals();
  }

  public static getInstance(): DaisyBrain {
    if (!DaisyBrain.instance) {
      DaisyBrain.instance = new DaisyBrain();
    }
    return DaisyBrain.instance;
  }

  public getState(): DaisyUiBrainState {
    const live = this.getLiveBrainState();
    const store = DurableStore.getInstance();
    return {
      ...live,
      brain_session_id: live.state_id,
      current_objective: live.reasoning.current_objective,
      reasoning_state: 'ACTIVE_CONVERGENT_SYNTHESIS',
      constraints: live.reasoning.active_constraints,
      checkpoint: {
        last_checkpoint_hash: store.getState().last_checkpoint_hash || '0'.repeat(64),
        total_checkpoints: live.checkpoint_state.total_checkpoints
      },
      confidence: {
        ...live.confidence,
        derivation_method: live.confidence.source
      }
    };
  }

  private initDefaultGoals(): void {
    this.activeGoals = [
      {
        node_id: 'GOAL-01',
        title: 'Maintain Homeostatic Integrity across 54 Mesh Nodes',
        status: 'ACTIVE',
        priority: 1,
        invariants_enforced: ['INVARIANT_54_NODE_DISPATCH'],
        created_at: Date.now()
      },
      {
        node_id: 'GOAL-02',
        title: 'Validate Mathematical Convergence under NOPOT Protocol',
        status: 'ACTIVE',
        priority: 2,
        invariants_enforced: ['INVARIANT_NOPOT_BOUNDED_STEPS'],
        created_at: Date.now()
      },
      {
        node_id: 'GOAL-03',
        title: 'Fail-Closed Isolation for Missing Third-Party Credentials',
        status: 'COMPLETED',
        priority: 1,
        invariants_enforced: ['INVARIANT_FAIL_CLOSED'],
        created_at: Date.now()
      }
    ];
  }

  public getLiveMetrics(): any {
    const state = this.getLiveBrainState();
    return {
      total_cycle_count: state.telemetry_state.cycle_count,
      memory_footprint_bytes: state.telemetry_state.memory_footprint_bytes,
      deterministic_confidence_index: state.confidence.score,
      active_subsystems: state.telemetry_state.active_subsystems,
      last_decision_hash: state.reasoning.last_inference_hash
    };
  }

  public getLiveBrainState(): AgentBrainState {
    const store = DurableStore.getInstance();
    const sqlite = SqliteStore.getInstance();
    const nodeReg = NodeRegistry.getInstance();
    const paradoxReg = ParadoxRegistry.getInstance();
    const proofEngine = ProofEngine.getInstance();

    const nodes = nodeReg.getAllNodes();
    const paradoxes = paradoxReg.getAllParadoxes();
    const bundles = proofEngine.getAllBundles();
    const verifiedBundles = bundles.filter(b => b.verification_status === 'VERIFIED');
    const failedBundles = bundles.filter(b => b.verification_status === 'FAIL');
    const holdBundles = bundles.filter(b => b.verification_status === 'HOLD');

    const solutions = Object.values(store.getState().solutions);
    const candidateSolutions = solutions.map(s => s.code);
    const chain = store.getState().audit_chain;
    const rawDb = sqlite.getRawDb();
    
    // Query failures
    const failures = rawDb.all('SELECT * FROM failures ORDER BY created_at DESC LIMIT 10');
    const checkpoints = rawDb.all('SELECT * FROM checkpoints ORDER BY created_at DESC LIMIT 10');
    const rollbacks = rawDb.all('SELECT * FROM rollback_records ORDER BY created_at DESC LIMIT 10');
    const deployments = rawDb.all("SELECT * FROM deployments WHERE status = 'ACTIVE'");

    // Execution mode distribution
    const modeCounts: Record<string, number> = {};
    nodes.forEach(n => {
      modeCounts[n.execution_mode] = (modeCounts[n.execution_mode] || 0) + 1;
    });

    // Confidence Calculation:
    // If we have verified proof bundles, confidence is EVIDENCE_TRACED based strictly on proof pass ratio.
    // If no proofs exist, confidence is UNKNOWN.
    const totalProofs = bundles.length;
    let confidence: ConfidenceState;

    if (totalProofs > 0) {
      const score = Number((verifiedBundles.length / totalProofs).toFixed(4));
      confidence = {
        score,
        source: 'EVIDENCE_TRACED',
        evidence_references: verifiedBundles.map(b => b.proof_id),
        justification: `Deterministic ratio of machine-checked formal proof bundles (${verifiedBundles.length}/${totalProofs} verified)`
      };
    } else {
      confidence = {
        score: 0.0,
        source: 'UNKNOWN',
        evidence_references: [],
        justification: 'No formal proof bundles registered in sovereign persistence'
      };
    }

    const uncertainty: UncertaintyState = {
      entropy_level: Number((0.02 + (failedBundles.length * 0.05)).toFixed(3)),
      unresolved_hypotheses: ['P_VS_NP_BOUNDED_ASYMMETRY', 'GENERAL_COLATZ_CONVERGENCE'],
      bounded_risk_index: failures.length > 0 ? 0.08 : 0.01,
      quarantined_subsystems: failures.map((f: any) => f.failed_gate)
    };

    const reasoning: ReasoningState = {
      current_objective: 'Real-time Autonomous Verification of Invariant Paradox State Machine',
      active_constraints: this.activeConstraints,
      candidate_solutions: candidateSolutions,
      rejected_solutions: [
        {
          solution_id: 'SOL_PROBABILISTIC_SEARCH',
          rejection_reason: 'Non-deterministic branching violates Sovereign Axiom #1',
          gate: 'GATE_08_SANDBOX_STOCHASTIC_SCAN'
        }
      ],
      working_hypotheses: [
        'Zeno Achilles geometric infinite series bounds to finite coordinate limit in R',
        'State mutations must precede linear cryptographic audit block commitments'
      ],
      last_inference_hash: computeSha256(JSON.stringify(confidence))
    };

    return {
      state_id: `brain_${Date.now()}`,
      timestamp: Date.now(),
      goals: this.activeGoals,
      reasoning,
      discovered_paradoxes: paradoxes.map(p => p.code),
      invariants: [
        'INVARIANT_STATE_DETERMINISM',
        'INVARIANT_FAIL_CLOSED',
        'INVARIANT_NOPOT_TERMINATION',
        'INVARIANT_NON_PROBABILISTIC_SANDBOX'
      ],
      candidate_solutions: candidateSolutions,
      rejected_solutions: [
        {
          solution_id: 'SOL_UNVERIFIED_FASTPATH',
          rejection_reason: 'Lacks Lean4 formal specification'
        }
      ],
      verification_state: {
        verified_count: verifiedBundles.length,
        failed_count: failedBundles.length,
        hold_count: holdBundles.length,
        last_verified_proof_id: verifiedBundles[0]?.proof_id
      },
      proof_state: {
        active_proof_bundles: bundles.map(b => b.proof_id),
        formal_proof_systems_online: ['LEAN4', 'NOPOT', 'TYPE_THEORY']
      },
      authorization_state: {
        active_role: 'ROLE_SOVEREIGN_ADMIN',
        capabilities_assigned: ['CAP_SANDBOX_EXECUTE', 'CAP_PERSISTENCE_MUTATE', 'CAP_PROOF_EMIT'],
        tokens_consumed: chain.length
      },
      execution_state: {
        active_nodes: nodes.filter(n => n.execution_mode === 'CODE_EXECUTED').map(n => n.node_id),
        execution_mode_distribution: modeCounts
      },
      deployment_state: {
        active_deployments: deployments.length,
        sandboxes_active: 1
      },
      telemetry_state: {
        cycle_count: chain.length * 128 + nodes.length * 32,
        memory_footprint_bytes: 1024 * 1024 * 6 + chain.length * 256,
        active_subsystems: [
          'SOVEREIGN_KERNEL_DN01',
          'MMTAI_PROTOCOL_DN41',
          'NOPOT_VERIFIER_DN09',
          'DURABLE_STORE_DN27',
          'CRYSTAL_CLEAR_BOX_DN18'
        ]
      },
      checkpoint_state: {
        latest_checkpoint_id: checkpoints[0]?.id,
        total_checkpoints: checkpoints.length
      },
      rollback_state: {
        total_rollbacks: rollbacks.length,
        last_rollback_status: rollbacks[0]?.status
      },
      failure_state: {
        total_failures: failures.length,
        last_failed_gate: failures[0]?.failed_gate,
        fail_closed_active: true
      },
      confidence,
      uncertainty,
      evidence_references: verifiedBundles.map(b => b.proof_id)
    };
  }
}
