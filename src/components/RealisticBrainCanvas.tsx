import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import {
  SynapseMemory,
  SentimentAnalysisResult,
  AgentDefinition,
  AgentNerveSignal,
  BodyPartAnatomy,
} from '../types/neural';
import { toolService, ToolDefinition } from '../services/toolService';
import {
  Play,
  Sparkles,
  Maximize2,
  Minimize2,
  Compass,
  Layers,
  ChevronDown,
  ChevronUp,
  Cpu,
  Wrench,
  Database,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react';

export interface RealisticBrainCanvasProps {
  memories: SynapseMemory[];
  selectedMemory: SynapseMemory | null;
  onSelectMemory: (mem: SynapseMemory) => void;
  isJarvisSpeaking: boolean;
  isListening: boolean;
  activeSynapsePulse?: string | null;
  activeTargetNodeId?: string | null;
  activeSentiment?: SentimentAnalysisResult | null;
  tvMode?: boolean;
  onForceRest?: () => void;
  agents?: AgentDefinition[];
  onSelectAgent?: (agent: AgentDefinition) => void;
  activeNerveSignal?: AgentNerveSignal | null;
  onBodyPartInteract?: (bodyPart: BodyPartAnatomy, agent?: AgentDefinition) => void;
}

export type SynapseCyclePhase = 'idle' | 'agent_to_tool' | 'tool_to_agent' | 'agent_to_memory';

interface SynapsePhoton {
  mesh: THREE.Mesh;
  progress: number;
  speed: number;
  color: number;
  curve: THREE.Curve<THREE.Vector3>;
  active: boolean;
}

export const RealisticBrainCanvas: React.FC<RealisticBrainCanvasProps> = ({
  memories,
  selectedMemory,
  onSelectMemory,
  isJarvisSpeaking,
  isListening,
  activeSynapsePulse,
  activeTargetNodeId,
  activeSentiment,
  tvMode = false,
  onForceRest,
  agents = [],
  onSelectAgent,
  activeNerveSignal,
  onBodyPartInteract,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lista de ferramentas do córtex carregadas do ToolService
  const [toolsList, setToolsList] = useState<ToolDefinition[]>(() => toolService.listTools());

  useEffect(() => {
    const unsub = toolService.subscribe(() => {
      setToolsList(toolService.listTools());
    });
    return () => unsub();
  }, []);

  // Estado do ciclo sináptico interativo de 3 fases
  const [currentPhase, setCurrentPhase] = useState<SynapseCyclePhase>('idle');
  const [phaseProgress, setPhaseProgress] = useState<number>(0);
  const [autoCycle, setAutoCycle] = useState<boolean>(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [selectedToolId, setSelectedToolId] = useState<string>('');
  const [selectedMemoryId, setSelectedMemoryId] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isUiCollapsed, setIsUiCollapsed] = useState<boolean>(false);
  const [currentCameraView, setCurrentCameraView] = useState<'iso' | 'top' | 'front' | 'side'>('iso');

  const [hoveredNode, setHoveredNode] = useState<{
    type: 'agent' | 'tool' | 'memory';
    name: string;
    description?: string;
    details?: string;
    location: 'NÚCLEO' | 'CÓRTEX';
    color: string;
  } | null>(null);

  // Referências para controle Three.js e animação
  const cyclePhaseRef = useRef<SynapseCyclePhase>('idle');
  const cycleTimerRef = useRef<number>(0);
  const autoCycleRef = useRef<boolean>(true);
  autoCycleRef.current = autoCycle;

  // Interação de Câmera Orbital com Mouse / Touch
  const isPointerDownRef = useRef<boolean>(false);
  const pointerPrevRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraTargetPosRef = useRef<{ theta: number; phi: number; radius: number }>({
    theta: 0.35,
    phi: 1.30,
    radius: 6.2,
  });
  const autoRotateRef = useRef<boolean>(true);
  const updateCameraFnRef = useRef<(() => void) | null>(null);

  // Lista de nós ativos para seleção
  const effectiveAgents = useMemo(() => {
    if (agents && agents.length > 0) return agents;
    return [
      {
        id: 'jarvis-supervisor',
        name: 'Jarvis Supervisor',
        role: 'Orquestrador Geral do Núcleo',
        targetDatabase: 'GLOBAL',
        logic: 'Decisão e roteamento de inteligência híbrida',
        llmProvider: 'gemini' as const,
        model: 'gemini-3.8-flash',
        status: 'ativo' as const,
        triggers: ['voz', 'texto', 'rotina'],
        isAutonomous: true,
        createdAt: '2026',
        author: 'Sistema',
      },
      {
        id: 'automacoes-webhooks',
        name: 'Agente de Automações & Webhooks',
        role: 'Recepção e Disparo de Eventos n8n',
        targetDatabase: 'N8N_WORKFLOWS',
        logic: 'Orquestração de nós, disparos HTTP e tratamento de payloads',
        llmProvider: 'gemini' as const,
        model: 'gemini-3.8-flash',
        status: 'ativo' as const,
        triggers: ['webhook', 'api', 'evento'],
        isAutonomous: true,
        createdAt: '2026',
        author: 'Sistema',
      },
      {
        id: 'infraestrutura-ti',
        name: 'Agente TI & Oracle Cloud',
        role: 'Telemetria & Servidores VM',
        targetDatabase: 'ORACLE_VM',
        logic: 'Monitoramento de nós n8n e hardware',
        llmProvider: 'gemini' as const,
        model: 'gemini-3.8-flash',
        status: 'ativo' as const,
        triggers: ['telemetria'],
        isAutonomous: true,
        createdAt: '2026',
        author: 'Sistema',
      },
      {
        id: 'ambiente-home',
        name: 'Agente Home Assistant',
        role: 'Automação Residencial & Presença',
        targetDatabase: 'HOME_IOT',
        logic: 'Luzes, climatização e robô aspirador',
        llmProvider: 'gemini' as const,
        model: 'gemini-3.8-flash',
        status: 'ativo' as const,
        triggers: ['biometria', 'câmera'],
        isAutonomous: true,
        createdAt: '2026',
        author: 'Sistema',
      },
      {
        id: 'suprimentos-compras',
        name: 'Agente Suprimentos & Compras',
        role: 'Estoque Doméstico & Cotações',
        targetDatabase: 'DESPENSA',
        logic: 'Monitor de itens e busca de menores preços',
        llmProvider: 'gemini' as const,
        model: 'gemini-3.8-flash',
        status: 'ativo' as const,
        triggers: ['estoque'],
        isAutonomous: true,
        createdAt: '2026',
        author: 'Sistema',
      },
      {
        id: 'pesquisador-docs',
        name: 'Agente Pesquisador & RAG',
        role: 'Extração Documental e Resumos',
        targetDatabase: 'VECTOR_STORE',
        logic: 'Busca semântica em PDFs e contratos',
        llmProvider: 'gemini' as const,
        model: 'gemini-3.8-flash',
        status: 'ativo' as const,
        triggers: ['documento'],
        isAutonomous: true,
        createdAt: '2026',
        author: 'Sistema',
      },
    ];
  }, [agents]);

  // Inicializar nós selecionados padrão
  useEffect(() => {
    if (!selectedAgentId && effectiveAgents.length > 0) {
      setSelectedAgentId(effectiveAgents[0].id);
    }
  }, [effectiveAgents, selectedAgentId]);

  useEffect(() => {
    if (!selectedToolId && toolsList.length > 0) {
      setSelectedToolId(toolsList[0].id);
    }
  }, [toolsList, selectedToolId]);

  useEffect(() => {
    if (!selectedMemoryId && memories.length > 0) {
      setSelectedMemoryId(memories[0].id);
    }
  }, [memories, selectedMemoryId]);

  // Função para acionar o ciclo completo manual
  const triggerSynapseCycle = (
    agentId?: string,
    toolId?: string,
    memoryId?: string
  ) => {
    if (agentId) setSelectedAgentId(agentId);
    if (toolId) setSelectedToolId(toolId);
    if (memoryId) setSelectedMemoryId(memoryId);

    cyclePhaseRef.current = 'agent_to_tool';
    cycleTimerRef.current = 0;
    setCurrentPhase('agent_to_tool');
    setPhaseProgress(0);
  };

  // Reação ao pulso sináptico emitido pelo terminal/Jarvis/CFO
  useEffect(() => {
    if (activeSynapsePulse) {
      triggerSynapseCycle();
    }
  }, [activeSynapsePulse]);

  // Função para alternar modos de câmera para ajuste de tela
  const setCameraPreset = (view: 'iso' | 'top' | 'front' | 'side') => {
    setCurrentCameraView(view);
    const r = cameraTargetPosRef.current.radius;
    if (view === 'iso') {
      cameraTargetPosRef.current = { theta: 0.35, phi: 1.30, radius: r };
    } else if (view === 'top') {
      cameraTargetPosRef.current = { theta: 0.0, phi: 0.15, radius: r };
    } else if (view === 'front') {
      cameraTargetPosRef.current = { theta: 0.0, phi: Math.PI * 0.5, radius: r };
    } else if (view === 'side') {
      cameraTargetPosRef.current = { theta: Math.PI * 0.5, phi: Math.PI * 0.5, radius: r };
    }
    updateCameraFnRef.current?.();
  };

  // Ajuste de zoom via botões
  const adjustZoom = (deltaRadius: number) => {
    cameraTargetPosRef.current.radius = Math.max(
      3.2,
      Math.min(10.5, cameraTargetPosRef.current.radius + deltaRadius)
    );
    updateCameraFnRef.current?.();
  };

  // Alternar tela cheia
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // =========================================================================
  // SETUP THREE.JS — CÉREBRO 3D ANATÔMICO COM NÚCLEO E CÓRTEX
  // =========================================================================
  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const width = currentMount.clientWidth || window.innerWidth;
    const height = currentMount.clientHeight || window.innerHeight;

    // Ajuste dinâmico do enquadramento de acordo com a proporção da tela
    const aspect = width / height;
    const optimalRadius = aspect < 0.8 ? 8.2 : aspect < 1.3 ? 6.8 : 5.8;
    cameraTargetPosRef.current.radius = optimalRadius;

    // 1. Cena Three.js
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02050e, 0.038);

    // 2. Câmera Perspectiva
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    const updateCameraPos = () => {
      const { theta, phi, radius } = cameraTargetPosRef.current;
      camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = radius * Math.cos(phi);
      camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(0, 0, 0);
    };
    updateCameraFnRef.current = updateCameraPos;
    updateCameraPos();

    // 3. Renderizador WebGL de Alta Fidelidade
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      precision: 'highp',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.max(window.devicePixelRatio || 1, 2.0));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x02050e, 1.0);
    currentMount.appendChild(renderer.domElement);

    // 4. Luzes Anatômicas e Bioluminescentes
    const ambientLight = new THREE.AmbientLight(0x041b33, 1.8);
    scene.add(ambientLight);

    // Luz Central no Núcleo (Vermelha)
    const coreLight = new THREE.PointLight(0xef4444, 3.4, 9);
    coreLight.position.set(0, 0, 0);
    scene.add(coreLight);

    // Luz Cortical Superior (Ciano Elétrico)
    const cortexTopLight = new THREE.PointLight(0x00f5ff, 2.6, 12);
    cortexTopLight.position.set(0, 2.8, 1.2);
    scene.add(cortexTopLight);

    // Luz Cortical Lateral Dourada
    const cortexGoldLight = new THREE.PointLight(0xfacc15, 2.0, 10);
    cortexGoldLight.position.set(2.4, -1.0, 1.5);
    scene.add(cortexGoldLight);

    // 5. Grupos da Anatomia Cerebral
    const brainMasterGroup = new THREE.Group();
    scene.add(brainMasterGroup);

    const cortexGroup = new THREE.Group();
    brainMasterGroup.add(cortexGroup);

    const coreGroup = new THREE.Group();
    brainMasterGroup.add(coreGroup);

    const synapsesGroup = new THREE.Group();
    brainMasterGroup.add(synapsesGroup);

    // =========================================================================
    // A. ANATOMIA REAL DE UM CÉREBRO: 2 HEMISFÉRIOS, CEREBELO E TRONCO ENCEFÁLICO
    // =========================================================================
    // Função matemática precisa para moldar a geometria de um hemisfério cerebral
    const createAnatomicalHemisphereGeometry = (isRight: boolean): THREE.BufferGeometry => {
      const uSegs = 48; // Azimutal
      const vSegs = 36; // Polar
      const vertices: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      const xSign = isRight ? 1 : -1;
      const sagittalGap = 0.09 * xSign; // Vão anatômico da fissura sagital inter-hemisférica

      for (let j = 0; j <= vSegs; j++) {
        const v = j / vSegs;
        const phi = v * Math.PI; // 0 (topo dorsal) a PI (base ventral)

        for (let i = 0; i <= uSegs; i++) {
          const u = i / uSegs;
          const theta = u * Math.PI * 2; // Volta completa

          // Projeção base da forma ovoide do cérebro humano:
          // Mais longo no eixo Z (frente-trás) do que no X (largura)
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          const sinP = Math.sin(phi);
          const cosP = Math.cos(phi);

          // 1. Perfil morfológico do cérebro (Lobo Frontal amplo à frente, Occipital afunilado atrás)
          const zCoord = cosP * 1.55; // Eixo rostro-caudal
          const frontalBroadening = zCoord > 0 ? 1.08 + zCoord * 0.12 : 1.0 - Math.abs(zCoord) * 0.18;

          // 2. Lobo Temporal (Protuberância antero-inferior nas laterais)
          const isTemporalRegion = sinP > 0.45 && cosP > -0.35 && Math.abs(cosT) > 0.45;
          const temporalBulge = isTemporalRegion ? 0.22 * Math.sin(phi * 2.2) : 0.0;

          // 3. Fissura Medial (Face interna achatada que forma a fenda longitudinal)
          const medialFlatten = isRight ? Math.max(0.08, cosT * 1.15) : Math.min(-0.08, cosT * 1.15);

          // 4. Giros e Sulcos Corticais Profundos e Orgânicos (Gyri & Sulci)
          const gyriMajor = Math.sin(phi * 13.0) * Math.cos(theta * 9.0) * 0.09;
          const gyriMinor = Math.cos(phi * 21.0 + theta * 15.0) * 0.045;
          const sulciIndent = -Math.abs(Math.sin(phi * 7.5 + theta * 6.0)) * 0.04;
          const gyriTotal = gyriMajor + gyriMinor + sulciIndent;

          // Raio radial composto
          const rBase = (1.25 + gyriTotal + temporalBulge) * frontalBroadening;

          // Coordenadas tridimensionais anatômicas
          const x = (medialFlatten * rBase * 0.88 + sagittalGap);
          const y = (sinP * sinT * rBase * 0.82) + 0.10;
          const z = zCoord * (1.0 + gyriTotal * 0.5);

          vertices.push(x, y, z);
          uvs.push(u, v);
        }
      }

      // Criar índices das faces triangulares
      for (let j = 0; j < vSegs; j++) {
        for (let i = 0; i < uSegs; i++) {
          const a = j * (uSegs + 1) + i;
          const b = a + uSegs + 1;
          const c = a + 1;
          const d = b + 1;

          indices.push(a, b, c);
          indices.push(c, b, d);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    };

    // Material bioluminescente translúcido de alta definição para o córtex
    const cortexHemisphereMat = new THREE.MeshPhongMaterial({
      color: 0x0284c7,
      emissive: 0x032244,
      specular: 0x38bdf8,
      shininess: 45,
      transparent: true,
      opacity: 0.65,
      wireframe: false,
    });

    const cortexWireframeMat = new THREE.MeshBasicMaterial({
      color: 0x00f5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
    });

    // Hemisfério Esquerdo
    const leftHemisphereGeo = createAnatomicalHemisphereGeometry(false);
    const leftMesh = new THREE.Mesh(leftHemisphereGeo, cortexHemisphereMat);
    const leftWire = new THREE.Mesh(leftHemisphereGeo, cortexWireframeMat);
    cortexGroup.add(leftMesh);
    cortexGroup.add(leftWire);

    // Hemisfério Direito
    const rightHemisphereGeo = createAnatomicalHemisphereGeometry(true);
    const rightMesh = new THREE.Mesh(rightHemisphereGeo, cortexHemisphereMat);
    const rightWire = new THREE.Mesh(rightHemisphereGeo, cortexWireframeMat);
    cortexGroup.add(rightMesh);
    cortexGroup.add(rightWire);

    // B. CEREBELO ANATÔMICO (Dois lóbulos póstero-inferiores estriados)
    const cerebellumGeo = new THREE.SphereGeometry(0.55, 24, 18);
    const cerebellumMat = new THREE.MeshPhongMaterial({
      color: 0x0369a1,
      emissive: 0x021d38,
      specular: 0x0ea5e9,
      shininess: 30,
      transparent: true,
      opacity: 0.55,
      wireframe: true,
    });

    // Cerebelo Esquerdo
    const leftCerebellum = new THREE.Mesh(cerebellumGeo, cerebellumMat);
    leftCerebellum.scale.set(0.68, 0.45, 0.55);
    leftCerebellum.position.set(-0.45, -0.75, -1.15);
    cortexGroup.add(leftCerebellum);

    // Cerebelo Direito
    const rightCerebellum = leftCerebellum.clone();
    rightCerebellum.position.set(0.45, -0.75, -1.15);
    cortexGroup.add(rightCerebellum);

    // C. TRONCO ENCEFÁLICO (Brainstem - Centro Inferior)
    const brainstemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.25, -0.35),
      new THREE.Vector3(0, -0.75, -0.45),
      new THREE.Vector3(0, -1.35, -0.55),
    ]);
    const brainstemGeo = new THREE.TubeGeometry(brainstemCurve, 16, 0.16, 12, false);
    const brainstemMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    cortexGroup.add(new THREE.Mesh(brainstemGeo, brainstemMat));

    // Nuvem de partículas sinápticas bioluminescentes sobre a superfície dos giros
    const corticalPlexusPoints: THREE.Vector3[] = [];
    const numPlexus = 800;
    for (let k = 0; k < numPlexus; k++) {
      const isR = Math.random() > 0.5;
      const xS = isR ? 1 : -1;
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * Math.PI;

      const rX = Math.sin(v) * Math.cos(u);
      const rY = Math.sin(v) * Math.sin(u);
      const rZ = Math.cos(v);

      const pX = (Math.max(0.12, Math.abs(rX)) * 1.15 * xS) + (isR ? 0.08 : -0.08);
      const pY = rY * 0.88 + 0.10;
      const pZ = rZ * 1.55;

      corticalPlexusPoints.push(new THREE.Vector3(pX, pY, pZ));
    }
    const plexusGeo = new THREE.BufferGeometry().setFromPoints(corticalPlexusPoints);
    const plexusMat = new THREE.PointsMaterial({
      size: 0.038,
      color: 0x00f5ff,
      transparent: true,
      opacity: 0.80,
      blending: THREE.AdditiveBlending,
    });
    cortexGroup.add(new THREE.Points(plexusGeo, plexusMat));

    // =========================================================================
    // B. NÚCLEO (INNER CORE): ONDE FICAM OS AGENTES DE IA (COR: VERMELHA)
    // =========================================================================
    // Esfera central do núcleo tálamo-límbico profundo
    const coreNucleusGeo = new THREE.SphereGeometry(0.72, 20, 20);
    const coreNucleusMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      wireframe: true,
      transparent: true,
      opacity: 0.20,
      blending: THREE.AdditiveBlending,
    });
    const coreNucleusMesh = new THREE.Mesh(coreNucleusGeo, coreNucleusMat);
    coreGroup.add(coreNucleusMesh);

    // Mapeamento das posições dos Agentes de IA no NÚCLEO (Raio <= 0.60)
    interface AgentNode3D {
      agent: AgentDefinition;
      pos: THREE.Vector3;
      mesh: THREE.Mesh;
      haloMesh: THREE.Mesh;
      isSupervisor: boolean;
    }
    const agentNodes: AgentNode3D[] = [];
    const interactiveMeshes: THREE.Mesh[] = [];

    const numAgents = effectiveAgents.length;
    effectiveAgents.forEach((agent, idx) => {
      const isSupervisor = agent.id === 'jarvis-supervisor' || idx === 0;

      // Posição estritamente no NÚCLEO: Jarvis no centro absoluto, outros agentes orbitando
      let pos: THREE.Vector3;
      if (isSupervisor) {
        pos = new THREE.Vector3(0, 0, 0);
      } else {
        const angle = ((idx - 1) / (numAgents - 1)) * Math.PI * 2;
        const orbitRadius = 0.42 + (idx % 2) * 0.12;
        const orbitY = Math.sin(idx * 1.9) * 0.20;
        pos = new THREE.Vector3(
          Math.cos(angle) * orbitRadius,
          orbitY,
          Math.sin(angle) * orbitRadius * 0.85
        );
      }

      // Esfera do Agente de IA: VERMELHA (conforme estipulado!)
      const agentRadius = isSupervisor ? 0.082 : 0.052;
      const agentGeo = new THREE.SphereGeometry(agentRadius, 16, 16);
      const agentMat = new THREE.MeshBasicMaterial({
        color: 0xef4444, // VERMELHO VIBRANTE
        transparent: true,
        opacity: 0.98,
      });
      const agentMesh = new THREE.Mesh(agentGeo, agentMat);
      agentMesh.position.copy(pos);
      agentMesh.userData = { type: 'agent', data: agent };
      coreGroup.add(agentMesh);
      interactiveMeshes.push(agentMesh);

      // Núcleo interno incandescente
      const innerKernel = new THREE.Mesh(
        new THREE.SphereGeometry(agentRadius * 0.45, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      agentMesh.add(innerKernel);

      // Halo pulsante vermelho
      const haloGeo = new THREE.SphereGeometry(agentRadius * 1.7, 12, 12);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xdc2626,
        transparent: true,
        opacity: 0.40,
        blending: THREE.AdditiveBlending,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.position.copy(pos);
      coreGroup.add(haloMesh);

      agentNodes.push({
        agent,
        pos,
        mesh: agentMesh,
        haloMesh,
        isSupervisor,
      });
    });

    // Conexões Neurais de Subordinação: Filamentos entre o Agente Líder Central e seus Especialistas Subordinados
    if (agentNodes.length > 1) {
      const leaderPos = agentNodes[0].pos;
      for (let s = 1; s < agentNodes.length; s++) {
        const specPos = agentNodes[s].pos;
        const subCurve = new THREE.LineCurve3(leaderPos, specPos);
        const subTubeGeo = new THREE.TubeGeometry(subCurve, 12, 0.007, 6, false);
        const subTubeMat = new THREE.MeshBasicMaterial({
          color: 0xef4444, // Vermelho neural do núcleo
          transparent: true,
          opacity: 0.60,
          blending: THREE.AdditiveBlending,
        });
        const subFilament = new THREE.Mesh(subTubeGeo, subTubeMat);
        coreGroup.add(subFilament);
      }
    }

    // =========================================================================
    // C. CÓRTEX (OUTER CORTEX): ONDE FICAM AS FERRAMENTAS (AMARELAS) E MEMÓRIAS (VERDE-AZULADAS)
    // =========================================================================
    // 1. FERRAMENTAS CRIADAS (COR: AMARELA — 0xfacc15)
    interface ToolNode3D {
      tool: ToolDefinition;
      pos: THREE.Vector3;
      mesh: THREE.Mesh;
      haloMesh: THREE.Mesh;
    }
    const toolNodes: ToolNode3D[] = [];

    const numTools = toolsList.length;
    toolsList.forEach((tool, idx) => {
      // Posicionamento nas cristas do córtex cerebral (Lobo frontal e parietal superior)
      const u = (idx / numTools) * Math.PI * 2;
      const isR = Math.cos(u) >= 0;
      const xS = isR ? 1 : -1;
      const phi = 0.55 + ((idx % 4) / 4) * 1.25;

      const pX = (Math.sin(phi) * Math.abs(Math.cos(u)) * 1.10 * xS) + (isR ? 0.22 : -0.22);
      const pY = (Math.sin(phi) * Math.sin(u) * 0.78) + 0.12;
      const pZ = Math.cos(phi) * 1.45;
      const pos = new THREE.Vector3(pX, pY, pZ);

      // Esfera da Ferramenta: AMARELA (conforme estipulado!)
      const toolGeo = new THREE.SphereGeometry(0.060, 14, 14);
      const toolMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15, // AMARELO OURO ELETRICO
        transparent: true,
        opacity: 0.95,
      });
      const toolMesh = new THREE.Mesh(toolGeo, toolMat);
      toolMesh.position.copy(pos);
      toolMesh.userData = { type: 'tool', data: tool };
      cortexGroup.add(toolMesh);
      interactiveMeshes.push(toolMesh);

      // Núcleo brilhante
      toolMesh.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.025, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xfffbeb })
        )
      );

      // Halo dourado amarelo
      const toolHalo = new THREE.Mesh(
        new THREE.SphereGeometry(0.105, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0xeab308,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
        })
      );
      toolHalo.position.copy(pos);
      cortexGroup.add(toolHalo);

      toolNodes.push({
        tool,
        pos,
        mesh: toolMesh,
        haloMesh: toolHalo,
      });
    });

    // 2. MEMÓRIAS (COR: VERDE-AZULADO — 0x06b6d4 / CYAN-TEAL)
    interface MemoryNode3D {
      memory: SynapseMemory;
      pos: THREE.Vector3;
      mesh: THREE.Mesh;
      haloMesh: THREE.Mesh;
    }
    const memoryNodes: MemoryNode3D[] = [];

    const effectiveMemories: SynapseMemory[] = memories && memories.length > 0
      ? memories
      : [
          {
            id: 'mem-curto-prazo',
            title: 'Sessão Ativa: Biometria Matheus',
            category: 'sensorial',
            user: 'Jarvis',
            timestamp: 'Agora',
            content: 'Crachá biométrico reconhecido. Permissões de Administrador ativas.',
            importance: 'alta',
            coords: [0.2, 0.4, 0.5],
            color: 0x06b6d4,
            firing: false,
            connectionsCount: 3,
          },
          {
            id: 'mem-rag-n8n',
            title: 'RAG: Manuais e Regras de Workflows n8n',
            category: 'semantica',
            user: 'Orquestrador n8n',
            timestamp: 'Hoje',
            content: 'Estrutura de 5 camadas, triggers escaláveis, tratamento de loops e crachás biométricos.',
            importance: 'critica',
            coords: [-0.3, 0.2, 0.4],
            color: 0x06b6d4,
            firing: false,
            connectionsCount: 5,
          },
          {
            id: 'mem-biografica',
            title: 'Evolução: Preferências e Rotinas',
            category: 'aprendizado',
            user: 'Núcleo Neural',
            timestamp: 'Histórico',
            content: 'Preferência por concisão tática e relatórios executivos compactos.',
            importance: 'alta',
            coords: [0.1, -0.2, 0.6],
            color: 0x06b6d4,
            firing: false,
            connectionsCount: 4,
          },
          {
            id: 'mem-residencia',
            title: 'Automação: Climatização e Iluminação',
            category: 'rotina',
            user: 'Home Assistant',
            timestamp: 'Hoje',
            content: 'Ambiente preparado conforme crachá de presença na sala.',
            importance: 'media',
            coords: [-0.4, -0.3, 0.3],
            color: 0x06b6d4,
            firing: false,
            connectionsCount: 2,
          },
        ];

    effectiveMemories.forEach((mem, idx) => {
      // Posicionamento no CÓRTEX (Lobo temporal e parietal posterior)
      const u = ((idx * 2 + 1) / (effectiveMemories.length * 2)) * Math.PI * 2;
      const isR = Math.cos(u) >= 0;
      const xS = isR ? 1 : -1;
      const phi = 1.15 + ((idx % 3) / 3) * 1.35;

      const pX = (Math.sin(phi) * Math.abs(Math.cos(u)) * 1.08 * xS) + (isR ? 0.20 : -0.20);
      const pY = (Math.sin(phi) * Math.sin(u) * 0.76) + 0.08;
      const pZ = Math.cos(phi) * 1.50;
      const pos = new THREE.Vector3(pX, pY, pZ);

      // Esfera da Memória: VERDE-AZULADO (conforme estipulado!)
      const memGeo = new THREE.SphereGeometry(0.058, 14, 14);
      const memMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4, // VERDE-AZULADO / CYAN-TEAL
        transparent: true,
        opacity: 0.95,
      });
      const memMesh = new THREE.Mesh(memGeo, memMat);
      memMesh.position.copy(pos);
      memMesh.userData = { type: 'memory', data: mem };
      cortexGroup.add(memMesh);
      interactiveMeshes.push(memMesh);

      // Núcleo interno
      memMesh.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.024, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xe0f2fe })
        )
      );

      // Halo verde-azulado
      const memHalo = new THREE.Mesh(
        new THREE.SphereGeometry(0.10, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0x0891b2,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
        })
      );
      memHalo.position.copy(pos);
      cortexGroup.add(memHalo);

      memoryNodes.push({
        memory: mem,
        pos,
        mesh: memMesh,
        haloMesh: memHalo,
      });
    });

    // =========================================================================
    // D. SISTEMA DE SINAPSES EM 3 ETAPAS
    // 1. Agente -> Ferramenta: VERMELHO (0xef4444)
    // 2. Ferramenta -> Agente: AMARELO (0xfacc15)
    // 3. Agente -> Memória: VERDE-AZULADO (0x06b6d4)
    // =========================================================================
    interface DynamicSynapseBeam {
      type: 'agent_to_tool' | 'tool_to_agent' | 'agent_to_memory';
      curve: THREE.CatmullRomCurve3;
      tubeMesh: THREE.Mesh;
      photons: SynapsePhoton[];
      activeColor: number;
    }
    const dynamicBeams: DynamicSynapseBeam[] = [];

    const createSynapticCurve = (start: THREE.Vector3, end: THREE.Vector3): THREE.CatmullRomCurve3 => {
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      const normal = new THREE.Vector3().crossVectors(start, end).normalize();
      if (normal.lengthSq() < 0.01) normal.set(0, 1, 0);
      mid.add(normal.multiplyScalar(0.22));

      return new THREE.CatmullRomCurve3([start.clone(), mid, end.clone()]);
    };

    const createPhotons = (curve: THREE.Curve<THREE.Vector3>, color: number, count = 4): SynapsePhoton[] => {
      const list: SynapsePhoton[] = [];
      for (let k = 0; k < count; k++) {
        const pGeo = new THREE.SphereGeometry(0.024, 8, 8);
        const pMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending,
        });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        synapsesGroup.add(pMesh);

        list.push({
          mesh: pMesh,
          progress: k / count,
          speed: 1.25,
          color,
          curve,
          active: false,
        });
      }
      return list;
    };

    const defaultAgentPos = agentNodes[0]?.pos || new THREE.Vector3(0, 0, 0);
    const defaultToolPos = toolNodes[0]?.pos || new THREE.Vector3(1.1, 0.6, 0.4);
    const defaultMemPos = memoryNodes[0]?.pos || new THREE.Vector3(-1.1, -0.4, 0.6);

    // 1. Sinapse Agente -> Ferramenta (VERMELHA)
    const curve1 = createSynapticCurve(defaultAgentPos, defaultToolPos);
    const tube1Mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve1, 24, 0.012, 8, false),
      new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.20, blending: THREE.AdditiveBlending })
    );
    synapsesGroup.add(tube1Mesh);
    const photons1 = createPhotons(curve1, 0xef4444, 5);
    const beamAgentToTool: DynamicSynapseBeam = {
      type: 'agent_to_tool',
      curve: curve1,
      tubeMesh: tube1Mesh,
      photons: photons1,
      activeColor: 0xef4444,
    };
    dynamicBeams.push(beamAgentToTool);

    // 2. Sinapse Ferramenta -> Agente (AMARELA)
    const curve2 = createSynapticCurve(defaultToolPos, defaultAgentPos);
    const tube2Mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve2, 24, 0.012, 8, false),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.20, blending: THREE.AdditiveBlending })
    );
    synapsesGroup.add(tube2Mesh);
    const photons2 = createPhotons(curve2, 0xfacc15, 5);
    const beamToolToAgent: DynamicSynapseBeam = {
      type: 'tool_to_agent',
      curve: curve2,
      tubeMesh: tube2Mesh,
      photons: photons2,
      activeColor: 0xfacc15,
    };
    dynamicBeams.push(beamToolToAgent);

    // 3. Sinapse Agente -> Memória (VERDE-AZULADA)
    const curve3 = createSynapticCurve(defaultAgentPos, defaultMemPos);
    const tube3Mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve3, 24, 0.012, 8, false),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.20, blending: THREE.AdditiveBlending })
    );
    synapsesGroup.add(tube3Mesh);
    const photons3 = createPhotons(curve3, 0x06b6d4, 5);
    const beamAgentToMemory: DynamicSynapseBeam = {
      type: 'agent_to_memory',
      curve: curve3,
      tubeMesh: tube3Mesh,
      photons: photons3,
      activeColor: 0x06b6d4,
    };
    dynamicBeams.push(beamAgentToMemory);

    const updateActiveSynapseGeometry = (
      activeAgentNode?: AgentNode3D,
      activeToolNode?: ToolNode3D,
      activeMemNode?: MemoryNode3D
    ) => {
      const aPos = activeAgentNode?.pos || defaultAgentPos;
      const tPos = activeToolNode?.pos || defaultToolPos;
      const mPos = activeMemNode?.pos || defaultMemPos;

      const newCurve1 = createSynapticCurve(aPos, tPos);
      beamAgentToTool.curve = newCurve1;
      beamAgentToTool.tubeMesh.geometry.dispose();
      beamAgentToTool.tubeMesh.geometry = new THREE.TubeGeometry(newCurve1, 24, 0.012, 8, false);
      beamAgentToTool.photons.forEach((p) => (p.curve = newCurve1));

      const newCurve2 = createSynapticCurve(tPos, aPos);
      beamToolToAgent.curve = newCurve2;
      beamToolToAgent.tubeMesh.geometry.dispose();
      beamToolToAgent.tubeMesh.geometry = new THREE.TubeGeometry(newCurve2, 24, 0.012, 8, false);
      beamToolToAgent.photons.forEach((p) => (p.curve = newCurve2));

      const newCurve3 = createSynapticCurve(aPos, mPos);
      beamAgentToMemory.curve = newCurve3;
      beamAgentToMemory.tubeMesh.geometry.dispose();
      beamAgentToMemory.tubeMesh.geometry = new THREE.TubeGeometry(newCurve3, 24, 0.012, 8, false);
      beamAgentToMemory.photons.forEach((p) => (p.curve = newCurve3));
    };

    // =========================================================================
    // E. INTERAÇÃO VIA MOUSE / TOUCH / RAYCASTING
    // =========================================================================
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      isPointerDownRef.current = true;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      pointerPrevRef.current = { x: clientX, y: clientY };
    };

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveMeshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const uData = hit.userData;
        if (uData.type === 'agent') {
          const ag: AgentDefinition = uData.data;
          setHoveredNode({
            type: 'agent',
            name: ag.name,
            description: ag.role,
            details: `Motor: ${ag.model || 'gemini-3.8-flash'} • Status: ${ag.status.toUpperCase()}`,
            location: 'NÚCLEO',
            color: '#ef4444',
          });
          document.body.style.cursor = 'pointer';
        } else if (uData.type === 'tool') {
          const tl: ToolDefinition = uData.data;
          setHoveredNode({
            type: 'tool',
            name: tl.name,
            description: tl.description,
            details: `Tipo: ${tl.type.toUpperCase()} • Execuções: ${tl.executionCount || 0}`,
            location: 'CÓRTEX',
            color: '#facc15',
          });
          document.body.style.cursor = 'pointer';
        } else if (uData.type === 'memory') {
          const mm: SynapseMemory = uData.data;
          setHoveredNode({
            type: 'memory',
            name: mm.title,
            description: mm.content,
            details: `Categoria: ${mm.category} • Autor: ${mm.user}`,
            location: 'CÓRTEX',
            color: '#06b6d4',
          });
          document.body.style.cursor = 'pointer';
        }
      } else {
        setHoveredNode(null);
        document.body.style.cursor = 'default';
      }

      // Rotação orbital suave ao arrastar
      if (isPointerDownRef.current) {
        const deltaX = clientX - pointerPrevRef.current.x;
        const deltaY = clientY - pointerPrevRef.current.y;
        pointerPrevRef.current = { x: clientX, y: clientY };

        cameraTargetPosRef.current.theta -= deltaX * 0.007;
        cameraTargetPosRef.current.phi = Math.max(
          0.12,
          Math.min(Math.PI - 0.12, cameraTargetPosRef.current.phi - deltaY * 0.007)
        );
        updateCameraPos();
      }
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraTargetPosRef.current.radius = Math.max(
        3.0,
        Math.min(10.5, cameraTargetPosRef.current.radius + e.deltaY * 0.004)
      );
      updateCameraPos();
    };

    const handleClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveMeshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const uData = hit.userData;

        if (uData.type === 'agent') {
          const ag: AgentDefinition = uData.data;
          setSelectedAgentId(ag.id);
          onSelectAgent?.(ag);
          triggerSynapseCycle(ag.id);
        } else if (uData.type === 'tool') {
          const tl: ToolDefinition = uData.data;
          setSelectedToolId(tl.id);
          triggerSynapseCycle(undefined, tl.id);
        } else if (uData.type === 'memory') {
          const mm: SynapseMemory = uData.data;
          setSelectedMemoryId(mm.id);
          onSelectMemory(mm);
          triggerSynapseCycle(undefined, undefined, mm.id);
        }
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', handlePointerDown);
    dom.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    dom.addEventListener('wheel', handleWheel, { passive: false });
    dom.addEventListener('click', handleClick);

    dom.addEventListener('touchstart', handlePointerDown, { passive: true });
    dom.addEventListener('touchmove', handlePointerMove, { passive: true });
    window.addEventListener('touchend', handlePointerUp);

    // =========================================================================
    // F. LOOP DE RENDERIZAÇÃO E MÁQUINA DE ESTADOS DA SINAPSE (60FPS)
    // =========================================================================
    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const elapsedTime = now * 0.001;

      // 1. Auto-rotação contínua e suave do cérebro
      if (autoRotateRef.current && !isPointerDownRef.current) {
        brainMasterGroup.rotation.y += delta * 0.12;
      }

      // 2. Pulsação biológica do cérebro
      const brainBreathe = 1.0 + Math.sin(elapsedTime * 1.8) * 0.015;
      cortexGroup.scale.set(brainBreathe, brainBreathe, brainBreathe);

      const nucleusPulse = 1.0 + Math.sin(elapsedTime * 3.5) * 0.12;
      coreNucleusMesh.scale.set(nucleusPulse, nucleusPulse, nucleusPulse);
      coreLight.intensity = 2.6 + Math.sin(elapsedTime * 3.5) * 0.8;

      // 3. Atualizar nós selecionados
      const activeAgent = agentNodes.find((a) => a.agent.id === selectedAgentId) || agentNodes[0];
      const activeTool = toolNodes.find((t) => t.tool.id === selectedToolId) || toolNodes[0];
      const activeMem = memoryNodes.find((m) => m.memory.id === selectedMemoryId) || memoryNodes[0];

      updateActiveSynapseGeometry(activeAgent, activeTool, activeMem);

      // 4. Máquina de Estados da Sinapse em 3 Etapas
      if (cyclePhaseRef.current !== 'idle' || autoCycleRef.current) {
        if (cyclePhaseRef.current === 'idle' && autoCycleRef.current) {
          cyclePhaseRef.current = 'agent_to_tool';
          cycleTimerRef.current = 0;
        }

        cycleTimerRef.current += delta;
        const t = cycleTimerRef.current;

        if (t < 1.2) {
          // ETAPA 1: AGENTE (NÚCLEO) -> FERRAMENTA (CÓRTEX) [VERMELHA]
          if (cyclePhaseRef.current !== 'agent_to_tool') {
            cyclePhaseRef.current = 'agent_to_tool';
            setCurrentPhase('agent_to_tool');
          }
          setPhaseProgress(t / 1.2);

          (beamAgentToTool.tubeMesh.material as THREE.MeshBasicMaterial).opacity = 0.85;
          (beamAgentToTool.tubeMesh.material as THREE.MeshBasicMaterial).color.setHex(0xef4444);
          (beamToolToAgent.tubeMesh.material as THREE.MeshBasicMaterial).opacity = 0.12;
          (beamAgentToMemory.tubeMesh.material as THREE.MeshBasicMaterial).opacity = 0.12;

          beamAgentToTool.photons.forEach((p) => {
            p.active = true;
            p.progress += p.speed * delta;
            if (p.progress > 1.0) p.progress = 0.0;
            const pt = p.curve.getPoint(p.progress);
            p.mesh.position.copy(pt);
            (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
            (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(0xef4444);
          });
          beamToolToAgent.photons.forEach((p) => ((p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.0));
          beamAgentToMemory.photons.forEach((p) => ((p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.0));

          if (activeTool) {
            activeTool.haloMesh.scale.set(1.4, 1.4, 1.4);
            (activeTool.haloMesh.material as THREE.MeshBasicMaterial).opacity = 0.80;
          }
        } else if (t < 2.4) {
          // ETAPA 2: FERRAMENTA (CÓRTEX) -> AGENTE (NÚCLEO) [AMARELA]
          if (cyclePhaseRef.current !== 'tool_to_agent') {
            cyclePhaseRef.current = 'tool_to_agent';
            setCurrentPhase('tool_to_agent');
          }
          setPhaseProgress((t - 1.2) / 1.2);

          (beamAgentToTool.tubeMesh.material as THREE.MeshBasicMaterial).opacity = 0.15;
          (beamToolToAgent.tubeMesh.material as THREE.MeshBasicMaterial).opacity = 0.90;
          (beamToolToAgent.tubeMesh.material as THREE.MeshBasicMaterial).color.setHex(0xfacc15);
          (beamAgentToMemory.tubeMesh.material as THREE.MeshBasicMaterial).opacity = 0.12;

          beamAgentToTool.photons.forEach((p) => ((p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.0));
          beamToolToAgent.photons.forEach((p) => {
            p.active = true;
            p.progress += p.speed * delta;
            if (p.progress > 1.0) p.progress = 0.0;
            const pt = p.curve.getPoint(p.progress);
            p.mesh.position.copy(pt);
            (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.98;
            (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(0xfacc15);
          });
          beamAgentToMemory.photons.forEach((p) => ((p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.0));

          if (activeAgent) {
            activeAgent.haloMesh.scale.set(1.6, 1.6, 1.6);
            (activeAgent.haloMesh.material as THREE.MeshBasicMaterial).opacity = 0.90;
          }
        } else if (t < 3.8) {
          // ETAPA 3: AGENTE (NÚCLEO) -> MEMÓRIA NO CÓRTEX [VERDE-AZULADO]
          if (cyclePhaseRef.current !== 'agent_to_memory') {
            cyclePhaseRef.current = 'agent_to_memory';
            setCurrentPhase('agent_to_memory');
          }
          setPhaseProgress((t - 2.4) / 1.4);

          (beamAgentToTool.tubeMesh.material as THREE.MeshBasicMaterial).opacity = 0.12;
          (beamToolToAgent.tubeMesh.material as THREE.MeshBasicMaterial).opacity = 0.12;
          (beamAgentToMemory.tubeMesh.material as THREE.MeshBasicMaterial).opacity = 0.90;
          (beamAgentToMemory.tubeMesh.material as THREE.MeshBasicMaterial).color.setHex(0x06b6d4);

          beamAgentToTool.photons.forEach((p) => ((p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.0));
          beamToolToAgent.photons.forEach((p) => ((p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.0));
          beamAgentToMemory.photons.forEach((p) => {
            p.active = true;
            p.progress += p.speed * delta;
            if (p.progress > 1.0) p.progress = 0.0;
            const pt = p.curve.getPoint(p.progress);
            p.mesh.position.copy(pt);
            (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.98;
            (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(0x06b6d4);
          });

          if (activeMem) {
            activeMem.haloMesh.scale.set(1.7, 1.7, 1.7);
            (activeMem.haloMesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
          }
        } else {
          if (autoCycleRef.current) {
            cycleTimerRef.current = 0;
            cyclePhaseRef.current = 'agent_to_tool';
            setCurrentPhase('agent_to_tool');
          } else {
            cyclePhaseRef.current = 'idle';
            setCurrentPhase('idle');
            (beamAgentToTool.tubeMesh.material as THREE.MeshBasicMaterial).opacity = 0.20;
            (beamToolToAgent.tubeMesh.material as THREE.MeshBasicMaterial).opacity = 0.20;
            (beamAgentToMemory.tubeMesh.material as THREE.MeshBasicMaterial).opacity = 0.20;
            dynamicBeams.forEach((b) => b.photons.forEach((p) => ((p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.0)));
          }
        }
      }

      // 5. Efeito de voz e escuta
      if (isJarvisSpeaking) {
        coreLight.intensity = 4.2 + Math.sin(elapsedTime * 12.0) * 1.5;
        coreLight.color.setHex(0xff3333);
      } else if (isListening) {
        cortexTopLight.intensity = 3.8 + Math.sin(elapsedTime * 8.0) * 1.2;
        cortexTopLight.color.setHex(0x00f5ff);
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!currentMount) return;
      const nw = currentMount.clientWidth;
      const nh = currentMount.clientHeight;
      camera.aspect = nw / nh;

      // Reajuste responsivo do enquadramento do cérebro na tela
      const nAspect = nw / nh;
      const nOptimalRadius = nAspect < 0.8 ? 8.2 : nAspect < 1.3 ? 6.8 : 5.8;
      cameraTargetPosRef.current.radius = nOptimalRadius;

      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      updateCameraPos();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      dom.removeEventListener('mousedown', handlePointerDown);
      dom.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      dom.removeEventListener('wheel', handleWheel);
      dom.removeEventListener('click', handleClick);

      dom.removeEventListener('touchstart', handlePointerDown);
      dom.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
      cancelAnimationFrame(animationFrameId);

      renderer.dispose();
      if (currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement);
      }
    };
  }, [effectiveAgents, toolsList, memories, selectedAgentId, selectedToolId, selectedMemoryId]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#02050e] overflow-hidden select-none flex flex-col"
    >
      {/* Canvas Three.js WebGL em Tela Inteira */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* =========================================================================
          BARRA DE FERRAMENTAS SUPERIOR: AJUSTES DE TELA E CICLO SINÁPTICO
          ========================================================================= */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 pointer-events-none z-30">
        {/* Banner do Cérebro 3D */}
        <div className="pointer-events-auto bg-slate-950/85 backdrop-blur-md border border-cyan-500/30 rounded-xl px-3 py-2 shadow-2xl flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.9)]" />
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-cyan-300 font-mono flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Cérebro 3D Anatômico: Núcleo & Córtex
            </h2>
            <p className="text-[9px] text-slate-400 font-sans hidden sm:block">
              2 Hemisférios • Gyri & Sulci • Cerebelo • Tronco Encefálico
            </p>
          </div>
        </div>

        {/* Controles de Câmera e Ajuste de Tela */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-xl p-1.5 shadow-2xl">
          {/* Presets de Vista da Câmera */}
          <div className="hidden lg:flex items-center gap-1 border-r border-slate-800 pr-1.5 mr-0.5">
            <button
              onClick={() => setCameraPreset('iso')}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                currentCameraView === 'iso' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
              title="Vista Isométrica 3D"
            >
              3D Iso
            </button>
            <button
              onClick={() => setCameraPreset('top')}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                currentCameraView === 'top' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
              title="Vista Superior (Dorso dos 2 Hemisférios)"
            >
              Superior
            </button>
            <button
              onClick={() => setCameraPreset('front')}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                currentCameraView === 'front' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
              title="Vista Frontal (Lobo Frontal)"
            >
              Frontal
            </button>
            <button
              onClick={() => setCameraPreset('side')}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                currentCameraView === 'side' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
              title="Vista Lateral (Perfil e Lobo Temporal)"
            >
              Lateral
            </button>
          </div>

          {/* Botões de Zoom */}
          <button
            onClick={() => adjustZoom(-0.8)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Aproximar (Zoom In)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => adjustZoom(0.8)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Afastar (Zoom Out)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          {/* Botão de Auto-Rotação */}
          <button
            onClick={() => {
              autoRotateRef.current = !autoRotateRef.current;
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
            title="Alternar Rotação 3D"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          {/* Botão Tela Cheia */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Modo Tela Cheia"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Botão Ocultar/Exibir Painéis */}
          <button
            onClick={() => setIsUiCollapsed((prev) => !prev)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
            title="Ocultar/Exibir Menus Sobrepostos"
          >
            {isUiCollapsed ? <Layers className="w-3.5 h-3.5 text-amber-400" /> : <Compass className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* =========================================================================
          CONTROLE DO CICLO SINÁPTICO EM 3 ETAPAS (BARRA FLUTUANTE SUPERIOR DIREITA)
          ========================================================================= */}
      {!isUiCollapsed && (
        <div className="absolute top-14 right-2.5 flex items-center gap-2 pointer-events-auto z-20 bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-xl p-2 shadow-2xl">
          {/* Indicador da Etapa Ativa */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border font-mono text-[10px] uppercase font-bold">
            {currentPhase === 'agent_to_tool' && (
              <span className="flex items-center gap-1.5 text-red-400 border-red-500/40 bg-red-950/60 px-2 py-0.5 rounded">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                [1] Agente ➔ Tool (Vermelha)
              </span>
            )}
            {currentPhase === 'tool_to_agent' && (
              <span className="flex items-center gap-1.5 text-yellow-400 border-yellow-500/40 bg-yellow-950/60 px-2 py-0.5 rounded">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
                [2] Tool ➔ Agente (Amarela)
              </span>
            )}
            {currentPhase === 'agent_to_memory' && (
              <span className="flex items-center gap-1.5 text-cyan-300 border-cyan-500/40 bg-cyan-950/60 px-2 py-0.5 rounded">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                [3] Agente ➔ Memória (Verde-Azulado)
              </span>
            )}
            {currentPhase === 'idle' && (
              <span className="text-slate-400 px-2 py-0.5">Repouso Neural</span>
            )}
          </div>

          {/* Botão de Disparo */}
          <button
            onClick={() => triggerSynapseCycle()}
            className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-red-600 via-amber-500 to-cyan-500 hover:opacity-90 text-white rounded-lg text-xs font-bold font-mono transition-all shadow-md active:scale-95"
            title="Disparar sinapse completa em 3 tempos"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Sinapse
          </button>

          {/* Alternar Automático */}
          <button
            onClick={() => setAutoCycle((prev) => !prev)}
            className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border ${
              autoCycle
                ? 'bg-cyan-950/70 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            {autoCycle ? 'Auto' : 'Pausa'}
          </button>
        </div>
      )}

      {/* =========================================================================
          PAINEL DE SELEÇÃO: NÚCLEO (AGENTE) & CÓRTEX (TOOL E MEMÓRIA)
          ========================================================================= */}
      {!isUiCollapsed && (
        <div className="absolute top-14 left-2.5 pointer-events-auto hidden md:flex flex-col gap-2 bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-xl p-2.5 shadow-2xl max-w-xs text-xs font-mono z-20">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pb-1 border-b border-slate-800 flex items-center justify-between">
            <span>Roteamento Anatômico</span>
            <span className="text-[9px] text-cyan-400">Núcleo ➔ Córtex</span>
          </div>

          {/* 1. Agente no Núcleo (Vermelho) */}
          <div className="space-y-1">
            <label className="text-[10px] text-red-400 flex items-center gap-1 font-bold">
              <Cpu className="w-3 h-3 text-red-500" />
              Agente de IA (Núcleo Central):
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => {
                setSelectedAgentId(e.target.value);
                triggerSynapseCycle(e.target.value);
              }}
              className="w-full bg-slate-900 border border-red-500/30 text-red-200 text-[11px] rounded px-2 py-1 outline-none focus:border-red-400"
            >
              {effectiveAgents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Ferramenta no Córtex (Amarela) */}
          <div className="space-y-1">
            <label className="text-[10px] text-yellow-400 flex items-center gap-1 font-bold">
              <Wrench className="w-3 h-3 text-yellow-400" />
              Ferramenta (Córtex Cerebral):
            </label>
            <select
              value={selectedToolId}
              onChange={(e) => {
                setSelectedToolId(e.target.value);
                triggerSynapseCycle(undefined, e.target.value);
              }}
              className="w-full bg-slate-900 border border-yellow-500/30 text-yellow-200 text-[11px] rounded px-2 py-1 outline-none focus:border-yellow-400"
            >
              {toolsList.map((tl) => (
                <option key={tl.id} value={tl.id}>
                  {tl.name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Memória no Córtex (Verde-Azulado) */}
          <div className="space-y-1">
            <label className="text-[10px] text-cyan-400 flex items-center gap-1 font-bold">
              <Database className="w-3 h-3 text-cyan-400" />
              Memória de Destino (Córtex):
            </label>
            <select
              value={selectedMemoryId}
              onChange={(e) => {
                setSelectedMemoryId(e.target.value);
                triggerSynapseCycle(undefined, undefined, e.target.value);
              }}
              className="w-full bg-slate-900 border border-cyan-500/30 text-cyan-200 text-[11px] rounded px-2 py-1 outline-none focus:border-cyan-400"
            >
              {memories.map((mm) => (
                <option key={mm.id} value={mm.id}>
                  {mm.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* =========================================================================
          LEGENDA VISUAL COMPLETA COM CÓDIGO DE CORES EXIGIDO
          ========================================================================= */}
      {!isUiCollapsed && (
        <div className="absolute bottom-2.5 left-2.5 pointer-events-auto bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-xl p-2.5 shadow-2xl max-w-xs text-xs font-mono space-y-2 z-20">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pb-1 border-b border-slate-800 flex items-center justify-between">
            <span>Arquitetura de Cores 3D</span>
            <span className="text-[9px] text-cyan-400">Anatomia</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            {/* Agentes de IA */}
            <div className="flex items-center gap-1.5 p-1 rounded bg-red-950/30 border border-red-500/30">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] shrink-0" />
              <div>
                <span className="font-bold text-red-300 block text-[10px]">Agentes de IA</span>
                <span className="text-[8px] text-red-400/80">Núcleo Central</span>
              </div>
            </div>

            {/* Ferramentas */}
            <div className="flex items-center gap-1.5 p-1 rounded bg-yellow-950/30 border border-yellow-500/30">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)] shrink-0" />
              <div>
                <span className="font-bold text-yellow-300 block text-[10px]">Ferramentas</span>
                <span className="text-[8px] text-yellow-400/80">Córtex Externo</span>
              </div>
            </div>

            {/* Memórias */}
            <div className="flex items-center gap-1.5 p-1 rounded bg-cyan-950/30 border border-cyan-500/30">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.9)] shrink-0" />
              <div>
                <span className="font-bold text-cyan-300 block text-[10px]">Memórias</span>
                <span className="text-[8px] text-cyan-400/80">Córtex Externo</span>
              </div>
            </div>

            {/* Sinapses */}
            <div className="flex items-center gap-1.5 p-1 rounded bg-slate-900/60 border border-slate-700">
              <div className="flex flex-col gap-0.5 shrink-0">
                <span className="w-2 h-1 rounded bg-red-500" />
                <span className="w-2 h-1 rounded bg-yellow-400" />
                <span className="w-2 h-1 rounded bg-cyan-400" />
              </div>
              <div>
                <span className="font-bold text-slate-200 block text-[9px]">3 Sinapses</span>
                <span className="text-[8px] text-slate-400">Verm/Amar/Cyan</span>
              </div>
            </div>
          </div>

          <div className="text-[9px] text-slate-400 pt-1 border-t border-slate-800/60 leading-tight">
            Gire 360° com arrasto • Zoom com roda/botões • Clique num nó para disparar
          </div>
        </div>
      )}

      {/* =========================================================================
          TOOLTIP FLUTUANTE AO PASSAR O MOUSE SOBRE QUALQUER NÓ 3D
          ========================================================================= */}
      {hoveredNode && (
        <div className="absolute top-24 right-4 pointer-events-none bg-slate-950/90 backdrop-blur-md border border-slate-700 rounded-xl p-3 shadow-2xl max-w-xs transition-all text-xs space-y-1.5 z-30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: hoveredNode.color, boxShadow: `0 0 10px ${hoveredNode.color}` }}
              />
              <span className="font-bold text-white font-mono text-[11px] truncate">
                {hoveredNode.name}
              </span>
            </div>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase"
              style={{
                backgroundColor: `${hoveredNode.color}20`,
                borderColor: `${hoveredNode.color}50`,
                color: hoveredNode.color,
                borderWidth: 1,
              }}
            >
              {hoveredNode.location}
            </span>
          </div>

          {hoveredNode.description && (
            <p className="text-[11px] text-slate-300 font-sans leading-snug">
              {hoveredNode.description}
            </p>
          )}

          {hoveredNode.details && (
            <div className="text-[9px] text-slate-400 font-mono pt-1 border-t border-slate-800">
              {hoveredNode.details}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
