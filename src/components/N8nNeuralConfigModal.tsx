import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Key,
  Globe,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Copy,
  Check,
  RefreshCw,
  Save,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  Smartphone,
  Laptop,
  Terminal,
  Mail,
  Server,
  Network,
  User,
} from 'lucide-react';
import { multiDeviceSyncService, SyncAccountState } from '../services/multiDeviceSyncService';
import { authService } from '../services/authService';

interface N8nNeuralConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerSynapse?: (label: string) => void;
}

export const N8nNeuralConfigModal: React.FC<N8nNeuralConfigModalProps> = ({
  isOpen,
  onClose,
  onTriggerSynapse,
}) => {
  // Configuração da Conta de Sincronização (E-mail Livre)
  const [accountEmailInput, setAccountEmailInput] = useState<string>(() => multiDeviceSyncService.getAccount());
  const [activeAccount, setActiveAccount] = useState<string>(() => multiDeviceSyncService.getAccount());

  // Configuração de Rede e Porta de Acesso Livre
  const [protocol, setProtocol] = useState<'http' | 'https'>('http');
  const [hostInput, setHostInput] = useState<string>('129.151.111.18');
  const [portInput, setPortInput] = useState<string>('5678');
  const [pathInput, setPathInput] = useState<string>('/webhook/jarvis-voice');
  const [webhookUrl, setWebhookUrl] = useState<string>('http://129.151.111.18:5678/webhook/jarvis-voice');

  // Chave Secreta Compartilhada
  const [sharedSecretKey, setSharedSecretKey] = useState<string>('jarvis_sec_8f92a10b4c73e91d');
  const [maskedSecret, setMaskedSecret] = useState<string>('••••••••••••••••');
  const [showSecret, setShowSecret] = useState<boolean>(false);

  // Toggles de Encaminhamento
  const [autoForwardAudio, setAutoForwardAudio] = useState<boolean>(true);
  const [autoForwardSensory, setAutoForwardSensory] = useState<boolean>(true);

  // Estados de Interface e Feedback
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [accountFeedback, setAccountFeedback] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    valid: boolean;
    latencyMs?: number;
    statusCode?: number;
    message: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [syncState, setSyncState] = useState<SyncAccountState | null>(() => multiDeviceSyncService.getLastState());

  // Manter estado de sincronização atualizado
  useEffect(() => {
    const unsub = multiDeviceSyncService.subscribe((state) => {
      setSyncState(state);
      if (state.account) {
        setActiveAccount(state.account);
      }
    });
    return unsub;
  }, []);

  // Carregar configurações ao abrir
  useEffect(() => {
    if (!isOpen) return;
    loadConfig();
    setAccountEmailInput(multiDeviceSyncService.getAccount());
    setActiveAccount(multiDeviceSyncService.getAccount());
  }, [isOpen]);

  // Recalcular URL quando protocolo, host, porta ou rota mudarem
  const syncComposedUrl = (proto: 'http' | 'https', host: string, port: string, path: string) => {
    const cleanHost = host.trim() || '129.151.111.18';
    const cleanPort = port.trim();
    const cleanPath = path.trim().startsWith('/') ? path.trim() : `/${path.trim()}`;
    const portPart = cleanPort ? `:${cleanPort}` : '';
    const newUrl = `${proto}://${cleanHost}${portPart}${cleanPath}`;
    setWebhookUrl(newUrl);
  };

  const handleProtocolChange = (newProto: 'http' | 'https') => {
    setProtocol(newProto);
    syncComposedUrl(newProto, hostInput, portInput, pathInput);
  };

  const handleHostChange = (newHost: string) => {
    setHostInput(newHost);
    syncComposedUrl(protocol, newHost, portInput, pathInput);
  };

  const handlePortChange = (newPort: string) => {
    setPortInput(newPort);
    syncComposedUrl(protocol, hostInput, newPort, pathInput);
  };

  const handlePathChange = (newPath: string) => {
    setPathInput(newPath);
    syncComposedUrl(protocol, hostInput, portInput, newPath);
  };

  // Se o usuário digitar a URL completa diretamente, faz o parse para os campos
  const handleFullUrlChange = (newFullUrl: string) => {
    setWebhookUrl(newFullUrl);
    try {
      const parsed = new URL(newFullUrl);
      setProtocol(parsed.protocol.replace(':', '') as 'http' | 'https');
      setHostInput(parsed.hostname);
      setPortInput(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'));
      setPathInput(parsed.pathname || '/webhook/jarvis-voice');
    } catch {
      // Deixa usuário digitar URL livremente
    }
  };

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/config/n8n-neural');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          if (data.config.webhookUrl) {
            setWebhookUrl(data.config.webhookUrl);
            try {
              const parsed = new URL(data.config.webhookUrl);
              setProtocol(parsed.protocol.replace(':', '') as 'http' | 'https');
              setHostInput(parsed.hostname);
              setPortInput(data.config.customPort || parsed.port || '5678');
              setPathInput(parsed.pathname || '/webhook/jarvis-voice');
            } catch {
              if (data.config.customPort) setPortInput(data.config.customPort);
              if (data.config.customHost) setHostInput(data.config.customHost);
            }
          }
          if (data.config.maskedSecret) setMaskedSecret(data.config.maskedSecret);
          if (typeof data.config.autoForwardAudio === 'boolean') setAutoForwardAudio(data.config.autoForwardAudio);
          if (typeof data.config.autoForwardSensory === 'boolean') setAutoForwardSensory(data.config.autoForwardSensory);
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar configurações do n8n neural:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Troca Livre do E-mail da Conta
  const handleApplyAccountEmail = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!accountEmailInput.trim()) {
      setAccountFeedback('Por favor, informe um endereço de e-mail válido.');
      return;
    }
    const cleanEmail = accountEmailInput.trim().toLowerCase();
    multiDeviceSyncService.setAccount(cleanEmail);
    authService.switchAccount(cleanEmail);
    setActiveAccount(cleanEmail);
    setAccountFeedback(`✓ Conta alterada com total liberdade para "${cleanEmail}"! Sincronizando dados com a nuvem...`);
    setTimeout(() => setAccountFeedback(null), 5000);
    if (onTriggerSynapse) {
      onTriggerSynapse(`Conta alternada para ${cleanEmail}`);
    }
  };

  const handleGenerateSecret = () => {
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const newKey = `jarvis_sec_${randomHex}`;
    setSharedSecretKey(newKey);
    setShowSecret(true);
    setFeedback('Nova chave gerada! Clique em "Salvar Configuração" para aplicá-la.');
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!webhookUrl.trim()) {
      setFeedback('A URL do Webhook do n8n não pode ser vazia.');
      return;
    }
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/config/n8n-neural', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: webhookUrl.trim(),
          customPort: portInput.trim(),
          customHost: hostInput.trim(),
          sharedSecretKey: sharedSecretKey.trim() || undefined,
          autoForwardAudio,
          autoForwardSensory,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.maskedSecret) setMaskedSecret(data.maskedSecret);
        setFeedback(`✓ Porta :${portInput} e Webhook do n8n salvos com sucesso e persistidos no .env!`);
        setTimeout(() => setFeedback(null), 5000);
        if (onTriggerSynapse) {
          onTriggerSynapse(`Porta :${portInput} e configurações n8n salvas!`);
        }
      } else {
        setFeedback(`Erro ao salvar: ${data.message || 'Falha desconhecida.'}`);
      }
    } catch (err: any) {
      setFeedback(`Erro na requisição: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/config/n8n-neural/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: webhookUrl.trim(),
          sharedSecretKey: sharedSecretKey.trim(),
        }),
      });
      const data = await res.json();
      setTestResult({
        valid: Boolean(data.valid),
        latencyMs: data.latencyMs,
        statusCode: data.statusCode,
        message: data.message || 'Resposta recebida do n8n.',
      });
      if (data.valid && onTriggerSynapse) {
        onTriggerSynapse(`Handshake n8n na porta :${portInput} validado (${data.latencyMs || 0}ms)!`);
      }
    } catch (err: any) {
      setTestResult({
        valid: false,
        message: `Falha na conexão: ${err.message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  const envSnippet = `# Configurações do Agente Jarvis (Desktop / Celular / Termux)
JARVIS_ACCOUNT_EMAIL="${activeAccount}"
JARVIS_BACKEND_URL="http://${hostInput.trim() || '129.151.111.18'}:3000/api/webhook/universal-inbox"
JARVIS_N8N_URL="${webhookUrl}"
JARVIS_PORT="${portInput}"
JARVIS_SECRET_KEY="${sharedSecretKey}"`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-slate-950 border border-purple-500/40 rounded-3xl shadow-[0_0_60px_rgba(168,85,247,0.25)] overflow-hidden font-mono text-slate-200">
        
        {/* Cabeçalho */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-950/70 via-slate-950 to-indigo-950/70 border-b border-purple-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/30 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-400">
                  CONTROLE DE CONTA & REDE LIVRE
                </span>
                <span className="text-[9px] bg-purple-950 text-purple-300 border border-purple-500/40 px-2 py-0.2 rounded-full font-bold">
                  Porta :{portInput || '5678'}
                </span>
              </div>
              <h3 className="text-base font-bold text-white leading-tight">
                E-mail da Conta, Porta de Acesso & Webhook n8n
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className="mx-6 mt-4 p-3 bg-purple-950/80 border border-purple-500/60 rounded-2xl text-xs text-purple-200 flex items-center gap-2 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Corpo com Scroll */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 scrollbar-thin">
          
          {/* =============================================================== */}
          {/* SEÇÃO 1: ESCOLHA LIVRE DO E-MAIL DA CONTA (SINCRONIZAÇÃO)      */}
          {/* =============================================================== */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-cyan-500/40 space-y-3.5 shadow-lg shadow-cyan-950/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  1. E-mail da Conta para Sincronização Multi-Dispositivos
                </h4>
              </div>
              <span className="text-[10px] text-cyan-300 font-bold px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40">
                Conta Ativa: {activeAccount}
              </span>
            </div>

            <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
              Você tem total liberdade para definir o e-mail que desejar. Todos os dispositivos que utilizarem este mesmo e-mail (Desktop, Celular Android/Tasker, Smart TV) sincronizarão automaticamente as sessões, memórias e contextos.
            </p>

            <form onSubmit={handleApplyAccountEmail} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="email"
                  value={accountEmailInput}
                  onChange={(e) => setAccountEmailInput(e.target.value)}
                  placeholder="Digite qualquer e-mail: usuario@exemplo.com"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-cyan-300 font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <button
                type="submit"
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shrink-0 shadow-md shadow-cyan-600/20 active:scale-95"
              >
                <User className="w-3.5 h-3.5" />
                Salvar & Conectar E-mail
              </button>

              <button
                type="button"
                onClick={() => {
                  multiDeviceSyncService.syncNow();
                  if (onTriggerSynapse) onTriggerSynapse('Dispositivos sincronizados na nuvem!');
                }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs rounded-xl flex items-center justify-center gap-1 cursor-pointer shrink-0"
                title="Forçar sincronização de dados"
              >
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                Sincronizar
              </button>
            </form>

            {accountFeedback && (
              <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-500/50 text-[11px] text-cyan-200 flex items-center gap-2 animate-in fade-in duration-150">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>{accountFeedback}</span>
              </div>
            )}

            {/* Sugestões Rápidas de E-mail */}
            <div className="flex items-center gap-2 flex-wrap text-[10px]">
              <span className="text-slate-500">Atalhos rápidos:</span>
              <button
                type="button"
                onClick={() => {
                  setAccountEmailInput('matheusdullius@gmail.com');
                  multiDeviceSyncService.setAccount('matheusdullius@gmail.com');
                  setActiveAccount('matheusdullius@gmail.com');
                }}
                className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-cyan-300 cursor-pointer"
              >
                matheusdullius@gmail.com
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccountEmailInput('admin@jarvis.local');
                  multiDeviceSyncService.setAccount('admin@jarvis.local');
                  setActiveAccount('admin@jarvis.local');
                }}
                className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-cyan-300 cursor-pointer"
              >
                admin@jarvis.local
              </button>
            </div>
          </div>

          {/* =============================================================== */}
          {/* SEÇÃO 2: ESCOLHA LIVRE DA PORTA DE ACESSO & HOST DE REDE        */}
          {/* =============================================================== */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-purple-500/40 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  2. Porta de Acesso e Endereço de Rede (Totalmente Customizável)
                </h4>
              </div>
              <span className="text-[10px] text-purple-300 font-mono bg-purple-950 border border-purple-500/40 px-2 py-0.5 rounded">
                Porta Ativa: :{portInput || '5678'}
              </span>
            </div>

            {/* Grid de Componentes da URL: Protocolo, Host e Porta Livre */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
              
              {/* Protocolo */}
              <div className="sm:col-span-3 space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase block">Protocolo:</label>
                <div className="flex items-center bg-slate-950 rounded-xl border border-slate-700 p-0.5">
                  <button
                    type="button"
                    onClick={() => handleProtocolChange('http')}
                    className={`flex-1 py-1.5 rounded-lg text-center font-bold text-[11px] cursor-pointer transition-all ${
                      protocol === 'http' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    HTTP
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProtocolChange('https')}
                    className={`flex-1 py-1.5 rounded-lg text-center font-bold text-[11px] cursor-pointer transition-all ${
                      protocol === 'https' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    HTTPS
                  </button>
                </div>
              </div>

              {/* Host / Endereço IP */}
              <div className="sm:col-span-6 space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase block">Host / IP do Servidor:</label>
                <input
                  type="text"
                  value={hostInput}
                  onChange={(e) => handleHostChange(e.target.value)}
                  placeholder="129.151.111.18 ou localhost"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-purple-400"
                />
              </div>

              {/* Porta de Acesso Livre */}
              <div className="sm:col-span-3 space-y-1">
                <label className="text-[10px] text-amber-300 font-bold uppercase block">Porta Livre:</label>
                <input
                  type="text"
                  value={portInput}
                  onChange={(e) => handlePortChange(e.target.value)}
                  placeholder="ex: 5678, 3000, 800"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-amber-500/60 rounded-xl text-xs text-amber-300 font-bold font-mono focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Chips de Portas Comuns */}
            <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
              <span className="text-slate-500">Portas pré-definidas:</span>
              {[
                { port: '5678', label: ':5678 (n8n Oficial)' },
                { port: '3000', label: ':3000 (Jarvis Core)' },
                { port: '800', label: ':800 (Spoke Local)' },
                { port: '8080', label: ':8080 (Proxy/Docker)' },
                { port: '80', label: ':80 (Padrão HTTP)' },
                { port: '443', label: ':443 (Padrão SSL)' },
              ].map((p) => (
                <button
                  key={p.port}
                  type="button"
                  onClick={() => handlePortChange(p.port)}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-all border ${
                    portInput === p.port
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* URL Completa Resultante / Editável */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                <span>URL Final Montada Dinamicamente:</span>
                <span className="text-[10px] text-slate-500 font-normal">Pode editar diretamente abaixo</span>
              </label>
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => handleFullUrlChange(e.target.value)}
                placeholder="http://129.151.111.18:5678/webhook/jarvis-voice"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-purple-300 font-mono focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>

          {/* =============================================================== */}
          {/* SEÇÃO 3: CHAVE SECRETA COMPARTILHADA & SEGURANÇA               */}
          {/* =============================================================== */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  3. Chave Secreta Compartilhada (Shared Secret Key)
                </h4>
              </div>
              <button
                type="button"
                onClick={handleGenerateSecret}
                className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer font-bold"
              >
                <Sparkles className="w-3 h-3" />
                Gerar Nova Chave Segura
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={sharedSecretKey}
                  onChange={(e) => setSharedSecretKey(e.target.value)}
                  placeholder="Cole ou gere uma chave secreta..."
                  className="w-full px-3.5 py-2 pr-10 bg-slate-950 border border-slate-700 rounded-xl text-xs text-amber-300 font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  title={showSecret ? 'Ocultar' : 'Mostrar'}
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(sharedSecretKey);
                  setCopiedKey(true);
                  setTimeout(() => setCopiedKey(false), 2500);
                }}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey ? 'Copiada!' : 'Copiar'}
              </button>
            </div>

            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/90 text-[11px] text-slate-400 font-sans space-y-1">
              <div className="flex items-center gap-2 font-mono text-[10px] text-slate-300">
                <span className="text-amber-400 font-bold">Header Injetado:</span>
                <code className="bg-slate-900 px-2 py-0.5 rounded text-amber-300 border border-slate-800">
                  X-Jarvis-Secret: {maskedSecret}
                </code>
              </div>
              <p>
                Garante que os disparos enviados pelo Daemon e pelos agentes móveis sejam aceitos pelo nó Webhook do n8n sem expor o endpoint abertamente.
              </p>
            </div>
          </div>

          {/* Toggles de Encaminhamento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-purple-500/40 transition-all flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoForwardAudio}
                onChange={(e) => setAutoForwardAudio(e.target.checked)}
                className="mt-1 rounded border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-white block">Encaminhar Áudio & Voz</span>
                <span className="text-[11px] text-slate-400 font-sans">
                  Repassa transcrições de microfone automaticamente para o webhook na porta :{portInput}
                </span>
              </div>
            </label>

            <label className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-purple-500/40 transition-all flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoForwardSensory}
                onChange={(e) => setAutoForwardSensory(e.target.checked)}
                className="mt-1 rounded border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-white block">Encaminhar Pacotes Sensoriais</span>
                <span className="text-[11px] text-slate-400 font-sans">
                  Transmite capturas desktop e autenticação biométrica
                </span>
              </div>
            </label>
          </div>

          {/* Ações de Teste e Salvamento */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !webhookUrl}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-amber-300 hover:text-amber-200 border border-amber-500/40 text-xs rounded-2xl cursor-pointer transition-all flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-amber-500/10"
            >
              <Activity className={`w-4 h-4 ${isTesting ? 'animate-spin text-amber-400' : 'text-amber-400'}`} />
              {isTesting ? `Testando Porta :${portInput}...` : `Testar Porta :${portInput} & Conexão`}
            </button>

            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-bold text-xs rounded-2xl cursor-pointer transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-purple-500/25"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Salvando...' : 'Salvar Todas as Configurações'}
            </button>
          </div>

          {/* Resultado do Teste de Conexão */}
          {testResult && (
            <div className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
              testResult.valid
                ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200'
                : 'bg-red-950/70 border-red-500/50 text-red-200'
            }`}>
              <div className="flex items-center gap-2.5">
                {testResult.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span className="font-sans leading-tight">{testResult.message}</span>
              </div>
              {testResult.latencyMs !== undefined && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 shrink-0">
                  ⚡ {testResult.latencyMs}ms
                </span>
              )}
            </div>
          )}

          {/* Bloco de Código de Configuração para o Daemon Python / Tasker */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-purple-400" />
                Variáveis Geradas para o Daemon Python / Celular:
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(envSnippet);
                  setCopiedSnippet(true);
                  setTimeout(() => setCopiedSnippet(false), 2000);
                }}
                className="text-[10px] text-purple-300 hover:text-purple-200 flex items-center gap-1 cursor-pointer font-bold"
              >
                {copiedSnippet ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedSnippet ? 'Copiado!' : 'Copiar Variáveis'}
              </button>
            </div>

            <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-[10px] font-mono text-purple-300 overflow-x-auto whitespace-pre">
{envSnippet}
            </pre>
          </div>

        </div>

      </div>
    </div>
  );
};
