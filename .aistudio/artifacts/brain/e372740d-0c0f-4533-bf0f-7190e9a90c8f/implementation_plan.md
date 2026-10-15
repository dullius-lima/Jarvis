# Painel de Histórico de Decisões Autônomas do CFO por IA

Implementação de um sistema de auditoria executiva e linha do tempo interativa que registra, cataloga e exibe todas as ações tomadas de forma autônoma pelo CFO por IA (criação e exclusão de agentes especialistas e nós de memória neural), com data, hora, justificativa da lógica financeira aplicada e destaque visual do impacto no cérebro 3D.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> As preferências para o novo painel de histórico de decisões foram definidas nas perguntas de alinhamento:
> - **Localização e Navegação**: Aba dedicada e botão de acesso rápido direto no HUD superior do sistema.
> - **Recursos de Auditoria e Controle**: Linha do tempo interativa com destaque direto de impacto no cérebro 3D ao inspecionar ou clicar em qualquer decisão autônoma.

- **Decisão Confirmada 1 (Localização)**: Botão de acesso rápido com ícone de balanço/auditoria (`History` / `Scale` / `FileClock`) na barra superior (Top Bar), além de opção dedicada no menu expansível do Painel do Sistema e como aba no modal de agentes.
- **Decisão Confirmada 2 (Experiência Interativa)**: Linha do tempo cronológica com filtros por tipo de ação (Criação de Agente, Exclusão de Agente, Criação de Memória, Purga de Memória, Deliberação de Alocação), acompanhada de badge de justificativa lógica da LLM e disparo de foco sináptico no cérebro 3D ao selecionar um evento.

---

### 1. Overview & Core Concept

- **O que faz**: Oferece rastreabilidade e governança total sobre as deliberações autônomas tomadas pela IA executiva (CFO Matheus Dullius / Jarvis). Toda vez que a LLM cria um agente, remove um agente obsoleto, insere uma memória sintética no cérebro ou purga memórias irrelevantes, o evento é gravado com carimbo de tempo rigoroso, contexto do ativo/mercado e justificativa da lógica aplicada.
- **Público-Alvo**: O investidor e gestores da holding Investimentos Dullius, permitindo inspecionar por que cada decisão estrutural foi tomada pela IA no horizonte de 10 anos.
- **Valor Principal**: Governança algorítmica, transparência de raciocínio da IA, prevenção de "caixa preta" e auditoria em tempo real com conexão física às sinapses do cérebro neural 3D.

---

### 2. User Experience & Visual Design

#### Fluxos Principais do Usuário
1. **Acesso Imediato**: O usuário clica no novo botão de acesso rápido `"Histórico do CFO"` no topo da interface (ou acessa pelo menu de sistema / abas de agentes).
2. **Visualização da Linha do Tempo**: O modal executivo exibe uma linha do tempo vertical organizada cronologicamente (com data, hora e indicadores de status semânticos).
3. **Filtros Ágeis**: Segmentação rápida por tipo de ação:
   - *Todos os Eventos*
   - *Agentes Criados*
   - *Agentes Excluídos*
   - *Memórias Armazenadas*
   - *Memórias Purgadas*
4. **Inspeção de Justificativa Lógica**: Ao clicar em qualquer registro do histórico:
   - Expande os detalhes técnicos: quem disparou (LLM Autônoma / CFO), ativo relacionado (ex: WEGE3, BTC, NTN-B 2035), parâmetros quantitativos avaliados e a transcrição da justificativa lógica.
   - Dispara imediatamente um pulso sináptico focado no nó de dados correspondente no cérebro 3D, destacando visualmente onde essa decisão reside na arquitetura neural.
5. **Auditoria e Reversão Opcional**: Visualização clara de quais agentes ou memórias ainda estão ativos no sistema a partir de cada decisão.

#### Identidade Visual & Tema
- **Diretriz Estética**: Consola financeira executiva de alta densidade e estética dark slate (`#020612` e `#0b1120`), com linhas de demarcação sutis (`border-slate-800` / `border-amber-500/30`), tipografia monoespaçada tabular para carimbos de data/hora (`font-mono tabular-nums`).
- **Paleta Semântica**:
   - Criação de Agente / Memória: Destaque ciano/esmeralda (`#06b6d4` / `#10b981`), indicando expansão de capacidade cognitiva.
   - Exclusão / Purga: Destaque âmbar/carmesim (`#f59e0b` / `#ef4444`), indicando poda cirúrgica de nós obsoletos.
   - Deliberação de Valuation (10 Anos): Destaque dourado/âmbar (`#eab308`).
- **Zero-Pill & Tipografia**: Respeito estrito à constituição de design: sem pills decorativos estáticos; datas e categorias exibidas como texto limpo unboxed com separadores sutis (`·`); controles de filtro com botões segmentados com estado ativo refinado.

---

