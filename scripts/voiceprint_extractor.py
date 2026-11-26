#!/usr/bin/env python3
import sys
import os
import json
import math
import wave
import struct
import subprocess
import tempfile

def convert_to_wav_16k(input_path: str, wav_path: str) -> bool:
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", input_path,
        "-af", "highpass=f=85,lowpass=f=7200",
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
        wav_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return res.returncode == 0 and os.path.exists(wav_path) and os.path.getsize(wav_path) > 100

def read_pcm16(wav_path: str):
    with wave.open(wav_path, "rb") as wf:
        sr = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)
        if len(raw) < 400:
            return [], sr
        samples = list(struct.unpack(f"<{len(raw)//2}h", raw))
        norm = [s / 32768.0 for s in samples]
        return norm, sr

def pre_emphasis(sig, coeff=0.95):
    if not sig:
        return []
    out = [sig[0]]
    for i in range(1, len(sig)):
        out.append(sig[i] - coeff * sig[i - 1])
    return out

def hz_to_mel(hz):
    return 2595.0 * math.log10(1.0 + hz / 700.0)

def mel_to_hz(mel):
    return 700.0 * (10.0 ** (mel / 2595.0) - 1.0)

def build_mel_filterbank(num_filters=24, fft_size=512, sr=16000, low_freq=100.0, high_freq=7200.0):
    low_mel = hz_to_mel(low_freq)
    high_mel = hz_to_mel(high_freq)
    mel_points = [low_mel + i * (high_mel - low_mel) / (num_filters + 1) for i in range(num_filters + 2)]
    hz_points = [mel_to_hz(m) for m in mel_points]
    bins = [int(math.floor((fft_size + 1) * h / sr)) for h in hz_points]
    n_spec = fft_size // 2 + 1
    fbank = []
    for m in range(1, num_filters + 1):
        filt = [0.0] * n_spec
        f_m_minus, f_m, f_m_plus = bins[m - 1], bins[m], bins[m + 1]
        for k in range(max(0, f_m_minus), min(n_spec, f_m)):
            if f_m != f_m_minus:
                filt[k] = (k - f_m_minus) / float(f_m - f_m_minus)
        for k in range(max(0, f_m), min(n_spec, f_m_plus)):
            if f_m_plus != f_m:
                filt[k] = (f_m_plus - k) / float(f_m_plus - f_m)
        fbank.append(filt)
    return fbank

def fft_mag_sq(frame, fft_size=512):
    x = [complex(frame[i] if i < len(frame) else 0.0, 0.0) for i in range(fft_size)]
    j = 0
    for i in range(1, fft_size):
        bit = fft_size >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j ^= bit
        if i < j:
            x[i], x[j] = x[j], x[i]
    length = 2
    while length <= fft_size:
        ang = -2.0 * math.pi / length
        wlen = complex(math.cos(ang), math.sin(ang))
        for i in range(0, fft_size, length):
            w = complex(1.0, 0.0)
            half = length // 2
            for k in range(half):
                u = x[i + k]
                v = x[i + k + half] * w
                x[i + k] = u + v
                x[i + k + half] = u - v
                w *= wlen
        length <<= 1
    n_spec = fft_size // 2 + 1
    return [(x[k].real * x[k].real + x[k].imag * x[k].imag) / fft_size for k in range(n_spec)]

def estimate_frame_pitch(frame, sr=16000):
    min_lag = int(sr / 300.0)
    max_lag = int(sr / 75.0)
    if len(frame) <= max_lag:
        return 0.0
    energy0 = sum(s * s for s in frame)
    if energy0 < 1e-5:
        return 0.0
    best_corr = 0.0
    best_lag = -1
    for lag in range(min_lag, max_lag + 1):
        corr = 0.0
        for i in range(len(frame) - lag):
            corr += frame[i] * frame[i + lag]
        norm_corr = corr / energy0
        if norm_corr > best_corr:
            best_corr = norm_corr
            best_lag = lag
    if best_corr >= 0.40 and best_lag > 0:
        hz = float(sr) / float(best_lag)
        # Corrige dobra de oitava comum em sinais fortes
        if hz > 210.0:
            hz *= 0.5
        return hz
    return 0.0

