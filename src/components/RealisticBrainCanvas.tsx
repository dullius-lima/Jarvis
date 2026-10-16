import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import {
  SynapseMemory,
  SentimentAnalysisResult,
  AgentDefinition,
  AgentNerveSignal,
  BodyPartAnatomy,
} from '../types/neural';
import { BODY_PARTS_CONFIG } from '../services/agentRegistry';

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

interface BodyNerveEnding {
  bodyPartId: BodyPartAnatomy;
  agent?: AgentDefinition;
  fullPathCurve: THREE.CatmullRomCurve3; // Trajeto contínuo: Agente -> Medula Espinhal -> Cérebro
  limbCurve: THREE.QuadraticBezierCurve3;
  nerveTubeMesh?: THREE.Mesh;
  socketMesh: THREE.Mesh;
  socketHaloMesh: THREE.Mesh;
  socketLabelSprite?: THREE.Sprite;
  targetCoords: THREE.Vector3;
  entryY: number;
  brainToAgentPhotons: Array<{ mesh: THREE.Mesh; progress: number; speed: number }>;
  yellowVesicle: { mesh: THREE.Mesh; progress: number; speed: number; active: boolean };
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
  const isPointerDownRef = useRef<boolean>(false);
  const pointerPrevRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const activeSignalRef = useRef<AgentNerveSignal | null>(null);
  useEffect(() => {
    activeSignalRef.current = activeNerveSignal || null;
  }, [activeNerveSignal]);

  const onBodyPartInteractRef = useRef(onBodyPartInteract);
  useEffect(() => {
    onBodyPartInteractRef.current = onBodyPartInteract;
  }, [onBodyPartInteract]);

  const agentsRef = useRef<AgentDefinition[]>(agents);
  useEffect(() => {
    agentsRef.current = agents || [];
  }, [agents]);

  // Flash neural ao receber sinal no cérebro
  const corticalBurstRef = useRef<number>(0);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const width = currentMount.clientWidth || window.innerWidth;
    const height = currentMount.clientHeight || window.innerHeight;

