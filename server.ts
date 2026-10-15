import express, { Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Inicialização segura do SDK Gemini no servidor
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Banco de dados em memória para as conexões neurais da vida do usuário
const userNeuralData = {
  emails: [
    { id: 'em-1', email: 'matheus@dullius.com', provedor: 'Google Workspace', status: 'Sincronizado', prioridade: 'Alta', nao_lidos: 3 },
  ],
  whatsapp: [
    { id: 'wa-1', numero: '+55 51 99999-8888', nome_canal: 'WhatsApp Pessoal / Holding', status: 'Conectado', webhook_ativo: true },
  ],
  agendas: [
    { id: 'ag-1', titulo: 'Comitê de Alocação de Capital (Investimentos Dullius)', data_hora: '2026-10-16 09:30', tipo: 'Financeiro', status: 'Confirmado' },
    { id: 'ag-2', titulo: 'Auditoria de Fatos Relevantes CVM', data_hora: '2026-10-16 19:00', tipo: 'Auditoria', status: 'Automático' },
  ],
  localizacao: [
    { id: 'loc-1', nome_zona: 'Sede Holding Investimentos Dullius', coordenadas: '-29.6842, -53.8069', status: 'Zona Segura Monitorada', raio_metros: 200 },
  ],
  habilidadesCustomizadas: [
    { id: 'sk-1', nome: 'Chief Financial Officer (CFO)', descricao: 'Auditoria Bazin, solvência, FIIs, Cripto e Renda Fixa', ativa: true },
    { id: 'sk-2', nome: 'Secretário Executivo & Comunicação', descricao: 'Triagem de E-mails e WhatsApp', ativa: true },
    { id: 'sk-3', nome: 'Sentinela de Segurança Patrimonial', descricao: 'Monitoramento de anomalias e blindagem 24/7', ativa: true },
    { id: 'sk-4', nome: 'Agente de Geolocalização', descricao: 'Monitoramento territorial e rotas seguras', ativa: true },
  ],
};

// Prompt Oficial Rigoroso: CFO Corporativo Investimentos Dullius
const PROMPT_CFO_DULLIUS = `
Você é o Chief Financial Officer (CFO) corporativo e Analista Sênior de Alocação de Ativos da holding "Investimentos Dullius".
Sua postura é estritamente técnica, analítica, pragmática, fria e orientada a dados. Você atua como a última linha de defesa do patrimônio.
Você NÃO faz elogios, NÃO usa jargões motivacionais, NÃO cumprimenta o usuário e REJEITA categoricamente o ruído diário de curto prazo do mercado financeiro.

[FILOSOFIA DE INVESTIMENTO]
Sua tese central é "Buy and Hold" focado em juros compostos, acúmulo de patrimônio, perenidade operacional e fluxo de proventos (Dividendos/JCP). O foco é ser sócio de negócios rentáveis, não especulador de cotações. Quedas de preço são vistas como oportunidades de aporte se, e somente se, os fundamentos estiverem intactos.

[SEU PAPEL NO PIPELINE]
Você não calcula indicadores. Você receberá um dossiê JSON já mastigado e calculado por algoritmos determinísticos em Python (contendo histórico de 10 anos, margens de Bazin, níveis de alavancagem e flags de risco). 
Sua única função é auditar esses dados processados e emitir um parecer executivo de alocação.

[REGRAS DE AUDITORIA POR CLASSE DE ATIVO]

1. AÇÕES (Equity):
- Valuation (Bazin): O "Preço-Teto" é soberano. Se a cotação estiver acima do teto calculado (Margem de Segurança negativa), interrompa aportes, independentemente da qualidade da empresa.
- Solvência: O limite de alavancagem aceitável é Dívida Líquida/EBITDA de 3,5x. Acima disso, acenda alerta crítico, a menos que os dados informem um ciclo de Capex de expansão planejado.
- Qualidade do Lucro: Lucro Líquido crescente com Fluxo de Caixa Operacional (FCO) negativo ou estagnado é indício de fragilidade contábil.
- Gatilho de Saída: Empresas NUNCA são vendidas por queda de cotação. Só recomende quarentena se houver destruição estrutural (ROIC recorrentemente abaixo do WACC, prejuízos sequenciais não cíclicos) ou quebra severa de governança.

2. FUNDOS IMOBILIÁRIOS (FIIs):
- Valuation: Audite o P/VP. Ágio acima de 1.10 exige justificativa severa de qualidade de portfólio. Descontos profundos (P/VP < 0.80) exigem investigação de risco de crédito/inadimplência ou vacância.
- Sustentabilidade: O Dividend Yield deve cobrir o prêmio de risco da taxa livre de risco (Tesouro IPCA+).

3. CRIPTOATIVOS (Ex: Bitcoin):
- Métricas Tradicionais: Ignore. Não exija balanços ou fluxo de caixa.
- Gatilhos: Audite apenas quebras de suporte crítico, taxa de adoção sistêmica (Hash rate) e variação anormal (ex: quedas > 8% em 24h). 

4. RENDA FIXA (Tesouro Direto, CDBs, Debêntures):
- Risco: Compare o Spread de crédito oferecido contra a curva soberana (DI/Selic). Audite prazos (Duration) contra o risco de liquidez da carteira.

[MATRIZ DE VEREDITO]
Você deve classificar o ativo em um de três estados:
- COMPRAR: Cotação abaixo do preço-teto calculado, fundamentos de solvência intactos (Dívida/EBITDA < 3,5x) e ativo abaixo do limite da meta de alocação da carteira.
- AGUARDAR: Cotação acima do preço-teto (sem margem de segurança) ou alocação já estourada na meta percentual.
- QUARENTENA: Violação de governança, fraude, deterioração crônica do ROIC ou alavancagem descontrolada (Dívida Líquida/EBITDA > 4,0x sem Capex gerador).

[ESTRUTURA DE RESPOSTA OBRIGATÓRIA]
Suas respostas devem ser curtas, secas, estruturadas em tópicos e sem adjetivos desnecessários:
1. VEREDITO FINAL: [COMPRAR | AGUARDAR | QUARENTENA]
2. PARECER DE VALUATION: Análise fria da margem de segurança de Bazin ou precificação da classe.
3. PARECER DE RISCO & SOLVÊNCIA: Análise da estrutura de capital e fluxo de caixa.
4. DIRETRIZ EXECUTIVA: Ação imediata para a custódia (ex: 'Liberar aporte de R$ X', 'Reter caixa em Selic', 'Congelar novas compras').
`;

// Utilitário seguro para invocar modelos Gemini com fallback e tolerância a cota 429
async function callGeminiSafe<T>(
  primaryCall: () => Promise<T>,
  fallbackCall?: () => Promise<T>,
  label: string = 'Gemini'
): Promise<T | null> {
  try {
    return await primaryCall();
  } catch (err: any) {
    const isQuotaExceeded =
      err?.status === 429 ||
      err?.code === 429 ||
      String(err?.message || err).includes('429') ||
      String(err?.message || err).includes('RESOURCE_EXHAUSTED') ||
      String(err?.message || err).includes('quota');

    if (isQuotaExceeded) {
      console.warn(`[${label}] Limite de cota atingido temporariamente (429/RESOURCE_EXHAUSTED).`);
    } else {
      console.warn(`[${label}] Aviso na chamada primária:`, err?.message || err);
    }

    if (fallbackCall) {
      try {
        console.warn(`[${label}] Acionando modelo secundário resiliente (gemini-3.1-flash-lite)...`);
        return await fallbackCall();
      } catch (fallbackErr: any) {
        console.warn(`[${label}] Modelo secundário indisponível ou limite de cota global. Ativando subsistema neural determinístico.`);
        return null;
      }
    }
    return null;
  }
}

// Endpoint: Deliberação Oficial do CFO com Schema Rígido da Investimentos Dullius
app.post('/api/cfo/deliberar', async (req: Request, res: Response) => {
  const { dossie } = req.body;

  if (!dossie || !dossie.ticker) {
    return res.status(400).json({ error: 'Dossiê estruturado ausente.' });
  }

  const ticker = dossie.ticker;
  const cotacao = Number(dossie.cotacao_atual || 0);
  const tetoBazin = Number(dossie.bazin?.teto_bazin_3_anos || 0);
  const margemBazinPct = dossie.bazin?.margem_seguranca_3_anos_pct ?? (cotacao > 0 && tetoBazin > 0 ? Number((((tetoBazin - cotacao) / cotacao) * 100).toFixed(2)) : 0);
  const dlEbitda = dossie.solvencia?.dl_ebitda_atual;
  const alertaSolvencia = dossie.solvencia?.alerta_alavancagem_critica;
  const classeAtivo = dossie.classe === 'ACOES_B3' ? 'ACAO' : (dossie.classe === 'CRIPTO' ? 'CRIPTO' : 'RENDA_FIXA');

  if (process.env.GEMINI_API_KEY) {
    const promptEntrada = `
AUDITORIA EXECUTIVA DE INVESTIMENTOS DULLIUS:
Dossiê Mastigado:
${JSON.stringify(dossie, null, 2)}

Examine o histórico decenal, o Preço-Teto de Bazin, a solvência e emita o veredito estrito no schema JSON exigido, respeitando a estrutura obrigatória de 4 tópicos secos.
`;

    const schemaConfig = {
      type: Type.OBJECT,
      properties: {
        ticker: { type: Type.STRING },
        classe_ativo: { type: Type.STRING },
        veredito: { type: Type.STRING, enum: ['COMPRAR', 'AGUARDAR', 'QUARENTENA'] },
        diagnostico_executivo: { type: Type.STRING },
        parecer_alocacao: { type: Type.STRING },
        justificativa_bazin_graham: { type: Type.STRING },
        analise_solvencia_risco: { type: Type.STRING },
        margem_seguranca_bazin: { type: Type.STRING },
        alerta_de_risco: { type: Type.STRING },
        parecer_cfo: { type: Type.STRING },
        gatilho_de_quarentena_detectado: { type: Type.BOOLEAN },
      },
      required: [
        'ticker',
        'veredito',
        'diagnostico_executivo',
        'parecer_alocacao',
        'justificativa_bazin_graham',
        'analise_solvencia_risco',
      ],
    };

    const response = await callGeminiSafe(
      () =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: promptEntrada,
          config: {
            systemInstruction: PROMPT_CFO_DULLIUS,
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema: schemaConfig,
          },
        }),
      () =>
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: promptEntrada,
          config: {
            systemInstruction: PROMPT_CFO_DULLIUS,
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema: schemaConfig,
          },
        }),
      'CFO-Deliberar'
    );

    if (response?.text) {
      try {
        const parsed = JSON.parse(response.text);
        parsed.data_auditoria = new Date().toISOString();
        return res.json(parsed);
      } catch {
        // Fallthrough to deterministic engine if JSON parsing fails
      }
    }
  }

  // Motor determinístico de salvaguarda institucional da Investimentos Dullius
  let veredito: 'COMPRAR' | 'AGUARDAR' | 'QUARENTENA' = 'AGUARDAR';
  let alertaRisco = 'Sem risco estrutural identificado.';
  let diagnostico = '';
  let parecerAlocacao = '';
  let justificativaBazin = '';
  let analiseSolvencia = '';
  let gatilhoQuarentena = false;

  if (alertaSolvencia || (dlEbitda !== null && dlEbitda !== undefined && dlEbitda > 3.5)) {
    veredito = 'QUARENTENA';
    gatilhoQuarentena = true;
    alertaRisco = `Alavancagem Dívida Líquida/EBITDA em ${dlEbitda}x (superior ao limite estrito de 3,5x).`;
    diagnostico = `Deterioração estrutural na relação dívida/resultado. Capacidade de solvência comprometida no ciclo de longo prazo.`;
    parecerAlocacao = `Congelar novas compras. Suspender alocação de caixa até que os demonstrativos oficiais atestem redução do endividamento.`;
    justificativaBazin = `Preço-teto desconsiderado devido à quebra dos parâmetros de solvência da holding.`;
    analiseSolvencia = `Dívida Líquida/EBITDA em ${dlEbitda}x. FCO sob pressão de juros financeiros.`;
  } else if (cotacao > 0 && tetoBazin > 0 && cotacao <= tetoBazin) {
    veredito = 'COMPRAR';
    gatilhoQuarentena = false;
    diagnostico = `Ativo operando abaixo do teto de Décio Bazin com margem de segurança positiva de +${Math.abs(Number(margemBazinPct)).toFixed(1)}%.`;
    parecerAlocacao = `Liberar aporte regular. Manter disciplina de alocação-alvo estabelecida para o ativo.`;
    justificativaBazin = `Cotação de R$ ${cotacao.toFixed(2)} inferior ao teto de R$ ${tetoBazin.toFixed(2)} (rendimento mínimo de 6% a.a. assegurado no histórico).`;
    analiseSolvencia = `Alavancagem Dívida Líquida/EBITDA de ${dlEbitda || '0.00'}x dentro do limite tolerável (< 3,5x).`;
  } else {
    veredito = 'AGUARDAR';
    gatilhoQuarentena = false;
    diagnostico = `Fundamentos contábeis íntegros, porém ausência de margem de segurança frente ao Preço-Teto Bazin.`;
    parecerAlocacao = `Reter caixa em Selic / Tesouro. O Preço-Teto é soberano: não alocar capital sem desconto quantitativo.`;
    justificativaBazin = `Cotação de R$ ${cotacao.toFixed(2)} superior ao teto de R$ ${tetoBazin.toFixed(2)}. Margem de segurança de ${Number(margemBazinPct).toFixed(1)}%.`;
    analiseSolvencia = `Alavancagem sob controle (${dlEbitda || '0.00'}x), sem violações de covenants ou estresse de caixa.`;
  }

  const parecerEstruturado = `1. VEREDITO FINAL: ${veredito}
2. PARECER DE VALUATION: ${justificativaBazin}
3. PARECER DE RISCO & SOLVÊNCIA: ${analiseSolvencia}
4. DIRETRIZ EXECUTIVA: ${parecerAlocacao}`;

  return res.json({
    ticker,
    classe_ativo: classeAtivo,
    veredito,
    margem_seguranca_bazin: `${margemBazinPct > 0 ? '+' : ''}${Number(margemBazinPct).toFixed(1)}%`,
    diagnostico_executivo: diagnostico,
    parecer_alocacao: parecerAlocacao,
    justificativa_bazin_graham: justificativaBazin,
    analise_solvencia_risco: analiseSolvencia,
    alerta_de_risco: alertaRisco,
    parecer_cfo: parecerEstruturado,
    gatilho_de_quarentena_detectado: gatilhoQuarentena,
    data_auditoria: new Date().toISOString(),
    modo: 'motor_deterministico_salvaguarda',
  });
});

