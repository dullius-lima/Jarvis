# Escritório de Investimentos Buy & Hold — Arquitetura Corporativa de 5 Andares

Plataforma corporativa de monitoramento e alocação de carteira de investimentos (Ações B3, Renda Fixa e Bitcoin) fundamentada na filosofia rigorosa de Buy & Hold, com segregação estrita entre cálculo determinístico matemático e julgamento qualitativo executivo por Inteligência Artificial (CFO).

## Decisões Confirmadas & Resumo das Preferências

> [!IMPORTANT]
> **Definições alinhadas com o usuário**:
> - **Ativos de Referência Pré-carregados**: Carteira diversificada pré-populada com histórico de 10 anos de demonstrativos contábeis (DFP/ITR CVM) cobrindo grandes pagadoras de dividendos B3 (TAEE11, BBAS3, EGIE3, WEGE3), Renda Fixa Soberana (Tesouro IPCA+ / NTN-B) e Bitcoin (BTC).
> - **Modo Operacional Híbrido**: Interface interativa viva com execução em tempo real do motor de cálculo e agente CFO via Gemini na aplicação, acompanhada de pacote completo de arquivos de produção (`docker-compose.yml`, backend FastAPI, SQLAlchemy models, financial engine e specs JSON do n8n) prontos para deploy na Oracle Cloud Infrastructure (OCI).
> - **Estilo Visual**: Fachada corporativa interativa em corte transversal estilo pixel art refinado com iluminação dinâmica dos escritórios, estações de trabalho animadas, servidores pulsantes no térreo e canal direto com a Diretoria no 5º andar.

---

## 1. Visão Geral & Conceito Central

- **O que faz**: Oferece uma central de comando corporativa para o investidor institucional e pessoa física focada em acumulação de patrimônio a longo prazo. Divide as tarefas analíticas em 5 andares especializados de um edifício comercial:
  - **5º Andar (Mesa da Diretoria & CFO)**: Gabinete executivo onde a IA atua como CFO, recebendo dossiês estruturados dos andares inferiores para deliberar sobre alocação de capital e emitir vereditos irrevogáveis (`COMPRAR`, `AGUARDAR`, `QUARENTENA`).
  - **4º Andar (Auditoria Fundamentalista & Proventos)**: Análise decenal de balanços e DREs, cálculo determinístico do Preço-Teto de Décio Bazin (médias de 3 e 5 anos a 6% a.a. expurgando não-recorrentes), Margem de Segurança de Graham, CAGR de Proventos e múltiplos de eficiência (ROE, ROIC).
  - **3º Andar (Solvência & Crédito)**: Monitoramento da alavancagem estrutural (Dívida Líquida / EBITDA histórica com trigger de alerta em 3.5x), cobertura de juros (EBIT / Despesas Financeiras) e spread sobre a curva Selic / IPCA.
  - **2º Andar (Radar de Risco Exógeno & Notícias)**: Filtro determinístico de fatos relevantes da CVM e comunicados oficiais, triando ruído transitório de mercado contra risco estrutural de quebra de tese.
  - **Térreo & Subsolo (Data Engine & Sentinela 24/7)**: Ingestão de cotações, taxas do Bacen, arquivos CVM e sentinela algorítmica de Bitcoin monitorando variações anormais (> 5% em 1h) em regime de silêncio absoluto em dias normais.
- **Público-Alvo**: Investidores Buy & Hold disciplinados que buscam blindagem emocional contra o ruído de mercado, automatização de rotinas de auditoria e clareza matemática sobre preços-teto.
- **Diferencial**: **Zero Alucinação Matemática**. A IA não calcula números; ela recebe um JSON auditado e emite pareceres qualitativos de governança e alocação de risco.

---

## 2. Experiência do Usuário & Design Visual

### Jornadas do Usuário
1. **Inspeção do Edifício Corporativo**:
   - O investidor visualiza o prédio em corte transversal animado. Cada andar possui iluminação correspondente, funcionários em atividade, painéis de monitoramento e status operacional.
   - Clicar em qualquer andar abre o painel analítico ou drawer lateral com os dados detalhados daquele setor.
