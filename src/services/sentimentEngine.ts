import { SentimentAnalysisResult, SentimentType } from '../types/neural';

export class SentimentEngine {
  public static analisar(texto: string): SentimentAnalysisResult {
    const lower = (texto || '').toLowerCase();

    // 1. Verificação de Alerta Crítico / Risco / Urgência (Vermelho Carmesim)
    if (
      lower.includes('urgente') ||
      lower.includes('perigo') ||
      lower.includes('risco') ||
      lower.includes('crítico') ||
      lower.includes('quarentena') ||
      lower.includes('socorro') ||
      lower.includes('prejuízo') ||
      lower.includes('alavancagem') ||
      lower.includes('queda') ||
      lower.includes('quebra') ||
      lower.includes('ameaça')
    ) {
      return {
        sentimento: 'urgente_alerta',
        intensidade: 0.95,
        rotulo: 'Alerta Crítico / Risco',
        explicacao: 'Carga emocional de alta voltagem: estado de vigilância e mitigação patrimonial acionado.',
        corHex: '#ef4444',
        corNumber: 0xef4444,
      };
    }

    // 2. Verificação de Oportunidade / Lucro / Compra / Proventos (Verde Esmeralda)
    if (
      lower.includes('oportunidade') ||
      lower.includes('comprar') ||
      lower.includes('compra') ||
      lower.includes('lucro') ||
      lower.includes('margem positiva') ||
      lower.includes('dividendo') ||
      lower.includes('sucesso') ||
      lower.includes('aporte autorizado') ||
      lower.includes('ganho') ||
      lower.includes('rentabilidade')
    ) {
      return {
        sentimento: 'oportunidade_lucro',
        intensidade: 0.9,
        rotulo: 'Oportunidade & Lucro',
        explicacao: 'Carga emocional positiva: margem de segurança favorável e geração de valor identificadas.',
        corHex: '#10b981',
        corNumber: 0x10b981,
      };
    }

    // 3. Verificação de Afeto Familiar / Saúde / Cuidado / Lar (Magenta / Violeta)
    if (
      lower.includes('amor') ||
      lower.includes('família') ||
      lower.includes('filho') ||
      lower.includes('filha') ||
      lower.includes('criança') ||
      lower.includes('esposa') ||
      lower.includes('mãe') ||
      lower.includes('pai') ||
      lower.includes('saúde') ||
      lower.includes('médico') ||
      lower.includes('remédio') ||
      lower.includes('obrigado') ||
      lower.includes('carinho') ||
      lower.includes('aniversário')
    ) {
      return {
        sentimento: 'afeto_familiar',
        intensidade: 0.85,
        rotulo: 'Afeto & Harmonia Familiar',
        explicacao: 'Carga emocional acolhedora: sinapses dedicadas ao bem-estar e convivência do lar.',
        corHex: '#ec4899',
        corNumber: 0xec4899,
      };
    }

    // 4. Verificação de Cautela / Dúvida / Aguardar (Âmbar Ouro)
    if (
      lower.includes('aguardar') ||
      lower.includes('esperar') ||
      lower.includes('cautela') ||
      lower.includes('atenção') ||
      lower.includes('dúvida') ||
      lower.includes('sem margem') ||
      lower.includes('volatilidade') ||
      lower.includes('teto superado')
    ) {
      return {
        sentimento: 'cautela_atencao',
        intensidade: 0.75,
        rotulo: 'Cautela & Prudência',
        explicacao: 'Carga emocional preventiva: retenção de capital e disciplina matemática Bazin.',
        corHex: '#f59e0b',
        corNumber: 0xf59e0b,
      };
    }

    // 5. Padrão: Analítico / Racional / Científico (Ciano Elétrico)
    return {
      sentimento: 'analitico_racional',
      intensidade: 0.7,
      rotulo: 'Racional / Analítico',
      explicacao: 'Carga emocional estável: processamento determinístico, sem ruídos emocionais.',
      corHex: '#00f0ff',
      corNumber: 0x00f0ff,
    };
  }
}
