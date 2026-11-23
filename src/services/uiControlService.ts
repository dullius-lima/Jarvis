import { resolveDeviceByPromptOrId } from './deviceRegistryService.js';
import { sendToDeviceById } from './deviceMeshService.js';
import { waitForSensoryAck } from './sensoryRouterService.js';

export interface UiCommandResult {
  handled: boolean;
  response: string;
}

function resolveTargetDevice(prompt: string, originDeviceId: string): { id: string; label: string } {
  if (/\b(?:tv|televis[aã]o|tcl)\b/i.test(prompt)) return { id: 'tv_sala', label: 'TV TCL' };
  if (/\b(?:pc|computador|notebook|windows)\b/i.test(prompt)) return { id: 'pc_windows', label: 'PC Windows' };
  if (/\b(?:celular|telefone|s25|galaxy)\b/i.test(prompt)) return { id: 'galaxy_s25', label: 'Galaxy S25' };
  const labels: Record<string, string> = {
    galaxy_s25: 'Galaxy S25',
    tv_sala: 'TV TCL',
    pc_windows: 'PC Windows',
    galaxy_watch: 'Galaxy Watch'
  };
  return { id: originDeviceId || 'galaxy_s25', label: labels[originDeviceId] || originDeviceId };
}

function stripDeviceSuffix(text: string): string {
  return text
    .replace(/\s+(?:no|na)\s+(?:meu\s+|minha\s+)?(?:celular|telefone|s25|tv|televis[aã]o|tcl|pc|computador|notebook|windows)[.!?]*$/i, '')
    .replace(/[.!?]+$/, '')
    .trim();
}

