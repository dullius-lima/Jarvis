/**
 * Serviço de Gerenciamento de Sessões e Estruturação de Memória Dinâmica
 * Suporta:
 * 1. Sessões Exclusivas (Session ID) para isolamento conversacional
 * 2. Memória Conversacional do Jarvis (histórico editável, exclusão e reset de contexto)
 * 3. Memória Contextual dos Especialistas (retenção de curto prazo por sessão no n8n)
 * 4. Persistência local e exportação (JSON / Markdown)
 */

export interface ChatSession {
  id: string; // ex: sess_20261018_xyz
  title: string;
  createdAt: string;
  updatedAt: string;
  agentLeaderId: string;
  status: 'ativa' | 'arquivada';
  messageCount: number;
  metadata?: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderType: 'USER' | 'JARVIS_LEADER' | 'SPECIALIST';
  senderId: string;
  senderName: string;
  content: string;
  text?: string;
  sender?: 'user' | 'jarvis' | 'specialist';
  technicalData?: Record<string, any>;
  timestamp: string;
  isEdited?: boolean;
}

export interface SpecialistContextMemory {
  id: string;
  sessionId: string;
  specialistId: string;
  specialistName: string;
  contextKey: string; // Ex: 'ultimo_ticker', 'ultimo_dispositivo', 'ultimo_relatorio'
  contextValue: any; // Ex: 'PETR4', 'luz_sala', {...}
  updatedAt: string;
  ttlSeconds?: number;
}

const STORAGE_SESSIONS_KEY = 'jarvis_chat_sessions_v1';
const STORAGE_MESSAGES_KEY = 'jarvis_chat_messages_v1';
const STORAGE_SPECIALIST_CONTEXT_KEY = 'jarvis_specialist_context_v1';
const STORAGE_ACTIVE_SESSION_KEY = 'jarvis_active_session_id_v1';

export class SessionMemoryService {
  private static instance: SessionMemoryService;
  private sessions: Record<string, ChatSession> = {};
  private messages: ChatMessage[] = [];
  private specialistContexts: SpecialistContextMemory[] = [];
  private activeSessionId: string = '';
  private listeners: Array<() => void> = [];

  private constructor() {
    this.carregar();
  }

  public static getInstance(): SessionMemoryService {
    if (!SessionMemoryService.instance) {
      SessionMemoryService.instance = new SessionMemoryService();
    }
    return SessionMemoryService.instance;
  }

