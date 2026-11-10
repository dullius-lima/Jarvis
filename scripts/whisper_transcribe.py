import sys
import json
import os
import subprocess
import warnings

warnings.filterwarnings("ignore")

def transcribe_audio(file_path: str, model_size: str = "base"):
    if not os.path.exists(file_path):
        print(json.dumps({"success": False, "error": f"Arquivo não encontrado: {file_path}"}))
        return

    # Garante conversão segura para WAV 16kHz Mono via FFmpeg (resolve 100% das incompatibilidades de codecs do celular)
    wav_path = file_path + ".wav"
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", file_path, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True
        )
        target_audio = wav_path
    except Exception:
        target_audio = file_path

    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        segments, info = model.transcribe(target_audio, language="pt", beam_size=5)
        text = " ".join([segment.text.strip() for segment in segments]).strip()

        print(json.dumps({
            "success": True,
            "engine": "faster-whisper",
            "model": model_size,
            "text": text
        }, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Erro na transcrição Whisper: {str(e)}"
        }, ensure_ascii=False))
    finally:
        if os.path.exists(wav_path):
            try: os.remove(wav_path)
            except: pass

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Caminho de áudio não informado."}))
        sys.exit(1)

    audio_path = sys.argv[1]
    chosen_model = sys.argv[2] if len(sys.argv) > 2 else "base"
    transcribe_audio(audio_path, chosen_model)
