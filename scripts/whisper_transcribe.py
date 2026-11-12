import sys
import json
import os
import subprocess
import warnings

warnings.filterwarnings("ignore")

def convert_to_wav_16k(input_path: str) -> str:
    if input_path.endswith(".wav"):
        return input_path
    out_wav = input_path + ".converted.wav"
    try:
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
            out_wav
        ]
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
        if res.returncode == 0 and os.path.exists(out_wav) and os.path.getsize(out_wav) > 500:
            return out_wav
    except Exception:
        pass
    return input_path

def transcribe_audio(file_path: str, model_size: str = "base"):
    if not os.path.exists(file_path) or os.path.getsize(file_path) < 300:
        print(json.dumps({"success": False, "error": "Arquivo de áudio vazio.", "text": ""}, ensure_ascii=False))
        return

    target_audio = convert_to_wav_16k(file_path)

    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        segments, info = model.transcribe(
            target_audio,
            language="pt",
            beam_size=5,
            vad_filter=False,
            condition_on_previous_text=False,
            initial_prompt="Jarvis. Oi Jarvis. Olá Jarvis. Comandos em português."
        )
        text = " ".join([segment.text.strip() for segment in segments]).strip()

        print(json.dumps({
            "success": True,
            "engine": "faster-whisper",
            "model": model_size,
            "language": getattr(info, "language", "pt"),
            "text": text
        }, ensure_ascii=False))
        return
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Erro no faster-whisper: {str(e)}",
            "text": ""
        }, ensure_ascii=False))
    finally:
        if target_audio != file_path and os.path.exists(target_audio):
            try:
                os.remove(target_audio)
            except Exception:
                pass

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Caminho não fornecido.", "text": ""}, ensure_ascii=False))
        sys.exit(1)

    audio_path = sys.argv[1]
    chosen_model = sys.argv[2] if len(sys.argv) > 2 else "base"
    transcribe_audio(audio_path, chosen_model)
