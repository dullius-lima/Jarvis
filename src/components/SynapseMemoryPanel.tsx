import React, { useState } from 'react';
import { SynapseMemory, FamilyProfile, FAMILY_PROFILES, MemoryCategory } from '../types/neural';
import { Brain, Plus, Sparkles, Filter, X, Trash2, Zap, User, Clock, ShieldCheck } from 'lucide-react';

interface SynapseMemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  memories: SynapseMemory[];
  onAddMemory: (mem: Omit<SynapseMemory, 'id' | 'coords' | 'firing' | 'connectionsCount'>) => void;
  onDeleteMemory: (id: string) => void;
  onSelectMemory: (mem: SynapseMemory) => void;
  activeProfile: FamilyProfile;
}

export const SynapseMemoryPanel: React.FC<SynapseMemoryPanelProps> = ({
  isOpen,
  onClose,
  memories,
  onAddMemory,
  onDeleteMemory,
  onSelectMemory,
  activeProfile,
}) => {
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas');
  const [usuarioFiltro, setUsuarioFiltro] = useState<string>('todos');
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoConteudo, setNovoConteudo] = useState('');
  const [novaCategoria, setNovaCategoria] = useState<MemoryCategory>('investimento');
  const [novoUsuario, setNovoUsuario] = useState<string>(activeProfile.name);
  const [mostrarForm, setMostrarForm] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoTitulo.trim() || !novoConteudo.trim()) return;

    onAddMemory({
      title: novoTitulo.trim(),
      content: novoConteudo.trim(),
      category: novaCategoria,
      user: novoUsuario,
      timestamp: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
      importance: 'alta',
      color: novaCategoria === 'investimento' ? 0x06b6d4 : (novaCategoria === 'saude' ? 0xec4899 : 0x10b981),
    });

    setNovoTitulo('');
    setNovoConteudo('');
    setMostrarForm(false);
  };

  const memoriasFiltradas = memories.filter((m) => {
    if (categoriaFiltro !== 'todas' && m.category !== categoriaFiltro) return false;
    if (usuarioFiltro !== 'todos' && m.user !== usuarioFiltro) return false;
    return true;
  });

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-slate-950/95 border-l border-cyan-500/30 shadow-[0_0_80px_rgba(6,182,212,0.2)] backdrop-blur-xl flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Banco de Memórias & Sinapses
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              {memories.length} sinapses ativas no cérebro
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Botão de Adicionar Nova Sinapse */}
      <div className="p-4 border-b border-slate-800/80 bg-slate-900/40">
        {!mostrarForm ? (
          <button
            onClick={() => setMostrarForm(true)}
            className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Gravar Nova Memória no Cérebro
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 bg-slate-950 p-3.5 rounded-xl border border-cyan-500/40">
            <div className="flex items-center justify-between text-xs text-cyan-400 font-bold font-mono">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Nova Sinapse Neural
              </span>
              <button
                type="button"
                onClick={() => setMostrarForm(false)}
                className="text-slate-500 hover:text-slate-300 text-[11px]"
              >
                Cancelar
              </button>
            </div>

            <input
              type="text"
              placeholder="Título da Memória ou Fato..."
              value={novoTitulo}
              onChange={(e) => setNovoTitulo(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              required
            />

            <textarea
              placeholder="Instrução, rotina, valor de Bazin, compromisso da família..."
              value={novoConteudo}
              onChange={(e) => setNovoConteudo(e.target.value)}
              rows={2}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              required
            />

            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={novaCategoria}
                onChange={(e) => setNovaCategoria(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 font-mono text-[11px]"
              >
                <option value="investimento">Investimentos & Bazin</option>
                <option value="cfo">CFO & Solvência</option>
                <option value="saude">Saúde & Bem-Estar</option>
                <option value="familia">Rotina da Família</option>
                <option value="seguranca">Sentinela & Cripto</option>
                <option value="aprendizado">Aprendizado Geral</option>
              </select>

              <select
                value={novoUsuario}
                onChange={(e) => setNovoUsuario(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300 font-mono text-[11px]"
              >
                {FAMILY_PROFILES.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" /> Criar Conexão Sináptica
            </button>
          </form>
        )}
      </div>

      {/* Filtros Rápidos */}
      <div className="p-3 border-b border-slate-800 flex gap-2 overflow-x-auto text-xs font-mono">
        <button
          onClick={() => setCategoriaFiltro('todas')}
          className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
            categoriaFiltro === 'todas' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200 bg-slate-900'
          }`}
        >
          Todas
        </button>
        <button
          onClick={() => setCategoriaFiltro('investimento')}
          className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
            categoriaFiltro === 'investimento' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200 bg-slate-900'
          }`}
        >
          Investimentos
        </button>
        <button
          onClick={() => setCategoriaFiltro('saude')}
          className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
            categoriaFiltro === 'saude' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200 bg-slate-900'
          }`}
        >
          Saúde
        </button>
        <button
          onClick={() => setCategoriaFiltro('familia')}
          className={`px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
            categoriaFiltro === 'familia' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200 bg-slate-900'
          }`}
        >
          Família
        </button>
      </div>

      {/* Lista de Memórias Sinápticas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {memoriasFiltradas.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            Nenhuma memória registrada nesta categoria.
          </div>
        ) : (
          memoriasFiltradas.map((mem) => (
            <div
              key={mem.id}
              onClick={() => onSelectMemory(mem)}
              className="p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition-all relative group shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  {mem.category} · {mem.user}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteMemory(mem.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 rounded transition-all"
                  title="Excluir sinapse"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <h4 className="text-xs font-bold text-slate-100 mt-1">{mem.title}</h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{mem.content}</p>

              <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {mem.timestamp}
                </span>
                <span className="text-cyan-400 font-semibold">{mem.connectionsCount} conexões neurais</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
