import React, { useEffect, useRef, useState } from 'react';
import { ANDARES_PREDIO } from '../data/seedData';
import { AndarPredio } from '../types';

interface BuildingCanvasProps {
  andarAtivo: number;
  onSelecionarAndar: (andar: number) => void;
  modoNoite?: boolean;
}

interface Employee {
  id: string;
  name: string;
  role: string;
  floor: number;
  x: number; // Posição X no canvas
  yOffset: number; // Offset Y a partir da base do andar
  minX: number;
  maxX: number;
  speed: number;
  direction: 1 | -1; // 1 = direita, -1 = esquerda
  isWalking: boolean;
  pauseTimer: number;
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  carryingItem?: 'pasta' | 'cafe' | 'prancheta' | 'tablet';
  activity: string;
}

export const BuildingCanvas: React.FC<BuildingCanvasProps> = ({
  andarAtivo,
  onSelecionarAndar,
  modoNoite = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [andarHover, setAndarHover] = useState<number | null>(null);
  const [employeeHovered, setEmployeeHovered] = useState<Employee | null>(null);
  const frameRef = useRef<number | null>(null);
  const tickRef = useRef<number>(0);

  // Dimensões do Canvas virtual
  const CANVAS_WIDTH = 920;
  const CANVAS_HEIGHT = 750;
  const ROOF_HEIGHT = 60;
  const FLOOR_HEIGHT = 120;
  const BASEMENT_HEIGHT = 145;
  const BUILDING_X = 110;
  const BUILDING_WIDTH = 680;
  const ELEVATOR_X = BUILDING_X + BUILDING_WIDTH - 65; // Eixo do elevador na lateral direita
  const ELEVATOR_WIDTH = 48;

  // Posição vertical do elevador animada
  const elevatorYRef = useRef<number>(ROOF_HEIGHT + 10);

  // Lista viva de funcionários com nomes e personalidades reais
  const employeesRef = useRef<Employee[]>([
    // 5º Andar: Mesa da Diretoria & Gabinete do CFO
    {
      id: 'cfo-roberto',
      name: 'Dr. Roberto Albuquerque',
      role: 'Chief Financial Officer (CFO)',
      floor: 5,
      x: BUILDING_X + 280,
      yOffset: 0,
      minX: BUILDING_X + 220,
      maxX: BUILDING_X + 460,
      speed: 0.6,
      direction: 1,
      isWalking: true,
      pauseTimer: 0,
      hairColor: '#475569',
      shirtColor: '#1e293b', // Terno executivo
      pantsColor: '#0f172a',
      carryingItem: 'pasta',
      activity: 'Revisando alocação e vereditos de Bazin',
    },
    {
      id: 'helena-gov',
      name: 'Helena Vasconcelos',
      role: 'Assessora de Governança & R.I.',
      floor: 5,
      x: BUILDING_X + 90,
      yOffset: 0,
      minX: BUILDING_X + 50,
      maxX: BUILDING_X + 210,
      speed: 0.7,
      direction: -1,
      isWalking: true,
      pauseTimer: 30,
      hairColor: '#78350f',
      shirtColor: '#0369a1', // Blazer azul
      pantsColor: '#1e293b',
      carryingItem: 'pasta',
      activity: 'Conferindo Tag Along e Novo Mercado',
    },

    // 4º Andar: Auditoria Fundamentalista & Proventos
    {
      id: 'lucas-bazin',
      name: 'Lucas Peixoto',
      role: 'Auditor Sênior Décio Bazin',
      floor: 4,
      x: BUILDING_X + 160,
      yOffset: 0,
      minX: BUILDING_X + 60,
      maxX: BUILDING_X + 320,
      speed: 0.8,
      direction: 1,
      isWalking: true,
      pauseTimer: 0,
      hairColor: '#1f2937',
      shirtColor: '#047857', // Verde esmeralda analítico
      pantsColor: '#334155',
      carryingItem: 'prancheta',
      activity: 'Expurgando proventos não-recorrentes da DFP',
    },
    {
      id: 'mariana-graham',
      name: 'Mariana Duarte',
      role: 'Analista de Graham & CAGR',
      floor: 4,
      x: BUILDING_X + 370,
      yOffset: 0,
      minX: BUILDING_X + 260,
      maxX: BUILDING_X + 530,
      speed: 0.75,
      direction: -1,
      isWalking: true,
      pauseTimer: 45,
      hairColor: '#b45309',
      shirtColor: '#7c3aed', // Roxo analítico
      pantsColor: '#1e293b',
      carryingItem: 'cafe',
      activity: 'Conferindo Preço Justo Graham e CAGR decenal',
    },

    // 3º Andar: Solvência & Crédito
    {
      id: 'cadu-solvencia',
      name: 'Carlos Eduardo "Cadu"',
      role: 'Especialista em Estrutura de Capital',
      floor: 3,
      x: BUILDING_X + 180,
      yOffset: 0,
      minX: BUILDING_X + 80,
      maxX: BUILDING_X + 380,
      speed: 0.65,
      direction: 1,
      isWalking: true,
      pauseTimer: 10,
      hairColor: '#334155',
      shirtColor: '#2563eb', // Azul crédito
      pantsColor: '#0f172a',
      carryingItem: 'prancheta',
      activity: 'Monitorando alerta de Dívida Líquida/EBITDA > 3.5x',
    },
    {
      id: 'camila-fco',
      name: 'Camila Siqueira',
      role: 'Auditora de Fluxo de Caixa',
      floor: 3,
      x: BUILDING_X + 410,
      yOffset: 0,
      minX: BUILDING_X + 320,
      maxX: BUILDING_X + 550,
      speed: 0.7,
      direction: -1,
      isWalking: true,
      pauseTimer: 20,
      hairColor: '#581c87',
      shirtColor: '#d97706', // Âmbar quente
      pantsColor: '#334155',
      carryingItem: 'tablet',
      activity: 'Testando divergência entre FCO e Lucro Líquido',
    },

    // 2º Andar: Radar de Risco Exógeno & CVM
    {
      id: 'thiago-cvm',
      name: 'Thiago Mendes',
      role: 'Sentinela de Fatos Relevantes CVM',
      floor: 2,
      x: BUILDING_X + 140,
      yOffset: 0,
      minX: BUILDING_X + 60,
      maxX: BUILDING_X + 340,
      speed: 0.85,
      direction: 1,
      isWalking: true,
      pauseTimer: 0,
      hairColor: '#18181b',
      shirtColor: '#e11d48', // Vinho/vermelho radar
      pantsColor: '#1e293b',
      carryingItem: 'tablet',
      activity: 'Filtrando ruídos transitórios de mercado',
    },
    {
      id: 'beatriz-macro',
      name: 'Beatriz Lima',
      role: 'Analista de Ruptura de Tese',
      floor: 2,
      x: BUILDING_X + 390,
      yOffset: 0,
      minX: BUILDING_X + 270,
      maxX: BUILDING_X + 540,
      speed: 0.6,
      direction: -1,
      isWalking: true,
      pauseTimer: 50,
      hairColor: '#451a03',
      shirtColor: '#db2777', // Rosa notícia
      pantsColor: '#0f172a',
      carryingItem: 'cafe',
      activity: 'Vigiando comunicados de conselho e assembleias',
    },

    // 1º Andar / Subsolo: Data Engine & Sentinela BTC 24/7
    {
      id: 'gabriel-data',
      name: 'Gabriel Rocha',
      role: 'Engenheiro de Dados & Ingestão',
      floor: 1,
      x: BUILDING_X + 110,
      yOffset: 0,
      minX: BUILDING_X + 40,
      maxX: BUILDING_X + 330,
      speed: 0.7,
      direction: 1,
      isWalking: true,
      pauseTimer: 15,
      hairColor: '#0f172a',
      shirtColor: '#0891b2', // Ciano servidor
      pantsColor: '#1e293b',
      carryingItem: 'tablet',
      activity: 'Calibrando APIs de Bacen, Selic e cotações B3',
    },
    {
      id: 'sofia-btc',
      name: 'Sofia Nakamura',
      role: 'Sentinela Algorítmica Cripto 24/7',
      floor: 1,
      x: BUILDING_X + 380,
      yOffset: 0,
      minX: BUILDING_X + 260,
      maxX: BUILDING_X + 520,
      speed: 0.8,
      direction: -1,
      isWalking: true,
      pauseTimer: 0,
      hairColor: '#312e81',
      shirtColor: '#f59e0b', // Laranja Bitcoin
      pantsColor: '#020617',
      carryingItem: 'prancheta',
      activity: 'Checando regime de silêncio vs variação > 5% em 1h',
    },
  ]);

  // Altura base de cada andar
  const getFloorY = (andarNum: number) => {
    switch (andarNum) {
      case 5: return ROOF_HEIGHT + 10;
      case 4: return ROOF_HEIGHT + FLOOR_HEIGHT;
      case 3: return ROOF_HEIGHT + FLOOR_HEIGHT * 2;
      case 2: return ROOF_HEIGHT + FLOOR_HEIGHT * 3;
      case 1: return ROOF_HEIGHT + FLOOR_HEIGHT * 4;
      default: return ROOF_HEIGHT + 10;
    }
  };

  const getFloorHeight = (andarNum: number) => {
    return andarNum === 1 ? BASEMENT_HEIGHT - 10 : FLOOR_HEIGHT - 10;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const render = () => {
      tickRef.current += 1;
      const tick = tickRef.current;

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 1. Fundo do Céu Noturno / Urbano
      const skyGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      if (modoNoite) {
        skyGradient.addColorStop(0, '#040711');
        skyGradient.addColorStop(0.5, '#0B1120');
        skyGradient.addColorStop(1, '#0F172A');
      } else {
        skyGradient.addColorStop(0, '#1E293B');
        skyGradient.addColorStop(1, '#334155');
      }
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Estrelas piscando
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      for (let i = 0; i < 40; i++) {
        const sx = (i * 73 + 19) % CANVAS_WIDTH;
        const sy = (i * 47 + 11) % (CANVAS_HEIGHT - 220);
        const twinkle = Math.sin((tick + i * 20) * 0.05) > 0.5 ? 1.5 : 0.8;
        ctx.fillRect(sx, sy, twinkle, twinkle);
      }

      // Skyline de Edifícios Vizinhos
      ctx.fillStyle = '#080d1a';
      ctx.fillRect(15, 340, 80, 420);
      ctx.fillRect(40, 280, 60, 480);
      ctx.fillRect(810, 310, 80, 450);
      ctx.fillRect(850, 250, 60, 500);

      // Janelas distantes
      ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
      for (let j = 0; j < 6; j++) {
        ctx.fillRect(25, 360 + j * 30, 8, 12);
        ctx.fillRect(825, 330 + j * 35, 8, 12);
      }

      // 2. Estrutura Externa do Edifício Central
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(BUILDING_X - 10, ROOF_HEIGHT - 10, BUILDING_WIDTH + 20, 650);

      // Pilares de concreto externos
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(BUILDING_X, ROOF_HEIGHT, BUILDING_WIDTH, 640);

      // Telhado / Cobertura com Heliponto e Antena de Dados
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(BUILDING_X + 40, ROOF_HEIGHT - 35, BUILDING_WIDTH - 80, 35);

      // Antena Parabólica / Ticker Link
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(BUILDING_X + 90, ROOF_HEIGHT - 35);
      ctx.lineTo(BUILDING_X + 90, ROOF_HEIGHT - 70);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(BUILDING_X + 90, ROOF_HEIGHT - 70, 14, Math.PI * 1.2, Math.PI * 1.9);
      ctx.stroke();

      const redBlink = Math.sin(tick * 0.08) > 0;
      ctx.fillStyle = redBlink ? '#ef4444' : '#7f1d1d';
      ctx.beginPath();
      ctx.arc(BUILDING_X + 90, ROOF_HEIGHT - 72, 3, 0, Math.PI * 2);
      ctx.fill();

      // Letreiro do Heliponto
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HOLDING CORPORATIVA BUY & HOLD — SEDE CENTRAL', BUILDING_X + (BUILDING_WIDTH - 60) / 2, ROOF_HEIGHT - 15);

      // 3. Renderização Andar por Andar (5, 4, 3, 2, 1)
      const andaresConfig = [
        { andar: 5, y: getFloorY(5), h: getFloorHeight(5), cor: '#F59E0B', nome: '5º ANDAR: MESA DA DIRETORIA & CFO' },
        { andar: 4, y: getFloorY(4), h: getFloorHeight(4), cor: '#10B981', nome: '4º ANDAR: AUDITORIA & BAZIN' },
        { andar: 3, y: getFloorY(3), h: getFloorHeight(3), cor: '#3B82F6', nome: '3º ANDAR: SOLVÊNCIA & CRÉDITO' },
        { andar: 2, y: getFloorY(2), h: getFloorHeight(2), cor: '#EC4899', nome: '2º ANDAR: RADAR EXÓGENO CVM' },
        { andar: 1, y: getFloorY(1), h: getFloorHeight(1), cor: '#06B6D4', nome: 'SUBSOLO: DATA ENGINE & BTC 24/7' },
      ];

      // Largura da área de escritórios (excluindo o poço do elevador)
      const officeWidth = BUILDING_WIDTH - ELEVATOR_WIDTH - 35;

      andaresConfig.forEach((config) => {
        const isHover = andarHover === config.andar;
        const isSelected = andarAtivo === config.andar;
        const x = BUILDING_X + 15;
        const y = config.y;
        const w = officeWidth;
        const h = config.h;

        ctx.save();

        // Caixa do Andar
        ctx.fillStyle = isSelected
          ? 'rgba(30, 41, 59, 0.95)'
          : isHover
          ? 'rgba(24, 33, 47, 0.92)'
          : 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(x, y, w, h);

        // Piso e Teto
        ctx.fillStyle = '#334155';
        ctx.fillRect(x, y, w, 4);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x, y + h - 6, w, 6);

        // Destaque de seleção
        if (isSelected) {
          ctx.strokeStyle = config.cor;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);

          ctx.shadowColor = config.cor;
          ctx.shadowBlur = 10;
          ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
          ctx.shadowBlur = 0;
        } else if (isHover) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x, y, w, h);
        }

        // Cenografia do Andar
        if (config.andar === 5) {
          // 5º ANDAR: Mesa Executiva de Mogno
          ctx.fillStyle = '#78350f';
          ctx.fillRect(x + 240, y + h - 34, 110, 28);
          ctx.fillStyle = '#92400e';
          ctx.fillRect(x + 235, y + h - 37, 120, 5);

          // Cadeira presidencial
          ctx.fillStyle = '#18181b';
          ctx.fillRect(x + 285, y + h - 62, 28, 26);
          ctx.fillRect(x + 293, y + h - 72, 12, 12);

          // Laptop aberto brilhando
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(x + 260, y + h - 52, 16, 9);

          // Mesa de reunião à esquerda
          ctx.fillStyle = '#451a03';
          ctx.fillRect(x + 40, y + h - 28, 120, 20);
          ctx.fillStyle = '#3f3f46';
          ctx.fillRect(x + 50, y + h - 42, 16, 14);
          ctx.fillRect(x + 90, y + h - 42, 16, 14);
          ctx.fillRect(x + 130, y + h - 42, 16, 14);

          // Quadro executivo com gráfico
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + 410, y + 16, 85, 46);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 420, y + 48);
          ctx.lineTo(x + 440, y + 40);
          ctx.lineTo(x + 460, y + 44);
          ctx.lineTo(x + 485, y + 26);
          ctx.stroke();

        } else if (config.andar === 4) {
          // 4º ANDAR: Estações de Trabalho dos Auditores
          for (let k = 0; k < 3; k++) {
            const posX = x + 40 + k * 160;
            ctx.fillStyle = '#475569';
            ctx.fillRect(posX, y + h - 28, 75, 20);

            // Monitores com planilhas Bazin verdes
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(posX + 8, y + h - 50, 26, 18);
            ctx.fillStyle = '#10b981';
            ctx.fillRect(posX + 10, y + h - 48, 22, 14);
          }

          // Arquivos com pastas CVM
          ctx.fillStyle = '#64748b';
          ctx.fillRect(x + 465, y + 16, 42, h - 24);

        } else if (config.andar === 3) {
          // 3º ANDAR: Painel de Risco (DL/EBITDA)
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x + 200, y + 14, 130, 46);
          ctx.strokeStyle = '#3b82f6';
          ctx.strokeRect(x + 200, y + 14, 130, 46);

          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(x + 235, y + 37, 12, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(x + 295, y + 37, 12, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#475569';
          ctx.fillRect(x + 40, y + h - 26, 100, 18);
          ctx.fillRect(x + 380, y + h - 26, 100, 18);

        } else if (config.andar === 2) {
          // 2º ANDAR: Parede de Monitores de Notícias CVM
          for (let m = 0; m < 4; m++) {
            const mx = x + 50 + m * 95;
            ctx.fillStyle = '#020617';
            ctx.fillRect(mx, y + 16, 68, 40);
            ctx.strokeStyle = '#334155';
            ctx.strokeRect(mx, y + 16, 68, 40);

            ctx.fillStyle = m % 2 === 0 ? '#1e1b4b' : '#311026';
            ctx.fillRect(mx + 2, y + 18, 64, 36);

            ctx.fillStyle = '#f43f5e';
            ctx.fillRect(mx + 6, y + 32, 36, 2);
          }

          const beacon = Math.sin(tick * 0.1) > 0.8;
          ctx.fillStyle = beacon ? '#ef4444' : '#7f1d1d';
          ctx.fillRect(x + 250, y + 4, 12, 8);

        } else if (config.andar === 1) {
          // SUBSOLO: Servidores e Sentinela BTC
          for (let r = 0; r < 6; r++) {
            const rx = x + 30 + r * 70;
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(rx, y + 16, 50, h - 28);
            ctx.strokeStyle = '#334155';
            ctx.strokeRect(rx, y + 16, 50, h - 28);

            for (let s = 0; s < 5; s++) {
              const sy = y + 20 + s * 16;
              const ledActive = (tick + r * 5 + s * 3) % 4 === 0;
              ctx.fillStyle = ledActive ? '#06b6d4' : '#10b981';
              ctx.fillRect(rx + 8, sy + 4, 3, 3);
            }
          }

          // Monitor Bitcoin 24/7
          ctx.fillStyle = '#020617';
          ctx.fillRect(x + w - 125, y + 18, 100, 60);
          ctx.strokeStyle = '#f59e0b';
          ctx.strokeRect(x + w - 125, y + 18, 100, 60);
          ctx.fillStyle = '#f59e0b';
          ctx.font = 'bold 18px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('₿ 24/7', x + w - 75, y + 50);
        }

        // Faixa de identificação lateral do andar
        ctx.fillStyle = config.cor;
        ctx.fillRect(x, y + 4, 6, h - 10);

        ctx.fillStyle = isSelected ? '#ffffff' : '#cbd5e1';
        ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(config.nome, x + 16, y + 17);

        ctx.restore();
      });

      // ====================================================================
      // 4. EIXO DO ELEVADOR CORPORATIVO (LATERAL DIREITA)
      // ====================================================================
      const shaftY = ROOF_HEIGHT;
      const shaftHeight = 630;
      ctx.fillStyle = '#090d16';
      ctx.fillRect(ELEVATOR_X, shaftY, ELEVATOR_WIDTH, shaftHeight);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ELEVATOR_X, shaftY, ELEVATOR_WIDTH, shaftHeight);

      // Cabos de aço do elevador
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ELEVATOR_X + 16, shaftY);
      ctx.lineTo(ELEVATOR_X + 16, shaftY + shaftHeight);
      ctx.moveTo(ELEVATOR_X + 32, shaftY);
      ctx.lineTo(ELEVATOR_X + 32, shaftY + shaftHeight);
      ctx.stroke();

      // Animação suave da cabine do elevador até o andar ativo
      const targetElevatorY = getFloorY(andarAtivo) + 12;
      elevatorYRef.current += (targetElevatorY - elevatorYRef.current) * 0.12;
      const currentElevatorY = elevatorYRef.current;
      const cabinHeight = 78;

      // Cabine envidraçada do elevador
      ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
      ctx.fillRect(ELEVATOR_X + 3, currentElevatorY, ELEVATOR_WIDTH - 6, cabinHeight);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect(ELEVATOR_X + 3, currentElevatorY, ELEVATOR_WIDTH - 6, cabinHeight);

      // Vidro iluminado da cabine
      ctx.fillStyle = 'rgba(254, 240, 138, 0.25)';
      ctx.fillRect(ELEVATOR_X + 7, currentElevatorY + 8, ELEVATOR_WIDTH - 14, cabinHeight - 16);

      // Indicador digital do andar no topo da cabine
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${andarAtivo}º`, ELEVATOR_X + ELEVATOR_WIDTH / 2, currentElevatorY + 22);

      // Seta indicadora de direção do elevador
      const movingDiff = targetElevatorY - currentElevatorY;
      if (Math.abs(movingDiff) > 1) {
        ctx.fillStyle = '#10b981';
        ctx.font = '9px monospace';
        ctx.fillText(movingDiff > 0 ? '▼' : '▲', ELEVATOR_X + ELEVATOR_WIDTH / 2, currentElevatorY + 34);
      }

      // ====================================================================
      // 5. ATUALIZAÇÃO E DESENHO DOS FUNCIONÁRIOS ANDANDO COM NOMES
      // ====================================================================
      const employees = employeesRef.current;

      employees.forEach((emp) => {
        // Lógica de movimentação autônoma de cada pessoa
        if (emp.isWalking) {
          emp.x += emp.speed * emp.direction;

          // Se atingiu o limite de caminhada, pausar e virar
          if (emp.x >= emp.maxX) {
            emp.x = emp.maxX;
            emp.direction = -1;
            if (Math.random() > 0.4) {
              emp.isWalking = false;
              emp.pauseTimer = Math.floor(40 + Math.random() * 60);
            }
          } else if (emp.x <= emp.minX) {
            emp.x = emp.minX;
            emp.direction = 1;
            if (Math.random() > 0.4) {
              emp.isWalking = false;
              emp.pauseTimer = Math.floor(40 + Math.random() * 60);
            }
          }
        } else {
          emp.pauseTimer -= 1;
          if (emp.pauseTimer <= 0) {
            emp.isWalking = true;
          }
        }

        // Posição Y da pessoa no chão do andar correspondente
        const floorBaseY = getFloorY(emp.floor) + getFloorHeight(emp.floor) - 8;
        const charY = floorBaseY - 26;
        const charX = emp.x;

        // Animação de pernas andando (passos alternados)
        const walkCycle = emp.isWalking ? Math.sin(tick * 0.22) * 4 : 0;
        const bobbing = emp.isWalking ? Math.abs(Math.sin(tick * 0.22)) * 1.5 : 0;

        ctx.save();

        // 1. Cabeça
        ctx.fillStyle = '#fed7aa'; // Tom de pele
        ctx.fillRect(charX + 2, charY - bobbing, 9, 8);

        // Cabelo
        ctx.fillStyle = emp.hairColor;
        ctx.fillRect(charX + 1, charY - bobbing - 2, 11, 4);

        // 2. Tronco / Camisa / Terno
        ctx.fillStyle = emp.shirtColor;
        ctx.fillRect(charX, charY + 8 - bobbing, 13, 11);

        // Gravata executiva no CFO
        if (emp.id === 'cfo-roberto') {
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(charX + 5, charY + 9 - bobbing, 3, 7);
        }

        // 3. Pernas / Calças
        ctx.fillStyle = emp.pantsColor;
        // Perna esquerda
        ctx.fillRect(charX + 1, charY + 19 - bobbing, 4, 8 + walkCycle);
        // Perna direita
        ctx.fillRect(charX + 8, charY + 19 - bobbing, 4, 8 - walkCycle);

        // 4. Item carregado (pasta, prancheta, café, tablet)
        if (emp.carryingItem === 'pasta') {
          ctx.fillStyle = '#78350f';
          ctx.fillRect(emp.direction === 1 ? charX + 11 : charX - 3, charY + 13 - bobbing, 5, 5);
        } else if (emp.carryingItem === 'cafe') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(emp.direction === 1 ? charX + 11 : charX - 3, charY + 10 - bobbing, 4, 4);
        } else if (emp.carryingItem === 'prancheta' || emp.carryingItem === 'tablet') {
          ctx.fillStyle = emp.carryingItem === 'tablet' ? '#06b6d4' : '#cbd5e1';
          ctx.fillRect(emp.direction === 1 ? charX + 10 : charX - 3, charY + 11 - bobbing, 5, 6);
        }

        // ====================================================================
        // Crachá Flutuante com Nome da Pessoa (Sempre visível no andar ativo ou sob hover)
        // ====================================================================
        const isCurrentFloor = andarAtivo === emp.floor;
        const isHovered = employeeHovered?.id === emp.id;

        if (isCurrentFloor || isHovered) {
          ctx.font = '600 9px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';

          // Caixa de fundo do nome
          const textWidth = ctx.measureText(emp.name).width;
          ctx.fillStyle = isHovered ? 'rgba(245, 158, 11, 0.95)' : 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(charX + 6 - textWidth / 2 - 4, charY - 17 - bobbing, textWidth + 8, 13);
          ctx.strokeStyle = isHovered ? '#ffffff' : '#475569';
          ctx.lineWidth = 1;
          ctx.strokeRect(charX + 6 - textWidth / 2 - 4, charY - 17 - bobbing, textWidth + 8, 13);

          ctx.fillStyle = isHovered ? '#090d16' : '#f8fafc';
          ctx.fillText(emp.name, charX + 6, charY - 7 - bobbing);
        }

        ctx.restore();
      });

      // 6. Calçada e Rua da Sede
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, CANVAS_HEIGHT - 30, CANVAS_WIDTH, 30);
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, CANVAS_HEIGHT - 32, CANVAS_WIDTH, 2);

      ctx.fillStyle = '#475569';
      for (let f = 0; f < 12; f++) {
        ctx.fillRect(360 + f * 18, CANVAS_HEIGHT - 22, 10, 14);
      }

      if (isRunning) {
        frameRef.current = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      isRunning = false;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [andarAtivo, andarHover, modoNoite, employeeHovered]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const clientX = (e.clientX - rect.left) * scaleX;
    const clientY = (e.clientY - rect.top) * scaleY;

    // Detectar hover em funcionários
    let foundEmp: Employee | null = null;
    employeesRef.current.forEach((emp) => {
      const floorBaseY = getFloorY(emp.floor) + getFloorHeight(emp.floor) - 8;
      const charY = floorBaseY - 26;
      if (
        clientX >= emp.x - 10 &&
        clientX <= emp.x + 24 &&
        clientY >= charY - 15 &&
        clientY <= charY + 30
      ) {
        foundEmp = emp;
      }
    });
    setEmployeeHovered(foundEmp);

    // Detectar em qual andar o mouse está
    const andaresConfig = [
      { andar: 5, y1: getFloorY(5), y2: getFloorY(5) + getFloorHeight(5) },
      { andar: 4, y1: getFloorY(4), y2: getFloorY(4) + getFloorHeight(4) },
      { andar: 3, y1: getFloorY(3), y2: getFloorY(3) + getFloorHeight(3) },
      { andar: 2, y1: getFloorY(2), y2: getFloorY(2) + getFloorHeight(2) },
      { andar: 1, y1: getFloorY(1), y2: getFloorY(1) + getFloorHeight(1) },
    ];

    const match = andaresConfig.find((a) => clientY >= a.y1 && clientY <= a.y2);
    setAndarHover(match ? match.andar : null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleY = CANVAS_HEIGHT / rect.height;
    const clientY = (e.clientY - rect.top) * scaleY;

    const andaresConfig = [
      { andar: 5, y1: getFloorY(5), y2: getFloorY(5) + getFloorHeight(5) },
      { andar: 4, y1: getFloorY(4), y2: getFloorY(4) + getFloorHeight(4) },
      { andar: 3, y1: getFloorY(3), y2: getFloorY(3) + getFloorHeight(3) },
      { andar: 2, y1: getFloorY(2), y2: getFloorY(2) + getFloorHeight(2) },
      { andar: 1, y1: getFloorY(1), y2: getFloorY(1) + getFloorHeight(1) },
    ];

    const match = andaresConfig.find((a) => clientY >= a.y1 && clientY <= a.y2);
    if (match) {
      onSelecionarAndar(match.andar);
    }
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl">
      {/* Barra de Status do Edifício Corporativo */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-3 text-slate-300">
          <span className="font-semibold text-slate-100 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            EDIFÍCIO CORPORATIVO EM ATIVIDADE
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">
            Funcionários em trânsito e elevador ativo no {andarAtivo}º Andar
          </span>
        </div>

        <div className="flex items-center gap-2">
          {ANDARES_PREDIO.map((a) => (
            <button
              key={a.numero}
              onClick={() => onSelecionarAndar(a.numero)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                andarAtivo === a.numero
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {a.numero}º Andar
            </button>
          ))}
        </div>
      </div>

      {/* Canvas Interativo 2D com Funcionários Andando e Elevador */}
      <div className="relative aspect-[920/750] w-full flex items-center justify-center bg-slate-950">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { setAndarHover(null); setEmployeeHovered(null); }}
          onClick={handleClick}
          className="w-full h-full object-contain cursor-pointer pixelated"
        />

        {/* Tooltip Dinâmico do Funcionário em Foco */}
        {employeeHovered && (
          <div className="absolute bottom-10 left-6 pointer-events-none bg-slate-900/95 border border-amber-500/50 p-2.5 rounded-lg shadow-xl text-xs z-20 backdrop-blur-sm max-w-xs animate-in fade-in slide-in-from-bottom-2">
            <div className="font-bold text-amber-400 flex items-center gap-1.5">
              <span>👤 {employeeHovered.name}</span>
            </div>
            <div className="text-slate-300 text-[11px] font-medium mt-0.5">
              {employeeHovered.role} ({employeeHovered.floor}º Andar)
            </div>
            <div className="text-slate-400 text-[10px] mt-1 font-mono">
              Atividade atual: {employeeHovered.activity}
            </div>
          </div>
        )}
      </div>

      {/* Roda-pé com Equipe Operacional Ativa */}
      <div className="px-4 py-2 bg-slate-900/90 border-t border-slate-800/80 text-[11px] flex flex-wrap items-center justify-between text-slate-400 gap-2 font-mono">
        <div className="flex items-center gap-2">
          <span className="text-slate-300 font-bold">Equipe em Atividade:</span>
          <span>Dr. Roberto Albuquerque (CFO)</span>
          <span>·</span>
          <span>Helena (Gabinete)</span>
          <span>·</span>
          <span>Lucas & Mariana (Auditoria Bazin)</span>
          <span>·</span>
          <span>Cadu & Camila (Solvência)</span>
          <span>·</span>
          <span>Thiago & Beatriz (CVM)</span>
          <span>·</span>
          <span>Gabriel & Sofia (Data / BTC)</span>
        </div>
        <span className="text-amber-400">Elevador no {andarAtivo}º Andar</span>
      </div>
    </div>
  );
};
