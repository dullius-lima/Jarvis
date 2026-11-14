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
    r"\b(j[aá]\s*vi[su]?|jar\s*vis|jair\s*viz|iarvis|yarvis|djarvis|jarbas|jarves|jaives|javes|darvis|charvis|jaires|jairbis|jarlb[iy]s?|j[aá]bi|j[aá]\s*amiz|jaips|graves|jorps|j[aá]\s*arv[eê]s|de\s*[aá]rvores|de\s*arvies|j[aá]\s*vez|gerbis)\b",
    re.IGNORECASE
)

HALLUCINATION_RE = re.compile(
    r"^(obrigad[oa]|legendas.*|amara\.org.*|inscreva-se.*|tchau|sil[eê]ncio|you|thank you|bye|am[eé]m|[.\s!?,-]+)$",
    re.IGNORECASE
)

PROTECTED_PT_WORDS = {
    "juros", "jovens", "jovem", "jogar", "jogos", "jantar", "janela",
    "janeiro", "julho", "junho", "justo", "junto", "jeito", "jornal", "jardim"
}

def normalize_jarvis_phonetic(text: str) -> str:
    def repl(match):
        w = match.group(0)
        low = w.lower()
        if low in PROTECTED_PT_WORDS:
            return w
        sk = re.sub(r"[áàâãä]", "a", low)
        sk = re.sub(r"[éèêë]", "e", sk)
        sk = re.sub(r"[íìîï]", "i", sk)
        sk = re.sub(r"[óòôõö]", "o", sk)
        sk = re.sub(r"[úùûü]", "u", sk)
        sk = re.sub(r"^(?:ch|sh|x|g(?=[ei])|y|i(?=[aoe])|d?j)", "j", sk)
        sk = re.sub(r"[vbfp]", "v", sk)
        sk = re.sub(r"[szçc]", "s", sk)
        cons = re.sub(r"[aeiouh]", "", sk)
        if cons in {"jrvs", "jrv", "jvs", "jrs", "jrbs", "jps", "grvs", "drvs", "jr"} and 3 <= len(low) <= 9:
            return "Jarvis"
        return w

    text = WAKE_FIX_RE.sub("Jarvis", text)
    return re.sub(r"\b[A-Za-zÀ-ÿ]{3,9}\b", repl, text)

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

    raise RuntimeError("Audio invalido")

def main():
    model_size = sys.argv[1] if len(sys.argv) > 1 else "base"
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=4)
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
            sys.stdout.write(json.dumps({"success": False, "text": "", "error": "Curto"}) + "\n")
            sys.stdout.flush()
            continue

        try:
            audio = load_audio_16k_float32(file_path)
            if audio.size > 16000 * 9:
                audio = audio[:16000 * 9]

            peak = float(np.max(np.abs(audio))) if audio.size > 0 else 0.0
            rms = float(np.sqrt(np.mean(audio ** 2))) if audio.size > 0 else 0.0

            if peak < 0.48 or rms < 0.015:
                sys.stdout.write(json.dumps({"success": True, "text": "", "peak": round(peak, 4)}) + "\n")
                sys.stdout.flush()
                continue

            if peak < 0.80:
                gain = min(4.5, 0.80 / peak)
                audio = np.clip(audio * gain, -1.0, 1.0)

            segments, _ = model.transcribe(
                audio,
                language="pt",
                beam_size=1,
                best_of=2,
                without_timestamps=True,
                temperature=0.0,
                repetition_penalty=1.25,
                no_repeat_ngram_size=3,
                vad_filter=False,
                vad_parameters=dict(min_silence_duration_ms=450, speech_pad_ms=200),
                condition_on_previous_text=False,
                initial_prompt="Jarvis, oi Jarvis, manda um WhatsApp, envia mensagem, pergunta para minha mãe, esposa, filha, ligar, desligar, ar-condicionado, quarto de casal, sala, luz, agenda, e-mail."
            )
            text = " ".join([seg.text.strip() for seg in segments]).strip()

            words = text.lower().split()
            if len(words) > 6 and len(set(words)) <= 2:
                text = ""
            elif HALLUCINATION_RE.match(text):
                text = ""
            else:
                text = normalize_jarvis_phonetic(text)
                text = re.sub(r"\bno\s+vix[eê]s\b", "no 23", text, flags=re.IGNORECASE)
                text = re.sub(r"\b(ocorre|quarto)\s+de\s+casal\b", "quarto de casal", text, flags=re.IGNORECASE)
                text = re.sub(r"\b(ocelando|selando|ocilando)\b", "oscilando", text, flags=re.IGNORECASE)

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
