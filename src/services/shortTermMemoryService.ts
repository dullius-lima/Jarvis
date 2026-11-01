// src/services/shortTermMemoryService.ts
interface MemoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface SessionBucket {
  messages: MemoryEntry[];
  lastUpdated: number;
}

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hora de TTL
const MAX_MESSAGES_PER_SESSION = 30;
const memoryStore = new Map<string, SessionBucket>();

export function appendShortTermMemory(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
) {
  const now = Date.now();
  const bucket = memoryStore.get(sessionId) || { messages: [], lastUpdated: now };

  bucket.messages.push({ role, content, timestamp: now });
  if (bucket.messages.length > MAX_MESSAGES_PER_SESSION) {
    bucket.messages = bucket.messages.slice(-MAX_MESSAGES_PER_SESSION);
  }
  bucket.lastUpdated = now;
  memoryStore.set(sessionId, bucket);
}

export function getShortTermMemory(sessionId: string): MemoryEntry[] {
  const bucket = memoryStore.get(sessionId);
  if (!bucket) return [];
  if (Date.now() - bucket.lastUpdated > SESSION_TTL_MS) {
    memoryStore.delete(sessionId);
    return [];
  }
  return bucket.messages;
}

export function clearShortTermMemory(sessionId: string) {
  memoryStore.delete(sessionId);
}

// Rotina automática de limpeza contra Memory Leak a cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, bucket] of memoryStore.entries()) {
    if (now - bucket.lastUpdated > SESSION_TTL_MS) {
      memoryStore.delete(sessionId);
    }
  }
}, 10 * 60 * 1000).unref?.();