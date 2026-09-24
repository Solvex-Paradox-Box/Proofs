import { SqliteStore } from './SqliteStore';
import { DurableStore } from './DurableStore';
import { computeSha256 } from './DatabaseSchema';

export type RollbackStrategy = 
  | 'ATOMIC_DATABASE_RESTORE'
  | 'SANDBOX_REVERT'
  | 'IRREVERSIBLE_EXTERNAL_ACTION';

export interface CheckpointMetadata {
  checkpoint_id: string;
  tenant_id: string;
  target_id: string;
  snapshot_hash: string;
  rollback_strategy: RollbackStrategy;
  created_at: number;
}

export interface FailureDiversionRecord {
  failure_id: string;
  failed_gate: string;
  trigger_reason: string;
  tenant_id: string;
  execution_id?: string;
  evidence_hash: string;
  checkpoint_id?: string;
  rollback_status: 'ROLLED_BACK' | 'BLOCKED_IRREVERSIBLE' | 'NO_CHECKPOINT';
  fail_closed_enforced: boolean;
  timestamp: number;
}

export class ReversibilityEngine {
  private static instance: ReversibilityEngine | null = null;
  private sqlite: SqliteStore;
  private durableStore: DurableStore;

  private constructor() {
    this.sqlite = SqliteStore.getInstance();
    this.durableStore = DurableStore.getInstance();
  }

  public static getInstance(): ReversibilityEngine {
    if (!ReversibilityEngine.instance) {
      ReversibilityEngine.instance = new ReversibilityEngine();
    }
    return ReversibilityEngine.instance;
  }

  public createCheckpoint(tenantId: string, targetId: string, strategy: RollbackStrategy): CheckpointMetadata {
    const durableChk = this.durableStore.createCheckpoint(tenantId, targetId, strategy as any);
    const now = Date.now();

    this.sqlite.insertRecord('checkpoints', {
      id: durableChk.id,
      tenant_id: tenantId,
      target_id: targetId,
      snapshot_hash: durableChk.snapshot_hash,
      snapshot_data: durableChk.snapshot_data,
      rollback_strategy: strategy,
      status: 'ACTIVE',
      version: '1.0.0-PROD',
      created_at: now
    });

    return {
      checkpoint_id: durableChk.id,
      tenant_id: tenantId,
      target_id: targetId,
      snapshot_hash: durableChk.snapshot_hash,
      rollback_strategy: strategy,
      created_at: now
    };
  }

  public executeRollback(checkpointId: string, reason: string): { success: boolean; error?: string; restored_hash?: string } {
    const rawDb = this.sqlite.getRawDb();
    const chk = rawDb.get('SELECT * FROM checkpoints WHERE id = ?', [checkpointId]);
    if (!chk) {
      return { success: false, error: `Checkpoint [${checkpointId}] not found in persistence` };
    }

    if (chk.rollback_strategy === 'IRREVERSIBLE_EXTERNAL_ACTION') {
      this.sqlite.insertRecord('rollback_records', {
        id: `rb_rec_${Date.now()}`,
        tenant_id: chk.tenant_id,
        checkpoint_id: checkpointId,
        reason,
        restored_snapshot_hash: 'N/A',
        status: 'BLOCKED_IRREVERSIBLE',
        verified_integrity: 0,
        version: '1.0.0-PROD'
      });
      return {
        success: false,
        error: `Cannot rollback checkpoint marked IRREVERSIBLE_EXTERNAL_ACTION (e.g. Captured external payment or blockchain tx). Explicit admin authorization required.`
      };
    }

    const res = this.durableStore.rollbackToCheckpoint(checkpointId, reason);
    if (!res.success) {
      return { success: false, error: res.error };
    }

    this.sqlite.insertRecord('rollback_records', {
      id: `rb_rec_${Date.now()}`,
      tenant_id: chk.tenant_id,
      checkpoint_id: checkpointId,
      reason,
      restored_snapshot_hash: res.restored_snapshot_hash || chk.snapshot_hash,
      status: 'RESTORED',
      verified_integrity: 1,
      version: '1.0.0-PROD'
    });

    return { success: true, restored_hash: res.restored_snapshot_hash };
  }

  public divertFailure(
    failedGate: string,
    triggerReason: string,
    tenantId: string,
    executionId?: string,
    checkpointId?: string,
    evidence?: any
  ): FailureDiversionRecord {
    const now = Date.now();
    const failureId = `fail_${now}_${Math.random().toString(36).substring(2, 6)}`;
    const evidenceHash = computeSha256(evidence || { failedGate, triggerReason, now });

    let rollbackStatus: FailureDiversionRecord['rollback_status'] = 'NO_CHECKPOINT';

    if (checkpointId) {
      const rollbackRes = this.executeRollback(checkpointId, `Automatic diversion rollback on gate [${failedGate}]: ${triggerReason}`);
      if (rollbackRes.success) {
        rollbackStatus = 'ROLLED_BACK';
      } else if (rollbackRes.error?.includes('IRREVERSIBLE_EXTERNAL_ACTION')) {
        rollbackStatus = 'BLOCKED_IRREVERSIBLE';
      }
    }

    const failureRecord: FailureDiversionRecord = {
      failure_id: failureId,
      failed_gate: failedGate,
      trigger_reason: triggerReason,
      tenant_id: tenantId,
      execution_id: executionId,
      evidence_hash: evidenceHash,
      checkpoint_id: checkpointId,
      rollback_status: rollbackStatus,
      fail_closed_enforced: true,
      timestamp: now
    };

    this.sqlite.insertRecord('failures', {
      id: failureId,
      tenant_id: tenantId,
      failed_gate: failedGate,
      trigger_reason: triggerReason,
      evidence_hash: evidenceHash,
      reverted_to_checkpoint: checkpointId,
      fail_closed_enforced: 1,
      status: 'DIVERTED',
      version: '1.0.0-PROD',
      created_at: now
    });

    this.durableStore.appendAudit(
      tenantId,
      'REVERSIBILITY_ENGINE',
      'FAILURE_DIVERSION_TRIGGERED',
      'FAILURE',
      failureId,
      {
        failed_gate: failedGate,
        trigger_reason: triggerReason,
        rollback_status: rollbackStatus,
        evidence_hash: evidenceHash
      }
    );

    return failureRecord;
  }
}
