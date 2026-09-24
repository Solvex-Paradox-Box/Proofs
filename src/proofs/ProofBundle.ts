import { ProofBundleEntity, FormalProofRecord, FormalProofClassification, computeSha256 } from '../database/DatabaseSchema';
import { Z3ProofResult } from './Z3FormalProofEngine';
import { NOPOTCertificate } from './NOPOTProof';

export class ProofBundleBuilder {
  private bundle: ProofBundleEntity;

  constructor(proofId: string, subjectId: string, claim: string) {
    this.bundle = {
      proof_id: proofId,
      subject_id: subjectId,
      claim,
      claim_hash: computeSha256(claim),
      evidence: [],
      tests: [],
      formal_proofs: [],
      independent_oracles: [],
      replay_results: [],
      implementation_hash: computeSha256('EMPTY_IMPL'),
      environment_hash: computeSha256('SOVEREIGN_NODE_SANDBOX'),
      dependency_hash: computeSha256('ZERO_SPECULATIVE_DEPS'),
      source_references: [],
      timestamp: Date.now(),
      verifier_identity: 'DAISY_HAMINJA_PROOF_ENGINE_V1',
      verification_status: 'PARTIAL',
      limitations: [],
      reproducibility_instructions: 'Run `npm run verify:enterprise` in isolated container.'
    };
  }

  public setImplementation(sourceCode: string): this {
    this.bundle.implementation_hash = computeSha256(sourceCode);
    return this;
  }

  public addTest(testId: string, description: string, passed: boolean, durationMs: number): this {
    this.bundle.tests.push({
      test_id: testId,
      description,
      passed,
      duration_ms: durationMs,
      receipt_hash: computeSha256(`${testId}:${passed}:${durationMs}`)
    });
    return this;
  }

  /**
   * Records a formal proof record with explicit classification.
   * If classification is MACHINE_CHECKED_*, checked can only be true if solver evidence is attached.
   */
  public addFormalProof(
    system: 'Z3_SMT' | 'LEAN4' | 'ISABELLE' | 'NOPOT' | 'TYPE_THEORY',
    spec: string,
    checked: boolean,
    classification: FormalProofClassification = 'CLAIM_ONLY',
    checkerDetails?: {
      engine?: string;
      version?: string;
      solver_result?: string;
      duration_ms?: number;
      stdout?: string;
    }
  ): this {
    // Fail-closed enforcement: A caller cannot assert MACHINE_CHECKED without genuine execution evidence
    let finalClassification = classification;
    let finalChecked = checked;

    if (classification === 'MACHINE_CHECKED_FORMAL_PROOF' || classification === 'MACHINE_CHECKED_MODEL_PROOF') {
      if (!checkerDetails?.solver_result || !checkerDetails?.engine) {
        // Downgrade to CLAIM_ONLY if no verifiable checker invocation is supplied
        finalClassification = 'CLAIM_ONLY';
        finalChecked = false;
      }
    }

    const record: FormalProofRecord = {
      system,
      specification: spec,
      checked: finalChecked,
      classification: finalClassification,
      proof_term_hash: computeSha256(`${system}:${spec}:${finalChecked}:${finalClassification}:${checkerDetails?.solver_result || ''}`),
      checker_engine: checkerDetails?.engine,
      checker_version: checkerDetails?.version,
      solver_result: checkerDetails?.solver_result,
      execution_duration_ms: checkerDetails?.duration_ms,
      stdout_summary: checkerDetails?.stdout
    };

    this.bundle.formal_proofs.push(record);
    return this;
  }

  public addZ3Proof(proofResult: Z3ProofResult, isModelProof: boolean = false): this {
    const classification: FormalProofClassification = isModelProof
      ? 'MACHINE_CHECKED_MODEL_PROOF'
      : 'MACHINE_CHECKED_FORMAL_PROOF';

    return this.addFormalProof(
      'Z3_SMT',
      `[${proofResult.theorem_id}] ${proofResult.theorem_name} (Z3 Engine) - Claim: ${proofResult.claim}`,
      proofResult.proved && proofResult.solver_result === 'unsat',
      classification,
      {
        engine: proofResult.solver_engine,
        version: proofResult.solver_version,
        solver_result: proofResult.solver_result.toUpperCase(),
        duration_ms: proofResult.execution_time_ms,
        stdout: proofResult.explanation
      }
    );
  }

