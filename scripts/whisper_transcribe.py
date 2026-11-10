# scripts/whisper_transcribe.py
import sys
import json
import os
import subprocess
import warnings

warnings.filterwarnings("ignore")

def convert_to_wav_16k(input_path: str) -> str:
    """
    Converte qualquer áudio (WebM, Ogg, MP4) para WAV 16kHz Mono 16-bit PCM via FFmpeg.
    """
    out_wav = input_path + ".converted.wav"
    try:
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            out_wav
        ]
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if res.returncode == 0 and os.path.exists(out_wav) and os.path.getsize(out_wav) > 1000:
            return out_wav
    except Exception:
        pass
    return input_path

def transcribe_audio(file_path: str, model_size: str = "base"):
    if not os.path.exists(file_path) or os.path.getsize(file_path) < 500:
        print(json.dumps({
            "success": False,
            "error": "Arquivo de áudio não encontrado ou vazio.",
            "text": ""
        }, ensure_ascii=False))
        return

    # Garante a conversão para WAV 16kHz para compatibilidade com o Whisper
    target_audio = convert_to_wav_16k(file_path)

    # 1. Tentativa com Faster-Whisper (int8 / CPU otimizado)
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        segments, info = model.transcribe(
            target_audio,
            language="pt",
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=400)
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
    except ImportError:
        pass
    except Exception as e:
        sys.stderr.write(f"[faster-whisper warning]: {str(e)}\n")

    # 2. Fallback com OpenAI-Whisper tradicional
    try:
        import whisper
        model = whisper.load_model(model_size)
        result = model.transcribe(target_audio, language="pt", fp16=False)
        text = result.get("text", "").strip()

        print(json.dumps({
            "success": True,
            "engine": "openai-whisper",
            "model": model_size,
            "language": "pt",
            "text": text
        }, ensure_ascii=False))
        return
    except ImportError:
        print(json.dumps({
            "success": False,
            "error": "Biblioteca Whisper não encontrada no ambiente virtual.",
            "text": ""
        }, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Erro na transcrição: {str(e)}",
            "text": ""
        }, ensure_ascii=False))
    finally:
        # Limpeza do arquivo WAV temporário convertido
        if target_audio != file_path and os.path.exists(target_audio):
            try:
                os.remove(target_audio)
            except Exception:
                pass

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Caminho do arquivo de áudio não fornecido.",
            "text": ""
        }, ensure_ascii=False))
        sys.exit(1)

    audio_path = sys.argv[1]
    chosen_model = sys.argv[2] if len(sys.argv) > 2 else "base"
    transcribe_audio(audio_path, chosen_model)
