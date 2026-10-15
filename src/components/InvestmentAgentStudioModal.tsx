import React, { useState } from 'react';
import {
  Code,
  Play,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  Database,
  Cpu,
  Layers,
  FileText,
  RotateCcw,
  Check,
  Save,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  Coins,
  Landmark,
  Globe,
  Wheat,
  BarChart3,
  DollarSign,
  Activity,
} from 'lucide-react';
import {
  MarketData10YearsService,
  AtivoMercadoFinanceiro,
  ClasseAtivoFinanceiro,
  UNIVERSO_MERCADO_FINANCEIRO,
} from '../services/marketData10Years';
import { AgentRegistryService, AgentDefinition } from '../services/agentRegistry';
import { MicroDatastoresService } from '../services/microDatastores';
import { SynapseMemory } from '../types/neural';

interface InvestmentAgentStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAgentSaved?: (agent: AgentDefinition) => void;
  onTriggerSynapse?: (label: string) => void;
  onAddMemory?: (mem: Omit<SynapseMemory, 'id' | 'coords' | 'firing' | 'connectionsCount'>) => void;
}

// ============================================================================
// Templates Decenais de 10 Anos para o Agente de Investimento
// ============================================================================

const TEMPLATE_BAZIN_DECENAL = `// PIPELINE DO AGENTE DE INVESTIMENTO: DÉCIO BAZIN DECENAL (10 ANOS)
// Holding Investimentos Dullius · Margem de Segurança & Solvência

export async function executarAgenteInvestimento(ativo, llm, memoria) {
  const { ticker, cotacaoAtual, historico10Anos, solvencia, resumoDecenal } = ativo;

  // 1. ANÁLISE QUANTITATIVA DOS DADOS DE MERCADO (10 ANOS)
  const somaProventos = historico10Anos.reduce((acc, a) => acc + (a.rendimentoOuProvento || 0), 0);
  const proventoMedio10a = somaProventos / historico10Anos.length;

  // Preço-Teto Bazin (Rendimento mínimo de 6% a.a. nos 10 anos)
  const precoTetoBazin = proventoMedio10a / 0.06;
  const margemSegurancaPct = ((precoTetoBazin - cotacaoAtual) / cotacaoAtual) * 100;

  // Auditoria de Solvência: Dívida Líquida / EBITDA máximo tolerado de 3.5x
  const dlEbitda = solvencia?.dlEbitdaAtual ?? 0;
  const solvenciaAprovada = dlEbitda <= 3.5;

  // Retorno médio anual dos 10 anos
  const retornoMedioAnual = historico10Anos.reduce((acc, a) => acc + a.rentabilidadeAnualPct, 0) / historico10Anos.length;

  // 2. ENCAMINHAMENTO DO DOSSIÊ ESTRUTURADO PARA A LLM
  const dossie = {
    ticker,
    classe: ativo.classe,
    cotacaoAtual,
    precoTetoBazin10Anos: Number(precoTetoBazin.toFixed(2)),
    margemSegurancaPct: Number(margemSegurancaPct.toFixed(2)),
    dlEbitdaAtual: dlEbitda,
    solvenciaAprovada,
    proventoMedioDecenal: Number(proventoMedio10a.toFixed(2)),
    retornoMedioAnual10aPct: Number(retornoMedioAnual.toFixed(1)),
    teseDecenal: resumoDecenal?.teseAlocacao,
  };

  const parecerLLM = await llm.analisar(dossie);

  // 3. ARMAZENAMENTO NO ARQUIVO DE MEMÓRIA NEURAL (SILO PARTICIONADO)
  await memoria.armazenar({
    categoria: 'investimento',
    titulo: \`Auditoria Decenal: \${ticker} (\${parecerLLM.veredito})\`,
    conteudo: \`Cotação: \${ativo.moeda === 'USD' ? 'US$' : 'R$'} \${cotacaoAtual.toFixed(2)} | Teto Bazin 10a: R$ \${precoTetoBazin.toFixed(2)} (Margem: \${margemSegurancaPct.toFixed(1)}%). Veredito LLM: \${parecerLLM.veredito}. Parecer: \${parecerLLM.diagnostico}\`,
  });

  return {
    operacional: true,
    ticker,
    precoTetoBazin: Number(precoTetoBazin.toFixed(2)),
    margemSegurancaPct: Number(margemSegurancaPct.toFixed(2)),
    solvenciaAprovada,
    parecerLLM,
  };
}`;

