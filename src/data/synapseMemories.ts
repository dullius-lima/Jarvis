import { SynapseMemory } from '../types/neural';

export const INITIAL_SYNAPSE_MEMORIES: SynapseMemory[] = [
  // 1. Arquivos Menores: Informações Humanas Cotidianas (Pessoas, Compras, Agendamentos, Saúde)
  {
    id: 'mem-compras',
    title: 'Lista de Compras & Mercado',
    content: 'Itens pendentes da despensa da residência: Café em grãos especial, azeite extra virgem, frutas da estação, pão artesanal e suprimentos essenciais da semana.',
    category: 'rotina',
    user: 'Cônjuge / Família',
    timestamp: '14/10/2026 11:15',
    importance: 'alta',
    coords: [-1.2, 0.4, 0.9], // Lobo Temporal / Frontal Inferior
    color: 0x10b981, // Verde Esmeralda
    firing: false,
    connectionsCount: 6,
    particaoId: 'ROTINAS_CASA',
  },
  {
    id: 'mem-agenda',
    title: 'Agendamentos & Calendário Familiar',
    content: 'Compromissos sincronizados: Consulta pediátrica na quinta às 10:00, Reunião de Alocação de Capital na sexta às 14:00, Natação infantil terças e quintas às 16:00.',
    category: 'rotina',
    user: 'Matheus Dullius',
    timestamp: '14/10/2026 08:30',
    importance: 'alta',
    coords: [1.1, 0.8, 0.7], // Lobo Frontal Direito
    color: 0xf59e0b, // Âmbar Ouro
    firing: false,
    connectionsCount: 8,
    particaoId: 'ROTINAS_CASA',
  },
  {
    id: 'mem-matheus',
    title: 'Perfil Pessoal: Matheus Dullius',
    content: 'Líder da Holding Investimentos Dullius. Perfil CFO analítico, buy-and-hold perene, alocação Bazin e Graham com margem de segurança rigorosa.',
    category: 'investimento',
    user: 'Matheus Dullius',
    timestamp: '14/10/2026 09:00',
    importance: 'critica',
    coords: [0.0, 1.4, 1.1], // Lobo Frontal Superior / Polo Executivo
    color: 0x06b6d4, // Ciano
    firing: false,
    connectionsCount: 10,
    particaoId: 'GERAL',
  },
  {
    id: 'mem-esposa',
    title: 'Perfil Pessoal: Cônjuge / Família',
    content: 'Coordenação e gestão central do bem-estar familiar, rotinas da residência, calendário escolar, saúde preventiva e harmonia do lar.',
    category: 'familia',
    user: 'Cônjuge / Família',
    timestamp: '13/10/2026 19:20',
    importance: 'alta',
    coords: [1.3, -0.2, 0.6], // Lobo Parieto-Temporal
    color: 0xec4899, // Magenta Suave
    firing: false,
    connectionsCount: 7,
    particaoId: 'ROTINAS_CASA',
  },
  {
    id: 'mem-filhos',
    title: 'Perfil Pessoal: Filhos & Dependentes',
    content: 'Rotina escolar e de desenvolvimento infantil: natação, deveres de casa, controle de tempo de tela e horários de descanso supervisionados.',
    category: 'familia',
    user: 'Filhos & Dependentes',
    timestamp: '12/10/2026 14:45',
    importance: 'media',
    coords: [-1.3, -0.3, 0.4],
    color: 0x8b5cf6, // Violeta
    firing: false,
    connectionsCount: 6,
    particaoId: 'ROTINAS_CASA',
  },
  {
    id: 'mem-saude',
    title: 'Prontuário & Saúde da Família',
    content: 'Check-ups anuais, exames de sangue preventivos, calendário de vacinação infantil atualizado e histórico pediátrico monitorado pelo Jarvis.',
    category: 'saude',
    user: 'Cônjuge / Família',
    timestamp: '11/10/2026 16:10',
    importance: 'alta',
    coords: [0.9, -0.6, -0.8], // Lobo Occipital / Temporal
    color: 0x14b8a6, // Teal
    firing: false,
    connectionsCount: 5,
    particaoId: 'SAUDE_FAMILIA',
  },

  // 2. Silos Particionados de Ativos e Mercados (Bancos Menores Isolados)
  {
    id: 'mem-taee11',
    title: 'Silo Isolado: Taesa (TAEE11)',
    content: 'Preço-Teto Décio Bazin calculado em R$ 38.83 com média de proventos decenal. Concessões perenes e Dívida Líquida/EBITDA de 3.1x.',
    category: 'investimento',
    user: 'Matheus Dullius',
    timestamp: '14/10/2026 10:15',
    importance: 'critica',
    coords: [-0.6, 1.2, 0.8], // Córtex Pré-Frontal Esquerdo
    color: 0x0ea5e9, // Azul Elétrico
    firing: false,
    connectionsCount: 9,
    particaoId: 'TAEE11',
  },
  {
    id: 'mem-bbas3',
    title: 'Silo Isolado: Banco do Brasil (BBAS3)',
    content: 'P/L atual ~4.2x, P/VP 0.8x e histórico robusto de proventos. Margem de segurança de Bazin em +15.8% com carteira de crédito agro protegida.',
    category: 'cfo',
    user: 'Matheus Dullius',
    timestamp: '14/10/2026 10:45',
    importance: 'alta',
    coords: [0.6, 1.1, 0.9],
    color: 0x0284c7,
    firing: false,
    connectionsCount: 7,
    particaoId: 'BBAS3',
  },
  {
    id: 'mem-btc',
    title: 'Silo Isolado: Bitcoin (BTC)',
    content: 'Sentinela Cripto 24/7 em regime de silêncio absoluto. Monitora quebras de suporte estrutural e taxas globais de hash rate.',
    category: 'seguranca',
    user: 'Matheus Dullius',
    timestamp: '14/10/2026 12:00',
    importance: 'alta',
    coords: [0.0, -0.8, -1.3], // Cerebelo Posterior
    color: 0xf59e0b,
    firing: false,
    connectionsCount: 5,
    particaoId: 'BTC',
  },
  {
    id: 'mem-seguranca',
    title: 'Segurança Residencial & Portão Autônomo',
    content: 'Protocolo de fechamento de acessos às 22:30. Câmeras com detecção perimetral e status de portas em regime silencioso da residência.',
    category: 'seguranca',
    user: 'Matheus Dullius',
    timestamp: '13/10/2026 22:30',
    importance: 'alta',
    coords: [0.0, 1.7, -0.3], // Lobo Parietal Superior
    color: 0x6366f1, // Índigo
    firing: false,
    connectionsCount: 8,
    particaoId: 'ROTINAS_CASA',
  },
];