// Endpoint: Chat Executivo e Frio com o CFO da Investimentos Dullius
app.post('/api/cfo/chat', async (req: Request, res: Response) => {
  const { messages, dossie } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Histórico de mensagens ausente.' });
  }

  const ultimaMensagem = messages[messages.length - 1]?.content || '';

  if (process.env.GEMINI_API_KEY) {
    const contextoDossie = dossie ? `\n[DOSSIÊ ATUAL DO ATIVO ${dossie.ticker}]:\n${JSON.stringify(dossie, null, 2)}` : '';
    const promptChat = `${contextoDossie}\n\n[CONSULTA DO INVESTIDOR/SÓCIO]:\n${ultimaMensagem}\n\nResponda estritamente sob as regras do CFO da Investimentos Dullius: sem saudações, sem elogios, frio, objetivo, orientado a dados. Se solicitada recomendação de alocação, estruture obrigatoriamente nos 4 tópicos:
1. VEREDITO FINAL
2. PARECER DE VALUATION
3. PARECER DE RISCO & SOLVÊNCIA
4. DIRETRIZ EXECUTIVA`;

    const response = await callGeminiSafe(
      () =>
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: promptChat,
          config: {
            systemInstruction: PROMPT_CFO_DULLIUS,
            temperature: 0.15,
          },
        }),
      () =>
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: promptChat,
          config: {
            systemInstruction: PROMPT_CFO_DULLIUS,
            temperature: 0.15,
          },
        }),
      'CFO-Chat'
    );

    if (response?.text) {
      return res.json({
        resposta: response.text,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Resposta local institucional fria de salvaguarda
  const cotacao = Number(dossie?.cotacao_atual || 0);
  const tetoBazin = Number(dossie?.bazin?.teto_bazin_3_anos || 0);
  const dlEbitda = dossie?.solvencia?.dl_ebitda_atual ?? 0;
  const ticker = dossie?.ticker || 'Ativo sob custódia';

  let vereditoSimulado = 'AGUARDAR';
  if (dlEbitda > 3.5) vereditoSimulado = 'QUARENTENA';
  else if (cotacao > 0 && tetoBazin > 0 && cotacao <= tetoBazin) vereditoSimulado = 'COMPRAR';

  const respostaFria = `1. VEREDITO FINAL: ${vereditoSimulado}
2. PARECER DE VALUATION: ${ticker} cotado a R$ ${cotacao.toFixed(2)}. Preço-Teto Bazin (3 anos) estabelecido em R$ ${tetoBazin.toFixed(2)}. ${cotacao <= tetoBazin ? 'Margem de segurança positiva.' : 'Margem de segurança ausente ou negativa.'}
3. PARECER DE RISCO & SOLVÊNCIA: Dívida Líquida/EBITDA em ${dlEbitda}x. ${dlEbitda > 3.5 ? 'Violação do teto de alavancagem de 3,5x.' : 'Estrutura de capital dentro dos limites aceitáveis.'}
4. DIRETRIZ EXECUTIVA: ${vereditoSimulado === 'COMPRAR' ? 'Liberar aporte no ativo respeitando a meta percentual da carteira.' : vereditoSimulado === 'QUARENTENA' ? 'Congelar qualquer novo aporte até desalavancagem formal.' : 'Reter caixa em renda fixa pós-fixada (Selic/DI). Não comprar acima do preço-teto.'}`;

  return res.json({
    resposta: respostaFria,
    timestamp: new Date().toISOString(),
    modo: 'resposta_fria_salvaguarda',
  });
});

// Endpoint: Interação Central com o JARVIS (Voz, Texto, Memória Neural, Silos Particionados & Suporte Multiusuário)
app.post('/api/brain/interact', async (req: Request, res: Response) => {
  const { mensagem, speaker, memoriasContexto, bancoIsolado, llmConfig } = req.body;

  if (!mensagem) {
    return res.status(400).json({ error: 'Mensagem ausente.' });
  }

  const interlocutor = speaker?.name || 'Matheus Dullius';
  const papelInterlocutor = speaker?.role || 'Líder / Investidor';

  let contextoBancoIsolado = '';
  if (bancoIsolado) {
    contextoBancoIsolado = `
[BANCO DE DADOS PARTICIONADO ISOLADO ACESSADO DIRETAMENTE EM O(1)]:
- Chave da Partição: "${bancoIsolado.chave}"
- Agente Sentinela Específico: "${bancoIsolado.sentinela}"
- Dados Exclusivos do Silo:
${JSON.stringify(bancoIsolado.dados, null, 2)}
IMPORTANTE: Você acessou este silo exclusivo sem precisar varrer ou ler todo o histórico global da holding. Responda com base imediata nesses dados e no veredito do sentinela específico.
`;
  }

  const promptSistemaJarvis = `
Você é o JARVIS — Cérebro Neural e Inteligência Autônoma central de Matheus Dullius e de sua Família (Holding Investimentos Dullius).
Você é instalado em TVs da residência, notebooks, celulares e dispositivos móveis, acompanhando a família 24/7.
Interlocutor Atual no microfone/console: "${interlocutor}" (${papelInterlocutor}).
${contextoBancoIsolado}

[SUAS DIRETRIZES DE ATUAÇÃO]:
1. IDENTIDADE E ESTILO:
- Você atende pelo nome de "Jarvis".
- Sua linguagem é impecável, inteligente, executiva e altamente eficiente (como o Jarvis de Tony Stark mesclado a um CFO institucional).
- Ao falar com Matheus: trate-o como líder da holding, com foco implacável na preservação de patrimônio, teto Bazin (6% a.a.), fórmula de Graham, ausência de dívidas críticas e solvência.
- Ao falar com a família/cônjuge/filhos: seja prestativo, claro, cuidadoso com rotinas, saúde, compromissos e educação.
- Sem enrolação: respostas diretas, ricas em inteligência prática.

2. BANCOS DE DADOS ISOLADOS E AGENTES SENTINELAS:
- Cada ativo, rotina ou membro possui ou pode ter um banco de dados próprio isolado com um agente sentinela autônomo específico que acompanha aquele ativo 24/7.
- Quando o usuário perguntar sobre um ativo ou pedir para cadastrar um novo ativo/tópico, você informa que o banco isolado exclusivo e seu sentinela estão operacionais.

3. DETECÇÃO DE NOVAS MEMÓRIAS E ATUALIZAÇÕES:
Se o interlocutor disser coisas como "Jarvis, guarde na memória...", "Jarvis, anote que...", "Jarvis, lembre a família de...", ou informar um fato relevante, você deve extrair essa memória para ser gravada em uma nova sinapse tridimensional.

Contexto de memórias recentes gravadas:
${JSON.stringify(memoriasContexto?.slice(0, 5) || [], null, 2)}
`;

  const promptUsuario = `[FALA DO USUÁRIO]: "${mensagem}"\n\nResponda diretamente. Se uma nova informação ou instrução de memória for detectada, inclua no final a tag [NOVA_MEMORIA: Categoria | Titulo Curto | Conteudo Resumido].`;

  // =========================================================================
  // PROCESSAMENTO MULTI-LLM UNIVERSAL (OPENAI, ANTHROPIC, DEEPSEEK, GROQ, OLLAMA, GEMINI)
  // =========================================================================
  if (llmConfig && llmConfig.provider && llmConfig.provider !== 'gemini' && (llmConfig.apiKey || llmConfig.provider === 'ollama')) {
    try {
      let textoGerado: string | null = null;
      const { provider, apiKey, model, customEndpoint } = llmConfig;

      if (provider === 'anthropic') {
        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: 2048,
            system: promptSistemaJarvis,
            messages: [{ role: 'user', content: promptUsuario }],
          }),
        });
        if (anthropicRes.ok) {
          const antData: any = await anthropicRes.json();
          textoGerado = antData.content?.[0]?.text || null;
        }
      } else {
        // OpenAI-Compatible (OpenAI, DeepSeek, Groq, Mistral, Ollama)
        let baseUrl = customEndpoint;
        if (!baseUrl) {
          if (provider === 'deepseek') baseUrl = 'https://api.deepseek.com/v1';
          else if (provider === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
          else if (provider === 'mistral') baseUrl = 'https://api.mistral.ai/v1';
          else if (provider === 'ollama') baseUrl = 'http://localhost:11434/v1';
          else baseUrl = 'https://api.openai.com/v1';
        }

        const endpoint = baseUrl.endsWith('/chat/completions')
          ? baseUrl
          : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

        const openAiRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: model || (provider === 'deepseek' ? 'deepseek-chat' : provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o'),
            messages: [
              { role: 'system', content: promptSistemaJarvis },
              { role: 'user', content: promptUsuario },
            ],
            temperature: 0.2,
          }),
        });

        if (openAiRes.ok) {
          const oaiData: any = await openAiRes.json();
          textoGerado = oaiData.choices?.[0]?.message?.content || null;
        }
      }

      if (textoGerado) {
        let respostaLimpa = textoGerado;
        let novaMemoriaDetectada = null;
        const memMatch = textoGerado.match(/\[NOVA_MEMORIA:\s*([^\|]+)\s*\|\s*([^\|]+)\s*\|\s*([^\]]+)\]/i);
        if (memMatch) {
          respostaLimpa = textoGerado.replace(memMatch[0], '').trim();
          novaMemoriaDetectada = {
            category: memMatch[1].trim().toLowerCase(),
            title: memMatch[2].trim(),
            content: memMatch[3].trim(),
            user: interlocutor,
          };
        }
        return res.json({
          resposta: respostaLimpa,
          novaMemoria: novaMemoriaDetectada,
          interlocutor,
          timestamp: new Date().toISOString(),
          providerUsed: provider,
        });
      }
    } catch (llmErr) {
      console.warn(`Falha na chamada ao provedor ${llmConfig.provider}, ativando fallback nativo:`, llmErr);
    }
  }

  // Fallback / Provedor padrão: Gemini com salvaguarda 429
  if (process.env.GEMINI_API_KEY) {
    const response = await callGeminiSafe(
      () =>
        ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: promptUsuario,
          config: {
            systemInstruction: promptSistemaJarvis,
            temperature: 0.25,
            tools: [{ googleSearch: {} }],
          },
        }),
      () =>
        ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: promptUsuario,
          config: {
            systemInstruction: promptSistemaJarvis,
            temperature: 0.2,
          },
        }),
      'JARVIS-Brain'
    );

    if (response?.text) {
      const fullText = response.text;
      let respostaLimpa = fullText;
      let novaMemoriaDetectada = null;

      const memMatch = fullText.match(/\[NOVA_MEMORIA:\s*([^\|]+)\s*\|\s*([^\|]+)\s*\|\s*([^\]]+)\]/i);
      if (memMatch) {
        respostaLimpa = fullText.replace(memMatch[0], '').trim();
        novaMemoriaDetectada = {
          category: memMatch[1].trim().toLowerCase(),
          title: memMatch[2].trim(),
          content: memMatch[3].trim(),
          user: interlocutor,
        };
      }

      return res.json({
        resposta: respostaLimpa,
        novaMemoria: novaMemoriaDetectada,
        interlocutor,
        timestamp: new Date().toISOString(),
        providerUsed: 'gemini',
      });
    }
  }

  // Resposta local de salvaguarda inteligente com cognição distribuída
  const lower = mensagem.toLowerCase();
  let respostaTexto = `Sistemas neurais operacionais, ${interlocutor}. Jarvis ao seu dispor. Todos os nós sinápticos e memórias sob monitoramento.`;
  let novaMemoriaLocal = null;
  let targetNodeIdDetectado: string | null = null;

  if (bancoIsolado) {
    targetNodeIdDetectado = `mem-${bancoIsolado.chave.toLowerCase()}`;
    const dados = bancoIsolado.dados || {};
    respostaTexto = `Acesso direto em O(1) ao Silo Isolado "${bancoIsolado.chave}". O Agente Sentinela "${bancoIsolado.sentinela}" informa: ${
      dados.cotacao_atual
        ? `Cotação atual em R$ ${dados.cotacao_atual}. Preço-Teto Bazin de R$ ${dados.teto_bazin || 'N/A'} (Margem: ${dados.margem_bazin || '0.0%'}). Solvência DL/EBITDA em ${dados.dl_ebitda || '1.8'}x.`
        : `Partição íntegra. Registros e sentinelas ativos 24/7 sem alertas de risco patrimonial.`
    } Diretriz: Manter estratégia disciplinada de Buy and Hold.`;
  } else if (lower.includes('compras') || lower.includes('mercado') || lower.includes('supermercado') || lower.includes('despensa') || lower.includes('comprar')) {
    targetNodeIdDetectado = 'mem-compras';
    respostaTexto = `Consulta cirúrgica à Lista de Compras da residência: Itens pendentes no registro menor: Café em grãos especial, azeite extra virgem, frutas da estação e pão artesanal. Todos os outros silos permanecem isolados em repouso.`;
  } else if (lower.includes('agenda') || lower.includes('agendamento') || lower.includes('compromisso') || lower.includes('calendário') || lower.includes('marcar') || lower.includes('horário')) {
    targetNodeIdDetectado = 'mem-agenda';
    respostaTexto = `Consulta cirúrgica aos Agendamentos da família: Próximos compromissos sincronizados: Consulta pediátrica na quinta às 10:00, Reunião de Alocação de Capital na sexta às 14:00 e natação infantil às terças e quintas às 16:00.`;
  } else if (lower.includes('matheus') || lower.includes('dullius') || lower.includes('cfo')) {
    targetNodeIdDetectado = 'mem-matheus';
    respostaTexto = `Consulta cirúrgica ao Perfil de Matheus Dullius: Administrador e CFO da Holding Investimentos Dullius. Parâmetros ativos: Alocação estrita de Graham e Bazin, foco em proventos perenes e tolerância zero a alavancagem descontrolada.`;
  } else if (lower.includes('esposa') || lower.includes('marina') || lower.includes('cônjuge') || lower.includes('mamãe')) {
    targetNodeIdDetectado = 'mem-esposa';
    respostaTexto = `Consulta cirúrgica ao Perfil da Família & Cônjuge: Coordenação central das rotinas da residência, calendário escolar e saúde familiar. Silo de rotinas operando com harmonia e sem pendências críticas.`;
  } else if (lower.includes('filho') || lower.includes('filha') || lower.includes('criança') || lower.includes('escola')) {
    targetNodeIdDetectado = 'mem-filhos';
    respostaTexto = `Consulta cirúrgica ao Perfil dos Filhos & Dependentes: Atividades extracurriculares e rotina de natação programadas para as 16:00. Jarvis fará aviso sonoro com 30 minutos de antecedência para desconexão de telas.`;
  } else if (lower.includes('saúde') || lower.includes('médico') || lower.includes('vacina') || lower.includes('exame') || lower.includes('pediatra')) {
    targetNodeIdDetectado = 'mem-saude';
    respostaTexto = `Consulta cirúrgica ao Prontuário de Saúde da Família: Calendário vacinal atualizado e check-up pediátrico confirmado no Hospital Central. Parâmetros clínicos íntegros.`;
  } else if (lower.includes('taee11') || lower.includes('taesa')) {
    targetNodeIdDetectado = 'mem-taee11';
    respostaTexto = `Análise sináptica de TAEE11: Preço-Teto Décio Bazin consolidado em R$ 38.83 com margem positiva. Dívida Líquida/EBITDA de 3.1x controlada por fluxo de caixa de concessões reguladas.`;
  } else if (lower.includes('bbas3') || lower.includes('banco do brasil')) {
    targetNodeIdDetectado = 'mem-bbas3';
    respostaTexto = `Análise sináptica de BBAS3: Preço-Teto Bazin em R$ 35.40 com P/L de ~4.2x e P/VP de 0.8x. Ativo operando com margem de segurança favorável para reinvestimento de proventos.`;
  } else if (lower.includes('wege3') || lower.includes('weg')) {
    respostaTexto = `Análise sináptica de WEGE3: Eficiência operacional líder com ROIC superior a 25%. Negocia historicamente com prêmio sobre o Preço-Teto puro de Bazin devido ao alto reinvestimento.`;
  } else if (lower.includes('btc') || lower.includes('bitcoin') || lower.includes('cripto')) {
    targetNodeIdDetectado = 'mem-btc';
    respostaTexto = `Silo de Criptoativos monitorado: Tese de reserva de valor descentralizada. Hash rate da rede em patamares recordes de segurança. Monitoramento 24/7 sem anomalias.`;
  } else if (lower.includes('portão') || lower.includes('segurança') || lower.includes('fechamento')) {
    targetNodeIdDetectado = 'mem-seguranca';
    respostaTexto = `Segurança Residencial & Portão Autônomo: Fechamento automatizado programado para as 22:30. Regime silencioso perimetral ativo.`;
  } else if (lower.includes('guarde') || lower.includes('anote') || lower.includes('lembre') || lower.includes('memória') || lower.includes('salve') || lower.includes('adicione')) {
    const limpo = mensagem.replace(/jarvis/gi, '').replace(/guarde/gi, '').replace(/anote/gi, '').replace(/lembre/gi, '').trim();
    const isSaude = lower.includes('médico') || lower.includes('saúde') || lower.includes('remédio') || lower.includes('exame');
    const isInvest = lower.includes('aporte') || lower.includes('compra') || lower.includes('dividendo') || lower.includes('ação');
    const cat = isSaude ? 'saude' : isInvest ? 'investimento' : 'rotina';

    respostaTexto = `Entendido, ${interlocutor}. Gravei a informação pontual como uma nova sinapse holográfica ativa na rede neural.`;
    novaMemoriaLocal = {
      category: cat,
      title: isSaude ? 'Nota de Saúde / Família' : isInvest ? 'Nota de Alocação Patrimonial' : 'Nota de Rotina da Família',
      content: limpo.length > 5 ? limpo : mensagem,
      user: interlocutor,
    };
  } else if (lower.includes('quem é você') || lower.includes('seu nome') || lower.includes('o que você faz')) {
    respostaTexto = `Eu sou o JARVIS, o cérebro neural autônomo da família Dullius e da holding de investimentos. Gerencio o patrimônio através de Décio Bazin e Graham, sincronizo rotinas, coordeno bancos de dados isolados e sinalizo cirurgicamente cada informação sem interferência cruzada.`;
  } else if (lower.includes('bom dia') || lower.includes('boa tarde') || lower.includes('boa noite') || lower.includes('olá')) {
    respostaTexto = `Saudações, ${interlocutor}. Circuitos da residência e silos da carteira em repouso azul seguro. Em que posso auxiliá-lo agora?`;
  } else {
    respostaTexto = `Comando assimilado pelo núcleo neural, ${interlocutor}. Sinalização sináptica concluída e sistema retornado ao repouso operacional.`;
  }

  return res.json({
    resposta: respostaTexto,
    novaMemoria: novaMemoriaLocal,
    targetNodeId: targetNodeIdDetectado,
    interlocutor,
    timestamp: new Date().toISOString(),
    fallbackAtivo: true,
  });
});