2. **Auditoria Pontual de Ativos**:
   - O usuário seleciona um ativo da carteira (ou cadastra um novo ticker com preenchimento contábil).
   - O motor determinístico processa instantaneamente o histórico decenal e gera o Dossiê Estruturado.
   - O usuário pode convocar a Reunião com o CFO no 5º andar para obter o parecer executivo oficial e tirar dúvidas estratégicas.
3. **Simulação dos Gatilhos de Rotina (n8n)**:
   - Controles operacionais permitem disparar ou simular os 3 workflows n8n:
     - *Rotina Matinal (09:30)*: Varredura de cotações B3 e comparação com Preço-Teto Bazin.
     - *Fechamento Noturno CVM (19:00)*: Triagem de novos balanços ITR/DFP e fatos relevantes.
     - *Sentinela Cripto BTC (24/7)*: Checagem algorítmica de volatilidade extrema e teste de estresse.
4. **Central de Exportação & Infraestrutura OCI**:
   - Aba dedicada para visualização e download dos arquivos de produção para subir na VM Oracle Cloud (`docker-compose.yml`, scripts Python, schemas PostgreSQL e workflows n8n).

### Identidade Visual & Layout
- **Estética**: Edifício corporativo em pixel art refinado e iluminação noturna, combinada com interface moderna de dashboard financeiro institucional.
- **Paleta de Cores**:
  - Fundo Canvas: Azul-petróleo escuro profundo (`#0B1120`, `#0F172A`).
  - Estrutura do Edifício: Ardósia corporativa (`#1E293B`, `#334155`) com vigas metálicas sutis.
  - Luzes dos Escritórios: Âmbar quente executivo (`#F59E0B`), ciano de dados (`#06B6D4`), esmeralda de solvência (`#10B981`) e rubi de alerta de risco (`#EF4444`).
- **Tipografia**:
  - Cabeçalhos e Títulos: Sans-serif geométrica limpa (`Plus Jakarta Sans`).
  - Métricas e Dados Financeiros: Monospaçada com alinhamento numérico estrito (`font-mono tabular-nums`).
- **Contrato Top Bar**:
  - Zona 1: `Holding Investimentos Buy & Hold` (marca em linha única).
  - Zona 2: Links diretos: `Edifício Corporativo`, `Auditoria & Dossiês`, `Carteira & Ativos`, `Rotinas n8n`, `Deploy OCI`.
  - Zona 3: Botão de ação: `Auditar Carteira Completa`.

---

## 3. Decisões de Arquitetura & Engenharia de Dados

### Decisão 1: Segregação Rigorosa Cálculo vs Julgamento
- **Abordagem**: Todas as fórmulas financeiras (Décio Bazin com DPA médio de 3 e 5 anos, Graham $\sqrt{22.5 \times LPA \times VPA}$, Dívida Líquida/EBITDA, Divergência FCO vs Lucro Líquido, Margem Operacional) rodam 100% em código determinístico (FastAPI/Pandas no backend e módulo TypeScript espelhado no frontend para agilidade imediata).
- **Por que**: Modelos de linguagem possuem taxa de erro inaceitável para aritmética financeira fina. A LLM recebe apenas o JSON final consolidado e atua exclusivamente na síntese qualitativa de riscos, coerência da tese e direcionamento de aporte.

### Decisão 2: Adaptação Rigorosa aos Recursos da OCI (1 OCPU, 6 GB RAM)
- **Abordagem**: `docker-compose.yml` com limites declarados de memória:
  - PostgreSQL 16: `mem_limit: 1536m` (`shared_buffers = 384MB`, `work_mem = 16MB`).
  - n8n: `mem_limit: 1024m` (`EXECUTIONS_PROCESS=main`, modo otimizado de fila).
  - FastAPI Engine: `mem_limit: 1800m` (Uvicorn single-worker leve, Pandas com tipos otimizados).
  - Sobra de ~1.6 GB de RAM para buffer de SO e processos de rede.

### Decisão 3: Cadastro Dinâmico 100% Orientado a Dados
- **Abordagem**: As tabelas de `ativos`, `posicao_carteira` e `demonstrativos_anuais` permitem adicionar qualquer ação B3, título de renda fixa ou ativo cripto sem alterar linhas de código. Novas adições herdam automaticamente as rotinas de cálculo decenal e auditoria do CFO.

---

