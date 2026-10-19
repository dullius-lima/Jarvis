import React, { useState, useEffect } from 'react';
import {
  JarvisSupervisorService,
  PERSONALITY_ARCHETYPES,
} from '../services/jarvisSupervisorService';
import {
  SupervisorJarvisConfig,
  DelegatedAgentTask,
  AgentDefinition,
  LLMProviderType,
} from '../types/neural';
import { AgentRegistryService, BODY_PARTS_CONFIG } from '../services/agentRegistry';
import { SUPPORTED_PROVIDERS, UniversalLLMService } from '../services/llmConfig';
import {
  X,
  Crown,
  Sparkles,
  Sliders,
  Play,
  CheckCircle2,
  AlertCircle,
  Copy,
  Layers,
  Bot,
  Cpu,
  Brain,
  Shield,
  Clock,
  ArrowRight,
  TrendingUp,
  FileText,
  Volume2,
  RefreshCw,
} from 'lucide-react';

interface JarvisSupervisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerSynapse?: (label: string) => void;
}

export const JarvisSupervisorModal: React.FC<JarvisSupervisorModalProps> = ({
  isOpen,
  onClose,
  onTriggerSynapse,
}) => {
  const supervisorService = JarvisSupervisorService.getInstance();
  const agentService = AgentRegistryService.getInstance();

  const [activeTab, setActiveTab] = useState<'personality' | 'subagents' | 'tasks'>('personality');
  const [config, setConfig] = useState<SupervisorJarvisConfig>(() => supervisorService.getConfig());
  const [agents, setAgents] = useState<AgentDefinition[]>(() => agentService.listAgents());
  const [tasks, setTasks] = useState<DelegatedAgentTask[]>(() => supervisorService.getTaskHistory());

  // Teste de Supervisão
  const [testCommand, setTestCommand] = useState<string>('Jarvis, auditar Preço-Teto de TAEE11 e adaptar as luzes do escritório.');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    const unsubSupervisor = supervisorService.subscribe(() => {
      setConfig(supervisorService.getConfig());
      setTasks(supervisorService.getTaskHistory());
    });
    const unsubAgents = agentService.subscribe(() => {
      setAgents(agentService.listAgents());
    });
    return () => {
      unsubSupervisor();
      unsubAgents();
    };
  }, []);

  if (!isOpen) return null;

  const handleSavePersonality = () => {
    supervisorService.updateConfig(config);
    setSavedSuccess(true);
    onTriggerSynapse?.('Personalidade e diretrizes do Supervisor Jarvis salvas com sucesso.');
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleSelectArchetype = (archKey: SupervisorJarvisConfig['archetype']) => {
    supervisorService.setArchetype(archKey);
    setConfig(supervisorService.getConfig());
    onTriggerSynapse?.(`Arquétipo do Jarvis alterado para [${PERSONALITY_ARCHETYPES[archKey].name}]`);
  };

  const handleUpdateSubAgentLLM = (
    agentId: string,
    hasDedicated: boolean,
    provider: LLMProviderType,
    model: string
  ) => {
    agentService.updateAgent(agentId, {
      hasDedicatedLLM: hasDedicated,
      dedicatedLLMConfig: {
        provider,
        model,
      },
      llmProvider: provider,
      model,
    });
    setAgents(agentService.listAgents());
    onTriggerSynapse?.(`IA atualizada para o agente subjacente com modelo ${model}`);
  };

  const handleRunSupervisorSimulation = async () => {
    if (!testCommand.trim() || isSimulating) return;
    setIsSimulating(true);
    setSimulationResult(null);
    onTriggerSynapse?.('Supervisor Jarvis decompondo e delegando tarefas...');

    try {
      const res = await supervisorService.orchestrateTask(testCommand, {
        speakerName: 'Matheus Dullius',
        role: 'Líder / CFO',
      });
      setSimulationResult(res);
      onTriggerSynapse?.('Missão concluída pelos agentes subjacentes.');
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-5xl w-full h-[92vh] flex flex-col shadow-[0_0_50px_rgba(245,158,11,0.2)] overflow-hidden">
        
        {/* ================================================================== */}
        {/* CABEÇALHO DO AGENTE SUPERVISOR JARVIS                              */}
        {/* ================================================================== */}
        <header className="px-5 py-3.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-600/10 border border-amber-500/60 flex items-center justify-center text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-sans text-white tracking-wide">
                  JARVIS · AGENTE SUPERVISOR CENTRAL
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/40">
                  META-ORQUESTRADOR
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans">
                O Jarvis comanda a equipe, decompõe metas complexas e delega tarefas para agentes subjacentes com as IAs de sua escolha.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSavePersonality}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{savedSuccess ? 'Salvo!' : 'Salvar Alterações'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* ================================================================== */}
        {/* NAVEGAÇÃO DE ABAS                                                  */}
        {/* ================================================================== */}
        <nav className="flex items-center gap-2 px-5 py-2.5 bg-slate-950/50 border-b border-slate-800 text-xs font-mono shrink-0">
          <button
            onClick={() => setActiveTab('personality')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'personality'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Prompt de Personalidade do Jarvis</span>
          </button>

          <button
            onClick={() => setActiveTab('subagents')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'subagents'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Bot className="w-4 h-4 text-cyan-400" />
            <span>Agentes Subjacentes & Escolha de IAs ({agents.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'tasks'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Clock className="w-4 h-4 text-purple-400" />
            <span>Histórico de Delegação ({tasks.length})</span>
          </button>
        </nav>

        {/* ================================================================== */}
        {/* CONTEÚDO PRINCIPAL                                                 */}
        {/* ================================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-900/50">

          {/* ---------------------------------------------------------------- */}
          {/* ABA 1: PROMPT DE PERSONALIDADE DO SUPERVISOR JARVIS              */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'personality' && (
            <div className="space-y-5">
              {/* Arquétipos de Personalidade Prontos */}
              <div>
                <label className="text-xs font-mono font-bold text-slate-300 block mb-2 flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-400" />
                  SELECIONE O ARQUÉTIPO DE PERSONALIDADE DO JARVIS:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {(Object.keys(PERSONALITY_ARCHETYPES) as Array<SupervisorJarvisConfig['archetype']>).map((archKey) => {
                    const arch = PERSONALITY_ARCHETYPES[archKey];
                    const isSelected = config.archetype === archKey;
                    return (
                      <button
                        key={archKey}
                        onClick={() => handleSelectArchetype(archKey)}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-950/60 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.25)] ring-1 ring-amber-500/50'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="font-bold text-xs text-white mb-1 flex items-center justify-between">
                          <span>{arch.name}</span>
                          {isSelected && <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2">{arch.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Editor do Prompt de Personalidade Mestre */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono font-bold text-amber-300 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-amber-400" />
                    PROMPT DE PERSONALIDADE & DIRETRIZES DO SUPERVISOR (EDITÁVEL):
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {config.systemPersonalityPrompt.length} caracteres
                  </span>
                </div>
                <textarea
                  rows={9}
                  value={config.systemPersonalityPrompt}
                  onChange={(e) => setConfig({ ...config, systemPersonalityPrompt: e.target.value })}
                  placeholder="Escreva como o Jarvis deve se comportar, falar, raciocinar e supervisionar..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-2xl p-4 text-xs text-slate-100 font-mono outline-none focus:border-amber-400 shadow-inner"
                />
              </div>

              {/* Parâmetros do Supervisor (Tom de Voz, Autonomia e Modelo do Jarvis) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono">
                <div>
                  <label className="text-slate-400 block mb-1">Tom de Voz:</label>
                  <select
                    value={config.toneOfVoice}
                    onChange={(e) => setConfig({ ...config, toneOfVoice: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-400 cursor-pointer"
                  >
                    <option value="formal">Britânico Formal & Respeitoso</option>
                    <option value="executivo">Executivo & Frio (CFO)</option>
                    <option value="amigavel_conciso">Amigável & Conciso</option>
                    <option value="direto_frio">Militar Direto & Objetivo</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Autonomia Decisória:</label>
                  <select
                    value={config.decisionAutonomy}
                    onChange={(e) => setConfig({ ...config, decisionAutonomy: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-400 cursor-pointer"
                  >
                    <option value="total">Autonomia Total (Despacha Subjacentes)</option>
                    <option value="confirmar_alto_impacto">Confirmar Ações Financeiras Críticas</option>
                    <option value="supervisionada">Supervisionada (Sempre pede confirmação)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">IA do Supervisor Jarvis:</label>
                  <select
                    value={config.supervisorModel}
                    onChange={(e) => setConfig({ ...config, supervisorModel: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-amber-300 font-bold outline-none focus:border-amber-400 cursor-pointer"
                  >
                    <option value="gemini-3.8-flash">Google Gemini 3.8 Flash (Recomendado)</option>
                    <option value="claude-3-7-sonnet-20250219">Anthropic Claude 3.7 Sonnet</option>
                    <option value="gpt-4o">OpenAI GPT-4o Omni</option>
                    <option value="deepseek-reasoner">DeepSeek R1 Reasoner</option>
                    <option value="llama-3.3-70b-versatile">Groq LPU LLaMA 3.3</option>
                  </select>
                </div>
              </div>

              {/* Sandbox de Simulação de Supervisão */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-amber-300 font-mono flex items-center gap-1.5">
                    <Play className="w-4 h-4 text-amber-400" />
                    SIMULADOR DE SUPERVISÃO & DELEGAÇÃO EM TEMPO REAL:
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Testar cadeia de comando</span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testCommand}
                    onChange={(e) => setTestCommand(e.target.value)}
                    placeholder="Digite a ordem para o Jarvis..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-amber-400 font-mono"
                  />
                  <button
                    onClick={handleRunSupervisorSimulation}
                    disabled={isSimulating}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{isSimulating ? 'Decompondo...' : 'Testar Ordem'}</span>
                  </button>
                </div>

                {simulationResult && (
                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono space-y-2 animate-in fade-in">
                    <div className="font-bold text-amber-400">Resposta Consolidada do Jarvis:</div>
                    <p className="text-slate-200 italic bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                      "{simulationResult.finalResponse}"
                    </p>
                    <div className="text-[11px] text-slate-400">
                      <strong>Tarefas Despachadas ({simulationResult.delegatedTasks.length}):</strong>
                      <div className="mt-1 space-y-1">
                        {simulationResult.delegatedTasks.map((t: DelegatedAgentTask) => (
                          <div key={t.id} className="flex items-center justify-between bg-slate-950 px-2 py-1 rounded">
                            <span className="text-cyan-300">{t.agentName} ({t.modelUsed}):</span>
                            <span className="text-emerald-400">{t.executionResult}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* ABA 2: AGENTES SUBJACENTES & ESCOLHA DE SUAS RESPECTIVAS IAS     */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'subagents' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 text-xs font-mono text-cyan-200 flex items-center justify-between">
                <span>
                  O Jarvis atua como supervisor no topo e delega missões para os agentes abaixo. Escolha a melhor IA para cada um!
                </span>
                <span className="font-bold text-cyan-400">{agents.length} Agentes Subjacentes</span>
              </div>

              {agents.length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center space-y-2">
                  <Bot className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400 font-mono">Nenhum agente subjacente criado no ficheiro.</p>
                  <p className="text-[11px] text-slate-500">Crie novos agentes no menu de ferramentas para que o Jarvis possa coordená-los.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {agents.map((ag) => {
                    const currentProvider = (ag.hasDedicatedLLM && ag.dedicatedLLMConfig?.provider) ? ag.dedicatedLLMConfig.provider : (ag.llmProvider === 'global' ? 'gemini' : ag.llmProvider);
                    const currentModel = (ag.hasDedicatedLLM && ag.dedicatedLLMConfig?.model) ? ag.dedicatedLLMConfig.model : ag.model;
                    const providerDef = SUPPORTED_PROVIDERS.find((p) => p.id === currentProvider) || SUPPORTED_PROVIDERS[0];
                    const partLabel = ag.bodyPart && BODY_PARTS_CONFIG[ag.bodyPart]?.label ? BODY_PARTS_CONFIG[ag.bodyPart].label : 'Corpo';

                    return (
                      <div
                        key={ag.id}
                        className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-bold text-xs">
                              {ag.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-xs text-white flex items-center gap-2">
                                <span>{ag.name}</span>
                                <span className="text-[9px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300 font-mono">
                                  {partLabel}
                                </span>
                                <span className="text-[9px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 font-mono">
                                  Silo: {ag.targetDatabase}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">{ag.role}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(ag.hasDedicatedLLM)}
                                onChange={(e) => {
                                  handleUpdateSubAgentLLM(ag.id, e.target.checked, currentProvider as any, currentModel);
                                }}
                                className="rounded accent-cyan-500"
                              />
                              <span>IA Dedicada</span>
                            </label>
                          </div>
                        </div>

                        {/* Seletor de Provedor & Modelo Atualizado para Este Agente */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-850 text-xs font-mono">
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-1">Provedor de IA:</label>
                            <select
                              value={currentProvider}
                              onChange={(e) => {
                                const newP = e.target.value as LLMProviderType;
                                const pDef = SUPPORTED_PROVIDERS.find((p) => p.id === newP);
                                handleUpdateSubAgentLLM(ag.id, true, newP, pDef?.defaultModel || 'padrão');
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white outline-none focus:border-cyan-400 cursor-pointer"
                            >
                              {SUPPORTED_PROVIDERS.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.company})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 block mb-1">Modelo Selecionado (Versão Atualizada):</label>
                            <select
                              value={currentModel}
                              onChange={(e) => {
                                handleUpdateSubAgentLLM(ag.id, true, currentProvider as any, e.target.value);
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-cyan-300 font-bold outline-none focus:border-cyan-400 cursor-pointer"
                            >
                              {providerDef.models.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* ABA 3: HISTÓRICO DE TAREFAS DELEGADAS                            */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'tasks' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800 pb-2">
                <span>Histórico de Tarefas Orquestradas e Delegadas pelo Supervisor:</span>
                <span>{tasks.length} registros</span>
              </div>

              {tasks.length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-500 font-mono">
                  Nenhuma tarefa delegada ainda. Execute uma ordem no simulador para ver as tarefas dos subjacentes.
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((t) => (
                    <div key={t.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-300 flex items-center gap-1.5">
                          <Crown className="w-3.5 h-3.5 text-amber-400" />
                          Delegação para: {t.agentName}
                        </span>
                        <span className="text-[10px] text-cyan-400">
                          {t.modelUsed} ({t.executionDurationMs}ms)
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300">
                        <strong>Instrução:</strong> {t.taskInstruction}
                      </div>
                      <div className="text-[11px] text-emerald-400 bg-slate-900 p-2 rounded border border-slate-800">
                        {t.executionResult}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
