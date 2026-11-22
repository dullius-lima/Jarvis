package com.matheus.jarvis;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class JarvisUiController {
    public static void execute(Context ctx, JSONObject obj) {
        String reqId = obj.optString("requestId", "");
        String action = obj.optString("action", "");
        JarvisAccessibilityService acc = JarvisAccessibilityService.instance;

        if (acc == null) {
            postAck(reqId, "ACK:O serviço de Acessibilidade do JARVIS precisa estar ativado nas configurações deste aparelho.");
            return;
        }

        if ("read_screen".equals(action)) {
            String txt = acc.readScreenText();
            postAck(reqId, "TEXT:" + txt);
            return;
        }
        if ("click_text".equals(action)) {
            String target = obj.optString("text", "");
            boolean ok = acc.clickByText(target);
            postAck(reqId, ok ? "ACK:Cliquei em " + target + "." : "ACK:Não encontrei '" + target + "' clicável na tela.");
            return;
        }
        if ("tap_percent".equals(action)) {
            float x = (float) obj.optDouble("xPct", 50.0);
            float y = (float) obj.optDouble("yPct", 50.0);
            boolean ok = acc.tapPercent(x, y);
            postAck(reqId, ok ? "ACK:Toque executado na posição da tela." : "ACK:Não foi possível tocar na coordenada.");
            return;
        }
        if ("scroll".equals(action)) {
            String dir = obj.optString("direction", "down");
            acc.scrollScreen(dir);
            postAck(reqId, "ACK:Tela rolada.");
            return;
        }
        if ("type_text".equals(action)) {
            String txt = obj.optString("text", "");
            boolean ok = acc.inputText(txt);
            postAck(reqId, ok ? "ACK:Texto digitado." : "ACK:Nenhum campo de texto focado na tela.");
            return;
        }
        if ("global".equals(action)) {
            String key = obj.optString("key", "back");
            int code = AccessibilityService.GLOBAL_ACTION_BACK;
            if ("home".equals(key)) code = AccessibilityService.GLOBAL_ACTION_HOME;
            else if ("recents".equals(key)) code = AccessibilityService.GLOBAL_ACTION_RECENTS;
            else if ("notifications".equals(key)) code = AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS;
            acc.performGlobalAction(code);
            postAck(reqId, "ACK:Comando de navegação executado.");
        }
    }

    private static void postAck(String requestId, String payload) {
        if (requestId == null || requestId.isEmpty()) return;
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL("http://163.176.111.18/api/v1/sensory/frame").openConnection();
                c.setRequestMethod("POST");
                c.setRequestProperty("Content-Type", "application/json");
                c.setConnectTimeout(2500);
                c.setReadTimeout(2500);
                c.setDoOutput(true);
                JSONObject b = new JSONObject();
                b.put("requestId", requestId);
                b.put("imageBase64", payload);
                try (OutputStream os = c.getOutputStream()) { os.write(b.toString().getBytes("UTF-8")); }
                c.getResponseCode();
                c.disconnect();
            } catch (Exception ignored) {}
        }).start();
    }
}
