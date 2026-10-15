import React, { useState } from 'react';
import { X, Play, Clock, CheckCircle2, ShieldAlert, AlertTriangle, Layers } from 'lucide-react';

interface N8nSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const N8nSimulatorModal: React.FC<N8nSimulatorModalProps> = ({ isOpen, onClose }) => {
  const [rotinaAtiva, setRotinaAtiva] = useState<'matinal' | 'noturna' | 'sentinela'>('matinal');
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  // Parâmetros para testar o sentinela cripto
  const [variacaoBtcSimulada, setVariacaoBtcSimulada] = useState<number>(1.2);
  const [precoBtcSimulado, setPrecoBtcSimulado] = useState<number>(67450);

  if (!isOpen) return null;

  const handleDispararRotina = async () => {
    setExecutando(true);
    setResultado(null);
    try {
      const res = await fetch('/api/n8n/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rotina: rotinaAtiva,
          dados: {
            delta1h: variacaoBtcSimulada,
            precoBtc: precoBtcSimulado,
          },
        }),
      });
      const data = await res.json();
      setResultado(data);
    } catch (err: any) {
      console.error(err);
      setResultado({ error: err.message || 'Erro ao executar rotina' });
    } finally {
      setExecutando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full overflow-hidden shadow-2xl">
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" /> Simulador de Orquestração n8n (3 Rotinas)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Execute e teste os 3 fluxos corporativos automatizados em tempo real.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Seletor de Rotina n8n */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => { setRotinaAtiva('matinal'); setResultado(null); }}
              className={`p-3 rounded-lg border text-left text-xs transition-all ${
                rotinaAtiva === 'matinal'
                  ? 'bg-amber-500/10 border-amber-500/60 text-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-bold text-amber-400">Rotina 1: Abertura B3</div>
              <div className="text-[11px] text-slate-400 mt-1">09:30 Seg-Sex · Cotações & Teto Bazin</div>
            </button>

            <button
              onClick={() => { setRotinaAtiva('noturna'); setResultado(null); }}
              className={`p-3 rounded-lg border text-left text-xs transition-all ${
                rotinaAtiva === 'noturna'
                  ? 'bg-pink-500/10 border-pink-500/60 text-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-bold text-pink-400">Rotina 2: Fechamento CVM</div>
              <div className="text-[11px] text-slate-400 mt-1">19:00 Seg-Sex · Fatos Relevantes & ITR</div>
            </button>

            <button
              onClick={() => { setRotinaAtiva('sentinela'); setResultado(null); }}
              className={`p-3 rounded-lg border text-left text-xs transition-all ${
                rotinaAtiva === 'sentinela'
                  ? 'bg-cyan-500/10 border-cyan-500/60 text-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-bold text-cyan-400">Rotina 3: Sentinela BTC</div>
              <div className="text-[11px] text-slate-400 mt-1">24/7 (15 min) · Silêncio vs Anomalia</div>
            </button>
          </div>

          {/* Painel de Parâmetros Específicos se for a Sentinela BTC */}
          {rotinaAtiva === 'sentinela' && (
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-xs space-y-3">
              <span className="font-bold text-slate-200">Parâmetros do Sentinela de Volatilidade:</span>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Variação em 1 Hora (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={variacaoBtcSimulada}
                    onChange={(e) => setVariacaoBtcSimulada(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-cyan-400 font-mono"
                  />
                  <span className="text-[10px] text-slate-500">Trigger de Anomalia: |Δ| ≥ 5.0%</span>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Preço BTC (USD)</label>
                  <input
                    type="number"
                    step="500"
                    value={precoBtcSimulado}
                    onChange={(e) => setPrecoBtcSimulado(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-cyan-400 font-mono"
                  />
                  <span className="text-[10px] text-slate-500">Suporte Crítico: $ 55.000</span>
                </div>
              </div>
            </div>
          )}

          {/* Botão de Disparo */}
          <button
            onClick={handleDispararRotina}
            disabled={executando}
            className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 fill-current" />
            {executando ? 'Executando Pipeline n8n...' : `Simular Disparo da Rotina (${rotinaAtiva.toUpperCase()})`}
          </button>

          {/* Resultado da Execução */}
          {resultado && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-slate-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Resultado da Execução n8n
                </span>
                <span className="text-[11px] font-mono text-slate-400">{resultado.timestamp}</span>
              </div>

              {resultado.passos_executados && (
                <div>
                  <span className="text-slate-400 font-medium">Passos Executados pelos Nós n8n:</span>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-slate-300">
                    {resultado.passos_executados.map((p: string, idx: number) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {resultado.mensagem && (
                <div
                  className={`p-3 rounded border ${
                    resultado.anomalia_detectada
                      ? 'bg-rose-950/30 border-rose-500/50 text-rose-300'
                      : 'bg-emerald-950/30 border-emerald-500/50 text-emerald-300'
                  }`}
                >
                  <span className="font-bold">Status: {resultado.status}</span>
                  <p className="mt-1">{resultado.mensagem}</p>
                </div>
              )}

              <pre className="p-2.5 bg-slate-900 rounded text-[11px] font-mono text-slate-400 overflow-x-auto">
                {JSON.stringify(resultado, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
