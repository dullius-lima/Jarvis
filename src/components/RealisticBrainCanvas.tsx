import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SynapseMemory, SentimentAnalysisResult } from '../types/neural';
import { Activity, Zap, Radio, Target, CheckCircle2, RotateCcw, RotateCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

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
  particles: { progress: number; speed: number; mesh: THREE.Mesh }[];
  phaseOffset: number;
  isDirectToCore: boolean;
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

  // Encontrar o nó alvo atual (se houver)
  const currentTargetMem = memories.find((m) => m.id === activeTargetNodeId);

  // Referência para atualizar estados reativos dentro do loop de renderização do Three.js
  const activeTargetNodeIdRef = useRef<string | null>(activeTargetNodeId || null);
  const activeSynapsePulseRef = useRef<string | null>(activeSynapsePulse || null);
  const isJarvisSpeakingRef = useRef<boolean>(isJarvisSpeaking);
  const isListeningRef = useRef<boolean>(isListening);

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
  }, [activeSynapsePulse]);

  useEffect(() => {
    isJarvisSpeakingRef.current = isJarvisSpeaking;
  }, [isJarvisSpeaking]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Cenário Three.js
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020713, 0.08);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.6, 6.2);

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

    // 3. Grupo Principal do Cérebro
    const brainGroup = new THREE.Group();
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
      else if (mem.id === 'mem-taee11') shortTitle = '📊 TAEE11';
      else if (mem.id === 'mem-bbas3') shortTitle = '📊 BBAS3';
      else if (mem.id === 'mem-btc') shortTitle = '🪙 BTC';
      else if (mem.id === 'mem-saude') shortTitle = '🏥 Saúde';
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

      // Partículas de disparo sináptico
      const bridgeParticles: { progress: number; speed: number; mesh: THREE.Mesh }[] = [];
      const particleGeo = new THREE.SphereGeometry(0.038, 8, 8);

      for (let k = 0; k < 3; k++) {
        const particleMat = new THREE.MeshBasicMaterial({
          color: 0xff2222, // Vermelho puro de sinapse ativa
          transparent: true,
          opacity: 0.0, // Começa invisível em repouso
          blending: THREE.AdditiveBlending,
        });
        const pMesh = new THREE.Mesh(particleGeo, particleMat);
        const initialProgress = k / 3;
        pMesh.position.lerpVectors(p1, p2, initialProgress);
        bridgesGroup.add(pMesh);

        bridgeParticles.push({
          progress: initialProgress,
          speed: 0.35 + Math.random() * 0.25,
          mesh: pMesh,
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
    // 8. CONTROLES DE MOUSE / TOUCH / EXPANSÃO (ZOOM) E ROTAÇÃO MANUAL
    // =========================================================================
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let targetRotationX = 0.1;
    let targetRotationY = 0.35;
    let targetCameraDistance = 6.2;
    let initialPinchDist = 0;

    controlsRef.current = {
      zoomIn: () => {
        targetCameraDistance = Math.max(2.6, targetCameraDistance - 0.9);
      },
      zoomOut: () => {
        targetCameraDistance = Math.min(10.0, targetCameraDistance + 0.9);
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
        targetCameraDistance = 6.2;
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

      // Iluminação pontual: acende em vermelho no alvo ou permanece em azul sereno
      if (isFiring && targetId) {
        const targetGroup = nodeGroupsMap.get(targetId);
        if (targetGroup) {
          pointLightSynapseRed.position.copy(targetGroup.position);
          pointLightSynapseRed.intensity = synapticExcitation * 4.5;
        }
      } else {
        pointLightSynapseRed.intensity = 0.0;
      }

      // Luz central do Jarvis
      pointLightBlue.intensity = 3.2 + Math.sin(elapsed * 3) * 0.4;
      centralHubMesh.rotation.y += 0.02;
      centralHubMesh.rotation.x += 0.01;

      // =======================================================================
      // 10. ATUALIZAÇÃO CIRÚRGICA DE SINAPSES (SOMENTE O NÓ ALVO FICA VERMELHO)
      // =======================================================================
      targetedBridges.forEach((bridge) => {
        const isThisBridgeTargeted = targetId && bridge.targetMemoryId === targetId;

        if (isThisBridgeTargeted && isFiring) {
          // A. SINAPSE CIRÚRGICA ALVO: COR VERMELHA VIBRANTE E EXPANSÃO DE PULSO
          const pulseWave = Math.sin(elapsed * 18.0 + bridge.phaseOffset);
          const dynamicRadius = (0.018 + synapticExcitation * 0.028) * (1.0 + pulseWave * 0.25);

          bridge.coreMesh.scale.set(dynamicRadius, bridge.length, dynamicRadius);
          (bridge.coreMesh.material as THREE.MeshBasicMaterial).color.copy(redColor);
          (bridge.coreMesh.material as THREE.MeshBasicMaterial).opacity = 0.95;

          const glowRadius = dynamicRadius * 2.8;
          bridge.glowMesh.scale.set(glowRadius, bridge.length, glowRadius);
          (bridge.glowMesh.material as THREE.MeshBasicMaterial).color.copy(redGlowColor);
          (bridge.glowMesh.material as THREE.MeshBasicMaterial).opacity = 0.75;

          // Partículas vermelhas viajando em alta velocidade apenas nesta sinapse
          bridge.particles.forEach((part) => {
            part.progress = (part.progress + part.speed * 2.8 * delta) % 1.0;
            part.mesh.position.lerpVectors(bridge.p1, bridge.p2, part.progress);
            const pScale = dynamicRadius * 3.0;
            part.mesh.scale.set(pScale, pScale, pScale);
            (part.mesh.material as THREE.MeshBasicMaterial).opacity = 0.98;
          });
        } else {
          // B. DEMAIS SINAPSES: REPOUSO AZUL CIBERNÉTICO SERENO (ZERO DISPARO VERMELHO)
          bridge.coreMesh.scale.set(0.008, bridge.length, 0.008);
          (bridge.coreMesh.material as THREE.MeshBasicMaterial).color.copy(restingCyanColor);
          (bridge.coreMesh.material as THREE.MeshBasicMaterial).opacity = 0.16;

          bridge.glowMesh.scale.set(0.018, bridge.length, 0.018);
          (bridge.glowMesh.material as THREE.MeshBasicMaterial).color.copy(restingGlowColor);
          (bridge.glowMesh.material as THREE.MeshBasicMaterial).opacity = 0.10;

          // Partículas ficam 100% invisíveis nas demais pontes
          bridge.particles.forEach((part) => {
            (part.mesh.material as THREE.MeshBasicMaterial).opacity = 0.0;
          });
        }
      });

      // =======================================================================
      // 11. ATUALIZAÇÃO DOS NÓS MENORES (RETÍCULOS E LABELS)
      // =======================================================================
      memories.forEach((mem) => {
        const group = nodeGroupsMap.get(mem.id);
        if (!group) return;

        const isTarget = targetId && mem.id === targetId;
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
          {isCurrentlyFiring && currentTargetMem ? (
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
