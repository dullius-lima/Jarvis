import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  X,
  Shield,
  CheckCircle2,
  Scan,
  RefreshCw,
  Send,
  UserCheck,
  Sparkles,
  Eye,
  Sliders,
} from 'lucide-react';
import { sensoryInputService, IdentityBadge, CameraFramePacket } from '../services/sensoryInputService';

interface CameraVisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFrameCaptured?: (frame: CameraFramePacket) => void;
}

export const CameraVisionModal: React.FC<CameraVisionModalProps> = ({
  isOpen,
  onClose,
  onFrameCaptured,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [currentBadge, setCurrentBadge] = useState<IdentityBadge>(() =>
    sensoryInputService.getCurrentBadge()
  );
  const [capturedFrame, setCapturedFrame] = useState<CameraFramePacket | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isSendingToN8n, setIsSendingToN8n] = useState<boolean>(false);
  const [n8nStatus, setN8nStatus] = useState<string | null>(null);

  // Iniciar câmera apenas sob demanda quando o modal abrir
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedFrame(null);
      setN8nStatus(null);
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    setCameraActive(false);

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Navegador sem suporte a captura de vídeo (getUserMedia).');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Erro ao ativar câmera sob demanda:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Permissão de acesso à webcam foi recusada pelo navegador.'
          : 'Não foi possível inicializar a webcam do dispositivo.'
      );
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const handleCaptureFrame = () => {
    if (!videoRef.current) return;
    setIsCapturing(true);

    try {
      const frame = sensoryInputService.captureWebcamFrame(videoRef.current);
      setCapturedFrame(frame);
      onFrameCaptured?.(frame);
    } catch (e) {
      console.warn('Erro ao capturar frame da webcam:', e);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSwitchProfile = (profileKey: 'matheus' | 'marina' | 'filha' | 'funcionario') => {
    const updated = sensoryInputService.switchIdentityProfile(profileKey);
    setCurrentBadge(updated);
  };

  const handleSendToN8n = async () => {
    if (!capturedFrame) return;
    setIsSendingToN8n(true);
    setN8nStatus(null);

    try {
      const packet = await sensoryInputService.dispatchToUniversalInbox({
        textCommand: `Reconhecimento facial biométrico sob demanda: ${currentBadge.name} [${currentBadge.permissionLevel}]`,
        includeCameraFrame: true,
      });

      setN8nStatus(`Injetado com sucesso no n8n (${Math.round(capturedFrame.byteSize / 1024)} KB)`);
    } catch (e) {
      setN8nStatus('Falha ao encaminhar frame para n8n.');
    } finally {
      setIsSendingToN8n(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-2xl bg-slate-950 border border-cyan-500/40 rounded-3xl p-5 shadow-[0_0_60px_rgba(6,182,212,0.25)] relative overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-cyan-500/20 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
                Visão da Câmera Sob Demanda & Biometria Facial
              </h3>
              <p className="text-xs text-slate-400">
                Ativada estritamente quando solicitado. Identifica face, crachá e permissão RBAC.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar Câmera"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport da Webcam com HUD Biométrico */}
        <div className="relative w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden border border-cyan-500/30 flex items-center justify-center shadow-inner">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
          />

          {!cameraActive && !cameraError && (
            <div className="flex flex-col items-center gap-2 text-slate-400 text-xs">
              <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
              <span>Inicializando sensor óptico da câmera...</span>
            </div>
          )}

          {cameraError && (
            <div className="p-4 text-center max-w-md">
              <p className="text-xs text-red-400 font-bold mb-2">{cameraError}</p>
              <button
                onClick={startCamera}
                className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {/* HUD Brackets Biométricos Sobrepostos */}
          {cameraActive && (
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-cyan-500/40 text-[10px] font-mono text-cyan-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>OPENCV / INSIGHTFACE ATIVO</span>
                </div>

                <div className="bg-slate-950/80 px-2.5 py-1 rounded-lg border border-cyan-500/40 text-[10px] font-mono text-amber-300">
                  JPEG q80 · Base64 ASCII
                </div>
              </div>

              {/* Mira biométrica central */}
              <div className="self-center w-48 h-48 sm:w-56 sm:h-56 border-2 border-cyan-400/60 rounded-3xl relative flex items-center justify-center animate-pulse">
                <div className="absolute -top-2 -left-2 w-5 h-5 border-t-2 border-l-2 border-cyan-400" />
                <div className="absolute -top-2 -right-2 w-5 h-5 border-t-2 border-r-2 border-cyan-400" />
                <div className="absolute -bottom-2 -left-2 w-5 h-5 border-b-2 border-l-2 border-cyan-400" />
                <div className="absolute -bottom-2 -right-2 w-5 h-5 border-b-2 border-r-2 border-cyan-400" />
                <div className="text-[10px] font-mono text-cyan-300 bg-slate-950/90 px-2 py-0.5 rounded border border-cyan-500/40">
                  TARGET: {currentBadge.name.split(' ')[0]} ({(currentBadge.confidenceScore * 100).toFixed(1)}%)
                </div>
              </div>

              <div className="text-[10px] font-mono text-slate-300 bg-slate-950/80 px-2.5 py-1 rounded-lg self-start border border-cyan-500/30">
                HASH: {currentBadge.biometricHash || 'sha256_active'}
              </div>
            </div>
          )}
        </div>

        {/* Crachá de Identidade & Seleção Rápida */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-900/70 border border-cyan-500/30 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-mono">Crachá de Identidade Reconhecido</span>
                <span className="font-bold text-slate-100">{currentBadge.name}</span>
              </div>
            </div>

            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold uppercase">
              {currentBadge.permissionLevel}
            </span>
          </div>

          {/* Troca de Perfil de Teste */}
          <div className="p-2.5 bg-slate-900/70 border border-slate-800 rounded-2xl flex items-center gap-1.5 justify-between">
            <span className="text-[10px] text-slate-400 font-mono">Simular Identidade:</span>
            <div className="flex gap-1">
              {[
                { id: 'matheus', label: 'Matheus' },
                { id: 'marina', label: 'Marina' },
                { id: 'filha', label: 'Filha' },
                { id: 'funcionario', label: 'Colab' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSwitchProfile(p.id as any)}
                  className={`px-2 py-1 rounded text-[10px] font-mono transition-all ${
                    currentBadge.userId.includes(p.id)
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Status de Envio */}
        {n8nStatus && (
          <div className="mt-2 text-xs text-center font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-1.5">
            {n8nStatus}
          </div>
        )}

        {/* Rodapé de Ações */}
        <div className="mt-4 pt-3 border-t border-cyan-500/20 flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              onClick={handleCaptureFrame}
              disabled={!cameraActive || isCapturing}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>{isCapturing ? 'Capturando...' : 'Capturar Frame (JPEG q80)'}</span>
            </button>

            {capturedFrame && (
              <button
                onClick={handleSendToN8n}
                disabled={isSendingToN8n}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs font-mono transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{isSendingToN8n ? 'Enviando...' : 'Injetar no n8n'}</span>
              </button>
            )}
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
          >
            Encerrar Câmera
          </button>
        </div>
      </div>
    </div>
  );
};
