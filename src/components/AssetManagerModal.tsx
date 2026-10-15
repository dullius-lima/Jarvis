import React, { useState } from 'react';
import { Ativo, ClasseAtivo } from '../types';
import { X, Plus, Save, Trash2, CheckCircle2 } from 'lucide-react';

interface AssetManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  ativos: Ativo[];
  onSalvarAtivo: (ativo: Ativo) => void;
  onExcluirAtivo: (id: string) => void;
}

export const AssetManagerModal: React.FC<AssetManagerModalProps> = ({
  isOpen,
  onClose,
  ativos,
  onSalvarAtivo,
  onExcluirAtivo,
}) => {
  const [ticker, setTicker] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [classe, setClasse] = useState<ClasseAtivo>('ACOES_B3');
  const [setor, setSetor] = useState('Utilidade Pública');
  const [subsetor, setSubsetor] = useState('Energia Elétrica');
  const [cotacaoAtual, setCotacaoAtual] = useState(30.0);
  const [alocacaoAlvo, setAlocacaoAlvo] = useState(10.0);
  const [quantidade, setQuantidade] = useState(100);
  const [precoMedio, setPrecoMedio] = useState(28.0);
  const [notaGovernanca, setNotaGovernanca] = useState(10);
  const [sucessoMsg, setSucessoMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim() || !nomeEmpresa.trim()) return;

    // Gerar demonstrativo base de 10 anos sintético para o novo ativo
    const novoAtivo: Ativo = {
      id: `ativo-${Date.now()}`,
      ticker: ticker.toUpperCase().trim(),
      nome_empresa: nomeEmpresa.trim(),
      classe,
      setor,
      subsetor,
      cotacao_atual: cotacaoAtual,
      alocacao_alvo_pct: alocacaoAlvo,
      alocacao_atual_pct: 0,
      quantidade,
      preco_medio: precoMedio,
      nota_governanca: notaGovernanca,
      em_quarentena: false,
      demonstrativos: [
        { ano: 2021, dpa_bruto: cotacaoAtual * 0.065, dpa_ajustado: cotacaoAtual * 0.065, lpa: cotacaoAtual * 0.12, vpa: cotacaoAtual * 0.8, lucro_liquido: 1000, fco: 1100, divida_liquida: 2000, patrimonio_liquido: 5000 },
        { ano: 2022, dpa_bruto: cotacaoAtual * 0.07, dpa_ajustado: cotacaoAtual * 0.07, lpa: cotacaoAtual * 0.13, vpa: cotacaoAtual * 0.85, lucro_liquido: 1150, fco: 1250, divida_liquida: 2200, patrimonio_liquido: 5500 },
        { ano: 2023, dpa_bruto: cotacaoAtual * 0.072, dpa_ajustado: cotacaoAtual * 0.072, lpa: cotacaoAtual * 0.14, vpa: cotacaoAtual * 0.9, lucro_liquido: 1280, fco: 1350, divida_liquida: 2400, patrimonio_liquido: 6100 },
        { ano: 2024, dpa_bruto: cotacaoAtual * 0.075, dpa_ajustado: cotacaoAtual * 0.075, lpa: cotacaoAtual * 0.15, vpa: cotacaoAtual * 0.95, lucro_liquido: 1400, fco: 1500, divida_liquida: 2500, patrimonio_liquido: 6800 },
      ],
    };

    onSalvarAtivo(novoAtivo);
    setSucessoMsg(`Ativo ${novoAtivo.ticker} cadastrado com sucesso!`);
    setTimeout(() => {
      setSucessoMsg('');
      setTicker('');
      setNomeEmpresa('');
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl">
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-amber-400" /> Cadastro Dinâmico de Ativos (100% Data-Driven)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Adicione qualquer ativo da B3, Renda Fixa ou Cripto sem alterar código.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-6">
          {sucessoMsg && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{sucessoMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Ticker / Código</label>
                <input
                  type="text"
                  placeholder="Ex: ITUB4, VDDN3, SAPR11"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 uppercase font-mono focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Nome da Empresa / Título</label>
                <input
                  type="text"
                  placeholder="Ex: Itaú Unibanco Holding S.A."
                  value={nomeEmpresa}
                  onChange={(e) => setNomeEmpresa(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Classe de Ativo</label>
                <select
                  value={classe}
                  onChange={(e) => setClasse(e.target.value as ClasseAtivo)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                >
                  <option value="ACOES_B3">Ações B3</option>
                  <option value="RENDA_FIXA">Renda Fixa / Títulos</option>
                  <option value="CRIPTO">Criptoativos / BTC</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Setor Econômico</label>
                <input
                  type="text"
                  value={setor}
                  onChange={(e) => setSetor(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Cotação Atual (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={cotacaoAtual}
                  onChange={(e) => setCotacaoAtual(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Alocação-Alvo na Carteira (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={alocacaoAlvo}
                  onChange={(e) => setAlocacaoAlvo(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Quantidade em Custódia</label>
                <input
                  type="number"
                  value={quantidade}
                  onChange={(e) => setQuantidade(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Preço Médio (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={precoMedio}
                  onChange={(e) => setPrecoMedio(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" /> Salvar Ativo no Banco de Dados
            </button>
          </form>

          {/* Ativos Atuais Cadastrados */}
          <div>
            <h4 className="text-xs font-bold text-slate-300 mb-2">Ativos Atualmente Cadastrados na Carteira</h4>
            <div className="space-y-2">
              {ativos.map((at) => (
                <div
                  key={at.id}
                  className="flex items-center justify-between p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-100 font-mono">{at.ticker}</span>
                    <span className="text-slate-400 ml-2">{at.nome_empresa}</span>
                    <span className="text-slate-500 ml-2 font-mono">({at.alocacao_alvo_pct}% alvo)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-slate-300">R$ {at.cotacao_atual.toFixed(2)}</span>
                    {ativos.length > 3 && (
                      <button
                        onClick={() => onExcluirAtivo(at.id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
