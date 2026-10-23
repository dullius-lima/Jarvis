import React, { useState, useEffect } from 'react';
import { GoogleWorkspaceService } from '../services/googleWorkspaceService';
import { cfoDecisionService, DecisaoAutonomaCFO } from '../services/cfoDecisionService';
import {
  FileSpreadsheet,
  Calendar,
  Mail,
  FolderOpen,
  AlertCircle,
  X,
  LogOut,
  RefreshCw,
  Download,
  Trash2,
} from 'lucide-react';

interface GoogleWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerSynapse?: (label: string) => void;
}

export const GoogleWorkspaceModal: React.FC<GoogleWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onTriggerSynapse,
}) => {
  const workspaceService = GoogleWorkspaceService.getInstance();
  const [user, setUser] = useState(() => workspaceService.getUser());
  const [token, setToken] = useState(() => workspaceService.getAccessToken());
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados de Operação
  const [isExporting, setIsExporting] = useState(false);
  const [exportedSheetId, setExportedSheetId] = useState<string | null>(null);
  const [exportedSheetUrl, setExportedSheetUrl] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [unreadEmails, setUnreadEmails] = useState<any[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);

  useEffect(() => {
    return workspaceService.subscribe((u, t) => {
      setUser(u);
      setToken(t);
    });
  }, [workspaceService]);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setErrorMsg(null);
    onTriggerSynapse?.('Autenticando com Google Workspace...');

    try {
      const res = await workspaceService.signIn();
      onTriggerSynapse?.(`Google Workspace conectado: ${res.user.email}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao autenticar com o Google Workspace.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await workspaceService.logout();
    onTriggerSynapse?.('Google Workspace desconectado.');
  };

  const handleExportSheets = async () => {
    if (!token) return;
    setIsExporting(true);
    setErrorMsg(null);
    onTriggerSynapse?.('Exportando decisões e auditorias para o Google Sheets...');

    try {
      const decisoes = cfoDecisionService.listarDecisoes();
      const rows = [
        ['ID', 'Data/Hora', 'Ativo/Alvo', 'Tipo de Ação', 'Título', 'Detalhes', 'Impacto'],
        ...decisoes.map((d: DecisaoAutonomaCFO) => [
          d.id,
          d.dataFormatada,
          d.ativoOuAlvo,
          d.tipoAcao,
          d.titulo,
          d.detalhesExecutivos,
          d.impacto,
        ]),
      ];

      const res = await workspaceService.exportToGoogleSheets(
        `Auditoria CFO Holding Dullius (${new Date().toLocaleDateString('pt-BR')})`,
        rows
      );

      setExportedSheetId(res.spreadsheetId);
      setExportedSheetUrl(res.spreadsheetUrl);
      onTriggerSynapse?.('Planilha criada no Google Sheets com sucesso!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao exportar para o Google Sheets.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteExportedSheet = async () => {
    if (!exportedSheetId) return;
    await workspaceService.deleteDriveFile(exportedSheetId);
    setExportedSheetId(null);
    setExportedSheetUrl(null);
    onTriggerSynapse?.('Planilha removida do Google Drive com sucesso.');
  };

  const handleLoadCalendar = async () => {
    if (!token) return;
    setLoadingCalendar(true);
    try {
      const events = await workspaceService.listCalendarEvents();
      setCalendarEvents(events);
      onTriggerSynapse?.(`${events.length} eventos sincronizados do Google Calendar.`);
    } catch (err: any) {
      console.warn(err);
    } finally {
      setLoadingCalendar(false);
    }
  };

  const handleDeleteCalendarEvent = async (eventId: string) => {
    await workspaceService.deleteCalendarEvent(eventId);
    setCalendarEvents((prev) => prev.filter((ev) => ev.id !== eventId));
    onTriggerSynapse?.('Evento excluído do Google Calendar.');
  };

  const handleLoadGmail = async () => {
    if (!token) return;
    setLoadingEmails(true);
    try {
      const msgs = await workspaceService.listUnreadEmails();
      setUnreadEmails(msgs);
      onTriggerSynapse?.(`${msgs.length} mensagens carregadas do Gmail.`);
    } catch (err: any) {
      console.warn(err);
    } finally {
      setLoadingEmails(false);
    }
  };

  const handleTrashGmailMessage = async (msgId: string) => {
    await workspaceService.trashEmailMessage(msgId);
    setUnreadEmails((prev) => prev.filter((m) => m.id !== msgId));
    onTriggerSynapse?.('E-mail movido para a lixeira do Gmail.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-blue-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <FolderOpen className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Conexão Google Workspace (Com Opções de Exclusão)
                </h2>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                  user && token
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}>
                  {user && token ? 'Conectado' : 'Aguardando Login'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Google Sheets, Google Drive, Google Calendar e Gmail integrados aos agentes do Jarvis
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!user || !token ? (
            <div className="bg-slate-950/50 p-8 rounded-2xl border border-slate-800 text-center space-y-5 max-w-md mx-auto">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-1">
                  Conecte sua conta do Google Workspace
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Permita que o Jarvis registre deliberações em planilhas Google Sheets, consulte/exclua eventos de calendário e gerencie e-mails executivos com segurança.
                </p>
              </div>

              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={isLoggingIn}
                  className="flex items-center gap-3 px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-800 font-medium text-xs rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                  <span>{isLoggingIn ? 'Conectando...' : 'Entrar com o Google'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Usuário Conectado */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || 'Google'} className="w-10 h-10 rounded-full border border-blue-500/40" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                      {user.email?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-white">{user.displayName || 'Usuário Google'}</h4>
                    <p className="text-[11px] font-mono text-slate-400">{user.email}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-1.5 text-xs text-rose-400 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Desconectar
                </button>
              </div>

              {/* Ações do Google Workspace */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Card Google Sheets */}
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                    <h4 className="text-xs font-bold text-white">Google Sheets & Drive</h4>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Exporte decisões para planilha Google Sheets ou exclua planilhas criadas.
                  </p>

                  <button
                    type="button"
                    onClick={handleExportSheets}
                    disabled={isExporting}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Download className={`w-3.5 h-3.5 ${isExporting ? 'animate-spin' : ''}`} />
                    {isExporting ? 'Criando...' : 'Exportar para o Sheets'}
                  </button>

                  {exportedSheetUrl && (
                    <div className="space-y-1.5">
                      <a
                        href={exportedSheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-[11px] text-emerald-300 font-mono text-center hover:bg-emerald-900/60 transition-colors"
                      >
                        Abrir Planilha Criada ↗
                      </a>
                      <button
                        type="button"
                        onClick={handleDeleteExportedSheet}
                        className="w-full py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 text-[11px] font-mono flex items-center justify-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Excluir Planilha do Drive
                      </button>
                    </div>
                  )}
                </div>

                {/* Card Google Calendar */}
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-400" />
                    <h4 className="text-xs font-bold text-white">Google Calendar</h4>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Sincronize ou exclua eventos e compromissos da agenda.
                  </p>

                  <button
                    type="button"
                    onClick={handleLoadCalendar}
                    disabled={loadingCalendar}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingCalendar ? 'animate-spin' : ''}`} />
                    {loadingCalendar ? 'Sincronizando...' : 'Carregar Agenda'}
                  </button>

                  {calendarEvents.length > 0 && (
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pt-1">
                      {calendarEvents.map((ev, i) => (
                        <div key={ev.id || i} className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 flex items-center justify-between gap-2">
                          <div className="truncate">
                            <strong>{ev.summary || 'Sem título'}</strong>
                            <div className="text-slate-500 text-[9px]">{ev.start?.dateTime || ev.start?.date}</div>
                          </div>
                          {ev.id && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCalendarEvent(ev.id)}
                              className="p-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 shrink-0"
                              title="Excluir evento"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Gmail */}
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-rose-400" />
                    <h4 className="text-xs font-bold text-white">Gmail (Caixa de Entrada)</h4>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Liste e-mails não lidos e mova mensagens indesejadas para a lixeira.
                  </p>

                  <button
                    type="button"
                    onClick={handleLoadGmail}
                    disabled={loadingEmails}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingEmails ? 'animate-spin' : ''}`} />
                    {loadingEmails ? 'Consultando...' : 'Listar E-mails Não Lidos'}
                  </button>

                  {unreadEmails.length > 0 && (
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pt-1">
                      {unreadEmails.map((msg) => (
                        <div key={msg.id} className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 flex items-center justify-between gap-2">
                          <span className="font-mono truncate">ID: {msg.id}</span>
                          <button
                            type="button"
                            onClick={() => handleTrashGmailMessage(msg.id)}
                            className="p-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 shrink-0 flex items-center gap-1"
                            title="Excluir / Mover para Lixeira"
                          >
                            <Trash2 className="w-3 h-3" /> Excluir
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

