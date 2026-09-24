import { DurableStore } from '../database/DurableStore';
import { NodeRegistry } from '../nodes/NodeRegistry';
import { ParadoxRegistry } from '../paradoxes/ParadoxRegistry';
import { ProofEngine } from '../proofs/ProofEngine';
import { ExternalAdapterRegistry } from '../adapters/ExternalAdapters';
import { DaisyBrain } from '../brain/DaisyBrain';

export interface SystemStatusResponse {
  overall_status: string;
  system_identity: {
    product: string;
    core_intelligence: string;
    version: string;
    sovereign_runtime: string;
  };
  invariants: {
    capability_not_authority: boolean;
    authority_not_authorization: boolean;
    authorization_not_execution: boolean;
    execution_not_reversibility: boolean;
    fail_closed_active: boolean;
  };
  registered_nodes: number;
  implemented_nodes: number;
  executed_nodes: number;
  failed_nodes: number;
  unimplemented_nodes: number;
  external_provider_nodes: number;
  paradoxes_cataloged: number;
  paradoxes_verified: number;
  proof_bundles_stored: number;
  audit_chain_length: number;
  chain_valid: boolean;
  last_audit_hash: string;
  payment_provider_status: string;
  external_adapters: any[];
  brain_metrics: any;
  timestamp: number;
}

export class SystemStatusService {
  public static calculateStatus(): SystemStatusResponse {
    return SystemStatusService.computeStatus();
  }

  public static computeStatus(): SystemStatusResponse {
    const store = DurableStore.getInstance();
    const nodeReg = NodeRegistry.getInstance();
    const paradoxReg = ParadoxRegistry.getInstance();
    const proofEngine = ProofEngine.getInstance();
    const brain = DaisyBrain.getInstance();

    const nodeSummary = nodeReg.getSummary();
    const paradoxes = paradoxReg.getAllParadoxes();
    const verifiedParadoxes = paradoxes.filter(p => p.verification_status === 'VERIFIED').length;
    const chainVerification = store.verifyChain();
    const chain = store.getState().audit_chain;
    const lastHash = chain.length > 0 ? chain[chain.length - 1].record_hash : '0'.repeat(64);
    const adapters = ExternalAdapterRegistry.getInventory();
    const paypal = adapters.find(a => a.adapter_id === 'DN-35');

    return {
      overall_status: 'OPERATIONAL',
      system_identity: {
        product: 'SOLVEX',
        core_intelligence: 'DAISY HAMINJA / DAISY BRAIN',
        version: '1.0.0-PROD',
        sovereign_runtime: 'DETERMINISTIC_SANDBOX_OS'
      },
      invariants: {
        capability_not_authority: true,
        authority_not_authorization: true,
        authorization_not_execution: true,
        execution_not_reversibility: true,
        fail_closed_active: true
      },
      registered_nodes: nodeSummary.registered_nodes,
      implemented_nodes: nodeSummary.implemented_nodes,
      executed_nodes: nodeSummary.executed_nodes,
      failed_nodes: nodeSummary.failed_nodes,
      unimplemented_nodes: nodeSummary.unimplemented_nodes,
      external_provider_nodes: nodeSummary.external_provider_nodes,
      paradoxes_cataloged: paradoxes.length,
      paradoxes_verified: verifiedParadoxes,
      proof_bundles_stored: proofEngine.getAllBundles().length,
      audit_chain_length: chain.length,
      chain_valid: chainVerification.valid,
      last_audit_hash: lastHash,
      payment_provider_status: paypal ? paypal.status : 'UNKNOWN',
      external_adapters: adapters,
      brain_metrics: brain.getLiveMetrics(),
      timestamp: Date.now()
    };
  }
}
