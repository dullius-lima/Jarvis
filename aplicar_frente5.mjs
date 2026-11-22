import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BACKUP_DIR = '.backup_frente5';
const FILES = [
  'src/server.ts',
  'src/frontend/composables/useVoiceAndAudio.ts',
  'src/frontend/composables/useEcosystem.ts',
  'android/app/src/main/java/com/matheus/jarvis/MainActivity.java',
  'android/app/src/main/java/com/matheus/jarvis/JarvisVoiceService.java',
  'devices/phone/src/main/java/com/matheus/jarvis/MainActivity.java',
  'devices/phone/src/main/java/com/matheus/jarvis/JarvisVoiceService.java',
  'build_apk.sh'
];

fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
for (const rel of FILES) {
  if (fs.existsSync(rel)) {
    const dest = path.join(BACKUP_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(rel, dest);
  }
}
console.log('📦 Backup criado em ' + BACKUP_DIR);

function rollback() {
  for (const rel of FILES) {
    const src = path.join(BACKUP_DIR, rel);
    if (fs.existsSync(src)) fs.copyFileSync(src, rel);
  }
  console.error('↩️ Rollback automático executado.');
}

function replaceBetween(code, startMarker, endMarker, replacement, includeEnd = false) {
  const sIdx = code.indexOf(startMarker);
  if (sIdx === -1) throw new Error('Marcador inicial não encontrado: ' + startMarker);
  const eIdx = code.indexOf(endMarker, sIdx + startMarker.length);
  if (eIdx === -1) throw new Error('Marcador final não encontrado: ' + endMarker);
  const cutEnd = includeEnd ? eIdx + endMarker.length : eIdx;
  return code.slice(0, sIdx) + replacement + code.slice(cutEnd);
}

try {
  // 1. src/server.ts -> Alinha DEFAULT_USER_PREFS, porta dinâmica PORT em /api/v1/voice/turn e remove "chaves"
  {
    const p = 'src/server.ts';
    let code = fs.readFileSync(p, 'utf8');

    const newPrefsAndVoiceTurn = `const DEFAULT_USER_PREFS = {
  listen_screen_off: true,
  listen_only_unlocked: false,
  listen_only_app_open: false,
  push_to_talk_only: false,
  silent_text_only: false,
  chime_enabled: true,
  edge_glow_enabled: true,
  wake_screen_on_call: true,
  privacy_lock_camera: false,
  continuous_chat_seconds: 15,
  mic_sensitivity: 'balanced'
};

app.post('/api/v1/voice/turn', async (req, res) => {
  try {
    const { audioBase64, mimeType, requireWakeWord, identityToken, sessionId } = req.body || {};
    if (!audioBase64) return res.status(400).json({ success: false, error: 'audioBase64 ausente' });

    const localBase = \`http://127.0.0.1:\${PORT}\`;
    const trResp = await fetch(\`\${localBase}/api/v1/audio/transcribe\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, mimeType: mimeType || 'audio/wav', modelSize: 'small' })
    });
    const trJson: any = await trResp.json().catch(() => ({}));
    const transcript = String(trJson?.text || trJson?.transcript || '').trim();
    console.log(\`[VoiceTurn] Ouviu: "\${transcript}"\`);

    if (!transcript) return res.json({ success: true, woke: false, transcript: '', reply: '' });

    const norm = transcript.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
    const hasWake = /\\b(jarvis|javis|jarves|jaives|javes|iarvis|yarvis|djarvis|jarbas|jar\\s*vis|ja\\s*vis)\\b/.test(norm);
    if (requireWakeWord !== false && !hasWake) {
      return res.json({ success: true, woke: false, transcript, reply: '' });
    }

    const cleanPrompt = transcript
      .replace(/^(oi|olá|ola|ei|hey|ok|fala|e\\s*a[ií])?[,\\s.-]*(jarvis|j[aá]vis|jarves|jaives|javes|iarvis|yarvis|djarvis|jarbas|j\\.a\\.r\\.v\\.i\\.s\\.?)\\s*[,\\s.:!?-]*/i, '')
      .trim();
    if (!cleanPrompt) {
      return res.json({ success: true, woke: true, transcript, reply: '' });
    }

    const ingResp = await fetch(\`\${localBase}/api/v1/webhook/ingress\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identityToken: identityToken || 'Matheus-Admin',
        sessionId: sessionId || 'sess_main_admin',
        prompt: cleanPrompt,
        textPrompt: cleanPrompt,
        sensorData: {
          type: 'voice_or_text',
          inputSource: 'android_voice_service',
          prompt: cleanPrompt,
          textPrompt: cleanPrompt
        }
      })
    });
    const ingJson: any = await ingResp.json().catch(() => ({}));
    const reply = String(ingJson?.data?.response || ingJson?.response || ingJson?.reply || ingJson?.message || 'Pronto.').trim();

    let replyAudioB64 = '';
    if (reply) {
      try {
        const spResp = await fetch(\`\${localBase}/api/v1/audio/speak\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: reply })
        });
        const spJson: any = await spResp.json().catch(() => ({}));
        replyAudioB64 = String(spJson?.audioBase64 || '');
      } catch {}
    }

    return res.json({ success: true, woke: true, transcript, reply, audioBase64: replyAudioB64 });
  } catch (e: any) {
    console.error('[VoiceTurn] Erro:', e?.message || e);
    return res.status(500).json({ success: false, error: e?.message || 'Erro interno' });
  }
});

`;
    code = replaceBetween(code, 'const DEFAULT_USER_PREFS = {', "app.get('/api/v1/preferences',", newPrefsAndVoiceTurn, false);
    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ src/server.ts atualizado (preferências sincronizadas + porta dinâmica + wake-word limpa)');
  }

  // 2. src/frontend/composables/useVoiceAndAudio.ts -> Assinaturas alinhadas com App.vue + sincronia total
  {
    const p = 'src/frontend/composables/useVoiceAndAudio.ts';
    const content = `import { ref, onMounted, onUnmounted } from 'vue';

export interface JarvisAudioPrefs {
  listen_screen_off: boolean;
  listen_only_unlocked: boolean;
  listen_only_app_open: boolean;
  push_to_talk_only: boolean;
  silent_text_only: boolean;
  chime_enabled: boolean;
  edge_glow_enabled: boolean;
  wake_screen_on_call: boolean;
  privacy_lock_camera: boolean;
  continuous_chat_seconds: number;
  mic_sensitivity: 'high' | 'balanced' | 'noisy' | number;
}

const DEFAULT_PREFS: JarvisAudioPrefs = {
  listen_screen_off: true,
  listen_only_unlocked: false,
  listen_only_app_open: false,
  push_to_talk_only: false,
  silent_text_only: false,
  chime_enabled: true,
  edge_glow_enabled: true,
  wake_screen_on_call: true,
  privacy_lock_camera: false,
  continuous_chat_seconds: 15,
  mic_sensitivity: 'balanced'
};

export function useVoiceAndAudio(
  onCommandDetected: (text: string, audioSample?: string) => Promise<void> | void
) {
  const isListening = ref(false);
  const isJarvisAwake = ref(false);
  const isJarvisSpeaking = ref(false);
  const isRecordingAudio = ref(false);
  const isVoiceMuted = ref(false);
  const isVoiceSupported = ref(true);
  const voiceStatusText = ref('🟢 Vigília ativa: Diga "Jarvis"...');
  const activeVoiceProfileName = ref<string>('Matheus');
  const currentPitchHz = ref<number>(0);
  const latestAudioBase64 = ref<string | null>(null);

  let recognition: any = null;
  let awakeTimer: any = null;
  let restartTimer: any = null;
  let lastChimeAt = 0;
  let audioUnlocked = false;
  let currentTtsAudio: HTMLAudioElement | null = null;
  let shouldBeListening = true;
  let userPrefs: JarvisAudioPrefs = { ...DEFAULT_PREFS };
  let activeTranscriptCallback: ((text: string) => void) | null = null;

  function loadCachedPrefs() {
    try {
      const raw = localStorage.getItem('jarvis_user_prefs');
      if (raw) {
        userPrefs = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
      }
    } catch {}
    applyPrefsState();
  }

  function applyPrefsState() {
    isVoiceMuted.value = Boolean(userPrefs.silent_text_only);
    if (userPrefs.push_to_talk_only) {
      shouldBeListening = false;
      if (!isJarvisAwake.value) {
        stopRecognitionInstance();
        voiceStatusText.value = '🎙️ Modo Push-to-Talk: toque no Globo para falar';
      }
    } else {
      shouldBeListening = true;
      if (!isListening.value && !isJarvisSpeaking.value && !document.hidden) {
        voiceStatusText.value = isJarvisAwake.value
          ? '🎙️ Conversa ativa... pode falar'
          : '🟢 Vigília ativa: Diga "Jarvis"...';
      }
    }
  }

  async function syncFrontendAudioPrefs() {
    loadCachedPrefs();
    try {
      const res = await fetch('/api/v1/preferences');
      const data = await res.json();
      if (data?.success && data?.data) {
        userPrefs = { ...DEFAULT_PREFS, ...data.data };
        localStorage.setItem('jarvis_user_prefs', JSON.stringify(userPrefs));
        applyPrefsState();
      }
    } catch {}
  }

  function handlePrefsEvent(e: Event) {
    const custom = e as CustomEvent<Partial<JarvisAudioPrefs>>;
    if (custom?.detail) {
      userPrefs = { ...userPrefs, ...custom.detail };
      localStorage.setItem('jarvis_user_prefs', JSON.stringify(userPrefs));
      applyPrefsState();
      if (!userPrefs.push_to_talk_only && !isListening.value && !isJarvisSpeaking.value) {
        startContinuousVigilance();
      }
    } else {
      loadCachedPrefs();
    }
  }

  function ensureAudioUnlocked() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        setTimeout(() => ctx.close().catch(() => {}), 200);
      }
      if ('speechSynthesis' in window) window.speechSynthesis.resume();
    } catch {}
  }

  function setupAudioUnlockListener() {
    ensureAudioUnlocked();
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', ensureAudioUnlocked, { once: true });
      window.addEventListener('touchstart', ensureAudioUnlocked, { once: true });
    }
  }

  function playActivationSignal(type: 'wake' | 'confirm' | 'send' = 'wake') {
    if (!userPrefs.chime_enabled || userPrefs.silent_text_only) return;
    const now = Date.now();
    if (type === 'wake' && now - lastChimeAt < 900) return;
    lastChimeAt = now;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(type === 'wake' ? 660 : 880, ctx.currentTime);
      osc.frequency.setValueAtTime(type === 'wake' ? 990 : 1174, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.16, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
      setTimeout(() => ctx.close().catch(() => {}), 220);
    } catch {}
  }

  function closeAwakeWindow() {
    if (awakeTimer) {
      clearTimeout(awakeTimer);
      awakeTimer = null;
    }
    isJarvisAwake.value = false;
    isRecordingAudio.value = false;
    voiceStatusText.value = userPrefs.push_to_talk_only
      ? '🎙️ Modo Push-to-Talk: toque no Globo para falar'
      : '🟢 Vigília ativa: Diga "Jarvis"...';
    if (userPrefs.push_to_talk_only) {
      stopRecognitionInstance();
    }
  }

  function keepAwakeWindow(seconds?: number) {
    const windowSec =
      typeof seconds === 'number' && seconds > 0
        ? seconds
        : Math.max(10, Number(userPrefs.continuous_chat_seconds ?? 15));

    isJarvisAwake.value = true;
    isRecordingAudio.value = true;
    voiceStatusText.value = \`🎙️ Ouvindo (\${windowSec}s)... pode falar\`;

    if (awakeTimer) clearTimeout(awakeTimer);
    awakeTimer = setTimeout(() => {
      closeAwakeWindow();
    }, windowSec * 1000);
  }

  function stopAllAudio() {
    if (currentTtsAudio) {
      try {
        currentTtsAudio.pause();
        currentTtsAudio = null;
      } catch {}
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    isJarvisSpeaking.value = false;
  }

  async function speakJarvisResponse(rawText: string, forceKeepAwake?: boolean) {
    const cleanText = (rawText || '')
      .replace(/\`\`\`[\\s\\S]*?\`\`\`/g, '')
      .replace(/[*#_~\`>|]/g, '')
      .replace(/https?:\\/\\/\\S+/g, '')
      .replace(/\\s+/g, ' ')
      .trim();

    const followUpAfterReply = () => {
      isJarvisSpeaking.value = false;
      const configuredSec = Number(userPrefs.continuous_chat_seconds ?? 15);
      const normReply = cleanText.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
      const jarvisAskedQuestion =
        cleanText.endsWith('?') ||
        /\\b(qual deles|qual contato|qual aparelho|qual comodo|confirma|deseja|quer que eu|pode repetir)\\b/.test(normReply);

      const nextWindowSec =
        configuredSec > 0 ? configuredSec : jarvisAskedQuestion || forceKeepAwake ? 12 : 0;

      if (nextWindowSec > 0 && !document.hidden) {
        keepAwakeWindow(nextWindowSec);
        setTimeout(() => startContinuousVigilance(true), 220);
      } else {
        closeAwakeWindow();
        if (!userPrefs.push_to_talk_only && !document.hidden) {
          setTimeout(() => startContinuousVigilance(false), 220);
        }
      }
    };

    if (isVoiceMuted.value || userPrefs.silent_text_only || !cleanText) {
      followUpAfterReply();
      return;
    }

    isJarvisSpeaking.value = true;
    stopRecognitionInstance();

    try {
      const res = await fetch('/api/v1/audio/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, mode: 'auto' })
      });
      const data = await res.json();
      if (data.success && data.audioBase64) {
        if (currentTtsAudio) currentTtsAudio.pause();
        currentTtsAudio = new Audio(\`data:\${data.mimeType || 'audio/mpeg'};base64,\${data.audioBase64}\`);
        currentTtsAudio.onended = followUpAfterReply;
        currentTtsAudio.onerror = followUpAfterReply;
        await currentTtsAudio.play();
        return;
      }
    } catch {}

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        setTimeout(() => {
          window.speechSynthesis.resume();
          const utter = new SpeechSynthesisUtterance(cleanText);
          utter.lang = 'pt-BR';
          utter.rate = 1.06;
          utter.onend = followUpAfterReply;
          utter.onerror = followUpAfterReply;
          window.speechSynthesis.speak(utter);
        }, 60);
        return;
      } catch {}
    }

    followUpAfterReply();
  }

  function stopRecognitionInstance() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (recognition) {
      try {
        recognition.onend = null;
        recognition.onerror = null;
        recognition.stop();
      } catch {}
      recognition = null;
    }
    isListening.value = false;
  }

  function startContinuousVigilance(forceManualPush = false) {
    if (userPrefs.push_to_talk_only && !forceManualPush && !isJarvisAwake.value) {
      shouldBeListening = false;
      stopRecognitionInstance();
      voiceStatusText.value = '🎙️ Modo Push-to-Talk: toque no Globo para falar';
      return;
    }

    shouldBeListening = !userPrefs.push_to_talk_only;
    if (isJarvisSpeaking.value || document.hidden) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      isVoiceSupported.value = false;
      voiceStatusText.value = '🟢 Escuta nativa em segundo plano ativa';
      return;
    }

    stopRecognitionInstance();
    recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = !userPrefs.push_to_talk_only;
    recognition.interimResults = true;

    recognition.onstart = () => {
      isListening.value = true;
      voiceStatusText.value = isJarvisAwake.value
        ? '🎙️ Ouvindo... pode falar'
        : '🟢 Vigília ativa: Diga "Jarvis"...';
    };

    recognition.onresult = async (event: any) => {
      if (isJarvisSpeaking.value) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const rawTranscript = result[0].transcript.trim();
        const normalized = rawTranscript
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\\u0300-\\u036f]/g, '');

        const hasWakeWord = /\\b(jarvis|javis|jarves|jaives|javes|iarvis|yarvis|djarvis|jarbas)\\b/i.test(normalized);

        if (hasWakeWord && !isJarvisAwake.value) {
          playActivationSignal('wake');
          keepAwakeWindow();
        }

        if (isJarvisAwake.value && activeTranscriptCallback && rawTranscript) {
          activeTranscriptCallback(rawTranscript);
        }

        if (result.isFinal && (hasWakeWord || isJarvisAwake.value)) {
          const cleanedCommand = rawTranscript
            .replace(/^(?:oi|ol[aá]|ei|ok|fala|e\\s*a[ií])?[\\s,.-]*(?:jarvis|j[aá]vis|jarves|jaives|javes|iarvis|yarvis|djarvis|jarbas|j\\.a\\.r\\.v\\.i\\.s\\.?)[\\s,.:!?-]*/i, '')
            .trim();

          if (cleanedCommand.length < 2) {
            playActivationSignal('wake');
            keepAwakeWindow();
            return;
          }

          const normCmd = cleanedCommand
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\\u0300-\\u036f?!.]/g, '')
            .trim();
          if (/^(obrigado|obrigada|valeu|so isso|pode descansar|dispensado|tchau|encerrar|parar)$/.test(normCmd)) {
            activeTranscriptCallback = null;
            closeAwakeWindow();
            return;
          }

          activeTranscriptCallback = null;
          playActivationSignal('confirm');
          keepAwakeWindow();
          voiceStatusText.value = \`⚡ Executando: "\${cleanedCommand}"\`;
          await onCommandDetected(cleanedCommand, latestAudioBase64.value || undefined);
          return;
        }
      }
    };

    recognition.onerror = (event: any) => {
      isListening.value = false;
      if (event?.error === 'not-allowed') {
        shouldBeListening = false;
        voiceStatusText.value = '🔴 Permissão de microfone negada';
      }
    };

    recognition.onend = () => {
      isListening.value = false;
      if ((shouldBeListening || isJarvisAwake.value) && !isJarvisSpeaking.value && !document.hidden) {
        restartTimer = setTimeout(() => startContinuousVigilance(isJarvisAwake.value), 250);
      } else if (userPrefs.push_to_talk_only) {
        closeAwakeWindow();
      }
    };

    try {
      recognition.start();
    } catch {
      restartTimer = setTimeout(() => startContinuousVigilance(forceManualPush), 450);
    }
  }

  function stopContinuousVigilance() {
    shouldBeListening = false;
    activeTranscriptCallback = null;
    closeAwakeWindow();
    stopRecognitionInstance();
  }

  function toggleMicrophone(onInterimTranscript?: (text: string) => void) {
    ensureAudioUnlocked();
    if (onInterimTranscript) {
      activeTranscriptCallback = onInterimTranscript;
    }
    playActivationSignal('wake');
    keepAwakeWindow(Math.max(15, Number(userPrefs.continuous_chat_seconds || 15)));
    startContinuousVigilance(true);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopRecognitionInstance();
    } else {
      syncFrontendAudioPrefs().finally(() => {
        if (!userPrefs.push_to_talk_only) {
          setTimeout(() => startContinuousVigilance(false), 300);
        }
      });
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('jarvis-prefs-updated', handlePrefsEvent);
    window.addEventListener('storage', loadCachedPrefs);
    syncFrontendAudioPrefs().finally(() => {
      if (!userPrefs.push_to_talk_only) {
        setTimeout(() => startContinuousVigilance(false), 350);
      }
    });
  });

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('jarvis-prefs-updated', handlePrefsEvent);
    window.removeEventListener('storage', loadCachedPrefs);
    stopContinuousVigilance();
  });

  return {
    isListening,
    isJarvisAwake,
    isJarvisSpeaking,
    isRecordingAudio,
    isVoiceMuted,
    isVoiceSupported,
    voiceStatusText,
    activeVoiceProfileName,
    currentPitchHz,
    latestAudioBase64,
    ensureAudioUnlocked,
    setupAudioUnlockListener,
    startContinuousVigilance,
    stopContinuousVigilance,
    stopMicrophoneSession: stopContinuousVigilance,
    toggleMicrophone,
    onJarvisCoreClick: (cb?: (text: string) => void) => toggleMicrophone(cb),
    speakJarvisResponse,
    stopAllAudio,
    playActivationSignal,
    playJarvisChime: () => playActivationSignal('wake')
  };
}
`;
    fs.writeFileSync(p, content, 'utf8');
    console.log('✅ useVoiceAndAudio.ts atualizado');
  }

  // 3. src/frontend/composables/useEcosystem.ts -> Mantém sessionId sincronizado sem sequestrar por cron_
  {
    const p = 'src/frontend/composables/useEcosystem.ts';
    let code = fs.readFileSync(p, 'utf8');
    const oldSessionPick = `try { const sr = await fetch('/api/v1/memory/sessions'); const sj = await sr.json(); const ss = sj.data || sj.sessions || []; if (ss[0]?.session_id) sessionId = ss[0].session_id; } catch {}`;
    const newSessionPick = `try {
        const storedSid = localStorage.getItem('jarvis_active_session_id');
        if (storedSid) {
          sessionId = storedSid;
        } else {
          const sr = await fetch('/api/v1/memory/sessions');
          const sj = await sr.json();
          const ss = sj.data || sj.sessions || [];
          const humanSession = ss.find((s: any) => s?.session_id && !String(s.session_id).startsWith('cron_'));
          if (humanSession?.session_id) sessionId = humanSession.session_id;
        }
      } catch {}`;
    if (code.includes(oldSessionPick)) {
      code = code.replace(oldSessionPick, newSessionPick);
      fs.writeFileSync(p, code, 'utf8');
      console.log('✅ useEcosystem.ts atualizado (sessão principal protegida contra cron_)');
    }
  }

  // 4. MainActivity.java -> Aguarda concessão de RECORD_AUDIO antes de subir ForegroundService
  const mainActivityJava = `package com.matheus.jarvis;

import android.Manifest;
import android.app.role.RoleManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebSettings;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    public static volatile boolean isAppInForeground = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (classExists("com.matheus.jarvis.JarvisDevicePlugin")) {
            try {
                @SuppressWarnings("unchecked")
                Class<? extends com.getcapacitor.Plugin> cls =
                    (Class<? extends com.getcapacitor.Plugin>) Class.forName("com.matheus.jarvis.JarvisDevicePlugin");
                registerPlugin(cls);
            } catch (Exception ignored) {}
        }
        super.onCreate(savedInstanceState);

        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
        }

        requestAllPhonePermissions();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            startPhoneVoiceService();
        }

        new Handler(Looper.getMainLooper()).postDelayed(this::promptAssistantRoleIfNeeded, 1400L);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            startPhoneVoiceService();
        }
    }

    private boolean classExists(String name) {
        try { Class.forName(name); return true; } catch (Exception e) { return false; }
    }

    private void requestAllPhonePermissions() {
        String[] perms = new String[]{
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.CALL_PHONE,
            Manifest.permission.POST_NOTIFICATIONS
        };
        List<String> missing = new ArrayList<>();
        for (String p : perms) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        }
        if (!missing.isEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toArray(new String[0]), 101);
        }
    }

    private void promptAssistantRoleIfNeeded() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                RoleManager rm = getSystemService(RoleManager.class);
                if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_ASSISTANT) && !rm.isRoleHeld(RoleManager.ROLE_ASSISTANT)) {
                    startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT), 2001);
                }
            }
        } catch (Exception ignored) {}
    }

    private void startPhoneVoiceService() {
        try {
            Intent svc = new Intent(this, JarvisVoiceService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(svc);
            else startService(svc);
        } catch (Exception ignored) {}
    }

    @Override public void onResume() { super.onResume(); isAppInForeground = true; }
    @Override public void onPause() { isAppInForeground = false; super.onPause(); }
}
`;
  for (const targetMa of [
    'android/app/src/main/java/com/matheus/jarvis/MainActivity.java',
    'devices/phone/src/main/java/com/matheus/jarvis/MainActivity.java'
  ]) {
    if (fs.existsSync(path.dirname(targetMa))) {
      fs.writeFileSync(targetMa, mainActivityJava, 'utf8');
      console.log('✅ Atualizado: ' + targetMa);
    }
  }

  // 5. JarvisVoiceService.java -> Revezamento limpo 1º/2º plano + DSP release + WakeLock release + mic_sensitivity string/number
  const jarvisVoiceServiceJava = `package com.matheus.jarvis;

import android.Manifest;
import android.animation.ValueAnimator;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.*;
import android.media.*;
import android.media.audiofx.*;
import android.os.*;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.view.*;
import android.view.animation.LinearInterpolator;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.util.*;

public class JarvisVoiceService extends Service {
    public static volatile JarvisVoiceService instance;
    private static final String BASE = "http://163.176.111.18";
    private Handler mainHandler;
    private WindowManager wm;
    private EdgeGlowView glowView;
    private TextToSpeech tts;
    private PowerManager.WakeLock wakeLock;
    private volatile boolean ttsReady = false;
    private volatile boolean running = true;
    private volatile boolean isSpeaking = false;
    private volatile long forceAwakeUntil = 0L;
    private volatile long continuousUntil = 0L;

    private volatile boolean prefScreenOff = true;
    private volatile boolean prefOnlyUnlocked = false;
    private volatile boolean prefOnlyAppOpen = false;
    private volatile boolean prefPushToTalk = false;
    private volatile boolean prefSilent = false;
    private volatile boolean prefChime = true;
    private volatile boolean prefEdgeGlow = true;
    private volatile boolean prefWakeScreen = true;
    private volatile int prefContinuousSec = 15;
    private volatile float prefSensitivity = 1.6f;
    private volatile float prefGain = 3.3f;

    public static void wakeNow() {
        if (instance != null) {
            instance.forceAwakeUntil = System.currentTimeMillis() + 9000L;
            instance.playChime(true);
            instance.showGlow(1);
        }
    }

    private static class EdgeGlowView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private float angle = 0f;
        private int mode = 1;
        private ValueAnimator anim;

        public EdgeGlowView(Context ctx) {
            super(ctx);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(12f);
        }
        public void setMode(int m) { this.mode = m; invalidate(); }

        @Override protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            anim = ValueAnimator.ofFloat(0f, 360f);
            anim.setDuration(1100L);
            anim.setRepeatCount(ValueAnimator.INFINITE);
            anim.setInterpolator(new LinearInterpolator());
            anim.addUpdateListener(a -> { angle = (float) a.getAnimatedValue(); invalidate(); });
            anim.start();
        }
        @Override protected void onDetachedFromWindow() {
            if (anim != null) { anim.cancel(); anim = null; }
            super.onDetachedFromWindow();
        }
        @Override protected void onDraw(Canvas canvas) {
            int w = getWidth(), h = getHeight();
            if (w <= 0 || h <= 0) return;
            int[] c = mode == 1 ? new int[]{0xFFEF4444, 0xFFF87171, 0xFFDC2626, 0xFFEF4444}
                    : mode == 2 ? new int[]{0xFF38BDF8, 0xFF818CF8, 0xFF22D3EE, 0xFF38BDF8}
                    : new int[]{0xFF22D3EE, 0xFF34D399, 0xFF38BDF8, 0xFF22D3EE};
            SweepGradient sg = new SweepGradient(w / 2f, h / 2f, c, null);
            Matrix m = new Matrix();
            m.setRotate(angle, w / 2f, h / 2f);
            sg.setLocalMatrix(m);
            paint.setShader(sg);
            canvas.drawRect(5f, 5f, w - 5f, h - 5f, paint);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        mainHandler = new Handler(Looper.getMainLooper());
        tts = new TextToSpeech(getApplicationContext(), st -> {
            if (st == TextToSpeech.SUCCESS) {
                int r = tts.setLanguage(new Locale("pt", "BR"));
                ttsReady = (r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED);
            }
        });

        NotificationChannel ch = new NotificationChannel("jarvis_24h", "JARVIS Escuta Ativa 24h", NotificationManager.IMPORTANCE_LOW);
        getSystemService(NotificationManager.class).createNotificationChannel(ch);
        Notification n = new NotificationCompat.Builder(this, "jarvis_24h")
                .setContentTitle("JARVIS Escuta Ativa 24h")
                .setContentText("Ouvindo 'Jarvis' em segundo plano")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(101, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        else startForeground(101, n);

        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "jarvis:voice24h");
            wakeLock.acquire();
        } catch (Exception ignored) {}

        new Thread(this::prefsLoop, "JarvisPrefs").start();
        new Thread(this::listenLoop, "JarvisPhoneAudio").start();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "ACTION_WAKE_NOW".equals(intent.getAction())) wakeNow();
        return START_STICKY;
    }

    private void updateNotifStatus(String msg) {
        try {
            Notification n = new NotificationCompat.Builder(this, "jarvis_24h")
                    .setContentTitle("JARVIS Escuta Ativa 24h")
                    .setContentText(msg)
                    .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                    .setOnlyAlertOnce(true)
                    .setOngoing(true)
                    .build();
            getSystemService(NotificationManager.class).notify(101, n);
        } catch (Exception ignored) {}
    }

    private float parseMicSensitivity(Object rawVal) {
        if (rawVal instanceof Number) {
            return (float) Math.max(0.5, Math.min(2.5, ((Number) rawVal).doubleValue()));
        }
        String s = rawVal == null ? "balanced" : String.valueOf(rawVal).trim().toLowerCase();
        if ("high".equals(s)) return 2.2f;
        if ("noisy".equals(s)) return 0.95f;
        try {
            return (float) Math.max(0.5, Math.min(2.5, Double.parseDouble(s)));
        } catch (Exception ignored) {
            return 1.6f;
        }
    }

    private void prefsLoop() {
        while (running) {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(BASE + "/api/v1/preferences").openConnection();
                c.setConnectTimeout(2500);
                c.setReadTimeout(2500);
                try (Scanner sc = new Scanner(c.getInputStream()).useDelimiter("\\\\A")) {
                    JSONObject j = new JSONObject(sc.hasNext() ? sc.next() : "{}");
                    JSONObject d = j.optJSONObject("data") != null ? j.getJSONObject("data") : j;
                    prefScreenOff = d.optBoolean("listen_screen_off", true);
                    prefOnlyUnlocked = d.optBoolean("listen_only_unlocked", false);
                    prefOnlyAppOpen = d.optBoolean("listen_only_app_open", false);
                    prefPushToTalk = d.optBoolean("push_to_talk_only", false);
                    prefSilent = d.optBoolean("silent_text_only", false);
                    prefChime = d.optBoolean("chime_enabled", true);
                    prefEdgeGlow = d.optBoolean("edge_glow_enabled", true);
                    prefWakeScreen = d.optBoolean("wake_screen_on_call", true);
                    prefContinuousSec = d.optInt("continuous_chat_seconds", 15);
                    prefSensitivity = parseMicSensitivity(d.opt("mic_sensitivity"));
                    prefGain = (float) Math.max(1.8, Math.min(4.8, prefSensitivity * 2.1));
                }
            } catch (Exception ignored) {
            } finally {
                if (c != null) c.disconnect();
            }
            try { Thread.sleep(2000L); } catch (InterruptedException ignored) {}
        }
    }

    private boolean canListenNow() {
        if (isSpeaking) return false;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return false;

        boolean forced = System.currentTimeMillis() < forceAwakeUntil || System.currentTimeMillis() < continuousUntil;
        // Cede o microfone ao motor web quando o app está aberto na tela (evita conflito de hardware)
        if (MainActivity.isAppInForeground && !forced) return false;
        if (forced) return true;
        if (prefOnlyAppOpen || prefPushToTalk) return false;

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        boolean screenOn = pm == null || pm.isInteractive();
        boolean locked = km != null && km.isKeyguardLocked();
        if (!screenOn && !prefScreenOff) return false;
        if (locked && prefOnlyUnlocked) return false;
        return true;
    }

    private void releaseAudioResources(AudioRecord rec, AutomaticGainControl agc, NoiseSuppressor ns, AcousticEchoCanceler aec) {
        try { if (agc != null) agc.release(); } catch (Exception ignored) {}
        try { if (ns != null) ns.release(); } catch (Exception ignored) {}
        try { if (aec != null) aec.release(); } catch (Exception ignored) {}
        if (rec != null) {
            try { rec.stop(); } catch (Exception ignored) {}
            try { rec.release(); } catch (Exception ignored) {}
        }
    }

    private void listenLoop() {
        int sr = 16000;
        int minBuf = AudioRecord.getMinBufferSize(sr, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int bufSize = Math.max(minBuf * 2, 8192);
        AudioRecord rec = null;
        AutomaticGainControl agc = null;
        NoiseSuppressor ns = null;
        AcousticEchoCanceler aec = null;

        double noiseFloor = 110.0;
        double hpPrevIn = 0.0, hpPrevOut = 0.0, lpPrevOut = 0.0;
        ArrayDeque<byte[]> preRoll = new ArrayDeque<>();

        while (running) {
            if (!canListenNow()) {
                if (rec != null) {
                    releaseAudioResources(rec, agc, ns, aec);
                    rec = null; agc = null; ns = null; aec = null;
                }
                hideGlow();
                try { Thread.sleep(250L); } catch (InterruptedException ignored) {}
                continue;
            }

            try {
                if (rec == null) {
                    rec = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, sr,
                            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufSize);
                    if (rec.getState() != AudioRecord.STATE_INITIALIZED) {
                        rec.release();
                        rec = null;
                        Thread.sleep(400L);
                        continue;
                    }
                    try {
                        int sid = rec.getAudioSessionId();
                        if (AutomaticGainControl.isAvailable()) {
                            agc = AutomaticGainControl.create(sid);
                            if (agc != null) agc.setEnabled(true);
                        }
                        if (NoiseSuppressor.isAvailable()) {
                            ns = NoiseSuppressor.create(sid);
                            if (ns != null) ns.setEnabled(true);
                        }
                        if (AcousticEchoCanceler.isAvailable()) {
                            aec = AcousticEchoCanceler.create(sid);
                            if (aec != null) aec.setEnabled(true);
                        }
                    } catch (Exception ignored) {}
                    rec.startRecording();
                }

                short[] chunk = new short[1600]; // 100ms
                int n = rec.read(chunk, 0, chunk.length);
                if (n <= 0) continue;

                long sumSq = 0;
                byte[] pcmBytes = new byte[n * 2];
                for (int i = 0; i < n; i++) {
                    double x = chunk[i];
                    double hp = 0.89 * (hpPrevOut + x - hpPrevIn);
                    hpPrevIn = x; hpPrevOut = hp;
                    double lp = lpPrevOut + 0.57 * (hp - lpPrevOut);
                    lpPrevOut = lp;
                    int amp = Math.max(-32768, Math.min(32767, (int) (lp * prefGain)));
                    sumSq += (long) amp * amp;
                    pcmBytes[i * 2] = (byte) (amp & 0xFF);
                    pcmBytes[i * 2 + 1] = (byte) ((amp >> 8) & 0xFF);
                }

                double rms = Math.sqrt((double) sumSq / n);
                double baseThresh = Math.max(115.0, 340.0 / Math.max(0.5, prefSensitivity));
                double threshold = Math.max(baseThresh, Math.min(noiseFloor, 180.0) * 1.35);
                boolean forced = System.currentTimeMillis() < forceAwakeUntil || System.currentTimeMillis() < continuousUntil;

                if (!forced && rms < threshold) {
                    noiseFloor = noiseFloor * 0.94 + rms * 0.06;
                    preRoll.addLast(pcmBytes);
                    while (preRoll.size() > 12) preRoll.removeFirst(); // 1.2s pré-buffer
                    continue;
                }

                ByteArrayOutputStream utterance = new ByteArrayOutputStream();
                for (byte[] b : preRoll) utterance.write(b);
                preRoll.clear();
                utterance.write(pcmBytes);

                if (forced) showGlow(1);
                long startSpeak = System.currentTimeMillis();
                long lastVoice = startSpeak;

                while (running && canListenNow() && (System.currentTimeMillis() - startSpeak < 8500L)) {
                    int r = rec.read(chunk, 0, chunk.length);
                    if (r <= 0) continue;
                    long s2 = 0;
                    byte[] b2 = new byte[r * 2];
                    for (int i = 0; i < r; i++) {
                        int a = Math.max(-32768, Math.min(32767, (int) (chunk[i] * prefGain)));
                        s2 += (long) a * a;
                        b2[i * 2] = (byte) (a & 0xFF);
                        b2[i * 2 + 1] = (byte) ((a >> 8) & 0xFF);
                    }
                    utterance.write(b2);
                    double curRms = Math.sqrt((double) s2 / r);
                    if (curRms >= threshold * 0.85) lastVoice = System.currentTimeMillis();
                    else if (System.currentTimeMillis() - lastVoice > 850L && utterance.size() > 12800) break;
                }

                byte[] fullPcm = utterance.toByteArray();
                if (fullPcm.length < 11000) { hideGlow(); continue; }

                if (forced) showGlow(2);
                sendAudioTurn(fullPcm, sr, !forced);
            } catch (Exception e) {
                releaseAudioResources(rec, agc, ns, aec);
                rec = null; agc = null; ns = null; aec = null;
                try { Thread.sleep(400L); } catch (InterruptedException ignored) {}
            }
        }
        releaseAudioResources(rec, agc, ns, aec);
    }

    private void wakeScreenBrieflyIfAllowed() {
        if (!prefWakeScreen) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) {
                @SuppressWarnings("deprecation")
                PowerManager.WakeLock screenWl = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "jarvis:wakeScreen"
                );
                screenWl.acquire(4000L);
            }
        } catch (Exception ignored) {}
    }

    private void sendAudioTurn(byte[] pcm, int sr, boolean requireWake) {
        HttpURLConnection c = null;
        try {
            updateNotifStatus("📤 Enviando fala para VM...");
            byte[] wav = buildWav(pcm, sr);
            JSONObject body = new JSONObject();
            body.put("audioBase64", Base64.encodeToString(wav, Base64.NO_WRAP));
            body.put("mimeType", "audio/wav");
            body.put("requireWakeWord", requireWake);
            body.put("identityToken", "Matheus-Admin");
            body.put("sessionId", "sess_main_admin");

            c = (HttpURLConnection) new URL(BASE + "/api/v1/voice/turn").openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json");
            c.setConnectTimeout(5000);
            c.setReadTimeout(22000);
            c.setDoOutput(true);
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.toString().getBytes("UTF-8"));
            }

            try (Scanner sc = new Scanner(c.getInputStream()).useDelimiter("\\\\A")) {
                JSONObject res = new JSONObject(sc.hasNext() ? sc.next() : "{}");
                boolean woke = res.optBoolean("woke", !requireWake);
                String reply = res.optString("reply", "");
                String transcript = res.optString("transcript", "");
                String audioB64 = res.optString("audioBase64", "");

                updateNotifStatus(transcript.isEmpty() ? "🎙️ Ouvindo 'Jarvis'..." : "👂 Ouviu: " + transcript);
                if (!woke && reply.isEmpty()) { hideGlow(); return; }
                forceAwakeUntil = 0L;
                wakeScreenBrieflyIfAllowed();

                if (transcript.toLowerCase().matches(".*(obrigado|pode descansar|encerrar|tchau).*")) {
                    continuousUntil = 0L;
                } else if (prefContinuousSec > 0) {
                    continuousUntil = System.currentTimeMillis() + (prefContinuousSec * 1000L);
                }

                if (reply.isEmpty() && woke) {
                    playChime(true);
                    showGlow(1);
                    return;
                }

                playReply(reply, audioB64);
            }
        } catch (Exception e) {
            updateNotifStatus("❌ Erro conexão VM: " + e.getClass().getSimpleName());
            hideGlow();
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private void playReply(String text, String audioB64) {
        String clean = (text == null ? "" : text).replaceAll("[*#_~\`>|]", "").trim();
        if (prefSilent || (clean.isEmpty() && (audioB64 == null || audioB64.isEmpty()))) {
            if (System.currentTimeMillis() < continuousUntil) showGlow(1); else hideGlow();
            return;
        }
        isSpeaking = true;
        showGlow(3);
        mainHandler.post(() -> {
            Runnable onDone = () -> {
                isSpeaking = false;
                if (System.currentTimeMillis() < continuousUntil) showGlow(1);
                else hideGlow();
            };
            if (audioB64 != null && !audioB64.isEmpty()) {
                try {
                    File f = File.createTempFile("jv_ph_", ".mp3", getCacheDir());
                    try (FileOutputStream fos = new FileOutputStream(f)) { fos.write(Base64.decode(audioB64, Base64.DEFAULT)); }
                    MediaPlayer mp = new MediaPlayer();
                    mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                    mp.setDataSource(f.getAbsolutePath());
                    mp.setOnCompletionListener(m -> { m.release(); f.delete(); onDone.run(); });
                    mp.setOnErrorListener((m, w, e) -> { m.release(); f.delete(); onDone.run(); return true; });
                    mp.prepare();
                    mp.start();
                    mainHandler.postDelayed(() -> { if (isSpeaking) onDone.run(); }, 25000L);
                    return;
                } catch (Exception ignored) {}
            }
            if (tts != null && ttsReady && !clean.isEmpty()) tts.speak(clean, TextToSpeech.QUEUE_FLUSH, null, "ph_ans");
            mainHandler.postDelayed(onDone, Math.max(2200L, clean.length() * 65L));
        });
    }

    private void playChime(boolean up) {
        if (!prefChime || prefSilent) return;
        new Thread(() -> {
            try {
                int sr = 16000, len = (int) (sr * 0.13);
                short[] pcm = new short[len];
                double f1 = up ? 587.33 : 783.99, f2 = up ? 880.0 : 587.33;
                for (int i = 0; i < len; i++) {
                    double f = i < len / 2 ? f1 : f2;
                    double env = Math.min(1.0, i / 50.0) * (1.0 - (double) i / len);
                    pcm[i] = (short) (Math.sin(2.0 * Math.PI * f * i / sr) * 14000 * env);
                }
                AudioTrack t = new AudioTrack.Builder()
                        .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                        .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(sr).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                        .setBufferSizeInBytes(pcm.length * 2).setTransferMode(AudioTrack.MODE_STATIC).build();
                t.write(pcm, 0, pcm.length);
                t.play();
                Thread.sleep(150);
                t.release();
            } catch (Exception ignored) {}
        }).start();
    }

    private void showGlow(int mode) {
        if (!prefEdgeGlow) { hideGlow(); return; }
        mainHandler.post(() -> {
            try {
                if (!Settings.canDrawOverlays(this)) return;
                if (wm == null) wm = (WindowManager) getSystemService(WINDOW_SERVICE);
                if (glowView == null) {
                    glowView = new EdgeGlowView(this);
                    int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN;
                    wm.addView(glowView, new WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, flags, PixelFormat.TRANSLUCENT));
                }
                glowView.setMode(mode);
                glowView.setVisibility(View.VISIBLE);
            } catch (Exception ignored) {}
        });
    }

    private void hideGlow() {
        mainHandler.post(() -> { if (glowView != null) glowView.setVisibility(View.GONE); });
    }

    private byte[] buildWav(byte[] pcm, int sr) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int totalDataLen = pcm.length + 36, byteRate = sr * 2;
        out.write("RIFF".getBytes());
        out.write(new byte[]{(byte)(totalDataLen & 0xff), (byte)((totalDataLen >> 8) & 0xff), (byte)((totalDataLen >> 16) & 0xff), (byte)((totalDataLen >> 24) & 0xff)});
        out.write("WAVEfmt ".getBytes());
        out.write(new byte[]{16, 0, 0, 0, 1, 0, 1, 0});
        out.write(new byte[]{(byte)(sr & 0xff), (byte)((sr >> 8) & 0xff), (byte)((sr >> 16) & 0xff), (byte)((sr >> 24) & 0xff)});
        out.write(new byte[]{(byte)(byteRate & 0xff), (byte)((byteRate >> 8) & 0xff), (byte)((byteRate >> 16) & 0xff), (byte)((byteRate >> 24) & 0xff)});
        out.write(new byte[]{2, 0, 16, 0});
        out.write("data".getBytes());
        out.write(new byte[]{(byte)(pcm.length & 0xff), (byte)((pcm.length >> 8) & 0xff), (byte)((pcm.length >> 16) & 0xff), (byte)((pcm.length >> 24) & 0xff)});
        out.write(pcm);
        return out.toByteArray();
    }

    @Override
    public void onDestroy() {
        running = false;
        hideGlow();
        if (tts != null) {
            try { tts.shutdown(); } catch (Exception ignored) {}
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }
}
`;
  for (const targetJvs of [
    'android/app/src/main/java/com/matheus/jarvis/JarvisVoiceService.java',
    'devices/phone/src/main/java/com/matheus/jarvis/JarvisVoiceService.java'
  ]) {
    if (fs.existsSync(path.dirname(targetJvs))) {
      fs.writeFileSync(targetJvs, jarvisVoiceServiceJava, 'utf8');
      console.log('✅ Atualizado: ' + targetJvs);
    }
  }

  // 6. build_apk.sh -> Evita embutir dist/server.js dentro do APK
  if (fs.existsSync('build_apk.sh')) {
    const cleanBuildApk = `#!/usr/bin/env bash
set -e
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which javac))))
export ANDROID_HOME=/home/ubuntu/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
echo "☕ JAVA_HOME: $JAVA_HOME"
echo "sdk.dir=/home/ubuntu/android-sdk" > android/local.properties

rm -rf public/download dist/public/download android/app/src/main/assets/public
npm run build:frontend

mkdir -p android/app/src/main/assets/public
cp -rf dist/index.html dist/settings.html dist/assets android/app/src/main/assets/public/ 2>/dev/null || true

cd android
chmod +x gradlew
./gradlew assembleDebug
mkdir -p /home/ubuntu/jarvis_releases ../dist/public/download
cp -f app/build/outputs/apk/debug/app-debug.apk /home/ubuntu/jarvis_releases/jarvis.apk
cp -f app/build/outputs/apk/debug/app-debug.apk ../dist/public/download/jarvis.apk
chmod 644 /home/ubuntu/jarvis_releases/jarvis.apk ../dist/public/download/jarvis.apk
echo "✅ APK compilado com sucesso (sem server.js embutido)!"
ls -lh /home/ubuntu/jarvis_releases/jarvis.apk
`;
    fs.writeFileSync('build_apk.sh', cleanBuildApk, 'utf8');
    fs.chmodSync('build_apk.sh', 0o755);
    console.log('✅ build_apk.sh atualizado');
  }

  // 7. Compila Backend + Frontend e reinicia PM2
  console.log('🔨 Compilando backend e frontend...');
  execSync('npm run build && npm run build:frontend', { stdio: 'inherit' });
  console.log('🚀 Reiniciando PM2...');
  execSync('pm2 flush && pm2 restart all --update-env && pm2 save', { stdio: 'inherit' });

  // 8. Commit e push para origin/main
  console.log('📤 Enviando Frente 5 para o GitHub (origin/main)...');
  execSync('git add -A', { stdio: 'inherit' });
  try {
    execSync('git commit -m "fix(voice,android): sincroniza preferencias de audio, evita conflito de mic 1o/2o plano e limpa vazamentos"', { stdio: 'inherit' });
  } catch {
    console.log('ℹ️ Sem alterações pendentes para novo commit.');
  }
  execSync('git push origin main', { stdio: 'inherit' });

  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  console.log('\n🎉 FRENTE 5 CONCLUÍDA, COMPILADA E ENVIADA AO GITHUB!');
} catch (err) {
  console.error('\n❌ ERRO NA FRENTE 5:', err.message);
  rollback();
  process.exit(1);
}
