import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  X,
  Send,
  Play,
  Trash2,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  Database,
  RefreshCw,
  Cpu,
  Volume2,
  Radio,
  UploadCloud,
} from 'lucide-react';
import { AgentDefinition, AgentAuditResult, AgentRegistryService } from '../services/agentRegistry';
import { MicroDatastoresService } from '../services/microDatastores';
import { JarvisVoiceService } from '../services/jarvisVoice';

interface AgentTerminalModalProps {
  agent: AgentDefinition | null;
  isOpen: boolean;
  onClose: () => void;
  onAgentDeleted?: (agentId: string) => void;
  onTriggerSynapse?: (label: string) => void;
  onAutonomousAction?: (actions: any) => void;
}

interface MessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  verdict?: string;
}

export const AgentTerminalModal: React.FC<AgentTerminalModalProps> = ({
  agent,
  isOpen,
  onClose,
  onAgentDeleted,
  onTriggerSynapse,
  onAutonomousAction,
}) => {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [auditRunning, setAuditRunning] = useState(false);
  const [lastAudit, setLastAudit] = useState<AgentAuditResult | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const agentService = AgentRegistryService.getInstance();
  const microService = MicroDatastoresService.getInstance();
  const voiceService = JarvisVoiceService.getInstance();

  useEffect(() => {
    if (agent && isOpen) {
      // Inicia histórico com saudação executiva do especialista
      setMessages([
        {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `Terminal executivo ativo. Eu sou o ${agent.name} (${agent.role}). Silo isolado sob custódia: "${agent.targetDatabase}". Diretrizes carregadas com sucesso. Como posso proceder com a inteligência deste ativo?`,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setLastAudit(null);
    }
  }, [agent, isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!isOpen || !agent) return null;

  const particao = microService.obterParticao(agent.targetDatabase);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) return;

    const userMsg: MessageItem = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    if (onTriggerSynapse) {
      onTriggerSynapse(`Diálogo com ${agent.name}: "${text.slice(0, 25)}..."`);
    }

    // Se o usuário estiver fornecendo dados de API ou protocolo MCP no chat
    const isMcpOrJson = text.trim().startsWith('{') || text.toLowerCase().includes('mcp:') || text.toLowerCase().includes('protocolo mcp');
    if (isMcpOrJson) {
      try {
        const transResult = await agentService.transcribeDataToAgent(agent.id, text);
        if (transResult && transResult.memory) {
          if (onAutonomousAction) {
            onAutonomousAction({ createdMemories: [transResult.memory] });
          }
          const assistantMsg: MessageItem = {
            id: `ast-${Date.now()}`,
            role: 'assistant',
            content: `[DADOS DE API/MCP TRANSCRITOS COM SUCESSO]\nAs métricas fornecidas via chat foram destiladas e injetadas diretamente no silo "${agent.targetDatabase}".\n\n• Veredito: ${agentService.getAgent(agent.id)?.lastAuditVerdict || 'COMPRAR'}\n• Síntese Sináptica: ${transResult.memory.content}\n• Preservação de Tokens: ~${transResult.memory.tokenPreservation?.originalTokensEstimated || 3200} tokens brutos condensados em ${transResult.memory.tokenPreservation?.preservedTokensEstimated || 65} tokens (${transResult.memory.tokenPreservation?.compressionRatio || '98% de economia'}).`,
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            verdict: agentService.getAgent(agent.id)?.lastAuditVerdict,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          voiceService.speak(`Dados da API e protocolo MCP transcritos com sucesso para o agente ${agent.name}.`);
          setLoading(false);
          return;
        }
      } catch (transErr) {
        console.warn('Falha na transcrição direta MCP:', transErr);
      }
    }

    try {
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await agentService.chatWithAgent(agent.id, text, historyPayload);

      const assistantMsg: MessageItem = {
        id: `ast-${Date.now()}`,
        role: 'assistant',
        content: res.resposta || 'Comando assimilado pelo agente.',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Vocalizar resposta do especialista
      voiceService.speak(res.resposta);

      // Propagar ações autônomas se a LLM tiver emitido criação/exclusão de memórias ou agentes
      if (res.autonomousActions && onAutonomousAction) {
        onAutonomousAction(res.autonomousActions);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Falha na transmissão neural com o provedor: ${err instanceof Error ? err.message : 'Erro interno'}.`,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleExecutarAuditoriaViva = async () => {
    setAuditRunning(true);
    if (onTriggerSynapse) {
      onTriggerSynapse(`Auditoria Viva: ${agent.name}`);
    }

    try {
      const res = await agentService.delegateAudit(agent.id);
      setLastAudit(res);

      const auditMsg: MessageItem = {
        id: `aud-${Date.now()}`,
        role: 'assistant',
        content: `[PARECER DE AUDITORIA COGNITIVA]\nVeredito: ${res.verdict}\n\n${res.details}\n\nDiretrizes Recomendadas:\n${res.recommendations.map((r) => `• ${r}`).join('\n')}`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        verdict: res.verdict,
      };

      setMessages((prev) => [...prev, auditMsg]);
      voiceService.speak(`Veredito de auditoria emitido: ${res.verdict}. ${res.details}`);
    } catch (e) {
      console.warn('Erro ao executar auditoria:', e);
    } finally {
      setAuditRunning(false);
    }
  };

  const handleExcluirAgente = () => {
    if (confirm(`Tem certeza que deseja excluir o especialista "${agent.name}"? A LLM e o sistema terão total liberdade para recriá-lo se necessário.`)) {
      agentService.deleteAgent(agent.id);
      if (onAgentDeleted) onAgentDeleted(agent.id);
      if (onTriggerSynapse) onTriggerSynapse(`Agente ${agent.name} Excluído`);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-3xl h-[88vh] bg-slate-950 border border-red-500/50 rounded-3xl p-4 sm:p-6 shadow-[0_0_80px_rgba(239,68,68,0.3)] flex flex-col relative overflow-hidden text-slate-100">
        {/* Cabeçalho do Terminal */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-400 p-0.5 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.4)]">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-red-400">
                <Bot className="w-6 h-6 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100 font-mono tracking-wide">
                  {agent.name}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-950 border border-red-500/40 text-red-400 font-bold uppercase">
                  LLM Ao Vivo
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                <span>{agent.role}</span>
                <span>•</span>
                <span className="flex items-center gap-1 text-red-300">
                  <Database className="w-3 h-3 text-red-400" />
                  Silo: <strong>{agent.targetDatabase}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExcluirAgente}
              className="p-2 text-slate-500 hover:text-rose-400 rounded-xl hover:bg-rose-950/30 border border-slate-800 transition-colors"
              title="Excluir este agente com total liberdade"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 border border-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Status & Comandos Rápidos */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-900/60 border border-slate-800 mb-3 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleExecutarAuditoriaViva}
              disabled={auditRunning}
              className="px-3 py-1 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {auditRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{auditRunning ? 'Auditando...' : 'Auditar Silo'}</span>
            </button>

            <button
              onClick={() => handleSendMessage('Limpe ou marque para exclusão as memórias e dados que não fazem mais sentido ter.')}
              disabled={loading}
              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs flex items-center gap-1 transition-colors"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Limpar Obsoletos</span>
            </button>

            <button
              onClick={() => handleSendMessage(`Faça um diagnóstico completo de valuation, Bazin e solvência da partição ${agent.targetDatabase}.`)}
              disabled={loading}
              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs flex items-center gap-1 transition-colors"
            >
              <Cpu className="w-3 h-3 text-cyan-400" />
              <span>Diagnóstico Rápido</span>
            </button>
          </div>

          {particao && (
            <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Partição O(1) Conectada</span>
            </div>
          )}
        </div>

        {/* Histórico do Diálogo com a LLM do Especialista */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-2 font-mono text-xs">
          {messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in`}
              >
                <div className="text-[10px] text-slate-500 mb-1 px-1 flex items-center gap-1.5">
                  <span>{isUser ? 'Você' : agent.name}</span>
                  <span>•</span>
                  <span>{m.timestamp}</span>
                </div>
                <div
                  className={`p-3.5 rounded-2xl max-w-[90%] whitespace-pre-line leading-relaxed ${
                    isUser
                      ? 'bg-red-600 text-white rounded-tr-none shadow-md'
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none shadow-sm'
                  }`}
                >
                  {m.verdict && (
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400">VEREDITO:</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          m.verdict === 'COMPRAR'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                            : m.verdict === 'QUARENTENA'
                            ? 'bg-rose-950 text-rose-300 border-rose-500/50'
                            : 'bg-amber-950 text-amber-300 border-amber-500/50'
                        }`}
                      >
                        {m.verdict}
                      </span>
                    </div>
                  )}
                  {m.content}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono p-3 bg-slate-900/60 rounded-2xl border border-slate-800/80 w-fit">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-400" />
              <span>{agent.name} raciocinando sob suas diretrizes...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Atalhos Rápidos para Fornecimento de Dados de API / Protocolo MCP */}
        <div className="pt-2 flex items-center gap-1.5 flex-wrap text-[10px] font-mono border-t border-slate-800">
          <span className="text-slate-400 flex items-center gap-1">
            <Radio className="w-3 h-3 text-cyan-400" />
            Fornecer Dados MCP:
          </span>
          <button
            type="button"
            onClick={() => {
              setInputText(`MCP: {"ticker": "${agent.targetDatabase}", "cotacaoAtual": 34.50, "tetoBazin": 38.80, "margemSegurancaPct": 12.46, "dlEbitda": 2.1, "protocol": "MCP"}`);
            }}
            className="px-2 py-0.5 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/30 transition-colors"
          >
            + Feed MCP ({agent.targetDatabase})
          </button>
          <button
            type="button"
            onClick={() => {
              setInputText(`MCP: {"titulo": "Tesouro IPCA+ 2035", "taxaAnual": "6.35% + IPCA", "indexador": "IPCA", "risco": "Soberano", "protocol": "MCP"}`);
            }}
            className="px-2 py-0.5 rounded bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-500/30 transition-colors"
          >
            + MCP Tesouro IPCA+
          </button>
          <button
            type="button"
            onClick={() => {
              setInputText(`MCP: {"commodity": "Ouro Spot", "precoUsd": 2680.50, "curva": "Backwardation", "protocol": "MCP"}`);
            }}
            className="px-2 py-0.5 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30 transition-colors"
          >
            + MCP Commodities
          </button>
        </div>

        {/* Rodapé: Input de Mensagem para a LLM */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="mt-2 flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Comande o ${agent.name} (ex: "Exclua a memória X", "Qual a margem de segurança?", "Crie um novo sentinela")...`}
            className="flex-1 bg-slate-900 border border-slate-800 focus:border-red-500/60 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 font-sans focus:outline-none transition-colors"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !inputText.trim()}
            className="p-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-mono text-xs font-bold transition-all shadow-md flex items-center justify-center shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
