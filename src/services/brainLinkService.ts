/**
 * BrainLink Service - Cliente WebSocket e Barramento de Eventos Neuro-Sinápticos
 * Gerencia a recepção de estímulos elétricos (Dendritos), transporte assíncrono (Axônios),
 * desempacotamento de lotes (BrainLinkEventBundle), ordenação por sequence_id e
 * animações de sinapse e sinapse quebrada baseadas nos tipos de neurotransmissores.
 */

import {
  BrainLinkEvent,
  BrainLinkEventBundle,
  NeurotransmitterType,
  NEUROTRANSMITTER_CONFIGS,
  DendriteNode,
  AxonEdge,
  DEFAULT_DENDRITES,
  DEFAULT_AXONS,
} from '../types/brainLink';

export interface ActivePulseState {
  id: string;
  event: BrainLinkEvent;
  startTime: number;
  durationMs: number;
  progress: number; // 0.0 a 1.0
  currentIntensity: number;
  isBroken: boolean;
  fadeAlpha: number; // 1.0 decaindo até 0.0
}

type BrainLinkListener = (event: BrainLinkEvent) => void;
type BundleListener = (bundle: BrainLinkEventBundle) => void;
type DendriteStimulusListener = (dendriteId: string, charge: number, type: NeurotransmitterType) => void;

export class BrainLinkService {
  private static instance: BrainLinkService;
  private ws: WebSocket | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 8000;
  private reconnectTimer: any = null;

  private dendrites: Map<string, DendriteNode> = new Map();
  private axons: Map<string, AxonEdge> = new Map();

  private activePulses: Map<string, ActivePulseState> = new Map();
  private eventListeners: Set<BrainLinkListener> = new Set();
  private bundleListeners: Set<BundleListener> = new Set();
  private dendriteListeners: Set<DendriteStimulusListener> = new Set();

  private highestSequenceId = 0;
  private seenSequenceIds = new Set<number>();
  private localSequenceCounter = 10000;

  private isConnected = false;

