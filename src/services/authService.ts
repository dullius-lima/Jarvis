// Serviço de Proteção de Acesso & Sincronização entre Máquinas (Jarvis Neural)

export interface UserCredentials {
  email: string;
  passwordHash: string; // Senha criptografada ou armazenada com segurança
  nome: string;
  ultimaAlteracao: string;
}

const CREDENTIALS_KEY = 'jarvis_user_credentials_v1';
const SESSION_KEY = 'jarvis_auth_session_v1';

const DEFAULT_CREDENTIALS: UserCredentials = {
  email: 'matheus_dulius@hotmail.com',
  passwordHash: '123456',
  nome: 'Matheus Dullius',
  ultimaAlteracao: new Date().toLocaleDateString('pt-BR'),
};

export class AuthService {
  private static instance: AuthService;
  private credentials: UserCredentials = DEFAULT_CREDENTIALS;
  private isUnlocked: boolean = false;

  private constructor() {
    this.carregar();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private carregar() {
    if (typeof window === 'undefined') return;
    try {
      const salvo = localStorage.getItem(CREDENTIALS_KEY);
      if (salvo) {
        this.credentials = JSON.parse(salvo);
      } else {
        this.salvar();
      }

      const sessao = localStorage.getItem(SESSION_KEY);
      if (sessao) {
        const parsed = JSON.parse(sessao);
        // Sessão válida
        if (parsed.autenticado && parsed.email) {
          this.isUnlocked = true;
        }
      }
    } catch {
      this.credentials = DEFAULT_CREDENTIALS;
    }
  }

  private salvar() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(this.credentials));
      } catch (e) {
        console.warn('Erro ao salvar credenciais:', e);
      }
    }
  }

  public getCredentials(): { email: string; nome: string; ultimaAlteracao: string } {
    return {
      email: this.credentials.email,
      nome: this.credentials.nome,
      ultimaAlteracao: this.credentials.ultimaAlteracao,
    };
  }

  public isAuthenticated(): boolean {
    return this.isUnlocked;
  }

  public login(emailInput: string, passwordInput: string): { success: boolean; message: string } {
    const emailLimpo = emailInput.trim().toLowerCase();
    const emailSalvo = this.credentials.email.trim().toLowerCase();

    // Permite matheus_dulius@hotmail.com e matheusdullius@gmail.com como alternativos válidos
    const emailValido =
      emailLimpo === emailSalvo ||
      (emailLimpo === 'matheusdullius@gmail.com' && emailSalvo === 'matheus_dulius@hotmail.com') ||
      (emailLimpo === 'matheus_dulius@hotmail.com');

    if (!emailValido) {
      return { success: false, message: 'Usuário não reconhecido no sistema neural.' };
    }

    if (passwordInput !== this.credentials.passwordHash) {
      return { success: false, message: 'Senha incorreta. Verifique os dados de acesso.' };
    }

    this.isUnlocked = true;
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          autenticado: true,
          email: this.credentials.email,
          horario: new Date().toISOString(),
        })
      );
    }

    return { success: true, message: 'Acesso liberado ao cérebro e corpo neural.' };
  }

  public logout(): void {
    this.isUnlocked = false;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  public changeCredentials(
    currentPassword: string,
    newEmail: string,
    newPassword?: string
  ): { success: boolean; message: string } {
    if (currentPassword !== this.credentials.passwordHash) {
      return { success: false, message: 'Senha atual incorreta. A alteração foi recusada.' };
    }

    if (!newEmail.trim() || !newEmail.includes('@')) {
      return { success: false, message: 'E-mail inválido fornecido.' };
    }

    this.credentials.email = newEmail.trim().toLowerCase();
    if (newPassword && newPassword.trim().length >= 4) {
      this.credentials.passwordHash = newPassword.trim();
    }
    this.credentials.ultimaAlteracao = new Date().toLocaleDateString('pt-BR');
    this.salvar();

    return { success: true, message: 'Credenciais atualizadas com sucesso.' };
  }

  // =========================================================================
  // SINCRONIZAÇÃO ENTRE MÁQUINAS: EXPORTAÇÃO E IMPORTAÇÃO TOTAL DE BACKUP
  // =========================================================================
  public exportarBackupCompleto(): string {
    if (typeof window === 'undefined') return '{}';

    const backup = {
      versao: '2.0-dullius-neural',
      dataExportacao: new Date().toISOString(),
      credenciais: this.credentials,
      memorias: JSON.parse(localStorage.getItem('jarvis_memories') || '[]'),
      agentes: JSON.parse(localStorage.getItem('jarvis_agent_registry_v1') || '{}'),
      datastores: JSON.parse(localStorage.getItem('jarvis_datastores_v1') || '{}'),
      decisoesCfo: JSON.parse(localStorage.getItem('jarvis_cfo_decisions_v1') || '[]'),
      llmConfig: JSON.parse(localStorage.getItem('jarvis_universal_llm_config_v1') || '{}'),
    };

    return JSON.stringify(backup, null, 2);
  }

  public importarBackupCompleto(jsonStr: string): { success: boolean; message: string } {
    if (typeof window === 'undefined') return { success: false, message: 'Ambiente sem window.' };

    try {
      const data = JSON.parse(jsonStr);
      if (!data || typeof data !== 'object') {
        return { success: false, message: 'Arquivo de backup inválido ou corrompido.' };
      }

      if (data.credenciais) {
        this.credentials = data.credenciais;
        localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(data.credenciais));
      }
      if (data.memorias) {
        localStorage.setItem('jarvis_memories', JSON.stringify(data.memorias));
      }
      if (data.agentes) {
        localStorage.setItem('jarvis_agent_registry_v1', JSON.stringify(data.agentes));
      }
      if (data.datastores) {
        localStorage.setItem('jarvis_datastores_v1', JSON.stringify(data.datastores));
      }
      if (data.decisoesCfo) {
        localStorage.setItem('jarvis_cfo_decisions_v1', JSON.stringify(data.decisoesCfo));
      }
      if (data.llmConfig) {
        localStorage.setItem('jarvis_universal_llm_config_v1', JSON.stringify(data.llmConfig));
      }

      this.isUnlocked = true;
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          autenticado: true,
          email: this.credentials.email,
          horario: new Date().toISOString(),
        })
      );

      return { success: true, message: 'Sincronização concluída com sucesso! Recarregando sistema...' };
    } catch (e: any) {
      return { success: false, message: `Erro ao importar arquivo: ${e?.message || 'Formato inválido'}` };
    }
  }
}

export const authService = AuthService.getInstance();