### 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Arquitetura de Persistência do Histórico do CFO**
  - *Abordagem Escolhida*: Serviço singleton centralizado `CfoDecisionService` sincronizado com `localStorage` e enriquecido automaticamente no backend (`server.ts` e `App.tsx`).
  - *Por quê*: Garante que o histórico persista entre recargas de página, funcione offline e registre imediatamente tanto decisões geradas por comandos de voz/texto do Jarvis quanto auditorias delegadas e validações decenais de código.
  - *Alternativa Considerada*: Manter apenas em memória volátil (descartada porque o usuário precisa de rastreabilidade contínua das ações do CFO).

- **Decisão 2: Interação Bidirecional com o Cérebro 3D**
  - *Abordagem Escolhida*: Ao passar o cursor ou clicar em um evento da linha do tempo, a aplicação invoca `dispararSinapsePontual` mirando no nó específico daquele ativo ou memória no Three.js.
  - *Por quê*: Cumpre a preferência do usuário de conectar o histórico ao cérebro visual, transformando um log estático em uma experiência espacial imersiva.

- **Decisão 3: Registro Estruturado com Justificativa Obrigatória**
  - *Abordagem Escolhida*: Cada registro contém `id`, `timestamp`, `tipoAcao` (`CRIACAO_AGENTE`, `EXCLUSAO_AGENTE`, `CRIACAO_MEMORIA`, `EXCLUSAO_MEMORIA`, `DELIBERACAO_VALUATION`), `alvo` (nome do agente, ticker ou título da memória), `justificativaLogica` (raciocínio dedutivo da LLM), `autor` e `impactoNeural`.
  - *Por quê*: Responde cirurgicamente ao pedido do usuário de listar a data, a hora e a justificativa da lógica aplicada.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

#### Diagrama de Arquitetura e Componentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             HUD / Top Bar                                   │
│  [JARVIS Wordmark]  ·  [Atalho: Histórico CFO]  ·  [Painel do Sistema]      │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │ Abre Modal / Seleciona Aba
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CfoDecisionHistoryModal.tsx                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Filtros: [Todos] [Criações] [Exclusões] [Memórias] [Valuation 10 Anos]│  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Linha do Tempo Cronológica (Data, Hora, Ticker, Tipo, Lógica da LLM)  │  │
│  │  ├─ [15/10/2026 05:14] CRIACAO_AGENTE: Sentinela WEGE3               │  │
│  │  │  └─ Lógica: "P/L e ROIC decenal estáveis; tese de capex sustentada"│  │
│  │  ├─ [15/10/2026 05:12] EXCLUSAO_MEMORIA: Cotação 2021 Obsoleta       │  │
│  │  │  └─ Lógica: "Dados ultrapassados substituídos por série de 10 anos" │  │
│  └──────────────────────────────────┬────────────────────────────────────┘  │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │ Seleção de Registro
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RealisticBrainCanvas (Three.js)                      │
│        Disparo Cirúrgico de Fluxo Molecular de Sinapse no Nó Alvo           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ Grava Eventos Autônomos
┌─────────────────────────────────────┴───────────────────────────────────────┐
│               CfoDecisionService / aplicarAcoesAutonomasDaLLM                │
│  - server.ts: /api/cfo/deliberar, /api/agent/validate-code, /api/agent/chat │
│  - App.tsx: interceptação de comandos e exclusões autônomas                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Modelo de Dados da Decisão Autônoma
```typescript
export type TipoAcaoCFO = 
  | 'CRIACAO_AGENTE'
  | 'EXCLUSAO_AGENTE'
  | 'CRIACAO_MEMORIA'
  | 'EXCLUSAO_MEMORIA'
  | 'DELIBERACAO_VALUATION'
  | 'AUDITORIA_SILO';

export interface DecisaoAutonomaCFO {
  id: string;
  timestamp: string; // Ex: '15/10/2026 05:14:22'
  dataIso: string;
  tipoAcao: TipoAcaoCFO;
  tituloAlvo: string; // Nome do agente, ticker ou título da memória
  categoriaAlvo?: string; // 'ativo_b3', 'cripto', 'tesouro', etc.
  justificativaLogica: string; // O porquê da decisão aplicada pela IA
  metricasAvaliadas?: Record<string, string | number>;
  veredito?: 'COMPRAR' | 'AGUARDAR' | 'QUARENTENA' | 'ESTAVEL' | 'PURGADO' | 'REGISTRADO';
  autor: string; // 'CFO Autônomo (Gemini 3.8)', 'Jarvis Cognição'
  nodeIdSinapse?: string; // Nó no cérebro 3D para animação
}
```

#### Mapeamento de Componentes e Handlers
- `src/services/cfoDecisionService.ts`: Serviço que gerencia a lista de decisões, pré-populado com decisões do histórico do CFO e atualizado em tempo real sempre que `aplicarAcoesAutonomasDaLLM`, `/api/cfo/deliberar` ou o estúdio de 10 anos operam.
- `src/components/CfoDecisionHistoryModal.tsx`: Modal executivo com linha do tempo responsiva, busca textual, filtros de ação e botão interativo para disparar sinapse no cérebro.
- `src/App.tsx`:
  - Botão de acesso rápido no header superior com contador de decisões autônomas.
  - Opção no menu expansível do sistema.
  - Integração no método `aplicarAcoesAutonomasDaLLM` para registrar automaticamente cada criação e exclusão com a justificativa real fornecida pela LLM.
