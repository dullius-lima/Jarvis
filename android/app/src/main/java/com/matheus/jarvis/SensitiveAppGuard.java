package com.matheus.jarvis;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public final class SensitiveAppGuard {
    private static volatile boolean protectedActive = false;
    private static volatile String currentPackage = "";

    private static final Set<String> PROTECTED_PACKAGES = new HashSet<>(Arrays.asList(
        "com.nu.production", "br.com.bb.android", "com.itau", "com.itau.pers",
        "com.bradesco", "com.bradesco.prime", "com.santander.app", "br.gov.caixa.tem",
        "br.com.gabba.Caixa", "br.com.intermedium", "com.c6bank.app", "com.btg.pactual.digital.mobile",
        "br.com.xp.carteira", "com.mercadopago.wallet", "com.picpay", "br.com.uol.ps.myaccount",
        "com.sicoob.sicoobnet", "br.com.sicredi.app", "com.original.bank", "com.neon",
        "com.safra.digital", "com.banrisul", "com.pan.app", "com.willbank.app",
        "br.gov.meugovbr", "com.google.android.apps.authenticator2", "com.azure.authenticator",
        "com.authy.authy", "com.x8bit.bitwarden", "com.onepassword.android", "com.lastpass.lpandroid",
        "com.samsung.android.samsungpass", "com.samsung.knox.securefolder",
        "com.android.packageinstaller", "com.google.android.packageinstaller",
        "com.google.android.gms.auth", "com.samsung.android.biometrics.app.setting"
    ));

    private static final String[] PROTECTED_KEYWORDS = {
        "bank", "banco", "bradesco", "itau", "santander", "caixa", "nubank", "sicredi",
        "sicoob", "pagseguro", "mercadopago", "picpay", "wallet", "corretora", "invest",
        "govbr", "authenticator", "bitwarden", "1password", "keepass", "knox", "samsungpass", "vault"
    };

    public static boolean isPackageProtected(String pkg) {
        if (pkg == null || pkg.trim().isEmpty()) return false;
        String low = pkg.toLowerCase(Locale.ROOT).trim();
        if (PROTECTED_PACKAGES.contains(low)) return true;
        for (String kw : PROTECTED_KEYWORDS) {
            if (low.contains(kw)) return true;
        }
        return false;
    }

    public static boolean updateForegroundPackage(String pkg) {
        if (pkg == null || pkg.isEmpty() || "com.matheus.jarvis".equals(pkg)) return protectedActive;
        if (pkg.contains("inputmethod") || pkg.contains("keyboard") || pkg.equals("com.android.systemui")) {
            return protectedActive;
        }
        currentPackage = pkg;
        protectedActive = isPackageProtected(pkg);
        return protectedActive;
    }

    public static boolean isProtectedNow() {
        return protectedActive;
    }

    public static String getCurrentPackage() {
        return currentPackage;
    }
}
