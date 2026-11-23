package com.matheus.jarvis;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import android.webkit.MimeTypeMap;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.File;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class JarvisUiController {
    private static String norm(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s.toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "")
                .trim();
    }

    public static void execute(Context ctx, JSONObject obj) {
        String reqId = obj.optString("requestId", "");
        String action = obj.optString("action", "");
        JarvisAccessibilityService acc = JarvisAccessibilityService.instance;

        if ("search_files".equals(action)) {
            String q = obj.optString("query", "").trim();
            postAck(reqId, "ACK:" + searchLocalFiles(q));
            return;
        }
        if ("open_file".equals(action)) {
            String path = obj.optString("path", "").trim();
            postAck(reqId, "ACK:" + openLocalFile(ctx, path));
            return;
        }
        if ("open_app".equals(action)) {
            String app = obj.optString("app", obj.optString("text", "")).trim();
            if (acc != null && acc.launchApp(app)) {
                postAck(reqId, "ACK:Aplicativo '" + app + "' aberto.");
                return;
            }
            String res = JarvisAppLauncher.openByName(ctx, app);
            postAck(reqId, "ACK:" + (res != null ? res : "Não consegui abrir " + app));
            return;
        }

        if (acc == null) {
            postAck(reqId, "ACK:A Acessibilidade do JARVIS está desativada neste aparelho. Ative em Configurações > Acessibilidade > JARVIS Core.");
            return;
        }

        if ("read_screen".equals(action)) {
            postAck(reqId, "TEXT:" + acc.readScreenText());
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
            postAck(reqId, ok ? "ACK:Toque executado." : "ACK:Falha ao tocar na coordenada.");
            return;
        }
        if ("scroll".equals(action)) {
            acc.scrollScreen(obj.optString("direction", "down"));
            postAck(reqId, "ACK:Tela rolada.");
            return;
        }
        if ("type_text".equals(action) || "type_and_search".equals(action)) {
            String txt = obj.optString("text", "");
            boolean submit = "type_and_search".equals(action);
            boolean ok = acc.inputText(txt, submit);
            postAck(reqId, ok ? "ACK:Texto '" + txt + "' inserido." : "ACK:Nenhum campo editável encontrado na tela.");
            return;
        }
        if ("global".equals(action)) {
            String key = obj.optString("key", "back");
            int code = AccessibilityService.GLOBAL_ACTION_BACK;
            if ("home".equals(key)) code = AccessibilityService.GLOBAL_ACTION_HOME;
            else if ("recents".equals(key)) code = AccessibilityService.GLOBAL_ACTION_RECENTS;
            else if ("notifications".equals(key)) code = AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS;
            acc.performGlobalAction(code);
            postAck(reqId, "ACK:Navegação executada.");
        }
    }

    private static String searchLocalFiles(String query) {
        String q = norm(query);
        File root = Environment.getExternalStorageDirectory();
        String[] folders = new String[]{
            "Download", "Documents",
            "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents",
            "WhatsApp/Media/WhatsApp Documents", "Pictures"
        };
        List<String> found = new ArrayList<>();
        for (String rel : folders) {
            scanDir(new File(root, rel), q, found, 0);
            if (found.size() >= 12) break;
        }
        if (found.isEmpty()) {
            return "Nenhum arquivo encontrado para '" + query + "'. Verifique se a permissão 'Acesso a todos os arquivos' está ativada para o JARVIS.";
        }
        return "Arquivos encontrados (" + found.size() + "): " + String.join(" | ", found);
    }

    private static void scanDir(File dir, String q, List<String> out, int depth) {
        if (dir == null || !dir.exists() || !dir.isDirectory() || depth > 3 || out.size() >= 12) return;
        File[] list = dir.listFiles();
        if (list == null) return;
        for (File f : list) {
            if (out.size() >= 12) break;
            if (f.isDirectory()) scanDir(f, q, out, depth + 1);
            else if (q.isEmpty() || norm(f.getName()).contains(q)) {
                out.add(f.getName() + " [" + f.getAbsolutePath() + "]");
            }
        }
    }

    private static String openLocalFile(Context ctx, String path) {
        try {
            File f = new File(path);
            if (!f.exists()) return "Arquivo não encontrado em " + path;
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
            String ext = MimeTypeMap.getFileExtensionFromUrl(f.getName());
            String mime = ext != null ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase(Locale.ROOT)) : "*/*";
            if (mime == null) mime = "*/*";
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, mime);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            ctx.startActivity(i);
            return "Abrindo arquivo " + f.getName() + ".";
        } catch (Exception e) {
            return "Não foi possível abrir o arquivo: " + e.getMessage();
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
