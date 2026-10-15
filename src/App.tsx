import React, { useState, useEffect, useRef } from 'react';
import { RealisticBrainCanvas } from './components/RealisticBrainCanvas';
import { VoiceSettingsModal } from './components/VoiceSettingsModal';
import { SynapseMemoryPanel } from './components/SynapseMemoryPanel';
import { MicroDatastoresModal } from './components/MicroDatastoresModal';
import { AgentRegistryModal } from './components/AgentRegistryModal';
import { LLMConfigModal } from './components/LLMConfigModal';
import { INITIAL_SYNAPSE_MEMORIES } from './data/synapseMemories';
import {
  SynapseMemory,
  FamilyProfile,
  FAMILY_PROFILES,
  VoiceConfig,
  SentimentAnalysisResult,
  MicroDatastoreParticionado,
  AgenteSentinela,
  LLMProviderConfig
} from './types/neural';
import { JarvisVoiceService } from './services/jarvisVoice';
import { SentimentEngine } from './services/sentimentEngine';
import { MicroDatastoresService } from './services/microDatastores';
import { AgentRegistryService } from './services/agentRegistry';
import { UniversalLLMService } from './services/llmConfig';
import {
  Mic,
  MicOff,
  Sliders,
  Tv,
  Download,
  Send,
  Bot,
  Database,
  Layers,
  Cpu,
  ShieldAlert,
  X,
  Volume2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ChevronDown,
  Keyboard
} from 'lucide-react';

