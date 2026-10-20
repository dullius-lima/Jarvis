import React, { useState, useEffect } from 'react';
import { AgentDefinition, LLMProviderType } from '../types/neural';
import { AgentRegistryService, BODY_PARTS_CONFIG } from '../services/agentRegistry';
import { SUPPORTED_PROVIDERS, UniversalLLMService } from '../services/llmConfig';
import {
  Sparkles,
  Bot,
  Sliders,
  CheckCircle2,
  X,
  Play,
  RotateCcw,
  Cpu,
  Layers,
  FileCode,
  ShieldAlert,
  Send,
  Zap,
  HelpCircle,
  BrainCircuit,
  MessageSquare,
  Key
} from 'lucide-react';

interface AgentPromptBehaviorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAgentId?: string | null;
  onSaved?: (agent: AgentDefinition) => void;
  onTriggerSynapse?: (label: string) => void;
}

const PRESET_PROMPTS = [
  {
    title: 'Auditor Matemático Bazin & Graham',
    role: 'Auditor Contábil Estrito',
    prompt: `Você é um auditor financeiro e contábil estrito da holding Investimentos Dullius.
Diretrizes:
- Preço-Teto de Bazin calculado com Dividend Yield médio dos últimos 3 a 5 anos a 6% a.a.
- Margem de segurança mínima requerida: 15% acima da cotação de mercado.
- Limite máximo tolerado de Dívida Líquida / EBITDA: 3.5x.
- Responda apenas com dados precisos, sem cumprimentos vazios, emojis ou jargões motivacionais.
- Emita veredito direto: COMPRAR, AGUARDAR ou QUARENTENA.`,
  },
  {
    title: 'Sentinela de Risco & Alavancagem',
    role: 'Guardião de Integridade Patrimonial',
    prompt: `Você é o Sentinela de Blindagem e Monitoramento de Risco.
Diretrizes:
- Avalie volatilidade, covenants de dívida e alavancagem financeira.
- Se a DL/EBITDA ultrapassar 3.0x ou houver prejuízo contínuo, acione flag de ALERTA imediata.
- Priorize a perenidade do capital e preservação patrimonial contra cisnes negros.
- Síntese rápida e densa em O(1).`,
  },
  {
    title: 'Especialista em Automação & Home Assistant',
    role: 'Gestor de Domótica & Sensores Residenciais',
    prompt: `Você é o Agente Neural especializado em controle do ecossistema Home Assistant.
Diretrizes:
- Monitore sensores de consumo de energia, iluminação, fechaduras biométricas e climatização.
- Execute comandos pontuais e seguros nos atuadores da residência.
- Confirme cada execução de forma sucinta: "Luzes ajustadas", "Climatização em 22°C".`,
  },
  {
    title: 'Secretário Executivo da Família Dullius',
    role: 'Assistente Pessoal & Comunicação',
    prompt: `Você é o Secretário Executivo da família Matheus Dullius.
Diretrizes:
- Triagem concisa de compromissos da agenda, lembretes de saúde, escola e rotinas do lar.
- Priorize os membros da família (Matheus, Esposa e Filhos) com tom polido, atencioso e ágil.
- Guarde registros importantes em memórias sinápticas organizadas no cérebro 3D.`,
  },
];

