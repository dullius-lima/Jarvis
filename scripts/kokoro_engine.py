import os, io, base64, hashlib, subprocess
import soundfile as sf
from kokoro_onnx import Kokoro

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "models", "kokoro", "kokoro-v1.0.onnx")
VOICES_PATH = os.path.join(BASE_DIR, "models", "kokoro", "voices-v1.0.bin")
CACHE_DIR = "/tmp/jarvis_tts_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

_kokoro = None

def get_kokoro():
    global _kokoro
    if _kokoro is None:
        _kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
    return _kokoro

def synthesize_fast_ptbr(text: str, voice: str = "pm_alex", speed: float = 1.08) -> str:
    clean = (text or "").strip()
    if not clean:
        return ""
    key = hashlib.md5(f"{voice}:{speed}:{clean}".encode("utf-8")).hexdigest()
    cache_file = os.path.join(CACHE_DIR, f"{key}.mp3")
    if os.path.exists(cache_file) and os.path.getsize(cache_file) > 200:
        with open(cache_file, "rb") as f:
            return base64.b64encode(f.read()).decode("ascii")

    engine = get_kokoro()
    samples, sr = engine.create(clean, voice=voice, speed=speed, lang="pt-br")
    wav_buf = io.BytesIO()
    sf.write(wav_buf, samples, sr, format="WAV")

    proc = subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", "24000", "-b:a", "48k", "-f", "mp3", "pipe:1"],
        input=wav_buf.getvalue(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=8
    )
    if proc.returncode != 0 or len(proc.stdout) < 200:
        raise RuntimeError("FFmpeg encode failed")

    with open(cache_file, "wb") as f:
        f.write(proc.stdout)
    return base64.b64encode(proc.stdout).decode("ascii")
