package com.matheus.jarvis;
import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.Bundle;
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

    public String readScreenText() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return "";
        StringBuilder sb = new StringBuilder();
        collect(root, sb, 0);
        return sb.toString();
    }

    private void collect(AccessibilityNodeInfo n, StringBuilder sb, int d) {
        if (n == null || d > 12 || sb.length() > 1500) return;
        if (n.getText() != null) sb.append(n.getText()).append(" | ");
        else if (n.getContentDescription() != null) sb.append(n.getContentDescription()).append(" | ");
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
