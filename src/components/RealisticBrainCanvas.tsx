import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SynapseMemory, SentimentAnalysisResult } from '../types/neural';
import { Activity, Zap, Radio, Target, CheckCircle2, RotateCcw, RotateCw, ZoomIn, ZoomOut, Maximize2, Sparkles } from 'lucide-react';

interface RealisticBrainCanvasProps {
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
}

interface MolecularParticle {
  progress: number;
  baseSpeed: number;
  mesh: THREE.Mesh;
  radius: number;
  wobblePhase: number;
  lateralSpread: THREE.Vector3;
}

interface TargetedSynapseBridge {
  targetMemoryId: string;
  sourceMemoryId?: string;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  length: number;
  direction: THREE.Vector3;
  midpoint: THREE.Vector3;
  coreMesh: THREE.Mesh;
  glowMesh: THREE.Mesh;
  particles: MolecularParticle[];
  phaseOffset: number;
  isDirectToCore: boolean;
}

// Interfaces para a Animação Customizada de Partículas em Trânsito nas Sinapses (Novo Dado)
interface CustomDataParticle {
  mesh: THREE.Mesh;
  trailMeshes: THREE.Mesh[];
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  direction: THREE.Vector3;
  lateralSpread: THREE.Vector3;
  progress: number;
  speed: number;
  wobbleFreq: number;
  wobbleAmp: number;
  colorHex: number;
  generation: number; // 0 = tronco principal core->alvo, 1 = ramificações inter-sinápticas
  targetId: string;
  onArrive?: () => void;
}

