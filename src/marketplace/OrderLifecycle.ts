import { SqliteStore } from '../database/SqliteStore';
import { DurableStore } from '../database/DurableStore';
import { UserContext, AuthService } from '../auth/AuthService';
import { MMTAIProtocol } from '../mmtai/MMTAIProtocol';
import { computeSha256 } from '../database/DatabaseSchema';

export type OrderLifecycleState = 
  | 'OFFER'
  | 'ORDER_CREATED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_CONFIRMED'
  | 'BUILD_AUTHORIZED'
  | 'BUILDING'
  | 'SANDBOX_VALIDATION'
  | 'VERIFICATION'
  | 'DEPLOYMENT_AUTHORIZED'
  | 'DEPLOYED'
  | 'TELEMETRY_ACTIVE'
  | 'COMPLETED'
  | 'REJECTED_UNVERIFIED'
  | 'FAILED_CLOSED'
  | 'ROLLED_BACK';

export const VALID_TRANSITIONS: Record<OrderLifecycleState, OrderLifecycleState[]> = {
  OFFER: ['ORDER_CREATED', 'REJECTED_UNVERIFIED'],
  ORDER_CREATED: ['PAYMENT_PENDING', 'FAILED_CLOSED'],
  PAYMENT_PENDING: ['PAYMENT_CONFIRMED', 'FAILED_CLOSED'],
  PAYMENT_CONFIRMED: ['BUILD_AUTHORIZED', 'FAILED_CLOSED'],
  BUILD_AUTHORIZED: ['BUILDING', 'FAILED_CLOSED'],
  BUILDING: ['SANDBOX_VALIDATION', 'FAILED_CLOSED'],
  SANDBOX_VALIDATION: ['VERIFICATION', 'FAILED_CLOSED'],
  VERIFICATION: ['DEPLOYMENT_AUTHORIZED', 'FAILED_CLOSED'],
  DEPLOYMENT_AUTHORIZED: ['DEPLOYED', 'FAILED_CLOSED'],
  DEPLOYED: ['TELEMETRY_ACTIVE', 'ROLLED_BACK', 'FAILED_CLOSED'],
  TELEMETRY_ACTIVE: ['COMPLETED', 'ROLLED_BACK', 'FAILED_CLOSED'],
  COMPLETED: ['ROLLED_BACK'],
  REJECTED_UNVERIFIED: [],
  FAILED_CLOSED: ['ROLLED_BACK'],
  ROLLED_BACK: []
};

export class OrderLifecycleManager {
  private static instance: OrderLifecycleManager | null = null;
  private sqlite: SqliteStore;
  private durableStore: DurableStore;

  private constructor() {
    this.sqlite = SqliteStore.getInstance();
    this.durableStore = DurableStore.getInstance();
  }

  public static getInstance(): OrderLifecycleManager {
    if (!OrderLifecycleManager.instance) {
      OrderLifecycleManager.instance = new OrderLifecycleManager();
    }
    return OrderLifecycleManager.instance;
  }

  public transitionOrder(
    orderId: string,
    targetState: OrderLifecycleState,
    actor: UserContext,
    evidencePayload?: Record<string, any>
  ): { success: boolean; order?: any; error?: string } {
    const rawDb = this.sqlite.getRawDb();
    const order = rawDb.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) {
      return { success: false, error: `Order [${orderId}] not found` };
    }

    // Tenant isolation check
    if (actor.role !== 'OWNER' && actor.tenant_id !== order.tenant_id) {
      return {
        success: false,
        error: `Tenant Isolation Violation: Actor tenant [${actor.tenant_id}] cannot manipulate order belonging to tenant [${order.tenant_id}]`
      };
    }

    const currentState = order.status as OrderLifecycleState;
    const allowedNext = VALID_TRANSITIONS[currentState] || [];

    if (!allowedNext.includes(targetState)) {
      return {
        success: false,
        error: `Illegal Order State Transition: Cannot transition from [${currentState}] to [${targetState}]. Allowed: [${allowedNext.join(', ')}]`
      };
    }

    // Role check for specific transitions
    if (['BUILD_AUTHORIZED', 'DEPLOYMENT_AUTHORIZED'].includes(targetState)) {
      const auth = AuthService.getInstance().authorize(actor, 'DEPLOY_RUNTIME', order.tenant_id);
      if (!auth.authorized) {
        return { success: false, error: auth.reason };
      }
    }

    const now = Date.now();
    const evidenceHash = evidencePayload ? computeSha256(evidencePayload) : computeSha256(`${orderId}:${currentState}->${targetState}`);

    // Update in SQLite
    this.sqlite.updateTenantRecord('orders', order.tenant_id, orderId, {
      status: targetState,
      evidence_reference: evidenceHash,
      updated_by: actor.user_id,
      updated_at: now
    });

    // Update in DurableStore
    if (this.durableStore.getState().orders[orderId]) {
      this.durableStore.getState().orders[orderId].status = targetState as any;
      this.durableStore.persist();
    }

    // Append Audit Record
    this.durableStore.appendAudit(
      order.tenant_id,
      actor.user_id,
      `ORDER_STATE_TRANSITION_${targetState}`,
      'ORDER',
      orderId,
      {
        previous_state: currentState,
        new_state: targetState,
        evidence_hash: evidenceHash,
        timestamp: now
      }
    );

    // If evidence provided, log to proof_evidence
    if (evidencePayload) {
      this.sqlite.insertRecord('proof_evidence', {
        id: `ev_${now}_${Math.random().toString(36).substring(2, 6)}`,
        tenant_id: order.tenant_id,
        proof_bundle_id: order.proof_bundle_id || 'PB_SYSTEM',
        evidence_type: `TRANSITION_TO_${targetState}`,
        description: `Cryptographic state transition evidence for order ${orderId}`,
        payload_hash: evidenceHash,
        status: 'SEALED',
        version: '1.0.0-PROD',
        created_by: actor.user_id,
        metadata: JSON.stringify(evidencePayload)
      });
    }

    const updatedOrder = rawDb.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    return { success: true, order: updatedOrder };
  }
}
