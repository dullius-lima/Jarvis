// src/services/integrationAndProtocolService.ts
import { executeNodeIntegration, executeExternalConnector } from './integrationService.js';
import { emitBrainPulse } from './brainSocketService.js';

export interface ProtocolExecutionPayload {
  protocol?: 'HTTP' | 'WEBHOOK' | 'GRAPHQL' | 'MQTT' | 'HOME_ASSISTANT' | 'MCP' | string;
  endpoint?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  topic?: string;
  agentSlug?: string;
  prompt?: string;
  query?: string;
}

export async function executeProtocolOrIntegration(
  agentOrSlug: any,
  payload: ProtocolExecutionPayload = {}
): Promise<any> {
  const slug =
    typeof agentOrSlug === 'string' ? agentOrSlug : agentOrSlug?.slug || 'external-node';

  emitBrainPulse({
    source: 'jarvis-core',
    target: slug,
    neurotransmitter: 'ACETILCOLINA',
    status: 'processing',
    label: `Executando protocolo externo [${slug}]`
  });

  try {
    const result = await executeNodeIntegration(agentOrSlug, payload);

    emitBrainPulse({
      source: slug,
      target: 'jarvis-core',
      neurotransmitter: 'DOPAMINA',
      status: 'completed',
      label: `Integração [${slug}] concluída`
    });

    return result;
  } catch (error: any) {
    emitBrainPulse({
      source: slug,
      target: 'jarvis-core',
      neurotransmitter: 'CORTISOL',
      status: 'error',
      label: `Erro na integração [${slug}]: ${error?.message || 'Falha'}`
    });
    throw error;
  }
}

export { executeNodeIntegration, executeExternalConnector };

export default {
  executeProtocolOrIntegration,
  executeNodeIntegration,
  executeExternalConnector
};