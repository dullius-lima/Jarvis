import React, { useState } from 'react';
import { authService } from '../services/authService';
import { Lock, KeyRound, Shield, AlertCircle, ArrowRight, Upload, Sparkles, UserCheck } from 'lucide-react';

interface AuthLockScreenProps {
  onUnlock: () => void;
}

export const AuthLockScreen: React.FC<AuthLockScreenProps> = ({ onUnlock }) => {
  const [email, setEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('jarvis_sync_account_email');
      if (stored) return stored;
    }
    return authService.getCredentials().email || 'matheusdullius@gmail.com';
  });
  const [password, setPassword] = useState('123456');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    setTimeout(() => {
      const res = authService.login(email, password);
      if (res.success) {
        onUnlock();
      } else {
        setErrorMsg(res.message);
      }
      setLoading(false);
    }, 250);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const res = authService.importarBackupCompleto(content);
        if (res.success) {
          setImportFeedback('Sincronização bem-sucedida! Recarregando sistema...');
          setTimeout(() => {
            window.location.reload();
          }, 800);
        } else {
          setErrorMsg(res.message);
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl select-none">
      <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-cyan-500/30 shadow-[0_0_80px_rgba(6,182,212,0.2)] text-white relative overflow-hidden">
        {/* Glow de fundo */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-red-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-3.5 rounded-2xl bg-cyan-950/80 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_30px_rgba(34,211,238,0.3)]">
            <Lock className="w-8 h-8 text-cyan-400 animate-pulse" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono tracking-wider text-white">
            JARVIS NEURAL CORE
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Sistema de Proteção & Acesso Biométrico
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-[10px] text-cyan-300 font-mono">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Liberdade Total: Use qualquer e-mail que desejar</span>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-500/50 flex items-center gap-2.5 text-xs text-red-200 animate-shake">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {importFeedback && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 flex items-center gap-2.5 text-xs text-emerald-200">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{importFeedback}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-mono text-cyan-300 uppercase flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                E-mail de Acesso (Livre Escolha)
              </label>
              <span className="text-[10px] text-slate-400 font-mono">Qualquer e-mail</span>
            </div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Digite o e-mail que desejar: seu@email.com"
              className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 font-mono outline-none transition-colors"
            />
            {/* Atalhos rápidos de troca de conta */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400">
              <span>Atalhos:</span>
              <button
                type="button"
                onClick={() => setEmail('matheusdullius@gmail.com')}
                className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 cursor-pointer transition-colors"
              >
                matheusdullius@gmail.com
              </button>
              <button
                type="button"
                onClick={() => setEmail('matheus_dulius@hotmail.com')}
                className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 cursor-pointer transition-colors"
              >
                hotmail
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-mono text-cyan-300 uppercase flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                Senha de Segurança
              </label>
              <span className="text-[10px] text-slate-400 font-mono">Padrão: 123456</span>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha de acesso (padrão: 123456)"
              className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 font-mono outline-none transition-colors"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all cursor-pointer active:scale-98 disabled:opacity-50"
            >
              <span>{loading ? 'Validando Acesso...' : 'Desbloquear Cérebro Neural'}</span>
              <ArrowRight className="w-4 h-4 text-cyan-200" />
            </button>
          </div>
        </form>

        {/* Sincronização entre Máquinas via Backup */}
        <div className="mt-6 pt-4 border-t border-slate-800 text-center">
          <p className="text-[11px] text-slate-400 mb-2 font-mono">
            Problemas de sincronização em outra máquina?
          </p>
          <label className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-mono cursor-pointer border border-cyan-500/30 hover:border-cyan-400 px-3 py-1.5 rounded-lg bg-cyan-950/40 transition-colors">
            <Upload className="w-3.5 h-3.5" />
            <span>Importar Backup Completo (JSON)</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
