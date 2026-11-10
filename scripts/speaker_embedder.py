import sys
import os
import json
import base64
import tempfile
import subprocess
import numpy as np

def extract_neural_embedding(b64_str: str):
    clean_b64 = b64_str.split(",")[-1].strip()
    raw_bytes = base64.b64decode(clean_b64)

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_in:
        tmp_in.write(raw_bytes)
        in_path = tmp_in.name

    out_wav = in_path + ".wav"
    try:
        # Converte para WAV 16kHz Mono usando FFmpeg
        subprocess.run(
            ["ffmpeg", "-y", "-i", in_path, "-ar", "16000", "-ac", "1", out_wav],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True
        )
        from resemblyzer import VoiceEncoder, preprocess_wav
        wav = preprocess_wav(out_wav)
        if len(wav) < 1600:
            return {"success": False, "error": "Áudio muito curto"}

        encoder = VoiceEncoder("cpu")
        embed = encoder.embed_utterance(wav)
        return {
            "success": True,
            "embedding": [round(float(x), 5) for x in embed.tolist()]
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        for p in (in_path, out_wav):
            if os.path.exists(p):
                try: os.remove(p)
                except: pass

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read().strip()
        if not input_data and len(sys.argv) > 1:
            input_data = sys.argv[1]
        res = extract_neural_embedding(input_data)
        print(json.dumps(res))
    except Exception as err:
        print(json.dumps({"success": False, "error": str(err)}))
