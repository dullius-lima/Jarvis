<template>
  <transition name="hud-slide">
    <div
      v-if="response"
      class="hud-bubble"
      :class="{ 'is-expanded': isExpanded }"
    >
      <!-- Faixa 1: Segmento Único de Rota dos Agentes -->
      <div class="hud-telemetry-row">
        <slot name="telemetry"></slot>
      </div>

      <!-- Modo Compacto (Padrão): 1 linha discreta + botão Ler -->
      <div
        v-if="!isExpanded"
        class="hud-compact-bar"
        @click="isExpanded = true"
      >
        <span class="compact-agent">⚡ {{ response.agent }}:</span>
        <span class="compact-preview">{{ singleLinePreview }}</span>

        <div class="compact-actions" @click.stop>
          <button
            type="button"
            class="hud-pill-btn"
            @click="isExpanded = true"
            title="Expandir resposta completa"
          >
            ▼ Ler
          </button>
          <button
            type="button"
            class="hud-close-btn"
            @click="$emit('close')"
            title="Fechar"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Modo Expandido: Card completo com rolagem e botão Copiar -->
      <div v-else class="hud-expanded-body">
        <div class="expanded-header">
          <span class="expanded-title">
            ⚡ <strong>{{ response.agent }}</strong>
            <small v-if="response.executionTimeMs">
              ({{ formatDuration(response.executionTimeMs) }})
            </small>
          </span>

          <div class="expanded-actions">
            <button
              type="button"
              class="hud-pill-btn"
              @click="copyResponse"
              title="Copiar texto"
            >
              {{ copied ? '✓ Copiado' : '📋 Copiar' }}
            </button>
            <button
              type="button"
              class="hud-pill-btn"
              @click="isExpanded = false"
              title="Recolher balão"
            >
              ▲ Recolher
            </button>
            <button
              type="button"
              class="hud-close-btn"
              @click="$emit('close')"
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="expanded-text">{{ response.text }}</div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  response: {
    agent: string;
    text: string;
    executionTimeMs?: number;
  } | null;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const isExpanded = ref(false);
const copied = ref(false);

watch(
  () => props.response,
  () => {
    isExpanded.value = false;
    copied.value = false;
  }
);

const singleLinePreview = computed(() => {
  const raw = String(props.response?.text || '');
  return raw.replace(/[*#_`>\n]+/g, ' ').replace(/\s+/g, ' ').trim();
});

function formatDuration(ms?: number) {
  const n = Number(ms || 0);
  if (n >= 1000) return (n / 1000).toFixed(1) + 's';
  return n + 'ms';
}

async function copyResponse() {
  if (!props.response?.text) return;
  try {
    await navigator.clipboard.writeText(props.response.text);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1800);
  } catch {}
}
</script>

<style scoped>
.hud-bubble {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom, 10px) + 88px);
  left: 50%;
  transform: translateX(-50%);
  width: min(600px, calc(100vw - 20px));
  z-index: 42;
  background: rgba(9, 15, 30, 0.86);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 14px;
  padding: 6px 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(14px);
  transition: all 0.25s ease;
  box-sizing: border-box;
}

.hud-bubble.is-expanded {
  background: rgba(9, 15, 30, 0.95);
  border-color: rgba(56, 189, 248, 0.6);
  padding: 9px 11px;
}

.hud-telemetry-row {
  margin-bottom: 5px;
}

.hud-compact-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px 1px;
  cursor: pointer;
  min-width: 0;
}

.compact-agent {
  color: #38bdf8;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
}

.compact-preview {
  flex: 1;
  min-width: 0;
  color: #e2e8f0;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.compact-actions,
.expanded-actions {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.hud-pill-btn {
  background: rgba(14, 165, 233, 0.16);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #7dd3fc;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.hud-pill-btn:hover {
  background: rgba(14, 165, 233, 0.3);
  color: #ffffff;
}

.hud-close-btn {
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: #94a3b8;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.hud-close-btn:hover {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.5);
}

.expanded-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 6px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  margin-bottom: 6px;
}

.expanded-title {
  font-size: 11.5px;
  color: #38bdf8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.expanded-title small {
  color: #94a3b8;
}

.expanded-text {
  max-height: 34dvh;
  overflow-y: auto;
  font-size: 12.5px;
  line-height: 1.48;
  color: #f1f5f9;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 2px;
}

.hud-slide-enter-active,
.hud-slide-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.hud-slide-enter-from,
.hud-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
