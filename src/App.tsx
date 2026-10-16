import React, { useState, useEffect, useRef } from 'react';
import { RealisticBrainCanvas } from './components/RealisticBrainCanvas';
import { VoiceSettingsModal } from './components/VoiceSettingsModal';
import { SynapseMemoryPanel } from './components/SynapseMemoryPanel';
import { MicroDatastoresModal } from './components/MicroDatastoresModal';
import { AgentRegistryModal } from './components/AgentRegistryModal';
import { LLMConfigModal } from './components/LLMConfigModal';
import { CfoDecisionsModal } from './components/CfoDecisionsModal';
import { AuthLockScreen } from './components/AuthLockScreen';
import { SecuritySettingsModal } from './components/SecuritySettingsModal';
import { authService } from './services/authService';
import { cfoDecisionService } from './services/cfoDecisionService';
import { INITIAL_SYNAPSE_MEMORIES } from './data/synapseMemories';
import {
  SynapseMemory,
  FamilyProfile,
  FAMILY_PROFILES,
  VoiceConfig,
  SentimentAnalysisResult,
  MicroDatastoreParticionado,
  AgenteSentinela,
  LLMProviderConfig,
  AgentDefinition,
  AgentNerveSignal,
  BodyPartAnatomy,
} from './types/neural';
import { JarvisVoiceService } from './services/jarvisVoice';
import { SentimentEngine } from './services/sentimentEngine';
import { MicroDatastoresService } from './services/microDatastores';
import { AgentRegistryService, BODY_PARTS_CONFIG } from './services/agentRegistry';
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
  Keyboard,
  Trash2,
  History,
  Lock,
  Shield,
  User,
  Wrench,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { ApiSyncService, MultiApiSyncReport } from './services/apiSyncService';

