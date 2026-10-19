import React, { useState } from 'react';
import { authService } from '../services/authService';
import { Shield, KeyRound, Download, Upload, CheckCircle2, AlertCircle, X, RefreshCw } from 'lucide-react';

interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecuritySettingsModal: React.FC<SecuritySettingsModalProps> = ({ isOpen, onClose }) => {
  const creds = authService.getCredentials();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState(creds.email);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen) return null;

  const handleChangeCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (newPassword && newPassword !== confirmPassword) {
      setFeedback({ type: 'error', message: 'A nova senha e a confirmação não coincidem.' });
      return;
    }

    const res = authService.changeCredentials(currentPassword, newEmail, newPassword || undefined);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleExportBackup = () => {
    const jsonStr = authService.exportarBackupCompleto();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis_backup_completo_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setFeedback({ type: 'success', message: 'Backup exportado com sucesso! Guarde este arquivo para sincronizar em outras máquinas.' });
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const res = authService.importarBackupCompleto(content);
        if (res.success) {
          setFeedback({ type: 'success', message: res.message });
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        } else {
          setFeedback({ type: 'error', message: res.message });
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in select-none">
      <div className="w-full max-w-lg bg-slate-950 border border-cyan-500/40 rounded-3xl p-6 sm:p-7 shadow-[0_0_80px_rgba(6,182,212,0.25)] text-slate-100 relative overflow-hidden flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-mono tracking-wide text-cyan-200">
                Segurança, Senha & Sincronização
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Proteção com senha e transporte de dados entre máquinas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 border border-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-mono animate-in slide-in-from-top-1 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                : 'bg-red-950/80 border-red-500/50 text-red-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Formulário de Alteração de Credenciais */}
        <form onSubmit={handleChangeCredentials} className="space-y-3.5 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
          <h3 className="text-xs font-mono font-bold text-cyan-300 uppercase flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-cyan-400" />
            Alterar Senha ou Usuário
          </h3>

          <div className="space-y-2.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono text-cyan-300 uppercase">
                  E-mail de Acesso da Conta (Livre Escolha)
                </label>
                <span className="text-[9px] text-slate-400 font-mono">Qualquer e-mail</span>
              </div>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="digite-o-email-que-quiser@dominio.com"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-cyan-400"
              />
              <p className="text-[10px] text-slate-400 mt-1 font-sans">
                Você pode escolher qualquer e-mail que desejar. Todos os seus dispositivos sincronizarão sob esta mesma conta.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                  Nova Senha (Opcional)
                </label>
                <input
                  type="password"
                  placeholder="Nova senha (min. 4 carac.)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  placeholder="Repita a nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-amber-300 uppercase block mb-1">
                Senha Atual (Obrigatória para confirmar alterações):
              </label>
              <input
                type="password"
                required
                placeholder="Digite a senha atual (padrão: 123456)"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-slate-950 border border-amber-500/40 focus:border-amber-400 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-all shadow-md active:scale-98"
          >
            Salvar Novas Credenciais
          </button>
        </form>

        {/* Seção de Sincronização entre Máquinas */}
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2.5">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-mono font-bold text-slate-200 uppercase">
              Sincronização entre Máquinas (Exportar / Importar)
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
            Exporte todo o seu banco (memórias, agentes criados, credenciais e configurações) em um único arquivo JSON e importe em qualquer outro computador ou celular.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              onClick={handleExportBackup}
              className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 hover:text-white font-mono text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Backup (JSON)</span>
            </button>

            <label className="py-2.5 px-3 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 text-cyan-200 font-mono text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Importar Backup</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
