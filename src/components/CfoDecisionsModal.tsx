import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Bot,
  Trash2,
  PlusCircle,
  Brain,
  History,
  X,
  Search,
  Filter,
  Sparkles,
  Download,
  Activity,
  Layers,
  ArrowRight,
  Clock,
  Calendar,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import {
  cfoDecisionService,
  DecisaoAutonomaCFO,
  TipoAcaoCFO,
  CategoriaAtivo,
} from '../services/cfoDecisionService';

interface CfoDecisionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInspectNodeInBrain: (targetNodeId: string | null, label: string) => void;
  onOpenAgentRegistry?: () => void;
  onOpenMemories?: () => void;
}

export const CfoDecisionsModal: React.FC<CfoDecisionsModalProps> = ({
  isOpen,
  onClose,
  onInspectNodeInBrain,
  onOpenAgentRegistry,
  onOpenMemories,
}) => {
  const [decisoes, setDecisoes] = useState<DecisaoAutonomaCFO[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODAS');
  const [buscaTermo, setBuscaTermo] = useState<string>('');
  const [decisaoExpandidaId, setDecisaoExpandidaId] = useState<string | null>(null);
  const [ultimoImpactoDisparado, setUltimoImpactoDisparado] = useState<string | null>(null);

  useEffect(() => {
    const carregar = () => {
      setDecisoes(cfoDecisionService.listarDecisoes());
    };
    carregar();
    const unsubscribe = cfoDecisionService.subscribe(carregar);
    return () => unsubscribe();
  }, []);

  // Filtragem e busca reativa
  const decisoesFiltradas = useMemo(() => {
    return decisoes.filter((dec) => {
      if (filtroTipo !== 'TODOS' && dec.tipoAcao !== filtroTipo) {
        return false;
      }
      if (filtroCategoria !== 'TODAS' && dec.categoria !== filtroCategoria) {
        return false;
      }
      if (buscaTermo.trim()) {
        const t = buscaTermo.toLowerCase();
        const matchTitulo = dec.titulo.toLowerCase().includes(t);
        const matchAlvo = dec.ativoOuAlvo.toLowerCase().includes(t);
        const matchJust = dec.justificativaLogica.toLowerCase().includes(t);
        const matchData = dec.dataFormatada.toLowerCase().includes(t);
        if (!matchTitulo && !matchAlvo && !matchJust && !matchData) return false;
      }
      return true;
    });
  }, [decisoes, filtroTipo, filtroCategoria, buscaTermo]);

  if (!isOpen) return null;

  const handleDispararImpacto = (dec: DecisaoAutonomaCFO) => {
    onInspectNodeInBrain(dec.targetNodeId, `Impacto CFO: ${dec.ativoOuAlvo} - ${dec.titulo}`);
    setUltimoImpactoDisparado(dec.id);
    setTimeout(() => {
      setUltimoImpactoDisparado(null);
    }, 4000);
  };

  const handleExportarRelatorio = () => {
    const jsonStr = cfoDecisionService.exportarJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_cfo_decisoes_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getIconeAcao = (tipo: TipoAcaoCFO) => {
    switch (tipo) {
      case 'CRIACAO_AGENTE':
        return <Bot className="w-4 h-4 text-emerald-400" />;
      case 'EXCLUSAO_AGENTE':
        return <Trash2 className="w-4 h-4 text-rose-400" />;
      case 'CRIACAO_MEMORIA':
        return <Brain className="w-4 h-4 text-cyan-400" />;
      case 'EXCLUSAO_MEMORIA':
        return <Trash2 className="w-4 h-4 text-amber-400" />;
      case 'DELIBERACAO_QUARENTENA':
        return <ShieldAlert className="w-4 h-4 text-red-400 animate-pulse" />;
      case 'PARECER_ALOCACAO':
        return <ShieldCheck className="w-4 h-4 text-teal-400" />;
      case 'REBALANCEAMENTO_ESTRATEGICO':
        return <Activity className="w-4 h-4 text-indigo-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-cyan-400" />;
    }
  };

  const getCorBadgeTipo = (tipo: TipoAcaoCFO) => {
    switch (tipo) {
      case 'CRIACAO_AGENTE':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40';
      case 'EXCLUSAO_AGENTE':
        return 'bg-rose-950/80 text-rose-300 border-rose-500/40';
      case 'CRIACAO_MEMORIA':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40';
      case 'EXCLUSAO_MEMORIA':
        return 'bg-amber-950/80 text-amber-300 border-amber-500/40';
      case 'DELIBERACAO_QUARENTENA':
        return 'bg-red-950 text-red-300 border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.3)]';
      case 'PARECER_ALOCACAO':
        return 'bg-teal-950/80 text-teal-300 border-teal-500/40';
      default:
        return 'bg-slate-900 text-slate-300 border-slate-700';
    }
  };

  const getRotuloTipoAmigavel = (tipo: TipoAcaoCFO) => {
    switch (tipo) {
      case 'CRIACAO_AGENTE':
        return 'Criação de Agente';
      case 'EXCLUSAO_AGENTE':
        return 'Exclusão de Agente';
      case 'CRIACAO_MEMORIA':
        return 'Criação de Memória';
      case 'EXCLUSAO_MEMORIA':
        return 'Purga de Memória';
      case 'DELIBERACAO_QUARENTENA':
        return 'Veto / Quarentena Bazin';
      case 'PARECER_ALOCACAO':
        return 'Parecer de Alocação';
      case 'REBALANCEAMENTO_ESTRATEGICO':
        return 'Rebalanceamento';
      default:
        return tipo;
    }
  };

  // Contadores para métricas no topo do modal
  const totalAgentesCriados = decisoes.filter((d) => d.tipoAcao === 'CRIACAO_AGENTE').length;
  const totalAgentesExcluidos = decisoes.filter((d) => d.tipoAcao === 'EXCLUSAO_AGENTE').length;
  const totalMemoriasCriadas = decisoes.filter((d) => d.tipoAcao === 'CRIACAO_MEMORIA').length;
  const totalMemoriasPurgadas = decisoes.filter((d) => d.tipoAcao === 'EXCLUSAO_MEMORIA').length;
  const totalQuarentenas = decisoes.filter((d) => d.tipoAcao === 'DELIBERACAO_QUARENTENA').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="bg-[#030816] border border-cyan-500/35 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-[0_0_60px_rgba(14,165,233,0.18)] overflow-hidden">
        {/* ==================================================================== */}
        {/* HEADER DO PAINEL DE AUDITORIA DO CFO                                 */}
        {/* ==================================================================== */}
        <div className="p-4 sm:p-5 border-b border-cyan-500/20 bg-gradient-to-r from-slate-950 via-[#041026] to-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-950/70 border border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
              <History className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold font-mono text-cyan-300 flex items-center gap-2">
                  Histórico de Decisões Autônomas do CFO (IA)
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  Auditoria Executiva 10 Anos
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                Rastreamento cirúrgico de cada criação/exclusão de agentes e memórias com justificativa e impacto neural.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={handleExportarRelatorio}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Exportar log completo em JSON auditável"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar JSON</span>
            </button>
            <button
              onClick={() => cfoDecisionService.restaurarPadroes()}
              className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Restaurar semente de auditoria inicial"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 border border-slate-800 transition-colors"
              title="Fechar Painel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* CARDS DE RESUMO EXECUTIVO (MÉTRICAS DE AUTONOMIA)                   */}
        {/* ==================================================================== */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 sm:p-4 bg-slate-950/60 border-b border-slate-800/80 text-xs font-mono">
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Total Ações</div>
              <div className="text-base font-bold text-cyan-400">{decisoes.length}</div>
            </div>
            <Activity className="w-4 h-4 text-cyan-500/70" />
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Agentes (Criação/Purga)</div>
              <div className="text-base font-bold text-emerald-400">
                +{totalAgentesCriados} <span className="text-xs text-rose-400 font-normal">/ -{totalAgentesExcluidos}</span>
              </div>
            </div>
            <Bot className="w-4 h-4 text-emerald-500/70" />
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Memórias (Nós Cérebro)</div>
              <div className="text-base font-bold text-cyan-300">
                +{totalMemoriasCriadas} <span className="text-xs text-amber-400 font-normal">/ -{totalMemoriasPurgadas}</span>
              </div>
            </div>
            <Brain className="w-4 h-4 text-cyan-500/70" />
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Quarentenas Ativas</div>
              <div className="text-base font-bold text-rose-400">{totalQuarentenas}</div>
            </div>
            <ShieldAlert className="w-4 h-4 text-rose-500/70" />
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 col-span-2 sm:col-span-1 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Governança</div>
              <div className="text-xs font-bold text-amber-300">100% Autônomo</div>
            </div>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
        </div>

        {/* ==================================================================== */}
        {/* BARRA DE FILTROS & BUSCA RÁPIDA                                      */}
        {/* ==================================================================== */}
        <div className="p-3 sm:px-4 sm:py-3 bg-slate-950/80 border-b border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs font-mono">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={buscaTermo}
                onChange={(e) => setBuscaTermo(e.target.value)}
                placeholder="Buscar por ativo (PETR4, BBAS3...), lógica, data ou justificativa..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            {/* Filtro por Tipo de Ação */}
            <div className="flex items-center gap-1 shrink-0">
              <Filter className="w-3 h-3 text-slate-500" />
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50"
              >
                <option value="TODOS">Todas as Ações</option>
                <option value="CRIACAO_AGENTE">Criação de Agente</option>
                <option value="EXCLUSAO_AGENTE">Exclusão de Agente</option>
                <option value="CRIACAO_MEMORIA">Criação de Memória</option>
                <option value="EXCLUSAO_MEMORIA">Purga de Memória</option>
                <option value="DELIBERACAO_QUARENTENA">Veto / Quarentena Bazin</option>
                <option value="PARECER_ALOCACAO">Parecer de Alocação</option>
              </select>
            </div>

            {/* Filtro por Categoria de Mercado */}
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50 shrink-0"
            >
              <option value="TODAS">Todos os Mercados</option>
              <option value="AÇÕES B3">Ações B3</option>
              <option value="FUNDOS IMOBILIÁRIOS">FIIs</option>
              <option value="CRIPTOATIVOS">Criptoativos</option>
              <option value="TESOURO DIRETO">Tesouro / Renda Fixa</option>
              <option value="TÍTULOS PÚBLICOS">Títulos Públicos</option>
              <option value="TÍTULOS ESTRANGEIROS">Títulos Estrangeiros</option>
              <option value="COMMODITIES">Commodities</option>
              <option value="SISTEMA_NEURAL">Sistema Neural</option>
            </select>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* LINHA DO TEMPO INTERATIVA DE DECISÕES COM DESTAQUE NO CÉREBRO 3D     */}
        {/* ==================================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-sans custom-scrollbar">
          {decisoesFiltradas.length === 0 ? (
            <div className="py-16 text-center text-slate-500 font-mono text-xs">
              <History className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              Nenhuma decisão autônoma encontrada para os critérios selecionados.
            </div>
          ) : (
            <div className="relative pl-6 sm:pl-8 before:content-[''] before:absolute before:left-2 sm:before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-gradient-to-b before:from-cyan-500/60 before:via-blue-500/30 before:to-slate-800 space-y-4">
              {decisoesFiltradas.map((dec) => {
                const isExpandida = decisaoExpandidaId === dec.id;
                const isDisparada = ultimoImpactoDisparado === dec.id;

                return (
                  <div
                    key={dec.id}
                    className={`relative rounded-2xl border transition-all duration-300 ${
                      isDisparada
                        ? 'bg-cyan-950/40 border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.35)] scale-[1.01]'
                        : isExpandida
                        ? 'bg-slate-900/90 border-cyan-500/50 shadow-lg'
                        : 'bg-slate-950/80 border-slate-800/90 hover:border-slate-700/80 hover:bg-slate-900/50'
                    }`}
                  >
                    {/* Marcador na Linha do Tempo */}
                    <div
                      className={`absolute -left-[26px] sm:-left-[34px] top-4 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                        dec.impacto === 'CRITICO'
                          ? 'border-red-500 bg-red-950 shadow-[0_0_10px_#ef4444]'
                          : dec.tipoAcao.includes('AGENTE')
                          ? 'border-emerald-500 bg-emerald-950 shadow-[0_0_8px_#10b981]'
                          : 'border-cyan-400 bg-cyan-950 shadow-[0_0_8px_#22d3ee]'
                      }`}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>

                    {/* Conteúdo do Card */}
                    <div className="p-4 sm:p-5">
                      {/* Topo do Card: Badge do Tipo + Ativo + Data/Hora */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${getCorBadgeTipo(
                              dec.tipoAcao
                            )}`}
                          >
                            {getIconeAcao(dec.tipoAcao)}
                            {getRotuloTipoAmigavel(dec.tipoAcao)}
                          </span>

                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-cyan-300">
                            {dec.ativoOuAlvo}
                          </span>

                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                            {dec.categoria}
                          </span>
                        </div>

                        {/* Data e Hora Exatas */}
                        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 shrink-0">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>{dec.dataFormatada}</span>
                        </div>
                      </div>

                      {/* Título da Decisão */}
                      <h4 className="text-sm sm:text-base font-bold font-mono text-slate-100 mb-2">
                        {dec.titulo}
                      </h4>

                      {/* Caixa de Justificativa da Lógica Aplicada (Destaque Principal Solicitado) */}
                      <div className="rounded-xl bg-slate-900/90 border border-slate-800/90 p-3 sm:p-3.5 mb-3">
                        <div className="flex items-center justify-between text-[11px] font-mono font-bold text-amber-400 uppercase mb-1.5">
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            Justificativa da Lógica Aplicada (10 Anos)
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            Autor: {dec.autor}
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 leading-relaxed font-sans">
                          {dec.justificativaLogica}
                        </p>
                      </div>

                      {/* Parâmetros Quantitativos (Bazin / Solvência / Horizonte) */}
                      {dec.parametros && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-[11px] font-mono">
                          {dec.parametros.dlEbitda !== undefined && (
                            <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                              <span className="text-slate-400 block text-[9px] uppercase">Dívida Líq./EBITDA</span>
                              <span
                                className={`font-bold ${
                                  dec.parametros.dlEbitda > 3.5 ? 'text-red-400' : 'text-emerald-400'
                                }`}
                              >
                                {dec.parametros.dlEbitda}x {dec.parametros.dlEbitda > 3.5 ? '(Veto > 3.5x)' : '(Seguro)'}
                              </span>
                            </div>
                          )}

                          {dec.parametros.tetoBazin !== undefined && (
                            <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                              <span className="text-slate-400 block text-[9px] uppercase">Teto Bazin (DY 6%)</span>
                              <span className="font-bold text-cyan-300">
                                R$ {dec.parametros.tetoBazin.toFixed(2)}
                              </span>
                            </div>
                          )}

                          {dec.parametros.cotacao !== undefined && (
                            <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                              <span className="text-slate-400 block text-[9px] uppercase">Cotação Auditada</span>
                              <span className="font-bold text-slate-200">
                                R$ {dec.parametros.cotacao.toFixed(2)}
                              </span>
                            </div>
                          )}

                          {dec.parametros.margemSeguranca && (
                            <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                              <span className="text-slate-400 block text-[9px] uppercase">Margem de Segurança</span>
                              <span
                                className={`font-bold ${
                                  dec.parametros.margemSeguranca.startsWith('+')
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                                }`}
                              >
                                {dec.parametros.margemSeguranca}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Detalhes Expansíveis */}
                      {isExpandida && (
                        <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2.5 animate-in fade-in">
                          <div>
                            <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                              Ação Executiva Concretizada:
                            </span>
                            <p className="text-xs text-slate-300 font-sans leading-relaxed bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
                              {dec.detalhesExecutivos}
                            </p>
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                            <span>Status: <strong className="text-emerald-400">{dec.status}</strong></span>
                            <span>ID da Auditoria: <code className="text-cyan-400">{dec.id}</code></span>
                          </div>
                        </div>
                      )}

                      {/* Barra de Ações: Destaque de Impacto no Cérebro 3D & Detalhes */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-800/60 font-mono text-xs">
                        <div className="flex items-center gap-2">
                          {/* BOTÃO CRÍTICO: Disparar Impacto no Cérebro 3D */}
                          <button
                            onClick={() => handleDispararImpacto(dec)}
                            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                              isDisparada
                                ? 'bg-cyan-400 text-slate-950 scale-105'
                                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                            }`}
                            title="Disparar pulso de sinapse no cérebro 3D localizando o nó e silo correspondente"
                          >
                            <Zap className="w-3.5 h-3.5 fill-current" />
                            <span>
                              {isDisparada ? 'Impacto Sináptico Disparado!' : 'Ver Impacto no Cérebro 3D'}
                            </span>
                          </button>

                          {dec.targetNodeId && (
                            <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                              Nó 3D: <span className="text-cyan-400">{dec.targetNodeId}</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setDecisaoExpandidaId(isExpandida ? null : dec.id)}
                            className="text-slate-400 hover:text-cyan-300 text-xs flex items-center gap-1 underline transition-colors cursor-pointer"
                          >
                            {isExpandida ? 'Recolher Detalhes' : 'Ver Detalhes Completos'}
                          </button>
                          <button
                            onClick={() => cfoDecisionService.excluirDecisao(dec.id)}
                            className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Excluir esta deliberação do histórico"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Excluir</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ==================================================================== */}
        {/* FOOTER COM ATALHOS RÁPIDOS PARA AGENTES E MEMÓRIAS                   */}
        {/* ==================================================================== */}
        <div className="p-3 sm:p-4 border-t border-slate-800/80 bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Auditoria CFO: Rastreabilidade ativa de 10 anos da holding</span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenAgentRegistry && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAgentRegistry();
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <Bot className="w-3.5 h-3.5 text-emerald-400" />
                <span>Abrir Ficheiro de Agentes</span>
              </button>
            )}

            {onOpenMemories && (
              <button
                onClick={() => {
                  onClose();
                  onOpenMemories();
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <Brain className="w-3.5 h-3.5 text-cyan-400" />
                <span>Ver Memórias no Cérebro</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
