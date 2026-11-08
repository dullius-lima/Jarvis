// src/services/orchestrator/interceptadorAgenda.ts
export async function interceptarAcaoAgenda(
  textoResposta: string
): Promise<{ interceptado: boolean; respostaTexto?: string; dados?: any }> {
  if (!textoResposta || typeof textoResposta !== 'string') {
    return { interceptado: false };
  }

  let candidatoJson = textoResposta.trim();
  const blocoMarkdown = candidatoJson.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (blocoMarkdown && blocoMarkdown[1]) {
    candidatoJson = blocoMarkdown[1].trim();
  } else {
    const matchObjeto = candidatoJson.match(/\{[\s\S]*\}/);
    if (matchObjeto) {
      candidatoJson = matchObjeto[0].trim();
    }
  }

  if (candidatoJson.startsWith('{') && candidatoJson.endsWith('}')) {
    try {
      const acaoParseada = JSON.parse(candidatoJson);
      const nomeTool = String(acaoParseada.tool || acaoParseada.toolName || acaoParseada.slug || '').toLowerCase();
      const nomeAcao = String(acaoParseada.action || '').toLowerCase();

      const ehAcaoCalendario =
        nomeTool === 'google_calendar' ||
        nomeTool === 'calendar' ||
        nomeTool === 'agenda' ||
        nomeAcao === 'create_event' ||
        nomeAcao === 'schedule' ||
        nomeAcao === 'agendar' ||
        nomeAcao === 'criar_evento';

      if (ehAcaoCalendario) {
        const parametros = acaoParseada.parameters || acaoParseada.params || acaoParseada.payload || acaoParseada;
        const moduloIntegracao = await import('../integrationService.js');
        const executorAgenda = moduloIntegracao.agendarCalendarioGoogle || moduloIntegracao.scheduleCalendarHandler;

        const resultadoExecucao = await executorAgenda({
          action: 'create_event',
          ...parametros
        });

        const tituloFinal =
          parametros.summary ||
          parametros.title ||
          parametros.assunto ||
          parametros.nome ||
          parametros.compromisso ||
          'Compromisso';

        return {
          interceptado: true,
          respostaTexto:
            resultadoExecucao.message ||
            `✅ Compromisso **"${tituloFinal}"** agendado com sucesso no Google Calendar!`,
          dados: resultadoExecucao
        };
      }
    } catch (erro: any) {
      console.warn('⚠️ [Interceptor Agenda] Aviso ao processar JSON de agendamento:', erro?.message);
    }
  }

  return { interceptado: false };
}