// Sovereign SHA-256 implementation that works identically in Node, Bun, and browser environments
function sha256Pure(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number, j: number;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
  
  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  ascii += '\x80';
  while ((ascii.length % 64) !== 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return ''; // ASCII only
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = ((asciiBitLength / maxWord) | 0);
  words[words.length] = (asciiBitLength | 0);

  for (j = 0; j < words.length;) {
    const w = words.slice(j, j += 16);
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const i2 = i + j;
      const w15 = w[i - 15], w2 = w[i - 2];

      const a = hash[0], e = hash[4];
      const temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
          w[i - 16]
          + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
          + w[i - 7]
          + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
        ) | 0
      );

      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0, a, hash[1], hash[2], (hash[3] + temp1) | 0, e, hash[5], hash[6]];
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (8 * j)) & 255;
      result += ((b < 16) ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

export function computeSha256(content: string | any): string {
  const str = typeof content === 'string' ? content : JSON.stringify(content);
  return sha256Pure(str);
}

export type SystemStatusType = 
  | 'VERIFIED_IMPLEMENTATION'
  | 'PARTIAL'
  | 'INTENDED'
  | 'CLAIM'
  | 'UNKNOWN';

export type VerificationStatusType = 
  | 'VERIFIED'
  | 'FAIL'
  | 'HOLD'
  | 'DUPLICATE'
  | 'FAMILY_VARIANT'
  | 'NOT_A_DISTINCT_PARADOX'
  | 'PARTIAL'
  | 'CLAIM_ONLY'
  | 'UNKNOWN';

export type NodeExecutionMode = 
  | 'CODE_EXECUTED'
  | 'LIVE_EXTERNAL_EXECUTION'
  | 'DETERMINISTIC_FIXTURE'
  | 'EXTERNAL_PROVIDER_REQUIRED'
  | 'UNIMPLEMENTED'
  | 'EXECUTION_FAILED';

export type AdapterStatusType = 
  | 'AVAILABLE'
  | 'CONFIGURATION_REQUIRED'
  | 'EXTERNAL_PROVIDER_REQUIRED'
  | 'FAILED'
  | 'UNIMPLEMENTED';

export type OrderStatusType = 
  | 'PENDING_AUTHORIZATION'
  | 'AUTHORIZED'
  | 'JIT_BUILDING'
  | 'VERIFYING'
  | 'DEPLOYED'
  | 'DELIVERED'
  | 'REJECTED_UNVERIFIED'
  | 'FAILED_CLOSED';

export type PaymentStatusType = 
  | 'PENDING'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'EXTERNAL_PROVIDER_REQUIRED'
  | 'FAILED'
  | 'REFUNDED';

export interface UserEntity {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  created_at: number;
}

export interface TenantEntity {
  id: string;
  name: string;
  tier: 'ENTERPRISE' | 'SOVEREIGN_NODE' | 'COMMUNITY';
  isolated_storage_key: string;
  created_at: number;
}

export interface RoleEntity {
  id: string;
  name: string;
  permissions: string[];
}

export interface ProblemEntity {
  id: string;
  tenant_id: string;
  raw_problem: string;
  normalized_title: string;
  domain: string;
  detected_constraints: string[];
  invariants: string[];
  status: 'INTAKE' | 'NORMALIZED' | 'SOLVING' | 'SOLVED' | 'UNRESOLVED';
  created_at: number;
}

export interface ParadoxEntity {
  id: string;
  code: string;
  name: string;
  domain: string;
  mechanism: string;
  claim: string;
  canonical_family?: string;
  is_duplicate_of?: string;
  verification_status: VerificationStatusType;
  proof_bundle_id?: string;
  source_references: string[];
  created_at: number;
}

export interface InvariantEntity {
  id: string;
  subject_id: string;
  predicate: string;
  formal_spec: string;
  checked: boolean;
  verified_timestamp?: number;
}

export interface SolutionEntity {
  id: string;
  code: string;
  title: string;
  domain: string;
  problem_ref: string;
  paradox_ref?: string;
  implementation_source: string;
  implementation_hash: string;
  verification_status: VerificationStatusType;
  proof_bundle_id?: string;
  performance_boost_percent: number;
  reversibility_guaranteed: boolean;
  created_at: number;
}

export interface MarketplaceOfferEntity {
  id: string;
  solution_id: string;
  proof_bundle_id: string;
  title: string;
  description: string;
  cost_basis_cents: number;
  verification_complexity_factor: number;
  risk_class: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  price_cents: number;
  sla_tier: '99.9%' | '99.99%' | 'DETERMINISTIC_ZERO_TOLERANCE';
  published: boolean;
  verification_status: VerificationStatusType;
  publication_blocked_reason?: string;
  created_at: number;
}

export interface ProofBundleEntity {
  proof_id: string;
  subject_id: string;
  claim: string;
  claim_hash: string;
  evidence: string[];
  tests: {
    test_id: string;
    description: string;
    passed: boolean;
    duration_ms: number;
    receipt_hash: string;
  }[];
  formal_proofs: {
    system: 'Z3_SMT' | 'LEAN4' | 'ISABELLE' | 'NOPOT' | 'TYPE_THEORY';
    specification: string;
    checked: boolean;
    proof_term_hash: string;
  }[];
  independent_oracles: {
    oracle_id: string;
    name: string;
    method: string;
    attestation_hash: string;
    verified: boolean;
  }[];
  replay_results: {
    replay_id: string;
    status: 'MATCH' | 'MISMATCH' | 'NOT_REPRODUCIBLE' | 'FAILED';
    observed_hash: string;
    expected_hash: string;
  }[];
  implementation_hash: string;
  environment_hash: string;
  dependency_hash: string;
  source_references: string[];
  timestamp: number;
  verifier_identity: string;
  verification_status: VerificationStatusType;
  limitations: string[];
  reproducibility_instructions: string;
}

export interface OrderEntity {
  id: string;
  tenant_id: string;
  offer_id: string;
  solution_id: string;
  proof_bundle_id: string;
  price_cents: number;
  status: OrderStatusType;
  payment_id?: string;
  deployment_id?: string;
  created_at: number;
}

export interface PaymentEntity {
  id: string;
  order_id: string;
  amount_cents: number;
  currency: string;
  provider: 'PAYPAL_DN35' | 'SOLANA_ESCROW_DN38';
  provider_tx_id?: string;
  status: PaymentStatusType;
  idempotency_key: string;
  receipt_hash: string;
  created_at: number;
}

export interface DeploymentEntity {
  id: string;
  order_id: string;
  solution_id: string;
  tenant_id: string;
  implementation_version: string;
  deployment_hash: string;
  sandbox_id: string;
  status: 'ACTIVE' | 'ROLLED_BACK' | 'FAILED_CLOSED';
  checkpoint_id: string;
  created_at: number;
}

export interface CheckpointEntity {
  id: string;
  tenant_id: string;
  target_id: string;
  snapshot_hash: string;
  snapshot_data: string;
  rollback_strategy: 'ATOMIC_DATABASE_RESTORE' | 'SANDBOX_REVERT' | 'IRREVERSIBLE_EXTERNAL_ACTION';
  created_at: number;
}

export interface RollbackRecordEntity {
  id: string;
  checkpoint_id: string;
  reason: string;
  restored_snapshot_hash: string;
  status: 'RESTORED' | 'FAILED' | 'BLOCKED_IRREVERSIBLE';
  verified_integrity: boolean;
  timestamp: number;
}

export interface TelemetryEntity {
  execution_id: string;
  node_id: string;
  tenant_id: string;
  operation: string;
  input_hash: string;
  output_hash: string;
  start_time: number;
  end_time: number;
  status: 'SUCCESS' | 'FAILURE' | 'DIVERTED';
  errors?: string;
  checkpoint_ref?: string;
  rollback_ref?: string;
  proof_ref?: string;
  environment_hash: string;
  implementation_version: string;
}

export interface AuditRecordEntity {
  index: number;
  timestamp: number;
  tenant_id: string;
  actor: string;
  action: string;
  target_entity: string;
  target_id: string;
  payload_hash: string;
  previous_hash: string;
  record_hash: string;
  signature: string;
}

export interface FailureDiversionEntity {
  id: string;
  failed_gate: string;
  trigger_reason: string;
  tenant_id: string;
  evidence_hash: string;
  reverted_to_checkpoint?: string;
  fail_closed_enforced: boolean;
  status?: string;
  version?: string;
  created_at?: number;
  updated_at?: number;
  created_by?: string;
  updated_by?: string;
  metadata?: string;
  evidence_reference?: string;
  timestamp: number;
}

export interface PermissionEntity {
  id: string;
  name: string;
  category: string;
  created_at: number;
  updated_at: number;
  status: string;
  version: string;
  created_by?: string;
  updated_by?: string;
  metadata?: string;
  evidence_reference?: string;
}

export interface TenantMembershipEntity {
  id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  created_at: number;
  updated_at: number;
  status: string;
  version: string;
  created_by?: string;
  updated_by?: string;
  metadata?: string;
  evidence_reference?: string;
}

export interface ProofEvidenceEntity {
  id: string;
  tenant_id: string;
  proof_bundle_id: string;
  evidence_type: string;
  description: string;
  payload_hash: string;
  artifact_path?: string;
  created_at: number;
  updated_at: number;
  status: string;
  version: string;
  created_by?: string;
  updated_by?: string;
  metadata?: string;
  evidence_reference?: string;
}

export interface VerificationRunEntity {
  id: string;
  tenant_id: string;
  run_id: string;
  suite_name: string;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  verdict: 'ENTERPRISE_VERIFIED' | 'FAILED_CLOSED' | 'PARTIAL';
  report_path?: string;
  created_at: number;
  updated_at: number;
  status: string;
  version: string;
  created_by?: string;
  updated_by?: string;
  metadata?: string;
  evidence_reference?: string;
}

export interface ChainRecordEntity {
  id: string;
  tenant_id: string;
  record_id: string;
  previous_hash: string;
  payload_hash: string;
  record_hash: string;
  timestamp: number;
  record_type: string;
  actor: string;
  operation: string;
  created_at: number;
  updated_at: number;
  status: string;
  version: string;
  created_by?: string;
  updated_by?: string;
  metadata?: string;
  evidence_reference?: string;
}

export interface LicenseEntity {
  id: string;
  tenant_id: string;
  order_id: string;
  license_key: string;
  scope: string;
  expires_at?: number;
  created_at: number;
  updated_at: number;
  status: string;
  version: string;
  created_by?: string;
  updated_by?: string;
  metadata?: string;
  evidence_reference?: string;
}

export interface ExecutionRunEntity {
  id: string;
  tenant_id: string;
  execution_id: string;
  node_id: string;
  operation: string;
  input_hash: string;
  output_hash: string;
  timestamp: number;
  status: string;
  checkpoint_id?: string;
  rollback_reference?: string;
  proof_reference?: string;
  created_at: number;
  updated_at: number;
  version: string;
  created_by?: string;
  updated_by?: string;
  metadata?: string;
  evidence_reference?: string;
}

