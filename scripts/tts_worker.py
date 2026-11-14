import sys
import os
import json
import base64
import asyncio
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jarvis_tts import (
    VOICE_SAMPLE_PATH,
    CLONE_PROFILE_PATH,
    load_saved_config,
    analyze_reference_sample,
    synthesize_edge,
    apply_dsp_chain,
)

async def process_job(job: dict) -> dict:
    text = str(job.get("text", "")).strip()
    if not text:
        return {"success": False, "error": "Texto vazio"}

    cfg = load_saved_config()
    mode = job.get("mode") if job.get("mode") not in (None, "", "auto") else cfg["mode"]
    voice = job.get("voice") or cfg["voice"]
    rate = job.get("rate") or cfg["rate"]
    pitch = job.get("pitch") or cfg["pitch"]
    resonance = job.get("resonance") or cfg.get("resonance", "subtle")

    raw_mp3 = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False).name
    final_mp3 = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False).name

    try:
        clone_profile = None
        if mode == "clone" and os.path.exists(VOICE_SAMPLE_PATH):
            if os.path.exists(CLONE_PROFILE_PATH):
                try:
                    with open(CLONE_PROFILE_PATH, "r", encoding="utf-8") as f:
                        clone_profile = json.load(f)
                except Exception:
                    clone_profile = None
            if not clone_profile:
                clone_profile = analyze_reference_sample(VOICE_SAMPLE_PATH)
            if clone_profile:
                voice = clone_profile["base_voice"]
                delta = clone_profile["pitch_delta_hz"]
                pitch = f"{'+' if delta >= 0 else ''}{delta}Hz"

        await synthesize_edge(text, voice, rate, pitch, raw_mp3)
        try:
            apply_dsp_chain(raw_mp3, final_mp3, clone_profile, resonance)
            target = final_mp3
        except Exception:
            target = raw_mp3

        with open(target, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
        return {"success": True, "audioBase64": b64}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        for p in (raw_mp3, final_mp3):
            if os.path.exists(p):
                try: os.remove(p)
                except Exception: pass

def main():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    sys.stdout.write(json.dumps({"ready": True}) + "\n")
    sys.stdout.flush()

    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        try:
            job = json.loads(raw)
            res = loop.run_until_complete(process_job(job))
        except Exception as e:
            res = {"success": False, "error": str(e)}
        sys.stdout.write(json.dumps(res) + "\n")
        sys.stdout.flush()

if __name__ == "__main__":
    main()
