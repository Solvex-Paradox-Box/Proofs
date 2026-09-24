/**
 * Extended Records for Solvex DFRL & Sovereign Verification
 * Defines extended contracts, multi-oracle attestations, and zero-mock verification records.
 */

export interface ExtendedProofContract {
  contract_id: string;
  paradox_id: string;
  claim: string;
  formal_logic_system: 'SMT_LIB2' | 'LEAN4' | 'NOPOT' | 'FIRST_ORDER_PEANO' | 'WELL_FOUNDED_INDUCTION';
  formal_specification: string;
  z3_formula?: string;
  nopot_variant?: {
    variant_name: string;
    well_founded_domain: string;
    ranking_function: string;
    max_bounded_steps: number;
  };
  invariants: string[];
  tenant_id: string;
  oracles_required: number;
  oracles_attested: string[];
  economic_stake_amount_cents: number;
  reversibility_checkpoint_ref: string;
  zero_mock_attestation: true;
  timestamp: number;
}

export interface OracleAttestationRecord {
  attestation_id: string;
  contract_id: string;
  oracle_id: string;
  oracle_type: 'Z3_NATIVE_KERNEL' | 'NOPOT_KERNEL' | 'LEAN4_KERNEL' | 'PEANO_KERNEL';
  verdict: 'SATISFIED' | 'UNSAT_VERIFIED' | 'REFUTED' | 'TIMEOUT';
  signature: string;
  timestamp: number;
}

export interface ReversibilityCheckpointRecord {
  checkpoint_id: string;
  state_root_hash: string;
  prior_checkpoint_hash: string;
  merkle_proof: string;
  immutable: boolean;
  timestamp: number;
}
