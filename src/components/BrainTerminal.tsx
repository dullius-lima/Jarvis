import React, { useState, useEffect, useRef } from 'react';
import { NeuralHub } from './NeuralBrainCanvas';
import { Ativo, DossieConsolidado } from '../types';
import { FinancialEngineClient } from '../services/financialEngine';
import {
  Brain,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  Sparkles,
  ShieldAlert,
  Mail,
  MessageSquare,
  Calendar,
  MapPin,
  Plus,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Code
} from 'lucide-react';

interface BrainTerminalProps {
  hub: NeuralHub;
  ativos: Ativo[];
  ativoSelecionado: Ativo;
  onSelecionarAtivo: (ativo: Ativo) => void;
}

interface VereditoDulliusJSON {
  ticker: string;
  classe_ativo: string;
  veredito: 'COMPRAR' | 'AGUARDAR' | 'QUARENTENA';
  margem_seguranca_bazin: string;
  diagnostico_executivo: string;
  alerta_de_risco: string;
  parecer_cfo: string;
}

export const BrainTerminal: React.FC<BrainTerminalProps> = ({
  hub,
  ativos,
  ativoSelecionado,
  onSelecionarAtivo,
}) => {
  // Estado de Comunicação por Voz
  const [vozAtiva, setVozAtiva] = useState<boolean>(true);
  const [ouvindoVoz, setOuvindoVoz] = useState<boolean>(false);
  const [inputMensagem, setInputMensagem] = useState<string>('');
  const [carregandoIA, setCarregandoIA] = useState<boolean>(false);

  // Histórico de Conversa com o Cérebro
  const [mensagens, setMensagens] = useState<{ id: string; role: 'user' | 'brain'; content: string; time: string }[]>([
    {
      id: 'init',
      role: 'brain',
      content: 'Cérebro Neural Central online. Investimentos Dullius e rotinas vitais sincronizadas. Emita sua diretriz.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // Auditoria do CFO - Investimentos Dullius
  const [dossie, setDossie] = useState<DossieConsolidado>(() =>
    FinancialEngineClient.processarDossie(ativoSelecionado)
  );
  const [vereditoOficial, setVereditoOficial] = useState<VereditoDulliusJSON | null>(null);
  const [carregandoCFO, setCarregandoCFO] = useState<boolean>(false);
  const [visualizarJsonBruto, setVisualizarJsonBruto] = useState<boolean>(false);

  // Estados dos Submódulos Integrados
  const [emailInput, setEmailInput] = useState('');
  const [whatsappInput, setWhatsappInput] = useState('');
  const [agendaTitulo, setAgendaTitulo] = useState('');
  const [agendaData, setAgendaData] = useState('');
  const [zonaLocalizacao, setZonaLocalizacao] = useState('');
  const [novaHabilidadeNome, setNovaHabilidadeNome] = useState('');
  const [novaHabilidadeDesc, setNovaHabilidadeDesc] = useState('');
  const [notificacaoSucesso, setNotificacaoSucesso] = useState('');

  // Sincronizar dossiê matemático quando altera ativo
  useEffect(() => {
    const d = FinancialEngineClient.processarDossie(ativoSelecionado);
    setDossie(d);
    setVereditoOficial(null);
  }, [ativoSelecionado]);

  // Síntese de Voz (TTS) em Português Frio e Institucional
  const falarTexto = (texto: string) => {
    if (!vozAtiva || typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(texto);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.05; // Ritmo frio e pragmático
      utterance.pitch = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Síntese de voz não suportada pelo navegador.', e);
    }
  };

  // Reconhecimento de Voz (STT) via Web Speech API
  const alternarMicrofone = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Seu navegador não possui suporte para reconhecimento nativo de voz.');
      return;
    }

    if (ouvindoVoz) {
      setOuvindoVoz(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setOuvindoVoz(true);
      recognition.onend = () => setOuvindoVoz(false);
      recognition.onerror = () => setOuvindoVoz(false);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputMensagem(transcript);
          enviarComandoAoCerebro(transcript);
        }
      };

      recognition.start();
    } catch (e) {
      console.error(e);
      setOuvindoVoz(false);
    }
  };

  // Enviar comando ao Cérebro Neural (Texto ou Voz)
  const enviarComandoAoCerebro = async (texto: string) => {
    if (!texto.trim() || carregandoIA) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user' as const,
      content: texto,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMensagens((prev) => [...prev, userMsg]);
    setInputMensagem('');
    setCarregandoIA(true);

    try {
      const res = await fetch('/api/brain/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagem: texto,
          modulo: hub.category.toUpperCase(),
          dadosContexto: {
            ativo: ativoSelecionado.ticker,
            classe: ativoSelecionado.classe,
          },
        }),
      });

      const data = await res.json();
      const respostaIA = data.resposta || 'Comando assimilado pelo cérebro.';

      const brainMsg = {
        id: `brain-${Date.now()}`,
        role: 'brain' as const,
        content: respostaIA,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMensagens((prev) => [...prev, brainMsg]);
      falarTexto(respostaIA);
    } catch (err: any) {
      console.error(err);
      const erroMsg = {
        id: `err-${Date.now()}`,
        role: 'brain' as const,
        content: 'Falha na transmissão neural. Parâmetros mantidos em modo seguro.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMensagens((prev) => [...prev, erroMsg]);
    } finally {
      setCarregandoIA(false);
    }
  };

  // Executar Auditoria do CFO com Schema Estrito da Investimentos Dullius
  const executarAuditoriaCFO = async () => {
    setCarregandoCFO(true);
    try {
      const res = await fetch('/api/cfo/deliberar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossie }),
      });
      const data: VereditoDulliusJSON = await res.json();
      setVereditoOficial(data);
      falarTexto(`Auditoria de ${data.ticker}: Veredito ${data.veredito}. ${data.parecer_cfo}`);
    } catch (err) {
      console.error(err);
    } finally {
      setCarregandoCFO(false);
    }
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl mt-6">
      {/* Top Bar do Módulo em Foco */}
      <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-950 font-bold shadow-lg"
            style={{ backgroundColor: `#${hub.color.toString(16).padStart(6, '0')}` }}
          >
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
              {hub.name}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{hub.subname}</span>
              <span>·</span>
              <span className="font-mono text-cyan-400">{hub.metrics}</span>
            </div>
          </div>
        </div>

        {/* Controles de Voz & Canal Interativo */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVozAtiva(!vozAtiva)}
            title={vozAtiva ? 'Desativar Fala da IA' : 'Ativar Fala da IA'}
            className={`p-2 rounded-lg text-xs font-semibold border transition-colors ${
              vozAtiva
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/40'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            {vozAtiva ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={alternarMicrofone}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              ouvindoVoz
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {ouvindoVoz ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-cyan-400" />}
            {ouvindoVoz ? 'Ouvindo Você...' : 'Falar com o Cérebro'}
          </button>
        </div>
      </div>

      {/* Conteúdo Dinâmico Conforme Lóbulo Neural Selecionado */}
      <div className="p-6 space-y-6">
        {/* ================================================================== */}
        {/* LÓBULO 1: CFO & ALOCADOR DE CAPITAL (INVESTIMENTOS DULLIUS)         */}
        {/* ================================================================== */}
        {hub.category === 'cfo' && (
          <div className="space-y-6">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-mono text-amber-500 font-bold uppercase tracking-wider">
                  INVESTIMENTOS DULLIUS · DIRETORIA EXECUTIVA
                </span>
                <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                  Auditoria Rígida de {dossie.ticker} ({dossie.nome_empresa})
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Cotação: <span className="font-mono text-slate-200 font-bold">R$ {dossie.cotacao_atual.toFixed(2)}</span> · Preço-Teto Bazin: <span className="font-mono text-emerald-400 font-bold">R$ {dossie.bazin.teto_bazin_3_anos.toFixed(2)}</span> · Alavancagem: <span className="font-mono text-slate-300 font-bold">{dossie.solvencia.dl_ebitda_atual ?? 'N/A'}x</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVisualizarJsonBruto(!visualizarJsonBruto)}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors"
                >
                  <Code className="w-3.5 h-3.5" />
                  {visualizarJsonBruto ? 'Ocultar JSON' : 'Ver JSON Parser'}
                </button>
                <button
                  onClick={executarAuditoriaCFO}
                  disabled={carregandoCFO}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  {carregandoCFO ? 'Auditando...' : 'Deliberação Oficial CFO'}
                </button>
              </div>
            </div>

            {/* Veredito Estrito Retornado no Schema Mandatório */}
            {vereditoOficial && (
              <div
                className={`p-5 rounded-xl border ${
                  vereditoOficial.veredito === 'COMPRAR'
                    ? 'bg-emerald-950/25 border-emerald-500/50'
                    : vereditoOficial.veredito === 'AGUARDAR'
                    ? 'bg-amber-950/25 border-amber-500/50'
                    : 'bg-rose-950/25 border-rose-500/50'
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 rounded text-xs font-black tracking-widest ${
                        vereditoOficial.veredito === 'COMPRAR'
                          ? 'bg-emerald-500 text-slate-950'
                          : vereditoOficial.veredito === 'AGUARDAR'
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      VEREDITO: {vereditoOficial.veredito}
                    </span>
                    <span className="text-xs font-mono text-slate-300">
                      Classe: {vereditoOficial.classe_ativo} · Margem Bazin: <span className="font-bold text-emerald-400">{vereditoOficial.margem_seguranca_bazin}</span>
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">Investimentos Dullius</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <span className="text-slate-400 font-bold">Diagnóstico Executivo:</span>
                    <p className="text-slate-200 bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 leading-relaxed font-sans">
                      {vereditoOficial.diagnostico_executivo}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <span className="text-slate-400 font-bold">Parecer CFO & Ordem de Alocação:</span>
                    <p className="text-slate-200 bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 leading-relaxed font-sans">
                      {vereditoOficial.parecer_cfo}
                    </p>
                  </div>
                </div>

                <div className="mt-3 text-xs bg-slate-950/40 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">
                    <strong className="text-rose-400">Alerta de Risco:</strong> {vereditoOficial.alerta_de_risco}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">Última Linha de Defesa Patrimonial</span>
                </div>

                {visualizarJsonBruto && (
                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    <span className="text-[11px] font-mono text-slate-400">Objeto JSON Consumido pelo Parser:</span>
                    <pre className="p-3 bg-slate-950 rounded-lg text-xs font-mono text-amber-400 overflow-x-auto mt-1 border border-slate-800">
                      {JSON.stringify(vereditoOficial, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================================================================== */}
        {/* LÓBULO 2: SECRETARIA & E-MAILS                                     */}
        {/* ================================================================== */}
        {hub.category === 'email' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Mail className="w-4 h-4 text-cyan-400" /> Cadastrar & Sincronizar Caixa de E-mail
              </h3>
              <p className="text-slate-400 text-xs mt-1">
                Conecte contas do Google Workspace, IMAP ou Outlook para o cérebro triar mensagens e alertar sobre compromissos.
              </p>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!emailInput) return;
                  await fetch('/api/integrations/email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: emailInput }),
                  });
                  setNotificacaoSucesso(`E-mail ${emailInput} integrado com sucesso.`);
                  setEmailInput('');
                  setTimeout(() => setNotificacaoSucesso(''), 3000);
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  type="email"
                  placeholder="seu.email@empresa.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                  required
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-colors"
                >
                  Conectar Caixa
                </button>
              </form>
            </div>

            {notificacaoSucesso && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-lg text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{notificacaoSucesso}</span>
              </div>
            )}
          </div>
        )}

        {/* ================================================================== */}
        {/* LÓBULO 3: COMUNICAÇÕES & WHATSAPP                                  */}
        {/* ================================================================== */}
        {hub.category === 'whatsapp' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" /> Cadastrar Canal WhatsApp
              </h3>
              <p className="text-slate-400 text-xs mt-1">
                Conecte o seu número de WhatsApp para receber relatórios da holding, ordens de execução e alertas urgentes.
              </p>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!whatsappInput) return;
                  await fetch('/api/integrations/whatsapp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ numero: whatsappInput }),
                  });
                  setNotificacaoSucesso(`WhatsApp ${whatsappInput} conectado com sucesso via Webhook.`);
                  setWhatsappInput('');
                  setTimeout(() => setNotificacaoSucesso(''), 3000);
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  type="text"
                  placeholder="+55 51 99999-9999"
                  value={whatsappInput}
                  onChange={(e) => setWhatsappInput(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                  required
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors"
                >
                  Ativar Webhook
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* LÓBULO 4: AGENDA & COMPROMISSOS                                    */}
        {/* ================================================================== */}
        {hub.category === 'agenda' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-400" /> Registrar Compromisso ou Vencimento
              </h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!agendaTitulo) return;
                  await fetch('/api/integrations/agenda', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ titulo: agendaTitulo, data_hora: agendaData }),
                  });
                  setNotificacaoSucesso(`Compromisso "${agendaTitulo}" adicionado à agenda.`);
                  setAgendaTitulo('');
                  setTimeout(() => setNotificacaoSucesso(''), 3000);
                }}
                className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                <input
                  type="text"
                  placeholder="Título do compromisso / Pagamento de JCP"
                  value={agendaTitulo}
                  onChange={(e) => setAgendaTitulo(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500"
                  required
                />
                <input
                  type="datetime-local"
                  value={agendaData}
                  onChange={(e) => setAgendaData(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-purple-500 font-mono"
                />
                <button
                  type="submit"
                  className="col-span-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-colors"
                >
                  Adicionar à Agenda Executiva
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* LÓBULO 5: SENTINELA & SEGURANÇA 24/7                              */}
        {/* ================================================================== */}
        {hub.category === 'seguranca' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500" /> Protocolo de Sentinela Cripto & Patrimônio
              </h3>
              <p className="text-slate-400 mt-1">
                Conforme diretriz, o Bitcoin opera sem balanço contábil. Apenas quebras de suporte crítico, taxa de adoção e quedas anormais (&gt; 8% em 24h) disparam o sinal de alerta.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-slate-400">Trigger de Anomalia</span>
                  <div className="text-sm font-bold text-rose-400 mt-1 font-mono">&gt; 8% em 24h</div>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-slate-400">Suporte Crítico</span>
                  <div className="text-sm font-bold text-amber-400 mt-1 font-mono">$ 55.000 USD</div>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-slate-400">Estado Operacional</span>
                  <div className="text-sm font-bold text-emerald-400 mt-1 font-mono">Silêncio Absoluto</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* LÓBULO 6: GEOLOCALIZAÇÃO                                          */}
        {/* ================================================================== */}
        {hub.category === 'localizacao' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-orange-400" /> Cadastrar Zona Territorial Segura
              </h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!zonaLocalizacao) return;
                  await fetch('/api/integrations/location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome_zona: zonaLocalizacao }),
                  });
                  setNotificacaoSucesso(`Zona segura "${zonaLocalizacao}" registrada.`);
                  setZonaLocalizacao('');
                  setTimeout(() => setNotificacaoSucesso(''), 3000);
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  type="text"
                  placeholder="Nome da Zona / Ex: Residência, Escritório Central"
                  value={zonaLocalizacao}
                  onChange={(e) => setZonaLocalizacao(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-orange-500"
                  required
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg transition-colors"
                >
                  Registrar Zona
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* LÓBULO 7: SINAPSE DINÂMICA (NOVA HABILIDADE)                      */}
        {/* ================================================================== */}
        {hub.category === 'custom' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-pink-400" /> Expandir Habilidades do Cérebro
              </h3>
              <p className="text-slate-400 mt-1">
                Cadastre qualquer nova função para o seu agente central de IA (ex: Médico pessoal, Consultor Imobiliário, Gestor de Domótica, etc.).
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!novaHabilidadeNome) return;
                  await fetch('/api/integrations/skills', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome: novaHabilidadeNome, descricao: novaHabilidadeDesc }),
                  });
                  setNotificacaoSucesso(`Habilidade "${novaHabilidadeNome}" conectada às sinapses.`);
                  setNovaHabilidadeNome('');
                  setNovaHabilidadeDesc('');
                  setTimeout(() => setNotificacaoSucesso(''), 3000);
                }}
                className="mt-3 space-y-3"
              >
                <input
                  type="text"
                  placeholder="Nome da Habilidade (Ex: Assessor Tributário, Auditor Jurídico)"
                  value={novaHabilidadeNome}
                  onChange={(e) => setNovaHabilidadeNome(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-pink-500"
                  required
                />
                <textarea
                  placeholder="Descreva as atribuições e diretrizes operacionais desta habilidade..."
                  value={novaHabilidadeDesc}
                  onChange={(e) => setNovaHabilidadeDesc(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-pink-500 h-20"
                />
                <button
                  type="submit"
                  className="w-full py-2 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-lg transition-colors"
                >
                  Conectar Nova Habilidade Neural
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* CHAT UNIFICADO COM O CÉREBRO NEURAL (VOZ & TEXTO)                  */}
        {/* ================================================================== */}
        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
          <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              Canal Sináptico Direto (Interaja por Voz ou Texto)
            </span>
            <span className="text-slate-500 font-mono">Investimentos Dullius · Sem Ruído</span>
          </div>

          <div className="p-4 h-52 overflow-y-auto space-y-3 text-xs">
            {mensagens.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3 rounded-xl leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-slate-900 text-slate-200 border border-slate-800'
                  }`}
                >
                  {m.content}
                </div>
                <span className="text-[10px] text-slate-500 mt-1 px-1 font-mono">{m.time}</span>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviarComandoAoCerebro(inputMensagem);
            }}
            className="p-2.5 border-t border-slate-800 flex gap-2 bg-slate-900/60"
          >
            <input
              type="text"
              value={inputMensagem}
              onChange={(e) => setInputMensagem(e.target.value)}
              placeholder="Digite uma ordem, audite um ativo ou pergunte algo à IA..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-sans"
            />
            <button
              type="button"
              onClick={alternarMicrofone}
              className={`p-2 rounded-lg border transition-colors ${
                ouvindoVoz
                  ? 'bg-rose-600 border-rose-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Falar pelo Microfone"
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              type="submit"
              disabled={carregandoIA || !inputMensagem.trim()}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              Executar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
