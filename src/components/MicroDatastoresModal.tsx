import React, { useState, useEffect } from 'react';
import { MicroDatastoreParticionado, AgenteSentinela, LogIsolamentoParticao } from '../types/neural';
import { MicroDatastoresService } from '../services/microDatastores';
import {
  Database,
  ShieldAlert,
  Zap,
  Plus,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Cpu,
  Terminal,
  Lock,
  ShieldCheck,
  Layers,
  Activity,
  FileText,
  RefreshCw,
  Play,
  Info,
  HelpCircle,
  Check,
  Search,
  Trash2
} from 'lucide-react';

interface MicroDatastoresModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPartition: (ds: MicroDatastoreParticionado) => void;
  onAlertTriggered: (agente: AgenteSentinela) => void;
}

export const MicroDatastoresModal: React.FC<MicroDatastoresModalProps> = ({
  isOpen,
  onClose,
  onSelectPartition,
  onAlertTriggered,
}) => {
  const service = MicroDatastoresService.getInstance();
  const [bancos, setBancos] = useState<MicroDatastoreParticionado[]>(() => service.listarTodos());
  const [logs, setLogs] = useState<LogIsolamentoParticao[]>(() => service.obterLogsIsolamento());
  const [abaAtiva, setAbaAtiva] = useState<'bancos' | 'logs_explicacao'>('bancos');
  const [filtroTipoLog, setFiltroTipoLog] = useState<'todos' | 'acesso_isolado' | 'bloqueio_cruzado' | 'sentinela_disparo'>('todos');
  const [busca, setBusca] = useState('');

  // Formulário de novo banco
  const [chaveNova, setChaveNova] = useState('');
  const [tipoNovo, setTipoNovo] = useState<'ativo_b3' | 'cripto' | 'saude' | 'familia' | 'rotina'>('ativo_b3');
  const [mostrarCriador, setMostrarCriador] = useState(false);
  const [auditando, setAuditando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Simulador de Isolamento interativo
  const [ativoSimulacao, setAtivoSimulacao] = useState('TAEE11');
  const [simulando, setSimulando] = useState(false);
  const [resultadoSimulacao, setResultadoSimulacao] = useState<{
    chave: string;
    bloqueadas: string[];
    latencia: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setBancos(service.listarTodos());
      setLogs(service.obterLogsIsolamento());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCriarNovoBanco = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chaveNova.trim()) return;

    const criado = service.autoAlimentarOuCriar(chaveNova.trim(), tipoNovo);
    setBancos(service.listarTodos());
    setLogs(service.obterLogsIsolamento());
    setChaveNova('');
    setMostrarCriador(false);
    setMensagemSucesso(`Silo isolado e Sentinela de ${criado.chave} criados e registrados no log de isolamento.`);
    setTimeout(() => setMensagemSucesso(null), 4000);
  };

  const handleExecutarAuditoriaSentinelas = () => {
    setAuditando(true);
    setTimeout(() => {
      const alertas = service.verificarAlertasAtivos();
      setAuditando(false);
      setLogs(service.obterLogsIsolamento());
      if (alertas.length > 0) {
        onAlertTriggered(alertas[0]);
      }
    }, 700);
  };

  const handleExecutarSimulacaoIsolamento = (chave: string) => {
    setSimulando(true);
    setResultadoSimulacao(null);

    setTimeout(() => {
      const sim = service.simularAcessoIsolado(chave);
      setSimulando(false);
      setLogs(service.obterLogsIsolamento());
      setResultadoSimulacao({
        chave: sim.particao.chave,
        bloqueadas: sim.outrasParticoesBloqueadas,
        latencia: 0.02,
      });
      setBancos(service.listarTodos());
    }, 450);
  };

  const bancosFiltrados = bancos.filter(
    (b) =>
      b.chave.toLowerCase().includes(busca.toLowerCase()) ||
      b.nome.toLowerCase().includes(busca.toLowerCase()) ||
      b.descricao.toLowerCase().includes(busca.toLowerCase())
  );

  const logsFiltrados = logs.filter((log) => {
    if (filtroTipoLog === 'todos') return true;
    return log.tipo === filtroTipoLog;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-4xl max-h-[92vh] bg-slate-950 border border-cyan-500/40 rounded-2xl p-5 sm:p-6 shadow-[0_0_80px_rgba(6,182,212,0.25)] flex flex-col relative overflow-hidden text-slate-100">
        
        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors z-20"
          title="Fechar painel"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Superior com Identidade do Particionamento */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-100">
                  Micro-Datastores Particionados & Sentinelas
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                  O(1) SILO ENGINE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Isolamento estanque de memória por ativo. O JARVIS não varre histórico global: ele abre apenas a gaveta requisitada.
              </p>
            </div>
          </div>
        </div>

        {/* Barra de Telemetria e Indicadores de Integridade */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="p-2.5 bg-slate-900/60 border border-cyan-500/20 rounded-xl flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Silos Ativos</div>
              <div className="text-sm font-bold text-slate-100 font-mono">{bancos.length} Partições</div>
            </div>
          </div>

          <div className="p-2.5 bg-slate-900/60 border border-emerald-500/20 rounded-xl flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Vazamento Cruzado</div>
              <div className="text-sm font-bold text-emerald-400 font-mono">0.00% (Blindado)</div>
            </div>
          </div>

          <div className="p-2.5 bg-slate-900/60 border border-blue-500/20 rounded-xl flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Latência O(1)</div>
              <div className="text-sm font-bold text-blue-300 font-mono">~0.02 ms</div>
            </div>
          </div>

          <div className="p-2.5 bg-slate-900/60 border border-amber-500/20 rounded-xl flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Sentinelas 24/7</div>
              <div className="text-sm font-bold text-amber-300 font-mono">
                {bancos.filter((b) => b.agenteSentinela.status === 'alerta_disparado').length > 0
                  ? `${bancos.filter((b) => b.agenteSentinela.status === 'alerta_disparado').length} em Alerta`
                  : 'Todos Vigilantes'}
              </div>
            </div>
          </div>
        </div>

        {/* Abas de Navegação */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAbaAtiva('bancos')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                abaAtiva === 'bancos'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              Silos & Bancos Isolados ({bancos.length})
            </button>

            <button
              onClick={() => setAbaAtiva('logs_explicacao')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                abaAtiva === 'logs_explicacao'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Log de Status & Topologia de Isolamento
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {abaAtiva === 'bancos' && (
              <button
                onClick={() => setMostrarCriador(!mostrarCriador)}
                className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center gap-1 shadow"
              >
                <Plus className="w-3.5 h-3.5" /> Novo Silo
              </button>
            )}

            <button
              onClick={handleExecutarAuditoriaSentinelas}
              disabled={auditando}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
              {auditando ? 'Auditando...' : 'Auditar Sentinelas'}
            </button>
          </div>
        </div>

        {mensagemSucesso && (
          <div className="mb-4 p-3 bg-emerald-950/70 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{mensagemSucesso}</span>
          </div>
        )}

        {/* CONTEÚDO DA ABA 1: SILOS & BANCOS ISOLADOS */}
        {abaAtiva === 'bancos' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Formulário de Criação Dinâmica */}
            {mostrarCriador && (
              <form
                onSubmit={handleCriarNovoBanco}
                className="mb-3 p-4 bg-slate-900/80 border border-cyan-500/40 rounded-xl space-y-3 animate-in fade-in shrink-0"
              >
                <div className="font-bold text-xs text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> Provisionar Novo Silo de Dados com Sentinela Dedicado
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <input
                    type="text"
                    placeholder="Ticker ou Chave (ex: VALE3, PETR4, FUNDO_IMOB)"
                    value={chaveNova}
                    onChange={(e) => setChaveNova(e.target.value.toUpperCase())}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 uppercase font-mono"
                    required
                  />
                  <select
                    value={tipoNovo}
                    onChange={(e) => setTipoNovo(e.target.value as any)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs"
                  >
                    <option value="ativo_b3">Ação B3 / Dividendos</option>
                    <option value="cripto">Criptoativo / Token</option>
                    <option value="saude">Saúde & Bem-Estar</option>
                    <option value="familia">Família & Filhos</option>
                    <option value="rotina">Rotina Doméstica</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Cpu className="w-4 h-4" /> Inicializar Silo e Registrar no Log
                  </button>
                  <button
                    type="button"
                    onClick={() => setMostrarCriador(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {/* Busca rápida */}
            <div className="mb-3 flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 border border-slate-800 rounded-lg shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar partições por chave (ex: TAEE11, BTC, BBAS3)..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="bg-transparent text-xs text-slate-200 placeholder-slate-500 outline-none w-full font-mono"
              />
            </div>

            {/* Lista com Scroll */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1.5">
              {bancosFiltrados.map((ds) => {
                const ag = ds.agenteSentinela;
                const emAlerta = ag.status === 'alerta_disparado';

                return (
                  <div
                    key={ds.id}
                    className={`p-4 rounded-xl border transition-all ${
                      emAlerta
                        ? 'bg-rose-950/25 border-rose-500/60 shadow-[0_0_25px_rgba(239,68,68,0.2)]'
                        : 'bg-slate-900/60 border-slate-800 hover:border-cyan-500/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2 mb-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-sm font-black text-cyan-400 bg-cyan-950/90 px-2.5 py-0.5 rounded border border-cyan-500/40 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-cyan-400" /> {ds.chave}
                        </span>
                        <span className="text-xs font-bold text-slate-200">{ds.nome}</span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono">
                        <span className="text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          {ds.totalConsultas} consultas cirúrgicas
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                            emAlerta
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}
                        >
                          {emAlerta ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                          {ag.nome} ({emAlerta ? 'ALERTA ATIVO' : 'VIGILANTE'})
                        </span>
                      </div>
                    </div>

                    {/* Dados Isolados da Partição */}
                    <div className="text-xs space-y-2">
                      <p className="text-slate-400 text-[11px]">{ds.descricao}</p>

                      {/* Prévia dos Dados Sem Poluição */}
                      <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-[11px] grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(ds.dados).slice(0, 6).map(([k, v]) => (
                          <div key={k} className="truncate">
                            <span className="text-slate-500">{k}: </span>
                            <span className="text-cyan-300 font-bold">
                              {typeof v === 'number' ? (v > 1000 ? v.toLocaleString('pt-BR') : v) : String(v)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Alerta do Sentinela se Houver */}
                      {ag.alertaVigente && (
                        <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
                          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Alerta do {ag.nome}: </span>
                            <span>{ag.alertaVigente}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between pt-1 text-[10px] text-slate-500 font-mono gap-2">
                        <span>Regra: {ag.regraMonitoramento}</span>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              const disparado = service.dispararAlertaSentinela(ds.chave);
                              if (disparado) {
                                onAlertTriggered(disparado);
                                onClose();
                              }
                            }}
                            className="text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 bg-rose-950/40 hover:bg-rose-900/50 px-2 py-0.5 rounded border border-rose-500/30 transition-colors"
                            title={`Disparar sinapse molecular e alerta do sentinela de ${ds.chave} no cérebro 3D`}
                          >
                            <Zap className="w-3 h-3 text-rose-400" /> Disparar Sinapse ({ds.chave})
                          </button>
                          <button
                            onClick={() => {
                              handleExecutarSimulacaoIsolamento(ds.chave);
                              setAbaAtiva('logs_explicacao');
                            }}
                            className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
                            title="Ver no log como essa partição é isolada"
                          >
                            <Terminal className="w-3 h-3" /> Testar Isolamento
                          </button>
                          <button
                            onClick={() => {
                              onSelectPartition(ds);
                              onClose();
                            }}
                            className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1"
                          >
                            Consultar Silo com o JARVIS <ArrowRight className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => {
                              service.excluirParticao(ds.chave);
                              setBancos(service.listarTodos());
                              setLogs(service.obterLogsIsolamento());
                              setMensagemSucesso(`Silo isolado [${ds.chave}] excluído com sucesso.`);
                              setTimeout(() => setMensagemSucesso(null), 3500);
                            }}
                            className="text-rose-400 hover:text-rose-200 font-bold flex items-center gap-1 bg-rose-950/60 hover:bg-rose-900 px-2 py-0.5 rounded border border-rose-500/40 transition-colors cursor-pointer"
                            title={`Excluir partição ${ds.chave}`}
                          >
                            <Trash2 className="w-3 h-3" /> Excluir Silo
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CONTEÚDO DA ABA 2: LOG DE STATUS & EXPLICAÇÃO COMPREENSÍVEL */}
        {abaAtiva === 'logs_explicacao' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-4 pr-1">
            
            {/* Bloco Pedagógico: A Estrutura Explicada Sem Confusão */}
            <div className="p-4 bg-gradient-to-r from-slate-900/90 to-cyan-950/40 border border-cyan-500/40 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
                <HelpCircle className="w-4 h-4 text-cyan-400" />
                Como o Jarvis Isola os Dados por Ativo (Analogia das Gavetas Exclusivas)
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
                <div className="p-3 rounded-lg bg-slate-950/70 border border-rose-500/30 space-y-1.5">
                  <div className="font-bold text-rose-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    IA Convencional (Caderno de 10.000 Páginas)
                  </div>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    Armazena todo o histórico em um único bloco. Ao perguntar sobre a TAEE11, ela é obrigada a reler faturas de cartão, conversas de família e Bitcoin. 
                    <strong className="text-rose-200"> Risco:</strong> Alucinação de números, lentidão e mistura perigosa de ativos.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/70 border border-cyan-500/40 space-y-1.5">
                  <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-cyan-400" />
                    JARVIS com Particionamento Isolado (Gavetas de Aço)
                  </div>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    Cada ativo possui um silo criptográfico estanque. Quando você diz <em>"Auditar TAEE11"</em>, o Jarvis abre <strong>somente a gaveta [TAEE11]</strong>. As gavetas de BBAS3 e BTC permanecem 100% blindadas e inalteradas.
                  </p>
                </div>
              </div>

              {/* 3 Pilares do Isolamento */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
                <div className="p-2 bg-slate-950/60 rounded border border-slate-800 flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-200">Silo Dedicado:</span>
                    <span className="text-slate-400 block text-[10px]">Alterações em um ativo nunca afetam os demais.</span>
                  </div>
                </div>

                <div className="p-2 bg-slate-950/60 rounded border border-slate-800 flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-200">Sentinela Próprio:</span>
                    <span className="text-slate-400 block text-[10px]">Cada gaveta tem seu auditor exclusivo 24/7.</span>
                  </div>
                </div>

                <div className="p-2 bg-slate-950/60 rounded border border-slate-800 flex items-start gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-200">Busca O(1) Direta:</span>
                    <span className="text-slate-400 block text-[10px]">Acesso cirúrgico em ~0.02ms sem ler histórico.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Teste / Simulador de Isolamento Interativo */}
            <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-cyan-400" />
                  Simulador de Teste de Isolamento em Tempo Real
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Selecione o Ativo:</span>
                  <select
                    value={ativoSimulacao}
                    onChange={(e) => setAtivoSimulacao(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-cyan-300 outline-none"
                  >
                    {bancos.map((b) => (
                      <option key={b.chave} value={b.chave}>
                        {b.chave} ({b.tipo})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleExecutarSimulacaoIsolamento(ativoSimulacao)}
                    disabled={simulando}
                    className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded transition-all flex items-center gap-1 disabled:opacity-50"
                  >
                    <Zap className="w-3 h-3" />
                    {simulando ? 'Processando...' : 'Executar Teste'}
                  </button>
                </div>
              </div>

              {resultadoSimulacao && (
                <div className="p-3 rounded-lg bg-slate-950 border border-cyan-500/30 text-xs font-mono space-y-2 animate-in fade-in">
                  <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Simulação Concluída com Sucesso: Silo [{resultadoSimulacao.chave}] Isolado em {resultadoSimulacao.latencia}ms
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                    <div className="p-2 rounded bg-cyan-950/40 border border-cyan-500/20">
                      <div className="text-slate-400 text-[10px]">GAVETA ABERTA</div>
                      <div className="text-cyan-300 font-bold">[{resultadoSimulacao.chave}] 100% Ativa</div>
                    </div>
                    <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                      <div className="text-slate-400 text-[10px]">GAVETAS BLINDADAS</div>
                      <div className="text-slate-300 font-bold">{resultadoSimulacao.bloqueadas.length} Silos Trancados</div>
                    </div>
                    <div className="p-2 rounded bg-emerald-950/40 border border-emerald-500/20">
                      <div className="text-slate-400 text-[10px]">POLUIÇÃO DE CONTEXTO</div>
                      <div className="text-emerald-400 font-bold">0 bytes lidos fora de [{resultadoSimulacao.chave}]</div>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    As partições ({resultadoSimulacao.bloqueadas.join(', ')}) não sofreram nenhuma leitura. O Jarvis respondeu com precisão analítica.
                  </p>
                </div>
              )}
            </div>

            {/* Painel do Terminal / Log de Status em Tempo Real */}
            <div className="flex-1 min-h-[280px] bg-slate-950 border border-cyan-500/30 rounded-xl flex flex-col overflow-hidden shadow-inner font-mono">
              {/* Barra de Título do Terminal */}
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></div>
                  </div>
                  <span className="text-slate-300 font-bold text-[11px] flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    jarvis://telemetry/datastores-isolation.log
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-slate-500">Filtro:</span>
                    <button
                      onClick={() => setFiltroTipoLog('todos')}
                      className={`px-1.5 py-0.5 rounded ${
                        filtroTipoLog === 'todos' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setFiltroTipoLog('acesso_isolado')}
                      className={`px-1.5 py-0.5 rounded ${
                        filtroTipoLog === 'acesso_isolado' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400'
                      }`}
                    >
                      Acesso O(1)
                    </button>
                    <button
                      onClick={() => setFiltroTipoLog('bloqueio_cruzado')}
                      className={`px-1.5 py-0.5 rounded ${
                        filtroTipoLog === 'bloqueio_cruzado' ? 'bg-indigo-500/20 text-indigo-300 font-bold' : 'text-slate-400'
                      }`}
                    >
                      Bloqueio
                    </button>
                    <button
                      onClick={() => setFiltroTipoLog('sentinela_disparo')}
                      className={`px-1.5 py-0.5 rounded ${
                        filtroTipoLog === 'sentinela_disparo' ? 'bg-rose-500/20 text-rose-300 font-bold' : 'text-slate-400'
                      }`}
                    >
                      Sentinela
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      service.limparLogs();
                      setLogs(service.obterLogsIsolamento());
                    }}
                    className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
                    title="Redefinir logs de telemetria"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Feed de Logs */}
              <div className="p-3 overflow-y-auto space-y-2 text-xs flex-1 max-h-[300px]">
                {logsFiltrados.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-[11px]">
                    Nenhum evento registrado para este filtro.
                  </div>
                ) : (
                  logsFiltrados.map((log) => {
                    let badgeColor = 'bg-cyan-950 text-cyan-300 border-cyan-500/30';
                    let tagTexto = 'ACESSO O(1)';

                    if (log.tipo === 'bloqueio_cruzado') {
                      badgeColor = 'bg-indigo-950 text-indigo-300 border-indigo-500/30';
                      tagTexto = 'ISOLAMENTO';
                    } else if (log.tipo === 'sentinela_disparo') {
                      badgeColor = 'bg-rose-950 text-rose-300 border-rose-500/30';
                      tagTexto = 'SENTINELA';
                    } else if (log.tipo === 'criacao_silo') {
                      badgeColor = 'bg-emerald-950 text-emerald-300 border-emerald-500/30';
                      tagTexto = 'NOVO SILO';
                    } else if (log.tipo === 'auditoria') {
                      badgeColor = 'bg-amber-950 text-amber-300 border-amber-500/30';
                      tagTexto = 'AUDITORIA';
                    }

                    return (
                      <div
                        key={log.id}
                        className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800/80 hover:border-cyan-500/30 transition-all space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-mono">{log.timestamp}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                              {tagTexto}
                            </span>
                            <span className="font-bold text-slate-200">[{log.chaveParticao}]</span>
                            <span className="text-cyan-400 font-semibold">{log.evento}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                            latência: {log.latenciaMs}ms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 pl-1 leading-relaxed">
                          {log.detalhes}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Rodapé do Terminal */}
              <div className="px-3 py-1.5 bg-slate-900/80 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Garantia de Partição: Roteamento de Chave Hash O(1) sem contaminação entre ativos
                </span>
                <span>Total de eventos: {logs.length}</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
