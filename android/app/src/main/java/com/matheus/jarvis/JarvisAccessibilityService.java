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
import java.util.List;

public class JarvisAccessibilityService extends AccessibilityService {
    public static JarvisAccessibilityService instance;

    @Override public void onServiceConnected() { super.onServiceConnected(); instance = this; }
    @Override public void onAccessibilityEvent(AccessibilityEvent e) {}
    @Override public void onInterrupt() {}
    @Override public void onDestroy() { instance = null; super.onDestroy(); }

    public boolean clickByText(String target) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || target == null) return false;
        List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(target);
        for (AccessibilityNodeInfo n : nodes) {
            AccessibilityNodeInfo cur = n;
            while (cur != null) {
                if (cur.isClickable()) return cur.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                cur = cur.getParent();
            }
        }
        return false;
    }

    public boolean typeInFocused(String txt) {
        return inputText(txt);
    }

    public String dumpScreenText() {
        String txt = readScreenText();
        return txt.isEmpty() ? "Tela vazia ou inacessível." : txt;
    }

    public boolean tapXY(float x, float y) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false;
        Path path = new Path();
        path.moveTo(x, y);
        GestureDescription.Builder b = new GestureDescription.Builder();
        b.addStroke(new GestureDescription.StrokeDescription(path, 0, 80));
        return dispatchGesture(b.build(), null, null);
    }

    public boolean inputText(String txt) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        AccessibilityNodeInfo focus = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (focus != null) {
            Bundle b = new Bundle();
            b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, txt);
            return focus.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b);
        }
        return false;
    }

    public boolean tapPercent(float xPct, float yPct) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false;
        DisplayMetrics dm = getResources().getDisplayMetrics();
        float x = Math.max(1f, Math.min(dm.widthPixels - 1f, (xPct / 100f) * dm.widthPixels));
        float y = Math.max(1f, Math.min(dm.heightPixels - 1f, (yPct / 100f) * dm.heightPixels));
        Path path = new Path();
        path.moveTo(x, y);
        GestureDescription.Builder b = new GestureDescription.Builder();
        b.addStroke(new GestureDescription.StrokeDescription(path, 0, 70));
        return dispatchGesture(b.build(), null, null);
    }

    public boolean scrollScreen(String direction) {
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
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return "";
        StringBuilder sb = new StringBuilder();
        collect(root, sb, 0);
        return sb.toString();
    }

    private void collect(AccessibilityNodeInfo n, StringBuilder sb, int d) {
        if (n == null || d > 12 || sb.length() > 1500) return;
        if (n.getText() != null && n.getText().length() > 0) sb.append(n.getText()).append(" | ");
        else if (n.getContentDescription() != null && n.getContentDescription().length() > 0) sb.append(n.getContentDescription()).append(" | ");
        for (int i = 0; i < n.getChildCount(); i++) collect(n.getChild(i), sb, d + 1);
    }

    public boolean launchApp(String name) {
        String q = name.toLowerCase();
        Intent main = new Intent(Intent.ACTION_MAIN, null);
        main.addCategory(Intent.CATEGORY_LAUNCHER);
        for (android.content.pm.ResolveInfo ri : getPackageManager().queryIntentActivities(main, 0)) {
            String label = ri.loadLabel(getPackageManager()).toString().toLowerCase();
            if (label.contains(q) || ri.activityInfo.packageName.toLowerCase().contains(q)) {
                Intent li = getPackageManager().getLaunchIntentForPackage(ri.activityInfo.packageName);
                if (li != null) { li.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(li); return true; }
            }
        }
        return false;
    }
}
