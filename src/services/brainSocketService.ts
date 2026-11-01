// src/services/brainSocketService.ts
import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

export type NeurotransmitterType =
  | 'ADRENALINA'
  | 'DOPAMINA'
  | 'SEROTONINA'
  | 'ACETILCOLINA'
  | 'CORTISOL'
  | 'GABA'
  | string;

export interface BrainLinkEvent {
  axon_id?: string;
  source_dendrite?: string;
  target_dendrite?: string;
  source?: string;
  target?: string;
  sourceNode?: string;
  targetNode?: string;
  status?: 'idle' | 'processing' | 'completed' | 'error' | string;
  label?: string;
  message?: string;
  type?: string;
  direction?: 'FORWARD' | 'BACKWARD';
  neurotransmitter?: NeurotransmitterType;
  neurotransmitter_type?: NeurotransmitterType;
  intensity?: number;
  metadata?: Record<string, any>;
  payload?: any;
  timestamp?: string;
}

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function normalizeNeurotransmitter(raw?: string): NeurotransmitterType {
  const val = String(raw || '').trim().toUpperCase();
  if (val === 'DOPAMINE' || val === 'DOPAMINA') return 'DOPAMINA';
  if (val === 'SEROTONIN' || val === 'SEROTONINA' || val === 'GLUTAMATE') return 'SEROTONINA';
  if (val === 'ACETYLCHOLINE' || val === 'ACETILCOLINA') return 'ACETILCOLINA';
  if (val === 'NORADRENALINE' || val === 'NORADRENALINA' || val === 'ADRENALINE' || val === 'ADRENALINA') {
    return 'ADRENALINA';
  }
  if (val === 'CORTISOL') return 'CORTISOL';
  if (val === 'GABA') return 'GABA';
  return 'DOPAMINA';
}

export function initBrainWebSocketServer(server: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log(`🔌 [BrainWebSocket] Nó conectado. Total de conexões: ${clients.size}`);

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', (err: any) => {
      console.warn('⚠️ [BrainWebSocket] Erro de socket:', err?.message || err);
      clients.delete(ws);
    });
  });

  console.log('🧠 [BrainWebSocket] Barramento sináptico ativo.');
  return wss;
}

export function emitNeuroPulse(event: BrainLinkEvent) {
  if (clients.size === 0) return;

  const sourceNode = event.source || event.source_dendrite || event.sourceNode || 'jarvis-core';
  const targetNode = event.target || event.target_dendrite || event.targetNode || 'cortex';
  const normalizedNeuro = normalizeNeurotransmitter(
    event.neurotransmitter || event.neurotransmitter_type
  );

  const payload = JSON.stringify({
    axon_id: event.axon_id || `${sourceNode}->${targetNode}`,
    source_dendrite: sourceNode,
    target_dendrite: targetNode,
    source: sourceNode,
    target: targetNode,
    direction: event.direction || 'FORWARD',
    status: event.status || 'processing',
    label: event.label || event.message || `Pulso Sináptico: ${sourceNode} -> ${targetNode}`,
    neurotransmitter: normalizedNeuro,
    neurotransmitter_type: normalizedNeuro,
    intensity: event.intensity ?? 1.0,
    metadata: event.metadata || event.payload || {},
    timestamp: event.timestamp || new Date().toISOString()
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err: any) {
        console.warn('⚠️ [BrainWebSocket] Falha ao emitir pulso:', err?.message || err);
      }
    }
  }
}

export const emitBrainPulse = emitNeuroPulse;
export const emitBrainLinkEvent = emitNeuroPulse;
export const emitBrainEvent = emitNeuroPulse;

export default {
  initBrainWebSocketServer,
  emitNeuroPulse,
  emitBrainPulse,
  emitBrainLinkEvent,
  emitBrainEvent,
  normalizeNeurotransmitter
};