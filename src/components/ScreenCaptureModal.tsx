import React, { useState } from 'react';
import {
  Monitor,
  X,
  Send,
  Eye,
  CheckCircle2,
  FileCode,
  Sparkles,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { sensoryInputService, ScreenCapturePacket } from '../services/sensoryInputService';

interface ScreenCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureComplete?: (packet: ScreenCapturePacket) => void;
}

export const ScreenCaptureModal: React.FC<ScreenCaptureModalProps> = ({
  isOpen,
  onClose,
  onCaptureComplete,
}) => {
  const [activeAppTitle, setActiveAppTitle] = useState('Visual Studio Code · n8n Architecture');
  const [screenPacket, setScreenPacket] = useState<ScreenCapturePacket | null>(() =>
    sensoryInputService.getLastScreenCapture()
  );
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isSendingToN8n, setIsSendingToN8n] = useState<boolean>(false);
  const [n8nStatus, setN8nStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCaptureFromBrowser = async () => {
    setIsCapturing(true);
    setN8nStatus(null);
    try {
      const packet = await sensoryInputService.captureScreenFromBrowser();
      setScreenPacket(packet);
      onCaptureComplete?.(packet);
    } catch (e) {
      console.warn('Erro ao capturar tela:', e);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSimulateDesktopAgent = () => {
    setIsCapturing(true);
    setN8nStatus(null);
    try {
      const packet = sensoryInputService.generateScreenCaptureSimulation(activeAppTitle);
      setScreenPacket(packet);
      onCaptureComplete?.(packet);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSendToN8n = async () => {
    if (!screenPacket) return;
    setIsSendingToN8n(true);
    setN8nStatus(null);

    try {
      await sensoryInputService.dispatchToUniversalInbox({
        textCommand: `Análise visual da tela ativa do computador: "${screenPacket.activeAppTitle}"`,
        includeScreenCapture: true,
        activeApp: screenPacket.activeAppTitle,
      });

      setN8nStatus(`Payload JSON injetado com sucesso no n8n (${Math.round(screenPacket.byteSize / 1024)} KB em Base64 ASCII seguro)`);
    } catch (e) {
      setN8nStatus('Falha ao encaminhar payload para n8n.');
    } finally {
      setIsSendingToN8n(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-2xl bg-slate-950 border border-cyan-500/40 rounded-3xl p-5 shadow-[0_0_60px_rgba(6,182,212,0.25)] relative overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-cyan-500/20 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
                Canal de Visão Computacional (Olhos) · Desktop Agent
              </h3>
              <p className="text-xs text-slate-400">
                Monitoramento sob demanda da tela ativa para inspeção de código e documentos (JPEG q80).
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pré-visualização do Print */}
        <div className="relative w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden border border-cyan-500/30 flex items-center justify-center shadow-inner">
          {screenPacket ? (
            <img
              src={`data:image/jpeg;base64,${screenPacket.base64Ascii}`}
              alt="Print Capturado"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-400 text-xs text-center p-6">
              <Monitor className="w-8 h-8 text-cyan-400/50" />
              <span>Nenhum print de tela capturado ainda.</span>
              <span className="text-[11px] text-slate-500">
                Clique no botão abaixo para capturar sua tela real ou gerar o pacote do Desktop Agent Python.
              </span>
            </div>
          )}

          {screenPacket && (
            <div className="absolute top-2 right-2 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-cyan-500/40 text-[10px] font-mono text-cyan-300">
              {screenPacket.dimensions.width}x{screenPacket.dimensions.height} · {Math.round(screenPacket.byteSize / 1024)} KB
            </div>
          )}
        </div>

        {/* Configurações de Janela Ativa */}
        <div className="mt-4 p-3 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2 text-xs">
          <label className="block text-slate-300 font-bold font-mono">
            Título da Janela / Documento Ativo:
          </label>
          <input
            type="text"
            value={activeAppTitle}
            onChange={(e) => setActiveAppTitle(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500"
            placeholder="Ex: VS Code · /server.ts, n8n Workflow Editor, Terminal Oracle VM"
          />
        </div>

        {/* Status de Envio */}
        {n8nStatus && (
          <div className="mt-2 text-xs text-center font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-1.5">
            {n8nStatus}
          </div>
        )}

        {/* Rodapé de Ações */}
        <div className="mt-4 pt-3 border-t border-cyan-500/20 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCaptureFromBrowser}
              disabled={isCapturing}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Monitor className="w-4 h-4" />
              <span>{isCapturing ? 'Capturando...' : 'Capturar Tela Real'}</span>
            </button>

            <button
              onClick={handleSimulateDesktopAgent}
              disabled={isCapturing}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 font-bold text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FileCode className="w-4 h-4" />
              <span>Desktop Agent Python</span>
            </button>

            {screenPacket && (
              <button
                onClick={handleSendToN8n}
                disabled={isSendingToN8n}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs font-mono transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{isSendingToN8n ? 'Enviando...' : 'Injetar JSON no n8n'}</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