const TEMPLATE_MULTI_ATIVOS = `// PIPELINE DO AGENTE DE INVESTIMENTO: BLINDAGEM MULTI-ATIVOS (10 ANOS)
// Holding Investimentos Dullius · Ações, Fundos, Cripto, Tesouro, Estrangeiros & Commodities

export async function executarAgenteInvestimento(ativo, llm, memoria) {
  const { ticker, classe, cotacaoAtual, moeda, historico10Anos, indicadoresChave, resumoDecenal } = ativo;

  // 1. ANÁLISE UNIVERSAL DO CICLO DECENAL (10 ANOS)
  const volatilidadeDecenal = resumoDecenal?.volatilidadeDecenalPct || 10.0;
  const rendimentoDecenal = resumoDecenal?.rendimentoMedio10aPct || 0;
  const anosPositivos = historico10Anos.filter(a => a.rentabilidadeAnualPct > 0).length;
  const consistenciaDecenalPct = (anosPositivos / historico10Anos.length) * 100;

  // Avaliação de risco e preservação de poder de compra
  const filtroQualidade = consistenciaDecenalPct >= 60; // No mínimo 6 de 10 anos positivos

  // 2. ENCAMINHAMENTO PARA A LLM
  const dossie = {
    ticker,
    classe,
    moeda,
    cotacaoAtual,
    rendimentoMedioDecenalPct: rendimentoDecenal,
    volatilidadeDecenalPct: volatilidadeDecenal,
    consistenciaDecenalPct,
    filtroQualidade,
    indicadorPrincipal: indicadoresChave?.indicador1?.valor,
    diretrizDullius: resumoDecenal?.diretrizDullius,
  };

  const parecerLLM = await llm.analisar(dossie);

  // 3. GRAVAÇÃO NO ARQUIVO DE MEMÓRIA NEURAL
  await memoria.armazenar({
    categoria: 'investimento',
    titulo: \`Blindagem Decenal Multi-Ativo: \${ticker} [\${classe.toUpperCase()}]\`,
    conteudo: \`Ativo \${ticker} (\${moeda}): Cotação \${cotacaoAtual} | Rendimento 10a: \${rendimentoDecenal}% a.a. Consistência: \${consistenciaDecenalPct}% dos anos positivos. Veredito LLM: \${parecerLLM.veredito}. Parecer: \${parecerLLM.parecerAlocacao}\`,
  });

  return {
    operacional: true,
    ticker,
    classe,
    filtroQualidade,
    parecerLLM,
  };
}`;

