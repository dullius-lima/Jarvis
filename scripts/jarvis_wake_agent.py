#!/usr/bin/env python3
"""
JARVIS Neural Client - Agente de Escuta Contínua em Segundo Plano (Desktop Daemon)
Arquitetura:
  1. Detecção Local de Wake Word ("Jarvis") via Picovoice Porcupine (baixo consumo de CPU/RAM).
  2. Gravação por VAD (Voice Activity Detection) com silêncio dinâmico via pyaudio / webrtcvad / speech_recognition.
  3. STT Híbrido: Transcrição Whisper local (ou fallback envio de Base64 em JSON).
  4. Despacho HTTP POST com Session ID e Envelope Seguro para http://129.151.111.18
  5. TTS Ultrarrápido em Português com Edge-TTS / pyttsx3 com fallback.
"""

import os
import sys
import time
import json
import uuid
import wave
import io
import base64
import requests
import pyaudio
import pvporcupine

# Configurações do Servidor e Protocolo
BACKEND_URL = os.environ.get("JARVIS_BACKEND_URL", "http://129.151.111.18:3000/api/webhook/universal-inbox")
N8N_WEBHOOK_URL = os.environ.get("JARVIS_N8N_URL", "http://129.151.111.18:5678/webhook/jarvis-voice")
SHARED_SECRET_KEY = os.environ.get("JARVIS_SECRET_KEY", "jarvis_sec_8f92a10b4c73e91d")
PICOVOICE_ACCESS_KEY = os.environ.get("PICOVOICE_ACCESS_KEY", "YOUR_PICOVOICE_KEY_HERE")
SESSION_ID = os.environ.get("JARVIS_SESSION_ID", f"desktop-{uuid.uuid4().hex[:8]}")