export async function tryHandleUiControlCommand(prompt: string, originDeviceId: string): Promise<UiCommandResult | null> {
  const clean = (prompt || '').replace(/^(?:jarvis[,:\s]+)/i, '').trim();
  if (!clean) return null;

  const target = await resolveDeviceByPromptOrId(clean, originDeviceId);
  let action = '';
  let payload: Record<string, any> = {};

  // 0. Busca rápida de documentos no dispositivo
  if (/^(?:busc[ae]|procur[ae]|ach[ae]|encontr[ae]|vasculh[ae])\s+(?:o\s+|um\s+|meus?\s+)?(?:documento|arquivo|pdf|contrato|planilha|foto)s?\s*(.*)/i.test(clean)) {
    const m = clean.match(/^(?:busc[ae]|procur[ae]|ach[ae]|encontr[ae]|vasculh[ae])\s+(?:o\s+|um\s+|meus?\s+)?(?:documento|arquivo|pdf|contrato|planilha|foto)s?\s*(.*)/i);
    const q = stripDeviceSuffix((m?.[1] || '').replace(/^(?:chamado|com\s+nome|sobre|de|do|da)\s+/i, ''));
    action = 'search_files';
    payload = { query: q };
  }
  // 0.1 Abertura direta de app (apenas quando não houver segunda tarefa como 'e busque')
  else if (/^(?:abr[aei]|abrir|inici[ae])\s+(?:o\s+|a\s+)?(?:app\s+|aplicativo\s+)?([^,]+)$/i.test(clean) && !/\s+e\s+(?:busc|procur|pesquis|digit|escrev|cliqu|mand|envi)/i.test(clean) && !/aba\s+|painel|mem[oó]ria|configura|documento|arquivo|pdf/i.test(clean)) {
    const m = clean.match(/^(?:abr[aei]|abrir|inici[ae])\s+(?:o\s+|a\s+)?(?:app\s+|aplicativo\s+)?(.+)$/i);
    action = 'open_app';
    payload = { app: stripDeviceSuffix(m?.[1] || '') };
  }
  // 1. Leitura de texto da tela
  if (/^(?:lei[ae]|ler)\s+(?:o\s+que\s+est[aá]\s+(?:escrito\s+)?)?(?:na\s+|a\s+)?tela|o\s+que\s+est[aá]\s+escrito\s+na\s+tela/i.test(clean)) {
    action = 'read_screen';
  }
  // 2. Ações globais de navegação
  else if (/^(?:volt[ae]|voltar)(?:\s+tela)?$/i.test(clean)) {
    action = 'global';
    payload = { key: 'back' };
  } else if (/^(?:ir\s+para\s+(?:a\s+)?)?(?:tela\s+inicial|home|in[ií]cio)$/i.test(clean)) {
    action = 'global';
    payload = { key: 'home' };
  } else if (/^(?:abrir\s+)?(?:apps\s+recentes|recentes|multitarefa)$/i.test(clean)) {
    action = 'global';
    payload = { key: 'recents' };
  } else if (/^(?:abrir\s+|abaix[ae]\s+)?notifica[cç][oõ]es$/i.test(clean)) {
    action = 'global';
    payload = { key: 'notifications' };
  }
  // 3. Rolagem / arrastar tela
  else if (/^(?:rol[ae]|desliz[ae]|arrast[ae]|sub[ae]|desc[ae])(?:\s+a\s+tela)?(?:\s+para)?(?:\s+(baixo|cima|esquerda|direita))?/i.test(clean)) {
    const m = clean.match(/^(?:rol[ae]|desliz[ae]|arrast[ae]|sub[ae]|desc[ae])(?:\s+a\s+tela)?(?:\s+para)?(?:\s+(baixo|cima|esquerda|direita))?/i);
    let dir = (m?.[1] || '').toLowerCase();
    if (!dir) dir = /^sub/i.test(clean) ? 'up' : 'down';
    const mapDir: Record<string, string> = { baixo: 'down', cima: 'up', esquerda: 'left', direita: 'right', down: 'down', up: 'up', left: 'left', right: 'right' };
    action = 'scroll';
    payload = { direction: mapDir[dir] || 'down' };
  }
  // 4. Digitação em campo focado
  else if (/^(?:digit[ae]|escrev[ae]|preench[ae])\s+(.+)/i.test(clean)) {
    const m = clean.match(/^(?:digit[ae]|escrev[ae]|preench[ae])\s+(.+)/i);
    action = 'type_text';
    payload = { text: stripDeviceSuffix(m?.[1] || '') };
  }
  // 5. Clique em posição específica da tela / cursor
  else if (/^(?:cliqu[ae]|toc[ae]|mov[ae]\s+o\s+mouse)\s+(?:no\s+|na\s+)?(meio|centro|topo|rodap[eé]|canto\s+superior\s+direito|canto\s+superior\s+esquerdo|canto\s+inferior\s+direito|canto\s+inferior\s+esquerdo)/i.test(clean)) {
    const pos = clean.toLowerCase();
    let x = 50, y = 50;
    if (pos.includes('topo')) { x = 50; y = 12; }
    else if (pos.includes('rodap')) { x = 50; y = 88; }
    else if (pos.includes('superior direito')) { x = 88; y = 12; }
    else if (pos.includes('superior esquerdo')) { x = 12; y = 12; }
    else if (pos.includes('inferior direito')) { x = 88; y = 88; }
    else if (pos.includes('inferior esquerdo')) { x = 12; y = 88; }
    action = 'tap_percent';
    payload = { xPct: x, yPct: y };
  }
  // 6. Clique por texto / botão na tela
  else if (/^(?:cliqu[ae]|toc[ae]|apert[ae]|pression[ae]|selecion[ae])\s+(?:em\s+|no\s+|na\s+)?(.+)/i.test(clean)) {
    const m = clean.match(/^(?:cliqu[ae]|toc[ae]|apert[ae]|pression[ae]|selecion[ae])\s+(?:em\s+|no\s+|na\s+)?(.+)/i);
    const label = stripDeviceSuffix(m?.[1] || '');
    if (/^(?:aba|painel|mem[oó]ria|configura[cç][oõ]es|conex[oõ]es)/i.test(label)) return null;
    action = 'click_text';
    payload = { text: label };
  }

  if (!action) return null;

  const requestId = `ui_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const sent = sendToDeviceById(target.id, {
    type: 'UI_CONTROL',
    requestId,
    action,
    ...payload
  });

  if (!sent) {
    return {
      handled: true,
      response: `O dispositivo ${target.label} não está conectado na rede no momento para receber comandos de tela.`
    };
  }

  const ack = await waitForSensoryAck(requestId, 3500);
  if (!ack) {
    return { handled: true, response: `Comando enviado para ${target.label}.` };
  }
  if (ack.startsWith('TEXT:')) {
    const content = ack.slice(5).trim();
    return {
      handled: true,
      response: content ? `Na tela de ${target.label} está exibido: ${content.slice(0, 600)}` : `Não encontrei textos legíveis na tela de ${target.label}.`
    };
  }
  return { handled: true, response: ack.replace(/^ACK:/, '') };
}


export async function executeDeviceUiAction(
  targetDevice: string,
  action: string,
  payload: Record<string, any> = {}
): Promise<{ ok: boolean; deviceLabel: string; output: string }> {
  const target = await resolveDeviceByPromptOrId(targetDevice || 'galaxy_s25', 'galaxy_s25');
  const requestId = `ui_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const sent = sendToDeviceById(target.id, {
    type: 'UI_CONTROL',
    requestId,
    action,
    ...payload
  });
  if (!sent) {
    return {
      ok: false,
      deviceLabel: target.label,
      output: `Dispositivo ${target.label} está offline na malha /ws no momento.`
    };
  }
  const ack = await waitForSensoryAck(requestId, 4500);
  if (!ack) return { ok: true, deviceLabel: target.label, output: `Ação '${action}' enviada para ${target.label}.` };
  if (ack.startsWith('TEXT:')) return { ok: true, deviceLabel: target.label, output: ack.slice(5).trim() || '(tela sem textos visíveis)' };
  return { ok: true, deviceLabel: target.label, output: ack.replace(/^ACK:/, '') };
}
