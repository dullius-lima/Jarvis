package com.matheus.jarvis;

import android.app.UiModeManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.provider.Settings;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Scanner;
import java.util.UUID;

public class JarvisDeviceIdentity {
    private static final String BASE_URL = "http://163.176.111.18";

    public static String getDeviceType(Context ctx) {
        try {
            if (ctx.getPackageManager().hasSystemFeature(PackageManager.FEATURE_WATCH)) return "watch";
            UiModeManager um = (UiModeManager) ctx.getSystemService(Context.UI_MODE_SERVICE);
            if (um != null && um.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return "tv";
            int sw = ctx.getResources().getConfiguration().smallestScreenWidthDp;
            if (sw >= 600) return "tablet";
        } catch (Exception ignored) {}
        return "phone";
    }

    public static String getModelInfo() {
        String mfg = Build.MANUFACTURER != null ? Build.MANUFACTURER.trim() : "";
        String mod = Build.MODEL != null ? Build.MODEL.trim() : "Android";
        if (!mfg.isEmpty() && !mod.toLowerCase(Locale.ROOT).startsWith(mfg.toLowerCase(Locale.ROOT))) {
            return mfg + " " + mod;
        }
        return mod;
    }

    public static String getHardwareId(Context ctx) {
        Context app = ctx.getApplicationContext();
        SharedPreferences sp = app.getSharedPreferences("jarvis_device_identity", Context.MODE_PRIVATE);
        String saved = sp.getString("hw_id", null);
        if (saved != null && !saved.isEmpty()) return saved;

        String hwSeed = "";
        try {
            String aid = Settings.Secure.getString(app.getContentResolver(), Settings.Secure.ANDROID_ID);
            if (aid != null && aid.length() >= 6) hwSeed = aid.toLowerCase(Locale.ROOT);
        } catch (Exception ignored) {}
        if (hwSeed.isEmpty()) hwSeed = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        sp.edit().putString("hw_id", hwSeed).apply();
        return hwSeed;
    }

    public static boolean isPaired(Context ctx) {
        if (ctx == null) return false;
        String tok = getDeviceToken(ctx);
        return tok != null && !tok.isEmpty();
    }

    public static String getDeviceId(Context ctx) {
        SharedPreferences sp = ctx.getApplicationContext().getSharedPreferences("jarvis_device_identity", Context.MODE_PRIVATE);
        return sp.getString("paired_device_id", "");
    }

    public static String getDeviceToken(Context ctx) {
        SharedPreferences sp = ctx.getApplicationContext().getSharedPreferences("jarvis_device_identity", Context.MODE_PRIVATE);
        return sp.getString("paired_device_token", "");
    }

    public static String getCustomName(Context ctx) {
        SharedPreferences sp = ctx.getApplicationContext().getSharedPreferences("jarvis_device_identity", Context.MODE_PRIVATE);
        return sp.getString("paired_custom_name", "Não vinculado");
    }

    public static void clearPairing(Context ctx) {
        SharedPreferences sp = ctx.getApplicationContext().getSharedPreferences("jarvis_device_identity", Context.MODE_PRIVATE);
        sp.edit().remove("paired_device_id").remove("paired_device_token").remove("paired_custom_name").apply();
    }

    public static String pairWithCode(Context ctx, String rawCode) {
        try {
            Context app = ctx.getApplicationContext();
            String code = rawCode != null ? rawCode.trim().toUpperCase(Locale.ROOT) : "";
            if (code.isEmpty()) return "Introduza o Código de Acesso.";

            HttpURLConnection c = (HttpURLConnection) new URL(BASE_URL + "/api/v1/devices/pair").openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json");
            c.setConnectTimeout(6000);
            c.setReadTimeout(10000);
            c.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("pairingCode", code);
            body.put("hardwareId", getHardwareId(app));
            body.put("platform", "android");
            body.put("deviceType", getDeviceType(app));
            body.put("modelInfo", getModelInfo());

            try (OutputStream os = c.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int status = c.getResponseCode();
            InputStream is = status >= 200 && status < 300 ? c.getInputStream() : c.getErrorStream();
            Scanner sc = new Scanner(is, "UTF-8").useDelimiter("\\A");
            JSONObject res = new JSONObject(sc.hasNext() ? sc.next() : "{}");
            c.disconnect();

            if (res.optBoolean("success", false)) {
                String devId = res.optString("deviceId", "");
                String devTok = res.optString("deviceToken", "");
                String cName = res.optString("customName", "Dispositivo JARVIS");
                SharedPreferences sp = app.getSharedPreferences("jarvis_device_identity", Context.MODE_PRIVATE);
                sp.edit()
                    .putString("paired_device_id", devId)
                    .putString("paired_device_token", devTok)
                    .putString("paired_custom_name", cName)
                    .apply();
                DeviceCommandExecutor.forceReconnect(app);
                return "OK:" + cName;
            }
            return res.optString("error", "Código inválido.");
        } catch (Exception e) {
            return "Erro de rede: " + e.getMessage();
        }
    }
}
