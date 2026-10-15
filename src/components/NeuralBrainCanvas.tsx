import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface NeuralHub {
  id: string;
  name: string;
  subname: string;
  category: 'cfo' | 'email' | 'whatsapp' | 'agenda' | 'seguranca' | 'localizacao' | 'custom';
  position: [number, number, number];
  color: number;
  description: string;
  metrics: string;
}

export const NEURAL_HUBS: NeuralHub[] = [
  {
    id: 'cfo-hub',
    name: 'CFO & Alocador de Capital',
    subname: 'Investimentos Dullius',
    category: 'cfo',
    position: [0, 1.4, 1.8], // Lobo Frontal Superior
    color: 0xf59e0b, // Âmbar Ouro
    description: 'Auditoria fria e matemática de Bazin, solvência, FIIs, Cripto e Renda Fixa.',
    metrics: 'Teto Soberano · Dívida/EBITDA < 3.5x',
  },
  {
    id: 'email-hub',
    name: 'Secretaria Executiva & E-mails',
    subname: 'Triagem e Priorização',
    category: 'email',
    position: [-1.8, 0.4, 0.6], // Lobo Temporal Esquerdo
    color: 0x38bdf8, // Ciano Elétrico
    description: 'Sincronização de caixas de entrada, triagem de contratos e despachos.',
    metrics: 'Inbox Sync · Prioridade Alta',
  },
  {
    id: 'whatsapp-hub',
    name: 'Comunicações & WhatsApp',
    subname: 'Canal Instantâneo Seguro',
    category: 'whatsapp',
    position: [1.8, 0.4, 0.6], // Lobo Temporal Direito
    color: 0x10b981, // Verde Esmeralda
    description: 'Webhooks de mensageria, ordens de serviço e notificações prioritárias.',
    metrics: 'Webhooks Ativos · Resposta Autônoma',
  },
  {
    id: 'agenda-hub',
    name: 'Agenda Executiva & Prazos',
    subname: 'Calendário & Vencimentos',
    category: 'agenda',
    position: [0, 2.0, -0.6], // Lobo Parietal
    color: 0x8b5cf6, // Violeta
    description: 'Comitês de investimento, reuniões de diretoria e pagamentos de proventos.',
    metrics: 'Compromissos Sincronizados',
  },
  {
    id: 'seguranca-hub',
    name: 'Sentinela & Segurança',
    subname: 'Blindagem 24/7',
    category: 'seguranca',
    position: [0, -0.6, -1.8], // Lobo Occipital
    color: 0xef4444, // Rubi
    description: 'Auditoria de integridade, anomalias de mercado cripto e proteção de dados.',
    metrics: 'Sentinela 24/7 · Silêncio Operacional',
  },
  {
    id: 'localizacao-hub',
    name: 'Agente de Geolocalização',
    subname: 'Monitoramento Territorial',
    category: 'localizacao',
    position: [-1.4, -1.0, 0.8], // Lobo Insular
    color: 0xf97316, // Laranja
    description: 'Rastreamento de zonas seguras, coordenadas da sede e ativos físicos.',
    metrics: 'Geofencing Ativo · Zonas Seguras',
  },
  {
    id: 'custom-hub',
    name: 'Sinapse Dinâmica (Nova Habilidade)',
    subname: 'Expansão Neural da Vida',
    category: 'custom',
    position: [1.4, -1.0, 0.8],
    color: 0xec4899, // Magenta
    description: 'Cadastre qualquer nova função: médico, jurídico, automação residencial, etc.',
    metrics: 'Capacidade Infinita de Aprendizado',
  },
];

interface NeuralBrainCanvasProps {
  hubAtivoId: string;
  onSelecionarHub: (hub: NeuralHub) => void;
}

