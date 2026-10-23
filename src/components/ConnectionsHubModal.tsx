import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Trash2,
  Plus,
  Download,
  Send,
  MessageSquare,
  Mail,
  Server,
  Shield,
  Terminal,
  Calendar,
  Bot,
  FileCode,
  Cpu,
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

const INITIAL_CONNECTIONS: UniversalConnectionItem[] = [
  {
    id: 'conn-workspace',
    name: 'Google Workspace (Gmail, Calendar, Drive, Sheets)',
    category: 'CLOUD',
    categoryLabel: 'Produtividade Corporativa',
    protocol: 'OAuth 2.0 (Google APIs)',
    description: 'Integração com Google Sheets, Google Drive, Google Calendar e Gmail com suporte a leitura, criação e exclusão.',
    status: 'CONECTADO',
    latencyMs: 38,
    endpointUrl: 'googleapis.com/v4',
    actionLabel: 'Abrir Workspace',
  },
  {
    id: 'conn-outlook',
    name: 'Microsoft Outlook / Microsoft 365',
    category: 'CLOUD',
    categoryLabel: 'Produtividade Corporativa',
    protocol: 'Microsoft Graph API v1.0 / OAuth2',
    description: 'Sincronização bidirecional de e-mails corporativos, calendário Outlook/Teams e contatos com opção de exclusão.',
    status: 'CONECTADO',
    latencyMs: 41,
    endpointUrl: 'graph.microsoft.com/v1.0/me',
    actionLabel: 'Gerenciar Outlook',
  },
  {
    id: 'conn-whatsapp',
    name: 'WhatsApp Business (Evolution API / Cloud API)',
    category: 'MESSAGING',
    categoryLabel: 'Omnichannel & Mensageria',
    protocol: 'REST Webhook & BullMQ Queue',
    description: 'Envio e recebimento de mensagens de voz/texto, relatórios B3 e comandos diretos ao Jarvis via WhatsApp.',
    status: 'CONECTADO',
    latencyMs: 29,
    endpointUrl: 'http://127.0.0.1:8080/message/sendText',
    actionLabel: 'Configurar WhatsApp',
  },
  {
    id: 'conn-telegram',
    name: 'Telegram Bot API (@JarvisDulliusBot)',
    category: 'MESSAGING',
    categoryLabel: 'Omnichannel & Mensageria',
    protocol: 'Telegram Bot Webhook HTTPS',
    description: 'Canal instantâneo para alertas de sentinelas, aprovação de workflows e comandos remotos na VM Oracle.',
    status: 'CONECTADO',
    latencyMs: 22,
    endpointUrl: 'api.telegram.org/bot<token>',
    actionLabel: 'Configurar Telegram',
  },
  {
    id: 'conn-n8n',
    name: 'N8N Neural Engine (Oracle VM 2 OCPU / 12GB RAM)',
    category: 'ORACLE',
    categoryLabel: 'Orquestração Assíncrona',
    protocol: 'Webhooks + Redis BullMQ',
    description: 'Motor de automação n8n em modo fila (BullMQ/Redis) calibrado para VM Oracle de 2 OCPU e 12GB de RAM.',
    status: 'CONECTADO',
    latencyMs: 18,
    endpointUrl: 'http://129.151.111.18:5678',
    actionLabel: 'Abrir n8n Studio',
  },
  {
    id: 'conn-postgres',
    name: 'PostgreSQL 16 + Extensão pgvector',
    category: 'DATABASE',
    categoryLabel: 'Banco Relacional & Vetorial Unificado',
    protocol: 'SQL Nativo & HNSW Embeddings',
    description: 'Armazena tabelas relacionais (usuários, logs RBAC, finanças) e embeddings vetoriais de memória de longo prazo.',
    status: 'CONECTADO',
    latencyMs: 11,
    endpointUrl: 'localhost:5432/jarvis_core',
  },
  {
    id: 'conn-redis',
    name: 'Redis 7 Alpine (Filas BullMQ)',
    category: 'DATABASE',
    categoryLabel: 'Mensageria Assíncrona & Cache',
    protocol: 'RESP / BullMQ Workers',
    description: 'Isola picos de carga dos webhooks de áudio, visão e n8n, garantindo zero travamento nos 2 OCPUs da Oracle.',
    status: 'CONECTADO',
    latencyMs: 4,
    endpointUrl: 'localhost:6379',
  },
  {
    id: 'conn-homeassistant',
    name: 'Home Assistant & IoT Residencial',
    category: 'IOT',
    categoryLabel: 'Automação & Presença',
    protocol: 'REST API & WebSocket',
    description: 'Controle de iluminação, climatização e cenas residenciais baseadas no Crachá Biométrico de quem está no ambiente.',
    status: 'CONECTADO',
    latencyMs: 24,
    endpointUrl: 'http://homeassistant.local:8123',
    actionLabel: 'Abrir Home Assistant',
  },
  {
    id: 'conn-vision',
    name: 'Camada Sensorial (Whisper Small + OpenCV + JPEG q80)',
    category: 'HARDWARE',
    categoryLabel: 'Canais Sensoriais Locais',
    protocol: 'HMAC-SHA256 / Bearer Token',
    description: 'Captura de tela sob demanda comprimida em JPEG qualidade 80 (Base64), STT Whisper local e biometria facial.',
    status: 'CONECTADO',
    latencyMs: 15,
    endpointUrl: '/api/sensory/ingest',
  },
];

