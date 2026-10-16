import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import {
  SynapseMemory,
  SentimentAnalysisResult,
  AgentDefinition,
  AgentNerveSignal,
  BodyPartAnatomy,
  CognitiveClusterNode,
  BodyViewPerspective,
} from '../types/neural';
import { BODY_PARTS_CONFIG } from '../services/agentRegistry';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  RotateCw,
  User,
  Bot,
} from 'lucide-react';

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
  agents?: AgentDefinition[];
  onSelectAgent?: (agent: AgentDefinition) => void;
  activeNerveSignal?: AgentNerveSignal | null;
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
  curve: THREE.QuadraticBezierCurve3;
  nerveTubeMesh: THREE.Mesh;
  socketMesh: THREE.Mesh;
  socketHaloMesh: THREE.Mesh;
  socketLabelSprite?: THREE.Sprite;
  targetCoords: THREE.Vector3;
  redMolecules: Array<{ mesh: THREE.Mesh; progress: number; speed: number }>;
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
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const isPointerDownRef = useRef<boolean>(false);
  const pointerPrevRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredMemory, setHoveredMemory] = useState<SynapseMemory | null>(null);
  const [hoveredAgent, setHoveredAgent] = useState<AgentDefinition | null>(null);
  const [viewPerspective, setViewPerspective] = useState<BodyViewPerspective>('FULL_BODY');

  const memoriesRef = useRef(memories);
  memoriesRef.current = memories;
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const activeNerveSignalRef = useRef(activeNerveSignal);
  activeNerveSignalRef.current = activeNerveSignal;

  const controlsRef = useRef({
    zoomIn: () => {},
    zoomOut: () => {},
    resetView: () => {},
    rotateLeft: () => {},
    rotateRight: () => {},
    focusBody: () => {},
    focusBrain: () => {},
  });

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const width = currentMount.clientWidth || window.innerWidth;
    const height = currentMount.clientHeight || window.innerHeight;

    // 1. Cena Three.js
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02050e, 0.022);

    // 2. Câmera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0.6, 9.8);
    camera.lookAt(0, 0.2, 0);

    // 3. Renderizador
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x02050e, 1.0);
    currentMount.appendChild(renderer.domElement);

    // 4. Luzes
    const ambientLight = new THREE.AmbientLight(0x032244, 1.2);
    scene.add(ambientLight);

    const cranialLight = new THREE.PointLight(0x00f5ff, 2.5, 12);
    cranialLight.position.set(0, 2.8, 1.5);
    scene.add(cranialLight);

    const bodyLight = new THREE.PointLight(0x38bdf8, 1.8, 10);
    bodyLight.position.set(0, 0.5, 2.0);
    scene.add(bodyLight);

    // 5. Grupos Principais
    const mainHumanoidGroup = new THREE.Group();
    scene.add(mainHumanoidGroup);

    const brainGroup = new THREE.Group();
    brainGroup.position.set(0, 2.7, 0); // Posicionado no interior do crânio humano
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
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });

    const jointMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });

    // 1. Cabeça & Contorno Craniano
    const craniumPoints: THREE.Vector3[] = [];
    const craniumSegments = 40;
    for (let i = 0; i <= craniumSegments; i++) {
      const theta = (i / craniumSegments) * Math.PI * 2;
      const rx = 0.52 * Math.cos(theta);
      const ry = 0.64 * Math.sin(theta);
      craniumPoints.push(new THREE.Vector3(rx, 2.75 + ry, 0.05 * Math.sin(theta)));
    }
    const craniumGeo = new THREE.BufferGeometry().setFromPoints(craniumPoints);
    skeletonGroup.add(new THREE.Line(craniumGeo, boneMaterial));

    // Queixo e Mandíbula
    const jawPoints = [
      new THREE.Vector3(-0.35, 2.55, 0.1),
      new THREE.Vector3(-0.2, 2.15, 0.22),
      new THREE.Vector3(0, 2.08, 0.25),
      new THREE.Vector3(0.2, 2.15, 0.22),
      new THREE.Vector3(0.35, 2.55, 0.1),
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(jawPoints), boneMaterial));

    // 2. Coluna Vertebral & Vértebras Luminescentes (24 Vértebras da Cervical ao Sacro)
    const spineLength = 2.4;
    const numVertebrae = 24;
    const spineStartY = 2.05;
    const spineVertebraeMeshes: THREE.Mesh[] = [];
    const vertGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.025, 10);

    for (let s = 0; s < numVertebrae; s++) {
      const progress = s / (numVertebrae - 1);
      const vY = spineStartY - progress * spineLength;
      // Curvatura anatômica lordose/cifose
      const vZ = -0.05 + Math.sin(progress * Math.PI * 2) * 0.06;

      const vMesh = new THREE.Mesh(vertGeo, jointMaterial);
      vMesh.position.set(0, vY, vZ);
      vMesh.rotation.x = Math.PI / 2;
      skeletonGroup.add(vMesh);
      spineVertebraeMeshes.push(vMesh);
    }

    // Cordão medular contínuo
    const unitCylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    const spinalCordMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.5 });
    const spinalCordMesh = new THREE.Mesh(unitCylinderGeo, spinalCordMat);
    spinalCordMesh.position.set(0, spineStartY - spineLength * 0.5, -0.04);
    spinalCordMesh.scale.set(0.016, spineLength, 0.016);
    skeletonGroup.add(spinalCordMesh);

    // 3. Clavículas & Ombros
    const claviclePoints = [
      new THREE.Vector3(-1.35, 1.75, 0.0),
      new THREE.Vector3(-0.3, 1.85, 0.15),
      new THREE.Vector3(0, 1.88, 0.16),
      new THREE.Vector3(0.3, 1.85, 0.15),
      new THREE.Vector3(1.35, 1.75, 0.0),
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(claviclePoints), boneMaterial));

    // 4. Caixa Torácica / Costelas Anatômicas (8 pares de arcos torácicos)
    for (let r = 0; r < 8; r++) {
      const ribY = 1.7 - r * 0.13;
      const ribWidth = 0.55 + Math.sin((r / 8) * Math.PI) * 0.32;
      const ribDepth = 0.22 + Math.sin((r / 8) * Math.PI) * 0.12;

      const leftRibCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, ribY, -0.05),
        new THREE.Vector3(-ribWidth * 1.1, ribY - 0.04, ribDepth * 0.8),
        new THREE.Vector3(-0.05, ribY - 0.07, ribDepth)
      );
      skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftRibCurve.getPoints(12)), boneMaterial));

      const rightRibCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, ribY, -0.05),
        new THREE.Vector3(ribWidth * 1.1, ribY - 0.04, ribDepth * 0.8),
        new THREE.Vector3(0.05, ribY - 0.07, ribDepth)
      );
      skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightRibCurve.getPoints(12)), boneMaterial));
    }

    // 5. Braços e Mãos com Dedos Anatômicos
    // Braço Esquerdo
    const leftArmPoints = [
      new THREE.Vector3(-1.35, 1.75, 0.0),  // Ombro
      new THREE.Vector3(-1.95, 1.05, 0.05), // Cotovelo
      new THREE.Vector3(-2.35, 0.25, 0.12), // Pulso
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftArmPoints), boneMaterial));

    // Mão Esquerda (Falanges)
    for (let f = 0; f < 5; f++) {
      const angle = (f - 2) * 0.12;
      const fingerPoints = [
        new THREE.Vector3(-2.35, 0.25, 0.12),
        new THREE.Vector3(-2.45 - Math.cos(angle) * 0.2, 0.15 - Math.sin(angle) * 0.12, 0.12 + (f - 2) * 0.03),
      ];
      skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(fingerPoints), boneMaterial));
    }

    // Braço Direito
    const rightArmPoints = [
      new THREE.Vector3(1.35, 1.75, 0.0),   // Ombro
      new THREE.Vector3(1.95, 1.05, 0.05),  // Cotovelo
      new THREE.Vector3(2.35, 0.25, 0.12),  // Pulso
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightArmPoints), boneMaterial));

    // Mão Direita (Falanges)
    for (let f = 0; f < 5; f++) {
      const angle = (f - 2) * 0.12;
      const fingerPoints = [
        new THREE.Vector3(2.35, 0.25, 0.12),
        new THREE.Vector3(2.45 + Math.cos(angle) * 0.2, 0.15 - Math.sin(angle) * 0.12, 0.12 + (f - 2) * 0.03),
      ];
      skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(fingerPoints), boneMaterial));
    }

    // 6. Pelve e Quadril Anatômico
    const pelvisPoints = [
      new THREE.Vector3(-0.65, 0.15, 0.05),
      new THREE.Vector3(0, 0.25, 0.0),
      new THREE.Vector3(0.65, 0.15, 0.05),
      new THREE.Vector3(0.5, -0.25, 0.08),
      new THREE.Vector3(0, -0.32, 0.12),
      new THREE.Vector3(-0.5, -0.25, 0.08),
      new THREE.Vector3(-0.65, 0.15, 0.05),
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pelvisPoints), boneMaterial));

    // 7. Pernas e Pés
    // Perna Esquerda
    const leftLegPoints = [
      new THREE.Vector3(-0.5, -0.25, 0.08), // Articulação do quadril
      new THREE.Vector3(-0.75, -1.35, 0.08), // Joelho
      new THREE.Vector3(-0.9, -2.55, 0.08),  // Tornozelo
      new THREE.Vector3(-0.95, -2.7, 0.35),  // Ponta do Pé
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftLegPoints), boneMaterial));

    // Perna Direita
    const rightLegPoints = [
      new THREE.Vector3(0.5, -0.25, 0.08),  // Articulação do quadril
      new THREE.Vector3(0.75, -1.35, 0.08),  // Joelho
      new THREE.Vector3(0.9, -2.55, 0.08),   // Tornozelo
      new THREE.Vector3(0.95, -2.7, 0.35),   // Ponta do Pé
    ];
    skeletonGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightLegPoints), boneMaterial));

    // Articulações luminosas
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
    const jointSphereGeo = new THREE.SphereGeometry(0.045, 10, 10);
    jointPositions.forEach((pos) => {
      const jMesh = new THREE.Mesh(jointSphereGeo, jointMaterial);
      jMesh.position.copy(pos);
      skeletonGroup.add(jMesh);
    });

    // =========================================================================
    // B. CÉREBRO NEURAL BIOLUMINESCENTE NO CÓRTEX CRANIANO
    // =========================================================================
    const brainNodes: THREE.Vector3[] = [];
    const brainParticleCount = 140;
    const centralCorePos = new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < brainParticleCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * 0.48;

      const isRight = Math.random() > 0.5;
      const hemiOffset = isRight ? 0.08 : -0.08;

      const x = r * Math.sin(phi) * Math.cos(theta) * 0.85 + hemiOffset;
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.75;
      const z = r * Math.cos(phi) * 0.95;

      brainNodes.push(new THREE.Vector3(x, y, z));
    }

    const plexusGeo = new THREE.BufferGeometry().setFromPoints(brainNodes);
    const plexusMat = new THREE.PointsMaterial({
      size: 0.04,
      color: 0x00f5ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.8,
    });
    brainGroup.add(new THREE.Points(plexusGeo, plexusMat));

    // Conexões sinápticas intracerebrais
    const brainLines: THREE.Vector3[] = [];
    for (let i = 0; i < brainNodes.length; i++) {
      for (let j = i + 1; j < brainNodes.length; j++) {
        if (brainNodes[i].distanceTo(brainNodes[j]) < 0.28) {
          brainLines.push(brainNodes[i], brainNodes[j]);
        }
      }
    }
    const brainLinesGeo = new THREE.BufferGeometry().setFromPoints(brainLines);
    const brainLinesMat = new THREE.LineBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });
    brainGroup.add(new THREE.LineSegments(brainLinesGeo, brainLinesMat));

    // =========================================================================
    // C. MEMÓRIAS: BOTÕES AXÔNICOS PEQUENOS E VESÍCULAS LENTAS ESPECÍFICAS
    // =========================================================================
    const memoryMeshes: THREE.Mesh[] = [];
    const targetedBridges: TargetedSynapseBridge[] = [];
    const bridgesGroup = new THREE.Group();
    brainGroup.add(bridgesGroup);

    const axonBoutonGeo = new THREE.SphereGeometry(0.045, 12, 12);
    const axonKernelGeo = new THREE.SphereGeometry(0.022, 8, 8);

    memories.forEach((mem) => {
      const memPos = new THREE.Vector3(...mem.coords);
      const memGroup = new THREE.Group();
      memGroup.position.copy(memPos);

      // Pequena bolinha neural
      const coreMat = new THREE.MeshBasicMaterial({
        color: mem.color || 0x06b6d4,
        transparent: true,
        opacity: 0.9,
      });
      const coreMesh = new THREE.Mesh(axonBoutonGeo, coreMat);
      coreMesh.userData = { memory: mem };
      memGroup.add(coreMesh);
      memoryMeshes.push(coreMesh);

      const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
      memGroup.add(new THREE.Mesh(axonKernelGeo, innerMat));

      brainGroup.add(memGroup);

      // Ponte axônica do centro para a memória
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
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
      });
      const bridgeCoreMesh = new THREE.Mesh(unitCylinderGeo, bridgeCoreMat);
      bridgeCoreMesh.position.copy(midpoint);
      bridgeCoreMesh.setRotationFromQuaternion(quaternion);
      bridgeCoreMesh.scale.set(0.006, length, 0.006);
      bridgesGroup.add(bridgeCoreMesh);

      const bridgeGlowMat = new THREE.MeshBasicMaterial({
        color: 0x0369a1,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
      });
      const bridgeGlowMesh = new THREE.Mesh(unitCylinderGeo, bridgeGlowMat);
      bridgeGlowMesh.position.copy(midpoint);
      bridgeGlowMesh.setRotationFromQuaternion(quaternion);
      bridgeGlowMesh.scale.set(0.012, length, 0.012);
      bridgesGroup.add(bridgeGlowMesh);

      // Vesículas biológicas lentas de transporte (movem-se apenas para a memória buscada!)
      const bridgeParticles: MolecularParticle[] = [];
      const numVesicles = 5;

      for (let k = 0; k < numVesicles; k++) {
        const vesicleRadius = 0.018;
        const particleGeo = new THREE.SphereGeometry(vesicleRadius, 8, 8);
        const particleMat = new THREE.MeshBasicMaterial({
          color: 0xef4444,
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
          baseSpeed: 0.05 + Math.random() * 0.02, // Lentidão biológica requerida pelo usuário
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
        glowMesh: bridgeGlowMesh,
        particles: bridgeParticles,
        phaseOffset: Math.random() * Math.PI * 2,
        isDirectToCore: true,
      });
    });

    // =========================================================================
    // D. SISTEMA NERVOSO PERIFÉRICO & INSTALAÇÃO AUTOMÁTICA DOS AGENTES
    // =========================================================================
    const bodyNerveEndings: BodyNerveEnding[] = [];
    const agentMeshes: THREE.Mesh[] = [];

    // Mapeamento dos agentes existentes para suas respectivas partes do corpo
    const agentByPart = new Map<BodyPartAnatomy, AgentDefinition>();
    agents.forEach((ag) => {
      if (ag.bodyPart) agentByPart.set(ag.bodyPart, ag);
    });

    Object.entries(BODY_PARTS_CONFIG).forEach(([partKey, config]) => {
      const bPart = partKey as BodyPartAnatomy;
      const associatedAgent = agentByPart.get(bPart);
      const targetCoords = new THREE.Vector3(...config.coords);

      // Ponto de origem na medula espinhal
      const nerveStartY = Math.min(Math.max(targetCoords.y + 0.35, -0.3), 1.95);
      const nerveStart = new THREE.Vector3(0, nerveStartY, -0.04);

      // Curva neural suave do tronco aos membros do corpo
      const ctrlPoint = new THREE.Vector3(
        targetCoords.x * 0.5,
        (nerveStartY + targetCoords.y) * 0.5 + 0.1,
        (nerveStart.z + targetCoords.z) * 0.5 + 0.05
      );
      const curve = new THREE.QuadraticBezierCurve3(nerveStart, ctrlPoint, targetCoords);

      // Tubo do feixe axônico (terminação nervosa periférica)
      const tubeGeo = new THREE.TubeGeometry(curve, 18, associatedAgent ? 0.016 : 0.008, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: associatedAgent ? config.colorHex : 0x0284c7,
        transparent: true,
        opacity: associatedAgent ? 0.65 : 0.18,
        blending: THREE.AdditiveBlending,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      pnsGroup.add(tubeMesh);

      // Receptor / Bio-socket do Agente no Corpo Humano
      const socketGeo = new THREE.SphereGeometry(associatedAgent ? 0.085 : 0.045, 14, 14);
      const socketMat = new THREE.MeshBasicMaterial({
        color: associatedAgent ? config.colorHex : 0x0284c7,
        transparent: true,
        opacity: associatedAgent ? 0.95 : 0.35,
      });
      const socketMesh = new THREE.Mesh(socketGeo, socketMat);
      socketMesh.position.copy(targetCoords);
      socketMesh.userData = { bodyPart: bPart, agent: associatedAgent };
      pnsGroup.add(socketMesh);
      agentMeshes.push(socketMesh);

      // Halo pulsante do bio-socket
      const socketHaloGeo = new THREE.RingGeometry(0.10, 0.14, 16);
      const socketHaloMat = new THREE.MeshBasicMaterial({
        color: associatedAgent ? config.colorHex : 0x0284c7,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: associatedAgent ? 0.7 : 0.0,
      });
      const socketHaloMesh = new THREE.Mesh(socketHaloGeo, socketHaloMat);
      socketHaloMesh.position.copy(targetCoords);
      pnsGroup.add(socketHaloMesh);

      // Placa sutil caso agente esteja instalado
      let socketLabelSprite: THREE.Sprite | undefined;
      if (associatedAgent) {
        const canvasTag = document.createElement('canvas');
        canvasTag.width = 256;
        canvasTag.height = 64;
        const ctxT = canvasTag.getContext('2d');
        if (ctxT) {
          ctxT.fillStyle = 'rgba(2, 6, 23, 0.85)';
          ctxT.strokeStyle = `#${config.colorHex.toString(16).padStart(6, '0')}`;
          ctxT.lineWidth = 2;
          ctxT.beginPath();
          ctxT.roundRect(8, 8, 240, 48, 8);
          ctxT.fill();
          ctxT.stroke();

          ctxT.font = 'bold 18px monospace';
          ctxT.fillStyle = '#ffffff';
          ctxT.textAlign = 'center';
          ctxT.textBaseline = 'middle';
          ctxT.fillText(associatedAgent.name.slice(0, 18), 128, 32);
        }
        const tagTexture = new THREE.CanvasTexture(canvasTag);
        const tagSpriteMat = new THREE.SpriteMaterial({ map: tagTexture, transparent: true, opacity: 0.9, depthTest: false });
        socketLabelSprite = new THREE.Sprite(tagSpriteMat);
        socketLabelSprite.position.set(targetCoords.x, targetCoords.y + 0.16, targetCoords.z);
        socketLabelSprite.scale.set(0.55, 0.14, 1.0);
        pnsGroup.add(socketLabelSprite);
      }

      // Moléculas Vermelhas (quando a LLM invoca o agente)
      const redMolecules: Array<{ mesh: THREE.Mesh; progress: number; speed: number }> = [];
      const redSphereGeo = new THREE.SphereGeometry(0.028, 8, 8);
      const redSphereMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
      });
      for (let m = 0; m < 5; m++) {
        const rMesh = new THREE.Mesh(redSphereGeo, redSphereMat.clone());
        pnsGroup.add(rMesh);
        redMolecules.push({
          mesh: rMesh,
          progress: m / 5,
          speed: 0.35 + Math.random() * 0.15,
        });
      }

      // Vesícula Amarela (quando o agente responde e se comunica com a LLM)
      const yellowGeo = new THREE.SphereGeometry(0.045, 10, 10);
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
        curve,
        nerveTubeMesh: tubeMesh,
        socketMesh,
        socketHaloMesh,
        socketLabelSprite,
        targetCoords,
        redMolecules,
        yellowVesicle: {
          mesh: yMesh,
          progress: 0.0,
          speed: 0.28,
          active: false,
        },
      });
    });

    // =========================================================================
    // E. CONTROLES DE CÂMERA & NAVEGAÇÃO 3D SUAVE
    // =========================================================================
    let targetCameraY = 0.6;
    let targetCameraZ = 9.8;
    let targetLookAtY = 0.2;
    let targetRotY = 0.0;

    controlsRef.current.zoomIn = () => {
      targetCameraZ = Math.max(targetCameraZ - 1.8, 3.2);
    };
    controlsRef.current.zoomOut = () => {
      targetCameraZ = Math.min(targetCameraZ + 1.8, 14.0);
    };
    controlsRef.current.resetView = () => {
      targetCameraY = 0.6;
      targetCameraZ = 9.8;
      targetLookAtY = 0.2;
      targetRotY = 0.0;
      setViewPerspective('FULL_BODY');
    };
    controlsRef.current.rotateLeft = () => {
      targetRotY += 0.45;
    };
    controlsRef.current.rotateRight = () => {
      targetRotY -= 0.45;
    };
    controlsRef.current.focusBody = () => {
      targetCameraY = 0.4;
      targetCameraZ = 8.5;
      targetLookAtY = 0.0;
      setViewPerspective('FULL_BODY');
    };
    controlsRef.current.focusBrain = () => {
      targetCameraY = 2.7;
      targetCameraZ = 4.2;
      targetLookAtY = 2.7;
      setViewPerspective('BRAIN_FOCUS');
    };

    // Eventos do mouse / touch para girar a visualização
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      isPointerDownRef.current = true;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      pointerPrevRef.current = { x: clientX, y: clientY };
    };

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!isPointerDownRef.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - pointerPrevRef.current.x;
      const deltaY = clientY - pointerPrevRef.current.y;

      targetRotY += deltaX * 0.005;
      targetCameraY = Math.max(Math.min(targetCameraY - deltaY * 0.005, 3.5), -1.5);

      pointerPrevRef.current = { x: clientX, y: clientY };
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      targetCameraZ = Math.max(Math.min(targetCameraZ + e.deltaY * 0.004, 15.0), 2.5);
    };

    // Raycaster para seleção de memórias e agentes
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (e: MouseEvent) => {
      const rect = currentMount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // Verificar clique em agente
      const agentHits = raycaster.intersectObjects(agentMeshes, false);
      if (agentHits.length > 0) {
        const hitData = agentHits[0].object.userData;
        if (hitData.agent && onSelectAgent) {
          onSelectAgent(hitData.agent);
          return;
        }
      }

      // Verificar clique em memória
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

      // Transição suave de câmera
      camera.position.z += (targetCameraZ - camera.position.z) * 0.08;
      camera.position.y += (targetCameraY - camera.position.y) * 0.08;
      mainHumanoidGroup.rotation.y += (targetRotY - mainHumanoidGroup.rotation.y) * 0.08;

      // Respiração sutil do corpo e cérebro
      const breath = Math.sin(elapsedTime * 1.5) * 0.015;
      skeletonGroup.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.5);

      // Animação das vértebras da coluna
      spineVertebraeMeshes.forEach((vMesh, idx) => {
        const mat = vMesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.45 + Math.sin(elapsedTime * 2.5 + idx * 0.25) * 0.25;
      });

      // Animação de Sinapses e Vesículas Lentas das Memórias
      const isPulseActive = Boolean(activeSynapsePulse);
      targetedBridges.forEach((bridge) => {
        const isTargeted = isPulseActive && activeTargetNodeId && (bridge.targetMemoryId === activeTargetNodeId || activeTargetNodeId.includes(bridge.targetMemoryId));

        bridge.particles.forEach((p) => {
          if (isTargeted) {
            p.progress += p.baseSpeed * delta;
            if (p.progress > 1.0) p.progress = 0.0;
            p.mesh.position.lerpVectors(bridge.p1, bridge.p2, p.progress);
            (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
            p.mesh.scale.setScalar(1.4);
          } else {
            // Se não for o alvo buscado, fica dormente e imperceptível!
            (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.0;
          }
        });
      });

      // Animação de Sinais Nervosos nos Membros do Corpo (Moléculas Vermelhas vs Vesícula Amarela)
      const currentSignal = activeNerveSignalRef.current;
      bodyNerveEndings.forEach((ending) => {
        const isSignalForPart = currentSignal && currentSignal.bodyPart === ending.bodyPartId;

        // Halo do bio-socket
        if (ending.socketHaloMesh) {
          ending.socketHaloMesh.rotation.z += 0.02;
          const hMat = ending.socketHaloMesh.material as THREE.MeshBasicMaterial;
          if (ending.agent) {
            hMat.opacity = isSignalForPart ? 0.95 : 0.45 + Math.sin(elapsedTime * 3.0) * 0.2;
          }
        }

        // A. Moléculas Vermelhas (Cérebro -> Agente)
        const isRedActive = isSignalForPart && currentSignal.direction === 'BRAIN_TO_AGENT';
        ending.redMolecules.forEach((r) => {
          if (isRedActive) {
            r.progress += r.speed * delta;
            if (r.progress > 1.0) r.progress = 0.0;
            const pt = ending.curve.getPoint(r.progress);
            r.mesh.position.copy(pt);
            (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
          } else {
            (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.0;
          }
        });

        // B. Vesícula Amarela (Agente -> Cérebro)
        const isYellowActive = isSignalForPart && currentSignal.direction === 'AGENT_TO_BRAIN';
        if (isYellowActive) {
          ending.yellowVesicle.progress += ending.yellowVesicle.speed * delta;
          if (ending.yellowVesicle.progress > 1.0) ending.yellowVesicle.progress = 0.0;
          // Caminha na direção contrária: do agente (1.0) para a medula/cérebro (0.0)
          const pt = ending.curve.getPoint(1.0 - ending.yellowVesicle.progress);
          ending.yellowVesicle.mesh.position.copy(pt);
          (ending.yellowVesicle.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
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
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      dom.removeEventListener('mousedown', handlePointerDown);
      dom.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchend', handlePointerUp);
      dom.removeEventListener('wheel', handleWheel);
      dom.removeEventListener('click', handleClick);

      if (currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [memories, agents]);

  return (
    <div className="relative w-full h-full min-h-[600px] flex items-center justify-center overflow-hidden select-none">
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Controles Discretos de Ampliação e Diminuição (Sem Poluição Visual) */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-20">
        <button
          onClick={() => controlsRef.current.zoomIn()}
          title="Ampliar (Zoom In)"
          className="p-2.5 rounded-xl bg-slate-950/80 hover:bg-cyan-950 text-cyan-400 border border-cyan-500/30 hover:border-cyan-400 transition-all shadow-lg active:scale-95 cursor-pointer backdrop-blur-md"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          onClick={() => controlsRef.current.zoomOut()}
          title="Diminuir (Zoom Out)"
          className="p-2.5 rounded-xl bg-slate-950/80 hover:bg-cyan-950 text-cyan-400 border border-cyan-500/30 hover:border-cyan-400 transition-all shadow-lg active:scale-95 cursor-pointer backdrop-blur-md"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          onClick={() => controlsRef.current.resetView()}
          title="Centralizar e Redefinir Vista"
          className="p-2.5 rounded-xl bg-slate-950/80 hover:bg-slate-900 text-slate-400 hover:text-white border border-slate-700/50 transition-all shadow-lg active:scale-95 cursor-pointer backdrop-blur-md"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <button
          onClick={() => controlsRef.current.focusBrain()}
          title="Foco no Cérebro Craniano"
          className="p-2.5 rounded-xl bg-slate-950/80 hover:bg-cyan-950 text-cyan-400 border border-cyan-500/30 hover:border-cyan-400 transition-all shadow-lg active:scale-95 cursor-pointer backdrop-blur-md"
        >
          <Bot className="w-4 h-4" />
        </button>

        <button
          onClick={() => controlsRef.current.focusBody()}
          title="Foco no Corpo Inteiro"
          className="p-2.5 rounded-xl bg-slate-950/80 hover:bg-cyan-950 text-cyan-400 border border-cyan-500/30 hover:border-cyan-400 transition-all shadow-lg active:scale-95 cursor-pointer backdrop-blur-md"
        >
          <User className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