interface SynapticShockwave {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  age: number;
  maxAge: number;
  startScale: number;
  endScale: number;
  material: THREE.MeshBasicMaterial;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  maxAge: number;
  material: THREE.MeshBasicMaterial;
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
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredMemory, setHoveredMemory] = useState<SynapseMemory | null>(null);

  // Telemetria em tempo real
  const [liveFreqHz, setLiveFreqHz] = useState<number>(1.2);
  const [liveThicknessUm, setLiveThicknessUm] = useState<number>(15);
  const [isCurrentlyFiring, setIsCurrentlyFiring] = useState<boolean>(false);
  const [isParticleSurgeActive, setIsParticleSurgeActive] = useState<boolean>(false);

  // Encontrar o nó alvo atual (se houver)
  const currentTargetMem = memories.find((m) => m.id === activeTargetNodeId);

  // Referência para atualizar estados reativos dentro do loop de renderização do Three.js
  const activeTargetNodeIdRef = useRef<string | null>(activeTargetNodeId || null);
  const activeSynapsePulseRef = useRef<string | null>(activeSynapsePulse || null);
  const isJarvisSpeakingRef = useRef<boolean>(isJarvisSpeaking);
  const isListeningRef = useRef<boolean>(isListening);

  // Gatilho imperativo para a animação de partículas em trânsito
  const triggerDataBurstRef = useRef<(targetId?: string, isNewData?: boolean) => void>(() => {});
  const prevMemoryIdsRef = useRef<Set<string>>(new Set(memories.map((m) => m.id)));

  // Referência para controles manuais de zoom e rotação do cérebro
  const controlsRef = useRef<{
    zoomIn: () => void;
    zoomOut: () => void;
    rotateLeft: () => void;
    rotateRight: () => void;
    resetView: () => void;
  }>({
    zoomIn: () => {},
    zoomOut: () => {},
    rotateLeft: () => {},
    rotateRight: () => {},
    resetView: () => {},
  });

  useEffect(() => {
    activeTargetNodeIdRef.current = activeTargetNodeId || null;
  }, [activeTargetNodeId]);

  useEffect(() => {
    activeSynapsePulseRef.current = activeSynapsePulse || null;
    if (activeSynapsePulse) {
      triggerDataBurstRef.current(activeTargetNodeId || undefined, false);
    }
  }, [activeSynapsePulse, activeTargetNodeId]);

  useEffect(() => {
    isJarvisSpeakingRef.current = isJarvisSpeaking;
  }, [isJarvisSpeaking]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Efeito dedicado para detectar quando um NOVO dado / memória é registrado na rede neural
  useEffect(() => {
    const currentIds = new Set(memories.map((m) => m.id));
    const newlyAdded = memories.filter((m) => !prevMemoryIdsRef.current.has(m.id));

    if (newlyAdded.length > 0) {
      const newestMem = newlyAdded[0];
      // Dispara as partículas percorrendo as sinapses do núcleo ao novo nó e ramificando
      setTimeout(() => {
        triggerDataBurstRef.current(newestMem.id, true);
      }, 120);
    }

    prevMemoryIdsRef.current = currentIds;
  }, [memories]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Cenário Three.js
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020713, 0.08);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0.35, 3.7);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.appendChild(renderer.domElement);

    // =========================================================================
    // 2. ILUMINAÇÃO: BASE AZUL CIBERNÉTICA HOLOGRÁFICA
    // =========================================================================
    const ambientLight = new THREE.AmbientLight(0x041830, 2.2);
    scene.add(ambientLight);

    // Luz principal ciano/azul elétrico sobre o cérebro
    const pointLightBlue = new THREE.PointLight(0x00d2ff, 3.2, 25);
    pointLightBlue.position.set(0, 2.5, 4.5);
    scene.add(pointLightBlue);

    // Luz de contorno azul profundo
    const pointLightDeepBlue = new THREE.PointLight(0x1d4ed8, 2.4, 25);
    pointLightDeepBlue.position.set(-4, -2, -3);
    scene.add(pointLightDeepBlue);

    // Luz vermelha pontual de sinapse (ilumina APENAS sob disparo pontual do nó alvo)
    const pointLightSynapseRed = new THREE.PointLight(0xff2222, 0.0, 15);
    scene.add(pointLightSynapseRed);

    // 3. Grupo Principal do Cérebro (Escala ampliada para cérebro imersivo e dominante)
    const brainGroup = new THREE.Group();
    brainGroup.scale.set(1.18, 1.18, 1.18);
    scene.add(brainGroup);

    // =========================================================================
    // 4. GERAÇÃO ANATÔMICA DOS DOIS HEMISFÉRIOS (AZUL CIBERNÉTICO)
    // =========================================================================
    const brainNodes: THREE.Vector3[] = [];
    const totalBaseNodes = 360;

    for (let i = 0; i < totalBaseNodes; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const isLeft = Math.random() > 0.5;
      const hemisphereOffset = isLeft ? -0.42 : 0.42;

      let r = 1.5 + (Math.random() - 0.5) * 0.4;
      let x = r * Math.sin(phi) * Math.cos(theta);
      let y = r * Math.sin(phi) * Math.sin(theta);
      let z = r * Math.cos(phi);

      z *= 1.35; // Alongamento anteroposterior

      if (y > 0) {
        y *= 1.15;
      } else {
        y *= 0.85;
      }

      // Fissura inter-hemisférica longitudinal
      if (y > 0.4) {
        x += hemisphereOffset;
        if (Math.abs(x) < 0.2) {
          x = isLeft ? -0.22 : 0.22;
        }
      } else {
        x += hemisphereOffset * 0.7;
      }

      // Lobo Temporal inferior
      if (z < -0.8 && y < -0.2) {
        x *= 0.85;
        y -= 0.35;
        z -= 0.25;
      }

      // Tronco Encefálico e Cerebelo
      if (Math.abs(x) < 0.45 && z < 0 && y < -0.5) {
        x *= 0.35;
        z = -0.3 + (Math.random() - 0.5) * 0.2;
        y = -0.9 - Math.random() * 0.6;
      }

      // Polo Frontal
      if (y < 0.1 && y > -0.7 && z > 0.1 && z < 0.9) {
        x *= 1.15;
      }

      brainNodes.push(new THREE.Vector3(x, y, z));
    }

    // =========================================================================
    // 5. NÚCLEO COGNITIVO CENTRAL DO JARVIS (HUB CENTRAL)
    // =========================================================================
    const centralCorePos = new THREE.Vector3(0, 0.15, 0.05);

    const coreHubGeo = new THREE.IcosahedronGeometry(0.18, 1);
    const coreHubMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
    });
    const centralHubMesh = new THREE.Mesh(coreHubGeo, coreHubMat);
    centralHubMesh.position.copy(centralCorePos);
    brainGroup.add(centralHubMesh);

    const centralInnerGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const centralInnerMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
    });
    const centralInnerMesh = new THREE.Mesh(centralInnerGeo, centralInnerMat);
    centralInnerMesh.position.copy(centralCorePos);
    brainGroup.add(centralInnerMesh);

    // =========================================================================
    // 6. MALHA PLEXUS DO CÉREBRO: AZUL ELÉTRICO HOLOGRÁFICO SERENO
    // =========================================================================
    const linePositions: number[] = [];
    const lineColors: number[] = [];
    const maxConnectionDistance = 0.95;

    for (let i = 0; i < brainNodes.length; i++) {
      let connections = 0;
      for (let j = i + 1; j < brainNodes.length; j++) {
        const dist = brainNodes[i].distanceTo(brainNodes[j]);
        if (dist < maxConnectionDistance && connections < 4) {
          linePositions.push(
            brainNodes[i].x, brainNodes[i].y, brainNodes[i].z,
            brainNodes[j].x, brainNodes[j].y, brainNodes[j].z
          );

          // Gradiente em tons de azul ciano e cobalto
          const alphaFade = Math.max(0.15, 1.0 - dist / maxConnectionDistance);
          lineColors.push(0.04 * alphaFade, 0.55 * alphaFade, 0.95 * alphaFade);
          lineColors.push(0.02 * alphaFade, 0.25 * alphaFade, 0.80 * alphaFade);
          connections++;
        }
      }
    }

    const linesGeometry = new THREE.BufferGeometry();
    linesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    linesGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const linesMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      linewidth: 1.0,
    });

    const plexusMesh = new THREE.LineSegments(linesGeometry, linesMaterial);
    brainGroup.add(plexusMesh);

    // Vértices neurais azuis
    const nodesGeometry = new THREE.BufferGeometry();
    const nodeCoords: number[] = [];
    const nodeColorsArr: number[] = [];

    brainNodes.forEach((node) => {
      nodeCoords.push(node.x, node.y, node.z);
      nodeColorsArr.push(0.08, 0.65, 0.95);
    });

    nodesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(nodeCoords, 3));
    nodesGeometry.setAttribute('color', new THREE.Float32BufferAttribute(nodeColorsArr, 3));

    // Textura circular azul para partículas cerebrais
    const canvasBluePoint = document.createElement('canvas');
    canvasBluePoint.width = 64;
    canvasBluePoint.height = 64;
    const ctxBlue = canvasBluePoint.getContext('2d');
    if (ctxBlue) {
      const grad = ctxBlue.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.3, 'rgba(14, 165, 233, 0.9)');
      grad.addColorStop(0.7, 'rgba(2, 132, 199, 0.35)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctxBlue.fillStyle = grad;
      ctxBlue.fillRect(0, 0, 64, 64);
    }
    const bluePointTexture = new THREE.CanvasTexture(canvasBluePoint);

    const nodesMaterial = new THREE.PointsMaterial({
      size: 0.07,
      map: bluePointTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    });

    const nodesPoints = new THREE.Points(nodesGeometry, nodesMaterial);
    brainGroup.add(nodesPoints);

    // =========================================================================
    // 7. ARQUIVOS MENORES & NÓS DE INFORMAÇÕES EXISTENTES (SINALIZADOS NO CÉREBRO)
    // =========================================================================
    const unitCylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    const upVector = new THREE.Vector3(0, 1, 0);

    const memoryMeshes: THREE.Mesh[] = [];
    const nodeGroupsMap = new Map<string, THREE.Group>();
    const targetedBridges: TargetedSynapseBridge[] = [];
    const bridgesGroup = new THREE.Group();
    brainGroup.add(bridgesGroup);

    // Função auxiliar para criar billboard de texto para cada arquivo menor
    const createNodeTextSprite = (texto: string, categoria: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(3, 10, 24, 0.85)';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(8, 8, 240, 48, 12);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 20px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(texto, 128, 32);
      }
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(0.65, 0.16, 1.0);
      return sprite;
    };

    // Renderiza estritamente as memórias criadas pelo usuário (zero nós pré-estabelecidos)
    memories.forEach((mem) => {
      const memPos = new THREE.Vector3(...mem.coords);
      const memGroup = new THREE.Group();
      memGroup.position.copy(memPos);

      // A. Geometria de cristal do micro-arquivo
      const coreGeo = new THREE.OctahedronGeometry(0.12, 0);
      const coreMat = new THREE.MeshBasicMaterial({
        color: mem.color || 0x06b6d4,
        wireframe: true,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.userData = { memory: mem };
      memGroup.add(coreMesh);
      memoryMeshes.push(coreMesh);

      // B. Núcleo Interno
      const innerGeo = new THREE.SphereGeometry(0.045, 8, 8);
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
      });
      const innerMesh = new THREE.Mesh(innerGeo, innerMat);
      innerMesh.name = 'innerMesh';
      memGroup.add(innerMesh);

      // C. Halo de Sinalização
      const haloGeo = new THREE.RingGeometry(0.14, 0.18, 16);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.name = 'haloMesh';
      memGroup.add(haloMesh);

      // D. Retículo de Foco de Sinapse Cirúrgica
      const reticleGeo = new THREE.RingGeometry(0.24, 0.28, 24);
      const reticleMat = new THREE.MeshBasicMaterial({
        color: 0xff2222,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0, // Acende somente quando este nó é o alvo exato
      });
      const reticleMesh = new THREE.Mesh(reticleGeo, reticleMat);
      reticleMesh.name = 'reticleMesh';
      memGroup.add(reticleMesh);

      // E. Placa de identificação (Sprite 3D) do arquivo menor
      let shortTitle = mem.title.split(':')[0] || mem.title;
      if (mem.id === 'mem-compras') shortTitle = '🛒 Compras';
      else if (mem.id === 'mem-agenda') shortTitle = '📅 Agenda';
      else if (mem.id === 'mem-matheus') shortTitle = '👤 Matheus';
      else if (mem.id === 'mem-esposa') shortTitle = '👤 Família';
      else if (mem.id === 'mem-filhos') shortTitle = '👤 Filhos';
      else if (mem.id === 'mem-taee11') shortTitle = '📊 TAEE11 (Bazin)';
      else if (mem.id === 'mem-bbas3') shortTitle = '📊 BBAS3';
      else if (mem.id === 'mem-wege3') shortTitle = '📊 WEGE3';
      else if (mem.id === 'mem-btc') shortTitle = '🪙 BTC';
      else if (mem.id === 'mem-saude') shortTitle = '🏥 Saúde';
      else if (mem.id === 'mem-cfo') shortTitle = '💼 CFO IA';
      else if (mem.id === 'mem-seguranca') shortTitle = '🔐 Portão';

      const sprite = createNodeTextSprite(shortTitle, mem.category);
      sprite.position.set(0, 0.24, 0);
      sprite.name = 'labelSprite';
      memGroup.add(sprite);

      brainGroup.add(memGroup);
      nodeGroupsMap.set(mem.id, memGroup);

      // =======================================================================
      // F. PONTE SINÁPTICA DIRECIONADA: DO NÚCLEO COGNITIVO AO NÓ MENOR
      // =======================================================================
      const p1 = centralCorePos.clone();
      const p2 = memPos.clone();
      const length = p1.distanceTo(p2);
      const direction = new THREE.Vector3().subVectors(p2, p1).normalize();
      const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(upVector, direction);

      // Núcleo do axônio
      const bridgeCoreMat = new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const bridgeCoreMesh = new THREE.Mesh(unitCylinderGeo, bridgeCoreMat);
      bridgeCoreMesh.position.copy(midpoint);
      bridgeCoreMesh.setRotationFromQuaternion(quaternion);
      bridgeCoreMesh.scale.set(0.010, length, 0.010);
      bridgesGroup.add(bridgeCoreMesh);

      // Bainha holográfica
      const bridgeGlowMat = new THREE.MeshBasicMaterial({
        color: 0x0369a1,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const bridgeGlowMesh = new THREE.Mesh(unitCylinderGeo, bridgeGlowMat);
      bridgeGlowMesh.position.copy(midpoint);
      bridgeGlowMesh.setRotationFromQuaternion(quaternion);
      bridgeGlowMesh.scale.set(0.022, length, 0.022);
      bridgesGroup.add(bridgeGlowMesh);

      // Partículas moleculares biológicas de disparo sináptico (Bolas vermelhas / neurotransmissores)
      const bridgeParticles: MolecularParticle[] = [];
      const numMolecules = 10;

      for (let k = 0; k < numMolecules; k++) {
        // Variação de calibre da molécula biológica esférica
        const molRadius = 0.034 + (k % 3) * 0.012;
        const particleGeo = new THREE.SphereGeometry(molRadius, 12, 12);
        const particleMat = new THREE.MeshBasicMaterial({
          color: 0xff1e27, // Vermelho arterial vivo de molécula ativa
          transparent: true,
          opacity: 0.0, // Permanece em repouso invisível
          blending: THREE.AdditiveBlending,
        });
        const pMesh = new THREE.Mesh(particleGeo, particleMat);
        const initialProgress = k / numMolecules;
        pMesh.position.lerpVectors(p1, p2, initialProgress);
        bridgesGroup.add(pMesh);

        // Dispersão lateral orgânica ao longo do axônio
        const lateralVector = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ).normalize();

        bridgeParticles.push({
          progress: initialProgress,
          baseSpeed: 0.32 + Math.random() * 0.28,
          mesh: pMesh,
          radius: molRadius,
          wobblePhase: Math.random() * Math.PI * 2,
          lateralSpread: lateralVector,
        });
      }

      targetedBridges.push({
        targetMemoryId: mem.id,
        p1,
        p2,
        length,
        direction,
        midpoint,
        coreMesh: bridgeCoreMesh,
        glowMesh: bridgeGlowMesh,
        particles: bridgeParticles,
        phaseOffset: Math.random() * Math.PI * 2,
        isDirectToCore: true,
      });
    });

    // =========================================================================
    // G. CONEXÕES ENTRE SINAPSES (PONTES INTER-SINÁPTICAS NA REDE NEURAL)
    // =========================================================================
    if (memories.length >= 2) {
      const connectionsPerNode = new Map<string, number>();
      memories.forEach((m) => connectionsPerNode.set(m.id, 0));

      for (let i = 0; i < memories.length; i++) {
        for (let j = i + 1; j < memories.length; j++) {
          const memA = memories[i];
          const memB = memories[j];
          const posA = new THREE.Vector3(...memA.coords);
          const posB = new THREE.Vector3(...memB.coords);
          const dist = posA.distanceTo(posB);
          const countA = connectionsPerNode.get(memA.id) || 0;
          const countB = connectionsPerNode.get(memB.id) || 0;

          // Conecta sinapses vizinhas ou da mesma categoria em raio de alcance
          const sameCat = memA.category === memB.category;
          const maxDist = sameCat ? 2.6 : 2.0;

          if (dist < maxDist && countA < 3 && countB < 3) {
            connectionsPerNode.set(memA.id, countA + 1);
            connectionsPerNode.set(memB.id, countB + 1);

            const interDir = new THREE.Vector3().subVectors(posB, posA).normalize();
            const interMid = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
            const interQuat = new THREE.Quaternion().setFromUnitVectors(upVector, interDir);

            // Núcleo do filamento inter-sináptico
            const interCoreMat = new THREE.MeshBasicMaterial({
              color: 0x0ea5e9,
              transparent: true,
              opacity: 0.16,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            });
            const interCoreMesh = new THREE.Mesh(unitCylinderGeo, interCoreMat);
            interCoreMesh.position.copy(interMid);
            interCoreMesh.setRotationFromQuaternion(interQuat);
            interCoreMesh.scale.set(0.007, dist, 0.007);
            bridgesGroup.add(interCoreMesh);

            // Bainha holográfica inter-sináptica
            const interGlowMat = new THREE.MeshBasicMaterial({
              color: 0x0284c7,
              transparent: true,
              opacity: 0.10,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            const interGlowMesh = new THREE.Mesh(unitCylinderGeo, interGlowMat);
            interGlowMesh.position.copy(interMid);
            interGlowMesh.setRotationFromQuaternion(interQuat);
            interGlowMesh.scale.set(0.016, dist, 0.016);
            bridgesGroup.add(interGlowMesh);

            // Partículas de fluxo biológico inter-sináptico
            const interParticles: MolecularParticle[] = [];
            const numInterMol = 6;
            for (let k = 0; k < numInterMol; k++) {
              const molRadius = 0.026 + (k % 2) * 0.008;
              const pGeo = new THREE.SphereGeometry(molRadius, 8, 8);
              const pMat = new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.0,
                blending: THREE.AdditiveBlending,
              });
              const pMesh = new THREE.Mesh(pGeo, pMat);
              const prog = k / numInterMol;
              pMesh.position.lerpVectors(posA, posB, prog);
              bridgesGroup.add(pMesh);

              const lateral = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2
              ).normalize();

              interParticles.push({
                progress: prog,
                baseSpeed: 0.35 + Math.random() * 0.25,
                mesh: pMesh,
                radius: molRadius,
                wobblePhase: Math.random() * Math.PI * 2,
                lateralSpread: lateral,
              });
            }

            targetedBridges.push({
              sourceMemoryId: memA.id,
              targetMemoryId: memB.id,
              p1: posA,
              p2: posB,
              length: dist,
              direction: interDir,
              midpoint: interMid,
              coreMesh: interCoreMesh,
              glowMesh: interGlowMesh,
              particles: interParticles,
              phaseOffset: Math.random() * Math.PI * 2,
              isDirectToCore: false,
            });
          }
        }
      }
    }

    // =========================================================================
    // H. SISTEMA DINÂMICO DE ANIMAÇÃO DE PARTÍCULAS EM TRÂNSITO (NOVO DADO REGISTRADO)
    // =========================================================================
    const burstGroup = new THREE.Group();
    brainGroup.add(burstGroup);

    const activeDataParticles: CustomDataParticle[] = [];
    const activeShockwaves: SynapticShockwave[] = [];
    const activeSparks: SparkParticle[] = [];

    const sparkSphereGeo = new THREE.SphereGeometry(0.024, 8, 8);
    const particleHeadGeo = new THREE.SphereGeometry(0.046, 12, 12);
    const trailGeos = [
      new THREE.SphereGeometry(0.034, 8, 8),
      new THREE.SphereGeometry(0.024, 8, 8),
      new THREE.SphereGeometry(0.015, 6, 6),
    ];

    let surgeResetTimer: any = null;

    const triggerDataParticleStream = (targetIdParam?: string, isNewData = true) => {
      // Determinar nó alvo
      let targetMem = memories.find((m) => m.id === targetIdParam);
      if (!targetMem && targetIdParam) {
        const tClean = targetIdParam.toLowerCase().replace('mem-', '').replace('agente_', '');
        targetMem = memories.find((m) => m.id.toLowerCase().includes(tClean) || m.title.toLowerCase().includes(tClean));
      }
      if (!targetMem && memories.length > 0) {
        targetMem = memories[0];
      }

      const pStart = centralCorePos.clone();
      const pEnd = targetMem ? new THREE.Vector3(...targetMem.coords) : new THREE.Vector3(0.4, 0.7, 0.5);
      const targetId = targetMem ? targetMem.id : 'NUCLEO_JARVIS';
      const dir = new THREE.Vector3().subVectors(pEnd, pStart).normalize();

      // Ativa telemetria de trânsito de partículas no HUD
      setIsParticleSurgeActive(true);
      if (surgeResetTimer) clearTimeout(surgeResetTimer);
      surgeResetTimer = setTimeout(() => {
        setIsParticleSurgeActive(false);
      }, 3400);

      // Paleta neon dinâmica: Ciano elétrico e esmeralda para novo dado, ou escarlate/ouro para alerta
      const colorPalette = isNewData
        ? [0x00f5ff, 0x38bdf8, 0x10b981, 0x22d3ee]
        : [0xff0055, 0xff3366, 0xfbbf24, 0x00f5ff];

      const numParticlesInStream = 8;
      for (let i = 0; i < numParticlesInStream; i++) {
        const color = colorPalette[i % colorPalette.length];
        const headMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 1.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const headMesh = new THREE.Mesh(particleHeadGeo, headMat);
        headMesh.position.copy(pStart);
        burstGroup.add(headMesh);

        // Rastro luminoso (comet tail)
        const trailMeshes: THREE.Mesh[] = [];
        for (let t = 0; t < trailGeos.length; t++) {
          const trailMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.65 - t * 0.18,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const trailMesh = new THREE.Mesh(trailGeos[t], trailMat);
          trailMesh.position.copy(pStart);
          burstGroup.add(trailMesh);
          trailMeshes.push(trailMesh);
        }

        const lateral = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ).normalize();

        const speed = 2.0 + Math.random() * 0.8;
        // Iniciar com delay sequencial negativo para dispararem em comboio fluído
        const progressOffset = -(i * 0.11);

        activeDataParticles.push({
          mesh: headMesh,
          trailMeshes,
          p1: pStart,
          p2: pEnd,
          direction: dir,
          lateralSpread: lateral,
          progress: progressOffset,
          speed,
          wobbleFreq: 14 + Math.random() * 6,
          wobbleAmp: 0.05 + Math.random() * 0.03,
          colorHex: color,
          generation: 0,
          targetId,
          onArrive: i === 0 ? () => {
            // A. Onda de Choque Sináptica (Shockwave Ring) no nó alvo
            const ringGeo = new THREE.RingGeometry(0.04, 0.11, 24);
            const ringMat = new THREE.MeshBasicMaterial({
              color: 0x00f5ff,
              transparent: true,
              opacity: 0.95,
              side: THREE.DoubleSide,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.position.copy(pEnd);
            burstGroup.add(ringMesh);

            activeShockwaves.push({
              mesh: ringMesh,
              position: pEnd.clone(),
              age: 0,
              maxAge: 0.75,
              startScale: 1.0,
              endScale: 5.2,
              material: ringMat,
            });

            // B. Explosão de Centelhas Sinápticas (Sparks)
            for (let s = 0; s < 14; s++) {
              const spMat = new THREE.MeshBasicMaterial({
                color: colorPalette[s % colorPalette.length],
                transparent: true,
                opacity: 1.0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              });
              const spMesh = new THREE.Mesh(sparkSphereGeo, spMat);
              spMesh.position.copy(pEnd);
              burstGroup.add(spMesh);

              const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2
              ).normalize().multiplyScalar(0.75 + Math.random() * 0.9);

              activeSparks.push({
                mesh: spMesh,
                position: pEnd.clone(),
                velocity: vel,
                age: 0,
                maxAge: 0.55,
                material: spMat,
              });
            }

            // C. Cascata Secundária: Propagação instantânea pelas conexões entre sinapses!
            const connectedBridges = targetedBridges.filter(
              (b) => !b.isDirectToCore && (b.sourceMemoryId === targetId || b.targetMemoryId === targetId)
            );

            connectedBridges.forEach((bridge) => {
              const isSource = bridge.sourceMemoryId === targetId;
              const subP1 = isSource ? bridge.p1 : bridge.p2;
              const subP2 = isSource ? bridge.p2 : bridge.p1;
              const subDir = new THREE.Vector3().subVectors(subP2, subP1).normalize();

              for (let k = 0; k < 3; k++) {
                const subColor = 0x38bdf8;
                const subMat = new THREE.MeshBasicMaterial({
                  color: subColor,
                  transparent: true,
                  opacity: 0.95,
                  blending: THREE.AdditiveBlending,
                  depthWrite: false,
                });
                const subMesh = new THREE.Mesh(particleHeadGeo, subMat);
                subMesh.position.copy(subP1);
                burstGroup.add(subMesh);

                const subTrails: THREE.Mesh[] = [];
                for (let st = 0; st < 2; st++) {
                  const stMat = new THREE.MeshBasicMaterial({
                    color: subColor,
                    transparent: true,
                    opacity: 0.5 - st * 0.2,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                  });
                  const stMesh = new THREE.Mesh(trailGeos[st], stMat);
                  stMesh.position.copy(subP1);
                  burstGroup.add(stMesh);
                  subTrails.push(stMesh);
                }

                const subLateral = new THREE.Vector3(
                  (Math.random() - 0.5) * 2,
                  (Math.random() - 0.5) * 2,
                  (Math.random() - 0.5) * 2
                ).normalize();

                activeDataParticles.push({
                  mesh: subMesh,
                  trailMeshes: subTrails,
                  p1: subP1,
                  p2: subP2,
                  direction: subDir,
                  lateralSpread: subLateral,
                  progress: -(k * 0.14),
                  speed: 2.3 + Math.random() * 0.5,
                  wobbleFreq: 18,
                  wobbleAmp: 0.04,
                  colorHex: subColor,
                  generation: 1,
                  targetId: isSource ? bridge.targetMemoryId : (bridge.sourceMemoryId || ''),
                });
              }
            });
          } : undefined,
        });
      }
    };

    triggerDataBurstRef.current = triggerDataParticleStream;

    // =========================================================================
    // 8. CONTROLES DE MOUSE / TOUCH / EXPANSÃO (ZOOM) E ROTAÇÃO MANUAL
    // =========================================================================
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let targetRotationX = 0.1;
    let targetRotationY = 0.35;
    let targetCameraDistance = 3.7;
    let initialPinchDist = 0;

    controlsRef.current = {
      zoomIn: () => {
        targetCameraDistance = Math.max(2.0, targetCameraDistance - 0.6);
      },
      zoomOut: () => {
        targetCameraDistance = Math.min(7.0, targetCameraDistance + 0.6);
      },
      rotateLeft: () => {
        targetRotationY -= Math.PI / 4;
      },
      rotateRight: () => {
        targetRotationY += Math.PI / 4;
      },
      resetView: () => {
        targetRotationX = 0.1;
        targetRotationY = 0.35;
        targetCameraDistance = 3.7;
      },
    };

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(memoryMeshes);
      if (intersects.length > 0) {
        const found = intersects[0].object.userData.memory as SynapseMemory;
        setHoveredMemory(found);
      } else {
        setHoveredMemory(null);
      }

      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        targetRotationY += deltaX * 0.007;
        targetRotationX += deltaY * 0.007;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onClick = () => {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(memoryMeshes);
      if (intersects.length > 0) {
        const found = intersects[0].object.userData.memory as SynapseMemory;
        onSelectMemory(found);
      }
    };

    // Zoom por rolagem do mouse (Scroll Wheel)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetCameraDistance = Math.max(2.6, Math.min(10.0, targetCameraDistance + e.deltaY * 0.005));
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('click', onClick);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // Touch: suporte a arraste e pinch-to-zoom
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevMouseX = e.touches[0].clientX;
        prevMouseY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDist = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - prevMouseX;
        const deltaY = e.touches[0].clientY - prevMouseY;
        targetRotationY += deltaX * 0.008;
        targetRotationX += deltaY * 0.008;
        prevMouseX = e.touches[0].clientX;
        prevMouseY = e.touches[0].clientY;
      } else if (e.touches.length === 2 && initialPinchDist > 0) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDist = Math.sqrt(dx * dx + dy * dy);
        const diff = initialPinchDist - currentDist;
        targetCameraDistance = Math.max(2.6, Math.min(10.0, targetCameraDistance + diff * 0.015));
        initialPinchDist = currentDist;
      }
    };

    const onTouchEnd = () => {
      isDragging = false;
      initialPinchDist = 0;
    };

    dom.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    // =========================================================================
    // 9. LOOP DE ANIMAÇÃO COM DISPARO CIRÚRGICO E RETORNO GARANTIDO AO NORMAL
    // =========================================================================
    let animationFrameId: number;
    const clock = new THREE.Clock();

    // Nível de excitação sináptica (0.0 = repouso absoluto, 1.0 = disparo cirúrgico)
    let synapticExcitation = 0.0;
    let lastTelemetryUpdate = 0;

    const redColor = new THREE.Color(0xff1e1e);
    const redGlowColor = new THREE.Color(0xef4444);
    const restingCyanColor = new THREE.Color(0x0284c7);
    const restingGlowColor = new THREE.Color(0x0369a1);

    const animate = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Checar se há ativação específica do nó alvo ou pulso sináptico
      const targetId = activeTargetNodeIdRef.current;
      const pulseActive = Boolean(activeSynapsePulseRef.current);
      const isInteracting = Boolean(pulseActive || isJarvisSpeakingRef.current);

      // Decaimento e excitação matemática com garantia de retorno ao repouso
      if (isInteracting && targetId) {
        synapticExcitation = Math.min(1.0, synapticExcitation + delta * 4.0);
      } else if (isInteracting && !targetId) {
        // Se houver fala genérica sem nó específico, excitação moderada no núcleo apenas
        synapticExcitation = Math.min(0.5, synapticExcitation + delta * 2.0);
      } else {
        // Decaimento suave e retorno ao normal garantido
        synapticExcitation = Math.max(0.0, synapticExcitation - delta * 1.5);
      }

      const isFiring = synapticExcitation > 0.05;

      // Telemetria reativa
      if (elapsed - lastTelemetryUpdate > 0.2) {
        lastTelemetryUpdate = elapsed;
        setIsCurrentlyFiring(isFiring);
        setLiveFreqHz(Number((1.2 + synapticExcitation * 14.0).toFixed(1)));
        setLiveThicknessUm(Math.round(15 + synapticExcitation * 45));
      }

      // ROTAÇÃO MANUAL: O cérebro gira SOMENTE pela vontade do usuário (SEM auto-rotação)
      brainGroup.rotation.y += (targetRotationY - brainGroup.rotation.y) * 0.1;
      brainGroup.rotation.x += (targetRotationX - brainGroup.rotation.x) * 0.1;

      // EXPANSÃO E DISTÂNCIA DA CÂMERA (ZOOM CONTROLADO PELO USUÁRIO)
      camera.position.z += (targetCameraDistance - camera.position.z) * 0.1;

      // Pulsação sutil anatômica
      const breathingPulse = 1.0 + Math.sin(elapsed * 2.5) * (0.01 + synapticExcitation * 0.02);
      brainGroup.scale.set(breathingPulse, breathingPulse, breathingPulse);

      // Iluminação pontual: acende em vermelho no alvo ou ilumina o núcleo sob sinapse
      if (isFiring) {
        let targetGroup: THREE.Group | undefined;
        if (targetId) {
          const tClean = targetId.toLowerCase().replace('mem-', '').replace('agente_', '').replace('sentinela-', '').replace('db_', '');
          for (const [k, grp] of nodeGroupsMap.entries()) {
            const kClean = k.toLowerCase().replace('mem-', '').replace('agente_', '').replace('sentinela-', '').replace('db_', '');
            if (k.toLowerCase() === targetId.toLowerCase() || kClean === tClean || kClean.includes(tClean) || tClean.includes(kClean)) {
              targetGroup = grp;
              break;
            }
            if ((tClean.includes('taee') || tClean.includes('bazin')) && kClean.includes('taee')) {
              targetGroup = grp;
              break;
            }
            if (tClean.includes('bbas') && kClean.includes('bbas')) {
              targetGroup = grp;
              break;
            }
            if (tClean.includes('btc') && kClean.includes('btc')) {
              targetGroup = grp;
              break;
            }
            if (tClean.includes('wege') && kClean.includes('wege')) {
              targetGroup = grp;
              break;
            }
          }
        }

        if (targetGroup) {
          pointLightSynapseRed.position.copy(targetGroup.position);
          pointLightSynapseRed.intensity = synapticExcitation * 5.0;
        } else if (targetId) {
          pointLightSynapseRed.intensity = synapticExcitation * 3.5;
        } else {
          // Pulso geral no cérebro
          pointLightSynapseRed.position.set(0, 0.4, 0.5);
          pointLightSynapseRed.intensity = synapticExcitation * 2.8;
        }
      } else {
        pointLightSynapseRed.intensity = 0.0;
      }

      // Luz central do Jarvis
      pointLightBlue.intensity = 3.2 + Math.sin(elapsed * 3) * 0.4;
      centralHubMesh.rotation.y += 0.02;
      centralHubMesh.rotation.x += 0.01;

      // =======================================================================
      // 10. ATUALIZAÇÃO CIRÚRGICA DE SINAPSES (FLUXO MOLECULAR BIOLÓGICO DINÂMICO)
      // =======================================================================
      targetedBridges.forEach((bridge) => {
        let isThisBridgeTargeted = false;
        if (targetId) {
          const tClean = targetId.toLowerCase().replace('mem-', '').replace('agente_', '').replace('sentinela-', '').replace('db_', '');
          const bClean = bridge.targetMemoryId.toLowerCase().replace('mem-', '').replace('agente_', '').replace('sentinela-', '').replace('db_', '');

          isThisBridgeTargeted = (
            bridge.targetMemoryId.toLowerCase() === targetId.toLowerCase() ||
            bClean === tClean ||
            bClean.includes(tClean) ||
            tClean.includes(bClean) ||
            ((tClean.includes('taee') || tClean.includes('bazin')) && bClean.includes('taee')) ||
            (tClean.includes('bbas') && bClean.includes('bbas')) ||
            (tClean.includes('wege') && bClean.includes('wege')) ||
            (tClean.includes('btc') && bClean.includes('btc')) ||
            (tClean.includes('saude') && bClean.includes('saude')) ||
            (tClean.includes('cfo') && (bClean.includes('cfo') || bClean.includes('taee')))
          );
        } else if (isFiring) {
          // Quando for disparo geral da cognição sem nó específico, aciona os axônios principais do cérebro
          isThisBridgeTargeted = bridge.isDirectToCore;
        }

        if (isThisBridgeTargeted && isFiring) {
          // A. SINAPSE BIOLÓGICA ALVO: SUBSTITUIÇÃO DA LINHA VERMELHA POR FLUXO MOLECULAR
          // O axônio mantém-se como um filamento neural translúcido sutil (SEM a barra vermelha pesada)
          bridge.coreMesh.scale.set(0.008, bridge.length, 0.008);
          (bridge.coreMesh.material as THREE.MeshBasicMaterial).color.setHex(0x1e3a5f);
          (bridge.coreMesh.material as THREE.MeshBasicMaterial).opacity = 0.22;

          bridge.glowMesh.scale.set(0.020, bridge.length, 0.020);
          (bridge.glowMesh.material as THREE.MeshBasicMaterial).color.setHex(0x0284c7);
          (bridge.glowMesh.material as THREE.MeshBasicMaterial).opacity = 0.14;

          // LÓGICA BIOLÓGICA: Velocidade das moléculas proporcional à intensidade da sinapse (connectionsCount ou importância)
          const targetMem = memories.find((m) => m.id === bridge.targetMemoryId);
          const connections = targetMem?.connectionsCount ?? 6;
          const importanceMultiplier =
            targetMem?.importance === 'critica'
              ? 2.8
              : targetMem?.importance === 'alta'
              ? 2.0
              : 1.2;

          // Quanto maior a sinapse (mais conexões ou mais crítica), mais rápido o fluxo molecular
          const intensityFactor = Math.min((connections / 4.5) * importanceMultiplier, 6.0);
          const molecularVelocity = (1.8 + intensityFactor * 2.0) * (0.9 + synapticExcitation * 0.8);

          // Partículas (bolas vermelhas esféricas) movendo-se como moléculas de neurotransmissores
          bridge.particles.forEach((part) => {
            part.progress = (part.progress + part.baseSpeed * molecularVelocity * delta) % 1.0;

            // Posição base ao longo do axônio com dispersão biológica vesicular lateral
            const currentPos = new THREE.Vector3().lerpVectors(bridge.p1, bridge.p2, part.progress);
            const lateralWobble = Math.sin(elapsed * 16.0 + part.wobblePhase) * 0.035;
            currentPos.addScaledVector(part.lateralSpread, lateralWobble);
            part.mesh.position.copy(currentPos);

            // Escala dinâmica com pulso de disparo molecular
            const pulse = 1.0 + Math.sin(part.progress * Math.PI) * 0.45;
            const molScale = part.radius * 3.4 * pulse;
            part.mesh.scale.set(molScale, molScale, molScale);
            (part.mesh.material as THREE.MeshBasicMaterial).opacity = 0.96;
          });
        } else {
          // B. DEMAIS SINAPSES: REPOUSO AZUL CIBERNÉTICO SERENO (ZERO DISPARO VERMELHO)
          bridge.coreMesh.scale.set(0.007, bridge.length, 0.007);
          (bridge.coreMesh.material as THREE.MeshBasicMaterial).color.copy(restingCyanColor);
          (bridge.coreMesh.material as THREE.MeshBasicMaterial).opacity = 0.14;

          bridge.glowMesh.scale.set(0.016, bridge.length, 0.016);
          (bridge.glowMesh.material as THREE.MeshBasicMaterial).color.copy(restingGlowColor);
          (bridge.glowMesh.material as THREE.MeshBasicMaterial).opacity = 0.08;

          // Partículas ficam 100% invisíveis nas demais pontes
          bridge.particles.forEach((part) => {
            (part.mesh.material as THREE.MeshBasicMaterial).opacity = 0.0;
          });
        }
      });

      // =======================================================================
      // 10.B ATUALIZAÇÃO DAS PARTÍCULAS CUSTOMIZADAS DE DADOS EM TRÂNSITO NAS SINAPSES
      // =======================================================================
      for (let i = activeDataParticles.length - 1; i >= 0; i--) {
        const p = activeDataParticles[i];
        p.progress += p.speed * delta;

        if (p.progress < 0) {
          // Aguardando disparo na esteira com delay
          p.mesh.visible = false;
          p.trailMeshes.forEach((tm) => (tm.visible = false));
          continue;
        }

        if (p.progress >= 1.0) {
          // Partícula alcançou o nó alvo da sinapse
          if (p.onArrive) p.onArrive();
          burstGroup.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();

          p.trailMeshes.forEach((tm) => {
            burstGroup.remove(tm);
            tm.geometry.dispose();
            (tm.material as THREE.Material).dispose();
          });

          activeDataParticles.splice(i, 1);
          continue;
        }

        p.mesh.visible = true;
        p.trailMeshes.forEach((tm) => (tm.visible = true));

        // Posição base interpolada ao longo da ponte sináptica
        const basePos = new THREE.Vector3().lerpVectors(p.p1, p.p2, p.progress);

        // Movimento espiral e pulso elétrico orgânico ao redor do feixe axônico
        const spiralAngle = p.progress * Math.PI * 6 + elapsed * p.wobbleFreq;
        const crossAxis = new THREE.Vector3().crossVectors(p.direction, p.lateralSpread).normalize();
        const spiralOffset = p.lateralSpread.clone().multiplyScalar(Math.cos(spiralAngle) * p.wobbleAmp)
          .add(crossAxis.clone().multiplyScalar(Math.sin(spiralAngle) * p.wobbleAmp));
        const headPos = basePos.add(spiralOffset);
        p.mesh.position.copy(headPos);

        // Pulso de escala da cabeça da partícula de dados
        const pulseHead = 1.0 + Math.sin(p.progress * Math.PI) * 0.45;
        p.mesh.scale.set(pulseHead, pulseHead, pulseHead);

        // Rastro luminoso (comet tail) que acompanha dinamicamente a trajetória
        for (let t = 0; t < p.trailMeshes.length; t++) {
          const trailProgress = Math.max(0, p.progress - (t + 1) * 0.035);
          const tBasePos = new THREE.Vector3().lerpVectors(p.p1, p.p2, trailProgress);
          const tSpiralAngle = trailProgress * Math.PI * 6 + elapsed * p.wobbleFreq;
          const tOffset = p.lateralSpread.clone().multiplyScalar(Math.cos(tSpiralAngle) * (p.wobbleAmp * 0.8))
            .add(crossAxis.clone().multiplyScalar(Math.sin(tSpiralAngle) * (p.wobbleAmp * 0.8)));
          p.trailMeshes[t].position.copy(tBasePos.add(tOffset));
          const tScale = Math.max(0.2, (1.0 - (t + 1) * 0.22) * pulseHead);
          p.trailMeshes[t].scale.set(tScale, tScale, tScale);
        }
      }

      // Atualização das Ondas de Choque Sinápticas (Shockwaves)
      for (let i = activeShockwaves.length - 1; i >= 0; i--) {
        const shock = activeShockwaves[i];
        shock.age += delta;
        const life = shock.age / shock.maxAge;
        if (life >= 1.0) {
          burstGroup.remove(shock.mesh);
          shock.mesh.geometry.dispose();
          shock.material.dispose();
          activeShockwaves.splice(i, 1);
          continue;
        }

        const scale = THREE.MathUtils.lerp(shock.startScale, shock.endScale, Math.pow(life, 0.6));
        shock.mesh.scale.set(scale, scale, scale);
        shock.material.opacity = (1.0 - life) * 0.95;
        shock.mesh.lookAt(camera.position);
      }

      // Atualização das Centelhas Radiais (Sparks de potencial de ação)
      for (let i = activeSparks.length - 1; i >= 0; i--) {
        const sp = activeSparks[i];
        sp.age += delta;
        const life = sp.age / sp.maxAge;
        if (life >= 1.0) {
          burstGroup.remove(sp.mesh);
          sp.mesh.geometry.dispose();
          sp.material.dispose();
          activeSparks.splice(i, 1);
          continue;
        }

        sp.mesh.position.addScaledVector(sp.velocity, delta);
        sp.material.opacity = 1.0 - life;
        const s = 1.0 - life * 0.5;
        sp.mesh.scale.set(s, s, s);
      }

      // =======================================================================
      // 11. ATUALIZAÇÃO DOS NÓS MENORES (RETÍCULOS E LABELS)
      // =======================================================================
      memories.forEach((mem) => {
        const group = nodeGroupsMap.get(mem.id);
        if (!group) return;

        let isTarget = false;
        if (targetId) {
          const tClean = targetId.toLowerCase().replace('mem-', '').replace('agente_', '').replace('sentinela-', '').replace('db_', '');
          const mClean = mem.id.toLowerCase().replace('mem-', '').replace('agente_', '').replace('sentinela-', '').replace('db_', '');
          isTarget = (
            mem.id.toLowerCase() === targetId.toLowerCase() ||
            mClean === tClean ||
            mClean.includes(tClean) ||
            tClean.includes(mClean) ||
            ((tClean.includes('taee') || tClean.includes('bazin')) && mClean.includes('taee')) ||
            (tClean.includes('bbas') && mClean.includes('bbas')) ||
            (tClean.includes('wege') && mClean.includes('wege')) ||
            (tClean.includes('btc') && mClean.includes('btc')) ||
            (tClean.includes('saude') && mClean.includes('saude')) ||
            (tClean.includes('cfo') && mClean.includes('cfo'))
          );
        } else if (isFiring) {
          isTarget = mem.importance === 'critica';
        }

        const isSelected = selectedMemory && mem.id === selectedMemory.id;
        const isHovered = hoveredMemory && mem.id === hoveredMemory.id;

        // Halo
        const halo = group.getObjectByName('haloMesh') as THREE.Mesh;
        if (halo) {
          halo.lookAt(camera.position);
          const s = 1.0 + Math.sin(elapsed * 3 + mem.coords[0]) * 0.15;
          halo.scale.set(s, s, s);
          if (isTarget && isFiring) {
            (halo.material as THREE.MeshBasicMaterial).color.setHex(0xff2222);
            (halo.material as THREE.MeshBasicMaterial).opacity = 0.85;
          } else {
            (halo.material as THREE.MeshBasicMaterial).color.setHex(0x0284c7);
            (halo.material as THREE.MeshBasicMaterial).opacity = isSelected || isHovered ? 0.6 : 0.25;
          }
        }

        // Retículo vermelho de foco cirúrgico
        const reticle = group.getObjectByName('reticleMesh') as THREE.Mesh;
        if (reticle) {
          reticle.lookAt(camera.position);
          if (isTarget && isFiring) {
            const rotS = 1.2 + Math.sin(elapsed * 12) * 0.35;
            reticle.scale.set(rotS, rotS, rotS);
            (reticle.material as THREE.MeshBasicMaterial).opacity = synapticExcitation * 0.95;
            reticle.rotation.z += 0.04;
          } else {
            (reticle.material as THREE.MeshBasicMaterial).opacity = 0.0;
          }
        }

        // Núcleo interno
        const inner = group.getObjectByName('innerMesh') as THREE.Mesh;
        if (inner) {
          if (isTarget && isFiring) {
            (inner.material as THREE.MeshBasicMaterial).color.setHex(0xff2222);
            const inS = 1.4 + Math.sin(elapsed * 16) * 0.4;
            inner.scale.set(inS, inS, inS);
          } else {
            (inner.material as THREE.MeshBasicMaterial).color.setHex(0x38bdf8);
            inner.scale.set(1.0, 1.0, 1.0);
          }
        }

        // Sprite label sempre voltado para a câmera
        const sprite = group.getObjectByName('labelSprite') as THREE.Sprite;
        if (sprite) {
          if (isTarget && isFiring) {
            sprite.scale.set(0.85, 0.21, 1.0);
            (sprite.material as THREE.SpriteMaterial).opacity = 1.0;
          } else {
            sprite.scale.set(0.65, 0.16, 1.0);
            (sprite.material as THREE.SpriteMaterial).opacity = isSelected || isHovered ? 0.95 : 0.65;
          }
        }
      });

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('click', onClick);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      if (surgeResetTimer) clearTimeout(surgeResetTimer);
      activeDataParticles.forEach((p) => {
        burstGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        p.trailMeshes.forEach((tm) => {
          burstGroup.remove(tm);
          tm.geometry.dispose();
          (tm.material as THREE.Material).dispose();
        });
      });
      activeShockwaves.forEach((sw) => {
        burstGroup.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.material.dispose();
      });
      activeSparks.forEach((sp) => {
        burstGroup.remove(sp.mesh);
        sp.mesh.geometry.dispose();
        sp.material.dispose();
      });
      sparkSphereGeo.dispose();
      particleHeadGeo.dispose();
      trailGeos.forEach((g) => g.dispose());
      renderer.dispose();
    };
  }, [memories, onSelectMemory]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden">
      {/* Container Three.js */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Barra Superior de Status: Repouso vs. Sinapse Pontual */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-cyan-500/20 shadow-lg text-xs font-mono">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isCurrentlyFiring
                ? 'bg-red-500 animate-ping shadow-[0_0_10px_#ef4444]'
                : 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'
            }`}
          />
          {isParticleSurgeActive ? (
            <span className="text-cyan-300 font-bold flex items-center gap-1.5 animate-pulse">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              Ingestão de Dados: <span className="text-white underline underline-offset-2">Cascata de Partículas Sinápticas</span>
            </span>
          ) : isCurrentlyFiring && currentTargetMem ? (
            <span className="text-red-400 font-bold flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-red-400 animate-spin" />
              Sinapse Cirúrgica: <span className="text-white underline underline-offset-2">{currentTargetMem.title}</span>
            </span>
          ) : isCurrentlyFiring ? (
            <span className="text-red-400 font-bold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-red-400 animate-bounce" />
              Sinapse Central Disparada
            </span>
          ) : (
            <span className="text-cyan-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              Repouso Neural (Cérebro Azul) • 0 sinapses vermelhas
            </span>
          )}
        </div>

        {/* Telemetria e Botão de Forçar Repouso */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {isCurrentlyFiring && onForceRest && (
            <button
              onClick={onForceRest}
              title="Restaurar estado de repouso neural imediatamente"
              className="px-2.5 py-1 rounded-lg bg-red-950/60 hover:bg-red-900/80 border border-red-500/40 text-red-300 text-xs font-mono flex items-center gap-1.5 transition-all shadow-md active:scale-95"
            >
              <RotateCcw className="w-3 h-3 text-red-400" />
              Forçar Repouso
            </button>
          )}

          <div className="hidden sm:flex items-center gap-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-xl border border-cyan-500/20 text-[11px] font-mono text-cyan-400">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-cyan-400" />
              {liveFreqHz} Hz
            </span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1">
              <Radio className="w-3 h-3 text-cyan-400" />
              {liveThicknessUm} µm
            </span>
          </div>
        </div>
      </div>

      {/* Controles Flutuantes Manuais: Expandir (Zoom In/Out) e Girar de um lado para o outro à vontade */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-20 pointer-events-auto">
        <button
          onClick={() => triggerDataBurstRef.current(activeTargetNodeId || undefined, true)}
          title="Disparar Animação de Partículas (Fluxo de Novo Dado nas Sinapses)"
          className="p-2.5 rounded-xl bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 hover:text-white border border-cyan-400/50 hover:border-cyan-300 transition-all shadow-lg active:scale-95 group relative"
        >
          <Sparkles className="w-4 h-4 text-cyan-400 group-hover:rotate-45 transition-transform" />
          <span className="absolute right-full mr-2.5 px-2.5 py-1 bg-slate-950/95 border border-cyan-500/40 rounded-lg text-[10px] text-cyan-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl font-mono">
            Disparar Fluxo de Partículas (Novo Dado)
          </span>
        </button>
        <div className="w-full h-px bg-cyan-500/20 my-0.5" />
        <button
          onClick={() => controlsRef.current.zoomIn()}
          title="Expandir Cérebro (Aproximar / Zoom In)"
          className="p-2.5 rounded-xl bg-slate-950/80 hover:bg-cyan-950 text-cyan-400 hover:text-cyan-200 border border-cyan-500/30 hover:border-cyan-400 transition-all shadow-lg active:scale-95"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => controlsRef.current.zoomOut()}
          title="Afastar Cérebro (Zoom Out)"
          className="p-2.5 rounded-xl bg-slate-950/80 hover:bg-cyan-950 text-cyan-400 hover:text-cyan-200 border border-cyan-500/30 hover:border-cyan-400 transition-all shadow-lg active:scale-95"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-full h-px bg-cyan-500/20 my-0.5" />
        <button
          onClick={() => controlsRef.current.rotateLeft()}
          title="Girar para Esquerda"
          className="p-2.5 rounded-xl bg-slate-950/80 hover:bg-cyan-950 text-cyan-400 hover:text-cyan-200 border border-cyan-500/30 hover:border-cyan-400 transition-all shadow-lg active:scale-95"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={() => controlsRef.current.rotateRight()}
          title="Girar para Direita"
          className="p-2.5 rounded-xl bg-slate-950/80 hover:bg-cyan-950 text-cyan-400 hover:text-cyan-200 border border-cyan-500/30 hover:border-cyan-400 transition-all shadow-lg active:scale-95"
        >
          <RotateCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => controlsRef.current.resetView()}
          title="Centralizar e Redefinir Vista"
          className="p-2.5 rounded-xl bg-slate-950/80 hover:bg-slate-900 text-slate-400 hover:text-white border border-slate-700/50 transition-all shadow-lg active:scale-95"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Card flutuante ao passar mouse sobre um arquivo menor */}
      {hoveredMemory && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-slate-950/90 backdrop-blur-md p-3 rounded-xl border border-cyan-500/30 text-white max-w-sm pointer-events-none shadow-2xl z-20">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#06b6d4]" />
            <p className="font-bold text-xs font-mono text-cyan-200">{hoveredMemory.title}</p>
          </div>
          <p className="text-[11px] text-slate-300 line-clamp-2">{hoveredMemory.content}</p>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>Categoria: {hoveredMemory.category.toUpperCase()}</span>
            <span>{hoveredMemory.user}</span>
          </div>
        </div>
      )}
    </div>
  );
};
