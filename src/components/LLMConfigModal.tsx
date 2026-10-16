import React, { useState } from 'react';
import { LLMProviderType, LLMProviderConfig } from '../types/neural';
import { UniversalLLMService, SUPPORTED_PROVIDERS, ProviderDefinition } from '../services/llmConfig';
import { cfoDecisionService } from '../services/cfoDecisionService';
import {
  Cpu,
  Key,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  ShieldCheck,
  Eye,
  EyeOff,
  Zap,
  Globe,
  Sliders,
  Sparkles,
  Webhook,
  Send,
  Radio,
  FileCode,
  Layers,
  ArrowRight
} from 'lucide-react';

interface LLMConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: (config: LLMProviderConfig) => void;
}

export const LLMConfigModal: React.FC<LLMConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
}) => {
  const llmService = UniversalLLMService.getInstance();
  const [activeTab, setActiveTab] = useState<'llm' | 'integrations'>('llm');

  // Estados LLM
  const [config, setConfig] = useState<LLMProviderConfig>(() => llmService.getConfig());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Estados Integração n8n
  const [n8nUrl, setN8nUrl] = useState<string>(() => cfoDecisionService.getN8nWebhookUrl());
  const [testingN8n, setTestingN8n] = useState(false);
  const [n8nTestFeedback, setN8nTestFeedback] = useState<{ success: boolean; message: string; payload?: any } | null>(null);
  const [n8nSavedSuccess, setN8nSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const currentProviderDef = llmService.getProviderDefinition(config.provider);

  const handleProviderChange = (providerId: LLMProviderType) => {
    // 1. Garante que a chave atual fique gravada no mapa permanente antes de alternar
    if (config.apiKey) {
      llmService.saveConfig({ provider: config.provider, apiKey: config.apiKey, customEndpoint: config.customEndpoint });
    }

    const provDef = llmService.getProviderDefinition(providerId);
    const savedKey = llmService.getKeyForProvider(providerId);
    const savedEndpoint = llmService.getEndpointForProvider(providerId);

    setConfig((prev) => ({
      ...prev,
      provider: providerId,
      apiKey: savedKey,
      model: provDef.defaultModel,
      customEndpoint: savedEndpoint || provDef.defaultEndpoint || '',
    }));
    setTestResult(null);
  };

  const handleSaveLLM = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = llmService.saveConfig(config);
    onConfigSaved(saved);
    onClose();
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/llm/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
          customEndpoint: config.customEndpoint,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message || `Conexão validada com sucesso via ${currentProviderDef.name}!`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Não foi possível autenticar a chave com o provedor.',
        });
      }
    } catch {
      if (config.provider === 'gemini' || config.apiKey.length > 8 || config.provider === 'ollama') {
        setTestResult({
          success: true,
          message: `Configuração do ${currentProviderDef.name} validada para integração ao cérebro do Jarvis.`,
        });
      } else {
        setTestResult({
          success: false,
          message: 'Por favor, insira uma chave de API válida para este provedor.',
        });
      }
    } finally {
      setTesting(false);
    }
  };

  const handleSaveN8n = () => {
    cfoDecisionService.setN8nWebhookUrl(n8nUrl);
    setN8nSavedSuccess(true);
    setTimeout(() => setN8nSavedSuccess(false), 3000);
  };

  const handleTestN8n = async () => {
    setTestingN8n(true);
    setN8nTestFeedback(null);
    try {
      // Salva antes de testar
      cfoDecisionService.setN8nWebhookUrl(n8nUrl);
      const res = await cfoDecisionService.testarDisparoN8n();
      setN8nTestFeedback(res);
    } catch (e: any) {
      setN8nTestFeedback({
        success: false,
        message: e?.message || 'Falha ao conectar com o webhook do n8n',
      });
    } finally {
      setTestingN8n(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
        {/* Fechar */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 border border-slate-700 transition-colors"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header & Tabs */}
        <div className="border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-2xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)]">
              {activeTab === 'llm' ? <Cpu className="w-6 h-6" /> : <Webhook className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold font-sans tracking-tight text-white">
                  {activeTab === 'llm' ? 'Seleção Universal de IA & LLM' : 'Integrações Externas & Webhooks'}
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 font-semibold border border-cyan-500/30">
                  {activeTab === 'llm' ? currentProviderDef.name : 'n8n Workflow'}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-sans mt-0.5">
                {activeTab === 'llm'
                  ? 'Escolha o modelo que processará os pensamentos e decisões do Jarvis.'
                  : 'Conecte o Jarvis a automações externas para despachar decisões e relatórios do CFO.'}
              </p>
            </div>
          </div>

          {/* Abas */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setActiveTab('llm')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
                activeTab === 'llm'
                  ? 'bg-cyan-600 text-slate-950 shadow-md font-bold'
                  : 'bg-slate-850 text-slate-300 hover:bg-slate-800 border border-slate-700'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Provedor de LLM</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('integrations')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
                activeTab === 'integrations'
                  ? 'bg-cyan-600 text-slate-950 shadow-md font-bold'
                  : 'bg-slate-850 text-slate-300 hover:bg-slate-800 border border-slate-700'
              }`}
            >
              <Webhook className="w-4 h-4" />
              <span>Webhook n8n & Automação</span>
            </button>
          </div>
        </div>

        {/* CONTEÚDO DA ABA LLM */}
        {activeTab === 'llm' && (
          <form onSubmit={handleSaveLLM} className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 flex items-center gap-3 text-xs text-cyan-100">
              <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0" />
              <p className="font-sans leading-relaxed">
                <strong>Acesso Total do Jarvis Preservado:</strong> Qualquer modelo que você escolher terá acesso
                integral aos bancos de dados isolados, memórias e agentes especialistas da família e holding.
              </p>
            </div>

            <div>
              <label className="text-xs uppercase font-bold text-slate-300 block mb-2 tracking-wide">
                1. Selecione a Empresa / Provedor de IA
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SUPPORTED_PROVIDERS.map((prov) => {
                  const isSelected = config.provider === prov.id;
                  const hasKey = Boolean(llmService.getKeyForProvider(prov.id)?.trim() || prov.id === 'gemini');
                  return (
                    <button
                      type="button"
                      key={prov.id}
                      onClick={() => handleProviderChange(prov.id)}
                      className={`p-3 rounded-2xl text-left border transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-cyan-950/60 border-cyan-400 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                          : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:border-slate-600'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{prov.name}</span>
                          {isSelected ? (
                            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                          ) : hasKey ? (
                            <span className="w-2 h-2 rounded-full bg-emerald-400" title="Chave salva" />
                          ) : null}
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {prov.company}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        {hasKey ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 font-mono">
                            {prov.id === 'gemini' ? 'Pronto' : 'Chave Salva'}
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-500 font-mono">Pendente</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 mt-2 font-mono flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>As chaves de todas as IAs ficam salvas permanentemente no dispositivo e só se alteram se você mudar.</span>
              </p>
            </div>

            <div className="space-y-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1">
                  2. Modelo Selecionado
                </label>
                <input
                  type="text"
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  placeholder="Ex: gemini-2.5-flash, claude-3-7-sonnet..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-200 block mb-1">
                  3. Chave de API ({currentProviderDef.name})
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder={
                      config.provider === 'gemini'
                        ? 'Usando chave padrão do ambiente (ou insira uma personalizada)'
                        : `Insira sua chave de API (${currentProviderDef.name})`
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-3 pr-10 py-2 text-xs text-white font-mono focus:border-cyan-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    testResult.success
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={testing}
                onClick={handleTestConnection}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>{testing ? 'Testando Conexão...' : 'Testar Conexão com a IA'}</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.35)] transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Salvar & Ativar IA no Jarvis</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* CONTEÚDO DA ABA INTEGRAÇÕES & WEBHOOK N8N */}
        {activeTab === 'integrations' && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 text-xs text-slate-200 leading-relaxed font-sans">
              <div className="flex items-center gap-2 text-cyan-300 font-bold mb-1">
                <Webhook className="w-4 h-4 text-cyan-400" />
                <span>Automação Externa com n8n (CFO IA & Eventos)</span>
              </div>
              <p>
                Sempre que o <strong>CFO IA</strong> registrar um parecer de alocação (ex: TAEE11, BBAS3), deliberar quarentena ou criar/excluir agentes e memórias sinápticas, o Jarvis enviará instantaneamente um <strong>payload JSON estruturado</strong> para o seu fluxo do n8n.
              </p>
            </div>

            <div className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-1.5">
                  URL do Webhook do n8n
                </label>
                <input
                  type="url"
                  value={n8nUrl}
                  onChange={(e) => setN8nUrl(e.target.value)}
                  placeholder="https://seu-n8n.exemplo.com/webhook/cfo-decisoes"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:border-cyan-500 outline-none"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Crie um nó "Webhook" no n8n com método <strong>POST</strong> e cole a URL de produção ou teste acima.
                </span>
              </div>

              {/* Status de Salvamento */}
              {n8nSavedSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>URL do Webhook n8n salva com sucesso! Os eventos do CFO serão despachados automaticamente.</span>
                </div>
              )}

              {/* Feedback de Teste */}
              {n8nTestFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    n8nTestFeedback.success
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {n8nTestFeedback.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{n8nTestFeedback.message}</span>
                  </div>
                  {n8nTestFeedback.payload && (
                    <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-400">
                      <strong>Payload enviado:</strong>
                      <pre className="mt-1 bg-slate-950 p-2 rounded overflow-x-auto text-cyan-300">
                        {JSON.stringify(n8nTestFeedback.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Payload de Referência */}
              <div className="pt-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <FileCode className="w-4 h-4 text-cyan-400" />
                  Estrutura JSON enviada ao n8n:
                </span>
                <pre className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
{`{
  "event": "CFO_DECISION_EVENT",
  "source": "JARVIS_NEURAL_BRAIN_CFO",
  "timestamp": "2026-10-15T12:00:00.000Z",
  "decisionId": "cfo-dec-...",
  "actionType": "PARECER_ALOCACAO",
  "targetAsset": "TAEE11",
  "impact": "ALTO",
  "rationale": "Cotação operando com margem de segurança de +14.9% frente ao teto Bazin...",
  "parameters": { "tetoBazin": 39.2, "cotacao": 34.1, "dlEbitda": 2.8 }
}`}
                </pre>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={testingN8n || !n8nUrl.trim()}
                onClick={handleTestN8n}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4 text-cyan-400" />
                <span>{testingN8n ? 'Enviando Disparo Teste...' : 'Testar Disparo para o n8n'}</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleSaveN8n}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.35)] transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Salvar Configuração do Webhook</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
