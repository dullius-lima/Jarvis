import React, { useState } from 'react';
import { Ativo, AndarPredio, DossieConsolidado, VereditoCFO, ChatMessage } from '../types';
import { FinancialEngineClient } from '../services/financialEngine';
import {
  Crown,
  Calculator,
  ShieldAlert,
  Radio,
  Server,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';

interface FloorInspectionDrawerProps {
  andar: AndarPredio;
  ativos: Ativo[];
  ativoSelecionado: Ativo;
  onSelecionarAtivo: (ativo: Ativo) => void;
  onFechar?: () => void;
}

export const FloorInspectionDrawer: React.FC<FloorInspectionDrawerProps> = ({
  andar,
  ativos,
  ativoSelecionado,
  onSelecionarAtivo,
}) => {
  // Estado do Motor Financeiro para o ativo selecionado
  const [cotacaoSimulada, setCotacaoSimulada] = useState<number>(ativoSelecionado.cotacao_atual);
  const [dossie, setDossie] = useState<DossieConsolidado>(() =>
    FinancialEngineClient.processarDossie(ativoSelecionado)
  );

  // Estado do CFO (5º Andar)
  const [vereditoCFO, setVereditoCFO] = useState<VereditoCFO | null>(null);
  const [carregandoCFO, setCarregandoCFO] = useState<boolean>(false);
  const [erroCFO, setErroCFO] = useState<string | null>(null);

  // Chat com o CFO da Investimentos Dullius (Postura estritamente fria e analítica)
  const [mensagensChat, setMensagensChat] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      role: 'model',
      content: `Diretoria de Investimentos Dullius. Dossiê contábil decenal e matriz Bazin de ${ativoSelecionado.ticker} carregados. Apresente a consulta ou solicite a deliberação formal de alocação de capital.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputChat, setInputChat] = useState<string>('');
  const [enviandoChat, setEnviandoChat] = useState<boolean>(false);

  // Rastreamento de direção do elevador (subida ou descida)
  const prevAndarRef = React.useRef<number>(andar.numero);
  const [direcaoElevador, setDirecaoElevador] = useState<'up' | 'down'>('up');
  const [mensagemElevador, setMensagemElevador] = useState<string | null>(null);

  React.useEffect(() => {
    if (prevAndarRef.current !== andar.numero) {
      const subindo = andar.numero > prevAndarRef.current;
      setDirecaoElevador(subindo ? 'up' : 'down');
      setMensagemElevador(
        `Elevador em deslocamento: ${prevAndarRef.current}º Andar ${subindo ? '▲ Subindo' : '▼ Descendo'} para o ${andar.numero}º Andar (${andar.nome})`
      );
      prevAndarRef.current = andar.numero;

      const timer = setTimeout(() => {
        setMensagemElevador(null);
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [andar.numero, andar.nome]);

  // Equipe de funcionários reais designados para cada setor/andar
  const equipePorAndar: Record<number, {
    membros: {
      nome: string;
      cargo: string;
      atividade: string;
      corCabelo: string;
      corRoupa: string;
      corCalca: string;
      item: string;
    }[];
    setorDesc: string;
  }> = {
    5: {
      setorDesc: 'Gabinete Executivo & Mesa da Diretoria da Holding',
      membros: [
        {
          nome: 'Dr. Roberto Albuquerque',
          cargo: 'Chief Financial Officer (CFO)',
          atividade: 'Auditando matriz Bazin, alavancagem estrutural e emissão de ordens de custódia',
          corCabelo: '#475569',
          corRoupa: '#0f172a',
          corCalca: '#1e293b',
          item: 'Pasta Executiva de Couro',
        },
        {
          nome: 'Helena Vasconcelos',
          cargo: 'Assessora Sênior de Governança & R.I.',
          atividade: 'Conferindo alinhamento de Tag Along, Novo Mercado e deliberações de conselho',
          corCabelo: '#78350f',
          corRoupa: '#0369a1',
          corCalca: '#0f172a',
          item: 'Dossiê CVM',
        },
      ],
    },
    4: {
      setorDesc: 'Departamento Contábil, DFP Decenal e Valuation',
      membros: [
        {
          nome: 'Lucas Peixoto',
          cargo: 'Auditor Fundamentalista Décio Bazin',
          atividade: 'Expurgando proventos não-recorrentes e calculando Preço-Teto a 6% a.a.',
          corCabelo: '#1f2937',
          corRoupa: '#047857',
          corCalca: '#334155',
          item: 'Calculadora HP-12C',
        },
        {
          nome: 'Mariana Duarte',
          cargo: 'Analista de Graham & CAGR de Proventos',
          atividade: 'Calculando raiz de 22.5 x LPA x VPA e progressão histórica de 5 a 10 anos',
          corCabelo: '#b45309',
          corRoupa: '#7c3aed',
          corCalca: '#1e293b',
          item: 'Planilha de Demonstrações',
        },
      ],
    },
    3: {
      setorDesc: 'Comitê de Crédito, Solvência e Balanço Patrimonial',
      membros: [
        {
          nome: 'Carlos Eduardo "Cadu"',
          cargo: 'Especialista em Estrutura de Capital',
          atividade: 'Vigiando alavancagem de Dívida Líquida/EBITDA acima do teto de 3.5x',
          corCabelo: '#334155',
          corRoupa: '#2563eb',
          corCalca: '#0f172a',
          item: 'Relatório de Covenants',
        },
        {
          nome: 'Camila Siqueira',
          cargo: 'Auditora de Fluxo de Caixa Operacional',
          atividade: 'Testando divergências entre Lucro Líquido contábil e FCO gerado',
          corCabelo: '#581c87',
          corRoupa: '#d97706',
          corCalca: '#334155',
          item: 'Auditoria de Conciliação',
        },
      ],
    },
    2: {
      setorDesc: 'Central de Risco Exógeno & Radar de Fatos Relevantes CVM',
      membros: [
        {
          nome: 'Thiago Mendes',
          cargo: 'Sentinela de Fatos Relevantes CVM',
          atividade: 'Filtrando ruídos transitórios diários vs alterações na tese de investimento',
          corCabelo: '#18181b',
          corRoupa: '#e11d48',
          corCalca: '#1e293b',
          item: 'Feed RSS CVM',
        },
        {
          nome: 'Beatriz Lima',
          cargo: 'Analista de Ruptura Estrutural de Tese',
          atividade: 'Vigiando alterações de controle, processos judiciais e governança corporativa',
          corCabelo: '#451a03',
          corRoupa: '#db2777',
          corCalca: '#0f172a',
          item: 'Tablet de Alertas',
        },
      ],
    },
    1: {
      setorDesc: 'Centro de Operações de Rede, Ingestão e Cripto 24/7',
      membros: [
        {
          nome: 'Gabriel Rocha',
          cargo: 'Engenheiro de Dados & Ingestão Contínua',
          atividade: 'Sincronizando APIs do Bacen, curvas de DI, taxas Selic e cotações da B3',
          corCabelo: '#0f172a',
          corRoupa: '#0891b2',
          corCalca: '#1e293b',
          item: 'Console Linux de Ingestão',
        },
        {
          nome: 'Sofia Nakamura',
          cargo: 'Sentinela Algorítmica de Criptoativos 24/7',
          atividade: 'Operando em silêncio de rede; acionamento restrito a anomalias > 5% em 1h',
          corCabelo: '#312e81',
          corRoupa: '#f59e0b',
          corCalca: '#020617',
          item: 'Monitor de Nodos BTC',
        },
      ],
    },
  };

  const equipeAtual = equipePorAndar[andar.numero] || {
    setorDesc: 'Setor Corporativo',
    membros: [],
  };

  // Atualizar dossiê quando muda o ativo selecionado
  React.useEffect(() => {
    setCotacaoSimulada(ativoSelecionado.cotacao_atual);
    const novoDossie = FinancialEngineClient.processarDossie(ativoSelecionado);
    setDossie(novoDossie);
    setVereditoCFO(null);
    setErroCFO(null);
  }, [ativoSelecionado]);

  // Recalcular quando o usuário move a cotação simulada
  const handleCotacaoChange = (novaCotacao: number) => {
    setCotacaoSimulada(novaCotacao);
    const novoDossie = FinancialEngineClient.processarDossie(ativoSelecionado, novaCotacao);
    setDossie(novoDossie);
  };

  // Solicitar deliberação ao CFO
  const handleSolicitarDeliberacao = async () => {
    setCarregandoCFO(true);
    setErroCFO(null);
    try {
      const res = await fetch('/api/cfo/deliberar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossie }),
      });
      if (!res.ok) {
        throw new Error(`Falha na deliberação: ${res.statusText}`);
      }
      const data: VereditoCFO = await res.json();
      setVereditoCFO(data);
    } catch (err: any) {
      console.warn('Alerta na deliberação CFO (acionando contingência):', err);
      setErroCFO(err.message || 'Erro ao conectar com o CFO');
    } finally {
      setCarregandoCFO(false);
    }
  };

  // Enviar mensagem no chat com o CFO
  const handleEnviarMensagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputChat.trim() || enviandoChat) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputChat,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const novoHistorico = [...mensagensChat, userMsg];
    setMensagensChat(novoHistorico);
    setInputChat('');
    setEnviandoChat(true);

    try {
      const res = await fetch('/api/cfo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: novoHistorico.map((m) => ({ role: m.role, content: m.content })),
          dossie,
        }),
      });
      const data = await res.json();
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'model',
        content: data.resposta || 'Parecer arquivado pelo CFO.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMensagensChat([...novoHistorico, botMsg]);
    } catch (err) {
      console.warn('Alerta na comunicação de chat com CFO:', err);
      const erroMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        content: 'Linha com a Diretoria temporariamente indisponível. Reencaminhe a mensagem.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMensagensChat([...novoHistorico, erroMsg]);
    } finally {
      setEnviandoChat(false);
    }
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl mt-6 relative">
      {/* Banner de Trânsito do Elevador (quando há troca de andar) */}
      {mensagemElevador && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-6 py-2 flex items-center justify-between text-xs font-mono text-amber-300 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <span className="text-base">{direcaoElevador === 'up' ? '🛗 ▲' : '🛗 ▼'}</span>
            <span className="font-bold">{mensagemElevador}</span>
          </div>
          <span className="text-[11px] text-amber-400/80 bg-amber-500/20 px-2 py-0.5 rounded">
            Deslocamento Vertical Automático
          </span>
        </div>
      )}

      {/* Header do Andar Inspecionado com Indicador de Elevador */}
      <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-lg flex flex-col items-center justify-center text-white font-bold text-base shadow-inner border border-white/10"
            style={{ backgroundColor: andar.cor_tema }}
          >
            <span>{andar.numero}º</span>
            <span className="text-[9px] font-mono tracking-tighter uppercase opacity-80">ANDAR</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100">
                {andar.nome}
              </h2>
              <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                Setor {andar.numero}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span className="text-slate-300 font-medium">{andar.responsavel}</span>
              <span>·</span>
              <span className="text-amber-400 font-medium">{equipeAtual.setorDesc}</span>
            </div>
          </div>
        </div>

        {/* Seletor Rápido de Ativo para Análise */}
        <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-lg border border-slate-800">
          <span className="text-xs text-slate-400 pl-2">Ativo Auditado:</span>
          {ativos.map((at) => (
            <button
              key={at.ticker}
              onClick={() => onSelecionarAtivo(at)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                ativoSelecionado.ticker === at.ticker
                  ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {at.ticker}
            </button>
          ))}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* CORREDOR OPERACIONAL DO ANDAR: FUNCIONÁRIOS REAIS ANDANDO           */}
      {/* ==================================================================== */}
      <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800/80 relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Corredor Operacional do {andar.numero}º Andar · Equipe em Movimento</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            Elevador {direcaoElevador === 'up' ? '▲ Subindo' : '▼ Descendo'} · Posicionado no {andar.numero}º Andar
          </span>
        </div>

        {/* Pista do Corredor com Piso Corporativo e Funcionários Caminhando */}
        <div className="h-24 w-full bg-slate-950 rounded-lg border border-slate-800/80 relative overflow-hidden flex items-end px-4 pb-2 shadow-inner">
          {/* Luzes do teto e portas de salas */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500/20" />
          <div className="absolute top-2 left-10 w-16 h-1 bg-amber-200/40 rounded-full blur-[1px]" />
          <div className="absolute top-2 left-1/3 w-16 h-1 bg-amber-200/40 rounded-full blur-[1px]" />
          <div className="absolute top-2 left-2/3 w-16 h-1 bg-amber-200/40 rounded-full blur-[1px]" />

          {/* Portas dos Gabinetes */}
          <div className="absolute bottom-2 left-8 w-10 h-16 border-t-2 border-x-2 border-slate-800 bg-slate-900/60 rounded-t flex flex-col items-center justify-start pt-1">
            <span className="text-[8px] font-mono text-slate-500">SALA A</span>
          </div>
          <div className="absolute bottom-2 right-12 w-10 h-16 border-t-2 border-x-2 border-slate-800 bg-slate-900/60 rounded-t flex flex-col items-center justify-start pt-1">
            <span className="text-[8px] font-mono text-slate-500">SALA B</span>
          </div>

          {/* Linha de rodapé do corredor */}
          <div className="absolute bottom-2 left-0 right-0 h-0.5 bg-slate-800" />

          {/* Funcionário 1: Caminhando no Corredor */}
          {equipeAtual.membros[0] && (
            <div className="absolute bottom-2 left-16 animate-walk-patrol-a cursor-pointer group z-10">
              {/* Balão com nome e atividade em hover */}
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900 text-slate-100 text-[10px] font-mono px-2 py-1 rounded shadow-lg border border-amber-500/40 opacity-90 group-hover:opacity-100 transition-opacity">
                <span className="text-amber-400 font-bold">{equipeAtual.membros[0].nome}</span>
                <span className="text-slate-400 ml-1">({equipeAtual.membros[0].cargo})</span>
              </div>

              {/* Avatar Pixel/CSS da Pessoa com Animação de Passos */}
              <div className="relative animate-person-bob flex flex-col items-center">
                {/* Cabeça */}
                <div
                  className="w-3.5 h-3.5 rounded-t-sm relative"
                  style={{ backgroundColor: '#fed7aa' }}
                >
                  {/* Cabelo */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1 rounded-t-sm"
                    style={{ backgroundColor: equipeAtual.membros[0].corCabelo }}
                  />
                </div>
                {/* Tronco / Blazer */}
                <div
                  className="w-4 h-4 shadow-sm relative flex items-center justify-center"
                  style={{ backgroundColor: equipeAtual.membros[0].corRoupa }}
                >
                  {/* Gravata se for CFO */}
                  {andar.numero === 5 && (
                    <div className="w-1 h-2.5 bg-red-600 rounded-b-sm" />
                  )}
                </div>
                {/* Pernas com swing alternado */}
                <div className="flex gap-0.5">
                  <div
                    className="w-1.5 h-3.5 animate-leg-left rounded-b-sm"
                    style={{ backgroundColor: equipeAtual.membros[0].corCalca }}
                  />
                  <div
                    className="w-1.5 h-3.5 animate-leg-right rounded-b-sm"
                    style={{ backgroundColor: equipeAtual.membros[0].corCalca }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Funcionário 2: Caminhando no Corredor em direção oposta */}
          {equipeAtual.membros[1] && (
            <div className="absolute bottom-2 left-48 animate-walk-patrol-b cursor-pointer group z-10">
              {/* Balão com nome e atividade */}
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900 text-slate-100 text-[10px] font-mono px-2 py-1 rounded shadow-lg border border-cyan-500/40 opacity-90 group-hover:opacity-100 transition-opacity">
                <span className="text-cyan-400 font-bold">{equipeAtual.membros[1].nome}</span>
                <span className="text-slate-400 ml-1">({equipeAtual.membros[1].cargo})</span>
              </div>

              {/* Avatar Pixel/CSS da Pessoa 2 */}
              <div className="relative animate-person-bob flex flex-col items-center">
                {/* Cabeça */}
                <div
                  className="w-3.5 h-3.5 rounded-t-sm relative"
                  style={{ backgroundColor: '#fed7aa' }}
                >
                  {/* Cabelo */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1 rounded-t-sm"
                    style={{ backgroundColor: equipeAtual.membros[1].corCabelo }}
                  />
                </div>
                {/* Tronco */}
                <div
                  className="w-4 h-4 shadow-sm relative"
                  style={{ backgroundColor: equipeAtual.membros[1].corRoupa }}
                />
                {/* Pernas */}
                <div className="flex gap-0.5">
                  <div
                    className="w-1.5 h-3.5 animate-leg-left rounded-b-sm"
                    style={{ backgroundColor: equipeAtual.membros[1].corCalca }}
                  />
                  <div
                    className="w-1.5 h-3.5 animate-leg-right rounded-b-sm"
                    style={{ backgroundColor: equipeAtual.membros[1].corCalca }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Indicador do Eixo do Elevador na ponta direita do corredor */}
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-amber-500/30 text-[10px] font-mono text-amber-400">
            <span>🛗</span>
            <span>Eixo {andar.numero}º</span>
          </div>
        </div>

        {/* Chips com as tarefas ativas de cada pessoa */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {equipeAtual.membros.map((membro, idx) => (
            <div
              key={idx}
              className="p-2 rounded bg-slate-950/80 border border-slate-800/80 flex items-center gap-2.5 text-xs"
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: membro.corRoupa }}
              />
              <div className="truncate">
                <span className="font-bold text-slate-200">{membro.nome}: </span>
                <span className="text-slate-400 text-[11px]">{membro.atividade}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conteúdo Específico por Andar com Animação de Elevador (Slide + Fade-In) */}
      <div
        key={andar.numero}
        className={`p-6 ${direcaoElevador === 'up' ? 'elevator-slide-up' : 'elevator-slide-down'}`}
      >
        {/* ================================================================== */}
        {/* 5º ANDAR: MESA DA DIRETORIA & CFO                                  */}
        {/* ================================================================== */}
        {andar.numero === 5 && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950 p-4 rounded-lg border border-slate-800">
              <div>
                <span className="text-xs font-mono text-amber-400 uppercase tracking-wider">
                  Deliberação Executiva de Carteira
                </span>
                <h3 className="text-base font-semibold text-slate-100">
                  Parecer do CFO sobre {dossie.ticker} ({dossie.nome_empresa})
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Cotação Atual: <span className="font-mono text-slate-200 font-bold">R$ {dossie.cotacao_atual.toFixed(2)}</span> · Preço-Teto Bazin (3y): <span className="font-mono text-emerald-400 font-bold">R$ {dossie.bazin.teto_bazin_3_anos.toFixed(2)}</span>
                </p>
              </div>

              <button
                onClick={handleSolicitarDeliberacao}
                disabled={carregandoCFO}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {carregandoCFO ? 'CFO Deliberando...' : 'Emitir Parecer da Diretoria'}
              </button>
            </div>

            {erroCFO && (
              <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-lg text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{erroCFO}</span>
              </div>
            )}

            {/* Cartão de Veredito Oficial */}
            {vereditoCFO ? (
              <div
                className={`p-5 rounded-xl border ${
                  vereditoCFO.veredito === 'COMPRAR'
                    ? 'bg-emerald-950/20 border-emerald-500/40'
                    : vereditoCFO.veredito === 'AGUARDAR'
                    ? 'bg-amber-950/20 border-amber-500/40'
                    : 'bg-rose-950/20 border-rose-500/40'
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-3 mb-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 rounded text-xs font-black tracking-widest ${
                        vereditoCFO.veredito === 'COMPRAR'
                          ? 'bg-emerald-500 text-slate-950'
                          : vereditoCFO.veredito === 'AGUARDAR'
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      VEREDITO: {vereditoCFO.veredito}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Emitido em: {new Date(vereditoCFO.data_auditoria || Date.now()).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">Auditoria Decenal Validada</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-3">
                    <div>
                      <span className="text-slate-400 font-medium">Diagnóstico Executivo:</span>
                      <p className="text-slate-200 mt-1 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800/60">
                        {vereditoCFO.diagnostico_executivo}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Diretriz de Alocação de Capital:</span>
                      <p className="text-slate-200 mt-1 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800/60">
                        {vereditoCFO.parecer_alocacao}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <span className="text-slate-400 font-medium">Julgamento de Valuation (Bazin & Graham):</span>
                      <p className="text-slate-200 mt-1 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800/60">
                        {vereditoCFO.justificativa_bazin_graham}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Auditoria de Solvência & Risco Exógeno:</span>
                      <p className="text-slate-200 mt-1 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800/60">
                        {vereditoCFO.analise_solvencia_risco}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                <Crown className="w-8 h-8 text-amber-500/60 mx-auto mb-2" />
                <p className="text-xs text-slate-300 font-medium">
                  Nenhum parecer emitido ainda para {dossie.ticker} nesta sessão.
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Clique no botão acima para acionar a deliberação oficial do CFO.
                </p>
              </div>
            )}

            {/* Canal de Diálogo Executivo com o CFO */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
              <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-2">
                  <Crown className="w-3.5 h-3.5 text-amber-400" /> Canal Direto com o CFO (5º Andar)
                </span>
                <span className="text-slate-500 font-mono">Modo: Buy & Hold Rigoroso</span>
              </div>

              <div className="p-4 h-64 overflow-y-auto space-y-3 text-xs">
                {mensagensChat.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-lg leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-amber-500 text-slate-950 font-medium'
                          : 'bg-slate-900 text-slate-200 border border-slate-800'
                      }`}
                    >
                      {m.content}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 px-1 font-mono">{m.timestamp}</span>
                  </div>
                ))}
              </div>

              <form onSubmit={handleEnviarMensagem} className="p-2 border-t border-slate-800 flex gap-2 bg-slate-900/60">
                <input
                  type="text"
                  value={inputChat}
                  onChange={(e) => setInputChat(e.target.value)}
                  placeholder={`Pergunte ao CFO sobre alocação, teto Bazin ou riscos de ${dossie.ticker}...`}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={enviandoChat || !inputChat.trim()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  Enviar
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* 4º ANDAR: AUDITORIA FUNDAMENTALISTA & PROVENTOS                    */}
        {/* ================================================================== */}
        {andar.numero === 4 && (
          <div className="space-y-6">
            {/* Simulador Interativo de Cotação */}
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs text-emerald-400 font-mono">SIMULADOR DETERMINÍSTICO</span>
                <h3 className="text-sm font-bold text-slate-100">Teste de Sensibilidade de Preço-Teto</h3>
                <p className="text-xs text-slate-400">
                  Ajuste a cotação simulada para observar o recálculo em tempo real da Margem de Segurança.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-mono">Cotação: R$</span>
                <input
                  type="number"
                  step="0.10"
                  value={cotacaoSimulada}
                  onChange={(e) => handleCotacaoChange(parseFloat(e.target.value) || 0)}
                  className="w-28 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={() => handleCotacaoChange(ativoSelecionado.cotacao_atual)}
                  className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded border border-slate-700"
                >
                  Restaurar Cotação Real
                </button>
              </div>
            </div>

            {/* Indicadores Principais de Bazin e Graham */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400">Preço-Teto Bazin (3 Anos)</span>
                <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                  R$ {dossie.bazin.teto_bazin_3_anos.toFixed(2)}
                </div>
                <div className="text-xs font-mono mt-1 text-slate-400">
                  DPA Médio: R$ {dossie.bazin.dpa_medio_3_anos.toFixed(4)}
                </div>
                <div className={`text-xs font-mono font-bold mt-2 ${dossie.bazin.margem_seguranca_3_anos_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  Margem: {dossie.bazin.margem_seguranca_3_anos_pct > 0 ? '+' : ''}{dossie.bazin.margem_seguranca_3_anos_pct}%
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400">Preço-Teto Bazin (5 Anos)</span>
                <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                  R$ {dossie.bazin.teto_bazin_5_anos.toFixed(2)}
                </div>
                <div className="text-xs font-mono mt-1 text-slate-400">
                  DPA Médio: R$ {dossie.bazin.dpa_medio_5_anos.toFixed(4)}
                </div>
                <div className={`text-xs font-mono font-bold mt-2 ${dossie.bazin.margem_seguranca_5_anos_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  Margem: {dossie.bazin.margem_seguranca_5_anos_pct > 0 ? '+' : ''}{dossie.bazin.margem_seguranca_5_anos_pct}%
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400">Preço Justo Graham</span>
                <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                  {dossie.graham.preco_justo_graham ? `R$ ${dossie.graham.preco_justo_graham.toFixed(2)}` : 'Inaplicável'}
                </div>
                <div className="text-xs font-mono mt-1 text-slate-400">
                  LPA: {dossie.graham.lpa_recente} · VPA: {dossie.graham.vpa_recente}
                </div>
                <div className="text-xs font-mono text-slate-400 mt-2">
                  Status: {dossie.graham.status_graham}
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400">Crescimento de Dividendos (CAGR)</span>
                <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                  {dossie.bazin.cagr_dividendos_5_anos_pct !== null ? `${dossie.bazin.cagr_dividendos_5_anos_pct}% a.a.` : 'N/D'}
                </div>
                <div className="text-xs font-mono mt-1 text-slate-400">
                  Período: 5 anos históricos
                </div>
                <div className="text-xs font-mono text-slate-400 mt-2">
                  Yield Projetado: {dossie.bazin.dividend_yield_projetado_pct}%
                </div>
              </div>
            </div>

            {/* Tabela de Demonstrativos Decenais (10 Anos Auditados) */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
              <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-200">
                  Série Histórica Decenal de Demonstrativos (DFP/ITR CVM)
                </h4>
                <span className="text-[11px] text-slate-400 font-mono">
                  {dossie.serie_historica.length} anos computados
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 font-mono border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Ano</th>
                      <th className="py-2.5 px-3">DPA Bruto</th>
                      <th className="py-2.5 px-3">DPA Ajustado</th>
                      <th className="py-2.5 px-3">LPA</th>
                      <th className="py-2.5 px-3">VPA</th>
                      <th className="py-2.5 px-3">Lucro Líq. (M)</th>
                      <th className="py-2.5 px-3">FCO (M)</th>
                      <th className="py-2.5 px-3">Dívida Líq. (M)</th>
                      <th className="py-2.5 px-3">Observações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono-numbers">
                    {dossie.serie_historica.map((item) => (
                      <tr key={item.ano} className="hover:bg-slate-900/50 transition-colors">
                        <td className="py-2 px-3 font-bold text-slate-200">{item.ano}</td>
                        <td className="py-2 px-3 text-slate-300">R$ {item.dpa_bruto.toFixed(2)}</td>
                        <td className="py-2 px-3 text-emerald-400 font-semibold">R$ {item.dpa_ajustado.toFixed(2)}</td>
                        <td className="py-2 px-3 text-slate-300">R$ {item.lpa.toFixed(2)}</td>
                        <td className="py-2 px-3 text-slate-300">R$ {item.vpa.toFixed(2)}</td>
                        <td className="py-2 px-3 text-slate-200">R$ {item.lucro_liquido.toLocaleString('pt-BR')}</td>
                        <td className="py-2 px-3 text-cyan-400">R$ {item.fco.toLocaleString('pt-BR')}</td>
                        <td className="py-2 px-3 text-slate-300">R$ {item.divida_liquida.toLocaleString('pt-BR')}</td>
                        <td className="py-2 px-3 text-slate-400 font-sans text-[11px]">
                          {item.possui_nao_recorrente ? (
                            <span className="text-amber-400">{item.detalhe_nao_recorrente}</span>
                          ) : (
                            'Normal'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* 3º ANDAR: SOLVÊNCIA & CRÉDITO                                      */}
        {/* ================================================================== */}
        {andar.numero === 3 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className={`p-4 rounded-lg border ${
                  dossie.solvencia.alerta_alavancagem_critica
                    ? 'bg-rose-950/20 border-rose-500/50'
                    : 'bg-slate-950 border-slate-800'
                }`}
              >
                <span className="text-xs text-slate-400">Dívida Líquida / EBITDA</span>
                <div className="text-2xl font-bold font-mono mt-1 text-slate-100">
                  {dossie.solvencia.dl_ebitda_atual !== null ? `${dossie.solvencia.dl_ebitda_atual}x` : 'N/A (Banco/Digital)'}
                </div>
                <div className="text-xs mt-2 flex items-center gap-1.5">
                  {dossie.solvencia.alerta_alavancagem_critica ? (
                    <span className="text-rose-400 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Alerta Crítico (&gt; 3.5x)
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Nível Saudável (&lt; 3.5x)
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400">Cobertura de Juros (EBIT / Despesas Fin.)</span>
                <div className="text-2xl font-bold font-mono mt-1 text-slate-100">
                  {dossie.solvencia.cobertura_juros_atual !== null
                    ? `${dossie.solvencia.cobertura_juros_atual}x`
                    : 'N/A'}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  Capacidade de absorção de juros da dívida
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400">Qualidade Contábil (FCO vs Lucro Líquido)</span>
                <div className="text-sm font-semibold font-mono mt-2 text-cyan-400">
                  {dossie.solvencia.qualidade_lucro_divergencia_fco}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  Verifica se o lucro gera caixa operacional real
                </div>
              </div>
            </div>

            {/* Painel Estrutural de Dívida */}
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300 space-y-2">
              <h4 className="font-bold text-slate-100 text-sm">Diretriz do 3º Andar de Solvência:</h4>
              <p>
                A metodologia Buy & Hold desclassifica empresas com alavancagem descontrolada. No caso de transmissoras de energia como TAEE11, alavancagens de até 3.8x são toleráveis se ancoradas em contratos de concessão reajustados por IGP-M/IPCA e receitas garantidas (RAP). No entanto, novos aportes devem respeitar o limite prudencial.
              </p>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* 2º ANDAR: RADAR DE RISCO EXÓGENO & NOTÍCIAS CVM                    */}
        {/* ================================================================== */}
        {andar.numero === 2 && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-pink-400">RADAR DETERMINÍSTICO CVM</span>
                <h3 className="text-sm font-bold text-slate-100">Fatos Relevantes & Ruído de Mercado</h3>
              </div>
              <span className="text-xs px-2.5 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700">
                Filtro de Ruído: Ativo
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">TAEE11</span>
                    <span className="text-[10px] text-slate-500 font-mono">14/10/2026 18:45</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                      Ruído Transitório
                    </span>
                  </div>
                  <p className="text-slate-300 mt-1">
                    Aviso aos Acionistas: Pagamento de proventos intercalares no valor de R$ 0,72 por Unit.
                  </p>
                </div>
                <span className="text-emerald-400 font-bold shrink-0">Sem Risco</span>
              </div>

              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">BBAS3</span>
                    <span className="text-[10px] text-slate-500 font-mono">11/10/2026 19:15</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                      Operacional
                    </span>
                  </div>
                  <p className="text-slate-300 mt-1">
                    Fato Relevante: Aprovação do plano de expansão de crédito agro para a safra 2026/2027.
                  </p>
                </div>
                <span className="text-emerald-400 font-bold shrink-0">Sem Risco</span>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* 1º ANDAR / SUBSOLO: DATA ENGINE & SENTINELA BTC 24/7               */}
        {/* ================================================================== */}
        {andar.numero === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400">Ingestão de Cotações B3</span>
                <div className="text-lg font-bold font-mono text-cyan-400 mt-1">Status: Conectado</div>
                <p className="text-xs text-slate-500 mt-1">Brapi / Yahoo Finance API</p>
              </div>

              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400">Taxas Macroeconômicas Bacen</span>
                <div className="text-lg font-bold font-mono text-cyan-400 mt-1">Selic: 10.75% · IPCA: 4.2%</div>
                <p className="text-xs text-slate-500 mt-1">APIs públicas Banco Central</p>
              </div>

              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400">Sentinela BTC 24/7 (A cada 15 min)</span>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-1">Silêncio Operacional</div>
                <p className="text-xs text-slate-500 mt-1">Variação 1h: +0.8% (Abaixo do trigger de 5%)</p>
              </div>
            </div>

            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-400">
              <p>
                O motor do subsolo opera em regime autônomo com silêncio operacional total. A LLM e os canais de alerta só são acordados caso haja anomalia real de mercado (&gt; 5% de variação em 1 hora ou ruptura do suporte de longo prazo).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
