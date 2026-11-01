# scripts/whisper_transcribe.py
import sys
import json
import os
import warnings

warnings.filterwarnings("ignore")

def transcribe_audio(file_path: str, model_size: str = "small"):
    if not os.path.exists(file_path):
        print(json.dumps({"success": False, "error": f"Arquivo não encontrado: {file_path}"}))
        return

    # Tenta usar faster-whisper (até 4x mais rápido e leve em RAM)
    try:
        from faster_whisper import WhisperModel
        # int8 garante execução ultra-rápida tanto em CPU quanto GPU sem estourar memória
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        segments, info = model.transcribe(file_path, language="pt", beam_size=5)
        text = " ".join([segment.text.strip() for segment in segments]).strip()
        print(json.dumps({
            "success": True,
            "engine": "faster-whisper",
            "model": model_size,
            "language": info.language,
            "text": text
        }, ensure_ascii=False))
        return
    except ImportError:
        pass
    except Exception as e:
        # Fallback caso faster-whisper falhe
        sys.stderr.write(f"[Aviso faster-whisper]: {str(e)}\n")

    # Fallback para openai-whisper padrão
    try:
        import whisper
        model = whisper.load_model(model_size)
        result = model.transcribe(file_path, language="pt", fp16=False)
        text = result.get("text", "").strip()
        print(json.dumps({
            "success": True,
            "engine": "openai-whisper",
            "model": model_size,
            "language": "pt",
            "text": text
        }, ensure_ascii=False))
    except ImportError:
        print(json.dumps({
            "success": False,
            "error": "Biblioteca Whisper não instalada. Execute: pip install faster-whisper"
        }, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Erro na transcrição Whisper ({model_size}): {str(e)}"
        }, ensure_ascii=False))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Caminho de áudio não informado."}))
        sys.exit(1)

    audio_path = sys.argv[1]
    chosen_model = sys.argv[2] if len(sys.argv) > 2 else "small"
    transcribe_audio(audio_path, chosen_model)