const TEMPLATE_GRAHAM_DECENAL = `// PIPELINE DO AGENTE DE INVESTIMENTO: BENJAMIN GRAHAM + ROIC (10 ANOS)
// Investimentos Dullius · Margem de Segurança Intrínseca

export async function executarAgenteInvestimento(ativo, llm, memoria) {
  const { ticker, cotacaoAtual, historico10Anos, solvencia } = ativo;

  // 1. ANÁLISE DOS 10 ANOS: MÉTRICAS HISTÓRICAS E RENDIMENTO
  const somaRetornos = historico10Anos.reduce((acc, a) => acc + a.rentabilidadeAnualPct, 0);
  const retornoMedio10a = somaRetornos / historico10Anos.length;

  const somaProventos = historico10Anos.reduce((acc, a) => acc + (a.rendimentoOuProvento || 0), 0);
  const proventoMedio10a = somaProventos / historico10Anos.length;
  const tetoBazin = proventoMedio10a > 0 ? proventoMedio10a / 0.06 : cotacaoAtual * 1.1;
  const margemBazinPct = ((tetoBazin - cotacaoAtual) / cotacaoAtual) * 100;

  const dlEbitda = solvencia?.dlEbitdaAtual ?? 0;
  const solvenciaAprovada = dlEbitda <= 3.5;

  // 2. ENCAMINHAMENTO PARA A LLM
  const dossie = {
    ticker,
    cotacaoAtual,
    precoTetoBazin: Number(tetoBazin.toFixed(2)),
    margemBazinPct: Number(margemBazinPct.toFixed(1)),
    retornoMedio10a: Number(retornoMedio10a.toFixed(1)),
    dlEbitda,
    solvenciaAprovada,
  };

  const parecerLLM = await llm.analisar(dossie);

  // 3. GRAVAÇÃO NO ARQUIVO DE MEMÓRIA NEURAL
  await memoria.armazenar({
    categoria: 'investimento',
    titulo: \`Filtro Graham 10 Anos: \${ticker}\`,
    conteudo: \`Retorno Médio Decenal: \${retornoMedio10a.toFixed(1)}% a.a. Teto: R$ \${tetoBazin.toFixed(2)}. Parecer LLM: \${parecerLLM.veredito} - \${parecerLLM.diagnostico}\`,
  });

  return {
    operacional: true,
    ticker,
    tetoBazin,
    parecerLLM,
  };
}`;

const TEMPLATE_FCO_SOLVENCIA = `// PIPELINE DO AGENTE DE INVESTIMENTO: AUDITORIA CRÍTICA DE SOLVÊNCIA E FLUXO (10 ANOS)
// Investimentos Dullius · Linha de Defesa Anti-Quebra da Holding

export async function executarAgenteInvestimento(ativo, llm, memoria) {
  const { ticker, cotacaoAtual, historico10Anos, solvencia } = ativo;

  // 1. ANÁLISE DE SOLVÊNCIA E CONTINUIDADE OPERACIONAL NOS 10 ANOS
  const dlEbitda = solvencia?.dlEbitdaAtual ?? 0;
  const alertaAlavancagem = dlEbitda > 3.5;

  // Avaliação de volatilidade decenal
  const retornosNegativos = historico10Anos.filter(a => a.rentabilidadeAnualPct < -15).length;
  const estresseDetectado = retornosNegativos >= 2 || alertaAlavancagem;

  // 2. ENCAMINHAMENTO DO DOSSIÊ PARA A LLM
  const dossie = {
    ticker,
    cotacaoAtual,
    anosAnalisados: 10,
    dlEbitdaAtual: dlEbitda,
    alertaAlavancagem,
    anosComEstresseSevero: retornosNegativos,
    gatilhoQuarentena: estresseDetectado,
  };

  const parecerLLM = await llm.analisar(dossie);

  // 3. ARMAZENAMENTO NO ARQUIVO DE MEMÓRIA NEURAL
  await memoria.armazenar({
    categoria: 'investimento',
    titulo: \`Auditoria Solvência & Estresse 10a: \${ticker}\`,
    conteudo: \`Estresse Estrutural: \${estresseDetectado ? 'ALERTA DETECTADO' : 'NORMAL'}. DL/EBITDA: \${dlEbitda}x. Veredito: \${parecerLLM.veredito}. Parecer: \${parecerLLM.diagnostico}\`,
  });

  return {
    operacional: true,
    ticker,
    estresseDetectado,
    parecerLLM,
  };
}`;

interface OperabilityReport {
  status: 'OPERACIONAL' | 'NAO_OPERACIONAL';
  executionTimeMs: number;
  mensagem: string;
  detalhesErro?: string;
  indicadoresCalculados?: Record<string, any>;
  vereditoLLM?: {
    veredito: string;
    diagnostico: string;
    parecerAlocacao: string;
  };
  memoriaGravada?: {
    titulo: string;
    conteudo: string;
  };
  llmPowered?: boolean;
}

