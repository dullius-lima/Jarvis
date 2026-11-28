package com.matheus.jarvis;

import android.Manifest;
import android.content.ContentProviderOperation;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.AlarmClock;
import android.provider.ContactsContract;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.KeyEvent;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class DeviceCommandExecutor {
    private static final String VM_HOST = "163.176.111.18";
    private static final String HTTP_BASE = "http://163.176.111.18";

    private static volatile Socket activeSocket;
    private static volatile boolean connecting = false;
    private static final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private static volatile boolean started = false;
    private static volatile String currentDeviceId = "galaxy_s25";

    public static void forceReconnect(Context ctx) {
        try { if (activeSocket != null) activeSocket.close(); } catch (Exception ignored) {}
        activeSocket = null;
        connecting = false;
        ensureConnected(ctx.getApplicationContext());
    }

    public static synchronized void startMesh(Context ctx, String deviceId) {
        currentDeviceId = JarvisDeviceIdentity.getDeviceId(ctx);
        if (started) return;
        started = true;
        final Context appCtx = ctx.getApplicationContext();
        scheduler.scheduleWithFixedDelay(() -> ensureConnected(appCtx), 1, 15, TimeUnit.SECONDS);
        scheduler.scheduleWithFixedDelay(() -> syncDeviceContext(appCtx, currentDeviceId), 4, 1800, TimeUnit.SECONDS);
    }

    private static void ensureConnected(Context ctx) {
        if (!JarvisDeviceIdentity.isPaired(ctx)) return;
        currentDeviceId = JarvisDeviceIdentity.getDeviceId(ctx);
        final String devToken = JarvisDeviceIdentity.getDeviceToken(ctx);
        if (connecting || (activeSocket != null && activeSocket.isConnected() && !activeSocket.isClosed())) return;
        connecting = true;
        new Thread(() -> {
            Socket sock = null;
            try {
                sock = new Socket();
                sock.connect(new InetSocketAddress(VM_HOST, 80), 6000);
                sock.setKeepAlive(true);
                InputStream in = sock.getInputStream();
                OutputStream out = sock.getOutputStream();

                byte[] nonce = new byte[16];
                new SecureRandom().nextBytes(nonce);
                String wsKey = Base64.encodeToString(nonce, Base64.NO_WRAP);
                String req = "GET /ws HTTP/1.1\r\nHost: " + VM_HOST + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: " + wsKey + "\r\nSec-WebSocket-Version: 13\r\n\r\n";
                out.write(req.getBytes(StandardCharsets.UTF_8));
                out.flush();

                ByteArrayOutputStream hdr = new ByteArrayOutputStream();
                int st = 0;
                while (st < 4) {
                    int b = in.read();
                    if (b == -1) throw new Exception("EOF WS");
                    hdr.write(b);
                    if ((st == 0 && b == '\r') || (st == 1 && b == '\n') || (st == 2 && b == '\r') || (st == 3 && b == '\n')) st++;
                    else st = (b == '\r') ? 1 : 0;
                }
                if (!hdr.toString("UTF-8").contains("101")) throw new Exception("WS recusado");

                activeSocket = sock;
                connecting = false;

                JSONObject reg = new JSONObject();
                reg.put("type", "register_device");
                reg.put("deviceId", currentDeviceId);
                reg.put("platform", "android");
                reg.put("deviceToken", devToken);
                reg.put("deviceType", JarvisDeviceIdentity.getDeviceType(ctx));
                reg.put("modelInfo", JarvisDeviceIdentity.getModelInfo());
                sendWsFrame(out, 0x1, reg.toString().getBytes(StandardCharsets.UTF_8));

                DataInputStream dis = new DataInputStream(in);
                while (activeSocket != null && !activeSocket.isClosed()) {
                    int b0 = dis.readUnsignedByte();
                    int b1 = dis.readUnsignedByte();
                    int op = b0 & 0x0F;
                    boolean masked = (b1 & 0x80) != 0;
                    long len = b1 & 0x7F;
                    if (len == 126) len = dis.readUnsignedShort();
                    else if (len == 127) len = dis.readLong();
                    byte[] mask = new byte[4];
                    if (masked) dis.readFully(mask);
                    if (len > 2_000_000L) break;
                    byte[] payload = new byte[(int) len];
                    if (len > 0) dis.readFully(payload);
                    if (masked) for (int i = 0; i < payload.length; i++) payload[i] = (byte) (payload[i] ^ mask[i % 4]);
                    if (op == 0x8) break;
                    else if (op == 0x9) sendWsFrame(out, 0xA, payload);
                    else if (op == 0x1) handleIncomingCommand(ctx, new String(payload, StandardCharsets.UTF_8));
                }
            } catch (Throwable ignored) {
            } finally {
                connecting = false;
                activeSocket = null;
                if (sock != null) try { sock.close(); } catch (Exception ignored) {}
            }
        }).start();
    }

    private static synchronized void sendWsFrame(OutputStream out, int op, byte[] data) throws Exception {
        int len = data != null ? data.length : 0;
        ByteArrayOutputStream f = new ByteArrayOutputStream();
        f.write(0x80 | (op & 0x0F));
        if (len < 126) f.write(0x80 | len);
        else if (len <= 65535) { f.write(0x80 | 126); f.write((len >> 8) & 0xFF); f.write(len & 0xFF); }
        else { f.write(0x80 | 127); for (int i = 7; i >= 0; i--) f.write((int) (((long) len >> (8 * i)) & 0xFF)); }
        byte[] mask = new byte[4];
        new SecureRandom().nextBytes(mask);
        f.write(mask);
        if (len > 0) {
            byte[] m = new byte[len];
            for (int i = 0; i < len; i++) m[i] = (byte) (data[i] ^ mask[i % 4]);
            f.write(m);
        }
        out.write(f.toByteArray());
        out.flush();
    }

    private static volatile long lastAutoSyncMs = 0L;
    public static void triggerSyncNow(Context ctx) {
        long now = System.currentTimeMillis();
        if (now - lastAutoSyncMs < 1800000L) return;
        lastAutoSyncMs = now;
        final Context app = ctx.getApplicationContext();
        scheduler.execute(() -> syncDeviceContext(app, currentDeviceId));
    }

    public static void handleIncomingCommand(Context ctx, String rawJson) {
        try {
            JSONObject obj = new JSONObject(rawJson);
            if ("device_auth_status".equals(obj.optString("type")) && "unpaired".equals(obj.optString("status"))) {
                JarvisDeviceIdentity.clearPairing(ctx);
                return;
            }
            if ("STOP_SENSORY".equals(obj.optString("type"))) {
                JarvisSensoryHelper.hideIdentificationPill();
                return;
            }
            if ("UI_CONTROL".equals(obj.optString("type"))) {
                if (SensitiveAppGuard.isProtectedNow()) return;
                JarvisUiController.execute(ctx, obj);
                return;
            }
            if ("CAPTURE_SENSORY".equals(obj.optString("type")) || "CAPTURE_SENSORY".equals(obj.optString("action"))) {
                if (SensitiveAppGuard.isProtectedNow()) return;
                JarvisSensoryHelper.handleCaptureRequest(ctx, currentDeviceId, obj.optString("requestId"), obj.optString("modality", "camera"), obj.optString("facing", "front"), obj.optBoolean("keepArmed", false), obj.optBoolean("allowContacts", false));
                return;
            }

            if (!"device_command".equals(obj.optString("type"))) return;
            String action = obj.optString("action", "");
            JSONObject p = obj.optJSONObject("payload");
            if (p == null) p = new JSONObject();

            if ("set_alarm".equals(action)) {
                ctx.startActivity(new Intent(AlarmClock.ACTION_SET_ALARM)
                    .putExtra(AlarmClock.EXTRA_HOUR, p.optInt("hour", 7))
                    .putExtra(AlarmClock.EXTRA_MINUTES, p.optInt("minute", 0))
                    .putExtra(AlarmClock.EXTRA_MESSAGE, p.optString("label", "JARVIS"))
                    .putExtra(AlarmClock.EXTRA_SKIP_UI, true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } else if ("set_timer".equals(action)) {
                ctx.startActivity(new Intent(AlarmClock.ACTION_SET_TIMER)
                    .putExtra(AlarmClock.EXTRA_LENGTH, p.optInt("seconds", 60))
                    .putExtra(AlarmClock.EXTRA_MESSAGE, p.optString("label", "JARVIS"))
                    .putExtra(AlarmClock.EXTRA_SKIP_UI, true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } else if ("open_app".equals(action)) {
                openInstalledApp(ctx, p.optString("app", "").toLowerCase().trim());
            } else if ("media_control".equals(action)) {
                dispatchMedia(ctx, p.optString("command", "toggle").toLowerCase());
            } else if ("delete_native_contact".equals(action)) {
                deleteNativeAndroidContact(ctx, p.optString("name", "").trim(), p.optString("phone", "").trim());
                scheduler.execute(() -> syncDeviceContext(ctx, currentDeviceId));
            } else if ("add_native_contact".equals(action)) {
                addNativeAndroidContact(ctx, p.optString("name", "").trim(), p.optString("phone", "").trim());
                scheduler.execute(() -> syncDeviceContext(ctx, currentDeviceId));
            } else if ("get_gallery_photo".equals(action)) {
                if (SensitiveAppGuard.isProtectedNow()) return;
                int idx = p.optInt("index", 0);
                String reqId = p.optString("requestId", "latest");
                scheduler.execute(() -> uploadGalleryPhoto(ctx, idx, reqId));
            } else if ("sync_now".equals(action)) {
                scheduler.execute(() -> syncDeviceContext(ctx, currentDeviceId));
            } else if ("wake_mic".equals(action)) {
                if (!SensitiveAppGuard.isProtectedNow()) {
                    try { JarvisVoiceService.class.getMethod("wakeNow").invoke(null); } catch (Exception ignored) {}
                }
            }
        } catch (Throwable ignored) {}
    }

    public static void deleteNativeAndroidContact(Context ctx, String name, String phone) {
        if ((name == null || name.isEmpty()) && (phone == null || phone.isEmpty())) return;
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.WRITE_CONTACTS) != PackageManager.PERMISSION_GRANTED) return;
        try {
            java.util.Set<Long> rawIds = new java.util.HashSet<>();
            String cleanName = name != null ? name.trim().toLowerCase() : "";
            String cleanDigits = phone != null ? phone.replaceAll("\\D", "") : "";
            String tailDigits = cleanDigits.length() >= 8 ? cleanDigits.substring(cleanDigits.length() - 8) : cleanDigits;

            try (Cursor c = ctx.getContentResolver().query(
                ContactsContract.Data.CONTENT_URI,
                new String[]{ContactsContract.Data.RAW_CONTACT_ID, ContactsContract.Data.MIMETYPE, ContactsContract.Data.DATA1},
                null, null, null)) {
                while (c != null && c.moveToNext()) {
                    long rawId = c.getLong(0);
                    String mime = c.getString(1);
                    String val = c.getString(2);
                    if (val == null) continue;
                    if (!cleanName.isEmpty() && ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE.equals(mime)) {
                        String nLow = val.trim().toLowerCase();
                        if (nLow.equals(cleanName) || nLow.contains(cleanName)) rawIds.add(rawId);
                    } else if (!tailDigits.isEmpty() && ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE.equals(mime)) {
                        String rowDigits = val.replaceAll("\\D", "");
                        if (rowDigits.endsWith(tailDigits)) rawIds.add(rawId);
                    }
                }
            }
            for (Long rawId : rawIds) {
                ctx.getContentResolver().delete(
                    ContactsContract.RawContacts.CONTENT_URI,
                    ContactsContract.RawContacts._ID + "=?",
                    new String[]{String.valueOf(rawId)}
                );
            }
        } catch (Throwable ignored) {}
    }

    public static void addNativeAndroidContact(Context ctx, String name, String phone) {
        if (name.isEmpty() || phone.isEmpty()) return;
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.WRITE_CONTACTS) != PackageManager.PERMISSION_GRANTED) return;
        try {
            ArrayList<ContentProviderOperation> ops = new ArrayList<>();
            ops.add(ContentProviderOperation.newInsert(ContactsContract.RawContacts.CONTENT_URI).withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, null).withValue(ContactsContract.RawContacts.ACCOUNT_NAME, null).build());
            ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI).withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0).withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE).withValue(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, name).build());
            ops.add(ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI).withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0).withValue(ContactsContract.Data.MIMETYPE, ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE).withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, phone).withValue(ContactsContract.CommonDataKinds.Phone.TYPE, ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE).build());
            ctx.getContentResolver().applyBatch(ContactsContract.AUTHORITY, ops);
        } catch (Throwable ignored) {}
    }

    public static void uploadGalleryPhoto(Context ctx, int indexOffset, String requestId) {
        String perm = Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_IMAGES : Manifest.permission.READ_EXTERNAL_STORAGE;
        if (ContextCompat.checkSelfPermission(ctx, perm) != PackageManager.PERMISSION_GRANTED) return;
        try (Cursor c = ctx.getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, new String[]{MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME}, null, null, MediaStore.Images.Media.DATE_ADDED + " DESC")) {
            if (c == null || !c.moveToPosition(Math.max(0, indexOffset))) return;
            Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, c.getLong(0));
            String fileName = c.getString(1);
            try (InputStream is = ctx.getContentResolver().openInputStream(uri)) {
                Bitmap raw = BitmapFactory.decodeStream(is);
                if (raw == null) return;
                if (raw.getWidth() > 1024 || raw.getHeight() > 1024) {
                    float sc = Math.min(1024f / raw.getWidth(), 1024f / raw.getHeight());
                    raw = Bitmap.createScaledBitmap(raw, Math.round(raw.getWidth() * sc), Math.round(raw.getHeight() * sc), true);
                }
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                raw.compress(Bitmap.CompressFormat.JPEG, 80, baos);
                JSONObject body = new JSONObject();
                body.put("requestId", requestId);
                body.put("fileName", fileName);
                body.put("imageBase64", Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP));
                postSecureJson(ctx, "/api/v1/device/gallery-upload", body.toString());
            }
        } catch (Throwable ignored) {}
    }

    public static void openInstalledApp(Context ctx, String q) {
        if (q.isEmpty()) return;
        PackageManager pm = ctx.getPackageManager();
        for (ApplicationInfo info : pm.getInstalledApplications(0)) {
            String lbl = String.valueOf(pm.getApplicationLabel(info)).toLowerCase();
            if (lbl.contains(q) || info.packageName.toLowerCase().contains(q)) {
                Intent launch = pm.getLaunchIntentForPackage(info.packageName);
                if (launch != null) { launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx.startActivity(launch); return; }
            }
        }
    }

    private static void dispatchMedia(Context ctx, String cmd) {
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        int code = "next".equals(cmd) ? KeyEvent.KEYCODE_MEDIA_NEXT : ("previous".equals(cmd) ? KeyEvent.KEYCODE_MEDIA_PREVIOUS : KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE);
        long now = SystemClock.uptimeMillis();
        am.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0));
        am.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0));
    }

    public static void syncDeviceContext(Context ctx, String deviceId) {
        if (!JarvisDeviceIdentity.isPaired(ctx)) return;
        try {
            JSONArray apps = new JSONArray();
            PackageManager pm = ctx.getPackageManager();
            for (ApplicationInfo info : pm.getInstalledApplications(0)) {
                if (pm.getLaunchIntentForPackage(info.packageName) == null) continue;
                apps.put(new JSONObject().put("name", pm.getApplicationLabel(info).toString()).put("packageName", info.packageName));
            }
            JSONArray contacts = new JSONArray();
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
                try (Cursor c = ctx.getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, new String[]{ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER}, null, null, null)) {
                    while (c != null && c.moveToNext() && contacts.length() < 5000) {
                        String n = c.getString(0), num = c.getString(1);
                        if (n != null && num != null) contacts.put(new JSONObject().put("name", n.trim()).put("phone", num.replaceAll("[^0-9+]", "")));
                    }
                }
            }
            postSecureJson(ctx, "/api/v1/device/sync-context", new JSONObject().put("deviceId", deviceId).put("apps", apps).put("contacts", new JSONArray()).toString());
            for (int i = 0; i < contacts.length(); i += 300) {
                JSONArray batch = new JSONArray();
                for (int j = i; j < Math.min(i + 300, contacts.length()); j++) batch.put(contacts.get(j));
                postSecureJson(ctx, "/api/v1/device/sync-context", new JSONObject().put("deviceId", deviceId).put("contacts", batch).toString());
            }
        } catch (Throwable ignored) {}
    }

    private static int postSecureJson(Context ctx, String path, String json) {
        try {
            String devId = JarvisDeviceIdentity.getDeviceId(ctx);
            String devTok = JarvisDeviceIdentity.getDeviceToken(ctx);
            if (devId.isEmpty() || devTok.isEmpty()) return 0;
            HttpURLConnection conn = (HttpURLConnection) new URL(HTTP_BASE + path).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("x-device-id", devId);
            conn.setRequestProperty("x-device-token", devTok);
            try (OutputStream os = conn.getOutputStream()) { os.write(json.getBytes(StandardCharsets.UTF_8)); }
            int code = conn.getResponseCode();
            conn.disconnect();
            return code;
        } catch (Throwable ignored) {}
        return 0;
    }
}