## 4. Arquitetura Técnica & Especificação dos Entregáveis

```
┌────────────────────────────────────────────────────────────────────────┐
│                   INTERFACE INTERATIVA & PWA (FRONTEND)                │
│                                                                        │
│   ┌─────────────────────────────────┐   ┌───────────────────────────┐  │
│   │   Fachada Edifício Pixel Art    │   │  Drawer Setorial / CFO    │  │
│   │   [5º] Mesa Diretoria / CFO     │   │  · Parecer Executivo      │  │
│   │   [4º] Fundamentalista & Bazin  │   │  · Dossiê Decenal Auditado│  │
│   │   [3º] Solvência & Dívida/EBITDA│   │  · Diálogo Estratégico    │  │
│   │   [2º] Radar Exógeno CVM        │   │  · Veredito Oficial       │  │
│   │   [Tº] Ingestão & Sentinela BTC │   │  · Alocação Sugerida      │  │
│   └─────────────────────────────────┘   └───────────────────────────┘  │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   BACKEND API (FASTAPI / EXPRESS PROXY)                │
│                                                                        │
│   ┌───────────────────────────┐         ┌──────────────────────────┐   │
│   │ Financial Engine          │         │ LLM CFO Service          │   │
│   │ · Teto Décio Bazin (3/5y) │         │ · Prompt Auditor Master  │   │
│   │ · Fórmula de Graham       │         │ · Schema JSON Estrito    │   │
│   │ · FCO vs Lucro Líquido    │         │ · Análise Qualitativa    │   │
│   │ · Alavancagem & Selic     │         │ · Gemini 3.8 Flash API   │   │
│   └─────────────┬─────────────┘         └─────────────▲────────────┘   │
│                 │                                     │                │
│                 └──────── Dossiê Estruturado (JSON) ──┘                │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌───────────────────────────────┐               ┌────────────────────────┐
│  ORCHESTRATOR: n8n            │               │  POSTGRESQL (10 ANOS)  │
│  · Rotina Matinal (09:30)     │               │  · ativos              │
│  · Fechamento CVM (19:00)     │               │  · posicao_carteira    │
│  · Sentinela Cripto BTC 24/7  │               │  · demonstrativos      │
│                               │               │  · auditorias_cfo      │
└───────────────────────────────┘               └────────────────────────┘
```

### Entregáveis de Código que Serão Fornecidos:
1. `docker-compose.yml`: Totalmente funcional com restrições OCI (Postgres, n8n, FastAPI backend).
2. `backend/app/database/models.py`: Modelos SQLAlchemy completos com relações, constraints e histórico decenal.
3. `backend/app/services/financial_engine.py`: Motor determinístico com Décio Bazin (3/5 anos sem não-recorrentes), Graham, CAGR, Dívida Líquida/EBITDA e FCO vs Lucro Líquido.
4. `backend/app/services/llm_cfo.py`: Integração do CFO com prompt de sistema corporativo rigoroso, validação Pydantic e saída JSON estruturada.
5. `backend/app/routers/`: Rotas FastAPI completas para CRUD de ativos, auditoria do motor financeiro, consulta do CFO e webhooks de disparo do n8n.
6. `frontend/`:
   - Canvas animado do edifício em corte transversal com iluminação e trabalhadores.
   - Painel interativo com abas para cada setor/andar.
   - Drawer executivo de chat e pareceres do CFO conectado via endpoint seguro com o Gemini.
   - Simulador de rotinas n8n e exportador de arquivos em 1 clique.
7. `n8n_workflows/`: JSONs conceituais completos dos 3 workflows prontos para importação no n8n.

---

## 5. Plano de Verificação

- **Verificação Matemática**: Validar cálculo do preço-teto Bazin e Graham com dados das empresas pré-carregadas (TAEE11 com DPA médio e teto a 6%, BBAS3 com LPA e VPA).
- **Verificação do Agente CFO**: Confirmar que o parecer do CFO respeita a regra estrita de não inventar números e gera saída padronizada (`COMPRAR`, `AGUARDAR`, `QUARENTENA`).
- **Verificação de Compilação**: Executar `compile_applet` e `lint_applet` para assegurar ausência de erros de build TypeScript e integridade visual responsiva em telas desktop e mobile.