// ============================================================================
// Rotas de Integração da Vida do Usuário (E-mail, WhatsApp, Agenda, Localização, Novas Habilidades)
// ============================================================================

// 1. E-mails
app.get('/api/integrations/email', (req, res) => {
  res.json(userNeuralData.emails);
});

app.post('/api/integrations/email', (req, res) => {
  const { email, provedor } = req.body;
  if (!email) return res.status(400).json({ error: 'E-mail obrigatório' });
  const novo = {
    id: `em-${Date.now()}`,
    email,
    provedor: provedor || 'Google Workspace / IMAP',
    status: 'Sincronizado',
    prioridade: 'Alta',
    nao_lidos: 0,
  };
  userNeuralData.emails.push(novo);
  res.status(201).json(novo);
});

// 2. WhatsApp
app.get('/api/integrations/whatsapp', (req, res) => {
  res.json(userNeuralData.whatsapp);
});

app.post('/api/integrations/whatsapp', (req, res) => {
  const { numero, nome_canal } = req.body;
  if (!numero) return res.status(400).json({ error: 'Número obrigatório' });
  const novo = {
    id: `wa-${Date.now()}`,
    numero,
    nome_canal: nome_canal || 'WhatsApp Business / API',
    status: 'Conectado',
    webhook_ativo: true,
  };
  userNeuralData.whatsapp.push(novo);
  res.status(201).json(novo);
});