def extract_voiceprint(audio_path: str):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name
    try:
        if not convert_to_wav_16k(audio_path, wav_path):
            return {"ok": False, "error": "ffmpeg_failed"}
        samples, sr = read_pcm16(wav_path)
        if len(samples) < 3200:
            return {"ok": False, "error": "too_short"}

        emph = pre_emphasis(samples)
        frame_len = 400
        hop_len = 160
        fft_size = 512
        hamming = [0.54 - 0.46 * math.cos(2.0 * math.pi * n / (frame_len - 1)) for n in range(frame_len)]

        frames = []
        rms_list = []
        for start in range(0, len(emph) - frame_len, hop_len):
            raw_f = samples[start:start + frame_len]
            rms = math.sqrt(sum(v * v for v in raw_f) / frame_len)
            rms_list.append(rms)
            win_f = [emph[start + i] * hamming[i] for i in range(frame_len)]
            frames.append((win_f, raw_f, rms))

        if not frames:
            return {"ok": False, "error": "no_frames"}

        max_rms = max(rms_list)
        if max_rms < 0.004:
            return {"ok": False, "error": "silence"}

        vad_thresh = max(0.005, max_rms * 0.22)
        active = [(wf, rf, r) for (wf, rf, r) in frames if r >= vad_thresh]
        if len(active) < 8:
            active = sorted(frames, key=lambda item: item[2], reverse=True)[:max(8, len(frames)//3)]

        fbank = build_mel_filterbank(num_filters=24, fft_size=fft_size, sr=sr)
        num_mfcc = 16
        dct_mat = [
            [math.cos(math.pi * c * (m + 0.5) / 24.0) for m in range(24)]
            for c in range(1, num_mfcc + 1)
        ]

        mfcc_frames = []
        pitches = []
        subband_ratios = [0.0] * 8

        for win_f, raw_f, _ in active:
            spec = fft_mag_sq(win_f, fft_size=fft_size)
            mel_energies = []
            for filt in fbank:
                e = sum(spec[k] * filt[k] for k in range(len(filt)))
                mel_energies.append(math.log(max(e, 1e-10)))
            coeffs = [sum(dct_mat[c][m] * mel_energies[m] for m in range(24)) for c in range(num_mfcc)]
            mfcc_frames.append(coeffs)

            step = len(spec) // 8
            for b in range(8):
                band = sorted(spec[b * step:(b + 1) * step])
                if len(band) >= 4:
                    peak = band[-1] + 1e-10
                    valley = band[1] + 1e-10
                    subband_ratios[b] += math.log10(peak / valley)

            p = estimate_frame_pitch(raw_f, sr=sr)
            if p > 0:
                pitches.append(p)

        n_act = float(len(mfcc_frames))
        # Usa mediana por coeficiente (imune a vogais isoladas de cada frase)
        med_mfcc = []
        for i in range(num_mfcc):
            col = sorted(f[i] for f in mfcc_frames)
            med_mfcc.append(col[len(col) // 2])

        delta_frames = []
        for t in range(len(mfcc_frames)):
            prev_f = mfcc_frames[max(0, t - 1)]
            next_f = mfcc_frames[min(len(mfcc_frames) - 1, t + 1)]
            delta_frames.append([(next_f[i] - prev_f[i]) * 0.5 for i in range(num_mfcc)])
        mean_delta = [sum(d[i] for d in delta_frames) / n_act for i in range(num_mfcc)]
        mean_subband = [v / n_act for v in subband_ratios]

        if pitches:
            pitches_sorted = sorted(pitches)
            pitch_median = pitches_sorted[len(pitches_sorted) // 2]
            pitch_mean = sum(pitches) / len(pitches)
            pitch_std = math.sqrt(sum((x - pitch_mean) ** 2 for x in pitches) / len(pitches))
        else:
            pitch_median = 130.0
            pitch_std = 15.0

        weighted_mfcc = [med_mfcc[0] * 0.20] + [med_mfcc[i] * 1.15 for i in range(1, num_mfcc)]
        raw_vec = (
            weighted_mfcc +
            [d * 2.5 for d in mean_delta] +
            [s * 0.85 for s in mean_subband] +
            [
                ((pitch_median - 145.0) / 45.0) * 2.2,
                (pitch_std / 35.0) * 1.2,
                (pitch_median / 170.0) * 2.2,
                1.8 if pitches else 0.0
            ]
        )

        norm = math.sqrt(sum(v * v for v in raw_vec)) or 1.0
        l2_vec = [round(v / norm, 6) for v in raw_vec]
        avg_energy = sum(r for _, _, r in active) / n_act

        return {
            "ok": True,
            "pitchHz": round(pitch_median, 2),
            "energy": round(avg_energy, 5),
            "activeFrames": int(n_act),
            "embedding": l2_vec
        }
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
