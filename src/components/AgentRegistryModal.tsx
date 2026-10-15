import React, { useState } from 'react';
import { AgentDefinition, AgentAuditResult, LLMProviderType } from '../types/neural';
import { AgentRegistryService } from '../services/agentRegistry';
import { MicroDatastoresService } from '../services/microDatastores';
import {
  Bot,
  Plus,
  X,
  Play,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Database,
  Cpu,
  Save,
  Search,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Terminal
} from 'lucide-react';

interface AgentRegistryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerSynapse: (label: string) => void;
}

export const AgentRegistryModal: React.FC<AgentRegistryModalProps> = ({
  isOpen,
  onClose,
  onTriggerSynapse,
}) => {
  const agentService = AgentRegistryService.getInstance();
  const microService = MicroDatastoresService.getInstance();

  const [agents, setAgents] = useState<AgentDefinition[]>(() => agentService.listAgents());
  const [searchTerm, setSearchTerm] = useState('');
  const [editingAgent, setEditingAgent] = useState<AgentDefinition | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [runningAuditId, setRunningAuditId] = useState<string | null>(null);
  const [lastAuditResult, setLastAuditResult] = useState<AgentAuditResult | null>(null);

  // Formulário de Criação de Novo Agente
  const [novoNome, setNovoNome] = useState('');
  const [novoPapel, setNovoPapel] = useState('');
  const [novoBanco, setNovoBanco] = useState('');
  const [novaLogica, setNovaLogica] = useState('');
  const [novoProvedor, setNovoProvedor] = useState<LLMProviderType | 'global'>('global');
  const [novosGatilhos, setNovosGatilhos] = useState('');

  if (!isOpen) return null;

  const recarregar = () => {
    setAgents(agentService.listAgents());
  };

  const handleSalvarEdicao = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAgent) return;
    agentService.updateAgent(editingAgent.id, editingAgent);
    recarregar();
    onTriggerSynapse(`Lógica do Agente ${editingAgent.name} Atualizada`);
    setEditingAgent(null);
  };

  const handleCriarAgente = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim() || !novaLogica.trim()) return;

    const dbKey = (novoBanco.trim() || 'GERAL').toUpperCase();
    const id = `agente-custom-${Date.now()}`;

    const novo: AgentDefinition = {
      id,
      name: novoNome.trim(),
      role: novoPapel.trim() || `Especialista em ${dbKey}`,
      targetDatabase: dbKey,
      logic: novaLogica.trim(),
      llmProvider: novoProvedor,
      model: 'padrão-sistema',
      status: 'ativo',
      lastAuditVerdict: 'OK',
      lastAuditDetails: 'Agente criado manualmente. Pronto para auditorias.',
      lastAuditDate: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
      triggers: novosGatilhos
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      isAutonomous: true,
      createdAt: new Date().toLocaleDateString('pt-BR'),
      author: 'Matheus Dullius',
    };

    agentService.registerAgent(novo);
    // Garantir que o banco isolado também exista se não existir
    if (dbKey !== 'GERAL') {
      microService.autoAlimentarOuCriar(dbKey, 'ativo_b3');
    }

    recarregar();
    onTriggerSynapse(`Novo Agente Criado: ${novo.name}`);
    setShowCreateModal(false);
    setNovoNome('');
    setNovoPapel('');
    setNovoBanco('');
    setNovaLogica('');
    setNovosGatilhos('');
  };

  const handleExecutarAuditoria = async (agent: AgentDefinition) => {
    setRunningAuditId(agent.id);
    onTriggerSynapse(`Auditoria Delegada: ${agent.name}`);
    try {
      const res = await agentService.delegateAudit(agent.id);
      setLastAuditResult(res);
      recarregar();
    } catch (e: any) {
      console.warn('Erro ao executar auditoria delegada:', e);
    } finally {
      setRunningAuditId(null);
    }
  };

  const handleExcluirAgente = (id: string, name: string) => {
    if (confirm(`Deseja desativar e excluir o agente "${name}"?`)) {
      agentService.deleteAgent(id);
      recarregar();
      onTriggerSynapse(`Agente ${name} Removido`);
    }
  };

  const bancosDisponiveis = microService.listarTodos();
  const agentesFiltrados = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.targetDatabase.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-4xl max-h-[92vh] bg-slate-950 border border-red-500/40 rounded-3xl p-5 sm:p-7 shadow-[0_0_80px_rgba(239,68,68,0.25)] flex flex-col relative overflow-hidden text-slate-100">
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
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold font-mono tracking-wide text-red-200">
                Ficheiro de Agentes & Lógica Neural
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-950 border border-red-500/40 text-red-400 font-bold uppercase">
                {agents.length} Agentes Registrados
              </span>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Gerencie a autoria, regras de auditoria e a lógica de cada especialista autônomo do Jarvis.
            </p>
          </div>
        </div>

        {/* Barra de Ações: Busca & Criar Agente */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por agente, papel ou banco..."
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-red-500/60"
            />
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-bold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.35)] transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Criar Novo Agente de IA</span>
          </button>
        </div>

        {/* Modal Inline de Criação de Agente */}
        {showCreateModal && (
          <form
            onSubmit={handleCriarAgente}
            className="mb-4 p-4 rounded-2xl bg-red-950/20 border border-red-500/50 space-y-3 animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-red-500/30 pb-2">
              <span className="text-xs font-bold font-mono text-red-300 uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-red-400" />
                Autoria de Novo Agente Especialista
              </span>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Nome do Agente
                </label>
                <input
                  type="text"
                  required
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Ex: Auditor Bazin CPLE6"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:border-red-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Papel / Função
                </label>
                <input
                  type="text"
                  value={novoPapel}
                  onChange={(e) => setNovoPapel(e.target.value)}
                  placeholder="Ex: Auditor de Energia & Proventos"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:border-red-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Banco de Dados Vinculado
                </label>
                <input
                  type="text"
                  value={novoBanco}
                  onChange={(e) => setNovoBanco(e.target.value)}
                  placeholder="Ex: CPLE6 ou GERAL"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:border-red-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                Lógica & Diretrizes do Agente (Prompt de Auditoria)
              </label>
              <textarea
                rows={3}
                required
                value={novaLogica}
                onChange={(e) => setNovaLogica(e.target.value)}
                placeholder="Descreva a lógica estrita: cálculo de preço-teto Bazin, limites de dívida/EBITDA, gatilhos de alerta e condições para veredito..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 focus:border-red-500 outline-none font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Gatilhos de Alerta (separados por vírgula)
                </label>
                <input
                  type="text"
                  value={novosGatilhos}
                  onChange={(e) => setNovosGatilhos(e.target.value)}
                  placeholder="Cotação > Teto, Dívida/EBITDA > 3.5x"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:border-red-500 outline-none"
                />
              </div>

              <div className="flex items-end justify-end">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold flex items-center gap-1.5 shadow-md"
                >
                  <Save className="w-4 h-4" />
                  Salvar e Registrar Agente
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Modal de Edição de Lógica */}
        {editingAgent && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
            <div className="w-full max-w-2xl bg-slate-950 border border-red-500/50 rounded-2xl p-6 shadow-2xl relative">
              <button
                onClick={() => setEditingAgent(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 mb-3">
                <Edit3 className="w-5 h-5 text-red-400" />
                <h3 className="text-sm font-mono font-bold text-white uppercase">
                  Modificar Lógica: {editingAgent.name}
                </h3>
              </div>

              <form onSubmit={handleSalvarEdicao} className="space-y-3">
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    Nome e Função
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editingAgent.name}
                      onChange={(e) => setEditingAgent({ ...editingAgent, name: e.target.value })}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    />
                    <input
                      type="text"
                      value={editingAgent.role}
                      onChange={(e) => setEditingAgent({ ...editingAgent, role: e.target.value })}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    Lógica e Diretrizes de Auditoria (Instruções Sistêmicas)
                  </label>
                  <textarea
                    rows={6}
                    value={editingAgent.logic}
                    onChange={(e) => setEditingAgent({ ...editingAgent, logic: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 outline-none font-mono leading-relaxed"
                  />
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-[10px] font-mono text-slate-400">
                    Banco de Dados: <strong className="text-red-400">{editingAgent.targetDatabase}</strong>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingAgent(null)}
                      className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold flex items-center gap-1.5"
                    >
                      <Save className="w-4 h-4" />
                      Salvar Alterações
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Feedback de Última Auditoria Executada */}
        {lastAuditResult && (
          <div className="mb-4 p-3 rounded-2xl bg-slate-900 border border-red-500/40 flex items-start justify-between text-xs animate-in slide-in-from-top-1">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-red-300 font-mono">
                  [{lastAuditResult.agentName}] Veredito:
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    lastAuditResult.verdict === 'COMPRAR'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                      : lastAuditResult.verdict === 'QUARENTENA'
                      ? 'bg-rose-950 text-rose-400 border border-rose-500/40'
                      : 'bg-amber-950 text-amber-400 border border-amber-500/40'
                  }`}
                >
                  {lastAuditResult.verdict}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {lastAuditResult.timestamp}
                </span>
              </div>
              <p className="text-slate-300 font-sans text-xs">{lastAuditResult.details}</p>
            </div>
            <button
              onClick={() => setLastAuditResult(null)}
              className="text-[10px] text-slate-500 hover:text-slate-300 shrink-0 ml-3"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Lista de Ficheiro de Agentes */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {agentesFiltrados.map((agent) => {
            const isRunning = runningAuditId === agent.id;
            return (
              <div
                key={agent.id}
                className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-red-500/40 transition-all flex flex-col gap-2.5"
              >
                {/* Cabeçalho do Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        agent.status === 'alerta'
                          ? 'bg-rose-500 animate-ping'
                          : agent.status === 'em_auditoria'
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-emerald-500'
                      }`}
                    />
                    <div>
                      <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                        <span>{agent.name}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {agent.role}
                        </span>
                      </h4>
                      <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                        <span>Banco: <strong className="text-red-400">{agent.targetDatabase}</strong></span>
                        <span>·</span>
                        <span>Autor: {agent.author}</span>
                        <span>·</span>
                        <span>Última auditoria: {agent.lastAuditDate || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Veredito Atual */}
                  {agent.lastAuditVerdict && (
                    <div className="flex items-center gap-1.5 self-start sm:self-center">
                      <span className="text-[10px] font-mono text-slate-400">Veredito:</span>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold uppercase border ${
                          agent.lastAuditVerdict === 'COMPRAR'
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                            : agent.lastAuditVerdict === 'QUARENTENA'
                            ? 'bg-rose-950/80 text-rose-300 border-rose-500/50'
                            : 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                        }`}
                      >
                        {agent.lastAuditVerdict}
                      </span>
                    </div>
                  )}
                </div>

                {/* Caixa de Lógica Resumida */}
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs font-mono text-slate-300 whitespace-pre-line leading-relaxed max-h-24 overflow-y-auto">
                  {agent.logic}
                </div>

                {/* Rodapé do Card: Ações */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {agent.triggers?.map((trig, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-slate-700/60"
                      >
                        ⚡ {trig}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Botão Modificar Lógica */}
                    <button
                      onClick={() => setEditingAgent(agent)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono flex items-center gap-1.5 transition-colors"
                      title="Mudar regras e lógica do agente"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-red-400" />
                      <span>Mudar Lógica</span>
                    </button>

                    {/* Botão Executar Auditoria */}
                    <button
                      disabled={isRunning}
                      onClick={() => handleExecutarAuditoria(agent)}
                      className="px-3 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                      title="Delegar auditoria agora"
                    >
                      {isRunning ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      <span>{isRunning ? 'Auditando...' : 'Auditar'}</span>
                    </button>

                    {/* Excluir Agente se for custom */}
                    {agent.id.startsWith('agente-custom') && (
                      <button
                        onClick={() => handleExcluirAgente(agent.id, agent.name)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                        title="Excluir Agente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
