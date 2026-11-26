package com.matheus.jarvis;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.graphics.Path;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;

public class JarvisAccessibilityService extends AccessibilityService {
    public static JarvisAccessibilityService instance;
    private boolean lastProtectedState = false;

    @Override public void onServiceConnected() { super.onServiceConnected(); instance = this; }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e == null || e.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkgCs = e.getPackageName();
        if (pkgCs == null) return;
        boolean nowProtected = SensitiveAppGuard.updateForegroundPackage(pkgCs.toString());
        if (nowProtected != lastProtectedState) {
            lastProtectedState = nowProtected;
            JarvisFloatingOrbManager.setSuspendedForSecurity(this, nowProtected);
            JarvisVoiceService.onSecurityLockChanged(nowProtected);
        }
    }

    @Override public void onInterrupt() {}
    @Override public void onDestroy() { instance = null; super.onDestroy(); }

    private static String norm(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s.toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
            .replaceAll("\\p{InCombiningDiacriticalMarks}+", "")
            .replaceAll("\\s+", " ")
            .trim();
    }

    public boolean clickByText(String target) {
        if (SensitiveAppGuard.isProtectedNow()) return false;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || target == null || target.trim().isEmpty()) return false;
        List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(target);
        for (AccessibilityNodeInfo n : nodes) {
            if (clickSelfOrParent(n)) return true;
        }
        AccessibilityNodeInfo fallback = findByTextOrDesc(root, norm(target), 0);
        return fallback != null && clickSelfOrParent(fallback);
    }

    private boolean clickSelfOrParent(AccessibilityNodeInfo n) {
        AccessibilityNodeInfo cur = n;
        while (cur != null) {
            if (cur.isClickable()) return cur.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            cur = cur.getParent();
        }
        return false;
    }

    private AccessibilityNodeInfo findByTextOrDesc(AccessibilityNodeInfo n, String q, int d) {
        if (n == null || d > 16) return null;
        String t = norm(n.getText() != null ? n.getText().toString() : "");
        String cd = norm(n.getContentDescription() != null ? n.getContentDescription().toString() : "");
        if ((!t.isEmpty() && t.contains(q)) || (!cd.isEmpty() && cd.contains(q))) return n;
        for (int i = 0; i < n.getChildCount(); i++) {
            AccessibilityNodeInfo found = findByTextOrDesc(n.getChild(i), q, d + 1);
            if (found != null) return found;
        }
        return null;
    }

    private AccessibilityNodeInfo findFirstEditable(AccessibilityNodeInfo n, int d) {
        if (n == null || d > 16) return null;
        if (n.isEditable() || (n.getClassName() != null && n.getClassName().toString().contains("EditText"))) {
            return n;
        }
        for (int i = 0; i < n.getChildCount(); i++) {
            AccessibilityNodeInfo found = findFirstEditable(n.getChild(i), d + 1);
            if (found != null) return found;
        }
        return null;
    }

    public boolean typeInFocused(String txt) { return inputText(txt, false); }
    public boolean inputText(String txt) { return inputText(txt, false); }

    public boolean inputText(String txt, boolean submitSearch) {
        if (SensitiveAppGuard.isProtectedNow()) return false;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        AccessibilityNodeInfo target = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (target == null) {
            target = findFirstEditable(root, 0);
            if (target != null) {
                target.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                target.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
            }
        }
        if (target == null) return false;
        Bundle b = new Bundle();
        b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, txt);
        boolean ok = target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b);
        if (ok && submitSearch && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            target.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
        }
        return ok;
    }

    public String dumpScreenText() {
        if (SensitiveAppGuard.isProtectedNow()) return "Bloqueado por segurança: aplicativo bancário/protegido ativo.";
        String txt = readScreenText();
        return txt.isEmpty() ? "Tela vazia ou inacessível." : txt;
    }

    public boolean tapXY(float x, float y) {
        if (SensitiveAppGuard.isProtectedNow()) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false;
        Path path = new Path();
        path.moveTo(x, y);
        GestureDescription.Builder b = new GestureDescription.Builder();
        b.addStroke(new GestureDescription.StrokeDescription(path, 0, 80));
        return dispatchGesture(b.build(), null, null);
    }

    public boolean tapPercent(float xPct, float yPct) {
        if (SensitiveAppGuard.isProtectedNow()) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false;
        DisplayMetrics dm = getResources().getDisplayMetrics();
        float x = Math.max(1f, Math.min(dm.widthPixels - 1f, (xPct / 100f) * dm.widthPixels));
        float y = Math.max(1f, Math.min(dm.heightPixels - 1f, (yPct / 100f) * dm.heightPixels));
        return tapXY(x, y);
    }

    public boolean scrollScreen(String direction) {
        if (SensitiveAppGuard.isProtectedNow()) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false;
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int x1 = dm.widthPixels / 2, y1 = (int)(dm.heightPixels * 0.72);
        int x2 = x1, y2 = (int)(dm.heightPixels * 0.28);
        if ("up".equalsIgnoreCase(direction)) {
            y1 = (int)(dm.heightPixels * 0.28); y2 = (int)(dm.heightPixels * 0.72);
        } else if ("left".equalsIgnoreCase(direction)) {
            x1 = (int)(dm.widthPixels * 0.80); x2 = (int)(dm.widthPixels * 0.20); y1 = y2 = dm.heightPixels / 2;
        } else if ("right".equalsIgnoreCase(direction)) {
            x1 = (int)(dm.widthPixels * 0.20); x2 = (int)(dm.widthPixels * 0.80); y1 = y2 = dm.heightPixels / 2;
        }
        Path path = new Path();
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);
        GestureDescription.Builder b = new GestureDescription.Builder();
        b.addStroke(new GestureDescription.StrokeDescription(path, 0, 260));
        return dispatchGesture(b.build(), null, null);
    }

    public String readScreenText() {
        if (SensitiveAppGuard.isProtectedNow()) return "";
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return "";
        StringBuilder sb = new StringBuilder();
        collect(root, sb, 0);
        return sb.toString();
    }

    private void collect(AccessibilityNodeInfo n, StringBuilder sb, int d) {
        if (n == null || d > 14 || sb.length() > 1800) return;
        String tag = n.isEditable() ? "[CAMPO] " : (n.isClickable() ? "[BTN] " : "");
        if (n.getText() != null && n.getText().length() > 0) sb.append(tag).append(n.getText()).append(" | ");
        else if (n.getContentDescription() != null && n.getContentDescription().length() > 0) sb.append(tag).append(n.getContentDescription()).append(" | ");
        for (int i = 0; i < n.getChildCount(); i++) collect(n.getChild(i), sb, d + 1);
    }

    public boolean launchApp(String name) {
        String q = norm(name);
        if (q.isEmpty()) return false;
        if (q.equals("zap") || q.equals("whats")) q = "whatsapp";
        if (q.equals("yt")) q = "youtube";
        if (q.equals("insta")) q = "instagram";
        Intent main = new Intent(Intent.ACTION_MAIN, null);
        main.addCategory(Intent.CATEGORY_LAUNCHER);
        String bestPkg = null;
        for (android.content.pm.ResolveInfo ri : getPackageManager().queryIntentActivities(main, 0)) {
            String label = norm(ri.loadLabel(getPackageManager()).toString());
            String pkg = norm(ri.activityInfo.packageName);
            if (label.equals(q) || label.contains(q) || pkg.contains(q)) {
                bestPkg = ri.activityInfo.packageName;
                if (label.equals(q)) break;
            }
        }
        if (bestPkg == null) return false;
        Intent li = getPackageManager().getLaunchIntentForPackage(bestPkg);
        if (li == null) return false;
        li.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        startActivity(li);
        return true;
    }
}