  private constructor() {
    this.initGraphTopology();
    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  public static getInstance(): BrainLinkService {
    if (!BrainLinkService.instance) {
      BrainLinkService.instance = new BrainLinkService();
    }
    return BrainLinkService.instance;
  }

  private initGraphTopology() {
    DEFAULT_DENDRITES.forEach((d) => this.dendrites.set(d.id, { ...d }));
    DEFAULT_AXONS.forEach((a) => this.axons.set(a.id, { ...a }));
  }

  public getDendrites(): DendriteNode[] {
    return Array.from(this.dendrites.values());
  }

  public getDendrite(id: string): DendriteNode | undefined {
    return this.dendrites.get(id);
  }

  public getAxons(): AxonEdge[] {
    return Array.from(this.axons.values());
  }

  public getAxon(id: string): AxonEdge | undefined {
    return this.axons.get(id);
  }

  public getActivePulses(): ActivePulseState[] {
    return Array.from(this.activePulses.values());
  }

  public isSocketConnected(): boolean {
    return this.isConnected;
  }

  public connect(): void {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/brainlink`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        console.log('[BrainLink WS] Barramento neural conectado com sucesso:', wsUrl);

        // Envia handshake inicial de identificação do cliente 3D
        this.ws?.send(
          JSON.stringify({
            type: 'HANDSHAKE',
            client: 'jarvis-3d-renderer',
            timestamp: Date.now(),
          })
        );
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncomingMessage(data);
        } catch (err) {
          console.warn('[BrainLink WS] Erro ao decodificar frame WebSocket:', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.isConnecting = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[BrainLink WS] Evento de erro no canal WebSocket:', err);
        this.isConnected = false;
      };
    } catch (e) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleIncomingMessage(data: any) {
    if (!data) return;

    // Caso 1: Loteamento de Mensagens (BrainLinkEventBundle) - Otimização WebGL
    if (data.type === 'BUNDLE' && Array.isArray(data.events)) {
      const bundle = data as BrainLinkEventBundle;
      this.bundleListeners.forEach((l) => l(bundle));

      // Ordena eventos do lote pelo sequence_id para evitar inversões
      const sortedEvents = [...bundle.events].sort((a, b) => (a.sequence_id || 0) - (b.sequence_id || 0));
      for (const evt of sortedEvents) {
        this.processEvent(evt);
      }
      return;
    }

    // Caso 2: Evento Individual (BrainLinkEvent)
    if (data.axon_id && data.neurotransmitter_type) {
      this.processEvent(data as BrainLinkEvent);
    }
  }

  public processEvent(event: BrainLinkEvent) {
    // Deduplicação e ordenação cronológica via sequence_id
    if (event.sequence_id) {
      if (this.seenSequenceIds.has(event.sequence_id)) {
        return; // Evento duplicado descartado para manter idempotência
      }
      this.seenSequenceIds.add(event.sequence_id);
      if (this.seenSequenceIds.size > 2000) {
        // Limpeza de cache de IDs antigos
        const arr = Array.from(this.seenSequenceIds);
        this.seenSequenceIds = new Set(arr.slice(arr.length - 1000));
      }
      if (event.sequence_id > this.highestSequenceId) {
        this.highestSequenceId = event.sequence_id;
      }
    }

    const config = NEUROTRANSMITTER_CONFIGS[event.neurotransmitter_type] || NEUROTRANSMITTER_CONFIGS.SEROTONINA;
    const ttl = event.ttl_ms || 2800;
    const duration = ttl / config.pulseSpeed;

    // Estimulação elétrica no Dendrito Emissor
    this.stimulateDendrite(event.source_dendrite, event.intensity, event.neurotransmitter_type);

    const pulseId = `pulse_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isBroken = event.status === 'FAILED';

    const pulseState: ActivePulseState = {
      id: pulseId,
      event,
      startTime: performance.now(),
      durationMs: duration,
      progress: 0,
      currentIntensity: event.intensity,
      isBroken,
      fadeAlpha: 1.0,
    };

    this.activePulses.set(pulseId, pulseState);

    // Notifica listeners
    this.eventListeners.forEach((l) => l(event));

    // Se a entrega for bem-sucedida, agenda a estimulação do Dendrito Receptor na chegada do pulso
    if (!isBroken) {
      setTimeout(() => {
        this.stimulateDendrite(event.target_dendrite, event.intensity * 0.9, event.neurotransmitter_type);
      }, duration * 0.85);
    }
  }

  private stimulateDendrite(dendriteId: string, charge: number, type: NeurotransmitterType) {
    const dendrite = this.dendrites.get(dendriteId);
    if (dendrite) {
      dendrite.electrical_charge = Math.min(1.0, dendrite.electrical_charge + charge);
      dendrite.lastStimulus = Date.now();
      this.dendriteListeners.forEach((l) => l(dendriteId, dendrite.electrical_charge, type));
    }
  }

  /**
   * Atualização contínua de TTL e fade-out suave para o loop 3D do Three.js
   * Evita sobrecarga de FPS descartando conexões finalizadas.
   */
  public updatePulses(now: number): { activePulses: ActivePulseState[]; brokenSparks: ActivePulseState[] } {
    const expired: string[] = [];
    const active: ActivePulseState[] = [];
    const broken: ActivePulseState[] = [];

    // Decaimento suave da carga dos dendritos
    this.dendrites.forEach((d) => {
      if (d.electrical_charge > 0.01) {
        d.electrical_charge *= 0.95;
      } else {
        d.electrical_charge = 0;
      }
    });

    this.activePulses.forEach((pulse, id) => {
      const elapsed = now - pulse.startTime;
      const progress = Math.min(1.0, elapsed / pulse.durationMs);
      pulse.progress = progress;

      // Decaimento suave (fade-out) após 75% da jornada
      if (progress > 0.7) {
        pulse.fadeAlpha = Math.max(0, 1.0 - (progress - 0.7) / 0.3);
      }

      if (pulse.isBroken) {
        broken.push(pulse);
      }

      if (progress >= 1.0) {
        expired.push(id);
      } else {
        active.push(pulse);
      }
    });

    expired.forEach((id) => this.activePulses.delete(id));

    return { activePulses: active, brokenSparks: broken };
  }

  /**
   * Emissão Local / Teste de Neurotransmissor
   */
  public emitPulse(pulseInput: Omit<BrainLinkEvent, 'sequence_id' | 'timestamp'>): BrainLinkEvent {
    const sequence_id = ++this.localSequenceCounter;
    const event: BrainLinkEvent = {
      ...pulseInput,
      sequence_id,
      timestamp: Date.now(),
    };

    // Processa localmente de imediato
    this.processEvent(event);

    // Envia ao servidor via WebSocket se conectado para propagação multi-dispositivo
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'PULSE', event }));
      } catch (err) {
        console.warn('Erro ao transmitir pulso via WS:', err);
      }
    } else {
      // Fallback via HTTP REST
      fetch('/api/brainlink/pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }).catch(() => {});
    }

    return event;
  }

  /**
   * Helper para disparo rápido de cada tipo de Neurotransmissor
   */
  public triggerNeurotransmitterTest(type: NeurotransmitterType, axonId = 'axon-core-cfo') {
    const axon = this.axons.get(axonId) || DEFAULT_AXONS[0];
    return this.emitPulse({
      axon_id: axon.id,
      source_dendrite: axon.source_dendrite,
      target_dendrite: axon.target_dendrite,
      direction: 'FORWARD',
      intensity: 0.9,
      neurotransmitter_type: type,
      status: 'SUCCESS',
      payload_summary: `Estímulo de ${type}: ${NEUROTRANSMITTER_CONFIGS[type].meaning}`,
    });
  }

  /**
   * Helper para disparo de "Sinapse Quebrada" com faísca de desconexão
   */
  public triggerBrokenSynapseTest(axonId = 'axon-core-n8n') {
    const axon = this.axons.get(axonId) || DEFAULT_AXONS[6];
    return this.emitPulse({
      axon_id: axon.id,
      source_dendrite: axon.source_dendrite,
      target_dendrite: axon.target_dendrite,
      direction: 'FORWARD',
      intensity: 1.0,
      neurotransmitter_type: 'CORTISOL',
      status: 'FAILED',
      payload_summary: 'FALHA DE TRANSMISSÃO: Timeout de rota sináptica quebrada (desconexão)',
      ttl_ms: 3200,
    });
  }

  public emitManualPulse(
    axonId = 'axon-core-cfo',
    sourceDendrite = 'dendrite-core-jarvis',
    targetDendrite = 'dendrite-agent-cfo',
    neurotransmitter: NeurotransmitterType = 'SEROTONINA',
    intensity = 0.85,
    summary?: string
  ) {
    return this.emitPulse({
      axon_id: axonId,
      source_dendrite: sourceDendrite,
      target_dendrite: targetDendrite,
      direction: 'FORWARD',
      intensity,
      neurotransmitter_type: neurotransmitter,
      status: 'SUCCESS',
      payload_summary: summary,
    });
  }

  public subscribeToEvents(listener: BrainLinkListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  public subscribeToBundles(listener: BundleListener): () => void {
    this.bundleListeners.add(listener);
    return () => this.bundleListeners.delete(listener);
  }

  public subscribeToDendrites(listener: DendriteStimulusListener): () => void {
    this.dendriteListeners.add(listener);
    return () => this.dendriteListeners.delete(listener);
  }
}

export const brainLinkService = BrainLinkService.getInstance();
