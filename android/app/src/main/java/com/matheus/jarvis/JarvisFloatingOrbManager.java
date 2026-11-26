package com.matheus.jarvis;

import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;

public class JarvisFloatingOrbManager {
    private static WindowManager wm;
    private static Orb3DView orbView;
    private static WindowManager.LayoutParams orbParams;
    private static LinearLayout chatCard;
    private static WindowManager.LayoutParams chatParams;
    private static TextView chatHistoryView;
    private static ScrollView chatScroll;
    private static boolean chatOpen = false;
    private static String orbState = "idle"; // idle | active
    private static volatile boolean suspendedForSecurity = false;
    private static final String BASE_URL = "http://163.176.111.18";

    private static int dp(Context ctx, int v) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, v, ctx.getResources().getDisplayMetrics()));
    }

    public static void setOrbState(String state) {
        orbState = state != null ? state : "idle";
        new Handler(Looper.getMainLooper()).post(() -> {
            if (orbView != null) orbView.invalidate();
        });
    }

    public static void attach(Context ctx) {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                Context appCtx = ctx.getApplicationContext();
                if (suspendedForSecurity || SensitiveAppGuard.isProtectedNow()) return;
                if (!Settings.canDrawOverlays(appCtx)) return;
                if (orbView != null) return;

                wm = (WindowManager) appCtx.getSystemService(Context.WINDOW_SERVICE);
                int sizePx = dp(appCtx, 58);

                orbView = new Orb3DView(appCtx);
                int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE;

                orbParams = new WindowManager.LayoutParams(
                        sizePx,
                        sizePx,
                        overlayType,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                        PixelFormat.TRANSLUCENT
                );
                orbParams.gravity = Gravity.TOP | Gravity.START;
                orbParams.x = dp(appCtx, 18);
                orbParams.y = dp(appCtx, 180);

                final int touchSlop = ViewConfiguration.get(appCtx).getScaledTouchSlop();
                orbView.setOnTouchListener(new View.OnTouchListener() {
                    private int initX, initY;
                    private float touchX, touchY;
                    private boolean moved;

                    @Override
                    public boolean onTouch(View v, MotionEvent e) {
                        switch (e.getActionMasked()) {
                            case MotionEvent.ACTION_DOWN:
                                initX = orbParams.x;
                                initY = orbParams.y;
                                touchX = e.getRawX();
                                touchY = e.getRawY();
                                moved = false;
                                return true;
                            case MotionEvent.ACTION_MOVE:
                                int dx = Math.round(e.getRawX() - touchX);
                                int dy = Math.round(e.getRawY() - touchY);
                                if (Math.abs(dx) > touchSlop || Math.abs(dy) > touchSlop) {
                                    moved = true;
                                }
                                if (moved && wm != null && orbView != null) {
                                    orbParams.x = initX + dx;
                                    orbParams.y = initY + dy;
                                    wm.updateViewLayout(orbView, orbParams);
                                    if (chatOpen && chatCard != null && chatParams != null) {
                                        chatParams.y = Math.max(dp(appCtx, 40), orbParams.y + sizePx + dp(appCtx, 8));
                                        wm.updateViewLayout(chatCard, chatParams);
                                    }
                                }
                                return true;
                            case MotionEvent.ACTION_UP:
                                if (!moved) {
                                    toggleMiniChat(appCtx);
                                }
                                return true;
                        }
                        return false;
                    }
                });

                wm.addView(orbView, orbParams);
            } catch (Exception ignored) {}
        });
    }

    
    public static void setSuspendedForSecurity(Context ctx, boolean suspended) {
        suspendedForSecurity = suspended;
        if (suspended) {
            detach();
        } else if (ctx != null) {
            attach(ctx.getApplicationContext());
        }
    }

    public static void detach() {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                if (wm != null && chatCard != null) wm.removeView(chatCard);
            } catch (Exception ignored) {}
            try {
                if (wm != null && orbView != null) wm.removeView(orbView);
            } catch (Exception ignored) {}
            chatCard = null;
            orbView = null;
            chatOpen = false;
        });
    }

        public static void openPairingCard(Context ctx) {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                if (chatOpen && chatCard != null) return;
                if (wm == null) wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);

                chatCard = new LinearLayout(ctx);
                chatCard.setOrientation(LinearLayout.VERTICAL);
                chatCard.setPadding(dp(ctx, 14), dp(ctx, 12), dp(ctx, 14), dp(ctx, 12));

                GradientDrawable cardBg = new GradientDrawable();
                cardBg.setColor(Color.parseColor("#F5080F1E"));
                cardBg.setCornerRadius(dp(ctx, 18));
                cardBg.setStroke(dp(ctx, 1), Color.parseColor("#F59E0B"));
                chatCard.setBackground(cardBg);

                LinearLayout header = new LinearLayout(ctx);
                header.setOrientation(LinearLayout.HORIZONTAL);
                TextView title = new TextView(ctx);
                title.setText("🔐 Vincular Dispositivo");
                title.setTextColor(Color.parseColor("#FBBF24"));
                title.setTextSize(13.5f);
                title.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
                TextView btnClose = new TextView(ctx);
                btnClose.setText("✕");
                btnClose.setTextColor(Color.parseColor("#94A3B8"));
                btnClose.setTextSize(15f);
                btnClose.setPadding(dp(ctx, 8), 0, dp(ctx, 4), 0);
                btnClose.setOnClickListener(v -> closeMiniChat());
                header.addView(title);
                header.addView(btnClose);
                chatCard.addView(header);

                TextView desc = new TextView(ctx);
                String curDev = JarvisDeviceIdentity.isPaired(ctx) ? ("Ligado: " + JarvisDeviceIdentity.getCustomName(ctx) + "\n") : "";
                desc.setText(curDev + "Introduza o Código de Acesso (JRV-...) gerado na aba Dispositivos:");
                desc.setTextColor(Color.parseColor("#CBD5E1"));
                desc.setTextSize(11.5f);
                desc.setPadding(0, dp(ctx, 6), 0, dp(ctx, 8));
                chatCard.addView(desc);

                EditText codeInput = new EditText(ctx);
                codeInput.setHint("Ex: JRV-4829-K7P2");
                codeInput.setHintTextColor(Color.parseColor("#64748B"));
                codeInput.setTextColor(Color.parseColor("#22D3EE"));
                codeInput.setTextSize(14f);
                codeInput.setSingleLine(true);
                codeInput.setPadding(dp(ctx, 10), dp(ctx, 8), dp(ctx, 10), dp(ctx, 8));
                GradientDrawable inBg = new GradientDrawable();
                inBg.setColor(Color.parseColor("#0F172A"));
                inBg.setCornerRadius(dp(ctx, 10));
                inBg.setStroke(1, Color.parseColor("#38BDF8"));
                codeInput.setBackground(inBg);
                chatCard.addView(codeInput);

                TextView statusTxt = new TextView(ctx);
                statusTxt.setTextColor(Color.parseColor("#F87171"));
                statusTxt.setTextSize(11f);
                statusTxt.setPadding(0, dp(ctx, 4), 0, dp(ctx, 6));
                chatCard.addView(statusTxt);

                TextView btnPair = new TextView(ctx);
                btnPair.setText("✅ Ativar Dispositivo");
                btnPair.setTextColor(Color.parseColor("#020617"));
                btnPair.setTextSize(13f);
                btnPair.setGravity(Gravity.CENTER);
                btnPair.setPadding(dp(ctx, 12), dp(ctx, 9), dp(ctx, 12), dp(ctx, 9));
                GradientDrawable btnBg = new GradientDrawable();
                btnBg.setColor(Color.parseColor("#22D3EE"));
                btnBg.setCornerRadius(dp(ctx, 12));
                btnPair.setBackground(btnBg);
                btnPair.setOnClickListener(v -> {
                    String code = codeInput.getText().toString().trim();
                    statusTxt.setTextColor(Color.parseColor("#38BDF8"));
                    statusTxt.setText("A validar código...");
                    new Thread(() -> {
                        String res = JarvisDeviceIdentity.pairWithCode(ctx, code);
                        new Handler(Looper.getMainLooper()).post(() -> {
                            if (res.startsWith("OK:")) {
                                closeMiniChat();
                                openMiniChat(ctx);
                                appendChat("✅ Ligado como: " + res.substring(3));
                            } else {
                                statusTxt.setTextColor(Color.parseColor("#F87171"));
                                statusTxt.setText("❌ " + res);
                            }
                        });
                    }).start();
                });
                chatCard.addView(btnPair);

                int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE;
                chatParams = new WindowManager.LayoutParams(
                        dp(ctx, 295),
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        overlayType,
                        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                        PixelFormat.TRANSLUCENT
                );
                chatParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
                chatParams.y = Math.max(dp(ctx, 60), (orbParams != null ? orbParams.y + dp(ctx, 66) : dp(ctx, 240)));
                wm.addView(chatCard, chatParams);
                chatOpen = true;
            } catch (Exception ignored) {}
        });
    }

    public static void toggleMiniChat(Context ctx) {
        if (chatOpen) {
            closeMiniChat();
        } else if (!JarvisDeviceIdentity.isPaired(ctx)) {
            openPairingCard(ctx);
        } else {
            openMiniChat(ctx);
        }
    }

    public static void closeMiniChat() {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                if (wm != null && chatCard != null) {
                    wm.removeView(chatCard);
                }
            } catch (Exception ignored) {}
            chatCard = null;
            chatOpen = false;
        });
    }

    public static void openMiniChat(Context ctx) {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                if (chatOpen && chatCard != null) return;
                if (wm == null) wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);

                chatCard = new LinearLayout(ctx);
                chatCard.setOrientation(LinearLayout.VERTICAL);
                chatCard.setPadding(dp(ctx, 12), dp(ctx, 10), dp(ctx, 12), dp(ctx, 10));

                GradientDrawable cardBg = new GradientDrawable();
                cardBg.setColor(Color.parseColor("#F0080F1E"));
                cardBg.setCornerRadius(dp(ctx, 18));
                cardBg.setStroke(dp(ctx, 1), Color.parseColor("#38BDF8"));
                chatCard.setBackground(cardBg);

                // Cabeçalho compacto
                LinearLayout header = new LinearLayout(ctx);
                header.setOrientation(LinearLayout.HORIZONTAL);
                header.setGravity(Gravity.CENTER_VERTICAL);

                TextView title = new TextView(ctx);
                title.setText("🌐 " + JarvisDeviceIdentity.getCustomName(ctx));
                title.setTextColor(Color.parseColor("#38BDF8"));
                title.setTextSize(13f);
                title.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

                TextView btnToken = new TextView(ctx);
                btnToken.setText("🔑 Token");
                btnToken.setTextColor(Color.parseColor("#FDE68A"));
                btnToken.setTextSize(11f);
                btnToken.setPadding(dp(ctx, 8), dp(ctx, 4), dp(ctx, 8), dp(ctx, 4));
                GradientDrawable tokBg = new GradientDrawable();
                tokBg.setColor(Color.parseColor("#1E293B"));
                tokBg.setCornerRadius(dp(ctx, 10));
                btnToken.setBackground(tokBg);
                LinearLayout.LayoutParams tokLp = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                tokLp.rightMargin = dp(ctx, 5);
                btnToken.setLayoutParams(tokLp);
                btnToken.setOnClickListener(v -> {
                    closeMiniChat();
                    openPairingCard(ctx);
                });

                TextView btnChrome = new TextView(ctx);
                btnChrome.setText("⚙️ Config");
                btnChrome.setTextColor(Color.parseColor("#E0F2FE"));
                btnChrome.setTextSize(11f);
                btnChrome.setPadding(dp(ctx, 8), dp(ctx, 4), dp(ctx, 8), dp(ctx, 4));
                GradientDrawable pillBg = new GradientDrawable();
                pillBg.setColor(Color.parseColor("#1E293B"));
                pillBg.setCornerRadius(dp(ctx, 10));
                btnChrome.setBackground(pillBg);
                btnChrome.setOnClickListener(v -> {
                    closeMiniChat();
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(BASE_URL + "/settings.html"));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(i);
                });

                TextView btnClose = new TextView(ctx);
                btnClose.setText("  ✕");
                btnClose.setTextColor(Color.parseColor("#94A3B8"));
                btnClose.setTextSize(15f);
                btnClose.setPadding(dp(ctx, 8), dp(ctx, 2), dp(ctx, 4), dp(ctx, 2));
                btnClose.setOnClickListener(v -> closeMiniChat());

                header.addView(title);
                header.addView(btnToken);
                header.addView(btnChrome);
                header.addView(btnClose);
                chatCard.addView(header);

                // Área de mensagens
                chatScroll = new ScrollView(ctx);
                LinearLayout.LayoutParams scrollLp = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, dp(ctx, 150));
                scrollLp.topMargin = dp(ctx, 8);
                scrollLp.bottomMargin = dp(ctx, 8);
                chatScroll.setLayoutParams(scrollLp);

                chatHistoryView = new TextView(ctx);
                chatHistoryView.setText("Pronto. Diga 'Jarvis' ou digite abaixo:");
                chatHistoryView.setTextColor(Color.parseColor("#E2E8F0"));
                chatHistoryView.setTextSize(12.5f);
                chatHistoryView.setLineSpacing(4f, 1.1f);
                chatScroll.addView(chatHistoryView);
                chatCard.addView(chatScroll);

                // Linha de entrada
                LinearLayout inputRow = new LinearLayout(ctx);
                inputRow.setOrientation(LinearLayout.HORIZONTAL);
                inputRow.setGravity(Gravity.CENTER_VERTICAL);

                EditText input = new EditText(ctx);
                input.setHint("Falar ou digitar...");
                input.setHintTextColor(Color.parseColor("#64748B"));
                input.setTextColor(Color.WHITE);
                input.setTextSize(13f);
                input.setMaxLines(3);
                input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
                input.setImeOptions(EditorInfo.IME_ACTION_SEND);
                input.setPadding(dp(ctx, 10), dp(ctx, 7), dp(ctx, 10), dp(ctx, 7));
                GradientDrawable inBg = new GradientDrawable();
                inBg.setColor(Color.parseColor("#0F172A"));
                inBg.setCornerRadius(dp(ctx, 12));
                inBg.setStroke(1, Color.parseColor("#334155"));
                input.setBackground(inBg);
                input.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

                TextView btnSend = new TextView(ctx);
                btnSend.setText("➤");
                btnSend.setTextColor(Color.parseColor("#020617"));
                btnSend.setTextSize(14f);
                btnSend.setGravity(Gravity.CENTER);
                btnSend.setPadding(dp(ctx, 12), dp(ctx, 8), dp(ctx, 12), dp(ctx, 8));
                GradientDrawable sendBg = new GradientDrawable();
                sendBg.setColor(Color.parseColor("#22D3EE"));
                sendBg.setCornerRadius(dp(ctx, 12));
                btnSend.setBackground(sendBg);
                LinearLayout.LayoutParams sendLp = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                sendLp.leftMargin = dp(ctx, 6);
                btnSend.setLayoutParams(sendLp);

                btnSend.setOnClickListener(v -> {
                    String msg = input.getText().toString().trim();
                    if (msg.isEmpty()) return;
                    input.setText("");
                    appendChat("Você: " + msg);
                    sendToJarvis(msg);
                });

                inputRow.addView(input);
                inputRow.addView(btnSend);
                chatCard.addView(inputRow);

                int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE;

                chatParams = new WindowManager.LayoutParams(
                        dp(ctx, 300),
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        overlayType,
                        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                        PixelFormat.TRANSLUCENT
                );
                chatParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
                chatParams.y = Math.max(dp(ctx, 60), (orbParams != null ? orbParams.y + dp(ctx, 66) : dp(ctx, 240)));

                wm.addView(chatCard, chatParams);
                chatOpen = true;
            } catch (Exception ignored) {}
        });
    }

    private static void appendChat(String line) {
        new Handler(Looper.getMainLooper()).post(() -> {
            if (chatHistoryView != null) {
                String cur = chatHistoryView.getText().toString();
                chatHistoryView.setText(cur + "\n\n" + line);
                if (chatScroll != null) {
                    chatScroll.post(() -> chatScroll.fullScroll(View.FOCUS_DOWN));
                }
            }
        });
    }

    private static void sendToJarvis(String text) {
        setOrbState("active");
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(BASE_URL + "/api/v1/webhook/ingress").openConnection();
                c.setRequestMethod("POST");
                c.setRequestProperty("Content-Type", "application/json");
                c.setConnectTimeout(5000);
                c.setReadTimeout(25000);
                c.setDoOutput(true);

                JSONObject body = new JSONObject();
                body.put("prompt", text);
                body.put("textPrompt", text);
                body.put("identityToken", "Matheus-Admin");
                body.put("sessionId", "sess_main_admin");
                body.put("deviceId", JarvisDeviceIdentity.getDeviceId(orbView.getContext()));
                body.put("modelInfo", JarvisDeviceIdentity.getModelInfo());
                body.put("deviceToken", JarvisDeviceIdentity.getDeviceToken(orbView.getContext()));

                try (OutputStream os = c.getOutputStream()) {
                    os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }

                Scanner sc = new Scanner(c.getInputStream(), "UTF-8").useDelimiter("\\A");
                JSONObject res = new JSONObject(sc.hasNext() ? sc.next() : "{}");
                JSONObject data = res.optJSONObject("data");
                String reply = data != null ? data.optString("response", res.optString("response", "Pronto.")) : res.optString("response", "Pronto.");
                appendChat("JARVIS: " + reply);
                c.disconnect();
            } catch (Exception e) {
                appendChat("JARVIS: Falha de conexão (" + e.getMessage() + ")");
            } finally {
                setOrbState("idle");
            }
        }).start();
    }

    // View customizada que desenha o Globo 3D Geodésico girando
    private static class Orb3DView extends View {
        private final Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint dotPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint corePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF oval = new RectF();
        private float angle = 0f;

        public Orb3DView(Context ctx) {
            super(ctx);
            bgPaint.setStyle(Paint.Style.FILL);
            bgPaint.setColor(Color.parseColor("#E6060D1A"));

            ringPaint.setStyle(Paint.Style.STROKE);
            dotPaint.setStyle(Paint.Style.FILL);
            corePaint.setStyle(Paint.Style.FILL);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float w = getWidth();
            float h = getHeight();
            float cx = w / 2f;
            float cy = h / 2f;
            float r = Math.min(cx, cy) - 4f;
            boolean isUnpaired = !JarvisDeviceIdentity.isPaired(getContext());
            boolean isActive = "active".equals(orbState);

            // Fundo circular escuro com brilho ciano
            canvas.drawCircle(cx, cy, r, bgPaint);

            ringPaint.setStrokeWidth(isActive ? 3.2f : 2.0f);
            ringPaint.setColor(isUnpaired ? Color.parseColor("#F59E0B") : (isActive ? Color.parseColor("#00FFFF") : Color.parseColor("#38BDF8")));
            canvas.drawCircle(cx, cy, r - 1f, ringPaint);

            // Anéis giroscópicos 3D inclinados
            canvas.save();
            canvas.rotate(angle * 35f, cx, cy);
            ringPaint.setStrokeWidth(1.5f);
            ringPaint.setColor(Color.parseColor("#8022D3EE"));
            float rx = r * 0.82f;
            float ry = r * (0.28f + 0.14f * (float) Math.sin(angle * 2f));
            oval.set(cx - rx, cy - ry, cx + rx, cy + ry);
            canvas.drawOval(oval, ringPaint);
            canvas.restore();

            canvas.save();
            canvas.rotate(-angle * 25f + 60f, cx, cy);
            oval.set(cx - rx * 0.78f, cy - ry * 0.9f, cx + rx * 0.78f, cy + ry * 0.9f);
            canvas.drawOval(oval, ringPaint);
            canvas.restore();

            // Esfera Fibonacci 3D girando (42 pontos com profundidade Z)
            float sphereR = r * 0.56f;
            int n = 42;
            double golden = Math.PI * (3.0 - Math.sqrt(5.0));
            for (int i = 0; i < n; i++) {
                double yNorm = 1.0 - (i / (double) (n - 1)) * 2.0;
                double radAtY = Math.sqrt(Math.max(0.0, 1.0 - yNorm * yNorm));
                double theta = golden * i + angle;
                double x3 = Math.cos(theta) * radAtY;
                double z3 = Math.sin(theta) * radAtY;

                float px = cx + (float) (x3 * sphereR);
                float py = cy + (float) (yNorm * sphereR);
                float depth = (float) ((z3 + 1.0) / 2.0); // 0 = trás, 1 = frente

                dotPaint.setColor(isActive ? Color.parseColor("#67E8F9") : Color.parseColor("#38BDF8"));
                dotPaint.setAlpha((int) (65 + depth * 190));
                canvas.drawCircle(px, py, 1.4f + depth * 1.9f, dotPaint);
            }

            // Núcleo central energético
            corePaint.setColor(isActive ? Color.parseColor("#A5F3FC") : Color.parseColor("#22D3EE"));
            corePaint.setAlpha(isActive ? 220 : 140);
            canvas.drawCircle(cx, cy, r * (isActive ? 0.22f : 0.15f), corePaint);

            angle += isActive ? 0.09f : 0.045f;
            if (angle > Math.PI * 200) angle = 0f;
            postInvalidateDelayed(33L);
        }
    }
}
