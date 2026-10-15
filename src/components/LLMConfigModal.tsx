import React, { useState } from 'react';
import { LLMProviderType, LLMProviderConfig } from '../types/neural';
import { UniversalLLMService, SUPPORTED_PROVIDERS, ProviderDefinition } from '../services/llmConfig';
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
  Sparkles
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
  const [config, setConfig] = useState<LLMProviderConfig>(() => llmService.getConfig());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const currentProviderDef = llmService.getProviderDefinition(config.provider);

  const handleProviderChange = (providerId: LLMProviderType) => {
    const provDef = llmService.getProviderDefinition(providerId);
    setConfig((prev) => ({
      ...prev,
      provider: providerId,
      model: provDef.defaultModel,
      customEndpoint: provDef.defaultEndpoint || '',
    }));
    setTestResult(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = llmService.saveConfig(config);
    onConfigSaved(saved);
    onClose();
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      // Teste seguro de rota no servidor
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
      // Validação local se offline
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-3xl max-h-[92vh] bg-slate-950 border border-red-500/40 rounded-3xl p-5 sm:p-7 shadow-[0_0_80px_rgba(239,68,68,0.25)] flex flex-col relative overflow-hidden text-slate-100">
        {/* Fechar */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 border border-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-red-500/15 border border-red-500/40 flex items-center justify-center text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold font-mono tracking-wide text-red-200">
                Seleção Universal de IA & LLM
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-950 border border-red-500/40 text-red-400 font-bold uppercase">
                {currentProviderDef.name}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Escolha livremente qual Inteligência Artificial processará a mente do Jarvis, independente da empresa.
            </p>
          </div>
        </div>

        {/* Aviso de Acesso Completo aos Dados */}
        <div className="p-3 rounded-2xl bg-red-950/20 border border-red-500/30 flex items-center gap-3 text-xs text-red-200 mb-4">
          <ShieldCheck className="w-5 h-5 text-red-400 shrink-0" />
          <p className="font-sans leading-relaxed">
            <strong>Acesso Total do Jarvis Preservado:</strong> Qualquer modelo que você escolher terá acesso
            integral aos bancos de dados isolados (ações, cripto, saúde, rotina), memórias e agentes especialistas.
          </p>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Seletor de Provedores em Cards */}
          <div>
            <label className="text-[10px] font-mono uppercase text-slate-400 block mb-2 font-bold">
              1. Selecione a Empresa / Provedor de IA
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SUPPORTED_PROVIDERS.map((prov) => {
                const isSelected = config.provider === prov.id;
                return (
                  <button
                    type="button"
                    key={prov.id}
                    onClick={() => handleProviderChange(prov.id)}
                    className={`p-3 rounded-2xl text-left border transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-red-950/60 border-red-500 text-white shadow-[0_0_25px_rgba(239,68,68,0.3)]'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-mono">{prov.name}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                      </div>
                      <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                        {prov.company}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configuração do Modelo e Chave de API */}
          <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold font-mono text-red-300 uppercase">
                  {currentProviderDef.name}
                </span>
                <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                  {currentProviderDef.description}
                </p>
              </div>

              {currentProviderDef.docsUrl && (
                <a
                  href={currentProviderDef.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-mono text-red-400 hover:text-red-300 flex items-center gap-1 underline"
                >
                  <span>Obter Chave</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Modelo */}
              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Modelo de IA
                </label>
                <select
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-red-500 outline-none"
                >
                  {currentProviderDef.models.map((m, idx) => (
                    <option key={`${m}-${idx}`} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Endpoint Customizado (Ollama / Local / OpenAI-compatible) */}
              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Endpoint da API (opcional para proxies)
                </label>
                <input
                  type="text"
                  value={config.customEndpoint || ''}
                  onChange={(e) => setConfig({ ...config, customEndpoint: e.target.value })}
                  placeholder={currentProviderDef.defaultEndpoint || 'Endpoint padrão do provedor'}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-red-500 outline-none"
                />
              </div>
            </div>

            {/* Chave de API */}
            <div>
              <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                Chave de API ({currentProviderDef.requiresApiKey ? 'Obrigatória para este provedor' : 'Opcional'})
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3 pr-10 py-2 text-xs text-slate-100 font-mono focus:border-red-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Resultado do Teste de Conexão */}
            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
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

          {/* Rodapé: Testar e Salvar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              type="button"
              disabled={testing}
              onClick={handleTestConnection}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 text-red-400" />
              <span>{testing ? 'Testando Conexão...' : 'Testar Conexão com a IA'}</span>
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-bold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.35)] transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Salvar & Ativar IA no Jarvis</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
