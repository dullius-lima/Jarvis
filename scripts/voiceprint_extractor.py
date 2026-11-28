#!/usr/bin/env python3
import sys
import os
import json
import wave
import subprocess
import tempfile
import numpy as np

MODEL_PATH = os.path.join(os.getcwd(), "models", "speaker", "wespeaker_resnet34.onnx")

def convert_to_wav_16k(input_path: str, wav_path: str) -> bool:
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", input_path,
        "-af", "highpass=f=85,lowpass=f=7600",
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
        wav_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return res.returncode == 0 and os.path.exists(wav_path) and os.path.getsize(wav_path) > 400

def read_pcm16(wav_path: str):
    with wave.open(wav_path, "rb") as wf:
        sr = wf.getframerate()
        raw = wf.readframes(wf.getnframes())
        if len(raw) < 800:
            return np.array([], dtype=np.float32), sr
        samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        return samples, sr

def compute_kaldi_fbank(active_samples: np.ndarray, sr: int = 16000) -> np.ndarray:
    try:
        import kaldi_native_fbank as knf
        opts = knf.FbankOptions()
        opts.frame_opts.dither = 0.0
        opts.frame_opts.snip_edges = False
        opts.frame_opts.samp_freq = float(sr)
        opts.mel_opts.num_bins = 80
        fbank = knf.OnlineFbank(opts)
        fbank.accept_waveform(float(sr), (active_samples * 32768.0).tolist())
        fbank.input_finished()
        n = fbank.num_frames_ready
        if n > 0:
            mel = np.array([fbank.get_frame(i) for i in range(n)], dtype=np.float32)
            return mel - np.mean(mel, axis=0, keepdims=True)
    except Exception:
        pass

    frame_len, hop_len, fft_size, num_filters = 400, 160, 512, 80
    n_frames = max(1, 1 + (len(active_samples) - frame_len) // hop_len)
    idx = np.arange(frame_len)[None, :] + np.arange(n_frames)[:, None] * hop_len
    idx = np.minimum(idx, len(active_samples) - 1)
    frames = active_samples[idx]
    emph = np.concatenate([frames[:, :1], frames[:, 1:] - 0.97 * frames[:, :-1]], axis=1)
    spec = (np.abs(np.fft.rfft(emph * np.hamming(frame_len)[None, :], n=fft_size, axis=1)) ** 2).astype(np.float32)
    low_mel = 2595.0 * np.log10(1.0 + 20.0 / 700.0)
    high_mel = 2595.0 * np.log10(1.0 + 7600.0 / 700.0)
    mel_pts = np.linspace(low_mel, high_mel, num_filters + 2)
    hz_pts = 700.0 * (10.0 ** (mel_pts / 2595.0) - 1.0)
    bins = np.floor((fft_size + 1) * hz_pts / sr).astype(int)
    fbank = np.zeros((num_filters, fft_size // 2 + 1), dtype=np.float32)
    for m in range(1, num_filters + 1):
        f0, f1, f2 = bins[m - 1], bins[m], bins[m + 1]
        if f1 > f0:
            fbank[m - 1, f0:f1] = (np.arange(f0, f1) - f0) / float(f1 - f0)
        if f2 > f1:
            fbank[m - 1, f1:f2] = (f2 - np.arange(f1, f2)) / float(f2 - f1)
    mel = np.log(np.maximum(np.dot(spec, fbank.T), 1e-10)).astype(np.float32)
    return mel - np.mean(mel, axis=0, keepdims=True)

def estimate_pitch_hz(samples: np.ndarray, sr: int = 16000) -> float:
    frame_len, hop_len = 400, 160
    min_lag, max_lag = int(sr / 320.0), int(sr / 75.0)
    pitches = []
    for start in range(0, len(samples) - frame_len, hop_len):
        f = samples[start:start + frame_len]
        e0 = float(np.dot(f, f))
        if e0 < 1e-4:
            continue
        ac = np.correlate(f, f, mode="full")[frame_len - 1:]
        seg = ac[min_lag:max_lag + 1] / e0
        best_idx = int(np.argmax(seg))
        if seg[best_idx] >= 0.42:
            hz = float(sr) / float(min_lag + best_idx)
            if hz > 220.0:
                hz *= 0.5
            pitches.append(hz)
    return float(np.median(pitches)) if pitches else 130.0

def extract_voiceprint(audio_path: str):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name
    try:
        if not convert_to_wav_16k(audio_path, wav_path):
            return {"ok": False, "error": "ffmpeg_failed"}
        samples, sr = read_pcm16(wav_path)
        if samples.size < 4800:
            return {"ok": False, "error": "too_short"}

        peak = float(np.max(np.abs(samples)))
        if peak < 0.004:
            return {"ok": False, "error": "silence"}
        if peak < 0.70:
            samples = np.clip(samples * min(4.5, 0.70 / peak), -0.95, 0.95)

        frame_len, hop_len = 400, 160
        n_frames = 1 + (len(samples) - frame_len) // hop_len
        if n_frames < 20:
            return {"ok": False, "error": "too_few_frames"}

        idx = np.arange(frame_len)[None, :] + np.arange(n_frames)[:, None] * hop_len
        frames = samples[idx]
        rms = np.sqrt(np.mean(frames ** 2, axis=1))
        noise_est = float(np.percentile(rms, 20))
        max_rms = float(np.max(rms))

        vad_thresh = max(0.012, noise_est * 1.8, max_rms * 0.28)
        active_frames = frames[rms >= vad_thresh]
        if active_frames.shape[0] < 18:
            top_k = max(18, int(n_frames * 0.40))
            active_frames = frames[np.argsort(rms)[-top_k:]]

        active_samples = active_frames.reshape(-1)
        mel_cmvn = compute_kaldi_fbank(active_samples, sr=sr)
        avg_energy = float(np.mean(rms[rms >= vad_thresh])) if np.any(rms >= vad_thresh) else float(np.mean(rms))
        pitch_hz = estimate_pitch_hz(active_samples, sr=sr)

        if os.path.exists(MODEL_PATH) and os.path.getsize(MODEL_PATH) > 1000000:
            import onnxruntime as ort
            sess = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
            in_name = sess.get_inputs()[0].name
            out = sess.run(None, {in_name: mel_cmvn[None, :, :]})[0]
            emb = out.reshape(-1).astype(np.float32)
            norm = float(np.linalg.norm(emb)) or 1.0
            emb = (emb / norm).tolist()
            return {
                "ok": True,
                "engine": "wespeaker-kaldi-256d",
                "pitchHz": round(pitch_hz, 2),
                "energy": round(avg_energy, 5),
                "activeFrames": int(active_frames.shape[0]),
                "embedding": [round(float(x), 6) for x in emb]
            }

        return {"ok": False, "error": "model_missing"}
    finally:
        if os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except Exception:
                pass

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "missing_path"}))
        sys.exit(1)
    print(json.dumps(extract_voiceprint(sys.argv[1])))
