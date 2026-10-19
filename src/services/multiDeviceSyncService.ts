/**
 * MultiDeviceSyncService - Sincronização em Nuvem Multi-Dispositivos
 * Permite que Desktop, Celular (PWA/Android/Tasker) e Smart TV compartilhem o mesmo estado
 * em tempo real sob a conta do usuário (matheusdullius@gmail.com).
 */

export interface ConnectedDeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'tv' | 'daemon';
  lastActive: string;
}

export interface SyncAccountState {
  account: string;
  version: number;
  lastUpdated: string;
  activeDevicesCount: number;
  devices: Record<string, ConnectedDeviceInfo>;
  sessions: any[];
  specialistContexts: any[];
  synapseMemories: any[];
  activeSessionId?: string;
}

export class MultiDeviceSyncService {
  private static instance: MultiDeviceSyncService;
  private accountEmail = typeof window !== 'undefined'
    ? localStorage.getItem('jarvis_sync_account_email') || 'matheusdullius@gmail.com'
    : 'matheusdullius@gmail.com';
  private deviceId: string;
  private deviceName: string;
  private deviceType: 'desktop' | 'mobile' | 'tablet' | 'tv' | 'daemon';
  private lastState: SyncAccountState | null = null;
  private isSyncing = false;
  private listeners: Array<(state: SyncAccountState) => void> = [];
  private broadcastChannel: BroadcastChannel | null = null;

  private constructor() {
    this.deviceId = this.initDeviceId();
    const detected = this.detectDeviceInfo();
    this.deviceName = detected.name;
    this.deviceType = detected.type;

    if (typeof window !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('jarvis_account_sync_channel');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data && event.data.type === 'SYNC_REFRESH') {
            this.syncNow(false);
          }
        };
      } catch {
        // BroadcastChannel não suportado em ambientes restritos
      }

      // Sincronização imediata ao inicializar
      setTimeout(() => this.syncNow(), 800);

      // Sincronização periódica a cada 7 segundos para atualização inter-dispositivos
      setInterval(() => this.syncNow(), 7000);

      // Sincronização ao focar a janela ou desbloquear tela
      window.addEventListener('focus', () => this.syncNow());
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.syncNow();
        }
      });
    }
  }

  public static getInstance(): MultiDeviceSyncService {
    if (!MultiDeviceSyncService.instance) {
      MultiDeviceSyncService.instance = new MultiDeviceSyncService();
    }
    return MultiDeviceSyncService.instance;
  }

  private initDeviceId(): string {
    if (typeof window === 'undefined') return 'server-dev';
    let id = localStorage.getItem('jarvis_device_id');
    if (!id) {
      id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      localStorage.setItem('jarvis_device_id', id);
    }
    return id;
  }

  private detectDeviceInfo(): { name: string; type: 'desktop' | 'mobile' | 'tablet' | 'tv' | 'daemon' } {
    if (typeof navigator === 'undefined') {
      return { name: 'Daemon Local', type: 'daemon' };
    }
    const ua = navigator.userAgent || '';
    let type: 'desktop' | 'mobile' | 'tablet' | 'tv' | 'daemon' = 'desktop';
    let name = 'Desktop Workstation';

    if (/Android/i.test(ua)) {
      type = 'mobile';
      name = 'Android Smartphone';
    } else if (/iPhone|iPod/i.test(ua)) {
      type = 'mobile';
      name = 'Apple iPhone';
    } else if (/iPad/i.test(ua)) {
      type = 'tablet';
      name = 'Apple iPad';
    } else if (/SmartTV|Tizen|Web0S|BRAVIA/i.test(ua)) {
      type = 'tv';
      name = 'Smart TV';
    } else if (/Macintosh/i.test(ua)) {
      name = 'MacBook Pro';
    } else if (/Windows/i.test(ua)) {
      name = 'Windows Workstation';
    } else if (/Linux/i.test(ua)) {
      name = 'Linux Terminal';
    }

    return { name, type };
  }

  public getDeviceId(): string {
    return this.deviceId;
  }

  public getDeviceName(): string {
    return this.deviceName;
  }

  public getDeviceType(): 'desktop' | 'mobile' | 'tablet' | 'tv' | 'daemon' {
    return this.deviceType;
  }

  public getAccount(): string {
    return this.accountEmail;
  }

  public setAccount(newEmail: string): void {
    if (!newEmail || !newEmail.trim()) return;
    const sanitized = newEmail.trim().toLowerCase();
    this.accountEmail = sanitized;
    if (typeof window !== 'undefined') {
      localStorage.setItem('jarvis_sync_account_email', sanitized);
    }
    this.syncNow(true);
  }

  public getLastState(): SyncAccountState | null {
    return this.lastState;
  }

  public subscribe(listener: (state: SyncAccountState) => void): () => void {
    this.listeners.push(listener);
    if (this.lastState) listener(this.lastState);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(state: SyncAccountState) {
    this.lastState = state;
    this.listeners.forEach((l) => l(state));
  }

  /**
   * Sincroniza dados com o servidor em nuvem
   */
  public async syncNow(broadcast = true): Promise<SyncAccountState | null> {
    if (this.isSyncing) return this.lastState;
    this.isSyncing = true;

    try {
      const res = await fetch(`/api/sync/account?account=${encodeURIComponent(this.accountEmail)}&deviceId=${this.deviceId}`, {
        cache: 'no-cache',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const state: SyncAccountState = {
            account: data.account,
            version: data.version,
            lastUpdated: data.lastUpdated,
            activeDevicesCount: data.activeDevicesCount,
            devices: data.devices || {},
            sessions: data.sessions || [],
            specialistContexts: data.specialistContexts || [],
            synapseMemories: data.synapseMemories || [],
            activeSessionId: data.activeSessionId,
          };
          this.notify(state);
          if (broadcast && this.broadcastChannel) {
            this.broadcastChannel.postMessage({ type: 'SYNC_REFRESH' });
          }
          return state;
        }
      }
    } catch (err) {
      console.warn('[MultiDeviceSync] Falha na sincronização de nuvem:', err);
    } finally {
      this.isSyncing = false;
    }
    return this.lastState;
  }

  /**
   * Envia atualização local do dispositivo para persistir no backend
   */
  public async pushUpdate(stateUpdate: {
    sessions?: any[];
    specialistContexts?: any[];
    synapseMemories?: any[];
    activeSessionId?: string;
  }): Promise<void> {
    try {
      const payload = {
        account: this.accountEmail,
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        deviceType: this.deviceType,
        stateUpdate,
      };

      const res = await fetch('/api/sync/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.mergedState) {
          const state: SyncAccountState = {
            account: data.account,
            version: data.version,
            lastUpdated: new Date().toISOString(),
            activeDevicesCount: data.activeDevicesCount,
            devices: this.lastState?.devices || {},
            sessions: data.mergedState.sessions || [],
            specialistContexts: data.mergedState.specialistContexts || [],
            synapseMemories: data.mergedState.synapseMemories || [],
            activeSessionId: data.mergedState.activeSessionId,
          };
          this.notify(state);
          if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({ type: 'SYNC_REFRESH' });
          }
        }
      }
    } catch (err) {
      console.warn('[MultiDeviceSync] Falha ao enviar atualização local:', err);
    }
  }
}

export const multiDeviceSyncService = MultiDeviceSyncService.getInstance();