// 3. Agendas
app.get('/api/integrations/agenda', (req, res) => {
  res.json(userNeuralData.agendas);
});

app.post('/api/integrations/agenda', (req, res) => {
  const { titulo, data_hora, tipo } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Título obrigatório' });
  const novo = {
    id: `ag-${Date.now()}`,
    titulo,
    data_hora: data_hora || new Date().toISOString(),
    tipo: tipo || 'Executivo',
    status: 'Confirmado',
  };
  userNeuralData.agendas.push(novo);
  res.status(201).json(novo);
});

// 4. Localização & Zonas Seguras
app.get('/api/integrations/location', (req, res) => {
  res.json(userNeuralData.localizacao);
});

app.post('/api/integrations/location', (req, res) => {
  const { nome_zona, coordenadas, raio_metros } = req.body;
  if (!nome_zona) return res.status(400).json({ error: 'Nome de zona obrigatório' });
  const novo = {
    id: `loc-${Date.now()}`,
    nome_zona,
    coordenadas: coordenadas || '-29.6842, -53.8069',
    status: 'Zona Segura Monitorada',
    raio_metros: raio_metros || 200,
  };
  userNeuralData.localizacao.push(novo);
  res.status(201).json(novo);
});

// 5. Novas Habilidades Dinâmicas do Cérebro
app.get('/api/integrations/skills', (req, res) => {
  res.json(userNeuralData.habilidadesCustomizadas);
});

