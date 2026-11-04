import sys
import os
import json
import base64
import asyncio
import tempfile

# Caminho onde ficará salva a sua gravação de voz para clonagem
VOICE_SAMPLE_PATH = os.path.join(os.getcwd(), "assets", "voices", "jarvis_reference.wav")

async def generate_edge_neural_voice(text: str, output_path: str):
    import edge_tts
    # Voz masculina neural brasileira com cadência e timbre ajustados estilo JARVIS
    communicate = edge_tts.Communicate(
        text=text,
        voice="pt-BR-AntonioNeural",
        rate="+8%",
        pitch="-4Hz"
    )
    await communicate.save(output_path)

def generate_cloned_voice_xtts(text: str, sample_wav: str, output_path: str):
    from TTS.api import TTS
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=False)
    tts.tts_to_file(
        text=text,
        speaker_wav=sample_wav,
        language="pt",
        file_path=output_path
    )

async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Texto vazio"}))
        return

    raw_text = sys.argv[1].strip()
    mode = sys.argv[2] if len(sys.argv) > 2 else "auto"

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        out_path = tmp.name

    try:
        # Se existir gravação de voz salva e o modo clone/XTTS estiver instalado, usa a voz clonada
        if mode == "clone" and os.path.exists(VOICE_SAMPLE_PATH):
            try:
                generate_cloned_voice_xtts(raw_text, VOICE_SAMPLE_PATH, out_path)
                engine_used = "xtts_voice_clone"
            except Exception:
                await generate_edge_neural_voice(raw_text, out_path)
                engine_used = "edge_neural_jarvis"
        else:
            await generate_edge_neural_voice(raw_text, out_path)
            engine_used = "edge_neural_jarvis"

        with open(out_path, "rb") as f:
            audio_b64 = base64.b64encode(f.read()).decode("utf-8")

        print(json.dumps({
            "success": True,
            "engine": engine_used,
            "audioBase64": audio_b64,
            "mimeType": "audio/mpeg"
        }))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
    finally:
        if os.path.exists(out_path):
            try:
                os.remove(out_path)
            except Exception:
                pass

if __name__ == "__main__":
    asyncio.run(main())
