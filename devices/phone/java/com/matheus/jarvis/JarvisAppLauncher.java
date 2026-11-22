package com.matheus.jarvis;

import android.app.ActivityOptions;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;

public class JarvisAppLauncher {
    private static String norm(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s.toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "")
                .replaceAll("[^a-z0-9 ]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    public static String openByName(Context ctx, String spokenApp) {
        String target = norm(spokenApp);
        if (target.isEmpty()) return null;
        if (target.equals("zap") || target.equals("whats")) target = "whatsapp";
        if (target.equals("insta")) target = "instagram";
        if (target.equals("yt")) target = "youtube";

        PackageManager pm = ctx.getPackageManager();
        List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
        String bestPkg = null;
        String bestLabel = null;

        for (ApplicationInfo app : apps) {
            Intent launch = pm.getLaunchIntentForPackage(app.packageName);
            if (launch == null) continue;
            String label = norm(pm.getApplicationLabel(app).toString());
            if (label.equals(target) || label.contains(target) || (target.length() >= 4 && target.contains(label))) {
                bestPkg = app.packageName;
                bestLabel = pm.getApplicationLabel(app).toString();
                if (label.equals(target)) break;
            }
        }

        if (bestPkg == null) {
            return "Não encontrei o aplicativo " + spokenApp + " instalado neste aparelho.";
        }

        Intent launchIntent = pm.getLaunchIntentForPackage(bestPkg);
        if (launchIntent == null) return "Não foi possível iniciar " + bestLabel + ".";
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);

        Bundle optsBundle = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            DisplayManager dm = (DisplayManager) ctx.getSystemService(Context.DISPLAY_SERVICE);
            if (dm != null) {
                for (Display d : dm.getDisplays()) {
                    String dName = d.getName() != null ? d.getName().toLowerCase(Locale.ROOT) : "";
                    if (d.getDisplayId() != Display.DEFAULT_DISPLAY &&
                        (dName.contains("vscreen") || dName.contains("agent") || dName.contains("virtual"))) {
                        ActivityOptions opts = ActivityOptions.makeBasic();
                        opts.setLaunchDisplayId(d.getDisplayId());
                        optsBundle = opts.toBundle();
                        break;
                    }
                }
            }
        }

        if (optsBundle != null) {
            ctx.startActivity(launchIntent, optsBundle);
            return "Abrindo " + bestLabel + " na tela virtual em segundo plano.";
        } else {
            ctx.startActivity(launchIntent);
            return "Abrindo " + bestLabel + ".";
        }
    }
}