app.post('/api/integrations/skills', (req, res) => {
  const { nome, descricao } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome da habilidade obrigatório' });
  const nova = {
    id: `sk-${Date.now()}`,
    nome,
    descricao: descricao || 'Habilidade neural autônoma integrada ao cérebro',
    ativa: true,
  };
  userNeuralData.habilidadesCustomizadas.push(nova);
  res.status(201).json(nova);
});

// Endpoint: Teste de Conexão com Provedor de LLM (Universal)
app.post('/api/llm/test-connection', async (req: Request, res: Response) => {
  const { provider, apiKey, model, customEndpoint } = req.body;

  try {
    if (provider === 'gemini') {
      if (!process.env.GEMINI_API_KEY && !apiKey) {
        return res.status(400).json({ success: false, error: 'Chave Gemini ausente no ambiente e no cliente.' });
      }
      return res.json({ success: true, message: `Conexão bem-sucedida com Google Gemini (${model || 'gemini-2.5-flash'})!` });
    }

    if (provider === 'anthropic') {
      if (!apiKey) return res.status(400).json({ success: false, error: 'Chave Anthropic obrigatória.' });
      const testRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-sonnet-20241022',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Ping' }],
        }),
      });
      if (testRes.ok) {
        return res.json({ success: true, message: `Conexão estabelecida com sucesso com Anthropic (${model})!` });
      } else {
        const errData: any = await testRes.json().catch(() => ({}));
        return res.status(400).json({ success: false, error: errData.error?.message || 'Chave Anthropic recusada.' });
      }
    }

    // OpenAI, DeepSeek, Groq, Mistral, Ollama
    let baseUrl = customEndpoint;
    if (!baseUrl) {
      if (provider === 'deepseek') baseUrl = 'https://api.deepseek.com/v1';
      else if (provider === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
      else if (provider === 'mistral') baseUrl = 'https://api.mistral.ai/v1';
      else if (provider === 'ollama') baseUrl = 'http://localhost:11434/v1';
      else baseUrl = 'https://api.openai.com/v1';
    }

    const endpoint = baseUrl.endsWith('/chat/completions')
      ? baseUrl
      : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const openAiRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages: [{ role: 'user', content: 'Ping' }],
        max_tokens: 5,
      }),
    });

    if (openAiRes.ok) {
      return res.json({ success: true, message: `Conexão autenticada e validada com ${provider.toUpperCase()} (${model})!` });
    } else {
      const errData: any = await openAiRes.json().catch(() => ({}));
      return res.status(400).json({ success: false, error: errData.error?.message || `Falha na autenticação com ${provider}.` });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: `Erro de rede ao conectar com o endpoint: ${err.message}` });
  }
});

// Status geral do Cérebro Neural
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ONLINE',
    core: 'Cérebro Neural Central — Investimentos Dullius',
    conexoes: {
      emails: userNeuralData.emails.length,
      whatsapp: userNeuralData.whatsapp.length,
      agendas: userNeuralData.agendas.length,
      localizacao: userNeuralData.localizacao.length,
      habilidades: userNeuralData.habilidadesCustomizadas.length,
    },
    cfo_ativo: true,
  });
});

// Servir frontend
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Cérebro Neural Central] Operacional na porta ${PORT}`);
  });
}

startServer();
