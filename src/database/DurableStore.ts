import {
  UserEntity,
  TenantEntity,
  ProblemEntity,
  ParadoxEntity,
  InvariantEntity,
  SolutionEntity,
  MarketplaceOfferEntity,
  ProofBundleEntity,
  OrderEntity,
  PaymentEntity,
  DeploymentEntity,
  CheckpointEntity,
  RollbackRecordEntity,
  TelemetryEntity,
  AuditRecordEntity,
  FailureDiversionEntity,
  computeSha256
} from './DatabaseSchema';

export interface DatabaseState {
  version: string;
  last_checkpoint_hash: string;
  users: Record<string, UserEntity>;
  tenants: Record<string, TenantEntity>;
  problems: Record<string, ProblemEntity>;
  paradoxes: Record<string, ParadoxEntity>;
  invariants: Record<string, InvariantEntity>;
  solutions: Record<string, SolutionEntity>;
  offers: Record<string, MarketplaceOfferEntity>;
  proof_bundles: Record<string, ProofBundleEntity>;
  orders: Record<string, OrderEntity>;
  payments: Record<string, PaymentEntity>;
  deployments: Record<string, DeploymentEntity>;
  checkpoints: Record<string, CheckpointEntity>;
  rollback_records: Record<string, RollbackRecordEntity>;
  telemetry: TelemetryEntity[];
  audit_chain: AuditRecordEntity[];
  failures: Record<string, FailureDiversionEntity>;
}

export class DurableStore {
  private static instance: DurableStore | null = null;
  private state: DatabaseState;
  private storagePath: string;

  private constructor(storageDir: string = './.sovereign_data') {
    this.storagePath = `${storageDir}/durable_ledger.json`;
    this.state = this.loadOrInitialize();
  }

  public static getInstance(storageDir?: string): DurableStore {
    if (!DurableStore.instance) {
      DurableStore.instance = new DurableStore(storageDir);
    }
    return DurableStore.instance;
  }

  private isNodeEnv(): boolean {
    return typeof process !== 'undefined' && process.versions != null && process.versions.node != null && typeof window === 'undefined';
  }

  private loadOrInitialize(): DatabaseState {
    if (this.isNodeEnv()) {
      try {
        const fs = require('fs');
        const path = require('path');
        const dir = path.dirname(this.storagePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        if (fs.existsSync(this.storagePath)) {
          const raw = fs.readFileSync(this.storagePath, 'utf8');
          return JSON.parse(raw);
        }
      } catch (e) {
        // fallback
      }
    } else if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem('SOVEREIGN_DURABLE_STORE');
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }

    const initial: DatabaseState = {
      version: '1.0.0-PROD',
      last_checkpoint_hash: computeSha256('INITIAL_ZERO_HASH'),
      users: {},
      tenants: {},
      problems: {},
      paradoxes: {},
      invariants: {},
      solutions: {},
      offers: {},
      proof_bundles: {},
      orders: {},
      payments: {},
      deployments: {},
      checkpoints: {},
      rollback_records: {},
      telemetry: [],
      audit_chain: [
        {
          index: 0,
          timestamp: 1718000000000,
          tenant_id: 'SYSTEM_ROOT',
          actor: 'DAISY_HAMINJA_GENESIS',
          action: 'GENESIS_RECORD',
          target_entity: 'SYSTEM',
          target_id: 'GENESIS',
          payload_hash: computeSha256('GENESIS_PAYLOAD'),
          previous_hash: '0000000000000000000000000000000000000000000000000000000000000000',
          record_hash: '',
          signature: 'SIG_SOVEREIGN_GENESIS_ROOT'
        }
      ],
      failures: {}
    };

    initial.audit_chain[0].record_hash = computeSha256(
      JSON.stringify({
        index: initial.audit_chain[0].index,
        timestamp: initial.audit_chain[0].timestamp,
        tenant_id: initial.audit_chain[0].tenant_id,
        action: initial.audit_chain[0].action,
        previous_hash: initial.audit_chain[0].previous_hash,
        payload_hash: initial.audit_chain[0].payload_hash
      })
    );

    this.persistAtomic(initial);
    return initial;
  }

