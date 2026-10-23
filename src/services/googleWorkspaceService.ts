// Serviço de Integração Google Workspace (Sheets, Drive, Calendar, Gmail) via Firebase Auth
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
];

// Inicialização segura do app Firebase (evita re-inicialização duplicada)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => {
  provider.addScope(scope);
});

// Cache do Access Token estritamente em memória (conforme diretriz do sistema)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export class GoogleWorkspaceService {
  private static instance: GoogleWorkspaceService;
  private currentUser: User | null = null;
  private listeners: Array<(user: User | null, token: string | null) => void> = [];

  private constructor() {
    onAuthStateChanged(auth, async (user: User | null) => {
      this.currentUser = user;
      if (!user) {
        cachedAccessToken = null;
      }
      this.notify();
    });
  }

  public static getInstance(): GoogleWorkspaceService {
    if (!GoogleWorkspaceService.instance) {
      GoogleWorkspaceService.instance = new GoogleWorkspaceService();
    }
    return GoogleWorkspaceService.instance;
  }

  public getUser(): User | null {
    return this.currentUser;
  }

  public getAccessToken(): string | null {
    return cachedAccessToken;
  }

  public isAuthenticated(): boolean {
    return Boolean(this.currentUser && cachedAccessToken);
  }

  public subscribe(cb: (user: User | null, token: string | null) => void): () => void {
    this.listeners.push(cb);
    cb(this.currentUser, cachedAccessToken);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify(): void {
    this.listeners.forEach((cb) => {
      try {
        cb(this.currentUser, cachedAccessToken);
      } catch (e) {
        console.error(e);
      }
    });
  }

  /**
   * Login oficial com popup do Google Workspace
   */
  public async signIn(): Promise<{ user: User; accessToken: string }> {
    try {
      isSigningIn = true;
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);

      if (!credential?.accessToken) {
        throw new Error('Falha ao obter token de acesso do Google Workspace.');
      }

      cachedAccessToken = credential.accessToken;
      this.currentUser = result.user;
      this.notify();

      return { user: result.user, accessToken: cachedAccessToken };
    } catch (error: any) {
      console.error('Erro de autenticação Google Workspace:', error);
      throw error;
    } finally {
      isSigningIn = false;
    }
  }

  /**
   * Desconectar do Google Workspace
   */
  public async logout(): Promise<void> {
    await signOut(auth);
    cachedAccessToken = null;
    this.currentUser = null;
    this.notify();
  }

  /**
   * Exporta decisões e memórias do CFO para uma Planilha Google Sheets
   */
  public async exportToGoogleSheets(
    title: string,
    rows: Array<string[]>
  ): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
    const token = cachedAccessToken;
    if (!token) throw new Error('Não autenticado no Google Workspace.');

    // 1. Cria a planilha
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { title: `${title} - Jarvis Investimentos` },
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Falha ao criar planilha Google Sheets.');
    }

    const spreadsheet = await createRes.json();
    const spreadsheetId = spreadsheet.spreadsheetId;

    // 2. Preenche os dados
    if (rows.length > 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: rows,
          }),
        }
      );
    }

    return {
      spreadsheetId,
      spreadsheetUrl: spreadsheet.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    };
  }

  /**
   * Consulta eventos de calendário do Google Workspace
   */
  public async listCalendarEvents(): Promise<any[]> {
    const token = cachedAccessToken;
    if (!token) return [];

    try {
      const now = new Date().toISOString();
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
          now
        )}&maxResults=10&singleEvents=true&orderBy=startTime`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        const data = await res.json();
        return data.items || [];
      }
    } catch (e) {
      console.warn('Erro ao listar eventos do Google Calendar:', e);
    }
    return [];
  }

  /**
   * Exclui um evento do Google Calendar
   */
  public async deleteCalendarEvent(eventId: string): Promise<boolean> {
    const token = cachedAccessToken;
    if (!token || !eventId) return false;

    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      return res.ok || res.status === 204;
    } catch (e) {
      console.warn('Erro ao excluir evento do Google Calendar:', e);
      return false;
    }
  }

  /**
   * Consulta últimos e-mails não lidos via Gmail API
   */
  public async listUnreadEmails(): Promise<any[]> {
    const token = cachedAccessToken;
    if (!token) return [];

    try {
      const res = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=5',
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        const data = await res.json();
        return data.messages || [];
      }
    } catch (e) {
      console.warn('Erro ao consultar Gmail:', e);
    }
    return [];
  }

  /**
   * Move um e-mail do Gmail para a lixeira / exclui
   */
  public async trashEmailMessage(messageId: string): Promise<boolean> {
    const token = cachedAccessToken;
    if (!token || !messageId) return false;

    try {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/trash`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      return res.ok;
    } catch (e) {
      console.warn('Erro ao excluir mensagem no Gmail:', e);
      return false;
    }
  }

  /**
   * Exclui uma planilha ou arquivo criado no Google Drive
   */
  public async deleteDriveFile(fileId: string): Promise<boolean> {
    const token = cachedAccessToken;
    if (!token || !fileId) return false;

    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      return res.ok || res.status === 204;
    } catch (e) {
      console.warn('Erro ao excluir arquivo no Google Drive:', e);
      return false;
    }
  }
}