export const InvestmentAgentStudioModal: React.FC<InvestmentAgentStudioModalProps> = ({
  isOpen,
  onClose,
  onAgentSaved,
  onTriggerSynapse,
  onAddMemory,
}) => {
  const marketService = MarketData10YearsService.getInstance();
  const agentService = AgentRegistryService.getInstance();
  const microService = MicroDatastoresService.getInstance();

  const [selectedClasse, setSelectedClasse] = useState<ClasseAtivoFinanceiro | 'todos'>('todos');
  const [selectedTicker, setSelectedTicker] = useState<string>('TAEE11');
  const [codigoFonte, setCodigoFonte] = useState<string>(TEMPLATE_BAZIN_DECENAL);
  const [nomeAgente, setNomeAgente] = useState<string>('Auditor Quant Decenal · Holding Dullius');
  const [validating, setValidating] = useState<boolean>(false);
  const [report, setReport] = useState<OperabilityReport | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'dados_10_anos'>('editor');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const todosAtivos = marketService.listarPorClasse(selectedClasse);
  const ativoAtual: AtivoMercadoFinanceiro =
    marketService.obterAtivo(selectedTicker) || UNIVERSO_MERCADO_FINANCEIRO.TAEE11;

  // =========================================================================
  // MOTOR DE VALIDAÇÃO DE OPERACIONALIDADE DO CÓDIGO
  // =========================================================================
  const handleValidarOperacionalidade = async () => {
    setValidating(true);
    setReport(null);
    setSaveSuccess(false);

    if (onTriggerSynapse) {
      onTriggerSynapse(`Compilando Código do Agente (${ativoAtual.ticker})`);
    }

    const t0 = performance.now();

    try {
      // 1. Validação Sintática Preliminar no Cliente
      if (!codigoFonte.includes('executarAgenteInvestimento')) {
        throw new Error(
          'A função principal exportada "executarAgenteInvestimento(ativo, llm, memoria)" não foi encontrada no código.'
        );
      }
      if (!codigoFonte.includes('llm.analisar') && !codigoFonte.includes('llm.')) {
        throw new Error('O código não implementa a etapa obrigatória de encaminhamento dos dados para a LLM.');
      }
      if (!codigoFonte.includes('memoria.armazenar') && !codigoFonte.includes('memoria.')) {
        throw new Error(
          'O código não implementa a etapa obrigatória de gravação no arquivo de memória neural (Synapse).'
        );
      }

      // 2. Chamada ao Endpoint do Backend para Validação com IA Real (Gemini 3.8 Flash)
      const resVal = await fetch('/api/agent/validate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoFonte,
          ticker: ativoAtual.ticker,
          ativoData: ativoAtual,
          horizonteAnos: 10,
        }),
      });

      if (!resVal.ok) {
        const errJson = await resVal.json().catch(() => ({}));
        throw new Error(errJson.detalhesErro || errJson.mensagem || 'Falha ao processar código no compilador.');
      }

      const valData: OperabilityReport = await resVal.json();

      const t1 = performance.now();
      valData.executionTimeMs = Math.round(t1 - t0);

      // Se for operacional e houver gravação de memória, registrar no cérebro
      if (valData.status === 'OPERACIONAL' && valData.memoriaGravada && onAddMemory) {
        const veredito = valData.vereditoLLM?.veredito || 'ESTAVEL';
        onAddMemory({
          title: valData.memoriaGravada.titulo,
          content: valData.memoriaGravada.conteudo,
          category: 'investimento',
          user: 'Agente Investimento 10a',
          timestamp: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
          importance: 'alta',
          color:
            veredito === 'COMPRAR'
              ? 0x10b981
              : veredito === 'QUARENTENA'
              ? 0xef4444
              : 0x06b6d4,
          sentiment:
            veredito === 'COMPRAR'
              ? 'oportunidade_lucro'
              : veredito === 'QUARENTENA'
              ? 'urgente_alerta'
              : 'analitico_racional',
        });
      }

      if (onTriggerSynapse) {
        onTriggerSynapse(
          `Código ${valData.status === 'OPERACIONAL' ? 'OPERACIONAL' : 'NÃO OPERACIONAL'}: ${ativoAtual.ticker}`
        );
      }

      setReport(valData);
    } catch (err: any) {
      const t1 = performance.now();
      setReport({
        status: 'NAO_OPERACIONAL',
        executionTimeMs: Math.round(t1 - t0),
        mensagem: 'Falha na Validação: O código NÃO É OPERACIONAL.',
        detalhesErro: err.message || 'Erro desconhecido durante análise semântica do código.',
      });
      if (onTriggerSynapse) {
        onTriggerSynapse(`Erro de Validação: Código Não Operacional`);
      }
    } finally {
      setValidating(false);
    }
  };

  const handleSalvarEAtivarAgente = () => {
    const agentId = `agente-investimento-${ativoAtual.ticker.toLowerCase()}`;
    const novoAgente: AgentDefinition = {
      id: agentId,
      name: nomeAgente.trim() || `Auditor 10 Anos · ${ativoAtual.ticker}`,
      role: `Auditor Decenal de Mercado (${ativoAtual.ticker})`,
      targetDatabase: ativoAtual.ticker,
      logic: codigoFonte,
      llmProvider: 'global',
      model: 'gemini-3.8-flash',
      status: 'ativo',
      lastAuditVerdict: (report?.vereditoLLM?.veredito as any) || 'COMPRAR',
      lastAuditDetails: report?.vereditoLLM?.diagnostico || 'Código validado e operacional no histórico de 10 anos.',
      lastAuditDate: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
      triggers: ['Variação Anormal de Mercado', 'Risco de Solvência', 'Oportunidade Decenal'],
      isAutonomous: true,
      createdAt: new Date().toLocaleDateString('pt-BR'),
      author: 'Matheus Dullius',
    };

    agentService.registerAgent(novoAgente);
    microService.autoAlimentarOuCriar(
      ativoAtual.ticker,
      ativoAtual.classe === 'cripto' ? 'cripto' : 'ativo_b3'
    );

    if (onAgentSaved) {
      onAgentSaved(novoAgente);
    }
    if (onTriggerSynapse) {
      onTriggerSynapse(`Agente de Investimento Ativado: ${novoAgente.name}`);
    }

    setSaveSuccess(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  // Helper para renderizar métricas seguras do ativo atual
  const resumo = ativoAtual.resumoDecenal;
  const isUSD = ativoAtual.moeda === 'USD';
  const prefixoMoeda = isUSD ? 'US$' : 'R$';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-6xl h-[94vh] bg-slate-950 border border-red-500/50 rounded-3xl p-4 sm:p-6 shadow-[0_0_80px_rgba(239,68,68,0.3)] flex flex-col relative overflow-hidden text-slate-100">
        {/* Cabeçalho do Estúdio */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 via-rose-500 to-amber-500 p-0.5 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.4)] shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-red-400">
                <Code className="w-5 h-5 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold font-mono tracking-wide text-slate-100">
                  Estúdio do Agente de IA de Investimento
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-950/80 border border-red-500/40 text-red-400 font-bold uppercase">
                  Horizonte 10 Anos
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-bold uppercase">
                  Todos os Ativos
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Programe em código a análise dos dados do mercado financeiro decenal, encaminhamento para a LLM e gravação na memória neural.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 border border-slate-800 transition-colors"
              title="Fechar Estúdio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Filtro de Classes de Ativos */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 text-xs font-mono scrollbar-thin">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-red-400" />
            Classes:
          </span>

          {[
            { id: 'todos', label: 'Todos os Ativos', icon: Globe },
            { id: 'acoes', label: 'Ações (B3 & Globais)', icon: TrendingUp },
            { id: 'fundos', label: 'Fundos (FIIs & ETFs)', icon: BarChart3 },
            { id: 'cripto', label: 'Criptoativos', icon: Coins },
            { id: 'tesouro', label: 'Títulos Públicos / Tesouro', icon: Landmark },
            { id: 'estrangeiros', label: 'Títulos Estrangeiros (USD)', icon: DollarSign },
            { id: 'commodities', label: 'Commodities (Ouro, Agro, Petróleo)', icon: Wheat },
          ].map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedClasse === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedClasse(cat.id as any);
                  const firstOfClass = marketService.listarPorClasse(cat.id as any)[0];
                  if (firstOfClass) {
                    setSelectedTicker(firstOfClass.ticker);
                  }
                }}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all shrink-0 border ${
                  isSelected
                    ? 'bg-red-600 text-white border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Barra de Seleção de Ativo e Indicadores Rápidos */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/70 border border-slate-800 mb-3 text-xs font-mono">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400">Ativo / 10 Anos:</span>
            <select
              value={selectedTicker}
              onChange={(e) => setSelectedTicker(e.target.value)}
              className="bg-slate-950 border border-red-500/40 text-slate-100 font-bold rounded-xl px-3 py-1.5 focus:outline-none focus:border-red-400 text-xs"
            >
              {todosAtivos.map((a) => (
                <option key={a.ticker} value={a.ticker}>
                  {a.ticker} — {a.nome} [{a.classe.toUpperCase()}]
                </option>
              ))}
            </select>

            <span className="text-slate-600 hidden sm:inline">|</span>

            {/* Métricas Chave do Ativo Selecionado */}
            <div className="flex items-center gap-2 text-[11px] text-slate-300 flex-wrap">
              <span>
                Cotação:{' '}
                <strong className="text-white">
                  {prefixoMoeda} {ativoAtual.cotacaoAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </strong>
              </span>

              {resumo?.tetoBazin10a !== undefined && (
                <>
                  <span>·</span>
                  <span>
                    Teto Bazin 10a:{' '}
                    <strong className="text-emerald-400">R$ {resumo.tetoBazin10a.toFixed(2)}</strong>
                  </span>
                </>
              )}

              {resumo?.margemSeguranca10aPct !== undefined && (
                <>
                  <span>·</span>
                  <span>
                    Margem:{' '}
                    <strong
                      className={
                        resumo.margemSeguranca10aPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }
                    >
                      {resumo.margemSeguranca10aPct > 0 ? '+' : ''}
                      {resumo.margemSeguranca10aPct.toFixed(1)}%
                    </strong>
                  </span>
                </>
              )}

              {ativoAtual.indicadoresChave?.indicador1 && (
                <>
                  <span>·</span>
                  <span className="text-cyan-300 font-bold">
                    {ativoAtual.indicadoresChave.indicador1.label}: {ativoAtual.indicadoresChave.indicador1.valor}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Abas Editor vs Tabela 10 Anos */}
          <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1.5 rounded-xl transition-all text-xs font-mono ${
                activeTab === 'editor'
                  ? 'bg-red-600 text-white font-bold shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Editor de Código
            </button>
            <button
              onClick={() => setActiveTab('dados_10_anos')}
              className={`px-3 py-1.5 rounded-xl transition-all text-xs font-mono ${
                activeTab === 'dados_10_anos'
                  ? 'bg-red-600 text-white font-bold shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Ver Tabela 10 Anos
            </button>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {activeTab === 'editor' ? (
            <div className="flex-1 flex flex-col min-h-0 space-y-3">
              {/* Barra de Ferramentas com Templates Rápidos */}
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 font-mono">Modelos Decenais:</span>
                  <button
                    onClick={() => setCodigoFonte(TEMPLATE_BAZIN_DECENAL)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-red-500/30 text-slate-300 font-mono text-[11px] transition-colors"
                  >
                    Bazin Proventos 10a
                  </button>
                  <button
                    onClick={() => setCodigoFonte(TEMPLATE_MULTI_ATIVOS)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/30 text-cyan-300 font-mono text-[11px] transition-colors"
                  >
                    Multi-Ativos & Blindagem
                  </button>
                  <button
                    onClick={() => setCodigoFonte(TEMPLATE_GRAHAM_DECENAL)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/30 text-amber-300 font-mono text-[11px] transition-colors"
                  >
                    Graham + Retorno 10a
                  </button>
                  <button
                    onClick={() => setCodigoFonte(TEMPLATE_FCO_SOLVENCIA)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-rose-500/30 text-rose-300 font-mono text-[11px] transition-colors"
                  >
                    Solvência & Risco 10a
                  </button>
                </div>

                <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Pipeline: Dados 10a ➔ LLM Gemini ➔ Memória Neural</span>
                </div>
              </div>

              {/* Área do Editor de Código */}
              <div className="flex-1 relative rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden flex flex-col font-mono text-xs shadow-inner min-h-[180px]">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-slate-800 text-[11px] text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-slate-300 ml-2 font-bold">pipeline_investimento_10_anos.ts</span>
                  </div>
                  <span className="text-[10px] text-slate-500">TypeScript / ESNext</span>
                </div>

                <textarea
                  value={codigoFonte}
                  onChange={(e) => setCodigoFonte(e.target.value)}
                  className="flex-1 w-full p-4 bg-transparent text-slate-200 font-mono text-xs leading-relaxed focus:outline-none resize-none overflow-y-auto selection:bg-red-500/30"
                  spellCheck={false}
                  placeholder="// Escreva aqui o código que o agente de IA executará..."
                />
              </div>

              {/* Botão de Validação e Confirmação de Operacionalidade */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <input
                  type="text"
                  value={nomeAgente}
                  onChange={(e) => setNomeAgente(e.target.value)}
                  placeholder="Nome do Agente (ex: Auditor Quant Decenal)"
                  className="w-full sm:w-80 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-red-500/50"
                />

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleValidarOperacionalidade}
                    disabled={validating}
                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-all disabled:opacity-50"
                  >
                    {validating ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    <span>
                      {validating
                        ? 'Compilando & Consultando LLM...'
                        : 'Confirmar Código & Validar Operacionalidade'}
                    </span>
                  </button>

                  {report?.status === 'OPERACIONAL' && (
                    <button
                      onClick={handleSalvarEAtivarAgente}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-mono font-bold text-xs flex items-center gap-1.5 shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all shrink-0"
                    >
                      {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                      <span>{saveSuccess ? 'Ativado!' : 'Ativar Agente'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Relatório de Operacionalidade do Código */}
              {report && (
                <div
                  className={`p-4 rounded-2xl border animate-in slide-in-from-bottom-2 text-xs font-mono transition-all ${
                    report.status === 'OPERACIONAL'
                      ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-100 shadow-[0_0_30px_rgba(16,185,129,0.15)]'
                      : 'bg-rose-950/30 border-rose-500/50 text-rose-100 shadow-[0_0_30px_rgba(239,68,68,0.15)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-3 h-3 rounded-full ${
                          report.status === 'OPERACIONAL'
                            ? 'bg-emerald-400 animate-pulse'
                            : 'bg-rose-500 animate-ping'
                        }`}
                      />
                      <span className="font-bold text-sm tracking-wider uppercase">
                        STATUS:{' '}
                        {report.status === 'OPERACIONAL'
                          ? '● CÓDIGO OPERACIONAL'
                          : '● CÓDIGO NÃO OPERACIONAL'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        (Tempo de execução: {report.executionTimeMs}ms)
                      </span>
                    </div>

                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase border ${
                        report.status === 'OPERACIONAL'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                          : 'bg-rose-950 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {report.status === 'OPERACIONAL' ? '100% Validado' : 'Falha de Operabilidade'}
                    </span>
                  </div>

                  <p className="text-slate-300 mb-3 leading-relaxed">{report.mensagem}</p>

                  {report.detalhesErro && (
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-rose-500/30 text-rose-300 mb-2">
                      <strong>Causa Raiz Identificada:</strong> {report.detalhesErro}
                    </div>
                  )}

                  {report.status === 'OPERACIONAL' && report.indicadoresCalculados && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[10px] text-slate-400">Cotação / Preço</span>
                        <div className="font-bold text-white text-xs">
                          {report.indicadoresCalculados.cotacaoOuPreco ||
                            report.indicadoresCalculados.cotacaoAtual ||
                            `${prefixoMoeda} ${ativoAtual.cotacaoAtual}`}
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[10px] text-slate-400">Teto / Referência</span>
                        <div className="font-bold text-emerald-400 text-xs">
                          {report.indicadoresCalculados.tetoBazinOuReferencia ||
                            report.indicadoresCalculados.precoTetoBazin10a ||
                            'N/A'}
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[10px] text-slate-400">Margem / Yield</span>
                        <div className="font-bold text-cyan-300 text-xs">
                          {report.indicadoresCalculados.margemSegurancaOuYield ||
                            report.indicadoresCalculados.margemSeguranca10a ||
                            'N/A'}
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[10px] text-slate-400">Veredito da LLM</span>
                        <div className="font-bold text-amber-400 text-xs">
                          {report.vereditoLLM?.veredito || 'ESTAVEL'}
                        </div>
                      </div>
                    </div>
                  )}

                  {report.memoriaGravada && (
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-cyan-500/30 text-[11px] text-slate-300">
                      <span className="font-bold text-cyan-400 flex items-center gap-1 mb-1">
                        <Database className="w-3.5 h-3.5" />
                        Registro Gravado no Arquivo de Memória Neural:
                      </span>
                      <p className="text-slate-200">{report.memoriaGravada.conteudo}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Visualização da Tabela de Dados Decenais (10 Anos) Universal para Todos os Ativos */
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs font-mono">
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>{ativoAtual.nome}</span>
                      <span className="text-red-400 font-bold">({ativoAtual.ticker})</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {ativoAtual.classe.toUpperCase()}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">{ativoAtual.setor}</p>
                  </div>

                  <div className="text-left sm:text-right text-[11px]">
                    <span className="text-slate-400">Cotação Atual:</span>{' '}
                    <strong className="text-white text-sm">
                      {prefixoMoeda}{' '}
                      {ativoAtual.cotacaoAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>

                {/* Tabela dos 10 Anos */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Ano</th>
                        <th className="py-2.5 px-3">Cotação / Taxa Média</th>
                        <th className="py-2.5 px-3">Rendimento / Provento / Yield</th>
                        <th className="py-2.5 px-3">Métrica Principal do Ciclo</th>
                        <th className="py-2.5 px-3">Rentabilidade Anual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {ativoAtual.historico10Anos.map((ano) => (
                        <tr key={ano.ano} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-white">{ano.ano}</td>
                          <td className="py-2.5 px-3 text-slate-200">
                            {prefixoMoeda} {ano.cotacaoMedia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-emerald-400 font-bold">
                            {ano.rendimentoOuProvento > 0
                              ? `${prefixoMoeda} ${ano.rendimentoOuProvento.toFixed(2)}`
                              : 'Reinvestimento / Spot'}
                          </td>
                          <td className="py-2.5 px-3 text-cyan-300 font-mono">
                            {ano.metricaPrincipal || 'Conforme ciclo'}
                          </td>
                          <td
                            className={`py-2.5 px-3 font-bold ${
                              ano.rentabilidadeAnualPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {ano.rentabilidadeAnualPct > 0 ? '+' : ''}
                            {ano.rentabilidadeAnualPct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Resumo Decenal Adaptado */}
                <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400">Rendimento Médio Decenal:</span>
                    <div className="text-emerald-400 font-bold text-sm mt-0.5">
                      {resumo?.rendimentoMedio10aPct?.toFixed(1) || '0.0'}% a.a.
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400">Tese de Alocação Decenal:</span>
                    <div className="text-slate-200 text-[11px] mt-0.5 line-clamp-2">
                      {resumo?.teseAlocacao || 'Conforme política da holding'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400">Diretriz da Investimentos Dullius:</span>
                    <div className="text-cyan-300 font-bold text-[11px] mt-0.5 line-clamp-2">
                      {resumo?.diretrizDullius || 'Disciplina de longo prazo e conservação de capital'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
