# scripts/jarvis_sentinel.py
"""
Sentinela de Voz Always-On do Ecossistema JARVIS (100% Local em Background)
- Mantém o modelo Whisper 'small' (int8) pré-carregado na memória RAM para transcrição instantânea.
- Usa filtro de energia acústica (VAD) que consome < 1% de CPU enquanto o ambiente está em silêncio.
- Acorda automaticamente ao ouvir a palavra-gatilho "Jarvis" (ex: "Jarvis, qual a cotação da PETR4?" ou apenas "Jarvis").
- Captura opcionalmente o frame da Webcam para o Crachá Biométrico e envia para http://localhost:3333/api/v1/webhook/ingress.
- Fala a resposta do JARVIS em voz alta usando sintetizador nativo offline.
"""

import os
import sys
import time
import json
import wave
import tempfile
import urllib.request
import urllib.error
import subprocess
import warnings

warnings.filterwarnings("ignore")

# Configurações do Sentinela
BACKEND_URL = os.environ.get("JARVIS_BACKEND_URL", "http://localhost:3333/api/v1/webhook/ingress")
WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")
IDENTITY_TOKEN = os.environ.get("JARVIS_IDENTITY", "Matheus-Admin")
SESSION_ID = f"sentinel_{int(time.time())}"

SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_DURATION_SEC = 0.25  # Blocos de 250ms para detecção rápida de voz
SILENCE_LIMIT_SEC = 1.3    # Pausa de 1.3s encerra a frase
ENERGY_THRESHOLD = float(os.environ.get("MIC_ENERGY_THRESHOLD", "0.012"))  # Sensibilidade do microfone

# Variações fonéticas comuns para a Wake Word "Jarvis" em pt-BR
WAKE_WORDS = ["jarvis", "jarves", "jávis", "javes", "jarvis,", "jarvis."]


def play_chime(awake=True):
    """Emite o bipe futurista confirmando que o JARVIS escutou o gatilho."""
    try:
        import winsound
        if awake:
            winsound.Beep(587, 90)   # Ré
            winsound.Beep(880, 140)  # Lá (Subida: Acordou)
        else:
            winsound.Beep(880, 90)
            winsound.Beep(587, 120)  # Descida: Processando
    except Exception:
        pass


def speak_text_offline(text: str):
    """Lê a resposta do JARVIS em voz alta usando a voz nativa do Windows (zero custo de API)."""
    if not text or not text.strip():
        return
    clean_text = text.replace('"', "'").replace("\n", " ").strip()
    if sys.platform == "win32":
        ps_cmd = (
            f"Add-Type -AssemblyName System.Speech; "
            f"$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
            f"$synth.Rate = 1; "
            f"$synth.Speak(\"{clean_text}\");"
        )
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def capture_webcam_frame_base64():
    """Captura 1 frame rápido da webcam para o Crachá Biométrico se o OpenCV (cv2) estiver instalado."""
    try:
        import cv2
        import base64
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            return None
        ret, frame = cap.read()
        cap.release()
        if not ret:
            return None
        _, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        return base64.b64encode(buffer).decode("utf-8")
    except Exception:
        return None