export default function App() {
  const microService = MicroDatastoresService.getInstance();
  const agentService = AgentRegistryService.getInstance();
  const llmService = UniversalLLMService.getInstance();
  const voiceService = JarvisVoiceService.getInstance();
  const apiSyncService = ApiSyncService.getInstance();

  // Sistema de Proteção & Autenticação (Usuário padrão: matheus_dulius@hotmail.com / 123456)
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => authService.isAuthenticated());
  const [securityModalOpen, setSecurityModalOpen] = useState<boolean>(false);

  // Lista viva de agentes criados pelo usuário
  const [agentsList, setAgentsList] = useState<AgentDefinition[]>(() => agentService.listAgents());

  // Sinalização Neural viva nos nervos do corpo (Moléculas Vermelhas / Vesícula Amarela)
  const [activeNerveSignal, setActiveNerveSignal] = useState<AgentNerveSignal | null>(null);

  // Relatório de Sincronização Universal de APIs
  const [apiSyncReport, setApiSyncReport] = useState<MultiApiSyncReport | null>(() => apiSyncService.getLastReport());
  const [isSyncingApis, setIsSyncingApis] = useState<boolean>(false);

  useEffect(() => {
    const unsub = agentService.subscribeNerveSignal((sig) => {
      setActiveNerveSignal(sig);
    });

    const unsubApi = apiSyncService.subscribe((rep) => {
      setApiSyncReport(rep);
    });

    // Sincronização viva quando o usuário criar agentes na página agents.html
    const handleSyncAgents = () => {
      setAgentsList(agentService.listAgents());
    };
    window.addEventListener('storage', handleSyncAgents);
    const handleMsg = (ev: MessageEvent) => {
      if (ev.data?.type === 'AGENTS_UPDATED') handleSyncAgents();
    };
    window.addEventListener('message', handleMsg);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('jarvis_agent_sync');
      bc.onmessage = handleSyncAgents;
    } catch {}

    return () => {
      unsub();
      unsubApi();
      window.removeEventListener('storage', handleSyncAgents);
      window.removeEventListener('message', handleMsg);
      if (bc) bc.close();
    };
  }, []);

  // Estado das Memórias e Sinapses Neurais (Sanitização estrita para NUNCA sair da cabeça!)
  const [memories, setMemories] = useState<SynapseMemory[]>(() => {
    const saved = localStorage.getItem('jarvis_memories');
    if (!saved) return [];
    try {
      const parsed: SynapseMemory[] = JSON.parse(saved);
      const preconfigured = new Set([
        'mem-compras', 'mem-agenda', 'mem-matheus', 'mem-esposa', 'mem-filhos',
        'mem-b3', 'mem-bbas3', 'mem-taee11', 'mem-itub4', 'mem-vale3',
        'mem-btc', 'mem-saude', 'mem-seguranca', 'mem-investimentos', 'mem-financas',
        'mem-familia', 'mem-rotina', 'mem-wege3', 'mem-cfo'
      ]);
      const limpas = parsed
        .filter((m) => !preconfigured.has(m.id) && !m.id.startsWith('mem-pre-') && !m.id.includes('mock'))
        .map((m) => {
          // CORREÇÃO CRÍTICA: Se a memória estiver fora do cérebro ou tiver cor vermelha antiga, normalizar para o interior da cabeça
          const dist = Math.hypot(m.coords?.[0] || 0, m.coords?.[1] || 0, m.coords?.[2] || 0);
          if (dist > 0.30 || Math.abs(m.coords?.[1] || 0) > 0.22 || isNaN(dist) || !m.coords) {
            const u = Math.random();
            const v = Math.random();
            const theta = u * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * v - 1.0);
            const r = Math.cbrt(Math.random()) * 0.22;
            m.coords = [
              r * Math.sin(phi) * Math.cos(theta) * 0.85,
              r * Math.sin(phi) * Math.sin(theta) * 0.72,
              r * Math.cos(phi) * 0.85,
            ];
          }
          // Garante cor azul/ciano bioluminescente (elimina nós vermelhos flutuando acima da cabeça)
          if (m.color === 0xef4444 || !m.color) {
            m.color = 0x00f5ff;
          }
          return m;
        });
      return limpas;
    } catch {
      return [];
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

  // Alerta Ativo de Agente Sentinela (Inicia estritamente nulo sem alertas pré-configurados)
  const [alertaSentinelaAtivo, setAlertaSentinelaAtivo] = useState<AgenteSentinela | null>(null);

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
  const [cfoDecisionsModalOpen, setCfoDecisionsModalOpen] = useState<boolean>(false);

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

  // Sincronização em Múltiplos Endereços de API diferentes para o JARVIS
  const handleSincronizarTodasApis = async () => {
    setIsSyncingApis(true);
    try {
      const rep = await apiSyncService.syncAllEndpoints();
      setApiSyncReport(rep);
      voiceService.playBeepSound();
      setJarvisResponseText(
        `Todos os ${rep.totalEndpoints} endereços de API sincronizados com sucesso (${rep.syncedEndpoints}/${rep.totalEndpoints} ativos). Latência média de ${rep.averageLatencyMs}ms.`
      );
      setIsJarvisSpeaking(true);
      setTimeout(() => setIsJarvisSpeaking(false), 4500);
    } catch (e) {
      console.warn('Erro ao sincronizar APIs:', e);
    } finally {
      setIsSyncingApis(false);
    }
  };

  // Interação Somática com o Corpo Humano: a LLM controla, aprende e grava na memória do cérebro
  const handleBodyInteraction = async (bodyPart: BodyPartAnatomy, agent?: AgentDefinition) => {
    const partConfig = BODY_PARTS_CONFIG[bodyPart];
    const parteLabel = partConfig?.label || bodyPart;

    // 1. Sinal eferente: Fótons descem do Cérebro pela Medula Espinhal até o membro
    agentService.emitNerveSignal({
      id: `sig-cmd-${Date.now()}`,
      agentId: agent?.id || `somatic-${bodyPart}`,
      agentName: agent?.name || parteLabel,
      bodyPart,
      direction: 'BRAIN_TO_AGENT',
      colorHex: 0x00f5ff,
      message: `Comando da LLM -> ${parteLabel} (Descendo pela Medula Espinhal)`,
      timestamp: Date.now(),
    });

    voiceService.playBeepSound();
    setJarvisResponseText(`Disparando controle somático em ${parteLabel}. Impulso eferente descendo pelo canal medular...`);

    // 2. Sinal aferente: Resposta somática sobe pela Medula Espinhal e entra no Cérebro
    setTimeout(() => {
      agentService.emitNerveSignal({
        id: `sig-resp-${Date.now()}`,
        agentId: agent?.id || `somatic-${bodyPart}`,
        agentName: agent?.name || parteLabel,
        bodyPart,
        direction: 'AGENT_TO_BRAIN',
        colorHex: 0xfacc15,
        message: `Feedback somático [${parteLabel}] -> Medula Espinhal -> Cérebro`,
        timestamp: Date.now(),
      });

      // 3. A LLM aprende e grava a experiência na memória profunda dentro do cérebro
      const titulo = agent
        ? `Controle & Aprendizado: ${agent.name} (${parteLabel})`
        : `Aprendizado Somático: ${parteLabel}`;
      const conteudo = agent
        ? `Nó cibernético ${agent.name} auditado com sucesso. Agente ativo no corpo humano em ${parteLabel}. Silo: ${agent.targetDatabase}. Resposta aferente integrada ao córtex cerebral.`
        : `Estímulo proprioceptivo e neuromotor concluído em ${parteLabel}. Trânsito pela medula espinhal íntegro e gravado no córtex.`;

      adicionarNovaMemoria({
        title: titulo,
        category: 'investimento',
        content: conteudo,
        user: 'LLM Autônoma (Controle Somático)',
        timestamp: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
        importance: 'alta',
        color: 0x00f5ff,
        sentiment: 'analitico_racional',
        isAutonomousLLM: true,
        tokenPreservation: {
          originalTokensEstimated: 2800,
          preservedTokensEstimated: 45,
          compressionRatio: '98.4%',
          rationale: 'Síntese de feedback neural somático para memória perene.',
        },
      });

      setJarvisResponseText(
        `Interação neural estabelecida com ${parteLabel}. O sinal sináptico passou pela medula espinhal, foi processado pelo córtex e gravado com sucesso na memória dentro do cérebro.`
      );
      setIsJarvisSpeaking(true);
      setTimeout(() => setIsJarvisSpeaking(false), 5000);
    }, 700);
  };

  // Adicionar uma nova memória diretamente no cérebro 3D (Estritamente dentro do Córtex Craniano)
  const adicionarNovaMemoria = (
    mem: Omit<SynapseMemory, 'id' | 'coords' | 'firing' | 'connectionsCount'>
  ) => {
    // Coordenadas calculadas estritamente dentro da elipse do cérebro craniano (raio <= 0.18)
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = Math.cbrt(Math.random()) * 0.18;
    const coords: [number, number, number] = [
      r * Math.sin(phi) * Math.cos(theta) * 0.85,
      r * Math.sin(phi) * Math.sin(theta) * 0.70,
      r * Math.cos(phi) * 0.85,
    ];

    const nova: SynapseMemory = {
      ...mem,
      id: `mem-${Date.now()}`,
      coords,
      firing: true,
      connectionsCount: Math.floor(4 + Math.random() * 8),
      color: mem.color && mem.color !== 0xef4444 ? mem.color : 0x00f5ff, // Bioluminescência Ciano/Azul (NUNCA vermelho na cabeça)
    };

    setMemories((prev) => [nova, ...prev]);
    dispararSinapsePontual(nova.id, `Novo Dado Registrado: "${mem.title}"`);
    voiceService.playBeepSound();
  };

  const excluirMemoria = (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    if (selectedMemory?.id === id) setSelectedMemory(null);
  };

  // Executor Central de Ações Autônomas da LLM (Criação e Exclusão Irrestrita de Agentes e Memórias)
  const executarAcoesAutonomas = (actions: {
    createdAgents?: Array<{
      name: string;
      role: string;
      targetDatabase: string;
      logic: string;
      cognitiveEvaluation?: {
        objective: string;
        requiredInformation: string[];
        whatToRequest: string[];
        evaluationRationale: string;
        targetAssetClass?: string;
      };
    }>;
    deletedAgents?: Array<{ id?: string; name?: string }>;
    createdMemories?: Array<{
      title: string;
      category: string;
      content: string;
      user?: string;
      isAutonomousLLM?: boolean;
      tokenPreservation?: {
        originalTokensEstimated: number;
        preservedTokensEstimated: number;
        compressionRatio: string;
        rationale: string;
      };
      autonomousNeedReason?: string;
    }>;
    deletedMemories?: Array<{ id?: string; termo?: string }>;
    requestedApiData?: Array<{
      agentName: string;
      targetDatabase: string;
      protocol: 'API' | 'MCP' | 'JSON_FEED';
      dadosNecessarios: string[];
      motivo: string;
    }>;
    transcriptions?: Array<{
      agentName: string;
      targetDatabase: string;
      protocol?: 'API' | 'MCP' | 'JSON_FEED';
      dadosTranscritos: Record<string, any>;
      veredito?: 'COMPRAR' | 'AGUARDAR' | 'QUARENTENA' | 'ESTAVEL' | 'ALERTA' | 'OK';
      detalhes?: string;
      tokensOriginais?: number;
      tokensPreservados?: number;
      sinteseMemoria?: string;
    }>;
    bodyInteractions?: Array<{
      bodyPart: string;
      action: 'controlar' | 'aprender' | 'estimular';
      sensoryFeedback?: string;
      learnedInsight?: string;
      gravouMemoria?: boolean;
      tituloMemoria?: string;
      conteudoMemoria?: string;
    }>;
    apiSyncRequested?: boolean;
  }) => {
    if (!actions) return;

    // 1. Criação Autônoma de Agentes
    if (actions.createdAgents && actions.createdAgents.length > 0) {
      actions.createdAgents.forEach((ag) => {
        const dbKey = (ag.targetDatabase || 'GERAL').toUpperCase().trim();
        microService.autoAlimentarOuCriar(dbKey, 'ativo_b3');
        agentService.registerAgent({
          id: `agente-auto-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          name: ag.name,
          role: ag.role,
          targetDatabase: dbKey,
          logic: ag.logic,
          llmProvider: 'global',
          model: 'padrão-sistema',
          status: 'ativo',
          lastAuditVerdict: 'ESTAVEL',
          lastAuditDetails: 'Agente criado por autonomia executiva da LLM após avaliação de necessidades de informação.',
          lastAuditDate: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
          triggers: ['Alerta de Parâmetros', 'Disparo de Sinapse'],
          isAutonomous: true,
          createdAt: new Date().toLocaleDateString('pt-BR'),
          author: 'LLM Autônoma (Avaliação Cognitiva)',
          cognitiveEvaluation: ag.cognitiveEvaluation,
        });

        // Registrar na Auditoria Executiva do CFO
        cfoDecisionService.registrarDecisao({
          tipoAcao: 'CRIACAO_AGENTE',
          titulo: `Criação Autônoma do Agente: ${ag.name}`,
          ativoOuAlvo: dbKey,
          categoria:
            dbKey === 'BTC'
              ? 'CRIPTOATIVOS'
              : dbKey.includes('TESOURO')
              ? 'TESOURO DIRETO'
              : dbKey.includes('COMMODITIES')
              ? 'COMMODITIES'
              : 'AÇÕES B3',
          impacto: 'ALTO',
          justificativaLogica:
            ag.cognitiveEvaluation?.evaluationRationale ||
            ag.logic ||
            `Criação deliberada pelo CFO autônomo para o banco particionado ${dbKey} com foco na avaliação fundamentalista decenal de 10 anos.`,
          detalhesExecutivos: `Papel: ${ag.role}. Silo: ${dbKey}. Informações necessárias avaliadas: ${ag.cognitiveEvaluation?.requiredInformation?.join('; ') || 'Séries decenais'}. O que pedir: ${ag.cognitiveEvaluation?.whatToRequest?.join('; ') || 'Auditoria'}.`,
          targetNodeId: `mem-${dbKey.toLowerCase()}`,
          autor: 'LLM Autônoma (Avaliação Cognitiva)',
          status: 'EXECUTADO',
          reversivel: true,
          parametros: {
            horizonte: '10 anos',
            motivo: `Alocação de especialista para ${dbKey}`,
            informacoesNecessarias: ag.cognitiveEvaluation?.requiredInformation,
            oquePedirParaAgente: ag.cognitiveEvaluation?.whatToRequest,
          },
        });

        dispararSinapsePontual(null, `Agente Criado pela LLM: ${ag.name}`);
      });
    }

    // 2. Exclusão Autônoma de Agentes (liberdade total sem restrições)
    if (actions.deletedAgents && actions.deletedAgents.length > 0) {
      actions.deletedAgents.forEach((ag) => {
        const idOrName = ag.id || ag.name;
        if (idOrName) {
          agentService.deleteAgentByNameOrId(idOrName);

          // Registrar na Auditoria Executiva do CFO
          cfoDecisionService.registrarDecisao({
            tipoAcao: 'EXCLUSAO_AGENTE',
            titulo: `Exclusão Autônoma do Agente: ${ag.name || idOrName}`,
            ativoOuAlvo: ag.name || idOrName,
            categoria: 'SISTEMA_NEURAL',
            impacto: 'ALTO',
            justificativaLogica:
              'Agente removido pelo CFO após deliberação de redundância, obsolescência técnica ou inconformidade com as diretrizes decenais de preservação de capital e valuation Bazin.',
            detalhesExecutivos: `Remoção definitiva do ficheiro e encerramento de threads de sentinela para ${ag.name || idOrName}.`,
            targetNodeId: null,
            autor: 'CFO IA (Auditoria de Governança)',
            status: 'EXECUTADO',
            reversivel: false,
          });

          dispararSinapsePontual(null, `Agente Removido pela LLM: ${ag.name || idOrName}`);
        }
      });
    }

    // 3. Criação Autônoma de Memórias no Cérebro 3D (Zero Interferência Humana & Preservação de Tokens)
    if (actions.createdMemories && actions.createdMemories.length > 0) {
      actions.createdMemories.forEach((mem) => {
        const tokensPoupados = mem.tokenPreservation
          ? mem.tokenPreservation.originalTokensEstimated -
            mem.tokenPreservation.preservedTokensEstimated
          : 4200;

        adicionarNovaMemoria({
          title: mem.title || 'Memória Neural Destilada',
          category: (mem.category as any) || 'investimento',
          content: mem.content,
          user: mem.user || 'LLM Autônoma (Zero Interferência)',
          timestamp: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
          importance: 'alta',
          color: 0x00f5ff, // Bioluminescência ciano/azul (elimina nós vermelhos)
          sentiment: 'analitico_racional',
          isAutonomousLLM: true,
          tokenPreservation: mem.tokenPreservation || {
            originalTokensEstimated: 4500,
            preservedTokensEstimated: 75,
            compressionRatio: '98.3%',
            rationale: 'Condensação de dados históricos para poupar janela de contexto.',
          },
          autonomousNeedReason:
            mem.autonomousNeedReason ||
            'Memória sináptica criada pela LLM sem intervenção humana para preservar tokens.',
        });

        // Registrar na Auditoria Executiva do CFO
        cfoDecisionService.registrarDecisao({
          tipoAcao: 'CRIACAO_MEMORIA',
          titulo: `Gravação de Memória Neural: ${mem.title || 'Memória'}`,
          ativoOuAlvo: (mem.title || '').split(' ')[0] || 'CÉREBRO',
          categoria: 'SISTEMA_NEURAL',
          impacto: 'MEDIO',
          justificativaLogica: `Armazenamento autônomo sem interferência humana para preservação de tokens de contexto: ${mem.content}`,
          detalhesExecutivos: `Destilação semântica com economia estimada de ~${tokensPoupados} tokens. Nó sináptico gravado na categoria ${mem.category || 'investimento'}.`,
          targetNodeId: null,
          autor: 'LLM Autônoma (Zero Interferência)',
          status: 'EM_VIGOR',
          reversivel: true,
          parametros: {
            tokensEconomizados: tokensPoupados,
            motivo: mem.autonomousNeedReason || 'Preservação de tokens',
          },
        });
      });
    }

    // 4. Exclusão Autônoma de Memórias Obsoletas
    if (actions.deletedMemories && actions.deletedMemories.length > 0) {
      actions.deletedMemories.forEach((del) => {
        const termo = (del.termo || '').toLowerCase().trim();
        const id = del.id;
        setMemories((prev) =>
          prev.filter((m) => {
            if (id && m.id === id) return false;
            if (termo && (m.title.toLowerCase().includes(termo) || m.content.toLowerCase().includes(termo))) {
              return false;
            }
            return true;
          })
        );

        // Registrar na Auditoria Executiva do CFO
        cfoDecisionService.registrarDecisao({
          tipoAcao: 'EXCLUSAO_MEMORIA',
          titulo: `Purga Autônoma de Memória: ${del.termo || del.id || 'Nó Neural'}`,
          ativoOuAlvo: del.termo || del.id || 'MEMÓRIA',
          categoria: 'SISTEMA_NEURAL',
          impacto: 'MEDIO',
          justificativaLogica:
            'Purga sináptica executada pelo CFO para eliminar memórias obsoletas, preceitos desatualizados ou ruídos de curto prazo incompatíveis com o plano decenal.',
          detalhesExecutivos: `Nó expurgado dos circuitos neurais e persistência limpa.`,
          targetNodeId: null,
          autor: 'CFO IA (Purga Neural Autônoma)',
          status: 'EXECUTADO',
          reversivel: false,
        });

        dispararSinapsePontual(null, `Memória Purga pela LLM: ${del.termo || del.id}`);
      });
    }

    // 5. Requisições Ativas de Dados de API / MCP (IA solicitou insumos faltantes ao usuário)
    if (actions.requestedApiData && actions.requestedApiData.length > 0) {
      actions.requestedApiData.forEach((req) => {
        agentService.recordPendingDataRequest(req.agentName || req.targetDatabase, {
          protocol: req.protocol,
          requestedFields: req.dadosNecessarios,
          requestReason: req.motivo,
        });

        cfoDecisionService.registrarDecisao({
          tipoAcao: 'PEDIDO_DADOS_API_MCP',
          titulo: `IA Solicitou Dados de ${req.protocol}: ${req.agentName}`,
          ativoOuAlvo: req.targetDatabase,
          categoria:
            req.targetDatabase === 'BTC'
              ? 'CRIPTOATIVOS'
              : req.targetDatabase.includes('TESOURO')
              ? 'TESOURO DIRETO'
              : req.targetDatabase.includes('COMMODITIES')
              ? 'COMMODITIES'
              : 'AÇÕES B3',
          impacto: 'ALTO',
          justificativaLogica: `A IA avaliou que para auditar ou alimentar o agente ${req.agentName} faltam dados externos críticos.`,
          detalhesExecutivos: `Campos necessários solicitados ao usuário no chat: ${req.dadosNecessarios.join(', ')}. Motivo: ${req.motivo}.`,
          targetNodeId: `mem-${req.targetDatabase.toLowerCase()}`,
          autor: 'LLM Autônoma (Avaliação Cognitiva)',
          status: 'EM_VIGOR',
          reversivel: true,
          parametros: {
            informacoesNecessarias: req.dadosNecessarios,
            motivo: req.motivo,
          },
        });

        dispararSinapsePontual(null, `Solicitação de Dados MCP/API: ${req.agentName}`);
      });
    }

    // 6. Transcrições de Dados de API/MCP do Chat para o Agente Criado
    if (actions.transcriptions && actions.transcriptions.length > 0) {
      actions.transcriptions.forEach((tr) => {
        const dbKey = tr.targetDatabase.toUpperCase();
        microService.autoAlimentarOuCriar(dbKey, 'ativo_b3', tr.dadosTranscritos);

        const targetAgent = agentService.findAgentByIdOrTarget(tr.agentName || dbKey);
        if (targetAgent) {
          agentService.updateAgent(targetAgent.id, {
            status: tr.veredito === 'QUARENTENA' || tr.veredito === 'ALERTA' ? 'alerta' : 'ativo',
            lastAuditVerdict: tr.veredito || 'ESTAVEL',
            lastAuditDetails: tr.detalhes || `Dados da API/MCP transcritos via chat.`,
            lastAuditDate: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
            transcribedMcpData: {
              lastTranscriptionDate: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
              protocol: tr.protocol || 'MCP',
              rawSummary: tr.detalhes || 'Transcrição realizada via chat.',
              parsedMetrics: tr.dadosTranscritos,
              tokensEstimatedBefore: tr.tokensOriginais || 3200,
              tokensPreservedAfter: tr.tokensPreservados || 65,
            },
            pendingDataRequest: undefined,
          });
        }

        const economizados = (tr.tokensOriginais || 3200) - (tr.tokensPreservados || 65);

        // Se houver síntese de memória gerada na transcrição, cravar no cérebro 3D
        if (tr.sinteseMemoria) {
          adicionarNovaMemoria({
            title: `Síntese MCP: ${dbKey}`,
            category: 'investimento',
            content: tr.sinteseMemoria,
            user: 'LLM Autônoma (Zero Interferência)',
            timestamp: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
            importance: 'alta',
            color: 0x06b6d4,
            sentiment: 'analitico_racional',
            isAutonomousLLM: true,
            tokenPreservation: {
              originalTokensEstimated: tr.tokensOriginais || 3200,
              preservedTokensEstimated: tr.tokensPreservados || 65,
              compressionRatio: `${((economizados / (tr.tokensOriginais || 3200)) * 100).toFixed(1)}% de preservação`,
              rationale: `Payload bruto da API/MCP fornecido no chat condensado em nó sináptico compacto.`,
            },
            autonomousNeedReason: `Transcrição de dados do chat para o agente ${tr.agentName}. Economia de ~${economizados} tokens.`,
            particaoId: dbKey,
          });
        }

        // Registrar na Auditoria do CFO
        cfoDecisionService.registrarDecisao({
          tipoAcao: 'TRANSCRICAO_DADOS_API_MCP',
          titulo: `Transcrição de Dados API/MCP: ${tr.agentName || dbKey}`,
          ativoOuAlvo: dbKey,
          categoria:
            dbKey === 'BTC'
              ? 'CRIPTOATIVOS'
              : dbKey.includes('TESOURO')
              ? 'TESOURO DIRETO'
              : dbKey.includes('COMMODITIES')
              ? 'COMMODITIES'
              : 'AÇÕES B3',
          impacto: 'ALTO',
          justificativaLogica: `Dados fornecidos pelo usuário no chat foram transcritos e injetados diretamente no agente ${tr.agentName || dbKey}.`,
          detalhesExecutivos: `Veredito emitido: ${tr.veredito || 'ESTAVEL'}. Economia de tokens: ~${economizados}. Métricas: ${JSON.stringify(tr.dadosTranscritos)}.`,
          targetNodeId: `mem-${dbKey.toLowerCase()}`,
          autor: 'LLM Autônoma (Transcrição Chat)',
          status: 'EXECUTADO',
          reversivel: true,
          parametros: {
            tokensEconomizados: economizados,
            motivo: `Transcrição de dados para o agente ${tr.agentName}`,
          },
        });

        dispararSinapsePontual(null, `Dados MCP Transcritos para o Agente: ${tr.agentName || dbKey}`);
      });
    }

    // 5. Interações Somáticas com o Corpo (Controle, Aprendizado e Gravação no Cérebro)
    if (actions.bodyInteractions && actions.bodyInteractions.length > 0) {
      actions.bodyInteractions.forEach((bi) => {
        handleBodyInteraction(bi.bodyPart as BodyPartAnatomy);
      });
    }

    // 6. Sincronização em Múltiplos Endereços de API
    if (actions.apiSyncRequested) {
      handleSincronizarTodasApis();
    }
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

    // 1. Verificar se a mensagem invoca ou consulta um dos Agentes de IA criados no Ficheiro
    const createdAgents = agentService.listAgents();
    const matchingAgent = createdAgents.find((ag) => {
      const n = ag.name.toLowerCase();
      const r = ag.role.toLowerCase();
      const db = (ag.targetDatabase || '').toLowerCase();
      const bp = ag.bodyPart ? ag.bodyPart.replace('_', ' ').toLowerCase() : '';
      const bpLabel = ag.bodyPart ? (BODY_PARTS_CONFIG[ag.bodyPart]?.label || '').toLowerCase() : '';
      return (
        lower.includes(n) ||
        (db && db !== 'geral' && lower.includes(db)) ||
        (bp && lower.includes(bp)) ||
        (bpLabel && lower.includes(bpLabel)) ||
        (lower.includes('agente') && (lower.includes(n) || lower.includes(db)))
      );
    });

    if (matchingAgent) {
      const partConfig = BODY_PARTS_CONFIG[matchingAgent.bodyPart || 'coracao'];
      labelSinapse = `Invocação do Agente [${matchingAgent.name}] no(a) ${partConfig.label}`;
      dispararSinapsePontual(`agente-${matchingAgent.id}`, labelSinapse);

      try {
        // A. O AgentRegistryService emite o sinal BRAIN_TO_AGENT (moléculas vermelhas percorrendo o nervo)
        // e, ao responder, emite o sinal AGENT_TO_BRAIN (vesícula amarela de retorno)
        const agentChatResp = await agentService.chatWithAgent(matchingAgent.id, texto);
        const respostaFinal = `[LLM Central ⇄ Agente ${matchingAgent.name} (${partConfig.label})]: ${agentChatResp.resposta}`;

        setJarvisResponseText(respostaFinal);

        if (agentChatResp.autonomousActions) {
          executarAcoesAutonomas(agentChatResp.autonomousActions);
        }

        setIsJarvisSpeaking(true);
        const maxSpeechMs = Math.min(7500, Math.max(3000, respostaFinal.split(' ').length * 280));
        if (speechSafetyTimeoutRef.current) clearTimeout(speechSafetyTimeoutRef.current);
        speechSafetyTimeoutRef.current = setTimeout(() => {
          setIsJarvisSpeaking(false);
        }, maxSpeechMs);

        voiceService.speak(agentChatResp.resposta, () => {
          if (speechSafetyTimeoutRef.current) clearTimeout(speechSafetyTimeoutRef.current);
          setIsJarvisSpeaking(false);
        });

        setLoadingAI(false);
        setInputMessage('');
        return;
      } catch (errAg) {
        console.warn('Erro ao comunicar diretamente com o agente, prosseguindo com cognição central:', errAg);
      }
    }

    // 2. Identificar menção a ativos B3 / Cripto / Bazin
    const tickersConhecidos = ['TAEE11', 'BBAS3', 'WEGE3', 'BTC', 'PETR4', 'VALE3', 'ITUB4', 'ELET3', 'CPLE6'];
    let tickerEncontrado = tickersConhecidos.find((t) => texto.toUpperCase().includes(t));

    if (!tickerEncontrado) {
      if (lower.includes('taee') || lower.includes('taesa') || lower.includes('bazin')) {
        tickerEncontrado = 'TAEE11';
      } else if (lower.includes('bbas') || lower.includes('banco do brasil')) {
        tickerEncontrado = 'BBAS3';
      } else if (lower.includes('wege') || lower.includes('weg')) {
        tickerEncontrado = 'WEGE3';
      } else if (lower.includes('btc') || lower.includes('bitcoin')) {
        tickerEncontrado = 'BTC';
      } else if (lower.includes('petr') || lower.includes('petrobras')) {
        tickerEncontrado = 'PETR4';
      } else if (lower.includes('vale')) {
        tickerEncontrado = 'VALE3';
      } else if (lower.includes('itub') || lower.includes('itaú') || lower.includes('itau')) {
        tickerEncontrado = 'ITUB4';
      }
    }

    if (tickerEncontrado) {
      particaoIsolada = microService.obterParticao(tickerEncontrado);
      if (!particaoIsolada) {
        particaoIsolada = microService.autoAlimentarOuCriar(tickerEncontrado, tickerEncontrado === 'BTC' ? 'cripto' : 'ativo_b3');
        agentService.createAgentForDatabase(tickerEncontrado, tickerEncontrado === 'BTC' ? 'cripto' : 'ativo_b3');
        setAgentsList(agentService.listAgents());
      }
      targetNodeId = `mem-${tickerEncontrado.toLowerCase()}`;
      labelSinapse = `Sinapse Cirúrgica: [Silo ${particaoIsolada.chave}]`;
    }
    // 3. Identificação pontual de Arquivos Menores Cotidianos
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

      if (data.autonomousActions) {
        executarAcoesAutonomas(data.autonomousActions);
      } else if (data.novaMemoria) {
        adicionarNovaMemoria({
          title: data.novaMemoria.title || 'Registro Neural',
          content: data.novaMemoria.content || texto,
          category: (data.novaMemoria.category as any) || 'rotina',
          user: speaker.name,
          timestamp: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
          importance: 'alta',
          color: 0x00f5ff, // Sinapse bioluminescente azul/ciano
          sentiment: emocao.sentimento,
        });
      }

      setIsJarvisSpeaking(true);

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

  const currentProviderDef = llmService.getProviderDefinition(llmConfig.provider);

  // Sistema de Proteção e Acesso Seguro (Usuário padrão: matheus_dulius@hotmail.com / 123456)
  if (!isUnlocked) {
    return <AuthLockScreen onUnlock={() => setIsUnlocked(true)} />;
  }

  return (
    <div className="w-screen h-screen bg-[#02050e] text-slate-100 flex flex-col font-sans overflow-hidden relative select-none">
      {/* ==================================================================== */}
      {/* BARRA SUPERIOR: MICROFONE, CHAT COM TECLADO E ÍCONE DE FERRAMENTA   */}
      {/* ==================================================================== */}
      <header className="z-50 w-full px-4 py-2.5 bg-slate-950/85 backdrop-blur-xl border-b border-cyan-500/20 shadow-xl flex items-center justify-between gap-3">
        
        {/* 1. Microfone */}
        <button
          type="button"
          onClick={handleMicrophoneClick}
          className={`p-2.5 sm:p-3 rounded-2xl transition-all shadow-xl active:scale-95 flex items-center justify-center shrink-0 cursor-pointer ${
            isDictatingVoice || isOperationMode
              ? 'bg-red-600 text-white shadow-[0_0_25px_rgba(239,68,68,0.7)] animate-pulse'
              : 'bg-gradient-to-tr from-cyan-600 via-sky-500 to-blue-600 text-white shadow-[0_0_15px_rgba(14,165,233,0.35)] hover:scale-105'
          }`}
          title={isDictatingVoice ? 'Escutando sua voz... Clique para concluir' : 'Falar com o Jarvis por voz'}
        >
          <Mic className="w-5 h-5" />
        </button>

        {/* 2. Chat com Teclado na Parte Superior */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!inputMessage.trim() || loadingAI) return;
            const msg = inputMessage.trim();
            const emocao = SentimentEngine.analisar(msg);
            setActiveSentiment(emocao);
            processarComandoJarvis(msg, activeProfile, emocao);
            setInputMessage('');
          }}
          className="flex-1 max-w-3xl flex items-center gap-2 bg-slate-900/90 border border-cyan-500/30 hover:border-cyan-400/60 focus-within:border-cyan-400 rounded-2xl px-3.5 py-1.5 transition-all shadow-inner"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={isDictatingVoice ? 'Escutando sua voz...' : 'Digite aqui para conversar com o Jarvis ou acionar agentes...'}
            className="flex-1 bg-transparent text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none font-sans"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || loadingAI}
            className="p-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 disabled:opacity-30 transition-all cursor-pointer shrink-0"
            title="Enviar comando"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* 3. Ícone de Ferramenta para Acessar as Funções & Criação de Agente em Outra HTML */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSystemMenuExpanded(!systemMenuExpanded)}
            className="p-2.5 rounded-2xl bg-slate-900/90 hover:bg-cyan-950/70 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 transition-all shadow-lg active:scale-95 cursor-pointer"
            title="Ferramentas & Criação de Agentes de IA"
          >
            <Wrench className="w-5 h-5 text-cyan-400" />
          </button>

          {/* Bloqueio de Acesso / Segurança */}
          <button
            type="button"
            onClick={() => {
              authService.logout();
              setIsUnlocked(false);
            }}
            className="p-2.5 rounded-2xl bg-slate-900/90 hover:bg-red-950/50 border border-slate-700 hover:border-red-500/40 text-slate-400 hover:text-red-400 transition-all shadow-md active:scale-95 cursor-pointer"
            title="Bloquear Acesso"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Menu Desdobrável das Ferramentas (Ao clicar no ícone de ferramentas) */}
      {systemMenuExpanded && (
        <div className="absolute top-16 right-4 z-50 max-w-md w-[92%] sm:w-96 bg-slate-950/95 border border-cyan-500/40 rounded-2xl p-4 shadow-[0_0_35px_rgba(6,182,212,0.25)] backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
            <span className="font-bold text-cyan-400 flex items-center gap-1.5">
              <Wrench className="w-4 h-4" />
              FUNÇÕES & AGENTES DE IA
            </span>
            <button onClick={() => setSystemMenuExpanded(false)} className="text-slate-400 hover:text-white">✕</button>
          </div>

          {/* Botão em Destaque: Abrir Página HTML Dedicada com todas as conexões externas */}
          <button
            onClick={() => {
              window.open('/agents.html', '_blank');
              setSystemMenuExpanded(false);
            }}
            className="w-full p-3 rounded-xl bg-gradient-to-r from-cyan-600 via-sky-500 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 font-bold text-left transition-all flex items-center justify-between shadow-lg cursor-pointer"
          >
            <div>
              <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase">
                <ExternalLink className="w-4 h-4" />
                Criar Agente de IA (agents.html)
              </div>
              <div className="text-[10px] font-normal text-slate-950/80 mt-0.5">
                Abre em nova janela com Webhooks, Bancos de Dados e Teste Funcional
              </div>
            </div>
            <span className="text-[10px] bg-slate-950 text-cyan-300 px-2 py-0.5 rounded-full font-bold">HTML</span>
          </button>

          {/* Opção Ficheiro Interno */}
          <button
            onClick={() => {
              setAgentRegistryModalOpen(true);
              setSystemMenuExpanded(false);
            }}
            className="w-full p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-left transition-colors flex items-center gap-2.5 text-slate-200"
          >
            <Bot className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <div className="font-bold text-slate-100">Ficheiro no Modal</div>
              <div className="text-[10px] text-slate-400">Ver agentes acoplados ao corpo</div>
            </div>
          </button>

          {/* Opção Segurança & Senha */}
          <button
            onClick={() => {
              setSecurityModalOpen(true);
              setSystemMenuExpanded(false);
            }}
            className="w-full p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-left transition-colors flex items-center gap-2.5 text-slate-200"
          >
            <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="font-bold text-slate-100">Segurança & Troca de Senha</div>
              <div className="text-[10px] text-slate-400">matheus_dulius@hotmail.com</div>
            </div>
          </button>

          {/* Opção Provedor de LLM */}
          <button
            onClick={() => {
              setLlmConfigModalOpen(true);
              setSystemMenuExpanded(false);
            }}
            className="w-full p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-left transition-colors flex items-center gap-2.5 text-slate-200"
          >
            <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <div className="font-bold text-slate-100">Motor de LLM Universal</div>
              <div className="text-[10px] text-slate-400">Gemini, Claude, GPT, Ollama</div>
            </div>
          </button>

          {/* Decisões CFO */}
          <button
            onClick={() => {
              setCfoDecisionsModalOpen(true);
              setSystemMenuExpanded(false);
            }}
            className="w-full p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-left transition-colors flex items-center gap-2.5 text-slate-200"
          >
            <History className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="font-bold text-slate-100">Decisões Autônomas CFO</div>
              <div className="text-[10px] text-slate-400">Auditorias e deliberações de IA</div>
            </div>
          </button>

          {/* Sincronização em Múltiplos Endereços de API */}
          <button
            onClick={() => {
              handleSincronizarTodasApis();
              setSystemMenuExpanded(false);
            }}
            disabled={isSyncingApis}
            className="w-full p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-left transition-colors flex items-center justify-between text-slate-200 cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <RefreshCw className={`w-4 h-4 text-emerald-400 shrink-0 ${isSyncingApis ? 'animate-spin' : ''}`} />
              <div>
                <div className="font-bold text-slate-100">Sincronizar Todas as APIs</div>
                <div className="text-[10px] text-slate-400">Gemini, Claude, GPT, Ollama, Webhooks</div>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-950 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
              {apiSyncReport ? `${apiSyncReport.syncedEndpoints}/${apiSyncReport.totalEndpoints}` : 'Sync'}
            </span>
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ÁREA PRINCIPAL: SILHUETA HUMANA, CÉREBRO 3D E SISTEMA NERVOSO        */}
      {/* ==================================================================== */}
      <main className="flex-1 w-full h-[calc(100vh-64px)] relative overflow-hidden">
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
          agents={agentsList}
          onSelectAgent={(ag) => {
            setAgentRegistryModalOpen(true);
          }}
          activeNerveSignal={activeNerveSignal}
          onBodyPartInteract={handleBodyInteraction}
        />

        {/* Resposta Flutuante Discreta do Jarvis (Sem Obstruir a Visualização) */}
        {jarvisResponseText && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 max-w-xl w-[92%] z-40 animate-in fade-in slide-in-from-top-3 duration-300 pointer-events-auto">
            <div className="bg-slate-950/90 border border-cyan-500/40 rounded-2xl p-4 shadow-[0_0_35px_rgba(6,182,212,0.25)] backdrop-blur-2xl relative">
              <button
                onClick={() => setJarvisResponseText(null)}
                className="absolute top-2.5 right-2.5 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-1.5 text-xs font-mono uppercase font-bold text-cyan-400">
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
      </main>

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
        onClose={() => {
          setAgentRegistryModalOpen(false);
          setAgentsList(agentService.listAgents());
        }}
        onTriggerSynapse={dispararSinapse}
        onAutonomousAction={executarAcoesAutonomas}
        onAddMemory={adicionarNovaMemoria}
        onOpenCfoDecisions={() => setCfoDecisionsModalOpen(true)}
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
          const targetId = `mem-${agente.chaveParticao.toLowerCase()}`;
          dispararSinapsePontual(targetId, `Alerta Sentinela: ${agente.nome}`);
        }}
      />

      {/* Modal: Histórico de Decisões Autônomas do CFO por IA */}
      <CfoDecisionsModal
        isOpen={cfoDecisionsModalOpen}
        onClose={() => setCfoDecisionsModalOpen(false)}
        onInspectNodeInBrain={(targetNodeId, label) => {
          dispararSinapsePontual(targetNodeId, label);
          if (targetNodeId) {
            const memCorrespondente = memories.find(
              (m) =>
                m.id === targetNodeId ||
                m.id.toLowerCase().includes(targetNodeId.replace('mem-', '').toLowerCase())
            );
            if (memCorrespondente) setSelectedMemory(memCorrespondente);
          }
        }}
        onOpenAgentRegistry={() => setAgentRegistryModalOpen(true)}
        onOpenMemories={() => setMemoryPanelOpen(true)}
      />

      {/* Modal: Segurança, Troca de Senha & Sincronização Multi-Máquinas */}
      <SecuritySettingsModal
        isOpen={securityModalOpen}
        onClose={() => setSecurityModalOpen(false)}
      />
    </div>
  );
}