  public persist(): void {
    this.persistAtomic(this.state);
  }

  private persistAtomic(stateToSave: DatabaseState): void {
    const json = JSON.stringify(stateToSave, null, 2);
    if (this.isNodeEnv()) {
      try {
        const fs = require('fs');
        const tmpPath = `${this.storagePath}.${Date.now()}.tmp`;
        fs.writeFileSync(tmpPath, json, 'utf8');
        fs.renameSync(tmpPath, this.storagePath);
      } catch (e) {}
    } else if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('SOVEREIGN_DURABLE_STORE', json);
      } catch (e) {}
    }
  }

  public getState(): DatabaseState {
    return this.state;
  }

  public createCheckpoint(
    tenant_id: string,
    target_id: string,
    strategy: 'ATOMIC_DATABASE_RESTORE' | 'SANDBOX_REVERT' | 'IRREVERSIBLE_EXTERNAL_ACTION'
  ): CheckpointEntity {
    const snapshotData = JSON.stringify(this.state);
    const snapshotHash = computeSha256(snapshotData);
    const checkpoint: CheckpointEntity = {
      id: `chk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenant_id,
      target_id,
      snapshot_hash: snapshotHash,
      snapshot_data: snapshotData,
      rollback_strategy: strategy,
      created_at: Date.now()
    };
    this.state.checkpoints[checkpoint.id] = checkpoint;
    this.state.last_checkpoint_hash = snapshotHash;
    this.appendAudit(tenant_id, 'SYSTEM_CHECKPOINT', 'CHECKPOINT', 'CHECKPOINT', checkpoint.id, {
      checkpoint_id: checkpoint.id,
      snapshot_hash: snapshotHash
    });
    this.persist();
    return checkpoint;
  }

  public rollbackToCheckpoint(checkpointId: string, reason: string): { success: boolean; error?: string; rollback_record: RollbackRecordEntity; restored_snapshot_hash?: string } {
    const checkpoint = this.state.checkpoints[checkpointId];
    if (!checkpoint) {
      const failedRecord: RollbackRecordEntity = {
        id: `rb_${Date.now()}`,
        checkpoint_id: checkpointId,
        reason,
        restored_snapshot_hash: '',
        status: 'FAILED',
        verified_integrity: false,
        timestamp: Date.now()
      };
      return { success: false, error: 'Checkpoint not found', rollback_record: failedRecord };
    }

    if (checkpoint.rollback_strategy === 'IRREVERSIBLE_EXTERNAL_ACTION') {
      const blockedRecord: RollbackRecordEntity = {
        id: `rb_${Date.now()}`,
        checkpoint_id: checkpointId,
        reason,
        restored_snapshot_hash: checkpoint.snapshot_hash,
        status: 'BLOCKED_IRREVERSIBLE',
        verified_integrity: false,
        timestamp: Date.now()
      };
      this.state.rollback_records[blockedRecord.id] = blockedRecord;
      this.persist();
      return {
        success: false,
        error: 'Execution marked IRREVERSIBLE_EXTERNAL_ACTION. Rollback cannot be performed automatically.',
        rollback_record: blockedRecord
      };
    }

    const currentHash = computeSha256(checkpoint.snapshot_data);
    if (currentHash !== checkpoint.snapshot_hash) {
      const corruptRecord: RollbackRecordEntity = {
        id: `rb_${Date.now()}`,
        checkpoint_id: checkpointId,
        reason,
        restored_snapshot_hash: currentHash,
        status: 'FAILED',
        verified_integrity: false,
        timestamp: Date.now()
      };
      this.state.rollback_records[corruptRecord.id] = corruptRecord;
      this.persist();
      return { success: false, error: 'Checkpoint snapshot hash mismatch! Corrupted state.', rollback_record: corruptRecord };
    }

    const restored: DatabaseState = JSON.parse(checkpoint.snapshot_data);
    const rollbackRecord: RollbackRecordEntity = {
      id: `rb_${Date.now()}`,
      checkpoint_id: checkpointId,
      reason,
      restored_snapshot_hash: checkpoint.snapshot_hash,
      status: 'RESTORED',
      verified_integrity: true,
      timestamp: Date.now()
    };
    restored.rollback_records[rollbackRecord.id] = rollbackRecord;
    this.state = restored;
    this.appendAudit(checkpoint.tenant_id, 'REVERSIBILITY_AGENT', 'ROLLBACK', 'DATABASE_STATE', checkpointId, {
      rollback_id: rollbackRecord.id,
      reason
    });
    this.persist();
    return { success: true, rollback_record: rollbackRecord, restored_snapshot_hash: rollbackRecord.restored_snapshot_hash };
  }

  public appendAudit(
    tenant_id: string,
    actor: string,
    action: string,
    target_entity: string,
    target_id: string,
    payload: any
  ): AuditRecordEntity {
    const chain = this.state.audit_chain;
    const lastRecord = chain[chain.length - 1];
    const previousHash = lastRecord ? lastRecord.record_hash : '0'.repeat(64);
    const payloadHash = computeSha256(JSON.stringify(payload));
    const index = chain.length;
    const timestamp = Date.now();

    const recordToHash = {
      index,
      timestamp,
      tenant_id,
      action,
      previous_hash: previousHash,
      payload_hash: payloadHash
    };
    const recordHash = computeSha256(JSON.stringify(recordToHash));

    const auditRecord: AuditRecordEntity = {
      index,
      timestamp,
      tenant_id,
      actor,
      action,
      target_entity,
      target_id,
      payload_hash: payloadHash,
      previous_hash: previousHash,
      record_hash: recordHash,
      signature: computeSha256(`SIG:${recordHash}:${tenant_id}`)
    };

    chain.push(auditRecord);
    this.persist();
    return auditRecord;
  }

  public verifyChain(): { valid: boolean; total_records: number; broken_index?: number; reason?: string } {
    const chain = this.state.audit_chain;
    if (chain.length === 0) return { valid: false, total_records: 0, reason: 'Empty chain' };

    for (let i = 0; i < chain.length; i++) {
      const rec = chain[i];
      if (i > 0) {
        const prev = chain[i - 1];
        if (rec.previous_hash !== prev.record_hash) {
          return {
            valid: false,
            total_records: chain.length,
            broken_index: i,
            reason: `Previous hash mismatch at index ${i}. Expected ${prev.record_hash}, found ${rec.previous_hash}`
          };
        }
      }
      const expectedRecordHash = computeSha256(
        JSON.stringify({
          index: rec.index,
          timestamp: rec.timestamp,
          tenant_id: rec.tenant_id,
          action: rec.action,
          previous_hash: rec.previous_hash,
          payload_hash: rec.payload_hash
        })
      );
      if (expectedRecordHash !== rec.record_hash) {
        return {
          valid: false,
          total_records: chain.length,
          broken_index: i,
          reason: `Record content tampering at index ${i}. Calculated ${expectedRecordHash}, stored ${rec.record_hash}`
        };
      }
    }
    return { valid: true, total_records: chain.length };
  }

  public recordFailure(failed_gate: string, trigger_reason: string, tenant_id: string, evidence_payload: any): FailureDiversionEntity {
    const evidenceHash = computeSha256(JSON.stringify(evidence_payload));
    const failure: FailureDiversionEntity = {
      id: `fail_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      failed_gate,
      trigger_reason,
      tenant_id,
      evidence_hash: evidenceHash,
      fail_closed_enforced: true,
      timestamp: Date.now()
    };
    this.state.failures[failure.id] = failure;
    this.appendAudit(tenant_id, 'SECURITY_GATE', 'FAIL_CLOSED_DIVERT', 'GATE', failed_gate, {
      failure_id: failure.id,
      reason: trigger_reason
    });
    this.persist();
    return failure;
  }
}