def send_to_jarvis_orchestrator(command_text: str):
    """Envia o comando transcrito pelo Whisper small para o Webhook Ingress do servidor Node.js."""
    print(f"\n🚀 [Sentinela -> JARVIS]: \"{command_text}\"")
    webcam_b64 = capture_webcam_frame_base64()

    payload = {
        "identityToken": IDENTITY_TOKEN,
        "sessionId": SESSION_ID,
        "sensorData": {
            "type": "voice_wake_word",
            "inputSource": "python_voice_sentinel",
            "textPrompt": command_text,
            "webcamFrame": webcam_b64,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
    }

    req = urllib.request.Request(
        BACKEND_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            res_body = response.read().decode("utf-8")
            data = json.loads(res_body)
            reply = data.get("data", {}).get("response") or data.get("response") or "Comando processado."
            executed = data.get("data", {}).get("executedAgents") or []
            if executed:
                print(f"⛓️ [Especialistas Acionados]: {' -> '.join(executed)}")
            print(f"🤖 [JARVIS]: {reply}\n")
            speak_text_offline(reply)
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        print(f"❌ [Erro HTTP {e.code}]: {err_msg}")
    except Exception as e:
        print(f"❌ [Falha de Conexão com a porta 3333]: {e}")


def extract_command_after_wake_word(transcript: str):
    """Verifica se a frase contém 'Jarvis' e separa o comando."""
    lower = transcript.lower().strip()
    for wake in WAKE_WORDS:
        idx = lower.find(wake)
        if idx != -1:
            after = transcript[idx + len(wake):].strip(" ,.!?:;-")
            return True, after
    return False, ""


def main():
    print("=================================================================")
    print("🧠 SENTINELA DE VOZ JARVIS (BACKGROUND PYTHON + WHISPER SMALL)")
    print("=================================================================")

    try:
        import numpy as np
        import sounddevice as sd
    except ImportError:
        print("❌ Dependências de áudio ausentes! Instale com:")
        print("   pip install faster-whisper sounddevice numpy")
        sys.exit(1)

    print(f"⏳ Carregando modelo Whisper Local '{WHISPER_MODEL_SIZE}' (int8) na memória RAM...")
    try:
        from faster_whisper import WhisperModel
        whisper_model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
        engine_type = "faster-whisper"
    except ImportError:
        import whisper
        whisper_model = whisper.load_model(WHISPER_MODEL_SIZE)
        engine_type = "openai-whisper"

    print(f"✅ Motor [{engine_type} | {WHISPER_MODEL_SIZE}] carregado e pronto!")
    print("🎙️ Microfone em vigília contínua (baixo consumo). Diga 'Jarvis' seguido do comando...\n")

    chunk_samples = int(SAMPLE_RATE * CHUNK_DURATION_SEC)
    max_silence_chunks = int(SILENCE_LIMIT_SEC / CHUNK_DURATION_SEC)

    is_awake_waiting_command = False
    awake_Creation_time = 0.0

    with sd.InputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, dtype="float32") as stream:
        while True:
            try:
                # Se acordou apenas com "Jarvis", expira após 8 segundos se nada for dito
                if is_awake_waiting_command and (time.time() - awake_Creation_time > 8.0):
                    print("💤 [Sentinela]: Tempo de espera esgotado. Voltando ao modo vigília...")
                    is_awake_waiting_command = False

                audio_chunk, _ = stream.read(chunk_samples)
                rms_energy = float(np.sqrt(np.mean(audio_chunk ** 2)))

                # Filtro de Silêncio (Zero CPU quando ninguém está falando)
                if rms_energy < ENERGY_THRESHOLD:
                    continue

                # Voz detectada! Grava até a pessoa terminar de falar a frase
                recorded_chunks = [audio_chunk]
                silent_chunks = 0

                while silent_chunks < max_silence_chunks:
                    next_chunk, _ = stream.read(chunk_samples)
                    recorded_chunks.append(next_chunk)
                    next_rms = float(np.sqrt(np.mean(next_chunk ** 2)))
                    if next_rms < ENERGY_THRESHOLD:
                        silent_chunks += 1
                    else:
                        silent_chunks = 0

                    # Trava de segurança de 15 segundos por frase
                    if len(recorded_chunks) > int(15.0 / CHUNK_DURATION_SEC):
                        break

                full_audio = np.concatenate(recorded_chunks, axis=0)
                duration_sec = len(full_audio) / SAMPLE_RATE

                # Ignora ruídos muito curtos (< 0.45s)
                if duration_sec < 0.45:
                    continue

                # Salva em WAV temporário em memória/disco rápido para transcrição
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
                    tmp_path = tmp_wav.name

                pcm_int16 = (np.clip(full_audio, -1.0, 1.0) * 32767).astype(np.int16)
                with wave.open(tmp_path, "wb") as wf:
                    wf.setnchannels(CHANNELS)
                    wf.setsampwidth(2)
                    wf.setframerate(SAMPLE_RATE)
                    wf.writeframes(pcm_int16.tobytes())

                # Transcreve instantaneamente com o modelo já quente na RAM
                if engine_type == "faster-whisper":
                    segments, _ = whisper_model.transcribe(
                        tmp_path,
                        language="pt",
                        beam_size=5,
                        vad_filter=True
                    )
                    transcript = " ".join([seg.text.strip() for seg in segments]).strip()
                else:
                    res = whisper_model.transcribe(tmp_path, language="pt", fp16=False)
                    transcript = res.get("text", "").strip()

                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

                if not transcript:
                    continue

                # Caso 1: Já estava acordado esperando o comando (usuário disse "Jarvis" antes)
                if is_awake_waiting_command:
                    is_awake_waiting_command = False
                    play_chime(awake=False)
                    _, cleaned = extract_command_after_wake_word(transcript)
                    final_cmd = cleaned if cleaned else transcript
                    send_to_jarvis_orchestrator(final_cmd)
                    print("🎙️ Aguardando você chamar 'Jarvis'...")
                    continue

                # Caso 2: Verifica se a frase contém a palavra-gatilho "Jarvis"
                triggered, command_part = extract_command_after_wake_word(transcript)
                if triggered:
                    if len(command_part) >= 4:
                        # Usuário falou tudo junto: "Jarvis, qual a cotação da PETR4?"
                        play_chime(awake=True)
                        send_to_jarvis_orchestrator(command_part)
                        print("🎙️ Aguardando você chamar 'Jarvis'...")
                    else:
                        # Usuário falou apenas "Jarvis?" -> Acorda e escuta a próxima frase
                        play_chime(awake=True)
                        is_awake_waiting_command = True
                        awake_Creation_time = time.time()
                        print("⚡ [JARVIS ACORDOU]: Estou ouvindo, pode falar o comando...")

            except KeyboardInterrupt:
                print("\n🛑 Sentinela de voz encerrado pelo usuário.")
                break
            except Exception as err:
                print(f"⚠️ [Aviso Sentinela]: {err}")
                time.sleep(1)


if __name__ == "__main__":
    main()