  public addNOPOTProof(cert: NOPOTCertificate, z3Result?: Z3ProofResult): this {
    if (z3Result && z3Result.proved && z3Result.solver_result === 'unsat') {
      return this.addFormalProof(
        'NOPOT',
        `NOPOT Bounded Termination (${cert.target_algorithm}) - Inductive Step & Well-Founded Measure: ${cert.variant_function}`,
        true,
        'MACHINE_CHECKED_MODEL_PROOF',
        {
          engine: z3Result.solver_engine,
          version: z3Result.solver_version,
          solver_result: `UNSAT (${z3Result.theorem_id})`,
          duration_ms: z3Result.execution_time_ms,
          stdout: `Termination bounded to max ${cert.bounded_steps_upper_bound} steps, measured ${cert.actual_measured_steps} steps`
        }
      );
    }

    // If no Z3 solver result is attached, classify as EXECUTABLE_VERIFICATION
    return this.addFormalProof(
      'NOPOT',
      `NOPOT Bounded Termination (${cert.target_algorithm}) - Concrete Execution Only`,
      cert.termination_proved,
      'EXECUTABLE_VERIFICATION',
      {
        engine: 'NOPOT Concrete Step Verifier',
        solver_result: cert.termination_proved ? 'CONVERGED_BOUNDED' : 'DIVERGED',
        duration_ms: 0,
        stdout: `Concrete steps: ${cert.actual_measured_steps} of max ${cert.bounded_steps_upper_bound}`
      }
    );
  }

  public addLean4Proof(filePath: string): this {
    // Lean 4 binary is not installed in the container environment.
    // Categorize honestly as CLAIM_ONLY with checked = false.
    return this.addFormalProof(
      'LEAN4',
      `Lean4 Formalization Source File: ${filePath}`,
      false, // NOT checked because Lean4 compiler is unavailable
      'CLAIM_ONLY',
      {
        engine: 'Lean 4 Theorem Prover',
        solver_result: 'UNAVAILABLE_ENVIRONMENT',
        stdout: 'Lean4 executable not detected in container environment. Formal check cannot be executed.'
      }
    );
  }

  public addOracle(oracleId: string, name: string, method: string, verified: boolean): this {
    this.bundle.independent_oracles.push({
      oracle_id: oracleId,
      name,
      method,
      attestation_hash: computeSha256(`${oracleId}:${name}:${verified}`),
      verified
    });
    return this;
  }

  public addReplay(replayId: string, expectedHash: string, observedHash: string): this {
    const match = expectedHash === observedHash;
    this.bundle.replay_results.push({
      replay_id: replayId,
      status: match ? 'MATCH' : 'MISMATCH',
      expected_hash: expectedHash,
      observed_hash: observedHash
    });
    return this;
  }

  public addEvidence(item: string): this {
    this.bundle.evidence.push(item);
    return this;
  }

  public addSourceReference(ref: string): this {
    this.bundle.source_references.push(ref);
    return this;
  }

  public addLimitation(limitation: string): this {
    this.bundle.limitations.push(limitation);
    return this;
  }

  public seal(): ProofBundleEntity {
    const allTestsPassed = this.bundle.tests.length > 0 && this.bundle.tests.every(t => t.passed);
    
    // There must be at least one genuine machine-checked formal or model proof that was proven
    const machineCheckedProofs = this.bundle.formal_proofs.filter(f => 
      f.checked && (f.classification === 'MACHINE_CHECKED_FORMAL_PROOF' || f.classification === 'MACHINE_CHECKED_MODEL_PROOF')
    );
    const hasMachineCheckedProof = machineCheckedProofs.length > 0;

    // No non-claim formal proof can have failed
    const noFailedProofs = !this.bundle.formal_proofs.some(f => f.classification !== 'CLAIM_ONLY' && !f.checked);
    
    const oraclesAttested = this.bundle.independent_oracles.length > 0 && this.bundle.independent_oracles.every(o => o.verified);
    const replaysMatched = this.bundle.replay_results.length > 0 && this.bundle.replay_results.every(r => r.status === 'MATCH');

    if (allTestsPassed && hasMachineCheckedProof && noFailedProofs && oraclesAttested && replaysMatched) {
      this.bundle.verification_status = 'VERIFIED';
    } else {
      this.bundle.verification_status = 'FAIL';
    }
    return this.bundle;
  }
}
