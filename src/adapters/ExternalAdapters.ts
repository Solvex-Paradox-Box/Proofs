import { AdapterStatusType } from '../database/DatabaseSchema';

export interface ExternalAdapterStatus {
  adapter_id: string;
  name: string;
  category: string;
  status: AdapterStatusType;
  required_env_vars: string[];
  provided_env_vars: string[];
  live_connected: boolean;
  notes: string;
}

export class ExternalAdapterRegistry {
  public static getInventory(): ExternalAdapterStatus[] {
    const paypalConfigured = !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
    const neonConfigured = !!process.env.DATABASE_URL;
    const solanaConfigured = !!process.env.SOLANA_RPC_URL;

    return [
      {
        adapter_id: 'DN-34',
        name: 'Neon PostgreSQL Serverless',
        category: 'DATABASE',
        status: neonConfigured ? 'AVAILABLE' : 'EXTERNAL_PROVIDER_REQUIRED',
        required_env_vars: ['DATABASE_URL'],
        provided_env_vars: neonConfigured ? ['DATABASE_URL'] : [],
        live_connected: neonConfigured,
        notes: neonConfigured
          ? 'Connected to serverless branch pool.'
          : 'Operating in local sovereign durable store mode. Provide DATABASE_URL for cloud sync.'
      },
      {
        adapter_id: 'DN-35',
        name: 'PayPal Server-Authoritative Gateway',
        category: 'PAYMENTS',
        status: paypalConfigured ? 'AVAILABLE' : 'EXTERNAL_PROVIDER_REQUIRED',
        required_env_vars: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
        provided_env_vars: paypalConfigured ? ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'] : [],
        live_connected: paypalConfigured,
        notes: paypalConfigured
          ? 'Live capture authorization ready.'
          : 'Fail-closed active. No mock payments allowed. Provide credentials in Settings.'
      },
      {
        adapter_id: 'DN-38',
        name: 'Solana Escrow Program',
        category: 'SETTLEMENT',
        status: solanaConfigured ? 'AVAILABLE' : 'EXTERNAL_PROVIDER_REQUIRED',
        required_env_vars: ['SOLANA_RPC_URL'],
        provided_env_vars: solanaConfigured ? ['SOLANA_RPC_URL'] : [],
        live_connected: solanaConfigured,
        notes: solanaConfigured
          ? 'Connected to Solana RPC cluster.'
          : 'Non-custodial smart contract escrow unconfigured.'
      }
    ];
  }
}