  private carregar(): void {
    if (typeof window === 'undefined') return;

    try {
      const sessData = localStorage.getItem(STORAGE_SESSIONS_KEY);
      if (sessData) {
        this.sessions = JSON.parse(sessData);
      }

      const msgData = localStorage.getItem(STORAGE_MESSAGES_KEY);
      if (msgData) {
        this.messages = JSON.parse(msgData);
      }

      const ctxData = localStorage.getItem(STORAGE_SPECIALIST_CONTEXT_KEY);
      if (ctxData) {
        this.specialistContexts = JSON.parse(ctxData);
      }

      const active = localStorage.getItem(STORAGE_ACTIVE_SESSION_KEY);
      if (active && this.sessions[active]) {
        this.activeSessionId = active;
      } else {
        const sessionKeys = Object.keys(this.sessions);
        if (sessionKeys.length > 0) {
          this.activeSessionId = sessionKeys[0];
        } else {
          // Criar sessão inicial padrão se não houver nenhuma
          this.criarSessaoInicial();
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar dados de memória:', e);
      this.criarSessaoInicial();
    }
  }

  private criarSessaoInicial(): void {
    const id = this.generateSessionId();
    const agora = new Date().toISOString();
    const sessao: ChatSession = {
      id,
      title: 'Sessão Inicial · Operação Hub-and-Spoke',
      createdAt: agora,
      updatedAt: agora,
      agentLeaderId: 'jarvis-leader',
      status: 'ativa',
      messageCount: 2,
    };
    this.sessions[id] = sessao;
    this.activeSessionId = id;

    // Mensagens iniciais de contexto
    this.messages.push(
      {
        id: `msg_${Date.now()}_1`,
        sessionId: id,
        senderType: 'JARVIS_LEADER',
        senderId: 'jarvis-leader',
        senderName: 'JARVIS Líder',
        content: 'Olá! Sou o JARVIS, seu orquestrador central. Como posso auxiliar suas operações hoje?',
        timestamp: new Date().toLocaleTimeString('pt-BR'),
      },
      {
        id: `msg_${Date.now()}_2`,
        sessionId: id,
        senderType: 'USER',
        senderId: 'user_operador',
        senderName: 'Operador',
        content: 'Verifique a cotação de PETR4 e o status da automação da sala.',
        timestamp: new Date().toLocaleTimeString('pt-BR'),
      }
    );

    // Contexto de exemplo inicial dos especialistas
    this.specialistContexts.push(
      {
        id: `ctx_${Date.now()}_1`,
        sessionId: id,
        specialistId: 'especialista-financas',
        specialistName: 'Especialista em Mercado Financeiro',
        contextKey: 'ultimo_ticker',
        contextValue: 'PETR4',
        updatedAt: new Date().toLocaleTimeString('pt-BR'),
      },
      {
        id: `ctx_${Date.now()}_2`,
        sessionId: id,
        specialistId: 'especialista-automacao',
        specialistName: 'Especialista em Automação Residencial',
        contextKey: 'ultimo_dispositivo',
        contextValue: 'luz_sala',
        updatedAt: new Date().toLocaleTimeString('pt-BR'),
      }
    );

    this.salvar();
  }

  private salvar(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(this.sessions));
      localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(this.messages));
      localStorage.setItem(STORAGE_SPECIALIST_CONTEXT_KEY, JSON.stringify(this.specialistContexts));
      localStorage.setItem(STORAGE_ACTIVE_SESSION_KEY, this.activeSessionId);
    } catch (e) {
      console.warn('Erro ao salvar dados de memória no localStorage:', e);
    }
    this.notify();
  }

  public generateSessionId(): string {
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const random = Math.random().toString(36).substring(2, 7);
    return `sess_${timestamp}_${random}`;
  }

  // =========================================================================
  // 1. GERENCIAMENTO DE SESSÕES
  // =========================================================================

  public getActiveSessionId(): string {
    if (!this.activeSessionId || !this.sessions[this.activeSessionId]) {
      const keys = Object.keys(this.sessions);
      if (keys.length > 0) {
        this.activeSessionId = keys[0];
      } else {
        const nova = this.createSession('Nova Sessão');
        return nova.id;
      }
    }
    return this.activeSessionId;
  }

  public getActiveSession(): ChatSession | undefined {
    const id = this.getActiveSessionId();
    return this.sessions[id];
  }

  public listSessions(): ChatSession[] {
    return Object.values(this.sessions).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public createSession(title?: string, metadata?: Record<string, any>): ChatSession {
    const id = this.generateSessionId();
    const agora = new Date().toISOString();
    const sessao: ChatSession = {
      id,
      title: title?.trim() || `Sessão ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR').slice(0, 5)}`,
      createdAt: agora,
      updatedAt: agora,
      agentLeaderId: 'jarvis-leader',
      status: 'ativa',
      messageCount: 0,
      metadata,
    };

    this.sessions[id] = sessao;
    this.activeSessionId = id;
    this.salvar();
    return sessao;
  }

  public switchSession(sessionId: string): boolean {
    if (!this.sessions[sessionId]) return false;
    this.activeSessionId = sessionId;
    this.salvar();
    return true;
  }

  public renameSession(sessionId: string, newTitle: string): boolean {
    if (!this.sessions[sessionId] || !newTitle.trim()) return false;
    this.sessions[sessionId].title = newTitle.trim();
    this.sessions[sessionId].updatedAt = new Date().toISOString();
    this.salvar();
    return true;
  }

  public deleteSession(sessionId: string): boolean {
    if (!this.sessions[sessionId]) return false;

    // Remover mensagens e contextos atrelados à sessão
    delete this.sessions[sessionId];
    this.messages = this.messages.filter((m) => m.sessionId !== sessionId);
    this.specialistContexts = this.specialistContexts.filter((c) => c.sessionId !== sessionId);

    if (this.activeSessionId === sessionId) {
      const restantes = Object.keys(this.sessions);
      if (restantes.length > 0) {
        this.activeSessionId = restantes[0];
      } else {
        this.criarSessaoInicial();
      }
    }

    this.salvar();
    return true;
  }

  // =========================================================================
  // 2. MEMÓRIA CONVERSACIONAL DO JARVIS (MENSAGENS)
  // =========================================================================

  public getSessionMessages(sessionId?: string): ChatMessage[] {
    const targetSessionId = sessionId || this.getActiveSessionId();
    return this.messages.filter((m) => m.sessionId === targetSessionId);
  }

  public addMessage(
    senderType: 'USER' | 'JARVIS_LEADER' | 'SPECIALIST',
    senderName: string,
    content: string,
    technicalData?: Record<string, any>,
    sessionIdParam?: string
  ): ChatMessage {
    const sessionId = sessionIdParam || this.getActiveSessionId();
    const novaMensagem: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sessionId,
      senderType,
      senderId: senderType === 'JARVIS_LEADER' ? 'jarvis-leader' : senderType === 'USER' ? 'user' : 'specialist',
      senderName,
      content,
      technicalData,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
    };

    this.messages.push(novaMensagem);

    // Atualizar contador e timestamp da sessão
    if (this.sessions[sessionId]) {
      this.sessions[sessionId].messageCount = this.messages.filter((m) => m.sessionId === sessionId).length;
      this.sessions[sessionId].updatedAt = new Date().toISOString();
    }

    this.salvar();
    return novaMensagem;
  }

  public editMessage(messageId: string, newContent: string): boolean {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg) return false;
    msg.content = newContent;
    msg.isEdited = true;
    this.salvar();
    return true;
  }

  public deleteMessage(messageId: string): boolean {
    const index = this.messages.findIndex((m) => m.id === messageId);
    if (index === -1) return false;
    const sessionId = this.messages[index].sessionId;
    this.messages.splice(index, 1);

    if (this.sessions[sessionId]) {
      this.sessions[sessionId].messageCount = this.messages.filter((m) => m.sessionId === sessionId).length;
    }

    this.salvar();
    return true;
  }

  /**
   * Limpar toda a memória de conversação do Jarvis da sessão (resetar contexto do chat)
   */
  public clearSessionMemory(sessionId?: string): void {
    const targetSessionId = sessionId || this.getActiveSessionId();
    this.messages = this.messages.filter((m) => m.sessionId !== targetSessionId);

    if (this.sessions[targetSessionId]) {
      this.sessions[targetSessionId].messageCount = 0;
      this.sessions[targetSessionId].updatedAt = new Date().toISOString();
    }

    this.salvar();
  }

  // =========================================================================
  // 3. MEMÓRIA CONTEXTUAL DOS ESPECIALISTAS (SUBORDINADOS N8N)
  // =========================================================================

  public getSpecialistContext(specialistId?: string, sessionIdParam?: string): SpecialistContextMemory[] {
    const sessionId = sessionIdParam || this.getActiveSessionId();
    return this.specialistContexts.filter((c) => {
      const matchSession = c.sessionId === sessionId;
      if (!matchSession) return false;
      if (specialistId) return c.specialistId === specialistId;
      return true;
    });
  }

  public setSpecialistContext(
    specialistId: string,
    specialistName: string,
    contextKey: string,
    contextValue: any,
    sessionIdParam?: string
  ): SpecialistContextMemory {
    const sessionId = sessionIdParam || this.getActiveSessionId();
    const existing = this.specialistContexts.find(
      (c) => c.sessionId === sessionId && c.specialistId === specialistId && c.contextKey === contextKey
    );

    if (existing) {
      existing.contextValue = contextValue;
      existing.updatedAt = new Date().toLocaleTimeString('pt-BR');
      this.salvar();
      return existing;
    }

    const novo: SpecialistContextMemory = {
      id: `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sessionId,
      specialistId,
      specialistName,
      contextKey,
      contextValue,
      updatedAt: new Date().toLocaleTimeString('pt-BR'),
    };

    this.specialistContexts.push(novo);
    this.salvar();
    return novo;
  }

  public deleteSpecialistContext(contextId: string): boolean {
    const index = this.specialistContexts.findIndex((c) => c.id === contextId);
    if (index === -1) return false;
    this.specialistContexts.splice(index, 1);
    this.salvar();
    return true;
  }

  public clearSpecialistContextsForSession(sessionId?: string, specialistId?: string): void {
    const targetSessionId = sessionId || this.getActiveSessionId();
    if (specialistId) {
      this.specialistContexts = this.specialistContexts.filter(
        (c) => !(c.sessionId === targetSessionId && c.specialistId === specialistId)
      );
    } else {
      this.specialistContexts = this.specialistContexts.filter((c) => c.sessionId !== targetSessionId);
    }
    this.salvar();
  }

  // =========================================================================
  // 4. EXPORTAÇÃO DE HISTÓRICO DE MEMÓRIA (JSON / MARKDOWN)
  // =========================================================================

  public exportSession(sessionId?: string, format: 'json' | 'markdown' = 'json'): string {
    const targetSessionId = sessionId || this.getActiveSessionId();
    const session = this.sessions[targetSessionId];
    const msgs = this.getSessionMessages(targetSessionId);
    const ctx = this.getSpecialistContext(undefined, targetSessionId);

    if (format === 'json') {
      return JSON.stringify(
        {
          session,
          messages: msgs,
          specialistContexts: ctx,
          exportedAt: new Date().toISOString(),
        },
        null,
        2
      );
    }

    // Markdown format
    let md = `# HISTÓRICO DE MEMÓRIA CONVERSACIONAL E CONTEXTUAL\n\n`;
    md += `* **Session ID**: \`${session?.id}\`\n`;
    md += `* **Título**: ${session?.title}\n`;
    md += `* **Criado em**: ${session?.createdAt}\n`;
    md += `* **Mensagens**: ${msgs.length}\n\n`;
    md += `## 💬 Histórico de Conversação (Jarvis Líder)\n\n`;

    msgs.forEach((m) => {
      md += `### [${m.timestamp}] ${m.senderName} (${m.senderType}):\n`;
      md += `${m.content}\n`;
      if (m.technicalData) {
        md += `\n\`\`\`json\n${JSON.stringify(m.technicalData, null, 2)}\n\`\`\`\n`;
      }
      md += `\n---\n\n`;
    });

    if (ctx.length > 0) {
      md += `## 🧩 Memória Contextual dos Especialistas Subordinados\n\n`;
      ctx.forEach((c) => {
        md += `* **${c.specialistName}** (\`${c.contextKey}\`): \`${JSON.stringify(c.contextValue)}\` *(Atualizado: ${c.updatedAt})*\n`;
      });
    }

    return md;
  }

  // =========================================================================
  // REATIVIDADE
  // =========================================================================

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('Erro em listener do SessionMemoryService:', err);
      }
    });
  }
}

export const sessionMemoryService = SessionMemoryService.getInstance();
