package com.matheus.jarvis;
import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "JarvisDevice")
public class JarvisDevicePlugin extends Plugin {
    @PluginMethod
    public void executeScreenCommand(PluginCall call) {
        String cmd = call.getString("command", "").trim();
        String low = cmd.toLowerCase();
        JSObject ret = new JSObject();
        JarvisAccessibilityService acc = JarvisAccessibilityService.instance;

        if (low.startsWith("abrir ") || low.startsWith("abra ")) {
            String app = cmd.replaceFirst("(?i)^(abrir|abra)\\s+", "").trim();
            if (acc != null && acc.launchApp(app)) {
                ret.put("handled", true);
                ret.put("reply", "Abrindo " + app + " agora.");
                call.resolve(ret); return;
            }
        }
        if (acc != null) {
            if (low.equals("voltar")) { acc.performGlobalAction(1); ret.put("handled", true); ret.put("reply", "Voltando."); call.resolve(ret); return; }
            if (low.contains("tela inicial") || low.equals("home")) { acc.performGlobalAction(2); ret.put("handled", true); ret.put("reply", "Indo para a tela inicial."); call.resolve(ret); return; }
            if (low.startsWith("clicar em ") || low.startsWith("toque em ")) {
                String alvo = cmd.replaceFirst("(?i)^(clicar em|toque em)\\s+", "").trim();
                boolean ok = acc.clickByText(alvo);
                ret.put("handled", true);
                ret.put("reply", ok ? "Toquei em " + alvo + "." : "Não encontrei " + alvo + " na tela.");
                call.resolve(ret); return;
            }
            if (low.startsWith("digitar ") || low.startsWith("escrever ")) {
                String txt = cmd.replaceFirst("(?i)^(digitar|escrever)\\s+", "").trim();
                boolean ok = acc.inputText(txt);
                ret.put("handled", true);
                ret.put("reply", ok ? "Texto inserido." : "Nenhum campo de texto selecionado.");
                call.resolve(ret); return;
            }
        }
        ret.put("handled", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void openAssistantSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