export const AgentPromptBehaviorModal: React.FC<AgentPromptBehaviorModalProps> = ({
  isOpen,
  onClose,
  selectedAgentId,
  onSaved,
  onTriggerSynapse,
}) => {
  const agentService = AgentRegistryService.getInstance();
  const [agents, setAgents] = useState<AgentDefinition[]>(() => agentService.listAgents());
  const [activeAgentId, setActiveAgentId] = useState<string>(selectedAgentId || agents[0]?.id || '');
  
  // Dados do Agente Selecionado
  const currentAgent = agents.find((a) => a.id === activeAgentId) || agents[0];

  const [promptText, setPromptText] = useState<string>('');
  const [roleText, setRoleText] = useState<string>('');
  const [hasDedicatedLLM, setHasDedicatedLLM] = useState<boolean>(false);
  const [dedicatedProvider, setDedicatedProvider] = useState<LLMProviderType>('gemini');
  const [dedicatedModel, setDedicatedModel] = useState<string>('gemini-3.8-flash');
  const [dedicatedApiKey, setDedicatedApiKey] = useState<string>('');
  const [dedicatedEndpoint, setDedicatedEndpoint] = useState<string>('');
  const [temperature, setTemperature] = useState<number>(0.2);

  // Sandbox de Teste
  const [testInput, setTestInput] = useState<string>('');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testingBehavior, setTestingBehavior] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (selectedAgentId) {
      setActiveAgentId(selectedAgentId);
    }
  }, [selectedAgentId]);

  useEffect(() => {
    if (currentAgent) {
      setPromptText(currentAgent.customPromptBehavior || currentAgent.logic || '');
      setRoleText(currentAgent.role || '');
      setHasDedicatedLLM(Boolean(currentAgent.hasDedicatedLLM));
      
      const config = currentAgent.dedicatedLLMConfig;
      if (config) {
        setDedicatedProvider(config.provider || 'gemini');
        setDedicatedModel(config.model || 'gemini-3.8-flash');
        setDedicatedApiKey(config.apiKey || '');
        setDedicatedEndpoint(config.customEndpoint || '');
        setTemperature(config.temperature ?? 0.2);
      } else {
        setDedicatedProvider('gemini');
        setDedicatedModel('gemini-3.8-flash');
        setDedicatedApiKey('');
        setDedicatedEndpoint('');
        setTemperature(0.2);
      }
      setTestResponse(null);
      setSavedSuccess(false);
    }
  }, [currentAgent?.id]);

  if (!isOpen || !currentAgent) return null;

  const currentProviderDef = SUPPORTED_PROVIDERS.find((p) => p.id === dedicatedProvider) || SUPPORTED_PROVIDERS[0];

  const handleProviderChange = (newProvider: LLMProviderType) => {
    setDedicatedProvider(newProvider);
    const def = SUPPORTED_PROVIDERS.find((p) => p.id === newProvider) || SUPPORTED_PROVIDERS[0];
    setDedicatedModel(def.defaultModel);
    setDedicatedEndpoint(def.defaultEndpoint || '');
  };

  const handleApplyPreset = (preset: typeof PRESET_PROMPTS[0]) => {
    setPromptText(preset.prompt);
    setRoleText(preset.role);
    onTriggerSynapse?.(`Preset "${preset.title}" aplicado ao prompt do agente.`);
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentAgent) return;

    const updated = agentService.updateAgent(currentAgent.id, {
      customPromptBehavior: promptText,
      role: roleText,
      logic: promptText, // Sincroniza lógica principal
      hasDedicatedLLM,
      dedicatedLLMConfig: hasDedicatedLLM
        ? {
            provider: dedicatedProvider,
            model: dedicatedModel,
            apiKey: dedicatedApiKey,
            customEndpoint: dedicatedEndpoint,
            temperature,
          }
        : undefined,
    });

    if (updated) {
      setAgents(agentService.listAgents());
      setSavedSuccess(true);
      onSaved?.(updated);
      onTriggerSynapse?.(`Prompt e IA do agente [${updated.name}] atualizados com sucesso!`);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  const handleTestPrompt = async () => {
    if (!testInput.trim()) return;
    setTestingBehavior(true);
    setTestResponse(null);

    onTriggerSynapse?.(`Testando comportamento do agente [${currentAgent.name}]...`);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: {
            ...currentAgent,
            customPromptBehavior: promptText,
            logic: promptText,
            hasDedicatedLLM,
            dedicatedLLMConfig: hasDedicatedLLM
              ? {
                  provider: dedicatedProvider,
                  model: dedicatedModel,
                  apiKey: dedicatedApiKey,
                  customEndpoint: dedicatedEndpoint,
                  temperature,
                }
              : undefined,
          },
          message: testInput,
          llmConfig: hasDedicatedLLM
            ? {
                provider: dedicatedProvider,
                model: dedicatedModel,
                apiKey: dedicatedApiKey,
                customEndpoint: dedicatedEndpoint,
              }
            : UniversalLLMService.getInstance().getConfig(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTestResponse(data.resposta || 'Resposta gerada com sucesso.');
      } else {
        setTestResponse('Erro na chamada da LLM. Verifique as configurações de chave ou conexão.');
      }
    } catch (e: any) {
      setTestResponse(`Falha ao testar comportamento: ${e.message}`);
    } finally {
      setTestingBehavior(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <BrainCircuit className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Espaço de Prompt & Comportamento da IA
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  Diretrizes Cognitivas
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Escreva exatamente como o Agente de IA deve pensar, raciocinar, auditar e se comportar
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {savedSuccess && (
              <span className="text-xs text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/30 animate-pulse">
                <CheckCircle2 className="w-3.5 h-3.5" /> Salvo com sucesso!
              </span>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Agent Selector Bar */}
        <div className="flex items-center gap-2 px-6 py-2.5 bg-slate-950/50 border-b border-slate-800 overflow-x-auto">
          <span className="text-xs text-slate-400 shrink-0 font-medium">Selecionar Agente:</span>
          {agents.map((ag) => (
            <button
              key={ag.id}
              onClick={() => setActiveAgentId(ag.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeAgentId === ag.id
                  ? 'bg-purple-600/30 text-purple-200 border border-purple-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-purple-400" />
              {ag.name}
              {ag.hasDedicatedLLM && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" title="IA Dedicada Ativa" />
              )}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Coluna Esquerda: Editor de Prompt (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Presets Rápidos */}
            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Modelos de Comportamento Pré-definidos:
              </span>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_PROMPTS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="p-2 text-left bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-purple-500/40 rounded-lg transition-colors group"
                  >
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-purple-300">
                      {preset.title}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">{preset.role}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Papel / Role do Agente */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Papel / Especialidade do Agente
              </label>
              <input
                type="text"
                value={roleText}
                onChange={(e) => setRoleText(e.target.value)}
                placeholder="Ex: Auditor Bazin & Graham, Sentinela de Alavancagem, Gestor Home Assistant..."
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Prompt de Comportamento */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                  <FileCode className="w-4 h-4 text-purple-400" />
                  Instruções do Sistema & Como o Agente Deve se Comportar (System Prompt)
                </label>
                <span className="text-[11px] font-mono text-slate-500">
                  {promptText.length} caracteres
                </span>
              </div>
              <textarea
                rows={11}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Descreva detalhadamente as regras, o tom de voz, métricas que deve calcular, comportamentos proibidos e diretrizes de decisão deste agente de IA..."
                className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Dica: Especifique critérios numéricos (como limites de DL/EBITDA ou regras de automação) para obter respostas consistentes.
              </p>
            </div>
          </div>

          {/* Coluna Direita: IA Dedicada Opcional & Sandbox de Teste (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Box IA Dedicada Opcional */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-white">IA Dedicada (Opcional)</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasDedicatedLLM}
                    onChange={(e) => setHasDedicatedLLM(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>
              <p className="text-[11px] text-slate-400">
                {hasDedicatedLLM
                  ? 'Este agente usará sua própria IA dedicada selecionada abaixo para máximo desempenho.'
                  : 'IA desativada ou compartilhada: o agente opera no modo global padrão do Jarvis.'}
              </p>

              {hasDedicatedLLM && (
                <div className="space-y-3 pt-2 border-t border-slate-800 animate-fade-in">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Escolha a Melhor IA para Este Agente:
                    </label>
                    <select
                      value={dedicatedProvider}
                      onChange={(e) => handleProviderChange(e.target.value as LLMProviderType)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      {SUPPORTED_PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.company})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Modelo Específico da IA:
                    </label>
                    <select
                      value={dedicatedModel}
                      onChange={(e) => setDedicatedModel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
                    >
                      {currentProviderDef.models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Chave de API (Opcional - se vazio usa a chave global salva)
                    </label>
                    <input
                      type="password"
                      value={dedicatedApiKey}
                      onChange={(e) => setDedicatedApiKey(e.target.value)}
                      placeholder="Chave customizada para este agente..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Sandbox de Teste do Comportamento */}
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-white">Testar Comportamento em Tempo Real</span>
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTestPrompt()}
                  placeholder="Envie uma pergunta ou cenário para testar..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
                />
                <button
                  type="button"
                  onClick={handleTestPrompt}
                  disabled={testingBehavior || !testInput.trim()}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 ${testingBehavior ? 'animate-spin' : ''}`} />
                  {testingBehavior ? 'Processando Cognição...' : 'Executar Teste com este Prompt'}
                </button>
              </div>

              {testResponse && (
                <div className="p-3 bg-slate-900 rounded-lg border border-purple-500/30 text-xs text-purple-200 font-mono leading-relaxed max-h-36 overflow-y-auto">
                  {testResponse}
                </div>
              )}
            </div>

            {/* Ações */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleSave()}
                className="w-full py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Salvar Prompt e Configurações do Agente
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