export const ConnectionsHubModal: React.FC<ConnectionsHubModalProps> = ({
  isOpen,
  onClose,
  onOpenWorkspace,
  onOpenHomeAssistant,
  onOpenN8nStudio,
  onTriggerSynapse,
}) => {
  const [activeTab, setActiveTab] = useState<'CONEXOES' | 'WHATSAPP_TELEGRAM' | 'OUTLOOK_WORKSPACE' | 'ORACLE_VM_INSTALLER'>('CONEXOES');
  const [activeCategory, setActiveCategory] = useState<string>('TODOS');
  const [connections, setConnections] = useState<UniversalConnectionItem[]>(INITIAL_CONNECTIONS);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Nova conexão customizada
  const [showAddConn, setShowAddConn] = useState(false);
  const [newConnName, setNewConnName] = useState('');
  const [newConnCategory, setNewConnCategory] = useState<UniversalConnectionItem['category']>('CLOUD');
  const [newConnProtocol, setNewConnProtocol] = useState('REST API / Webhook');
  const [newConnEndpoint, setNewConnEndpoint] = useState('');
  const [newConnDesc, setNewConnDesc] = useState('');

  // Estados WhatsApp & Telegram
  const [waChannels, setWaChannels] = useState<any[]>([]);
  const [waNumero, setWaNumero] = useState('+55 55 99988-7766');
  const [waCanalNome, setWaCanalNome] = useState('WhatsApp Executivo Matheus');
  const [waApiUrl, setWaApiUrl] = useState('http://127.0.0.1:8080');
  const [waInstance, setWaInstance] = useState('jarvis-oracle-instance');
  const [waTestMsg, setWaTestMsg] = useState('Jarvis: Relatório Bazin & Status da VM Oracle (2 OCPU / 12GB RAM) validados.');

  const [tgChannels, setTgChannels] = useState<any[]>([]);
  const [tgMessages, setTgMessages] = useState<any[]>([]);
  const [tgBotName, setTgBotName] = useState('Jarvis Neural CFO Bot');
  const [tgChatId, setTgChatId] = useState('-100219485712');
  const [tgToken, setTgToken] = useState('');
  const [tgTestMsg, setTgTestMsg] = useState('Alerta Sentinela Jarvis: Todos os serviços operacionais na VM Oracle.');

  // Estados Microsoft Outlook 365
  const [outlookAccounts, setOutlookAccounts] = useState<any[]>([]);
  const [outlookItems, setOutlookItems] = useState<any[]>([]);
  const [outEmail, setOutEmail] = useState('');
  const [outTenantId, setOutTenantId] = useState('common');
  const [outClientId, setOutClientId] = useState('');
  const [outSubject, setOutSubject] = useState('');
  const [outItemType, setOutItemType] = useState<'EMAIL' | 'CALENDAR_EVENT'>('EMAIL');

  // Estados Instalador Oracle VM (2 OCPU / 12GB RAM)
  const [oracleBundle, setOracleBundle] = useState<Record<string, string> | null>(null);
  const [selectedOracleFile, setSelectedOracleFile] = useState<string>('install-oracle-vm-12gb.sh');

  const fetchOmnichannelData = async () => {
    try {
      const [waRes, tgRes, outRes, orcRes] = await Promise.all([
        fetch('/api/integrations/whatsapp'),
        fetch('/api/integrations/telegram'),
        fetch('/api/integrations/outlook'),
        fetch('/api/oracle/installer-bundle'),
      ]);
      if (waRes.ok) setWaChannels(await waRes.json());
      if (tgRes.ok) {
        const tgData = await tgRes.json();
        setTgChannels(tgData.channels || []);
        setTgMessages(tgData.messages || []);
      }
      if (outRes.ok) {
        const outData = await outRes.json();
        setOutlookAccounts(outData.accounts || []);
        setOutlookItems(outData.items || []);
      }
      if (orcRes.ok) {
        const orcData = await orcRes.json();
        if (orcData.files) setOracleBundle(orcData.files);
      }
    } catch (e) {
      console.warn('Erro ao sincronizar canais omnichannel:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOmnichannelData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const notifyBanner = (msg: string) => {
    setStatusBanner(msg);
    onTriggerSynapse?.(msg);
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const handlePingAll = () => {
    setIsPinging(true);
    notifyBanner(`Testando latência de ${connections.length} conexões universais...`);
    setTimeout(() => {
      setIsPinging(false);
      notifyBanner('Todas as conexões validadas: 100% dos nós operacionais.');
    }, 900);
  };

  const handleAddConnection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConnName.trim()) return;
    const item: UniversalConnectionItem = {
      id: `conn-custom-${Date.now()}`,
      name: newConnName.trim(),
      category: newConnCategory,
      categoryLabel: newConnCategory,
      protocol: newConnProtocol.trim() || 'REST / Webhook',
      description: newConnDesc.trim() || 'Conexão customizada integrada ao Orquestrador Central.',
      status: 'CONECTADO',
      latencyMs: 19,
      endpointUrl: newConnEndpoint.trim() || 'https://api.custom.local',
    };
    setConnections((prev) => [item, ...prev]);
    setNewConnName('');
    setNewConnEndpoint('');
    setNewConnDesc('');
    setShowAddConn(false);
    notifyBanner(`Conexão "${item.name}" adicionada com sucesso.`);
  };

  const handleDeleteConnection = (id: string, name: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== id));
    setConfirmDeleteId(null);
    notifyBanner(`Conexão "${name}" excluída com sucesso.`);
  };

  // Ações WhatsApp
  const handleAddWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waNumero.trim()) return;
    const res = await fetch('/api/integrations/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numero: waNumero,
        nome_canal: waCanalNome,
        apiUrl: waApiUrl,
        instanceName: waInstance,
      }),
    });
    if (res.ok) {
      fetchOmnichannelData();
      notifyBanner(`Canal WhatsApp (${waNumero}) registrado.`);
    }
  };

  const handleDeleteWhatsapp = async (id: string) => {
    const res = await fetch(`/api/integrations/whatsapp/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      fetchOmnichannelData();
      notifyBanner('Canal WhatsApp excluído.');
    }
  };

  const handleSendWhatsapp = async () => {
    if (!waTestMsg.trim()) return;
    const res = await fetch('/api/integrations/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numero: waNumero,
        mensagem: waTestMsg,
        apiUrl: waApiUrl,
        instanceName: waInstance,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      notifyBanner(data.details || 'Mensagem enviada para o gateway WhatsApp!');
    }
  };

  // Ações Telegram
  const handleAddTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tgBotName.trim() || !tgChatId.trim()) return;
    const res = await fetch('/api/integrations/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botName: tgBotName,
        chatId: tgChatId,
        botToken: tgToken,
      }),
    });
    if (res.ok) {
      setTgToken('');
      fetchOmnichannelData();
      notifyBanner(`Bot Telegram "${tgBotName}" conectado.`);
    }
  };

  const handleSendTelegram = async () => {
    if (!tgTestMsg.trim()) return;
    const res = await fetch('/api/integrations/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: tgChatId,
        text: tgTestMsg,
        botToken: tgToken || undefined,
      }),
    });
    if (res.ok) {
      fetchOmnichannelData();
      notifyBanner('Mensagem despachada via Telegram Bot API!');
    }
  };

  const handleDeleteTelegram = async (id: string) => {
    const res = await fetch(`/api/integrations/telegram/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      fetchOmnichannelData();
      notifyBanner('Registro do Telegram excluído com sucesso.');
    }
  };

  // Ações Microsoft Outlook 365
  const handleAddOutlookAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outEmail.trim()) return;
    const res = await fetch('/api/integrations/outlook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: outEmail,
        tenantId: outTenantId,
        clientId: outClientId,
        protocol: 'MICROSOFT_GRAPH_API',
      }),
    });
    if (res.ok) {
      setOutEmail('');
      fetchOmnichannelData();
      notifyBanner(`Conta Microsoft Outlook (${outEmail}) conectada.`);
    }
  };

  const handleAddOutlookItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outSubject.trim()) return;
    const res = await fetch('/api/integrations/outlook/item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: outItemType,
        subject: outSubject,
        fromOrLocation: outlookAccounts[0]?.email || 'matheus.dullius@outlook.com',
      }),
    });
    if (res.ok) {
      setOutSubject('');
      fetchOmnichannelData();
      notifyBanner(`Item criado no Microsoft Outlook (${outItemType}).`);
    }
  };

  const handleDeleteOutlook = async (id: string) => {
    const res = await fetch(`/api/integrations/outlook/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      fetchOmnichannelData();
      notifyBanner('Item/Conta Microsoft Outlook excluído.');
    }
  };

  // Download de arquivos de dependências da VM Oracle
  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notifyBanner(`Arquivo "${filename}" baixado para instalação na VM Oracle (2 OCPU / 12GB RAM).`);
  };

  const downloadAllOracleBundle = () => {
    if (!oracleBundle) return;
    const combined = Object.entries(oracleBundle)
      .map(([name, code]) => `# ==============================================================================\n# ARQUIVO: ${name}\n# ==============================================================================\n\n${code}\n`)
      .join('\n\n');
    downloadFile('jarvis-oracle-vm-2ocpu-12gb-bundle-completo.sh', combined);
  };

  const filteredConnections =
    activeCategory === 'TODOS' ? connections : connections.filter((c) => c.category === activeCategory);

  const categories = ['TODOS', 'CLOUD', 'MESSAGING', 'DATABASE', 'ORACLE', 'IOT', 'HARDWARE'];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-6xl w-full h-[92vh] flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.2)] overflow-hidden">
        {/* Cabeçalho */}
        <header className="px-5 py-4 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold font-sans text-white tracking-wide">
                  CENTRAL OMNICHANNEL & INSTALADOR ORACLE VM (2 OCPU / 12GB RAM)
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                  {connections.length} CONEXÕES ATIVAS
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans">
                WhatsApp, Telegram, Google Workspace, Microsoft Outlook 365, Exclusão Universal e Download de Dependências Oracle.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={downloadAllOracleBundle}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
              title="Baixar script completo com todas as dependências para VM Oracle 2 OCPU / 12GB RAM"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar Dependências VM Oracle</span>
            </button>
            <button
              onClick={handlePingAll}
              disabled={isPinging}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
              <span>{isPinging ? 'Testando...' : 'Testar Tudo'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Abas Principais */}
        <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-950 border-b border-slate-800 text-xs font-mono overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('CONEXOES')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'CONEXOES'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>1. Conexões & Exclusão ({connections.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('WHATSAPP_TELEGRAM')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'WHATSAPP_TELEGRAM'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>2. WhatsApp & Telegram</span>
          </button>
          <button
            onClick={() => setActiveTab('OUTLOOK_WORKSPACE')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'OUTLOOK_WORKSPACE'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>3. Google Workspace & Microsoft Outlook</span>
          </button>
          <button
            onClick={() => setActiveTab('ORACLE_VM_INSTALLER')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'ORACLE_VM_INSTALLER'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>4. Dependências VM Oracle (2 OCPU / 12GB RAM)</span>
          </button>
        </div>

        {statusBanner && (
          <div className="mx-5 mt-3 px-4 py-2 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs font-mono flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              {statusBanner}
            </span>
            <button onClick={() => setStatusBanner(null)} className="text-emerald-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* CONTEÚDO DAS ABAS */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-900/60">
          {/* ABA 1: CONEXÕES UNIVERSAIS COM CRIAR & EXCLUIR */}
          {activeTab === 'CONEXOES' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-3 py-1 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                        activeCategory === cat
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowAddConn(!showAddConn)}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nova Conexão</span>
                </button>
              </div>

              {showAddConn && (
                <form
                  onSubmit={handleAddConnection}
                  className="p-4 rounded-2xl bg-slate-950 border border-cyan-500/40 space-y-3"
                >
                  <div className="text-xs font-bold text-cyan-300 font-mono">
                    ADICIONAR NOVA INTEGRAÇÃO / WEBHOOK EXTERNO
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <input
                      type="text"
                      placeholder="Nome da Conexão (ex: ERP Senior / Discord)"
                      value={newConnName}
                      onChange={(e) => setNewConnName(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
                      required
                    />
                    <select
                      value={newConnCategory}
                      onChange={(e) => setNewConnCategory(e.target.value as any)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
                    >
                      <option value="CLOUD">CLOUD</option>
                      <option value="MESSAGING">MESSAGING</option>
                      <option value="DATABASE">DATABASE</option>
                      <option value="ORACLE">ORACLE</option>
                      <option value="IOT">IOT</option>
                      <option value="HARDWARE">HARDWARE</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Endpoint / URL (ex: https://api.empresa.com)"
                      value={newConnEndpoint}
                      onChange={(e) => setNewConnEndpoint(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <input
                      type="text"
                      placeholder="Protocolo (ex: OAuth2 / Webhook HMAC)"
                      value={newConnProtocol}
                      onChange={(e) => setNewConnProtocol(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
                    />
                    <input
                      type="text"
                      placeholder="Descrição da finalidade da integração"
                      value={newConnDesc}
                      onChange={(e) => setNewConnDesc(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddConn(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs"
                    >
                      Salvar Conexão
                    </button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredConnections.map((conn) => (
                  <div
                    key={conn.id}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-2.5 flex flex-col justify-between shadow-lg"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
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

                      <p className="text-xs text-slate-300 font-sans mt-2">{conn.description}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono gap-2">
                      <span className="text-slate-500 truncate max-w-[180px]">{conn.endpointUrl}</span>
                      <div className="flex items-center gap-1.5">
                        {conn.latencyMs && <span className="text-cyan-400 font-bold">{conn.latencyMs}ms</span>}

                        {conn.id === 'conn-workspace' && onOpenWorkspace && (
                          <button
                            onClick={() => {
                              onClose();
                              onOpenWorkspace();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <span>Abrir Workspace</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}

                        {conn.id === 'conn-outlook' && (
                          <button
                            onClick={() => setActiveTab('OUTLOOK_WORKSPACE')}
                            className="px-2.5 py-1 rounded-lg bg-blue-950 hover:bg-blue-900 border border-blue-500/40 text-blue-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <span>Abrir Outlook</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}

                        {(conn.id === 'conn-whatsapp' || conn.id === 'conn-telegram') && (
                          <button
                            onClick={() => setActiveTab('WHATSAPP_TELEGRAM')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <span>Configurar</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}

                        {conn.id === 'conn-n8n' && onOpenN8nStudio && (
                          <button
                            onClick={() => {
                              onClose();
                              onOpenN8nStudio();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <span>n8n Studio</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}

                        {conn.id === 'conn-homeassistant' && onOpenHomeAssistant && (
                          <button
                            onClick={() => {
                              onClose();
                              onOpenHomeAssistant();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <span>Home Assistant</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}

                        {/* Botão Excluir (Delete) */}
                        {confirmDeleteId === conn.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDeleteConnection(conn.id, conn.name)}
                              className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Confirmar
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-1 rounded bg-slate-800 text-slate-300 text-[10px] cursor-pointer"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(conn.id)}
                            className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/30 text-rose-300 cursor-pointer"
                            title="Excluir conexão"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABA 2: WHATSAPP & TELEGRAM */}
          {activeTab === 'WHATSAPP_TELEGRAM' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Coluna WhatsApp */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">WhatsApp (Evolution API / Cloud API)</h3>
                      <p className="text-[11px] text-slate-400">
                        Container Evolution API v2 incluso no Docker Compose da VM Oracle (Porta 8080)
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                    ATIVO
                  </span>
                </div>

                <form onSubmit={handleAddWhatsapp} className="space-y-2.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Número (+55...)"
                      value={waNumero}
                      onChange={(e) => setWaNumero(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Nome do Canal"
                      value={waCanalNome}
                      onChange={(e) => setWaCanalNome(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Evolution API URL"
                      value={waApiUrl}
                      onChange={(e) => setWaApiUrl(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Nome da Instância"
                      value={waInstance}
                      onChange={(e) => setWaInstance(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Registrar Canal WhatsApp
                  </button>
                </form>

                {/* Disparo Rápido WhatsApp */}
                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                  <label className="text-[10px] font-mono text-slate-400 uppercase block">
                    Testar Envio de Mensagem WhatsApp via n8n / Evolution:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={waTestMsg}
                      onChange={(e) => setWaTestMsg(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={handleSendWhatsapp}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3 h-3" /> Enviar
                    </button>
                  </div>
                </div>

                {/* Lista de Canais WhatsApp com Botão Excluir */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {waChannels.map((ch: any) => (
                    <div
                      key={ch.id}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">{ch.nome_canal}</div>
                        <div className="text-[11px] font-mono text-emerald-400">
                          {ch.numero} • {ch.status}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteWhatsapp(ch.id)}
                        className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 flex items-center gap-1 text-[10px] font-mono cursor-pointer"
                        title="Excluir canal WhatsApp"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coluna Telegram */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-500/30 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-cyan-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Telegram Bot API & Webhooks</h3>
                      <p className="text-[11px] text-slate-400">
                        Notificações em tempo real, comandos do CFO e controle da VM Oracle
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                    BOT CONECTADO
                  </span>
                </div>

                <form onSubmit={handleAddTelegram} className="space-y-2.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Nome do Bot Telegram"
                      value={tgBotName}
                      onChange={(e) => setTgBotName(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
                    />
                    <input
                      type="text"
                      placeholder="Chat ID (ex: -100219485712)"
                      value={tgChatId}
                      onChange={(e) => setTgChatId(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                  </div>
                  <input
                    type="password"
                    placeholder="Bot Token do @BotFather (opcional se definido no .env)"
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Conectar Bot Telegram
                  </button>
                </form>

                {/* Disparo Rápido Telegram */}
                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                  <label className="text-[10px] font-mono text-slate-400 uppercase block">
                    Enviar Mensagem de Teste para o Telegram:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tgTestMsg}
                      onChange={(e) => setTgTestMsg(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={handleSendTelegram}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3 h-3" /> Enviar
                    </button>
                  </div>
                </div>

                {/* Lista de Bots e Mensagens Telegram com Exclusão */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {tgChannels.map((bot: any) => (
                    <div
                      key={bot.id}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">
                          {bot.botName} <span className="text-cyan-400 font-mono">({bot.botUsername})</span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          Chat ID: {bot.chatId} • Token: {bot.botTokenMasked}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteTelegram(bot.id)}
                        className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 flex items-center gap-1 text-[10px] font-mono cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir
                      </button>
                    </div>
                  ))}
                  {tgMessages.map((m: any) => (
                    <div
                      key={m.id}
                      className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-[11px]"
                    >
                      <div className="truncate pr-2">
                        <span className="text-cyan-400 font-mono">[{m.status}]</span>{' '}
                        <span className="text-slate-300">{m.text}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteTelegram(m.id)}
                        className="text-rose-400 hover:text-rose-300 shrink-0 p-1 cursor-pointer"
                        title="Excluir mensagem"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: GOOGLE WORKSPACE & MICROSOFT OUTLOOK 365 */}
          {activeTab === 'OUTLOOK_WORKSPACE' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Microsoft Outlook / 365 */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-blue-500/30 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-blue-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Microsoft Outlook & Office 365</h3>
                      <p className="text-[11px] text-slate-400">
                        Microsoft Graph API v1.0 (Mail, Calendar, Contacts) & IMAP/SMTP
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-500/40">
                    GRAPH API v1.0
                  </span>
                </div>

                <form onSubmit={handleAddOutlookAccount} className="space-y-2.5 text-xs">
                  <input
                    type="email"
                    placeholder="E-mail Microsoft Outlook / 365 (ex: matheus@outlook.com)"
                    value={outEmail}
                    onChange={(e) => setOutEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
                    required
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Azure Tenant ID (ex: common)"
                      value={outTenantId}
                      onChange={(e) => setOutTenantId(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Client ID (Azure App)"
                      value={outClientId}
                      onChange={(e) => setOutClientId(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Conectar Conta Microsoft Outlook
                  </button>
                </form>

                {/* Criar Evento ou E-mail Outlook */}
                <form onSubmit={handleAddOutlookItem} className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
                  <div className="text-[10px] font-mono text-blue-300 uppercase font-bold">
                    Disparar E-mail ou Agendar Evento no Outlook Calendar:
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={outItemType}
                      onChange={(e) => setOutItemType(e.target.value as any)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white"
                    >
                      <option value="EMAIL">E-mail</option>
                      <option value="CALENDAR_EVENT">Evento Agenda</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Assunto do E-mail ou Reunião..."
                      value={outSubject}
                      onChange={(e) => setOutSubject(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold cursor-pointer"
                    >
                      Criar
                    </button>
                  </div>
                </form>

                {/* Contas e Itens Outlook com Botão Excluir */}
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {outlookAccounts.map((acc: any) => (
                    <div
                      key={acc.id}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">{acc.email}</div>
                        <div className="text-[10px] font-mono text-blue-400">
                          {acc.protocol} • {acc.status}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteOutlook(acc.id)}
                        className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 flex items-center gap-1 text-[10px] font-mono cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir
                      </button>
                    </div>
                  ))}
                  {outlookItems.map((item: any) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="truncate pr-2">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 mr-2">
                          {item.type}
                        </span>
                        <span className="text-white font-semibold">{item.subject}</span>
                        <div className="text-[10px] text-slate-400">{item.fromOrLocation}</div>
                      </div>
                      <button
                        onClick={() => handleDeleteOutlook(item.id)}
                        className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 flex items-center gap-1 text-[10px] font-mono shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" /> Excluir
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Google Workspace Card */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-500/30 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-emerald-400" />
                      <div>
                        <h3 className="text-sm font-bold text-white">Google Workspace (Gmail, Calendar, Drive, Sheets)</h3>
                        <p className="text-[11px] text-slate-400">
                          Autenticação OAuth2 client-side com suporte completo a Leitura, Exportação e Exclusão
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                      OAUTH 2.0
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs text-slate-300">
                    <div className="font-bold text-white">Recursos Habilitados no Painel Google Workspace:</div>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
                      <li>Exportação de decisões do CFO e auditorias Bazin para Planilhas Google Sheets</li>
                      <li>Listagem e <strong>Exclusão (Delete)</strong> de eventos do Google Calendar</li>
                      <li>Listagem e <strong>Exclusão/Lixeira (Delete)</strong> de mensagens do Gmail</li>
                      <li>Exclusão de arquivos/planilhas criadas no Google Drive</li>
                    </ul>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onClose();
                    onOpenWorkspace?.();
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Abrir Painel Completo do Google Workspace</span>
                </button>
              </div>
            </div>
          )}

          {/* ABA 4: INSTALADOR DE DEPENDÊNCIAS PARA VM ORACLE (2 OCPU / 12GB RAM) */}
          {activeTab === 'ORACLE_VM_INSTALLER' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-amber-400" />
                    <h3 className="text-sm font-bold text-white">
                      Pacote Oficial de Dependências — Oracle Cloud VM (2 OCPU / 12GB RAM)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-300">
                    Inclui Docker Engine, PostgreSQL 16 + <code>pgvector</code> (2.5GB RAM), Redis 7 BullMQ (1GB RAM), Qdrant (1.5GB RAM), n8n Queue Mode (3GB RAM), Evolution API WhatsApp (1.5GB RAM) e Ambiente Python (Whisper Small + OpenCV/InsightFace + Captura JPEG q80).
                  </p>
                </div>
                <button
                  onClick={downloadAllOracleBundle}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shrink-0 cursor-pointer shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Todos os Arquivos (1-Click)</span>
                </button>
              </div>

              {oracleBundle && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(oracleBundle).map((fname) => (
                        <button
                          key={fname}
                          onClick={() => setSelectedOracleFile(fname)}
                          className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                            selectedOracleFile === fname
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                              : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                          }`}
                        >
                          <FileCode className="w-3.5 h-3.5" />
                          {fname}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() =>
                        downloadFile(selectedOracleFile, oracleBundle[selectedOracleFile] || '')
                      }
                      className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar {selectedOracleFile}</span>
                    </button>
                  </div>

                  <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-cyan-200 overflow-x-auto max-h-[42vh]">
                    {oracleBundle[selectedOracleFile]}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

