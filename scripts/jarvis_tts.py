import sys, os, json, base64, asyncio, tempfile, subprocess

SAMPLE_PATH = os.path.join(os.getcwd(), "assets", "voices", "jarvis_reference.wav")
CFG_PATH = os.path.join(os.getcwd(), "assets", "voices", "voice_config.json")

PROFILES = {
    "pt-BR-AntonioNeural":   {"mul": 0.94, "bass": 4},
    "pt-BR-DonatoNeural":    {"mul": 0.85, "bass": 7},
    "pt-BR-HumbertoNeural":  {"mul": 0.90, "bass": 5},
    "pt-BR-FabioNeural":     {"mul": 1.02, "bass": 2},
    "pt-BR-NicolauNeural":   {"mul": 0.89, "bass": 6},
    "pt-BR-ValerioNeural":   {"mul": 0.87, "bass": 6},
    "pt-BR-JulioNeural":     {"mul": 0.98, "bass": 3},
    "pt-BR-FranciscaNeural": {"mul": 1.03, "bass": 0},
    "pt-BR-ThalitaNeural":   {"mul": 1.08, "bass": 0},
    "pt-BR-ManuelaNeural":   {"mul": 0.98, "bass": 1},
    "pt-BR-BrendaNeural":    {"mul": 1.05, "bass": 0},
    "pt-BR-GiovannaNeural":  {"mul": 1.11, "bass": 0},
}

def get_cfg():
    c = {"voice": "pt-BR-AntonioNeural", "rate": "+8%", "pitch": "-4Hz", "mode": "edge"}
    if os.path.exists(CFG_PATH):
        try: c.update({k: v for k, v in json.load(open(CFG_PATH)).items() if v})
        except Exception: pass
    return c

def pnum(v, s, lo, hi):
    try: return max(lo, min(hi, int(str(v).replace(s, "").replace("+", "").strip())))
    except Exception: return 0

async def main():
    if len(sys.argv) < 2: return
    text = sys.argv[1].strip()
    mode_arg = sys.argv[2] if len(sys.argv) > 2 else "auto"
    ov_v = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
    ov_r = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None
    ov_p = sys.argv[5] if len(sys.argv) > 5 and sys.argv[5] else None

    c = get_cfg()
    voice = ov_v or c["voice"]
    rn, pn = pnum(ov_r or c["rate"], "%", -30, 40), pnum(ov_p or c["pitch"], "Hz", -20, 20)
    mode = c["mode"] if mode_arg == "auto" else mode_arg
    out = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False).name
    eng = ""

    try:
        if mode == "clone" and os.path.exists(SAMPLE_PATH):
            try:
                from TTS.api import TTS
                TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=False).tts_to_file(
                    text=text, speaker_wav=SAMPLE_PATH, language="pt", file_path=out)
                eng = "xtts_clone"
            except Exception: pass

        if not eng:
            try:
                import edge_tts
                await edge_tts.Communicate(text=text, voice=voice, rate=f"{rn:+d}%", pitch=f"{pn:+d}Hz").save(out)
                if os.path.exists(out) and os.path.getsize(out) > 200: eng = f"edge:{voice}"
            except Exception: pass

        if not eng:
            from gtts import gTTS
            raw = out + ".raw.mp3"
            gTTS(text=text, lang="pt", tld="com.br").save(raw)
            pr = PROFILES.get(voice, PROFILES["pt-BR-AntonioNeural"])
            tp = max(0.72, min(1.35, pr["mul"] * (1.0 + pn / 100.0)))
            at = max(0.5, min(2.0, (1.0 + rn / 100.0) / tp))
            subprocess.run(["ffmpeg", "-y", "-i", raw, "-af", f"asetrate={int(24000*tp)},aresample=24000,atempo={at:.3f},bass=g={pr['bass']}", "-q:a", "4", out], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            if os.path.exists(raw): os.remove(raw)
            eng = f"shaped:{voice}"

        b64 = base64.b64encode(open(out, "rb").read()).decode("utf-8")
        print(json.dumps({"success": True, "engine": eng, "audioBase64": b64, "mimeType": "audio/mpeg"}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
    finally:
        if os.path.exists(out): os.remove(out)

if __name__ == "__main__": asyncio.run(main())
