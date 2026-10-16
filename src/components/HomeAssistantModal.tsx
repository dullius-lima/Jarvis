import React, { useState, useEffect } from 'react';
import { HomeAssistantService, HomeAssistantEntity, HomeAssistantConfig } from '../services/homeAssistantService';
import {
  Home,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Power,
  Sliders,
  Thermometer,
  Lightbulb,
  Lock,
  Unlock,
  Server,
  Zap,
  Activity,
  Key,
  Globe,
  Radio,
  Sparkles,
  Play
} from 'lucide-react';

interface HomeAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerSynapse?: (label: string) => void;
}

export const HomeAssistantModal: React.FC<HomeAssistantModalProps> = ({
  isOpen,
  onClose,
  onTriggerSynapse,
}) => {
  const haService = HomeAssistantService.getInstance();
  const [config, setConfig] = useState<HomeAssistantConfig>(() => haService.getConfig());
  const [entities, setEntities] = useState<HomeAssistantEntity[]>(() => haService.getEntities());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; version?: string } | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'light' | 'switch' | 'climate' | 'sensor'>('all');
  const [activeTab, setActiveTab] = useState<'entities' | 'settings'>('entities');
  const [togglingEntity, setTogglingEntity] = useState<string | null>(null);

  useEffect(() => {
    return haService.subscribe(() => {
      setConfig(haService.getConfig());
      setEntities(haService.getEntities());
    });
  }, [haService]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    onTriggerSynapse?.('Testando comunicação neural com Home Assistant...');

    const res = await haService.testConnection(config.baseUrl, config.accessToken);
    setTesting(false);
    setTestResult(res);

    if (res.success) {
      onTriggerSynapse?.('Conexão com Home Assistant validada!');
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    haService.saveConfig(config);
    onTriggerSynapse?.('Configurações do Home Assistant salvas no Jarvis.');
    setActiveTab('entities');
  };

  const handleToggle = async (entity: HomeAssistantEntity) => {
    const domain = entity.entity_id.split('.')[0];
    let service = 'toggle';

    if (domain === 'light' || domain === 'switch') {
      service = entity.state === 'on' ? 'turn_off' : 'turn_on';
    } else if (domain === 'lock') {
      service = entity.state === 'locked' ? 'unlock' : 'lock';
    }

    setTogglingEntity(entity.entity_id);
    onTriggerSynapse?.(`Comando Home Assistant: ${service} em ${entity.attributes.friendly_name || entity.entity_id}`);
    
    await haService.callService(domain, service, entity.entity_id);
    setTogglingEntity(null);
  };

  const filteredEntities = entities.filter((e) => {
    if (filterType === 'all') return true;
    return e.entity_id.startsWith(filterType);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Home className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">Espaço Home Assistant</h2>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                  config.isConnected
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}>
                  {config.isConnected ? 'Conectado & Sincronizado' : 'Aguardando Credenciais'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Integração de automação residencial, sensores e atuadores com o Jarvis e agentes de IA
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab(activeTab === 'entities' ? 'settings' : 'entities')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              {activeTab === 'entities' ? 'Configurar Conexão' : 'Ver Dispositivos'}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'settings' ? (
            <form onSubmit={handleSaveConfig} className="space-y-6 max-w-2xl mx-auto">
              <div className="bg-slate-950/40 p-5 rounded-xl border border-slate-800 space-y-4">
                <h3 className="text-sm font-semibold text-cyan-300 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  Endereço do Servidor Home Assistant
                </h3>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    URL Base (Local ou Remota)
                  </label>
                  <input
                    type="text"
                    value={config.baseUrl}
                    onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                    placeholder="http://homeassistant.local:8123 ou http://192.168.1.100:8123"
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Ex: http://homeassistant.local:8123 ou endereço de IP da sua rede local
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Token de Acesso de Longa Duração (Long-Lived Access Token)
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={config.accessToken}
                      onChange={(e) => setConfig({ ...config, accessToken: e.target.value })}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Gerado no Home Assistant em: Perfil do Usuário → Tokens de Acesso de Longa Duração
                  </p>
                </div>

                {testResult && (
                  <div
                    className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                      testResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" /> : <Activity className="w-3.5 h-3.5 text-cyan-400" />}
                    {testing ? 'Testando Conexão...' : 'Testar Conexão em Tempo Real'}
                  </button>

                  <button
                    type="submit"
                    className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-cyan-900/40 transition-all flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Salvar e Conectar
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-1.5">
                  {(['all', 'light', 'switch', 'climate', 'sensor'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                        filterType === t
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      {t === 'all' ? 'Todos' : t === 'light' ? 'Luzes' : t === 'switch' ? 'Switches' : t === 'climate' ? 'Clima' : 'Sensores'}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => haService.syncEntities(config.baseUrl, config.accessToken)}
                  className="px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                  Sincronizar Estados
                </button>
              </div>

              {/* Entities Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredEntities.map((ent) => {
                  const domain = ent.entity_id.split('.')[0];
                  const isOn = ent.state === 'on' || ent.state === 'locked' || ent.state === 'cool';

                  return (
                    <div
                      key={ent.entity_id}
                      className={`p-4 rounded-xl border transition-all ${
                        isOn
                          ? 'bg-cyan-950/20 border-cyan-500/30'
                          : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-lg ${
                            isOn ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-500'
                          }`}>
                            {domain === 'light' ? (
                              <Lightbulb className="w-4 h-4" />
                            ) : domain === 'climate' ? (
                              <Thermometer className="w-4 h-4" />
                            ) : domain === 'lock' ? (
                              ent.state === 'locked' ? <Lock className="w-4 h-4 text-emerald-400" /> : <Unlock className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Power className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-white">
                              {ent.attributes.friendly_name || ent.entity_id}
                            </h4>
                            <p className="text-[10px] font-mono text-slate-400">{ent.entity_id}</p>
                          </div>
                        </div>

                        {domain !== 'sensor' && (
                          <button
                            onClick={() => handleToggle(ent)}
                            disabled={togglingEntity === ent.entity_id}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isOn
                                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
                            }`}
                            title="Alternar estado"
                          >
                            <Power className={`w-3.5 h-3.5 ${togglingEntity === ent.entity_id ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                        <span className="text-slate-400 text-[11px]">Estado:</span>
                        <span className={`font-semibold ${
                          isOn ? 'text-cyan-400' : 'text-slate-500'
                        }`}>
                          {ent.state.toUpperCase()} {ent.attributes.unit_of_measurement || ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
