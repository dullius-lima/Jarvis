import sys
import os
import re
import json
import wave
import subprocess
import warnings
import numpy as np

warnings.filterwarnings("ignore")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

WAKE_FIX_RE = re.compile(
    r"\b(j[aá]\s*vi[su]|jar\s*vis|jair\s*viz|iarvis|yarvis|djarvis|jarbas|jarves|jaives|javes|darvis|charvis|jairbis|jarlb[iy]s?|j[aá]\s+a\s+vez|j[aá]\s+vez|j[aá]\s+abris[oa]?|javascript)\b",
    re.IGNORECASE
)

HALLUCINATION_RE = re.compile(
    r"^(o que [eé] o problema\??|o que [eé] isso\??|o que [eé] o seu nome\??|[eé],?\s*[eé]\.?|ah,?\s*ah\!?|n[aã]o [eé]\??|acha\!?|ainda n[aã]o\.?|obrigad[oa]|legendas.*|amara\.org.*|inscreva-se.*|tchau|sil[eê]ncio|you|thank you|bye|am[eé]m|[.\s\!?,-]+)$",
    re.IGNORECASE
)

def load_audio_16k_float32(file_path: str) -> np.ndarray:
    try:
        with wave.open(file_path, "rb") as wf:
            if wf.getnchannels() == 1 and wf.getsampwidth() == 2 and wf.getframerate() == 16000:
                frames = wf.readframes(wf.getnframes())
                audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
                if audio.size > 1600:
                    return audio
    except Exception:
        pass

    cmd = [
        "ffmpeg", "-nostdin", "-threads", "1", "-i", file_path,
        "-af", "highpass=f=85,lowpass=f=7600",
        "-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le", "-ar", "16000", "-"
    ]
    out = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5)
    if out.returncode == 0 and len(out.stdout) > 1600:
        return np.frombuffer(out.stdout, dtype=np.int16).astype(np.float32) / 32768.0

    raise RuntimeError("Audio invalido ou vazio")

def main():
    model_size = sys.argv[1] if len(sys.argv) > 1 else "small"
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=2)
        dummy = np.zeros(8000, dtype=np.float32)
        list(model.transcribe(dummy, language="pt", beam_size=1, vad_filter=False)[0])
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
        if not os.path.exists(file_path) or os.path.getsize(file_path) < 400:
            sys.stdout.write(json.dumps({"success": False, "text": "", "error": "Arquivo curto"}) + "\n")
            sys.stdout.flush()
            continue

        try:
            audio = load_audio_16k_float32(file_path)
            if audio.size > 16000 * 10:
                audio = audio[:16000 * 10]

            peak = float(np.max(np.abs(audio))) if audio.size > 0 else 0.0
            if peak < 0.015:
                sys.stdout.write(json.dumps({"success": True, "text": "", "peak": round(peak, 4)}) + "\n")
                sys.stdout.flush()
                continue

            # Normalização linear suave sem distorção (teto 0.70, ganho máximo 2.5x)
            if peak < 0.70:
                gain = min(2.5, 0.70 / peak)
                audio = np.clip(audio * gain, -0.95, 0.95)

            segments, _ = model.transcribe(
                audio,
                language="pt",
                beam_size=2,
                best_of=1,
                without_timestamps=True,
                temperature=0.0,
                repetition_penalty=1.20,
                no_repeat_ngram_size=3,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=420, speech_pad_ms=220, threshold=0.52),
                no_speech_threshold=0.65,
                condition_on_previous_text=False
            )
            text = " ".join([seg.text.strip() for seg in segments]).strip()

            words = text.lower().split()
            if len(words) > 6 and len(set(words)) <= 2:
                text = ""
            elif HALLUCINATION_RE.match(text):
                text = ""
            else:
                text = WAKE_FIX_RE.sub("Jarvis", text)

            sys.stdout.write(json.dumps({
                "success": True,
                "engine": "faster-whisper-local-ram",
                "model": model_size,
                "peak": round(peak, 4),
                "text": text
            }, ensure_ascii=False) + "\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"success": False, "text": "", "error": str(e)}, ensure_ascii=False) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    main()
