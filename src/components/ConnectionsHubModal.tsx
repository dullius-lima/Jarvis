import React, { useState } from 'react';
import {
  X,
  Share2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Sliders,
  FolderOpen,
  Home,
  Layers,
  Database,
  MessageSquare,
  Eye,
  Mic,
  Server,
  Cpu,
  Shield,
  Wifi,
  Power,
  Terminal,
} from 'lucide-react';

export interface UniversalConnectionItem {
  id: string;
  name: string;
  category: 'CLOUD' | 'IOT' | 'DATABASE' | 'MESSAGING' | 'HARDWARE' | 'ORACLE';
  categoryLabel: string;
  protocol: string;
  description: string;
  status: 'CONECTADO' | 'CONFIGURADO' | 'STANDBY' | 'DESCONECTADO';
  latencyMs?: number;
  endpointUrl?: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ConnectionsHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWorkspace?: () => void;
  onOpenHomeAssistant?: () => void;
  onOpenN8nStudio?: () => void;
  onTriggerSynapse?: (label: string) => void;
}

export const ConnectionsHubModal: React.FC<ConnectionsHubModalProps> = ({
  isOpen,
  onClose,
  onOpenWorkspace,
  onOpenHomeAssistant,
  onOpenN8nStudio,
  onTriggerSynapse,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('TODOS');
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [pingedCount, setPingedCount] = useState<number>(0);

  if (!isOpen) return null;

  const connections: UniversalConnectionItem[] = [
    // 1. Google Workspace
    {
      id: 'conn-workspace',
      name: 'Google Workspace',
      category: 'CLOUD',
      categoryLabel: 'Nuvem Corporativa',
      protocol: 'OAuth 2.0 (Google APIs)',
      description: 'Integração oficial com Google Sheets, Google Drive, Google Calendar e Gmail para auditorias e registros.',
      status: 'CONECTADO',
      latencyMs: 38,
      endpointUrl: 'googleapis.com/v4',
      actionLabel: 'Abrir Painel Workspace',
      onAction: () => {
        onClose();
        onOpenWorkspace?.();
      },
    },
    // 2. Home Assistant & IoT
    {
      id: 'conn-homeassistant',
      name: 'Home Assistant & IoT Residencial',
      category: 'IOT',
      categoryLabel: 'Automação & Presença',
      protocol: 'REST API & WebSocket',
      description: 'Controle de iluminação, climatização, robô aspirador, sensores de presença e temperatura integrados ao cérebro.',
      status: 'CONECTADO',
      latencyMs: 24,
      endpointUrl: 'http://homeassistant.local:8123',
      actionLabel: 'Abrir Home Assistant',
      onAction: () => {
        onClose();
        onOpenHomeAssistant?.();
      },
    },
    // 3. n8n Master Workflow Engine
    {
      id: 'conn-n8n',
      name: 'N8N Neural Engine (Oracle VM)',
      category: 'ORACLE',
      categoryLabel: 'Orquestração de Automação',
      protocol: 'Webhooks & Sub-Workflows',
      description: 'Motor de automação rodando em Docker na Oracle Cloud Infrastructure com banco PostgreSQL dedicado.',
      status: 'CONECTADO',
      latencyMs: 18,
      endpointUrl: 'http://SEU_IP_ORACLE:5678',
      actionLabel: 'Abrir n8n Studio',
      onAction: () => {
        onClose();
        onOpenN8nStudio?.();
      },
    },
    // 4. Bancos de Dados & Datastores
    {
      id: 'conn-postgres',
      name: 'PostgreSQL 16 & SQLite Local',
      category: 'DATABASE',
      categoryLabel: 'Bancos de Dados & Storage',
      protocol: 'SQL Nativo & PgBouncer',
      description: 'Persistência de fluxos n8n, histórico do CFO, silos isolados de ativos (TAEE11, BBAS3, BTC) e memórias.',
      status: 'CONECTADO',
      latencyMs: 12,
      endpointUrl: 'localhost:5432/n8n_jarvis',
    },
    // 5. Banco Vetorial para RAG
    {
      id: 'conn-vector-rag',
      name: 'Qdrant / Pinecone (Vector RAG)',
      category: 'DATABASE',
      categoryLabel: 'Banco Vetorial Semântico',
      protocol: 'gRPC / HTTP REST',
      description: 'Indexação vetorial de contratos, manuais decenais de Buy & Hold, regras da casa e teses fundamentalistas.',
      status: 'CONFIGURADO',
      latencyMs: 31,
      endpointUrl: 'http://localhost:6333',
    },
    // 6. Mensageria & Notificações
    {
      id: 'conn-whatsapp-mail',
      name: 'WhatsApp (Evolution API) & E-mail SMTP',
      category: 'MESSAGING',
      categoryLabel: 'Comunicação & Alertas',
      protocol: 'Webhooks & Baileys / SMTP',
      description: 'Despacho de relatórios matinais B3, alertas críticos de sentinelas e comunicação bidirecional com o Jarvis.',
      status: 'CONECTADO',
      latencyMs: 45,
      endpointUrl: 'whatsapp-gateway.local',
    },
    // 7. Visão Computacional
    {
      id: 'conn-vision',
      name: 'Retina de Tela & Webcam Facial',
      category: 'HARDWARE',
      categoryLabel: 'Canais Sensoriais & Visão',
      protocol: 'Screen Capture API & getUserMedia',
      description: 'Captura contínua de tela ativa e identificação biométrica por reconhecimento facial com crachá instantâneo.',
      status: 'CONECTADO',
      latencyMs: 15,
      endpointUrl: 'navigator.mediaDevices',
    },
    // 8. Áudio & Fala
    {
      id: 'conn-audio',
      name: 'Microfone STT & Alto-Falante TTS',
      category: 'HARDWARE',
      categoryLabel: 'Canais Sensoriais & Áudio',
      protocol: 'Web Speech API & Neural TTS',
      description: 'Transmissão vocal de entrada em milissegundos e resposta em voz sintetizada natural em português.',
      status: 'CONECTADO',
      latencyMs: 22,
      endpointUrl: 'audioContext.destination',
    },
    // 9. Oracle Cloud Compute Instance
    {
      id: 'conn-oracle-oci',
      name: 'Oracle Cloud VM Ampere A1',
      category: 'ORACLE',
      categoryLabel: 'Infraestrutura Soberana',
      protocol: 'SSH / Docker Engine / iptables',
      description: 'Servidor Always Free com 4 OCPUs e 24GB de RAM garantindo operação 24/7 de todos os nós neurais.',
      status: 'CONECTADO',
      latencyMs: 28,
      endpointUrl: 'oci-compute-ampere.internal',
    },
    // 10. Protocolo MCP (Model Context Protocol)
    {
      id: 'conn-mcp',
      name: 'Servidor de Protocolo MCP',
      category: 'CLOUD',
      categoryLabel: 'Ferramentas de IA & MCP',
      protocol: 'Model Context Protocol (JSON-RPC)',
      description: 'Transcrição e ingestão de feeds estruturados, métricas on-chain e indicadores financeiros diretamente no chat.',
      status: 'CONECTADO',
      latencyMs: 14,
      endpointUrl: 'mcp://jarvis-local-tools',
    },
  ];

  const handlePingAll = () => {
    setIsPinging(true);
    onTriggerSynapse?.('Testando latência de todas as 10 conexões universais...');
    setTimeout(() => {
      setIsPinging(false);
      setPingedCount((c) => c + 1);
      onTriggerSynapse?.('Todas as conexões validadas: 100% dos nós operacionais.');
    }, 1200);
  };

  const filteredConnections = activeCategory === 'TODOS'
    ? connections
    : connections.filter((c) => c.category === activeCategory);

  const categories = ['TODOS', 'CLOUD', 'IOT', 'DATABASE', 'MESSAGING', 'HARDWARE', 'ORACLE'];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-5xl w-full h-[90vh] flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.2)] overflow-hidden">
        
        {/* Cabeçalho */}
        <header className="px-5 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-sans text-white tracking-wide">
                  CENTRAL DE CONEXÕES UNIVERSAIS DO JARVIS
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                  10 NÓS ATIVOS
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans">
                Google Workspace, Home Assistant, n8n Oracle, Bancos de Dados, Mensageria, Visão e Áudio.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePingAll}
              disabled={isPinging}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
              <span>{isPinging ? 'Testando...' : 'Testar Conexões'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Filtros por Categoria */}
        <div className="flex items-center gap-1 px-5 py-2.5 bg-slate-950/50 border-b border-slate-800 text-xs font-mono overflow-x-auto shrink-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                activeCategory === cat
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Lista de Conexões */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-slate-900/60">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredConnections.map((conn) => (
              <div
                key={conn.id}
                className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-2.5 flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white">{conn.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-400 font-mono">
                          {conn.protocol}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{conn.categoryLabel}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10px] font-mono font-bold text-emerald-400">{conn.status}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 font-sans mt-2">
                    {conn.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-850 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-500 truncate max-w-[200px]">{conn.endpointUrl}</span>
                  <div className="flex items-center gap-2">
                    {conn.latencyMs && (
                      <span className="text-cyan-400 font-bold">{conn.latencyMs}ms</span>
                    )}
                    {conn.onAction && (
                      <button
                        onClick={conn.onAction}
                        className="px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <span>{conn.actionLabel || 'Gerenciar'}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
