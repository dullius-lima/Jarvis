package com.matheus.jarvis;

import android.content.Context;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

public class OpenWakeWordDetector {
    private static final String TAG = "JARVIS-OWW";
    private static final int STEP_SAMPLES = 1280;
    private static final int MEL_WINDOW = 76;
    private static final int MEL_STEP = 8;
    private static final int EMB_WINDOW = 16;

    private OrtEnvironment env;
    private OrtSession melSession;
    private OrtSession embSession;
    private OrtSession wakeSession;
    private boolean ready = false;

    private final float[] pcmCarry = new float[STEP_SAMPLES * 2];
    private int pcmCarryLen = 0;
    private final List<float[]> melFrames = new ArrayList<>();
    private final List<float[]> embFrames = new ArrayList<>();
    private long cooldownUntilMs = 0L;

    public OpenWakeWordDetector(Context ctx) {
        try {
            env = OrtEnvironment.getEnvironment();
            OrtSession.SessionOptions opts = new OrtSession.SessionOptions();
            opts.setIntraOpNumThreads(2);
            melSession = env.createSession(readAsset(ctx, "oww/melspectrogram.onnx"), opts);
            embSession = env.createSession(readAsset(ctx, "oww/embedding_model.onnx"), opts);
            wakeSession = env.createSession(readAsset(ctx, "oww/hey_jarvis_v0.1.onnx"), opts);
            for (int i = 0; i < EMB_WINDOW; i++) embFrames.add(new float[96]);
            ready = true;
            Log.i(TAG, "openWakeWord offline pronto.");
        } catch (Throwable t) {
            ready = false;
            Log.w(TAG, "Fallback VAD: " + t.getMessage());
        }
    }

    public boolean isReady() { return ready; }

    public synchronized float processPcm16(short[] samples, int length, float threshold) {
        if (!ready || samples == null || length <= 0) return -1f;
        long now = System.currentTimeMillis();
        if (now < cooldownUntilMs) return 0f;

        float maxScore = 0f;
        int offset = 0;
        while (offset < length) {
            int need = STEP_SAMPLES - pcmCarryLen;
            int take = Math.min(need, length - offset);
            for (int i = 0; i < take; i++) {
                pcmCarry[pcmCarryLen + i] = (float) samples[offset + i];
            }
            pcmCarryLen += take;
            offset += take;

            if (pcmCarryLen == STEP_SAMPLES) {
                float score = runStep(pcmCarry, STEP_SAMPLES);
                if (score > maxScore) maxScore = score;
                pcmCarryLen = 0;
            }
        }
        if (maxScore >= threshold) {
            cooldownUntilMs = now + 1800L;
            resetBuffers();
        }
        return maxScore;
    }

    public synchronized void resetBuffers() {
        pcmCarryLen = 0;
        melFrames.clear();
        embFrames.clear();
        for (int i = 0; i < EMB_WINDOW; i++) embFrames.add(new float[96]);
    }

    private float runStep(float[] pcmChunk, int len) {
        try {
            String melInName = melSession.getInputNames().iterator().next();
            try (OnnxTensor inTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(pcmChunk, 0, len), new long[]{1, len});
                 OrtSession.Result melRes = melSession.run(Collections.singletonMap(melInName, inTensor))) {
                float[] flatMel = flattenFloats(melRes.get(0).getValue());
                int newFrames = flatMel.length / 32;
                for (int f = 0; f < newFrames; f++) {
                    float[] frame = new float[32];
                    for (int b = 0; b < 32; b++) frame[b] = (flatMel[f * 32 + b] / 10.0f) + 2.0f;
                    melFrames.add(frame);
                }
            }

            float highest = 0f;
            while (melFrames.size() >= MEL_WINDOW) {
                float[] embInput = new float[MEL_WINDOW * 32];
                for (int i = 0; i < MEL_WINDOW; i++) System.arraycopy(melFrames.get(i), 0, embInput, i * 32, 32);
                for (int s = 0; s < MEL_STEP && !melFrames.isEmpty(); s++) melFrames.remove(0);

                String embInName = embSession.getInputNames().iterator().next();
                float[] embVec;
                try (OnnxTensor embTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(embInput), new long[]{1, MEL_WINDOW, 32, 1});
                     OrtSession.Result embRes = embSession.run(Collections.singletonMap(embInName, embTensor))) {
                    float[] rawEmb = flattenFloats(embRes.get(0).getValue());
                    embVec = new float[96];
                    System.arraycopy(rawEmb, 0, embVec, 0, Math.min(96, rawEmb.length));
                }

                embFrames.add(embVec);
                while (embFrames.size() > EMB_WINDOW) embFrames.remove(0);

                float[] wakeInput = new float[EMB_WINDOW * 96];
                for (int i = 0; i < EMB_WINDOW; i++) System.arraycopy(embFrames.get(i), 0, wakeInput, i * 96, 96);
                String wakeInName = wakeSession.getInputNames().iterator().next();
                try (OnnxTensor wakeTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(wakeInput), new long[]{1, EMB_WINDOW, 96});
                     OrtSession.Result wakeRes = wakeSession.run(Collections.singletonMap(wakeInName, wakeTensor))) {
                    float[] scoreArr = flattenFloats(wakeRes.get(0).getValue());
                    if (scoreArr.length > 0 && scoreArr[0] > highest) highest = scoreArr[0];
                }
            }
            return highest;
        } catch (Throwable t) {
            return 0f;
        }
    }

    private static float[] flattenFloats(Object obj) {
        if (obj instanceof float[]) return (float[]) obj;
        List<Float> list = new ArrayList<>();
        collectFloats(obj, list);
        float[] out = new float[list.size()];
        for (int i = 0; i < list.size(); i++) out[i] = list.get(i);
        return out;
    }

    private static void collectFloats(Object obj, List<Float> out) {
        if (obj instanceof float[]) {
            for (float v : (float[]) obj) out.add(v);
        } else if (obj instanceof Object[]) {
            for (Object child : (Object[]) obj) collectFloats(child, out);
        }
    }

    private static byte[] readAsset(Context ctx, String path) throws Exception {
        try (InputStream is = ctx.getAssets().open(path);
             ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int r;
            while ((r = is.read(buf)) != -1) bos.write(buf, 0, r);
            return bos.toByteArray();
        }
    }
}
