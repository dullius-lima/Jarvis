package com.matheus.jarvis;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import java.text.Normalizer;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class JarvisScreenController {

    private static String normalize(String input) {
        return Normalizer.normalize(input.toLowerCase().trim(), Normalizer.Form.NFD)
            .replaceAll("[\\p{InCombiningDiacriticalMarks}]", "");
    }

    public static String tryExecuteCommand(Context context, String rawCommand) {
        if (rawCommand == null || rawCommand.trim().isEmpty()) return null;
        String clean = rawCommand
            .replaceFirst("(?i)^(?:oi|ola|ei|ok|fala)?[\\s,.-]*(?:jarvis|javis|jarves|iarvis|jarbas)[\\s,.:!?-]*", "")
            .trim();
        String norm = normalize(clean);

        // 1. Abrir aplicativo instalado
        Matcher openMatcher = Pattern.compile("^(?:abra|abrir|abre|inicie|iniciar)\\s+(?:o\\s+|a\\s+)?(.+)$").matcher(norm);
        if (openMatcher.find()) {
            String appQuery = openMatcher.group(1).trim();
            if (!appQuery.contains("camera") && !appQuery.contains("notificac")) {
                String opened = openAppByName(context, appQuery);
                if (opened != null) {
                    return "Abrindo " + opened + ".";
                }
            }
        }

        // Comandos abaixo dependem do Serviço de Acessibilidade
        boolean needsAccessibility =
            norm.startsWith("clique em ") || norm.startsWith("clica em ") ||
            norm.startsWith("toque em ") || norm.startsWith("toca em ") ||
            norm.startsWith("digite ") || norm.startsWith("digita ") ||
            norm.startsWith("escreva ") || norm.startsWith("escreve ") ||
            norm.contains("role para baixo") || norm.contains("rolar para baixo") || norm.contains("desca a tela") ||
            norm.contains("role para cima") || norm.contains("rolar para cima") || norm.contains("suba a tela") ||
            norm.equals("voltar") || norm.equals("volte") || norm.contains("voltar tela") ||
            norm.contains("tela inicial") || norm.equals("inicio") || norm.equals("home") ||
            norm.contains("notificacoes") || norm.contains("aplicativos recentes") ||
            norm.contains("tire um print") || norm.contains("tirar print") || norm.contains("capturar tela");

        if (!needsAccessibility) return null;

        if (JarvisAccessibilityService.instance == null) {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            return "Para eu controlar a tela do celular, ative o JARVIS Core na lista de Acessibilidade que abri agora.";
        }

        JarvisAccessibilityService acc = JarvisAccessibilityService.instance;

        // 2. Clicar em botão/texto
        Matcher clickMatcher = Pattern.compile("^(?:clique|clica|toque|toca)\\s+(?:em|no|na)\\s+(.+)$", Pattern.CASE_INSENSITIVE).matcher(clean);
        if (clickMatcher.find()) {
            String target = clickMatcher.group(1).trim();
            boolean ok = acc.clickByText(target);
            return ok ? "Cliquei em " + target + "." : "Não encontrei o botão " + target + " na tela atual.";
        }

        // 3. Digitar texto
        Matcher typeMatcher = Pattern.compile("^(?:digite|digita|escreva|escreve)\\s+(.+)$", Pattern.CASE_INSENSITIVE).matcher(clean);
        if (typeMatcher.find()) {
            String textToType = typeMatcher.group(1).trim();
            boolean ok = acc.typeInFocused(textToType);
            return ok ? "Texto digitado." : "Nenhum campo de texto selecionado na tela.";
        }

        // 4. Rolar tela
        if (norm.contains("role para baixo") || norm.contains("rolar para baixo") || norm.contains("desca a tela")) {
            acc.scrollScreen("down");
            return "Rolando para baixo.";
        }
        if (norm.contains("role para cima") || norm.contains("rolar para cima") || norm.contains("suba a tela")) {
            acc.scrollScreen("up");
            return "Rolando para cima.";
        }

        // 5. Navegação do sistema e Print
        if (norm.equals("voltar") || norm.equals("volte") || norm.contains("voltar tela")) {
            acc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
            return "Voltando.";
        }
        if (norm.contains("tela inicial") || norm.equals("inicio") || norm.equals("home")) {
            acc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME);
            return "Indo para a tela inicial.";
        }
        if (norm.contains("notificacoes")) {
            acc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS);
            return "Abrindo notificações.";
        }
        if (norm.contains("aplicativos recentes")) {
            acc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS);
            return "Abrindo aplicativos recentes.";
        }
        if (norm.contains("tire um print") || norm.contains("tirar print") || norm.contains("capturar tela")) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                acc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_TAKE_SCREENSHOT);
                return "Captura de tela realizada.";
            }
        }

        return null;
    }

    public static String openAppByName(Context context, String query) {
        String target = normalize(query);
        PackageManager pm = context.getPackageManager();
        List<ApplicationInfo> apps = pm.getInstalledApplications(0);
        for (ApplicationInfo app : apps) {
            String label = pm.getApplicationLabel(app).toString();
            String normLabel = normalize(label);
            if (normLabel.contains(target) || app.packageName.toLowerCase().contains(target)) {
                Intent launch = pm.getLaunchIntentForPackage(app.packageName);
                if (launch != null) {
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(launch);
                    return label;
                }
            }
        }
        return null;
    }
}