# TTS Engine Selection (edge-tts assíncrono ou pyttsx3 síncrono offline)
def speak_response(text: str):
    """Sintetiza e reproduz a resposta do Jarvis nos alto-falantes locais."""
    if not text or not text.strip():
        return
    print(f"[JARVIS TTS] Sintetizando resposta: \"{text}\"")
    try:
        # Tentativa 1: edge-tts (voz neural de alta qualidade em português)
        import subprocess
        tmp_mp3 = "/tmp/jarvis_speech.mp3" if sys.platform != "win32" else "jarvis_speech.mp3"
        subprocess.run([
            "edge-tts",
            "--voice", "pt-BR-AntonioNeural",
            "--text", text,
            "--write-media", tmp_mp3
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Player de áudio multiplataforma (mpv, ffplay, afplay no Mac ou pygame)
        player = "mpv" if subprocess.run(["which", "mpv"], capture_output=True).returncode == 0 else "ffplay"
        if player == "ffplay":
            subprocess.run(["ffplay", "-nodisp", "-autoexit", tmp_mp3], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            subprocess.run(["mpv", "--really-quiet", tmp_mp3], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        print(f"[JARVIS TTS] Fallback para pyttsx3 offline ({e})")
        try:
            import pyttsx3
            engine = pyttsx3.init()
            engine.setProperty("rate", 185)
            # Seleciona voz em português se disponível
            voices = engine.getProperty("voices")
            for v in voices:
                if "pt" in v.id.lower() or "brazil" in v.name.lower():
                    engine.setProperty("voice", v.id)
                    break
            engine.say(text)
            engine.runAndWait()
        except Exception as pyttsx_err:
            print(f"[JARVIS TTS] Erro no player de voz: {pyttsx_err}")

def record_user_command(sample_rate=16000, silence_threshold_seconds=1.5, max_seconds=15) -> bytes:
    """Abre o microfone e grava o comando de voz até detectar silêncio prolongado."""
    print("[AUDIO] Ouvindo comando do usuário...")
    p = pyaudio.PyAudio()
    format = pyaudio.paInt16
    channels = 1
    chunk_size = 512
    
    stream = p.open(format=format, channels=channels, rate=sample_rate, input=True, frames_per_buffer=chunk_size)
    frames = []
    
    silence_chunks_limit = int((sample_rate / chunk_size) * silence_threshold_seconds)
    silence_counter = 0
    energy_threshold = 700  # Limiar de amplitude para detecção de voz
    has_started_speaking = False
    
    start_time = time.time()
    
    while True:
        data = stream.read(chunk_size, exception_on_overflow=False)
        frames.append(data)
        
        # Cálculo de energia de pico da amostra de 16-bit PCM
        import audioop
        rms = audioop.rms(data, 2)
        
        if rms > energy_threshold:
            has_started_speaking = True
            silence_counter = 0
        else:
            if has_started_speaking:
                silence_counter += 1
                if silence_counter > silence_chunks_limit:
                    print("[AUDIO] Silêncio detectado. Finalizando captura.")
                    break
                    
        if time.time() - start_time > max_seconds:
            print("[AUDIO] Tempo máximo de fala atingido.")
            break
            
    stream.stop_stream()
    stream.close()
    p.terminate()
    
    # Empacota em WAV na memória
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, 'wb') as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(p.get_sample_size(format))
        wf.setframerate(sample_rate)
        wf.writeframes(b''.join(frames))
        
    return wav_buffer.getvalue()

def transcribe_audio_whisper(wav_bytes: bytes) -> str:
    """Tenta transcrever localmente com faster-whisper/whisper se instalado."""
    try:
        from faster_whisper import WhisperModel
        # Usa modelo tiny ou base quantizado para rodar em <0.3s na CPU
        model = WhisperModel("base", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(io.BytesIO(wav_bytes), language="pt")
        text = " ".join([seg.text for seg in segments]).strip()
        print(f"[WHISPER LOCAL] Transcrição: \"{text}\"")
        return text
    except ImportError:
        print("[WHISPER LOCAL] faster-whisper não instalado. Áudio será enviado codificado ao backend.")
        return ""
    except Exception as e:
        print(f"[WHISPER LOCAL] Falha na transcrição local: {e}")
        return ""

def send_to_jarvis_backend(transcribed_text: str, audio_bytes: bytes) -> str:
    """Dispara a requisição HTTP POST para o endpoint do backend na nuvem."""
    audio_base64 = base64.b64encode(audio_bytes).decode('ascii')
    
    payload = {
        "sessionId": SESSION_ID,
        "source": "desktop_wake_word_daemon",
        "timestamp": int(time.time() * 1000),
        "channel": "audio_porcupine_vad",
        "text": transcribed_text,
        "audioPayload": {
            "mimeType": "audio/wav",
            "sampleRate": 16000,
            "dataBase64": audio_base64 if not transcribed_text else ""
        },
        "identityBadge": {
            "name": "Matheus Dullius (Desktop Local)",
            "role": "Proprietário & Administrador",
            "permissionLevel": "ADMIN_TOTAL"
        }
    }
    
    # Dispara contra o Universal Inbox ou Webhook do n8n
    targets = [BACKEND_URL, N8N_WEBHOOK_URL]
    
    for url in targets:
        try:
            print(f"[HTTP] Enviando comando para: {url}...")
            res = requests.post(
                url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "JARVIS-Python-Daemon/2.0",
                    "X-Jarvis-Secret": SHARED_SECRET_KEY,
                    "Authorization": f"Bearer {SHARED_SECRET_KEY}"
                },
                timeout=12
            )
            if res.ok:
                data = res.json()
                reply = data.get("reply") or data.get("text") or data.get("response") or data.get("message") or ""
                if reply:
                    return reply
        except Exception as req_err:
            print(f"[HTTP] Erro ao contactar {url}: {req_err}")
            
    return "Comando recebido pelo sistema neural Jarvis, senhor."

def main_wake_loop():
    """Loop perpétuo de escuta de fundo para a Wake Word 'Jarvis'."""
    print("=" * 65)
    print("  JARVIS NEURAL DAEMON - ESCUTA CONTÍNUA EM BACKGROUND")
    print(f"  Backend Ativo : {BACKEND_URL}")
    print(f"  Session ID    : {SESSION_ID}")
    print("=" * 65)
    
    porcupine = None
    pa = None
    audio_stream = None
    
    try:
        # Inicializa o Porcupine com a palavra-chave Jarvis
        try:
            porcupine = pvporcupine.create(
                access_key=PICOVOICE_ACCESS_KEY,
                keywords=["jarvis"],
                sensitivities=[0.65]
            )
        except Exception as e:
            print(f"[PORCUPINE] Chave inválida ou modelo ausente ({e}).")
            print("[PORCUPINE] Utilizando fallback de escuta contínua por microfone com VAD.")
            porcupine = None

        pa = pyaudio.PyAudio()
        
        if porcupine:
            audio_stream = pa.open(
                rate=porcupine.sample_rate,
                channels=1,
                format=pyaudio.paInt16,
                input=True,
                frames_per_buffer=porcupine.frame_length
            )
            print("[DAEMON] Aguardando palavra-chave: 'JARVIS'...")
            
            while True:
                pcm = audio_stream.read(porcupine.frame_length, exception_on_overflow=False)
                pcm = [int.from_bytes(pcm[i:i+2], byteorder='little', signed=True) for i in range(0, len(pcm), 2)]
                
                keyword_index = porcupine.process(pcm)
                if keyword_index >= 0:
                    print("\n[WAKE WORD] Palavra-chave 'JARVIS' detectada!")
                    # Som discreto de confirmação
                    speak_response("Sim, senhor?")
                    
                    # Pausa temporária no stream do Porcupine para gravar o comando
                    audio_stream.stop_stream()
                    
                    # 1. Grava áudio do usuário com detecção de silêncio
                    wav_data = record_user_command()
                    
                    # 2. Transcrição local se disponível
                    user_text = transcribe_audio_whisper(wav_data)
                    
                    # 3. Disparo HTTP para o backend
                    reply_text = send_to_jarvis_backend(user_text, wav_data)
                    
                    # 4. Síntese de voz com a resposta do Jarvis
                    speak_response(reply_text)
                    
                    # Retoma o stream de detecção contínua
                    audio_stream.start_stream()
                    print("[DAEMON] Retomando monitoramento de 'JARVIS'...")
        else:
            # Fallback direto: Gravação de microfone orientada por energia
            print("[DAEMON] Modo Fallback: Monitorando canal de áudio via RMS...")
            while True:
                wav_data = record_user_command(silence_threshold_seconds=2.0)
                user_text = transcribe_audio_whisper(wav_data)
                if "jarvis" in user_text.lower():
                    reply = send_to_jarvis_backend(user_text, wav_data)
                    speak_response(reply)
                time.sleep(0.5)

    except KeyboardInterrupt:
        print("\n[DAEMON] Encerrando serviço do Jarvis...")
    finally:
        if audio_stream is not None:
            audio_stream.close()
        if pa is not None:
            pa.terminate()
        if porcupine is not None:
            porcupine.delete()

if __name__ == "__main__":
    main_wake_loop()
