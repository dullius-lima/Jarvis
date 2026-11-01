// src/services/brainEventsService.ts
import {
  emitBrainPulse,
  emitNeuroPulse,
  emitBrainLinkEvent,
  emitBrainEvent,
  initBrainWebSocketServer,
  NeurotransmitterType,
  BrainLinkEvent
} from './brainSocketService.js';

export {
  emitBrainPulse,
  emitNeuroPulse,
  emitBrainLinkEvent,
  emitBrainEvent,
  initBrainWebSocketServer,
  NeurotransmitterType,
  BrainLinkEvent
};

export function emitNeurotransmitterPulse(
  source: string,
  target: string,
  neurotransmitter: NeurotransmitterType = 'glutamate',
  label?: string,
  metadata?: Record<string, any>
) {
  return emitBrainPulse({
    source,
    target,
    neurotransmitter,
    status: 'processing',
    label: label || `Pulso Sináptico: ${source} -> ${target}`,
    metadata
  });
}

export default {
  emitBrainPulse,
  emitNeuroPulse,
  emitBrainLinkEvent,
  emitBrainEvent,
  emitNeurotransmitterPulse,
  initBrainWebSocketServer
};