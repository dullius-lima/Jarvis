import sys
import json
import os
import wave
import subprocess
import warnings
import numpy as np

warnings.filterwarnings("ignore")

def load_audio_16k_float32(file_path: str) -> np.ndarray:
    # 1. Leitura direta de WAV 16kHz Mono PCM (0.1ms, sem depender de PyAV)
    try:
        with wave.open(file_path, "rb") as wf:
            if wf.getnchannels() == 1 and wf.getsampwidth() == 2 and wf.getframerate() == 16000:
                frames = wf.readframes(wf.getnframes())
                audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
                if audio.size > 1600:
                    return audio
    except Exception:
        pass

    # 2. Fallback universal via FFmpeg para qualquer formato (WebM, MP4, WAV 48kHz) direto na RAM
    cmd = [
        "ffmpeg", "-nostdin", "-threads", "1", "-i", file_path,
        "-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le", "-ar", "16000", "-"
    ]
    out = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5)
    if out.returncode == 0 and len(out.stdout) > 1600:
        return np.frombuffer(out.stdout, dtype=np.int16).astype(np.float32) / 32768.0

    raise RuntimeError(f"Falha ao decodificar audio ({os.path.getsize(file_path)} bytes)")

def main():
    model_size = sys.argv[1] if len(sys.argv) > 1 else "base"
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=2)
        # Aquecimento (warm-up) do modelo e do tokenizador em RAM
        dummy = np.zeros(8000, dtype=np.float32)
        segs, _ = model.transcribe(dummy, language="pt", beam_size=1, vad_filter=False)
        list(segs)
        sys.stdout.write(json.dumps({"ready": True, "model": model_size}) + "\n")
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"ready": False, "error": str(e)}) + "\n")
        sys.stdout.flush()
        return

    for line in sys.stdin:
        file_path = line.strip()
        if not file_path:
            continue
        if not os.path.exists(file_path) or os.path.getsize(file_path) < 300:
            sys.stdout.write(json.dumps({"success": False, "text": "", "error": "Arquivo muito curto"}) + "\n")
            sys.stdout.flush()
            continue

        try:
            audio = load_audio_16k_float32(file_path)
            peak = float(np.max(np.abs(audio))) if audio.size > 0 else 0.0

            # Se o áudio captado for puro silêncio digital, descarta sem gastar CPU
            if peak < 0.003:
                sys.stdout.write(json.dumps({
                    "success": True,
                    "text": "",
                    "peak": round(peak, 4),
                    "engine": "silence-skip"
                }) + "\n")
                sys.stdout.flush()
                continue

            # Normaliza o volume da voz para 85% do topo se estiver baixo
            if peak < 0.85:
                gain = min(18.0, 0.85 / peak)
                audio = np.clip(audio * gain, -1.0, 1.0)

            segments, info = model.transcribe(
                audio,
                language="pt",
                beam_size=2,
                vad_filter=False,
                condition_on_previous_text=False,
                initial_prompt="Jarvis. Oi Jarvis. Olá Jarvis. Comandos em português."
            )
            text = " ".join([seg.text.strip() for seg in segments]).strip()
            sys.stdout.write(json.dumps({
                "success": True,
                "engine": "faster-whisper-local-ram",
                "model": model_size,
                "peak": round(peak, 4),
                "text": text
            }, ensure_ascii=False) + "\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({
                "success": False,
                "text": "",
                "error": str(e)
            }, ensure_ascii=False) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    main()
