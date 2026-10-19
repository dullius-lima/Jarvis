import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import {
  SynapseMemory,
  SentimentAnalysisResult,
  AgentDefinition,
  AgentNerveSignal,
  BodyPartAnatomy,
} from '../types/neural';
import { toolService, ToolDefinition } from '../services/toolService';
import { brainLinkService, ActivePulseState } from '../services/brainLinkService';
import {
  DEFAULT_DENDRITES,
  DEFAULT_AXONS,
  NEUROTRANSMITTER_CONFIGS,
  DendriteNode,
  AxonEdge,
} from '../types/brainLink';
import { BrainLeftIconDock, BRAIN_LOBES } from './BrainLeftIconDock';
import {
  Maximize2,
  Minimize2,
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

export const RealisticBrainCanvas: React.FC<RealisticBrainCanvasProps> = ({
  memories = [],
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

  // Ferramentas reais do ToolService (Apenas criações e integrações reais)
  const [toolsList, setToolsList] = useState<ToolDefinition[]>(() => toolService.listTools());

  useEffect(() => {
    const unsub = toolService.subscribe(() => {
      setToolsList(toolService.listTools());
    });
    return () => unsub();
  }, []);

  // Seleções ativas nos menus
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [selectedToolId, setSelectedToolId] = useState<string>('');
  const [selectedMemoryId, setSelectedMemoryId] = useState<string>('');
  const [selectedLobeId, setSelectedLobeId] = useState<string | null>(null);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentCameraView, setCurrentCameraView] = useState<'iso' | 'top' | 'front' | 'side'>('iso');
  const [isAutoRotating, setIsAutoRotating] = useState<boolean>(true);

  // Tooltip flutuante discreto em hover
  const [hoveredNode, setHoveredNode] = useState<{
    type: 'agent' | 'tool' | 'memory' | 'lobe' | 'dendrite';
    name: string;
    description?: string;
    details?: string;
    location: string;
    color: string;
  } | null>(null);

  // Interação de Câmera Orbital com Mouse / Touch
  const isPointerDownRef = useRef<boolean>(false);
  const pointerPrevRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchStartDistRef = useRef<number>(0);
  const cameraTargetPosRef = useRef<{ theta: number; phi: number; radius: number }>({
    theta: 0.35,
    phi: 1.25,
    radius: 6.2,
  });
  const autoRotateRef = useRef<boolean>(true);
  autoRotateRef.current = isAutoRotating;

  const updateCameraFnRef = useRef<(() => void) | null>(null);
  const focusLobeFnRef = useRef<((lobeId: string) => void) | null>(null);

  // APENAS CRIAÇÕES REAIS DO USUÁRIO (Zero simulações ou nós fictícios)
  const effectiveAgents = useMemo(() => {
    if (agents && agents.length > 0) {
      return agents;
    }
    // Agente supervisor nativo líder
    return [
      {
        id: 'jarvis-supervisor',
        name: 'Jarvis Supervisor',
        role: 'Orquestrador Geral do Núcleo',
        targetDatabase: 'GLOBAL',
        logic: 'Decisão e roteamento de inteligência híbrida',
        llmProvider: 'gemini' as const,
        model: 'gemini-2.5-flash',
        status: 'ativo' as const,
        triggers: ['voz', 'texto', 'rotina'],
        isAutonomous: true,
        createdAt: '2026',
        author: 'Matheus',
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

  // Função para alternar modos de câmera para ajuste de tela
  const setCameraPreset = useCallback((view: 'iso' | 'top' | 'front' | 'side') => {
    setCurrentCameraView(view);
    const r = cameraTargetPosRef.current.radius;
    if (view === 'iso') {
      cameraTargetPosRef.current = { theta: 0.35, phi: 1.25, radius: r };
    } else if (view === 'top') {
      cameraTargetPosRef.current = { theta: 0.0, phi: 0.15, radius: r };
    } else if (view === 'front') {
      cameraTargetPosRef.current = { theta: 0.0, phi: Math.PI * 0.5, radius: r };
    } else if (view === 'side') {
      cameraTargetPosRef.current = { theta: Math.PI * 0.5, phi: Math.PI * 0.5, radius: r };
    }
    updateCameraFnRef.current?.();
  }, []);

  // Ajuste de zoom via botões
  const adjustZoom = useCallback((deltaRadius: number) => {
    cameraTargetPosRef.current.radius = Math.max(
      3.2,
      Math.min(11.0, cameraTargetPosRef.current.radius + deltaRadius)
    );
    updateCameraFnRef.current?.();
  }, []);

  // Alternar tela cheia
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Selecionar e focar lobo anatômico
  const handleSelectLobe = useCallback((lobeId: string) => {
    setSelectedLobeId((prev) => (prev === lobeId ? null : lobeId));
    focusLobeFnRef.current?.(lobeId);
  }, []);

  // =========================================================================
  // SETUP THREE.JS — CÉREBRO 3D BIOLUMINESCENTE FACETADO (ESTILO ORIGINAL + ALTA DEFINIÇÃO)
  // =========================================================================
  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const width = currentMount.clientWidth || window.innerWidth;
    const height = currentMount.clientHeight || window.innerHeight;

    // Ajuste dinâmico do enquadramento de acordo com a proporção da tela
    const aspect = width / height;
    const optimalRadius = aspect < 0.75 ? 8.6 : aspect < 1.2 ? 7.2 : 5.8;
    cameraTargetPosRef.current.radius = optimalRadius;

    // 1. Cena Three.js
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02050e, 0.030);

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

    // 3. Renderizador WebGL de Alta Performance
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      precision: 'highp',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.30;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x02050e, 1.0);
    currentMount.appendChild(renderer.domElement);

    // 4. Luzes Anatômicas e Bioluminescentes (Estúdio Cyber-Neural)
    const ambientLight = new THREE.AmbientLight(0x071b36, 1.5);
    scene.add(ambientLight);

    // Luz Central no Núcleo (Vermelha intensa / Tálamo profundo)
    const coreLight = new THREE.PointLight(0xef4444, 3.6, 10);
    coreLight.position.set(0, 0, 0);
    scene.add(coreLight);

    // Luz Frontal Superior (Ciano Elétrico)
    const frontalLight = new THREE.DirectionalLight(0x00f5ff, 2.0);
    frontalLight.position.set(0, 4.0, 3.5);
    scene.add(frontalLight);

    // Luz Lateral (Azul Safira)
    const lateralLight = new THREE.PointLight(0x38bdf8, 2.4, 12);
    lateralLight.position.set(3.0, 0.5, 0.8);
    scene.add(lateralLight);

    // Luz Traseira Rim Light (Destaque preciso de silhueta e bordas cristalinas)
    const rimBackLight = new THREE.DirectionalLight(0x38bdf8, 2.8);
    rimBackLight.position.set(-2.2, 3.2, -4.0);
    scene.add(rimBackLight);

    const rimBottomLight = new THREE.DirectionalLight(0x10b981, 1.8);
    rimBottomLight.position.set(2.2, -3.2, -2.5);
    scene.add(rimBottomLight);

    // 5. Grupos Principais
    const brainMasterGroup = new THREE.Group();
    scene.add(brainMasterGroup);

    const hemispheresGroup = new THREE.Group();
    brainMasterGroup.add(hemispheresGroup);

    const coreGroup = new THREE.Group();
    brainMasterGroup.add(coreGroup);

    const userNodesGroup = new THREE.Group();
    brainMasterGroup.add(userNodesGroup);

    const synapsesGroup = new THREE.Group();
    brainMasterGroup.add(synapsesGroup);

    const interactiveMeshes: THREE.Mesh[] = [];

    // =========================================================================
    // A. OS DOIS HEMISFÉRIOS CEREBRAIS ANATÔMICOS (FACETADO + TRANSLÚCIDO + BEM DEFINIDO)
    // Conforme imagem original: Malha poligonal facetada azul, fissura medial e transparência nítida
    // =========================================================================
    const createAnatomicalHemisphereGeometry = (isRight: boolean): THREE.BufferGeometry => {
      // 32 segmentos azimutais por 24 polares para gerar facetas triangulares nítidas
      const uSegs = 32;
      const vSegs = 22;
      const vertices: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      const xSign = isRight ? 1 : -1;
      const sagittalGap = 0.11 * xSign; // Fissura inter-hemisférica sagital bem visível

      for (let j = 0; j <= vSegs; j++) {
        const v = j / vSegs;
        const phi = v * Math.PI; // 0 (topo) a PI (base)

        for (let i = 0; i <= uSegs; i++) {
          const u = i / uSegs;
          const theta = u * Math.PI * 2;

          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          const sinP = Math.sin(phi);
          const cosP = Math.cos(phi);

          // Morfologia Anatômica Humana Definida:
          // Eixo Z: Rostro-caudal (Frontal amplo à frente, Occipital afilado atrás)
          const zBase = cosP * 1.55;
          const frontalWiden = zBase > 0 ? 1.08 + zBase * 0.14 : 0.98 - Math.abs(zBase) * 0.16;

          // Lobo Temporal: protuberância lateral-inferior anteroinferior
          const isTemporal = sinP > 0.45 && cosP > -0.35 && Math.abs(cosT) > 0.45;
          const temporalBulge = isTemporal ? 0.22 * Math.sin(phi * 2.2) : 0.0;

          // Lobo Parietal / Cúpula dorsal
          const parietalLift = sinP > 0.25 && sinP < 0.82 && cosP < 0.20 ? 0.10 : 0.0;

          // Convoluções de Giros e Sulcos mais definidas (ondas harmônicas)
          const g1 = Math.sin(phi * 12.0) * Math.cos(theta * 8.0) * 0.085;
          const g2 = Math.cos(phi * 18.0 + theta * 14.0) * 0.045;
          const sulcusIndent = -Math.abs(Math.sin(phi * 6.5 + theta * 5.0)) * 0.035;
          const gyriTotal = g1 + g2 + sulcusIndent;

          const r = (1.28 + gyriTotal + temporalBulge + parietalLift) * frontalWiden;

          // Achatamento medial na linha sagital interna (face interna plana para a fenda medial)
          const medialComp = isRight ? Math.max(0.10, cosT * 1.15) : Math.min(-0.10, cosT * 1.15);

          const x = (medialComp * r * 0.86 + sagittalGap);
          const y = (sinP * sinT * r * 0.80) + 0.10;
          const z = zBase * (1.0 + gyriTotal * 0.4);

          vertices.push(x, y, z);
          uvs.push(u, v);
        }
      }

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

    // Material das Facetas de Vidro Azul-Marinho Translúcido (como no screenshot)
    const hemisphereFacetedMat = new THREE.MeshPhongMaterial({
      color: 0x08254f,
      emissive: 0x031326,
      specular: 0x38bdf8,
      shininess: 90,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      side: THREE.DoubleSide,
      flatShading: true, // Garante o relevo facetado triangular bem definido
    });

    // Material do Wireframe Laranja/Ciano Elétrico (Linhas trianguladas do screenshot)
    const hemisphereWireframeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Hemisfério Esquerdo
    const leftGeo = createAnatomicalHemisphereGeometry(false);
    const leftMesh = new THREE.Mesh(leftGeo, hemisphereFacetedMat);
    const leftWire = new THREE.Mesh(leftGeo, hemisphereWireframeMat);
    leftMesh.userData = { type: 'hemisphere', name: 'Hemisfério Esquerdo' };
    hemispheresGroup.add(leftMesh);
    hemispheresGroup.add(leftWire);
    interactiveMeshes.push(leftMesh);

    // Hemisfério Direito
    const rightGeo = createAnatomicalHemisphereGeometry(true);
    const rightMesh = new THREE.Mesh(rightGeo, hemisphereFacetedMat);
    const rightWire = new THREE.Mesh(rightGeo, hemisphereWireframeMat);
    rightMesh.userData = { type: 'hemisphere', name: 'Hemisfério Direito' };
    hemispheresGroup.add(rightMesh);
    hemispheresGroup.add(rightWire);
    interactiveMeshes.push(rightMesh);

    // =========================================================================
    // B. NÚCLEO CENTRAL TÁLAMO-LÍMBICO (ESFERA VERMELHA COM ONDAS VERDES/CIANO)
    // Conforme exatamente visto no print original
    // =========================================================================
    const coreRadius = 0.65;
    const nucleusWireGeo = new THREE.SphereGeometry(coreRadius, 20, 20);
    const nucleusWireMat = new THREE.MeshBasicMaterial({
      color: 0xef4444, // Malha de arame vermelho como no print
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const nucleusWireMesh = new THREE.Mesh(nucleusWireGeo, nucleusWireMat);
    coreGroup.add(nucleusWireMesh);

    // Núcleo interno denso incandescente
    const innerKernelGeo = new THREE.SphereGeometry(coreRadius * 0.45, 16, 16);
    const innerKernelMat = new THREE.MeshBasicMaterial({
      color: 0xff3333,
      transparent: true,
      opacity: 0.85,
    });
    const innerKernelMesh = new THREE.Mesh(innerKernelGeo, innerKernelMat);
    coreGroup.add(innerKernelMesh);

    // Ondas / Feixes Sinápticos Horizontais Verdes e Cianos (como visto no screenshot)
    const wavePlaneGeo = new THREE.PlaneGeometry(1.4, 0.55);
    wavePlaneGeo.rotateX(Math.PI * 0.5);
    const wavePlaneMat = new THREE.MeshBasicMaterial({
      color: 0x10b981, // Verde elétrico visto no centro do screenshot
      transparent: true,
      opacity: 0.40,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const wavePlaneMesh = new THREE.Mesh(wavePlaneGeo, wavePlaneMat);
    wavePlaneMesh.position.set(0, 0, 0);
    coreGroup.add(wavePlaneMesh);

    const wavePlane2Mat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff, // Ciano elétrico cruzado
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const wavePlane2Mesh = new THREE.Mesh(wavePlaneGeo, wavePlane2Mat);
    wavePlane2Mesh.rotation.y = Math.PI * 0.35;
    coreGroup.add(wavePlane2Mesh);

    // =========================================================================
    // C. TRONCO ENCEFÁLICO (COLUNA CILÍNDRICA WIREFRAME AZUL)
    // Conforme exatamente visto na base do print original
    // =========================================================================
    const stemGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.15, 14, 8, true);
    const stemWireMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, // Ciano/azul elétrico
      wireframe: true,
      transparent: true,
      opacity: 0.60,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const stemMesh = new THREE.Mesh(stemGeo, stemWireMat);
    stemMesh.position.set(0, -0.92, -0.38);
    hemispheresGroup.add(stemMesh);

    // Cerebelo póstero-inferior wireframe
    const cerebGeo = new THREE.SphereGeometry(0.52, 16, 12);
    cerebGeo.scale(0.70, 0.42, 0.55);
    const cerebMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const leftCereb = new THREE.Mesh(cerebGeo, cerebMat);
    leftCereb.position.set(-0.45, -0.65, -1.05);
    hemispheresGroup.add(leftCereb);

    const rightCereb = new THREE.Mesh(cerebGeo, cerebMat);
    rightCereb.position.set(0.45, -0.65, -1.05);
    hemispheresGroup.add(rightCereb);

    // Pontos sinápticos bioluminescentes sobre os vértices corticais
    const corticalPlexusPoints: THREE.Vector3[] = [];
    const numPlexus = 700;
    for (let k = 0; k < numPlexus; k++) {
      const isR = Math.random() > 0.5;
      const xS = isR ? 1 : -1;
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * Math.PI;

      const rX = Math.sin(v) * Math.cos(u);
      const rY = Math.sin(v) * Math.sin(u);
      const rZ = Math.cos(v);

      const pX = (Math.max(0.10, Math.abs(rX)) * 1.15 * xS) + (isR ? 0.08 : -0.08);
      const pY = rY * 0.85 + 0.12;
      const pZ = rZ * 1.45;

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
    hemispheresGroup.add(new THREE.Points(plexusGeo, plexusMat));

    // =========================================================================
    // D. NÓS REAIS DO USUÁRIO FIXADOS NO CÉREBRO (SEM NÓS SOLTOS NO VAZIO)
    // =========================================================================

    // 1. Agentes de IA Reais Criados pelo Usuário (Cor: Vermelha)
    interface AgentNode3D {
      agent: AgentDefinition;
      pos: THREE.Vector3;
      mesh: THREE.Mesh;
      haloMesh: THREE.Mesh;
    }
    const agentNodes: AgentNode3D[] = [];

    effectiveAgents.forEach((agent, idx) => {
      const isSupervisor = idx === 0 || agent.id === 'jarvis-supervisor';

      let pos: THREE.Vector3;
      if (isSupervisor) {
        pos = new THREE.Vector3(0, 0, 0.05);
      } else {
        const angle = ((idx - 1) / Math.max(1, effectiveAgents.length - 1)) * Math.PI * 2;
        const rOrbit = 0.42 + (idx % 2) * 0.12;
        pos = new THREE.Vector3(
          Math.cos(angle) * rOrbit,
          Math.sin(idx * 1.8) * 0.18,
          Math.sin(angle) * rOrbit * 0.8
        );
      }

      const agentRadius = isSupervisor ? 0.080 : 0.054;
      const agentGeo = new THREE.SphereGeometry(agentRadius, 16, 16);
      const agentMat = new THREE.MeshBasicMaterial({
        color: 0xef4444, // VERMELHO VIBRANTE
        transparent: true,
        opacity: 0.98,
      });
      const agentMesh = new THREE.Mesh(agentGeo, agentMat);
      agentMesh.position.copy(pos);
      agentMesh.userData = { type: 'agent', data: agent };
      userNodesGroup.add(agentMesh);
      interactiveMeshes.push(agentMesh);

      agentMesh.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(agentRadius * 0.45, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        )
      );

      const haloGeo = new THREE.SphereGeometry(agentRadius * 1.7, 12, 12);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xdc2626,
        transparent: true,
        opacity: 0.40,
        blending: THREE.AdditiveBlending,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.position.copy(pos);
      userNodesGroup.add(haloMesh);

      agentNodes.push({
        agent,
        pos,
        mesh: agentMesh,
        haloMesh,
      });
    });

    // 2. Ferramentas do Córtex do Usuário (Cor: Amarela)
    interface ToolNode3D {
      tool: ToolDefinition;
      pos: THREE.Vector3;
      mesh: THREE.Mesh;
      haloMesh: THREE.Mesh;
    }
    const toolNodes: ToolNode3D[] = [];

    toolsList.forEach((tool, idx) => {
      const u = (idx / Math.max(1, toolsList.length)) * Math.PI * 2;
      const isR = Math.cos(u) >= 0;
      const xS = isR ? 1 : -1;
      const phi = 0.55 + ((idx % 3) / 3) * 0.85;

      const pX = (Math.sin(phi) * Math.abs(Math.cos(u)) * 1.05 * xS) + (isR ? 0.18 : -0.18);
      const pY = (Math.sin(phi) * Math.sin(u) * 0.72) + 0.16;
      const pZ = Math.cos(phi) * 1.25;
      const pos = new THREE.Vector3(pX, pY, pZ);

      const toolGeo = new THREE.SphereGeometry(0.055, 14, 14);
      const toolMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15, // AMARELO OURO
        transparent: true,
        opacity: 0.95,
      });
      const toolMesh = new THREE.Mesh(toolGeo, toolMat);
      toolMesh.position.copy(pos);
      toolMesh.userData = { type: 'tool', data: tool };
      userNodesGroup.add(toolMesh);
      interactiveMeshes.push(toolMesh);

      toolMesh.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.022, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xfffbeb })
        )
      );

      const toolHalo = new THREE.Mesh(
        new THREE.SphereGeometry(0.095, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0xeab308,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
        })
      );
      toolHalo.position.copy(pos);
      userNodesGroup.add(toolHalo);

      toolNodes.push({
        tool,
        pos,
        mesh: toolMesh,
        haloMesh: toolHalo,
      });
    });

    // 3. Memórias Sinápticas Reais (Cor: Verde-Azulado / Cyan)
    interface MemoryNode3D {
      memory: SynapseMemory;
      pos: THREE.Vector3;
      mesh: THREE.Mesh;
      haloMesh: THREE.Mesh;
    }
    const memoryNodes: MemoryNode3D[] = [];

    memories.forEach((mem, idx) => {
      const u = ((idx * 2 + 1) / Math.max(1, memories.length * 2)) * Math.PI * 2;
      const isR = Math.cos(u) >= 0;
      const xS = isR ? 1 : -1;
      const phi = 1.05 + ((idx % 3) / 3) * 1.05;

      const pX = (Math.sin(phi) * Math.abs(Math.cos(u)) * 1.02 * xS) + (isR ? 0.16 : -0.16);
      const pY = (Math.sin(phi) * Math.sin(u) * 0.70) + 0.10;
      const pZ = Math.cos(phi) * 1.30;
      const pos = new THREE.Vector3(pX, pY, pZ);

      const memGeo = new THREE.SphereGeometry(0.052, 14, 14);
      const memMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4, // CIANO / VERDE-AZULADO
        transparent: true,
        opacity: 0.95,
      });
      const memMesh = new THREE.Mesh(memGeo, memMat);
      memMesh.position.copy(pos);
      memMesh.userData = { type: 'memory', data: mem };
      userNodesGroup.add(memMesh);
      interactiveMeshes.push(memMesh);

      memMesh.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.020, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xe0f2fe })
        )
      );

      const memHalo = new THREE.Mesh(
        new THREE.SphereGeometry(0.090, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0x0891b2,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
        })
      );
      memHalo.position.copy(pos);
      userNodesGroup.add(memHalo);

      memoryNodes.push({
        memory: mem,
        pos,
        mesh: memMesh,
        haloMesh: memHalo,
      });
    });

    // =========================================================================
    // E. PROTOCOLO BRAINLINK: DENDRITOS, AXÔNIOS E SINAPSES ANCORADOS
    // =========================================================================
    const brainLinkGroup = new THREE.Group();
    brainMasterGroup.add(brainLinkGroup);

    interface Dendrite3D {
      node: DendriteNode;
      coreMesh: THREE.Mesh;
      haloMesh: THREE.Mesh;
      pos: THREE.Vector3;
    }
    const dendrite3DMap = new Map<string, Dendrite3D>();

    DEFAULT_DENDRITES.forEach((d) => {
      const pos = new THREE.Vector3(...d.position);
      const coreGeo = new THREE.SphereGeometry(0.058, 14, 14);
      const coreMat = new THREE.MeshBasicMaterial({
        color: d.color,
        transparent: true,
        opacity: 0.95,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.copy(pos);
      brainLinkGroup.add(coreMesh);

      const haloGeo = new THREE.SphereGeometry(0.11, 14, 14);
      const haloMat = new THREE.MeshBasicMaterial({
        color: d.color,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.position.copy(pos);
      brainLinkGroup.add(haloMesh);

      coreMesh.userData = {
        type: 'dendrite',
        data: d,
      };
      interactiveMeshes.push(coreMesh);

      dendrite3DMap.set(d.id, {
        node: d,
        coreMesh,
        haloMesh,
        pos,
      });
    });

    interface Axon3D {
      edge: AxonEdge;
      curve: THREE.CatmullRomCurve3;
      tubeMesh: THREE.Mesh;
    }
    const axon3DMap = new Map<string, Axon3D>();

    DEFAULT_AXONS.forEach((a) => {
      const srcD = dendrite3DMap.get(a.source_dendrite);
      const tgtD = dendrite3DMap.get(a.target_dendrite);
      if (srcD && tgtD) {
        const mid = new THREE.Vector3().addVectors(srcD.pos, tgtD.pos).multiplyScalar(0.5);
        const outward = mid.clone().normalize().multiplyScalar(0.28);
        mid.add(outward);

        const curve = new THREE.CatmullRomCurve3([srcD.pos.clone(), mid, tgtD.pos.clone()]);
        const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.008, 6, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.20,
          blending: THREE.AdditiveBlending,
        });
        const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
        brainLinkGroup.add(tubeMesh);

        axon3DMap.set(a.id, {
          edge: a,
          curve,
          tubeMesh,
        });
      }
    });

    const MAX_PULSE_PHOTONS = 24;
    const pulsePhotonPool: THREE.Mesh[] = [];
    for (let pIdx = 0; pIdx < MAX_PULSE_PHOTONS; pIdx++) {
      const photonGeo = new THREE.SphereGeometry(0.040, 10, 10);
      const photonMat = new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
      });
      const photonMesh = new THREE.Mesh(photonGeo, photonMat);
      brainLinkGroup.add(photonMesh);
      pulsePhotonPool.push(photonMesh);
    }

    const brokenSparkLines: THREE.Line[] = [];
    const NUM_SPARK_LINES = 6;
    for (let sIdx = 0; sIdx < NUM_SPARK_LINES; sIdx++) {
      const sparkPositions = new Float32Array(5 * 3);
      const sparkGeo = new THREE.BufferGeometry();
      sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
      const sparkMat = new THREE.LineBasicMaterial({
        color: 0xff4500,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        linewidth: 2,
      });
      const sparkLine = new THREE.Line(sparkGeo, sparkMat);
      brainLinkGroup.add(sparkLine);
      brokenSparkLines.push(sparkLine);
    }

    // Foco de câmera em lobo selecionado
    focusLobeFnRef.current = (lobeId: string) => {
      const r = cameraTargetPosRef.current.radius;
      if (lobeId === 'frontal') {
        cameraTargetPosRef.current = { theta: 0.10, phi: 1.10, radius: r };
      } else if (lobeId === 'parietal') {
        cameraTargetPosRef.current = { theta: 0.15, phi: 0.50, radius: r };
      } else if (lobeId === 'occipital') {
        cameraTargetPosRef.current = { theta: Math.PI * 0.95, phi: 1.25, radius: r };
      } else if (lobeId === 'temporal') {
        cameraTargetPosRef.current = { theta: Math.PI * 0.55, phi: 1.35, radius: r };
      } else if (lobeId === 'cerebellum') {
        cameraTargetPosRef.current = { theta: Math.PI * 0.85, phi: 1.70, radius: r };
      } else if (lobeId === 'brainstem') {
        cameraTargetPosRef.current = { theta: 0.15, phi: 1.80, radius: r };
      }
      updateCameraPos();
    };

    // =========================================================================
    // F. INTERAÇÃO E EVENTOS (RAYCASTING & CONTROLES TOUCH / MOUSE)
    // =========================================================================
    const raycaster = new THREE.Raycaster();
    const mouseCoord = new THREE.Vector2();

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      isPointerDownRef.current = true;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      pointerPrevRef.current = { x: clientX, y: clientY };

      if ('touches' in e && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDistRef.current = Math.hypot(dx, dy);
      }
    };

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      if ('touches' in e && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const delta = (touchStartDistRef.current - dist) * 0.015;
        touchStartDistRef.current = dist;
        cameraTargetPosRef.current.radius = Math.max(
          3.2,
          Math.min(11.0, cameraTargetPosRef.current.radius + delta)
        );
        updateCameraPos();
        return;
      }

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

      if (!('touches' in e) && currentMount) {
        const rect = currentMount.getBoundingClientRect();
        mouseCoord.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        mouseCoord.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouseCoord, camera);
        const intersects = raycaster.intersectObjects(interactiveMeshes, false);

        if (intersects.length > 0) {
          const hit = intersects[0].object;
          const uData = hit.userData;
          if (uData.type === 'agent') {
            const ag: AgentDefinition = uData.data;
            setHoveredNode({
              type: 'agent',
              name: ag.name,
              description: ag.role,
              details: `LLM: ${ag.llmProvider.toUpperCase()} (${ag.model}) • BD: ${ag.targetDatabase || 'NÚCLEO'}`,
              location: 'NÚCLEO CENTRAL',
              color: '#ef4444',
            });
          } else if (uData.type === 'tool') {
            const tl: ToolDefinition = uData.data;
            setHoveredNode({
              type: 'tool',
              name: tl.name,
              description: tl.description,
              details: `Tipo: ${tl.type.toUpperCase()}`,
              location: 'CÓRTEX CEREBRAL',
              color: '#facc15',
            });
          } else if (uData.type === 'memory') {
            const mm: SynapseMemory = uData.data;
            setHoveredNode({
              type: 'memory',
              name: mm.title,
              description: mm.content,
              details: `Categoria: ${mm.category.toUpperCase()}`,
              location: 'CÓRTEX CEREBRAL',
              color: '#06b6d4',
            });
          } else if (uData.type === 'dendrite') {
            const dn: DendriteNode = uData.data;
            setHoveredNode({
              type: 'dendrite',
              name: dn.name,
              description: dn.label,
              details: `Interface: ${dn.type.toUpperCase()}`,
              location: 'SUPERFÍCIE ANATÔMICA',
              color: '#00e5ff',
            });
          } else if (uData.type === 'hemisphere') {
            setHoveredNode({
              type: 'lobe',
              name: uData.name,
              description: 'Córtex neural com fissura sagital inter-hemisférica',
              details: 'Topologia facetada de alta definição',
              location: 'HEMISFÉRIO CEREBRAL',
              color: '#38bdf8',
            });
          }
        } else {
          setHoveredNode(null);
        }
      }
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraTargetPosRef.current.radius = Math.max(
        3.2,
        Math.min(11.0, cameraTargetPosRef.current.radius + e.deltaY * 0.004)
      );
      updateCameraPos();
    };

    const handleClick = (e: MouseEvent) => {
      if (!currentMount) return;
      const rect = currentMount.getBoundingClientRect();
      mouseCoord.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseCoord.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouseCoord, camera);
      const intersects = raycaster.intersectObjects(interactiveMeshes, false);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const uData = hit.userData;
        if (uData.type === 'agent') {
          onSelectAgent?.(uData.data);
        } else if (uData.type === 'memory') {
          onSelectMemory?.(uData.data);
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
    // G. LOOP DE ANIMAÇÃO 60 FPS (ONDAS INTERNAS, PULSOS E FÓTONS)
    // =========================================================================
    const clock = new THREE.Clock();
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();
      const now = Date.now();

      // Auto-rotação suave
      if (autoRotateRef.current && !isPointerDownRef.current) {
        cameraTargetPosRef.current.theta += delta * 0.18;
        updateCameraPos();
      }

      // Rotação orgânica sutil
      brainMasterGroup.rotation.y = Math.sin(elapsedTime * 0.35) * 0.04;
      brainMasterGroup.position.y = Math.sin(elapsedTime * 0.8) * 0.03;

      // Pulsação das ondas/feixes verdes e cianos no centro do núcleo
      wavePlaneMesh.rotation.z = elapsedTime * 0.8;
      wavePlane2Mesh.rotation.z = -elapsedTime * 0.6;
      const wavePulse = 0.32 + Math.sin(elapsedTime * 3.5) * 0.12;
      (wavePlaneMat as THREE.MeshBasicMaterial).opacity = wavePulse;
      (wavePlane2Mat as THREE.MeshBasicMaterial).opacity = wavePulse * 0.85;

      // Pulsação sutil da malha de arame dos hemisférios
      (hemisphereWireframeMat as THREE.MeshBasicMaterial).opacity =
        0.58 + Math.sin(elapsedTime * 2.0) * 0.10;

      // Animação dos pulsos WebSocket do BrainLink
      const { activePulses, brokenSparks } = brainLinkService.updatePulses(now);

      pulsePhotonPool.forEach((m, idx) => {
        if (idx < activePulses.length) {
          const pulse = activePulses[idx];
          const axon = axon3DMap.get(pulse.event.axon_id);
          if (axon) {
            m.visible = true;
            const tParam = pulse.event.direction === 'FORWARD' ? pulse.progress : 1.0 - pulse.progress;
            const pt = axon.curve.getPoint(Math.max(0, Math.min(1, tParam)));

            const cfg =
              NEUROTRANSMITTER_CONFIGS[pulse.event.neurotransmitter_type] ||
              NEUROTRANSMITTER_CONFIGS.SEROTONINA;

            const jitterAmount =
              pulse.event.neurotransmitter_type === 'ADRENALINA'
                ? 0.030
                : pulse.event.neurotransmitter_type === 'CORTISOL'
                ? 0.020
                : 0.006;
            const jitterX = Math.sin(elapsedTime * cfg.frequency + idx) * jitterAmount;
            const jitterY = Math.cos(elapsedTime * cfg.frequency * 1.2 + idx) * jitterAmount;
            m.position.set(pt.x + jitterX, pt.y + jitterY, pt.z);

            const pulseScale =
              (0.9 + Math.sin(elapsedTime * cfg.frequency) * 0.3) *
              (0.8 + pulse.event.intensity * 0.8);
            m.scale.set(pulseScale, pulseScale, pulseScale);

            const mat = m.material as THREE.MeshBasicMaterial;
            mat.color.setHex(cfg.colorThree);
            mat.opacity = pulse.fadeAlpha * (0.4 + pulse.event.intensity * 0.6);

            (axon.tubeMesh.material as THREE.MeshBasicMaterial).color.setHex(cfg.colorThree);
            (axon.tubeMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
              0.18,
              pulse.fadeAlpha * 0.75
            );
          } else {
            m.visible = false;
          }
        } else {
          m.visible = false;
        }
      });

      brokenSparkLines.forEach((spkLine, spkIdx) => {
        if (brokenSparks.length > 0) {
          const brokenPulse = brokenSparks[0];
          const axon = axon3DMap.get(brokenPulse.event.axon_id);
          if (axon && brokenPulse.progress >= 0.25) {
            spkLine.visible = true;
            const breakPt = axon.curve.getPoint(0.5);
            const posAttr = spkLine.geometry.getAttribute('position') as THREE.BufferAttribute;
            const positions = posAttr.array as Float32Array;

            let curX = breakPt.x;
            let curY = breakPt.y;
            let curZ = breakPt.z;

            for (let v = 0; v < 5; v++) {
              positions[v * 3] = curX;
              positions[v * 3 + 1] = curY;
              positions[v * 3 + 2] = curZ;

              const spread = 0.12 * (1.0 + Math.random() * 0.2);
              curX += (Math.random() - 0.5) * spread;
              curY += (Math.random() - 0.5) * spread + 0.02;
              curZ += (Math.random() - 0.5) * spread;
            }
            posAttr.needsUpdate = true;

            const spkMat = spkLine.material as THREE.LineBasicMaterial;
            spkMat.color.setHex(spkIdx % 2 === 0 ? 0xff4500 : 0xffd700);
            spkMat.opacity = Math.random() > 0.2 ? brokenPulse.fadeAlpha * 0.95 : 0.2;
          } else {
            spkLine.visible = false;
          }
        } else {
          spkLine.visible = false;
        }
      });

      dendrite3DMap.forEach((d) => {
        const charge = d.node.electrical_charge;
        const baseScale = 1.0 + charge * 0.8 + Math.sin(elapsedTime * 3.5) * 0.06;
        d.haloMesh.scale.set(baseScale, baseScale, baseScale);
        (d.haloMesh.material as THREE.MeshBasicMaterial).opacity = Math.min(
          0.95,
          0.25 + charge * 0.7
        );
      });

      if (isJarvisSpeaking) {
        coreLight.intensity = 4.2 + Math.sin(elapsedTime * 12.0) * 1.5;
        coreLight.color.setHex(0xff3333);
      } else if (isListening) {
        frontalLight.intensity = 3.8 + Math.sin(elapsedTime * 8.0) * 1.2;
        frontalLight.color.setHex(0x00f5ff);
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!currentMount) return;
      const nw = currentMount.clientWidth;
      const nh = currentMount.clientHeight;
      camera.aspect = nw / nh;

      const nAspect = nw / nh;
      const nOptimalRadius = nAspect < 0.75 ? 8.6 : nAspect < 1.2 ? 7.2 : 5.8;
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
  }, [effectiveAgents, toolsList, memories, selectedLobeId]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#02050e] overflow-hidden select-none flex flex-col"
    >
      {/* Canvas Three.js WebGL em Tela Inteira (100% Desobstruído no Centro) */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* =========================================================================
          BARRA DE ÍCONES LATERAL ESQUERDA QUE SE EXPANDE
          ========================================================================= */}
      <BrainLeftIconDock
        agents={effectiveAgents}
        tools={toolsList}
        memories={memories}
        selectedAgentId={selectedAgentId}
        selectedToolId={selectedToolId}
        selectedMemoryId={selectedMemoryId}
        onSelectAgent={(id) => {
          setSelectedAgentId(id);
          const ag = effectiveAgents.find((a) => a.id === id);
          if (ag) onSelectAgent?.(ag);
        }}
        onSelectTool={(id) => setSelectedToolId(id)}
        onSelectMemory={(id) => {
          setSelectedMemoryId(id);
          const mm = memories.find((m) => m.id === id);
          if (mm) onSelectMemory?.(mm);
        }}
        selectedLobeId={selectedLobeId}
        onSelectLobe={handleSelectLobe}
        currentCameraView={currentCameraView}
        onSetCameraView={setCameraPreset}
        onAdjustZoom={adjustZoom}
        onToggleRotate={() => setIsAutoRotating((prev) => !prev)}
        isAutoRotating={isAutoRotating}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* =========================================================================
          BADGE SUPERIOR DISCRETO (SEM OBSTRUÇÃO) COM ATALHOS RÁPIDOS
          ========================================================================= */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 pointer-events-auto z-20">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur-md border border-cyan-500/20 text-cyan-300 font-mono text-[10px]">
          <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
          <span>Cérebro Neural 3D</span>
          {selectedLobeId && (
            <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40 uppercase font-bold">
              {BRAIN_LOBES.find((b) => b.id === selectedLobeId)?.name}
            </span>
          )}
        </div>

        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all shadow-md active:scale-95 cursor-pointer"
          title="Alternar Tela Cheia"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* =========================================================================
          TOOLTIP MINIMALISTA AO PASSAR O MOUSE SOBRE NÓS OU HEMISFÉRIOS
          ========================================================================= */}
      {hoveredNode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none bg-slate-950/90 backdrop-blur-md border border-cyan-500/30 rounded-xl px-4 py-2 shadow-2xl max-w-sm transition-all text-xs z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                backgroundColor: hoveredNode.color,
                boxShadow: `0 0 10px ${hoveredNode.color}`,
              }}
            />
            <span className="font-bold text-white font-mono text-[11px] truncate">
              {hoveredNode.name}
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ml-auto"
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
            <p className="text-[10px] text-slate-300 font-sans mt-0.5 line-clamp-1">
              {hoveredNode.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