    // 1. Cena Three.js
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02050e, 0.045);

    // 2. Câmera Perspectiva
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0.6, 9.6);
    camera.lookAt(0, 0.2, 0);

    // 3. Renderizador WebGL com Qualidade FullHD e Antialiasing de Alta Definição
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      precision: 'highp',
    });
    renderer.setSize(width, height);
    // Garantia de nitidez FullHD nativa (mínimo pixelRatio 2.0 para texturas ultra nítidas)
    renderer.setPixelRatio(Math.max(window.devicePixelRatio || 1, 2.0));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x02050e, 1.0);
    currentMount.appendChild(renderer.domElement);

    // 4. Iluminação Bioluminescente
    const ambientLight = new THREE.AmbientLight(0x032244, 1.5);
    scene.add(ambientLight);

    const cranialLight = new THREE.PointLight(0x00f5ff, 2.8, 12);
    cranialLight.position.set(0, 2.7, 1.2);
    scene.add(cranialLight);

    const spinalLight = new THREE.PointLight(0x38bdf8, 2.2, 10);
    spinalLight.position.set(0, 0.8, 1.8);
    scene.add(spinalLight);

    // 5. Grupos da Cena
    const mainHumanoidGroup = new THREE.Group();
    scene.add(mainHumanoidGroup);

    const brainGroup = new THREE.Group();
    brainGroup.position.set(0, 2.7, 0); // Posição do cérebro na cabeça
    mainHumanoidGroup.add(brainGroup);

    const pnsGroup = new THREE.Group(); // Sistema Nervoso Periférico
    mainHumanoidGroup.add(pnsGroup);

    const skeletonGroup = new THREE.Group(); // Esqueleto & Silhueta Humana
    mainHumanoidGroup.add(skeletonGroup);

    // =========================================================================
    // A. SILHUETA HUMANA ANATÔMICA & ESQUELETO CIBERNÉTICO
    // =========================================================================
    const boneMaterial = new THREE.LineBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
    });

    const jointMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    });

    // 1. Contorno Craniano (Cabeça)
    const craniumPoints: THREE.Vector3[] = [];
    const craniumSegments = 40;
    for (let i = 0; i <= craniumSegments; i++) {
      const theta = (i / craniumSegments) * Math.PI * 2;
      const rx = 0.50 * Math.cos(theta);
      const ry = 0.62 * Math.sin(theta);
      craniumPoints.push(new THREE.Vector3(rx, 2.72 + ry, 0.04 * Math.sin(theta)));
    }
    const craniumGeo = new THREE.BufferGeometry().setFromPoints(craniumPoints);
    skeletonGroup.add(new THREE.Line(craniumGeo, boneMaterial));

    // Mandíbula e Queixo
    const jawPoints = [
      new THREE.Vector3(-0.35, 2.52, 0.08),
      new THREE.Vector3(-0.18, 2.12, 0.20),
      new THREE.Vector3(0, 2.05, 0.22),
      new THREE.Vector3(0.18, 2.12, 0.20),
      new THREE.Vector3(0.35, 2.52, 0.08),
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(jawPoints), boneMaterial));

    // 2. Coluna Vertebral & Medula Espinhal (24 vértebras luminosas C1 a L5/Sacro)
    const spineLength = 2.4;
    const numVertebrae = 24;
    const spineStartY = 2.02;
    const vertGeo = new THREE.CylinderGeometry(0.040, 0.040, 0.022, 10);

    for (let s = 0; s < numVertebrae; s++) {
      const progress = s / (numVertebrae - 1);
      const vY = spineStartY - progress * spineLength;
      const vZ = -0.05 + Math.sin(progress * Math.PI * 2) * 0.05;

      const vMesh = new THREE.Mesh(vertGeo, jointMaterial);
      vMesh.position.set(0, vY, vZ);
      vMesh.rotation.x = Math.PI / 2;
      skeletonGroup.add(vMesh);
    }

    // Canal medular central contínuo (feixe de axônios da Medula Espinhal)
    const unitCylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    const spinalCordMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.70,
      blending: THREE.AdditiveBlending,
    });
    const spinalCordMesh = new THREE.Mesh(unitCylinderGeo, spinalCordMat);
    spinalCordMesh.position.set(0, spineStartY - spineLength * 0.5, -0.04);
    spinalCordMesh.scale.set(0.018, spineLength, 0.018);
    skeletonGroup.add(spinalCordMesh);

    // 3. Clavículas e Ombros
    const claviclePoints = [
      new THREE.Vector3(-1.35, 1.75, 0.0),
      new THREE.Vector3(-0.3, 1.84, 0.14),
      new THREE.Vector3(0, 1.86, 0.16),
      new THREE.Vector3(0.3, 1.84, 0.14),
      new THREE.Vector3(1.35, 1.75, 0.0),
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(claviclePoints), boneMaterial));

    // 4. Caixa Torácica (Costelas Anatômicas)
    const numRibs = 7;
    for (let r = 0; r < numRibs; r++) {
      const ribProgress = r / (numRibs - 1);
      const ribY = 1.72 - ribProgress * 0.78;
      const ribWidth = 0.55 + Math.sin(ribProgress * Math.PI) * 0.38;
      const ribPoints: THREE.Vector3[] = [];
      const ribSegs = 20;
      for (let s = 0; s <= ribSegs; s++) {
        const angle = -Math.PI * 0.5 + (s / ribSegs) * Math.PI;
        const rx = Math.sin(angle) * ribWidth;
        const rz = Math.cos(angle) * (0.28 + Math.sin(ribProgress * Math.PI) * 0.12);
        ribPoints.push(new THREE.Vector3(rx, ribY - Math.abs(rx) * 0.08, rz - 0.04));
      }
      skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ribPoints), boneMaterial));
    }

    // 5. Braços e Mãos
    const leftArmPoints = [
      new THREE.Vector3(-1.35, 1.75, 0.0),
      new THREE.Vector3(-1.95, 1.05, 0.05),
      new THREE.Vector3(-2.35, 0.25, 0.12),
      new THREE.Vector3(-2.45, 0.05, 0.14),
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftArmPoints), boneMaterial));

    const rightArmPoints = [
      new THREE.Vector3(1.35, 1.75, 0.0),
      new THREE.Vector3(1.95, 1.05, 0.05),
      new THREE.Vector3(2.35, 0.25, 0.12),
      new THREE.Vector3(2.45, 0.05, 0.14),
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightArmPoints), boneMaterial));

    // 6. Cintura Pélvica (Pelve / Quadril)
    const pelvisPoints = [
      new THREE.Vector3(-0.75, 0.05, 0.02),
      new THREE.Vector3(-0.45, -0.25, 0.08),
      new THREE.Vector3(0, -0.32, 0.10),
      new THREE.Vector3(0.45, -0.25, 0.08),
      new THREE.Vector3(0.75, 0.05, 0.02),
      new THREE.Vector3(0, 0.08, -0.05),
      new THREE.Vector3(-0.75, 0.05, 0.02),
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pelvisPoints), boneMaterial));

    // 7. Pernas e Pés
    const leftLegPoints = [
      new THREE.Vector3(-0.5, -0.25, 0.08),
      new THREE.Vector3(-0.75, -1.35, 0.08),
      new THREE.Vector3(-0.9, -2.55, 0.08),
      new THREE.Vector3(-0.95, -2.7, 0.35),
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftLegPoints), boneMaterial));

    const rightLegPoints = [
      new THREE.Vector3(0.5, -0.25, 0.08),
      new THREE.Vector3(0.75, -1.35, 0.08),
      new THREE.Vector3(0.9, -2.55, 0.08),
      new THREE.Vector3(0.95, -2.7, 0.35),
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightLegPoints), boneMaterial));

    // Articulações
    const jointPositions = [
      new THREE.Vector3(-1.35, 1.75, 0.0),
      new THREE.Vector3(1.35, 1.75, 0.0),
      new THREE.Vector3(-1.95, 1.05, 0.05),
      new THREE.Vector3(1.95, 1.05, 0.05),
      new THREE.Vector3(-2.35, 0.25, 0.12),
      new THREE.Vector3(2.35, 0.25, 0.12),
      new THREE.Vector3(-0.75, -1.35, 0.08),
      new THREE.Vector3(0.75, -1.35, 0.08),
      new THREE.Vector3(-0.9, -2.55, 0.08),
      new THREE.Vector3(0.9, -2.55, 0.08),
    ];
    const jointSphereGeo = new THREE.SphereGeometry(0.036, 10, 10);
    jointPositions.forEach((pos) => {
      const jMesh = new THREE.Mesh(jointSphereGeo, jointMaterial);
      jMesh.position.copy(pos);
      skeletonGroup.add(jMesh);
    });

    // =========================================================================
    // B. CÉREBRO NEURAL CRANIANO (CÓRTEX BIOLUMINESCENTE DENTRO DO CRÂNIO)
    // =========================================================================
    const brainNodes: THREE.Vector3[] = [];
    const brainParticleCount = 140;
    const centralCorePos = new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < brainParticleCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * 0.44;

      const isRight = Math.random() > 0.5;
      const hemiOffset = isRight ? 0.07 : -0.07;

      const x = r * Math.sin(phi) * Math.cos(theta) * 0.85 + hemiOffset;
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.72;
      const z = r * Math.cos(phi) * 0.90;

      brainNodes.push(new THREE.Vector3(x, y, z));
    }

    const plexusGeo = new THREE.BufferGeometry().setFromPoints(brainNodes);
    const plexusMat = new THREE.PointsMaterial({
      size: 0.036,
      color: 0x00f5ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
    });
    const plexusPoints = new THREE.Points(plexusGeo, plexusMat);
    brainGroup.add(plexusPoints);

    // Conexões sinápticas intracranianas
    const brainLines: THREE.Vector3[] = [];
    for (let i = 0; i < brainNodes.length; i++) {
      for (let j = i + 1; j < brainNodes.length; j++) {
        if (brainNodes[i].distanceTo(brainNodes[j]) < 0.25) {
          brainLines.push(brainNodes[i], brainNodes[j]);
        }
      }
    }
    const brainLinesGeo = new THREE.BufferGeometry().setFromPoints(brainLines);
    const brainLinesMat = new THREE.LineBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.30,
      blending: THREE.AdditiveBlending,
    });
    brainGroup.add(new THREE.LineSegments(brainLinesGeo, brainLinesMat));

    // =========================================================================
    // C. MEMÓRIAS: BOTÕES AXÔNICOS PEQUENOS E ESTREITAMENTE INTERNOS
    // (CORREÇÃO TOTAL: ZERO RAMIFICAÇÕES OU PONTOS VERMELHOS NA CABEÇA!)
    // =========================================================================
    const memoryMeshes: THREE.Mesh[] = [];
    const targetedBridges: TargetedSynapseBridge[] = [];
    const bridgesGroup = new THREE.Group();
    brainGroup.add(bridgesGroup);

    const axonBoutonGeo = new THREE.SphereGeometry(0.026, 10, 10);
    const axonKernelGeo = new THREE.SphereGeometry(0.012, 8, 8);

    memories.forEach((mem) => {
      // CLAMP RIGOROSO: Garantir que a coordenada da memória esteja 100% dentro do cérebro craniano!
      let memPos = new THREE.Vector3(
        Number.isFinite(mem.coords?.[0]) ? mem.coords[0] : (Math.random() - 0.5) * 0.2,
        Number.isFinite(mem.coords?.[1]) ? mem.coords[1] : (Math.random() - 0.5) * 0.15,
        Number.isFinite(mem.coords?.[2]) ? mem.coords[2] : (Math.random() - 0.5) * 0.2
      );
      if (memPos.length() > 0.22) {
        memPos.normalize().multiplyScalar(0.12 + (Math.abs(memPos.x * 10) % 0.08));
      }
      memPos.y = Math.min(Math.max(memPos.y, -0.15), 0.15);
      memPos.z = Math.min(Math.max(memPos.z, -0.18), 0.18);

      const memGroup = new THREE.Group();
      memGroup.position.copy(memPos);

      // Cada memória salva registrada como uma bolinha vermelha dentro do cérebro (conforme solicitado!)
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xef4444, // Bolinha vermelha bioluminescente
        transparent: true,
        opacity: 0.95,
      });
      const coreMesh = new THREE.Mesh(axonBoutonGeo, coreMat);
      coreMesh.userData = { memory: mem };
      memGroup.add(coreMesh);
      memoryMeshes.push(coreMesh);

      const innerMat = new THREE.MeshBasicMaterial({
        color: 0xff4d4d, // Núcleo brilhante vermelho escarlate
        transparent: true,
        opacity: 0.95,
      });
      memGroup.add(new THREE.Mesh(axonKernelGeo, innerMat));

      // Auréola bioluminescente vermelha ao redor da bolinha de memória
      const haloGeo = new THREE.SphereGeometry(0.036, 8, 8);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xdc2626,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
      });
      memGroup.add(new THREE.Mesh(haloGeo, haloMat));

      brainGroup.add(memGroup);

      // Ponte axônica exclusivamente interna (do centro do cérebro ao nó)
      const p1 = centralCorePos.clone();
      const p2 = memPos.clone();
      const length = p1.distanceTo(p2);
      const direction = new THREE.Vector3().subVectors(p2, p1).normalize();
      const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const upVector = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(upVector, direction);

      const bridgeCoreMat = new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.20,
        blending: THREE.AdditiveBlending,
      });
      const bridgeCoreMesh = new THREE.Mesh(unitCylinderGeo, bridgeCoreMat);
      bridgeCoreMesh.position.copy(midpoint);
      bridgeCoreMesh.setRotationFromQuaternion(quaternion);
      bridgeCoreMesh.scale.set(0.004, length, 0.004);
      bridgesGroup.add(bridgeCoreMesh);

      // Vesículas lentas de transporte intracraniano (azul/ciano)
      const bridgeParticles: MolecularParticle[] = [];
      const numVesicles = 3;

      for (let k = 0; k < numVesicles; k++) {
        const vesicleRadius = 0.014;
        const particleGeo = new THREE.SphereGeometry(vesicleRadius, 8, 8);
        const particleMat = new THREE.MeshBasicMaterial({
          color: 0x00f5ff,
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending,
        });
        const pMesh = new THREE.Mesh(particleGeo, particleMat);
        const initialProgress = k / numVesicles;
        pMesh.position.lerpVectors(p1, p2, initialProgress);
        bridgesGroup.add(pMesh);

        bridgeParticles.push({
          progress: initialProgress,
          baseSpeed: 0.04 + Math.random() * 0.02,
          mesh: pMesh,
          radius: vesicleRadius,
          wobblePhase: Math.random() * Math.PI * 2,
          lateralSpread: new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).normalize(),
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
        glowMesh: bridgeCoreMesh,
        particles: bridgeParticles,
        phaseOffset: Math.random() * Math.PI * 2,
        isDirectToCore: true,
      });
    });

    // =========================================================================
    // D. SISTEMA NERVOSO PERIFÉRICO: ÍCONES MENORES, MAIS BONITOS E SINAL PELA MEDULA ATÉ O CÉREBRO
    // =========================================================================
    const bodyNerveEndings: BodyNerveEnding[] = [];
    const interactiveBodyMeshes: THREE.Mesh[] = [];

    const agentByPart = new Map<BodyPartAnatomy, AgentDefinition>();
    agents.forEach((ag) => {
      if (ag.bodyPart) agentByPart.set(ag.bodyPart, ag);
    });

    Object.entries(BODY_PARTS_CONFIG).forEach(([partKey, config]) => {
      const bPart = partKey as BodyPartAnatomy;
      const associatedAgent = agentByPart.get(bPart);
      const targetCoords = new THREE.Vector3(...config.coords);

      // Ponto de entrada na medula espinhal (canal central do esqueleto)
      const entryY = Math.min(Math.max(targetCoords.y + 0.10, -0.25), 1.95);
      const medulaEntry = new THREE.Vector3(0, entryY, -0.04);
      const brainEntry = new THREE.Vector3(0, 2.70, 0.0); // Chegada no centro do cérebro

      // Curva do nervo periférico do membro até a medula
      const limbCtrl = new THREE.Vector3(
        targetCoords.x * 0.45,
        (entryY + targetCoords.y) * 0.5 + 0.06,
        (targetCoords.z - 0.04) * 0.5 + 0.04
      );
      const limbCurve = new THREE.QuadraticBezierCurve3(medulaEntry, limbCtrl, targetCoords);

      // Tubo visual periférico (omitido na cabeça para não gerar ramificações no crânio)
      let tubeMesh: THREE.Mesh | undefined;
      if (bPart !== 'cranio_cerebro') {
        const tubeGeo = new THREE.TubeGeometry(limbCurve, 16, associatedAgent ? 0.010 : 0.005, 6, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: associatedAgent ? (config.colorHex === 0xef4444 ? 0x0ea5e9 : config.colorHex) : 0x0284c7,
          transparent: true,
          opacity: associatedAgent ? 0.70 : 0.18,
          blending: THREE.AdditiveBlending,
        });
        tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
        pnsGroup.add(tubeMesh);
      }

      // TRAJETO COMPLETO QUE PASSA PELA MEDULA E SOBE ATÉ O CÉREBRO:
      // Agente -> Nervo Periférico -> Medula Espinhal -> Tronco Encefálico -> Córtex Cerebral
      const pathPoints: THREE.Vector3[] = [targetCoords.clone()];
      if (bPart !== 'cranio_cerebro') {
        pathPoints.push(
          new THREE.Vector3(targetCoords.x * 0.45, (entryY + targetCoords.y) * 0.5, (targetCoords.z - 0.04) * 0.5 + 0.04),
          medulaEntry.clone()
        );
        // Pontos verticais subindo estritamente pelo canal medular da medula espinhal
        if (entryY < 0.8) pathPoints.push(new THREE.Vector3(0, 0.85, -0.04));
        if (entryY < 1.6) pathPoints.push(new THREE.Vector3(0, 1.65, -0.04));
        pathPoints.push(
          new THREE.Vector3(0, 2.05, -0.04), // Cervical
          new THREE.Vector3(0, 2.38, -0.02)  // Tronco encefálico
        );
      }
      pathPoints.push(brainEntry.clone()); // Cérebro

      const fullPathCurve = new THREE.CatmullRomCurve3(pathPoints);

      // ÍCONE DE INTERAÇÃO DO AGENTE: MENOR, MAIS BONITO E ELEGANTE (Micro-Joia Cibernética)
      const socketGeo = new THREE.SphereGeometry(associatedAgent ? 0.024 : 0.016, 12, 12);
      const socketColor = associatedAgent
        ? (config.colorHex === 0xef4444 ? 0x00f5ff : config.colorHex)
        : 0x0284c7;

      const socketMat = new THREE.MeshBasicMaterial({
        color: socketColor,
        transparent: true,
        opacity: associatedAgent ? 0.95 : 0.40,
      });
      const socketMesh = new THREE.Mesh(socketGeo, socketMat);
      socketMesh.position.copy(targetCoords);
      socketMesh.userData = { bodyPart: bPart, agent: associatedAgent, isAgentSocket: true };
      pnsGroup.add(socketMesh);
      interactiveBodyMeshes.push(socketMesh);

      // Núcleo pontual brilhante interno
      if (associatedAgent) {
        const innerDotGeo = new THREE.SphereGeometry(0.010, 8, 8);
        const innerDotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const innerDot = new THREE.Mesh(innerDotGeo, innerDotMat);
        socketMesh.add(innerDot);
      }

      // Anel orbital de neon fino e gracioso
      const socketHaloGeo = new THREE.RingGeometry(0.038, 0.048, 20);
      const socketHaloMat = new THREE.MeshBasicMaterial({
        color: socketColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: associatedAgent ? 0.65 : 0.0,
      });
      const socketHaloMesh = new THREE.Mesh(socketHaloGeo, socketHaloMat);
      socketHaloMesh.position.copy(targetCoords);
      pnsGroup.add(socketHaloMesh);

      // Micro-Chip Holográfico Compacto e de Alta Resolução (FullHD)
      let socketLabelSprite: THREE.Sprite | undefined;
      if (associatedAgent) {
        const canvasTag = document.createElement('canvas');
        canvasTag.width = 160;
        canvasTag.height = 36;
        const ctxT = canvasTag.getContext('2d');
        if (ctxT) {
          ctxT.fillStyle = 'rgba(2, 6, 23, 0.85)';
          ctxT.strokeStyle = `#${socketColor.toString(16).padStart(6, '0')}`;
          ctxT.lineWidth = 1.5;
          ctxT.beginPath();
          ctxT.roundRect(3, 3, 154, 30, 6);
          ctxT.fill();
          ctxT.stroke();

          ctxT.font = 'bold 13px monospace';
          ctxT.fillStyle = '#ffffff';
          ctxT.textAlign = 'center';
          ctxT.textBaseline = 'middle';
          ctxT.fillText(associatedAgent.name.slice(0, 15), 80, 18);
        }
        const tagTexture = new THREE.CanvasTexture(canvasTag);
        const tagSpriteMat = new THREE.SpriteMaterial({ map: tagTexture, transparent: true, opacity: 0.90, depthTest: false });
        socketLabelSprite = new THREE.Sprite(tagSpriteMat);
        const offsetX = targetCoords.x >= 0 ? 0.20 : -0.20;
        socketLabelSprite.position.set(targetCoords.x + offsetX, targetCoords.y + 0.06, targetCoords.z);
        socketLabelSprite.scale.set(0.36, 0.08, 1.0);
        pnsGroup.add(socketLabelSprite);
      }

      // SINAL SINÁPTICO QUE PASSA PELA MEDULA E SOBE ATÉ O CÉREBRO:
      // 1. Fótons Bioluminescentes Ciano/Safira (Cérebro -> Medula -> Agente) - ZERO VERMELHO
      const brainToAgentPhotons: Array<{ mesh: THREE.Mesh; progress: number; speed: number }> = [];
      const photonGeo = new THREE.SphereGeometry(0.020, 8, 8);
      const photonMat = new THREE.MeshBasicMaterial({
        color: 0x00f5ff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
      });
      for (let m = 0; m < 5; m++) {
        const pMesh = new THREE.Mesh(photonGeo, photonMat.clone());
        pnsGroup.add(pMesh);
        brainToAgentPhotons.push({
          mesh: pMesh,
          progress: m / 5,
          speed: 0.45 + Math.random() * 0.10,
        });
      }

      // 2. Vesícula Dourada Sináptica (Agente -> Medula Espinhal -> Cérebro)
      const yellowGeo = new THREE.SphereGeometry(0.034, 10, 10);
      const yellowMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
      });
      const yMesh = new THREE.Mesh(yellowGeo, yellowMat);
      pnsGroup.add(yMesh);

      bodyNerveEndings.push({
        bodyPartId: bPart,
        agent: associatedAgent,
        fullPathCurve,
        limbCurve,
        nerveTubeMesh: tubeMesh,
        socketMesh,
        socketHaloMesh,
        socketLabelSprite,
        targetCoords,
        entryY,
        brainToAgentPhotons,
        yellowVesicle: {
          mesh: yMesh,
          progress: 0.0,
          speed: 0.40,
          active: false,
        },
      });
    });

    // =========================================================================
    // E. CONTROLES DE INTERAÇÃO & CLIQUE (RAYCASTING)
    // =========================================================================
    let targetRotY = 0;
    let targetCameraY = 0.6;
    let targetCameraZ = 9.6;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      isPointerDownRef.current = true;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      pointerPrevRef.current = { x: clientX, y: clientY };
    };

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      if (isPointerDownRef.current) {
        const deltaX = clientX - pointerPrevRef.current.x;
        const deltaY = clientY - pointerPrevRef.current.y;
        targetRotY += deltaX * 0.005;
        targetCameraY = Math.max(Math.min(targetCameraY - deltaY * 0.005, 3.5), -1.5);
        pointerPrevRef.current = { x: clientX, y: clientY };
      }

      // Cursor pointer ao passar o mouse sobre partes interativas
      if (!('touches' in e)) {
        const rect = currentMount.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects([...interactiveBodyMeshes, ...memoryMeshes], false);
        currentMount.style.cursor = hits.length > 0 ? 'pointer' : 'default';
      }
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      targetCameraZ = Math.max(Math.min(targetCameraZ + e.deltaY * 0.004, 15.0), 2.5);
    };

    // Raycasting para clique e interação com o corpo / agentes / memórias
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (e: MouseEvent) => {
      const rect = currentMount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // Clique em socket de agente ou parte do corpo
      const bodyHits = raycaster.intersectObjects(interactiveBodyMeshes, false);
      if (bodyHits.length > 0) {
        const hitData = bodyHits[0].object.userData;
        if (hitData.bodyPart && onBodyPartInteractRef.current) {
          onBodyPartInteractRef.current(hitData.bodyPart, hitData.agent);
          return;
        }
        if (hitData.agent && onSelectAgent) {
          onSelectAgent(hitData.agent);
          return;
        }
      }

      // Clique em memória interna do cérebro
      const memHits = raycaster.intersectObjects(memoryMeshes, false);
      if (memHits.length > 0) {
        const mem = memHits[0].object.userData.memory;
        if (mem) {
          onSelectMemory(mem);
        }
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', handlePointerDown);
    dom.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('touchmove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchend', handlePointerUp);
    dom.addEventListener('wheel', handleWheel, { passive: true });
    dom.addEventListener('click', handleClick);

    // =========================================================================
    // F. LOOP DE ANIMAÇÃO & RENDERIZAÇÃO
    // =========================================================================
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      // Suavização da rotação e câmera
      mainHumanoidGroup.rotation.y += (targetRotY - mainHumanoidGroup.rotation.y) * 0.08;
      camera.position.y += (targetCameraY - camera.position.y) * 0.08;
      camera.position.z += (targetCameraZ - camera.position.z) * 0.08;
      camera.lookAt(0, camera.position.y * 0.6, 0);

      // Pulsação suave do cérebro
      const brainPulse = 1.0 + Math.sin(elapsedTime * 2.5) * 0.02;
      brainGroup.scale.set(brainPulse, brainPulse, brainPulse);

      // Flash de recepção no córtex
      if (corticalBurstRef.current > 0) {
        corticalBurstRef.current = Math.max(0, corticalBurstRef.current - delta * 3.0);
        cranialLight.intensity = 2.8 + corticalBurstRef.current * 4.0;
        plexusMat.size = 0.036 + corticalBurstRef.current * 0.030;
      } else {
        cranialLight.intensity = 2.8;
        plexusMat.size = 0.036;
      }

      // Animação de vesículas intracranianas
      targetedBridges.forEach((bridge) => {
        bridge.particles.forEach((p) => {
          p.progress += p.baseSpeed * delta;
          if (p.progress > 1.0) p.progress = 0.0;
          p.mesh.position.lerpVectors(bridge.p1, bridge.p2, p.progress);
          const mat = p.mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.35 + Math.sin(p.progress * Math.PI) * 0.40;
        });
      });

      // ANIMAÇÃO DE SINAIS NERVOSOS: TRAJETO COMPLETO PELA MEDULA ATÉ O CÉREBRO!
      // Sinapse ativa em tempo real para todo agente de IA em execução, com cores baseadas na intensidade dos dados
      const currentSignal = activeSignalRef.current;
      const currentAgents = agentsRef.current || [];

      bodyNerveEndings.forEach((ending) => {
        const isSignalForPart = currentSignal && currentSignal.bodyPart === ending.bodyPartId;
        const executingAgentForPart = currentAgents.find(
          (a) => (a.bodyPart === ending.bodyPartId || (!a.bodyPart && ending.bodyPartId === 'torax_tronco')) && (a.isExecuting || a.status === 'em_auditoria')
        );

        const isActive = isSignalForPart || Boolean(executingAgentForPart);

        // Determinar a Cor da Sinapse de acordo com a Intensidade dos Dados:
        // Baixa (< 0.35): Ciano Elétrico (0x00f5ff)
        // Média (0.35 a 0.70): Âmbar Ouro (0xfacc15)
        // Alta (0.70 a 0.90): Magenta Elétrico (0xd946ef)
        // Crítica / Pico (> 0.90): Rubi Neon / Vermelho Flamejante (0xff0055)
        let activeSynapseColor = 0xfacc15;
        let dataIntensity = 0.5;

        if (currentSignal?.intensityColorHex) {
          activeSynapseColor = currentSignal.intensityColorHex;
          dataIntensity = currentSignal.intensity ?? 0.5;
        } else if (currentSignal?.colorHex) {
          activeSynapseColor = currentSignal.colorHex;
        } else if (executingAgentForPart) {
          dataIntensity = executingAgentForPart.activeSynapseIntensity ?? 0.75;
          if (dataIntensity >= 0.90) activeSynapseColor = 0xff0055;
          else if (dataIntensity >= 0.70) activeSynapseColor = 0xd946ef;
          else if (dataIntensity >= 0.35) activeSynapseColor = 0xfacc15;
          else activeSynapseColor = 0x00f5ff;
        }

        // Rotação suave do anel orbital do soquete do agente
        if (ending.socketHaloMesh && ending.agent) {
          ending.socketHaloMesh.rotation.z += 0.02;
          const hMat = ending.socketHaloMesh.material as THREE.MeshBasicMaterial;
          if (isActive) {
            hMat.color.setHex(activeSynapseColor);
            hMat.opacity = 0.95;
          } else {
            hMat.opacity = 0.35 + Math.sin(elapsedTime * 2.5) * 0.15;
          }
        }

        // Atualizar cor e luminescência do tubo nervoso de acordo com a intensidade
        if (ending.nerveTubeMesh) {
          const nerveMat = ending.nerveTubeMesh.material as THREE.MeshBasicMaterial;
          if (isActive) {
            nerveMat.color.setHex(activeSynapseColor);
            nerveMat.opacity = 0.55 + Math.sin(elapsedTime * 4.0) * 0.25;
          } else {
            nerveMat.color.setHex(0x0284c7);
            nerveMat.opacity = 0.16;
          }
        }

        // 1. Fótons Cerebrais Descendentes: CÉREBRO (1.0) -> MEDULA -> AGENTE (0.0)
        const isPhotonActive = isSignalForPart && currentSignal.direction === 'BRAIN_TO_AGENT';
        ending.brainToAgentPhotons.forEach((r) => {
          if (isPhotonActive) {
            r.progress += r.speed * delta;
            if (r.progress > 1.0) r.progress = 0.0;
            const pt = ending.fullPathCurve.getPoint(1.0 - r.progress);
            r.mesh.position.copy(pt);
            (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(activeSynapseColor);
            (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
            spinalLight.intensity = 2.4 + Math.sin(r.progress * Math.PI) * 1.8;
          } else {
            (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.0;
          }
        });

        // 2. Vesícula Sináptica Ascendente: AGENTE (0.0) -> MEDULA -> CÉREBRO (1.0)!
        const isAscendingActive = (isSignalForPart && currentSignal.direction === 'AGENT_TO_BRAIN') || Boolean(executingAgentForPart);
        if (isAscendingActive) {
          const speedMultiplier = 1.0 + dataIntensity * 1.5;
          ending.yellowVesicle.progress += ending.yellowVesicle.speed * speedMultiplier * delta;
          if (ending.yellowVesicle.progress > 1.0) {
            ending.yellowVesicle.progress = 0.0;
            // Ao alcançar o cérebro (1.0), dispara burst cortical bioluminescente na cor da intensidade!
            corticalBurstRef.current = 1.0;
            cranialLight.color.setHex(activeSynapseColor);
          }
          const pt = ending.fullPathCurve.getPoint(ending.yellowVesicle.progress);
          ending.yellowVesicle.mesh.position.copy(pt);
          const vesMat = ending.yellowVesicle.mesh.material as THREE.MeshBasicMaterial;
          vesMat.color.setHex(activeSynapseColor);
          vesMat.opacity = 0.98;
          // Ilumina a medula espinhal durante o fluxo de dados
          spinalLight.intensity = 2.4 + Math.sin(ending.yellowVesicle.progress * Math.PI) * 2.0;
          spinalLight.color.setHex(activeSynapseColor);
        } else {
          (ending.yellowVesicle.mesh.material as THREE.MeshBasicMaterial).opacity = 0.0;
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!currentMount) return;
      const nw = currentMount.clientWidth;
      const nh = currentMount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchend', handlePointerUp);
      dom.removeEventListener('mousedown', handlePointerDown);
      dom.removeEventListener('touchstart', handlePointerDown);
      dom.removeEventListener('wheel', handleWheel);
      dom.removeEventListener('click', handleClick);
      cancelAnimationFrame(animationFrameId);

      renderer.dispose();
      if (currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement);
      }
    };
  }, [memories, agents]);

  return (
    <div className="relative w-full h-full bg-[#02050e] overflow-hidden select-none">
      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
};
