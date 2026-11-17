package com.matheus.jarvis;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.os.Bundle;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayList;
import java.util.List;

public class JarvisAccessibilityService extends AccessibilityService {
    public static JarvisAccessibilityService instance;

    @Override public void onServiceConnected() { super.onServiceConnected(); instance = this; }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {}
    @Override public void onInterrupt() {}
    @Override public void onDestroy() { super.onDestroy(); instance = null; }

    public String dumpScreenText() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return "Tela vazia ou inacessível.";
        List<String> items = new ArrayList<>();
        collectText(root, items);
        return String.join(" | ", items);
    }

    private void collectText(AccessibilityNodeInfo node, List<String> out) {
        if (node == null) return;
        if (node.getText() != null && node.getText().length() > 0) out.add(node.getText().toString());
        else if (node.getContentDescription() != null && node.getContentDescription().length() > 0) out.add(node.getContentDescription().toString());
        for (int i = 0; i < node.getChildCount(); i++) collectText(node.getChild(i), out);
    }

    public boolean clickByText(String target) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        for (AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByText(target)) {
            AccessibilityNodeInfo cur = node;
            while (cur != null) {
                if (cur.isClickable()) return cur.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                cur = cur.getParent();
            }
        }
        return false;
    }

    public boolean typeInFocused(String text) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        AccessibilityNodeInfo focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (focused == null) return false;
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        return focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
    }

    public boolean inputText(String text) { return typeInFocused(text); }

    public boolean scrollScreen(String direction) {
        Path p = new Path();
        if ("up".equalsIgnoreCase(direction)) { p.moveTo(540, 600); p.lineTo(540, 1600); }
        else { p.moveTo(540, 1600); p.lineTo(540, 600); }
        GestureDescription.Builder b = new GestureDescription.Builder();
        b.addStroke(new GestureDescription.StrokeDescription(p, 0, 260));
        return dispatchGesture(b.build(), null, null);
    }

    public boolean tapXY(float x, float y) {
        Path path = new Path();
        path.moveTo(x, y);
        GestureDescription.Builder builder = new GestureDescription.Builder();
        builder.addStroke(new GestureDescription.StrokeDescription(path, 0, 80));
        return dispatchGesture(builder.build(), null, null);
    }

    public String readScreenText() {
        return dumpScreenText();
    }

    public boolean launchApp(String appName) {
        if (appName == null || appName.trim().isEmpty()) return false;
        String target = appName.trim().toLowerCase();
        android.content.pm.PackageManager pm = getPackageManager();
        android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_MAIN, null);
        i.addCategory(android.content.Intent.CATEGORY_LAUNCHER);
        for (android.content.pm.ResolveInfo info : pm.queryIntentActivities(i, 0)) {
            String label = info.loadLabel(pm).toString().toLowerCase();
            String pkg = info.activityInfo.packageName.toLowerCase();
            if (label.equals(target) || label.contains(target) || pkg.contains(target)) {
                android.content.Intent launch = pm.getLaunchIntentForPackage(info.activityInfo.packageName);
                if (launch != null) {
                    launch.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(launch);
                    return true;
                }
            }
        }
        return false;
    }
}