export default function App() {
  const microService = MicroDatastoresService.getInstance();
  const agentService = AgentRegistryService.getInstance();
  const llmService = UniversalLLMService.getInstance();
  const voiceService = JarvisVoiceService.getInstance();

  // Estado das Memórias e Sinapses Neurais
  const [memories, setMemories] = useState<SynapseMemory[]>(() => {
    const saved = localStorage.getItem('jarvis_memories');
    if (!saved) return INITIAL_SYNAPSE_MEMORIES;
    try {
      const parsed: SynapseMemory[] = JSON.parse(saved);
      // Assegurar que os arquivos menores essenciais (compras, agenda, perfis de família) estejam sempre presentes
      const existingIds = new Set(parsed.map((m) => m.id));
      const missing = INITIAL_SYNAPSE_MEMORIES.filter((m) => !existingIds.has(m.id));
      return [...parsed, ...missing];
    } catch {
      return INITIAL_SYNAPSE_MEMORIES;
    }
  });

  const [selectedMemory, setSelectedMemory] = useState<SynapseMemory | null>(null);
  const [activeProfile, setActiveProfile] = useState<FamilyProfile>(FAMILY_PROFILES[0]);
  const [activeSynapsePulse, setActiveSynapsePulse] = useState<string | null>(null);
  const [activeTargetNodeId, setActiveTargetNodeId] = useState<string | null>(null);

  const pulseTimeoutRef = useRef<any>(null);
  const speechSafetyTimeoutRef = useRef<any>(null);

  // Estado de Análise de Sentimento em Tempo Real (Carga Emocional das Sinapses)
  const [activeSentiment, setActiveSentiment] = useState<SentimentAnalysisResult | null>(null);

  // Configuração Universal de LLM (Gemini, Claude, OpenAI, DeepSeek, Groq, Mistral, Ollama)
  const [llmConfig, setLlmConfig] = useState<LLMProviderConfig>(() => llmService.getConfig());

  // Alerta Ativo de Agente Sentinela (Discreto e Dispensável)
  const [alertaSentinelaAtivo, setAlertaSentinelaAtivo] = useState<AgenteSentinela | null>(() => {
    const pendentes = microService.verificarAlertasAtivos();
    return pendentes.length > 0 ? pendentes[0] : null;
  });

  // Estados de Voz e Reconhecimento
  const [wakeWordActive, setWakeWordActive] = useState<boolean>(true);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isDictatingVoice, setIsDictatingVoice] = useState<boolean>(false);
  const [isOperationMode, setIsOperationMode] = useState<boolean>(false);
  const [isJarvisSpeaking, setIsJarvisSpeaking] = useState<boolean>(false);
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | null>(null);
  const [systemMenuExpanded, setSystemMenuExpanded] = useState<boolean>(false);
  const [showTextInput, setShowTextInput] = useState<boolean>(false);

  // Resposta do JARVIS (inicia vazio para tela limpa e desobstruída)
  const [jarvisResponseText, setJarvisResponseText] = useState<string | null>(null);

  // Entrada de Texto
  const [inputMessage, setInputMessage] = useState<string>('');
  const [loadingAI, setLoadingAI] = useState<boolean>(false);

  // Modais e Painéis
  const [agentRegistryModalOpen, setAgentRegistryModalOpen] = useState<boolean>(false);
  const [llmConfigModalOpen, setLlmConfigModalOpen] = useState<boolean>(false);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState<boolean>(false);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState<boolean>(false);
  const [datastoresModalOpen, setDatastoresModalOpen] = useState<boolean>(false);
  const [databaseExplainerOpen, setDatabaseExplainerOpen] = useState<boolean>(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState<boolean>(false);

  // Modo TV & Dispositivos
  const [tvMode, setTvMode] = useState<boolean>(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);

  // Configuração da Voz do Jarvis
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>(() =>
    voiceService.getConfig()
  );

  // Salvar memórias no LocalStorage para persistência contínua
  useEffect(() => {
    localStorage.setItem('jarvis_memories', JSON.stringify(memories));
  }, [memories]);

  // Capturar evento PWA beforeinstallprompt
  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallPWA = async () => {
    if (!installPromptEvent) {
      alert('Para instalar na sua Smart TV ou celular: no menu do navegador, clique em "Adicionar à Tela Inicial" ou "Instalar Aplicativo".');
      return;
    }
    installPromptEvent.prompt();
    const result = await installPromptEvent.userChoice;
    if (result.outcome === 'accepted') {
      setInstallPromptEvent(null);
    }
  };

  // Inicializar o Ouvinte da Wake-Word "Jarvis" em segundo plano (se não estiver no modo ditado)
  useEffect(() => {
    voiceService.updateConfig(voiceConfig);

    if (wakeWordActive && !isDictatingVoice) {
      voiceService.startWakeWordListening(
        (transcript, speaker) => {
          setActiveProfile(speaker);
          const raw = transcript.toLowerCase();
          const cleanCommand = raw.replace(/^.*jarvis\s*/i, '').trim();

          // Ao detectar Jarvis: entra imediatamente em modo de operação
          if (!cleanCommand || cleanCommand === 'olá' || cleanCommand === 'oi' || cleanCommand === 'você está aí') {
            entrarModoOperacao(speaker);
          } else {
            // Se já veio com o comando na mesma frase:
            setIsOperationMode(true);
            const emocao = SentimentEngine.analisar(cleanCommand);
            setActiveSentiment(emocao);
            dispararSinapse(`Comando: "${cleanCommand}"`);
            processarComandoJarvis(cleanCommand, speaker, emocao);
          }
        },
        undefined,
        (listeningState) => {
          setIsListening(listeningState);
        }
      );
    } else {
      voiceService.stopWakeWordListening();
    }

    return () => {
      voiceService.stopWakeWordListening();
    };
  }, [wakeWordActive, voiceConfig, isDictatingVoice]);

  // Auditoria contínua de sentinelas em segundo plano (Sinalização Pontual Isolada)
  useEffect(() => {
    const interval = setInterval(() => {
      const alertas = microService.verificarAlertasAtivos();
      if (alertas.length > 0 && (!alertaSentinelaAtivo || alertaSentinelaAtivo.id !== alertas[0].id)) {
        setAlertaSentinelaAtivo(alertas[0]);
        const emocaoAlerta = SentimentEngine.analisar('urgente risco oportunidade');
        setActiveSentiment(emocaoAlerta);
        // Sinaliza no cérebro pontualmente APENAS o arquivo menor/silo do ativo sob auditoria
        const targetId = `mem-${alertas[0].chaveParticao.toLowerCase()}`;
        dispararSinapsePontual(targetId, `Alerta Sentinela: ${alertas[0].nome}`);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [alertaSentinelaAtivo]);

  // Disparar animação de sinapse vermelha cirúrgica no cérebro 3D azul
  const dispararSinapsePontual = (targetId: string | null, label: string) => {
    if (pulseTimeoutRef.current) {
      clearTimeout(pulseTimeoutRef.current);
    }
    setActiveTargetNodeId(targetId);
    setActiveSynapsePulse(label);

    // Garantia de retorno automático ao repouso normal após 3.8s
    pulseTimeoutRef.current = setTimeout(() => {
      setActiveTargetNodeId(null);
      setActiveSynapsePulse(null);
    }, 3800);
  };

  const dispararSinapse = (label: string) => {
    dispararSinapsePontual(null, label);
  };

  // Forçar repouso neural imediato (salvaguarda de retorno ao normal)
  const forcarRepousoNeural = () => {
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    if (speechSafetyTimeoutRef.current) clearTimeout(speechSafetyTimeoutRef.current);
    setActiveTargetNodeId(null);
    setActiveSynapsePulse(null);
    setIsJarvisSpeaking(false);
    setIsDictatingVoice(false);
    setIsOperationMode(false);
    setAlertaSentinelaAtivo(null);
  };

  // =========================================================================
  // MODO DE OPERAÇÃO JARVIS: ENTRADA AUTOMÁTICA AO DETECTAR "JARVIS" OU CLIQUE
  // =========================================================================
  const entrarModoOperacao = async (speakerParam?: FamilyProfile) => {
    const speaker = speakerParam || activeProfile;
    setActiveProfile(speaker);
    setIsOperationMode(true);
    setVoiceErrorMessage(null);
    voiceService.playBeepSound();
    dispararSinapsePontual(null, 'Modo de Operação Jarvis Ativado');

    await voiceService.requestMicrophonePermission();

    voiceService.startDirectDictation({
      onStart: () => {
        setIsDictatingVoice(true);
        setIsOperationMode(true);
      },
      onInterim: (liveText) => {
        setInputMessage(liveText);
      },
      onFinal: (finalText, detectedSpeaker) => {
        setIsDictatingVoice(false);
        setIsOperationMode(false);
        setInputMessage(finalText);
        const finalSpeaker = detectedSpeaker || speaker;
        setActiveProfile(finalSpeaker);
        const emocao = SentimentEngine.analisar(finalText);
        setActiveSentiment(emocao);
        processarComandoJarvis(finalText, finalSpeaker, emocao);
      },
      onError: (errMsg) => {
        setIsDictatingVoice(false);
        setIsOperationMode(false);
        setVoiceErrorMessage(errMsg);
      },
      onEnd: () => {
        setIsDictatingVoice(false);
      },
    });
  };

  const handleMicrophoneClick = async () => {
    if (isDictatingVoice || isOperationMode) {
      voiceService.stopDictation();
      setIsDictatingVoice(false);
      setIsOperationMode(false);
      return;
    }
    await entrarModoOperacao();
  };

  // Processar comando: Jarvis busca cirurgicamente o arquivo menor exato no cérebro
  const processarComandoJarvis = async (
    texto: string,
    speakerParam?: FamilyProfile,
    sentimentoParam?: SentimentAnalysisResult
  ) => {
    if (!texto.trim() || loadingAI) return;

    const speaker = speakerParam || activeProfile;
    const emocao = sentimentoParam || SentimentEngine.analisar(texto);
    setActiveSentiment(emocao);
    setLoadingAI(true);
    setVoiceErrorMessage(null);

    const lower = texto.toLowerCase();
    let targetNodeId: string | null = null;
    let labelSinapse = `Cognição Neural`;
    let particaoIsolada: MicroDatastoreParticionado | null = null;

    // 1. Identificar menção a ativos B3 / Cripto
    const tickersConhecidos = ['TAEE11', 'BBAS3', 'WEGE3', 'BTC', 'PETR4', 'VALE3', 'ITUB4', 'ELET3', 'CPLE6'];
    const tickerEncontrado = tickersConhecidos.find((t) => texto.toUpperCase().includes(t));

    if (tickerEncontrado) {
      particaoIsolada = microService.obterParticao(tickerEncontrado);
      if (!particaoIsolada) {
        particaoIsolada = microService.autoAlimentarOuCriar(tickerEncontrado, tickerEncontrado === 'BTC' ? 'cripto' : 'ativo_b3');
        agentService.createAgentForDatabase(tickerEncontrado, tickerEncontrado === 'BTC' ? 'cripto' : 'ativo_b3');
      }
      targetNodeId = `mem-${tickerEncontrado.toLowerCase()}`;
      labelSinapse = `Sinapse Cirúrgica: [Silo ${particaoIsolada.chave}]`;
    }
    // 2. Identificação pontual de Arquivos Menores Cotidianos
    else if (lower.includes('compras') || lower.includes('mercado') || lower.includes('supermercado') || lower.includes('despensa') || lower.includes('comprar') || lower.includes('leite') || lower.includes('café') || lower.includes('pão')) {
      targetNodeId = 'mem-compras';
      labelSinapse = 'Sinapse Cirúrgica: [Arquivo Menor: Lista de Compras]';
    } else if (lower.includes('agenda') || lower.includes('agendamento') || lower.includes('compromisso') || lower.includes('calendário') || lower.includes('marcar') || lower.includes('horário') || lower.includes('reunião')) {
      targetNodeId = 'mem-agenda';
      labelSinapse = 'Sinapse Cirúrgica: [Arquivo Menor: Agendamentos]';
    } else if (lower.includes('matheus') || lower.includes('dullius') || lower.includes('cfo')) {
      targetNodeId = 'mem-matheus';
      labelSinapse = 'Sinapse Cirúrgica: [Perfil: Matheus Dullius]';
    } else if (lower.includes('esposa') || lower.includes('marina') || lower.includes('cônjuge') || lower.includes('mãe') || lower.includes('mamãe')) {
      targetNodeId = 'mem-esposa';
      labelSinapse = 'Sinapse Cirúrgica: [Perfil: Cônjuge / Família]';
    } else if (lower.includes('filho') || lower.includes('filha') || lower.includes('criança') || lower.includes('escola')) {
      targetNodeId = 'mem-filhos';
      labelSinapse = 'Sinapse Cirúrgica: [Perfil: Filhos & Dependentes]';
    } else if (lower.includes('saúde') || lower.includes('médico') || lower.includes('vacina') || lower.includes('pediatra') || lower.includes('remédio') || lower.includes('exame')) {
      targetNodeId = 'mem-saude';
      particaoIsolada = microService.obterParticao('SAUDE_FAMILIA');
      labelSinapse = 'Sinapse Cirúrgica: [Arquivo Menor: Saúde Familiar]';
    } else if (lower.includes('portão') || lower.includes('segurança') || lower.includes('casa')) {
      targetNodeId = 'mem-seguranca';
      labelSinapse = 'Sinapse Cirúrgica: [Arquivo Menor: Segurança Residencial]';
    } else {
      labelSinapse = `Cognição Central: "${texto.slice(0, 30)}..."`;
    }

    // Sinalizar no cérebro 3D azul exclusivamente o nó menor alvo
    dispararSinapsePontual(targetNodeId, labelSinapse);

    try {
      const res = await fetch('/api/brain/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagem: texto,
          speaker: {
            name: speaker.name,
            role: speaker.role,
          },
          bancoIsolado: particaoIsolada
            ? {
                chave: particaoIsolada.chave,
                dados: particaoIsolada.dados,
                sentinela: particaoIsolada.agenteSentinela.nome,
              }
            : null,
          memoriasContexto: memories.slice(0, 8),
          llmConfig: UniversalLLMService.getInstance().getConfig(),
        }),
      });

      const data = await res.json();
      let resposta = data.resposta || 'Comando assimilado pelo cérebro.';

      if (data.targetNodeId && !targetNodeId) {
        targetNodeId = data.targetNodeId;
        dispararSinapsePontual(targetNodeId, `Sinapse Cirúrgica: [${targetNodeId}]`);
      }

      if (particaoIsolada && particaoIsolada.agenteSentinela.alertaVigente) {
        resposta += ` [Aviso do ${particaoIsolada.agenteSentinela.nome}: ${particaoIsolada.agenteSentinela.alertaVigente}]`;
      }

      setJarvisResponseText(resposta);

      if (data.novaMemoria) {
        adicionarNovaMemoria({
          title: data.novaMemoria.title || 'Registro Neural',
          content: data.novaMemoria.content || texto,
          category: (data.novaMemoria.category as any) || 'rotina',
          user: speaker.name,
          timestamp: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
          importance: 'alta',
          color: 0xef4444, // Sinapse vermelha pontual
          sentiment: emocao.sentimento,
        });
      }

      setIsJarvisSpeaking(true);

      // Timeout de segurança proporcional para NUNCA travar o cérebro
      const maxSpeechMs = Math.min(6500, Math.max(3000, resposta.split(' ').length * 280));
      if (speechSafetyTimeoutRef.current) clearTimeout(speechSafetyTimeoutRef.current);
      speechSafetyTimeoutRef.current = setTimeout(() => {
        setIsJarvisSpeaking(false);
      }, maxSpeechMs);

      voiceService.speak(resposta, () => {
        if (speechSafetyTimeoutRef.current) clearTimeout(speechSafetyTimeoutRef.current);
        setIsJarvisSpeaking(false);
      });
    } catch (err) {
      console.warn('Falha na comunicação com o backend, utilizando salvaguarda local:', err);
      const erroMsg = 'Comando processado nos circuitos locais de salvaguarda do Jarvis.';
      setJarvisResponseText(erroMsg);
      voiceService.speak(erroMsg);
    } finally {
      setLoadingAI(false);
      setInputMessage('');
    }
  };

  // Adicionar uma nova memória diretamente no cérebro 3D
  const adicionarNovaMemoria = (
    mem: Omit<SynapseMemory, 'id' | 'coords' | 'firing' | 'connectionsCount'>
  ) => {
    let coords: [number, number, number] = [0, 0, 0];
    if (mem.category === 'investimento' || mem.category === 'cfo') {
      coords = [
        (Math.random() - 0.5) * 1.2,
        1.0 + Math.random() * 0.6,
        0.8 + Math.random() * 0.8,
      ];
    } else if (mem.category === 'saude') {
      coords = [1.2 + Math.random() * 0.4, 0.2 + Math.random() * 0.5, 0.2];
    } else {
      coords = [
        (Math.random() - 0.5) * 1.4,
        Math.random() * 0.8,
        (Math.random() - 0.5) * 1.5,
      ];
    }

    const nova: SynapseMemory = {
      ...mem,
      id: `mem-${Date.now()}`,
      coords,
      firing: true,
      connectionsCount: Math.floor(4 + Math.random() * 8),
      color: 0xef4444, // Sinapse vermelha
    };

    setMemories((prev) => [nova, ...prev]);
    dispararSinapse(`Nova Memória Gravada: "${mem.title}"`);
    voiceService.playBeepSound();
  };

  const excluirMemoria = (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    if (selectedMemory?.id === id) setSelectedMemory(null);
  };

  const currentProviderDef = llmService.getProviderDefinition(llmConfig.provider);

  return (
    <div
      className={`min-h-screen bg-[#020612] text-slate-100 flex flex-col font-sans transition-all duration-500 ${
        tvMode ? 'p-6 lg:p-10 text-lg' : 'p-3 sm:p-5'
      }`}
    >
      {/* ==================================================================== */}
      {/* 1. TOP HUD LIMPO E ELEGANTE (CÉREBRO AZUL + SINAPSES VERMELHAS)      */}
      {/* ==================================================================== */}
      {/* ==================================================================== */}
      {/* 1. TOP BAR ULTRA-LIMPO E EXPANSÍVEL (TOTALMENTE DESOBSTRUÍDO)         */}
      {/* ==================================================================== */}
      <header className="z-40 max-w-5xl w-full mx-auto relative mb-1">
        <div className="flex items-center justify-between gap-3 py-2 px-4 bg-slate-950/75 border border-cyan-500/25 rounded-2xl backdrop-blur-xl shadow-[0_0_25px_rgba(14,165,233,0.08)]">
          {/* Identidade JARVIS e Status Dinâmico */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <span
                className={`w-3 h-3 rounded-full absolute ${
                  isOperationMode || isDictatingVoice
                    ? 'animate-ping bg-red-400'
                    : 'animate-ping bg-cyan-400'
                }`}
              />
              <span
                className={`w-3 h-3 rounded-full shadow-lg ${
                  isOperationMode || isDictatingVoice
                    ? 'bg-red-500 shadow-[0_0_12px_#ef4444]'
                    : 'bg-cyan-400 shadow-[0_0_10px_#22d3ee]'
                }`}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tracking-[0.25em] font-mono text-cyan-400">
                JARVIS
              </span>
              <span className="text-[10px] font-mono text-slate-300 bg-slate-900/90 px-2.5 py-0.5 rounded-full border border-cyan-500/30">
                {isOperationMode ? '● Modo de Operação Ativo' : isListening ? 'Ouvindo: "Jarvis"' : 'Pronto'}
              </span>
            </div>
          </div>

          {/* Botão Único Expansível: Painel do Sistema & Agentes */}
          <button
            onClick={() => setSystemMenuExpanded(!systemMenuExpanded)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-cyan-950/50 text-cyan-300 border border-slate-700/60 hover:border-cyan-500/50 transition-all text-xs font-mono shadow-md active:scale-95"
            title="Expandir ferramentas, agentes e configurações"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline font-bold">Painel do Sistema</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                systemMenuExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Menu Expansível Desdobrável (Limpo, sem poluição da tela principal) */}
        {systemMenuExpanded && (
          <div className="mt-2 p-3.5 bg-slate-950/95 border border-cyan-500/40 rounded-2xl shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            {/* Ficheiro de Agentes */}
            <button
              onClick={() => {
                setAgentRegistryModalOpen(true);
                setSystemMenuExpanded(false);
              }}
              className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-red-950/40 border border-slate-800 hover:border-red-500/50 text-left transition-colors flex items-center gap-2 text-slate-200"
            >
              <Bot className="w-4 h-4 text-red-400 shrink-0" />
              <div>
                <div className="font-bold text-red-300">Ficheiro de Agentes</div>
                <div className="text-[10px] text-slate-400">Modificar lógicas</div>
              </div>
            </button>

            {/* Escolha Livre de Provedor LLM */}
            <button
              onClick={() => {
                setLlmConfigModalOpen(true);
                setSystemMenuExpanded(false);
              }}
              className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-500/50 text-left transition-colors flex items-center gap-2 text-slate-200"
            >
              <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <div className="font-bold text-cyan-300">Provedor de LLM</div>
                <div className="text-[10px] text-slate-400">{currentProviderDef.name.split(' ')[0]}</div>
              </div>
            </button>

            {/* Bancos Particionados Isolados */}
            <button
              onClick={() => {
                setDatastoresModalOpen(true);
                setSystemMenuExpanded(false);
              }}
              className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-500/50 text-left transition-colors flex items-center gap-2 text-slate-200"
            >
              <Database className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <div className="font-bold text-slate-200">Bancos por Ativo</div>
                <div className="text-[10px] text-slate-400">Partições isoladas</div>
              </div>
            </button>

            {/* Banco de Memórias */}
            <button
              onClick={() => {
                setMemoryPanelOpen(true);
                setSystemMenuExpanded(false);
              }}
              className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-500/50 text-left transition-colors flex items-center gap-2 text-slate-200"
            >
              <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <div className="font-bold text-slate-200">Memórias Sinápticas</div>
                <div className="text-[10px] text-slate-400">{memories.length} nós</div>
              </div>
            </button>

            {/* Perfil Familiar */}
            <button
              onClick={() => {
                setProfileDropdownOpen(true);
                setSystemMenuExpanded(false);
              }}
              className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-500/50 text-left transition-colors flex items-center gap-2 text-slate-200"
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: activeProfile.avatarColor }} />
              <div>
                <div className="font-bold text-slate-200">{activeProfile.name}</div>
                <div className="text-[10px] text-slate-400">Trocar perfil</div>
              </div>
            </button>

            {/* Configuração de Voz */}
            <button
              onClick={() => {
                setVoiceSettingsOpen(true);
                setSystemMenuExpanded(false);
              }}
              className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-500/50 text-left transition-colors flex items-center gap-2 text-slate-200"
            >
              <Sliders className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <div className="font-bold text-slate-200">Voz do Jarvis</div>
                <div className="text-[10px] text-slate-400">Tom e velocidade</div>
              </div>
            </button>

            {/* O que é o Banco de Dados */}
            <button
              onClick={() => {
                setDatabaseExplainerOpen(true);
                setSystemMenuExpanded(false);
              }}
              className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-500/50 text-left transition-colors flex items-center gap-2 text-slate-200"
            >
              <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <div className="font-bold text-slate-200">Entenda os Bancos</div>
                <div className="text-[10px] text-slate-400">Como funciona</div>
              </div>
            </button>

            {/* Modo TV e PWA */}
            <div className="flex gap-1.5">
              <button
                onClick={() => setTvMode(!tvMode)}
                className={`flex-1 p-2.5 rounded-xl border text-center transition-colors ${
                  tvMode
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-cyan-500/40'
                }`}
                title="Modo TV"
              >
                <Tv className="w-4 h-4 mx-auto mb-0.5 text-amber-400" />
                <span className="text-[10px]">TV</span>
              </button>
              <button
                onClick={handleInstallPWA}
                className="flex-1 p-2.5 rounded-xl bg-slate-900 hover:bg-cyan-950/60 text-cyan-400 border border-cyan-500/30 text-center transition-colors"
                title="Instalar App"
              >
                <Download className="w-4 h-4 mx-auto mb-0.5" />
                <span className="text-[10px]">Instalar</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Alerta Sentinela Discreto (Não obstrui o centro) */}
      {alertaSentinelaAtivo && (
        <div className="mt-2 mx-auto max-w-2xl w-full bg-red-950/70 border border-red-500/50 rounded-xl px-3.5 py-1.5 flex items-center justify-between text-xs text-red-200 shadow-md backdrop-blur-md animate-in slide-in-from-top-1 z-30">
          <div className="flex items-center gap-2 truncate">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0 animate-pulse" />
            <span className="font-bold text-white font-mono uppercase text-[11px]">
              [{alertaSentinelaAtivo.nome}]:
            </span>
            <span className="truncate text-slate-200">{alertaSentinelaAtivo.alertaVigente}</span>
          </div>
          <button
            onClick={() => setAlertaSentinelaAtivo(null)}
            className="text-[10px] text-red-400 hover:text-white px-1.5 py-0.5 rounded border border-red-500/30 shrink-0 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. CÉREBRO 3D AZUL COM SINAPSES VERMELHAS (TOTALMENTE DESOBSTRUÍDO) */}
      {/* ==================================================================== */}
      <main className="flex-1 flex flex-col justify-between my-2 relative">
        <div className="relative w-full flex-1 flex items-center justify-center min-h-[460px]">
          <RealisticBrainCanvas
            memories={memories}
            selectedMemory={selectedMemory}
            onSelectMemory={(mem) => setSelectedMemory(mem)}
            isJarvisSpeaking={isJarvisSpeaking}
            isListening={isListening || isDictatingVoice}
            activeSynapsePulse={activeSynapsePulse}
            activeTargetNodeId={activeTargetNodeId}
            activeSentiment={activeSentiment}
            tvMode={tvMode}
            onForceRest={forcarRepousoNeural}
          />
        </div>
      </main>

      {/* ==================================================================== */}
      {/* 3. RESPOSTA FLUTUANTE DO JARVIS (DISCRETA, SEM OBSTRUIR O CÉREBRO)   */}
      {/* ==================================================================== */}
      {jarvisResponseText && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 max-w-xl w-[92%] z-50 animate-in fade-in slide-in-from-top-3 duration-300 pointer-events-auto">
          <div className="bg-slate-950/90 border border-cyan-500/40 rounded-2xl p-4 shadow-[0_0_40px_rgba(14,165,233,0.22)] backdrop-blur-2xl relative">
            <button
              onClick={() => setJarvisResponseText(null)}
              className="absolute top-2.5 right-2.5 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Fechar resposta"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 mb-1.5 text-xs font-mono uppercase font-bold tracking-wider text-cyan-400">
              <span className="w-2 h-2 rounded-full animate-ping bg-cyan-400" />
              <span>JARVIS</span>
              {isJarvisSpeaking && (
                <span className="text-[10px] text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                  <Volume2 className="w-3 h-3 animate-pulse" />
                  Vocalizando
                </span>
              )}
            </div>
            <p className="text-slate-100 text-sm leading-relaxed pr-6 font-sans">
              "{jarvisResponseText}"
            </p>
          </div>
        </div>
      )}

      {/* Aviso discreto caso o navegador bloqueie permissão de microfone */}
      {voiceErrorMessage && (
        <div className="max-w-md w-[90%] mx-auto mb-2 p-3 bg-amber-950/80 border border-amber-500/50 rounded-xl text-xs text-amber-200 flex items-start gap-2 animate-in fade-in z-30">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{voiceErrorMessage}</p>
          </div>
          <button
            onClick={() => setVoiceErrorMessage(null)}
            className="text-amber-400 hover:text-white text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. CONSOLE CENTRAL: APENAS O MICROFONE E MODO DE OPERAÇÃO DO JARVIS */}
      {/* ==================================================================== */}
      <footer className="z-30 pb-5 pt-2 flex flex-col items-center justify-center relative">
        {/* Transcrição em tempo real (Fita flutuante quando o usuário fala) */}
        {isDictatingVoice && inputMessage && (
          <div className="mb-3 px-4 py-1.5 rounded-full bg-slate-950/90 border border-cyan-500/50 text-cyan-200 text-xs font-mono backdrop-blur-md shadow-lg animate-in fade-in slide-in-from-bottom-2 max-w-lg text-center truncate">
            "{inputMessage}"
          </div>
        )}

        {/* Botão de Microfone Central Futurista com Anéis Acústicos */}
        <div className="relative flex flex-col items-center">
          {/* Anéis de Energia Acústica Holográfica */}
          {isDictatingVoice || isOperationMode ? (
            <>
              <div className="absolute inset-0 -m-5 rounded-full border-2 border-red-500/50 animate-ping pointer-events-none" />
              <div className="absolute inset-0 -m-2 rounded-full border border-red-400/60 animate-pulse pointer-events-none" />
            </>
          ) : (
            <div className="absolute inset-0 -m-3 rounded-full border border-cyan-500/20 animate-pulse pointer-events-none" />
          )}

          <button
            type="button"
            onClick={handleMicrophoneClick}
            className={`relative group p-5 sm:p-6 rounded-full transition-all duration-300 shadow-2xl active:scale-95 flex items-center justify-center cursor-pointer ${
              isDictatingVoice || isOperationMode
                ? 'bg-gradient-to-tr from-red-600 via-rose-500 to-amber-500 text-white shadow-[0_0_50px_rgba(239,68,68,0.7)] scale-110'
                : 'bg-gradient-to-tr from-cyan-600 via-sky-500 to-blue-600 text-white shadow-[0_0_35px_rgba(14,165,233,0.35)] hover:shadow-[0_0_45px_rgba(14,165,233,0.55)] hover:scale-105'
            }`}
            title={
              isDictatingVoice || isOperationMode
                ? 'Modo de Operação Ativo - Clique para concluir comando'
                : 'Clique ou diga "Jarvis" para entrar em modo de operação'
            }
          >
            {isDictatingVoice || isOperationMode ? (
              <Mic className="w-8 h-8 sm:w-9 sm:h-9 animate-pulse" />
            ) : (
              <Mic className="w-8 h-8 sm:w-9 sm:h-9" />
            )}
          </button>

          {/* Legenda Operacional Minimalista */}
          <div className="mt-3 text-center pointer-events-none">
            {isDictatingVoice || isOperationMode ? (
              <p className="text-xs font-mono font-bold text-red-400 tracking-wider flex items-center justify-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                MODO DE OPERAÇÃO ATIVO • ESCUTANDO...
              </p>
            ) : (
              <p className="text-xs font-mono text-slate-400 tracking-wide">
                Diga <strong className="text-cyan-400 font-bold">"Jarvis"</strong> ou clique para operar
              </p>
            )}
          </div>

          {/* Fallback Ultradiscreto de Entrada por Teclado (Oculto por padrão) */}
          <div className="mt-2">
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className="text-slate-600 hover:text-slate-400 transition-colors p-1"
              title="Alternar digitação por texto"
            >
              <Keyboard className="w-3.5 h-3.5 opacity-35 hover:opacity-100" />
            </button>
          </div>
        </div>

        {/* Input de texto exibido apenas se acionado pelo ícone de teclado */}
        {showTextInput && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!inputMessage.trim()) return;
              const emocao = SentimentEngine.analisar(inputMessage);
              setActiveSentiment(emocao);
              processarComandoJarvis(inputMessage, activeProfile, emocao);
              setInputMessage('');
              setShowTextInput(false);
            }}
            className="mt-3 flex items-center gap-2 max-w-md w-full px-3 py-1.5 bg-slate-950/90 border border-slate-800 rounded-xl animate-in fade-in"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Digite o comando para o Jarvis..."
              className="flex-1 bg-transparent text-xs text-slate-100 focus:outline-none font-sans"
              autoFocus
            />
            <button
              type="submit"
              disabled={loadingAI || !inputMessage.trim()}
              className="p-1.5 rounded-lg bg-cyan-600 text-white text-xs disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </footer>

      {/* ==================================================================== */}
      {/* 5. MODAL EXPLICATIVO: O QUE SÃO OS BANCOS DE DADOS COMPARTIMENTADOS? */}
      {/* ==================================================================== */}
      {databaseExplainerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setDatabaseExplainerOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-mono uppercase tracking-wide">
                  O que é esse "Banco de Dados" Compartimentado?
                </h3>
                <p className="text-xs text-cyan-400 font-mono">Analogia Prática das Gavetas Exclusivas</p>
              </div>
            </div>

            <div className="space-y-4 text-xs text-slate-300 leading-relaxed font-sans">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <h4 className="font-bold text-cyan-300 mb-1">📁 O Problema do "Caderno Único":</h4>
                <p>
                  Se o Jarvis guardasse tudo (suas ações da Taesa, Bitcoin, consultas médicas, vacinas das crianças e compras) num único bloco gigante de 10.000 páginas, toda vez que você fizesse uma pergunta simples, ele teria que ler tudo do início ao fim. Isso é lento, custoso e propenso a misturar assuntos.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-cyan-500/30">
                <h4 className="font-bold text-cyan-300 mb-1">⚡ A Solução: Gavetas Exclusivas e Lacradas</h4>
                <p>
                  Criamos um <strong>banco de dados isolado (particionado)</strong> para cada ativo ou assunto específico.
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-slate-300">
                  <li><strong>Gaveta TAEE11:</strong> Guarda apenas preços, margens de Bazin e dividendos da Taesa.</li>
                  <li><strong>Gaveta BBAS3:</strong> Guarda relatórios e múltiplos do Banco do Brasil.</li>
                  <li><strong>Gaveta BTC:</strong> Guarda cotações e suporte técnico de criptoativos.</li>
                  <li><strong>Gaveta SAÚDE_FAMILIA:</strong> Guarda o histórico médico de Matheus, esposa e filhos.</li>
                </ul>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-red-500/30">
                <h4 className="font-bold text-red-400 mb-1">🤖 Agentes Sentinelas e Autocriação:</h4>
                <p>
                  Cada gaveta tem seu próprio <strong>Agente Especialista</strong> trabalhando 24 horas por dia. Se amanhã você falar: <em>"Jarvis, comprei ações da Petrobras PETR4"</em>, o Jarvis <strong>autocria na hora a gaveta PETR4</strong> e designa um novo agente para vigiá-la, disparando sinapses vermelhas quando encontrar alertas importantes!
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  setDatabaseExplainerOpen(false);
                  setDatastoresModalOpen(true);
                }}
                className="flex-1 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
              >
                <Database className="w-4 h-4" /> Ver Silos & Log de Status em Tempo Real
              </button>
              <button
                onClick={() => setDatabaseExplainerOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs font-mono transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. MODAIS E PAINÉIS DE CONFIGURAÇÃO                                  */}
      {/* ==================================================================== */}
      {/* Modal: Ficheiro de Agentes e Modificação de Lógica */}
      <AgentRegistryModal
        isOpen={agentRegistryModalOpen}
        onClose={() => setAgentRegistryModalOpen(false)}
        onTriggerSynapse={dispararSinapse}
      />

      {/* Modal: Seleção Livre de LLM / IA Universal */}
      <LLMConfigModal
        isOpen={llmConfigModalOpen}
        onClose={() => setLlmConfigModalOpen(false)}
        onConfigSaved={(novaCfg) => {
          setLlmConfig(novaCfg);
          dispararSinapse(`IA Atualizada: ${novaCfg.provider.toUpperCase()} (${novaCfg.model})`);
        }}
      />

      {/* Modal: Voz do Jarvis */}
      <VoiceSettingsModal
        isOpen={voiceSettingsOpen}
        onClose={() => setVoiceSettingsOpen(false)}
        config={voiceConfig}
        onSaveConfig={(newCfg) => setVoiceConfig(newCfg)}
      />

      {/* Modal: Sinapses e Memórias */}
      <SynapseMemoryPanel
        isOpen={memoryPanelOpen}
        onClose={() => setMemoryPanelOpen(false)}
        memories={memories}
        onAddMemory={adicionarNovaMemoria}
        onDeleteMemory={excluirMemoria}
        onSelectMemory={(m) => {
          setSelectedMemory(m);
          const emocao = SentimentEngine.analisar(m.content);
          setActiveSentiment(emocao);
          setJarvisResponseText(`Sinapse acessada: ${m.title} — ${m.content}`);
          voiceService.speak(m.content);
        }}
        activeProfile={activeProfile}
      />

      {/* Modal: Bancos Isolados */}
      <MicroDatastoresModal
        isOpen={datastoresModalOpen}
        onClose={() => setDatastoresModalOpen(false)}
        onSelectPartition={(ds) => {
          const comando = `Jarvis, auditar o banco particionado de ${ds.chave}.`;
          setInputMessage(comando);
          const emocao = SentimentEngine.analisar(comando);
          setActiveSentiment(emocao);
          processarComandoJarvis(comando, activeProfile, emocao);
        }}
        onAlertTriggered={(agente) => {
          setAlertaSentinelaAtivo(agente);
          dispararSinapse(`Alerta Disparado: ${agente.nome}`);
        }}
      />
    </div>
  );
}