export const NeuralBrainCanvas: React.FC<NeuralBrainCanvasProps> = ({
  hubAtivoId,
  onSelecionarHub,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hubHovered, setHubHovered] = useState<NeuralHub | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Dimensões
    let width = container.clientWidth || 800;
    let height = container.clientHeight || 560;

    // 1. Cena, Câmera e Renderer PBR
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050814);
    scene.fog = new THREE.FogExp2(0x050814, 0.08);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.2, 5.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    // Studio Environment Reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 2. Iluminação de Estúdio PBR
    const ambientLight = new THREE.AmbientLight(0x0a1128, 1.2);
    scene.add(ambientLight);

    const dirLightWarm = new THREE.DirectionalLight(0xffedd5, 2.2);
    dirLightWarm.position.set(5, 8, 4);
    scene.add(dirLightWarm);

    const dirLightCool = new THREE.DirectionalLight(0x06b6d4, 1.8);
    dirLightCool.position.set(-6, -4, -4);
    scene.add(dirLightCool);

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x050814, 0.9);
    scene.add(hemiLight);

    // 3. Estrutura Tridimensional do Cérebro (Composta em THREE.Group)
    const brainGroup = new THREE.Group();
    scene.add(brainGroup);

    // Materiais dos Hemisférios Cerebrais (PBR translúcido de alta tecnologia)
    const cortexMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      emissive: 0x0b1329,
      metalness: 0.2,
      roughness: 0.35,
      transmission: 0.6,
      ior: 1.4,
      thickness: 1.2,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });

    const innerCoreMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2,
      clearcoat: 1.0,
    });

    // Hemisfério Esquerdo
    const leftHemisphereGeo = new THREE.SphereGeometry(1.6, 24, 24);
    leftHemisphereGeo.scale(0.85, 1.15, 1.3);
    const leftHemisphere = new THREE.Mesh(leftHemisphereGeo, cortexMaterial);
    leftHemisphere.position.set(-0.75, 0.2, 0);
    brainGroup.add(leftHemisphere);

    // Hemisfério Direito
    const rightHemisphereGeo = new THREE.SphereGeometry(1.6, 24, 24);
    rightHemisphereGeo.scale(0.85, 1.15, 1.3);
    const rightHemisphere = new THREE.Mesh(rightHemisphereGeo, cortexMaterial);
    rightHemisphere.position.set(0.75, 0.2, 0);
    brainGroup.add(rightHemisphere);

    // Núcleo Sináptico Central (Corpo Caloso)
    const coreGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.8, 16);
    coreGeo.rotateZ(Math.PI / 2);
    const centralCore = new THREE.Mesh(coreGeo, innerCoreMaterial);
    centralCore.position.set(0, 0.1, 0);
    brainGroup.add(centralCore);

    // 4. Feixes Neurais / Fibras de Comunicação (Tubos com curvas bezier 3D)
    const fiberCurves: THREE.CatmullRomCurve3[] = [];
    const fiberMaterial = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });

    NEURAL_HUBS.forEach((hub) => {
      const pEnd = new THREE.Vector3(...hub.position);
      const pMid = new THREE.Vector3(hub.position[0] * 0.5, hub.position[1] * 0.5 + 0.2, hub.position[2] * 0.5);
      const pStart = new THREE.Vector3(0, 0, 0);

      const curve = new THREE.CatmullRomCurve3([pStart, pMid, pEnd]);
      fiberCurves.push(curve);

      const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.025, 6, false);
      const tubeMesh = new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({ color: hub.color, transparent: true, opacity: 0.6 }));
      brainGroup.add(tubeMesh);
    });

    // 5. Partículas de Sinapses Neurais (1.200 partículas pulsantes)
    const particleCount = 1200;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      // Distribuição em formato elipsoidal dos lóbulos cerebrais
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * 1.7;

      const sinPhi = Math.sin(phi);
      const x = r * sinPhi * Math.cos(theta) * 0.95 + (Math.random() > 0.5 ? 0.6 : -0.6);
      const y = r * sinPhi * Math.sin(theta) * 1.1 + 0.2;
      const z = r * Math.cos(phi) * 1.3;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Cores cibernéticas (azul elétrico, ciano, âmbar e violeta)
      const colorMix = Math.random();
      if (colorMix < 0.35) {
        colors[i * 3] = 0.22; colors[i * 3 + 1] = 0.74; colors[i * 3 + 2] = 0.97; // Ciano
      } else if (colorMix < 0.7) {
        colors[i * 3] = 0.96; colors[i * 3 + 1] = 0.62; colors[i * 3 + 2] = 0.04; // Âmbar (CFO)
      } else {
        colors[i * 3] = 0.55; colors[i * 3 + 1] = 0.36; colors[i * 3 + 2] = 0.96; // Violeta
      }
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.035,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    brainGroup.add(particleSystem);

    // 6. Nós dos Lóbulos Neurais Interativos (Raycasting Targets)
    const hubMeshes: THREE.Mesh[] = [];
    const hubGlows: THREE.Mesh[] = [];

    NEURAL_HUBS.forEach((hub) => {
      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(...hub.position);

      // Esfera principal do nó
      const sphereGeo = new THREE.SphereGeometry(0.18, 16, 16);
      const sphereMat = new THREE.MeshPhysicalMaterial({
        color: hub.color,
        emissive: hub.color,
        emissiveIntensity: 0.6,
        metalness: 0.4,
        roughness: 0.2,
      });
      const nodeMesh = new THREE.Mesh(sphereGeo, sphereMat);
      nodeMesh.userData = { hub };
      hubMeshes.push(nodeMesh);
      nodeGroup.add(nodeMesh);

      // Halo de pulso em torno do nó
      const haloGeo = new THREE.RingGeometry(0.24, 0.28, 24);
      const haloMat = new THREE.MeshBasicMaterial({
        color: hub.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.userData = { isHalo: true };
      hubGlows.push(haloMesh);
      nodeGroup.add(haloMesh);

      brainGroup.add(nodeGroup);
    });

    // Anel orbital de dados (conexões externas da vida)
    const orbitRingGeo = new THREE.TorusGeometry(2.4, 0.015, 8, 80);
    const orbitRingMat = new THREE.MeshBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.4 });
    const orbitRing = new THREE.Mesh(orbitRingGeo, orbitRingMat);
    orbitRing.rotation.x = Math.PI / 2.3;
    brainGroup.add(orbitRing);

    // 7. Raycasting & Interação com o Mouse / Toque
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Rotação suave do mouse (Exponential damping)
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let targetRotationY = 0;
    let targetRotationX = 0;

    const onPointerDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onPointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        targetRotationY += deltaX * 0.006;
        targetRotationX += deltaY * 0.006;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }

      // Raycast em nós
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(hubMeshes);
      if (intersects.length > 0) {
        const found = intersects[0].object.userData.hub as NeuralHub;
        setHubHovered(found);
        container.style.cursor = 'pointer';
      } else {
        setHubHovered(null);
        container.style.cursor = isDragging ? 'grabbing' : 'grab';
      }
    };

    const onPointerUp = () => {
      isDragging = false;
      container.style.cursor = 'grab';
    };

    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(hubMeshes);
      if (intersects.length > 0) {
        const hub = intersects[0].object.userData.hub as NeuralHub;
        onSelecionarHub(hub);
      }
    };

    container.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    container.addEventListener('click', onClick);

    // 8. Loop de Animação a 60fps com Amortecimento Exponencial
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Rotação suave contínua + arrasto do usuário
      if (!isDragging) {
        targetRotationY += delta * 0.12; // Rotação autônoma do cérebro
      }

      brainGroup.rotation.y = THREE.MathUtils.damp(brainGroup.rotation.y, targetRotationY, 8, delta);
      brainGroup.rotation.x = THREE.MathUtils.damp(brainGroup.rotation.x, targetRotationX, 8, delta);

      // Pulso das partículas sinápticas
      const posAttr = particleGeo.attributes.position as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;
      for (let p = 0; p < particleCount; p += 3) {
        const idx = p * 3 + 1;
        posArray[idx] += Math.sin(elapsed * 2.5 + p) * 0.0015;
      }
      posAttr.needsUpdate = true;

      // Pulso luminoso dos halos dos nós
      hubGlows.forEach((halo, i) => {
        const pulse = 1.0 + Math.sin(elapsed * 3.0 + i) * 0.15;
        halo.scale.set(pulse, pulse, pulse);
        halo.quaternion.copy(camera.quaternion); // Sempre de frente para a câmera
      });

      // Leve flutuação vertical do cérebro
      brainGroup.position.y = Math.sin(elapsed * 1.2) * 0.08;

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // Redimensionamento
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || 800;
      height = container.clientHeight || 560;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      container.removeEventListener('click', onClick);

      // Limpeza de recursos Three.js
      cortexMaterial.dispose();
      innerCoreMaterial.dispose();
      fiberMaterial.dispose();
      particleMat.dispose();
      particleGeo.dispose();
      leftHemisphereGeo.dispose();
      rightHemisphereGeo.dispose();
      coreGeo.dispose();
      orbitRingGeo.dispose();
      orbitRingMat.dispose();
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [onSelecionarHub]);

  return (
    <div className="relative w-full h-[580px] rounded-2xl overflow-hidden border border-cyan-500/30 bg-slate-950 shadow-2xl">
      {/* Container de Montagem Three.js */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Header Holográfico do Cérebro */}
      <div className="absolute top-4 left-4 pointer-events-none z-10 bg-slate-950/80 border border-slate-800 p-3 rounded-xl backdrop-blur-md max-w-sm">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-extrabold text-xs tracking-wider text-slate-100 uppercase">
            CÉREBRO NEURAL CENTRAL
          </span>
        </div>
        <div className="text-[11px] text-slate-400 mt-1">
          Holding "Investimentos Dullius" & Sistema Operacional da Vida
        </div>
        <div className="text-[10px] text-cyan-400 font-mono mt-1">
          7 Lóbulos Neurais Sincronizados · Arraste para girar em 360°
        </div>
      </div>

      {/* Tooltip Dinâmico ao passar mouse nos Lóbulos */}
      {hubHovered && (
        <div className="absolute top-4 right-4 pointer-events-none z-10 bg-slate-900/95 border border-amber-500/60 p-3.5 rounded-xl backdrop-blur-md shadow-2xl max-w-xs animate-in fade-in slide-in-from-top-2">
          <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
            <span>⚡ {hubHovered.name}</span>
          </div>
          <div className="text-[11px] text-slate-300 font-semibold mt-0.5">
            {hubHovered.subname}
          </div>
          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
            {hubHovered.description}
          </p>
          <div className="text-[10px] text-emerald-400 font-mono mt-2 bg-slate-950 p-1.5 rounded border border-slate-800">
            {hubHovered.metrics}
          </div>
        </div>
      )}

      {/* Dock Inferior com Seletor Rápido de Lóbulos Neurais */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-slate-950/90 border border-slate-800 px-3 py-2 rounded-xl backdrop-blur-md flex flex-wrap items-center justify-center gap-1.5 max-w-[95vw]">
        {NEURAL_HUBS.map((hub) => (
          <button
            key={hub.id}
            onClick={() => onSelecionarHub(hub)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              hubAtivoId === hub.id
                ? 'bg-amber-500 text-slate-950 shadow-md scale-105'
                : 'bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: `#${hub.color.toString(16).padStart(6, '0')}` }}
            />
            {hub.name.split('&')[0].trim()}
          </button>
        ))}
      </div>
    </div>
  );
};
