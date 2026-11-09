package com.xiaodancici.watch;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ComponentCallbacks2;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * A deliberately small WebView shell for the offline 小单词机 study app.
 * Everything except the word bank and UI lives in app/src/main/assets/www.
 *
 * The shell is defensive on purpose: ColorOS Watch WebViews are old and
 * memory constrained, so every step that can fail (native lib, WebView
 * construction, asset load, renderer process death) has a plain-TextView
 * fallback instead of a white screen / force close.
 */
public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/www/index.html";
    private static final int FILE_CHOOSER_REQUEST = 4107;
    private static final String JS_BRIDGE_NAME = "XiaodanciciNative";
    private static final String DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
    private static final int DEEPSEEK_CONNECT_TIMEOUT_MS = 30000;
    private static final int DEEPSEEK_READ_TIMEOUT_MS = 120000;

    /*
     * TextToSpeech states. ttsState is guarded by ttsLock because the engine is
     * constructed on a background thread while the JS bridge may call in from
     * WebView's JavaBridge thread at any time.
     */
    private static final int TTS_INITIALIZING = 0;
    private static final int TTS_READY = 1;
    private static final int TTS_MISSING = 2;
    private static final int TTS_ERROR = 3;

    private static final class PendingTts {
        final String text;
        final String lang;

        PendingTts(String text, String lang) {
            this.text = text;
            this.lang = lang;
        }
    }

    /*
     * Keep the tiny shipped marker library loaded so the package is not
     * "pure Java". Failure is harmless and deliberately ignored.
     */
    static {
        try {
            System.loadLibrary("xiaodancici");
        } catch (Throwable ignored) {
            // Optional marker library; the app is a WebView shell.
        }
    }

    private static final String ERROR_HOOK_JS =
            "(function(){if(window.__xdErrorHook)return;window.__xdErrorHook=true;"
                    + "window.addEventListener('error',function(e){try{"
                    + "console.error('[xd]',(e&&e.message)||e);"
                    + "}catch(_){}},true);})();";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private boolean fallbackShown;

    // DeepSeek requests run off the UI/JavaBridge thread; the result is
    // delivered back to the page through a JS callback.
    private final ExecutorService netExecutor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // Offline pronunciation via the platform TextToSpeech engine.
    private final Object ttsLock = new Object();
    private TextToSpeech tts;
    private int ttsState = TTS_INITIALIZING;
    private String ttsError = "";
    private PendingTts pendingTts;
    private boolean ttsDestroyed;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            try {
                getWindow().setFlags(
                        WindowManager.LayoutParams.FLAG_FULLSCREEN,
                        WindowManager.LayoutParams.FLAG_FULLSCREEN
                );
            } catch (Throwable ignored) {
                // Some watch OEM windows reject the flag before content attach.
            }
            getWindow().setBackgroundDrawableResource(android.R.color.black);
            hideSystemUi();

            FrameLayout root = new FrameLayout(this);
            root.setBackgroundColor(Color.rgb(244, 241, 232));
            setContentView(root);

            webView = createWebView();
            root.addView(webView, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
            ));

            // Bind TextToSpeech off the UI thread; a missing engine must never
            // block or crash startup. Requests arriving during init are queued.
            initTtsAsync();

            if (savedInstanceState != null) {
                try {
                    webView.restoreState(savedInstanceState);
                } catch (Throwable ignored) {
                    // A corrupt/old state bundle must not abort startup.
                }
                if (webView.getUrl() == null) {
                    loadStartPage();
                }
            } else {
                loadStartPage();
            }
        } catch (Throwable error) {
            // Includes OutOfMemoryError while inflating the WebView.
            showFallback(error);
        }
    }

    private WebView createWebView() {
        WebView view = new WebView(this);
        view.setBackgroundColor(Color.rgb(244, 241, 232));
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
        view.setVerticalScrollBarEnabled(false);
        view.setHorizontalScrollBarEnabled(false);
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            // ColorOS 会在点按时绘制系统默认的黄色焦点高亮，CSS 无法去掉。
            view.setDefaultFocusHighlightEnabled(false);
        }

        configureWebView(view);
        try {
            view.addJavascriptInterface(new XiaodanciciBridge(), JS_BRIDGE_NAME);
        } catch (Throwable ignored) {
            // Without the bridge the page falls back to Web Speech / network.
        }
        view.setWebViewClient(new AppWebViewClient());
        view.setWebChromeClient(new AppChromeClient());
        return view;
    }

    private void loadStartPage() {
        try {
            webView.loadUrl(START_URL);
        } catch (Throwable error) {
            showFallback(error);
        }
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        if (settings == null) {
            throw new IllegalStateException("WebSettings is null");
        }

        // Legacy database path must be set before enabling DB support on very
        // old WebView versions; each call is isolated because any single
        // WebSettings method can throw on ancient ColorOS firmware.
        try {
            settings.setDatabasePath(getDir("webview_db", MODE_PRIVATE).getPath());
        } catch (Throwable ignored) {
        }
        try {
            settings.setJavaScriptEnabled(true);
        } catch (Throwable ignored) {
        }
        try {
            settings.setDomStorageEnabled(true);
        } catch (Throwable ignored) {
        }
        try {
            settings.setDatabaseEnabled(true);
        } catch (Throwable ignored) {
        }
        try {
            settings.setAllowFileAccess(true);
        } catch (Throwable ignored) {
        }
        try {
            settings.setAllowContentAccess(true);
        } catch (Throwable ignored) {
        }
        try {
            settings.setAllowFileAccessFromFileURLs(true);
        } catch (Throwable ignored) {
        }
        try {
            settings.setAllowUniversalAccessFromFileURLs(true);
        } catch (Throwable ignored) {
        }
        try {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        } catch (Throwable ignored) {
        }
        try {
            settings.setMediaPlaybackRequiresUserGesture(false);
        } catch (Throwable ignored) {
        }
        // External help links target="_blank". Popups are not supported
        // (onCreateWindow returns false); the settings page should navigate
        // links in-place instead of opening new windows.
        try {
            settings.setSupportMultipleWindows(false);
        } catch (Throwable ignored) {
        }
        try {
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
        } catch (Throwable ignored) {
        }
        try {
            settings.setUseWideViewPort(true);
        } catch (Throwable ignored) {
        }
        try {
            settings.setLoadWithOverviewMode(true);
        } catch (Throwable ignored) {
        }
        try {
            settings.setSupportZoom(false);
        } catch (Throwable ignored) {
        }
        try {
            settings.setBuiltInZoomControls(false);
        } catch (Throwable ignored) {
        }
        try {
            settings.setDisplayZoomControls(false);
        } catch (Throwable ignored) {
        }
        try {
            settings.setTextZoom(100);
        } catch (Throwable ignored) {
        }
        try {
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        } catch (Throwable ignored) {
        }
        try {
            settings.setGeolocationEnabled(false);
        } catch (Throwable ignored) {
        }
        try {
            settings.setDefaultTextEncodingName("UTF-8");
        } catch (Throwable ignored) {
        }
    }

    /**
     * No-op on purpose. On ColorOS Watch devices getWindow().getDecorView()
     * can be null before content attach, and getInsetsController /
     * setDecorFitsSystemWindows can crash or misbehave. Kept as a method so
     * existing call sites still compile.
     */
    private void hideSystemUi() {
        // Intentionally empty. See javadoc above.
    }

    /**
     * Replace whatever is on screen with a readable Chinese error panel.
     * Never let a blank white/black window be the final state.
     */
    private void showFallback(Throwable error) {
        if (fallbackShown || isFinishing()) return;
        fallbackShown = true;

        try {
            if (webView != null) {
                try {
                    webView.stopLoading();
                } catch (Throwable ignored) {
                }
                try {
                    ViewGroup parent = (ViewGroup) webView.getParent();
                    if (parent != null) parent.removeView(webView);
                } catch (Throwable ignored) {
                }
                try {
                    webView.destroy();
                } catch (Throwable ignored) {
                }
                webView = null;
            }
        } catch (Throwable ignored) {
            webView = null;
        }

        String code = error == null ? "" : error.getClass().getSimpleName();
        String message = "小单词机未能启动\n\n"
                + "手表 WebView 初始化或页面加载失败。\n"
                + "请重启手表后再打开本应用。\n"
                + "若仍然失败，请卸载后重新安装。\n\n"
                + "离线词库仍在应用内，不会丢失。";
        if (error != null) {
            try {
                String detail = error.getMessage();
                if (detail != null && !detail.isEmpty()) {
                    message += "\n\n详情: " + detail;
                }
            } catch (Throwable ignored) {
            }
            try {
                StackTraceElement[] frames = error.getStackTrace();
                if (frames != null && frames.length > 0 && frames[0] != null) {
                    StackTraceElement top = frames[0];
                    message += "\n位置: "
                            + top.getClassName() + "." + top.getMethodName()
                            + ":" + top.getLineNumber();
                }
            } catch (Throwable ignored) {
            }
        }
        if (!code.isEmpty()) {
            message += "\n\n错误代码: " + code;
        }

        TextView panel = new TextView(this);
        panel.setText(message);
        panel.setTextColor(Color.rgb(255, 253, 248));
        panel.setBackgroundColor(Color.rgb(13, 107, 87));
        panel.setTextSize(15);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(28, 28, 28, 28);
        panel.setLineSpacing(4, 1f);

        try {
            setContentView(panel);
        } catch (Throwable ignored) {
            // Nothing else we can safely do; at least the process is alive.
        }
    }

    private boolean handleUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if (scheme == null) return false;

        if ("file".equalsIgnoreCase(scheme)) {
            String path = uri.getPath();
            if (path != null && path.toLowerCase().endsWith(".apk")) {
                // The download card targets the GitHub Pages copy. Inside this
                // APK the link has no sibling APK to serve, so explain instead
                // of showing a WebView file-not-found page.
                showToast("手表版已随应用安装；重装请从网页版下载到电脑后 ADB 安装");
                return true;
            }
            return false;
        }

        if ("about".equalsIgnoreCase(scheme)
                || "blob".equalsIgnoreCase(scheme)
                || "data".equalsIgnoreCase(scheme)
                || "javascript".equalsIgnoreCase(scheme)) {
            return false;
        }

        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
            // Keep sign-in/API pages in this WebView so the hardware back button
            // always returns to the app instead of leaving a browser stranded.
            return false;
        }

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            showToast("无法打开此链接");
        }
        return true;
    }

    private void showToast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private void openInMainWebView(String url) {
        if (webView != null && url != null && !"about:blank".equals(url)) {
            try {
                webView.loadUrl(url);
            } catch (Throwable error) {
                showFallback(error);
            }
        }
    }

    /* ---------- 离线发音（Android TextToSpeech） ---------- */

    /**
     * Exposed to the local page as window.XiaodanciciNative. All methods are
     * called on WebView's JavaBridge thread, so the engine is only touched
     * through the ttsLock-guarded helpers below.
     */
    public final class XiaodanciciBridge {
        @JavascriptInterface
        public boolean speak(String text, String lang) {
            return handleSpeak(text, lang);
        }

        @JavascriptInterface
        public void stop() {
            stopTts();
        }

        @JavascriptInterface
        public boolean isTtsReady() {
            synchronized (ttsLock) {
                return ttsState == TTS_READY;
            }
        }

        /** "initializing" / "ready" / "missing" / "error:..." */
        @JavascriptInterface
        public String ttsStatus() {
            synchronized (ttsLock) {
                if (ttsState == TTS_READY) return "ready";
                if (ttsState == TTS_MISSING) return "missing";
                if (ttsState == TTS_ERROR) {
                    return ttsError.isEmpty() ? "error" : "error:" + ttsError;
                }
                return "initializing";
            }
        }

        /**
         * DeepSeek chat completion. app.js sends {apiKey, model, messages, ...}
         * and gets the raw API JSON back through callbackName(err, json).
         * This exists because ColorOS WebView blocks CORS on file:// pages.
         */
        @JavascriptInterface
        public void deepseekChat(String requestId, String callbackName, String jsonBody) {
            final String callback = sanitizeCallback(callbackName);
            netExecutor.execute(new Runnable() {
                @Override
                public void run() {
                    String error = null;
                    String result = null;
                    try {
                        result = postDeepseek(jsonBody);
                    } catch (Throwable failure) {
                        error = describe(failure);
                    }
                    final String finalError = error;
                    final String finalResult = result;
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            deliverDeepseekCallback(callback, finalError, finalResult);
                        }
                    });
                }
            });
        }
    }

    private static String sanitizeCallback(String name) {
        if (name == null) return "";
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < name.length(); i += 1) {
            char c = name.charAt(i);
            if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                    || (c >= '0' && c <= '9') || c == '_' || c == '$') {
                builder.append(c);
            }
        }
        return builder.toString();
    }

    private void deliverDeepseekCallback(String callbackName, String error, String resultJson) {
        final WebView view = webView;
        if (view == null || callbackName == null || callbackName.isEmpty()) return;
        try {
            String errorLiteral = error == null ? "null" : JSONObject.quote(error);
            String dataLiteral = error != null
                    ? "null"
                    : JSONObject.quote(resultJson == null ? "" : resultJson);
            String js = "(function(){try{var fn=window[" + JSONObject.quote(callbackName) + "];"
                    + "if(typeof fn==='function')fn(" + errorLiteral + "," + dataLiteral + ");"
                    + "}catch(e){console.error(e);}})();";
            view.evaluateJavascript(js, null);
        } catch (Throwable ignored) {
        }
    }

    private String postDeepseek(String jsonBody) throws Exception {
        JSONObject incoming = new JSONObject(jsonBody == null ? "{}" : jsonBody);
        String apiKey = incoming.optString("apiKey", "");
        if (apiKey.isEmpty()) {
            throw new IllegalArgumentException("缺少 apiKey");
        }

        JSONObject outbound = new JSONObject();
        outbound.put("model", incoming.optString("model", "deepseek-flash"));
        outbound.put("messages", incoming.getJSONArray("messages"));
        if (incoming.has("temperature") && !incoming.isNull("temperature")) {
            outbound.put("temperature", incoming.getDouble("temperature"));
        }
        if (incoming.has("response_format") && !incoming.isNull("response_format")) {
            outbound.put("response_format", incoming.getJSONObject("response_format"));
        }

        byte[] payload = outbound.toString().getBytes(StandardCharsets.UTF_8);
        HttpURLConnection conn = (HttpURLConnection) new URL(DEEPSEEK_URL).openConnection();
        conn.setConnectTimeout(DEEPSEEK_CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(DEEPSEEK_READ_TIMEOUT_MS);
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Authorization", "Bearer " + apiKey);
        conn.setRequestProperty("Accept", "application/json");
        try (OutputStream stream = conn.getOutputStream()) {
            stream.write(payload);
        }

        int code = conn.getResponseCode();
        InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        String body = readDeepseekStream(stream);
        if (code >= 400) {
            String message = "HTTP " + code;
            try {
                JSONObject errorPayload = new JSONObject(body);
                JSONObject errorObject = errorPayload.optJSONObject("error");
                if (errorObject != null && errorObject.has("message")) {
                    message = errorObject.optString("message", message);
                } else if (errorPayload.has("message")) {
                    message = errorPayload.optString("message", message);
                }
            } catch (Throwable ignored) {
            }
            if (code == 401) message = "DeepSeek API Key 无效";
            if (code == 402) message = "DeepSeek 余额不足";
            if (code == 429) message = "请求过于频繁，稍后再试";
            throw new IllegalStateException(message);
        }
        return body;
    }

    private static String readDeepseekStream(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private void initTtsAsync() {
        Thread thread = new Thread(new Runnable() {
            @Override
            public void run() {
                TextToSpeech engine;
                try {
                    engine = new TextToSpeech(getApplicationContext(),
                            new TextToSpeech.OnInitListener() {
                                @Override
                                public void onInit(int status) {
                                    onTtsInitialized(status);
                                }
                            });
                } catch (Throwable error) {
                    markTtsUnavailable(TTS_ERROR, describe(error));
                    return;
                }

                boolean shutdownNow = false;
                boolean configure = false;
                PendingTts queued = null;
                synchronized (ttsLock) {
                    if (ttsDestroyed) {
                        shutdownNow = true;
                    } else {
                        tts = engine;
                        // onInit can arrive before the constructor returns.
                        if (ttsState == TTS_READY) {
                            configure = true;
                            queued = pendingTts;
                            pendingTts = null;
                        } else if (ttsState == TTS_MISSING || ttsState == TTS_ERROR) {
                            shutdownNow = true;
                        }
                    }
                }
                if (shutdownNow) {
                    try {
                        engine.shutdown();
                    } catch (Throwable ignored) {
                    }
                } else {
                    if (configure) configureTts(engine);
                    if (queued != null && !speakWithEngine(queued.text, queued.lang)) {
                        notifyJsTtsFailure();
                    }
                }
            }
        }, "xd-tts-init");
        thread.setDaemon(true);
        try {
            thread.start();
        } catch (Throwable error) {
            markTtsUnavailable(TTS_ERROR, describe(error));
        }
    }

    private void onTtsInitialized(int status) {
        if (status != TextToSpeech.SUCCESS) {
            markTtsUnavailable(TTS_MISSING, "no_engine");
            return;
        }

        TextToSpeech engine;
        PendingTts queued = null;
        synchronized (ttsLock) {
            if (ttsDestroyed) return;
            ttsState = TTS_READY;
            ttsError = "";
            engine = tts;
            if (engine != null) {
                queued = pendingTts;
                pendingTts = null;
            }
            // If tts is still null the init thread will configure it when the
            // constructor returns; keep the pending request for that path.
        }

        if (engine != null) {
            configureTts(engine);
        }
        if (queued != null && !speakWithEngine(queued.text, queued.lang)) {
            notifyJsTtsFailure();
        }
    }

    private void configureTts(TextToSpeech engine) {
        try {
            engine.setSpeechRate(0.9f);
        } catch (Throwable ignored) {
        }
        try {
            engine.setLanguage(Locale.US);
        } catch (Throwable ignored) {
        }
    }

    private boolean handleSpeak(String text, String lang) {
        if (text == null) return false;
        String phrase = text.trim();
        if (phrase.isEmpty()) return false;
        // Word entries are short; cap accidental huge strings.
        if (phrase.length() > 200) {
            phrase = phrase.substring(0, 200);
        }

        synchronized (ttsLock) {
            if (ttsDestroyed) return false;
            if (ttsState == TTS_MISSING || ttsState == TTS_ERROR) return false;
            if (ttsState != TTS_READY) {
                // Engine still binding: keep only the latest word to speak.
                pendingTts = new PendingTts(phrase, lang);
                return true;
            }
        }
        return speakWithEngine(phrase, lang);
    }

    private boolean speakWithEngine(String phrase, String lang) {
        TextToSpeech engine;
        synchronized (ttsLock) {
            engine = tts;
        }
        if (engine == null) return false;

        Locale locale = localeFor(lang);
        try {
            int result = engine.setLanguage(locale);
            if (isLanguageUnavailable(result) && !Locale.US.equals(locale)) {
                // 英音缺失时回退美音。
                result = engine.setLanguage(Locale.US);
            }
            if (isLanguageUnavailable(result)) return false;
            return engine.speak(phrase, TextToSpeech.QUEUE_FLUSH, null, "xd-pron")
                    == TextToSpeech.SUCCESS;
        } catch (Throwable error) {
            return false;
        }
    }

    private static boolean isLanguageUnavailable(int result) {
        return result == TextToSpeech.LANG_MISSING_DATA
                || result == TextToSpeech.LANG_NOT_SUPPORTED;
    }

    private static Locale localeFor(String lang) {
        if (lang == null) return Locale.US;
        String tag = lang.trim().toLowerCase(Locale.ROOT);
        if (tag.startsWith("en-gb") || tag.startsWith("en-uk")) {
            return Locale.UK;
        }
        return Locale.US;
    }

    private void stopTts() {
        TextToSpeech engine;
        synchronized (ttsLock) {
            pendingTts = null;
            engine = tts;
        }
        if (engine != null) {
            try {
                engine.stop();
            } catch (Throwable ignored) {
            }
        }
    }

    private void markTtsUnavailable(int state, String detail) {
        PendingTts queued;
        TextToSpeech stale;
        synchronized (ttsLock) {
            if (ttsState == TTS_READY) return;
            ttsState = state;
            ttsError = detail == null ? "" : detail;
            queued = pendingTts;
            pendingTts = null;
            stale = tts;
            tts = null;
        }
        if (stale != null) {
            try {
                stale.shutdown();
            } catch (Throwable ignored) {
            }
        }
        if (queued != null) notifyJsTtsFailure();
    }

    private static String describe(Throwable error) {
        if (error == null) return "";
        try {
            String message = error.getMessage();
            return message == null ? error.getClass().getSimpleName() : message;
        } catch (Throwable ignored) {
            return "";
        }
    }

    /**
     * Tell the page that a queued native request failed after init. It then
     * tries Web Speech and shows the "install an English voice pack" toast.
     */
    private void notifyJsTtsFailure() {
        final WebView view = webView;
        if (view == null) return;
        view.post(new Runnable() {
            @Override
            public void run() {
                try {
                    view.evaluateJavascript(
                            "window.__xdNativeTtsError&&window.__xdNativeTtsError();",
                            null
                    );
                } catch (Throwable ignored) {
                }
            }
        });
    }

    private final class AppWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleUrl(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleUrl(Uri.parse(url));
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (fallbackShown) return;
            try {
                view.evaluateJavascript(ERROR_HOOK_JS, null);
            } catch (Throwable ignored) {
                // Diagnostics only.
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request,
                                    WebResourceError error) {
            if (fallbackShown || request == null || !request.isForMainFrame()) return;
            Uri uri = request.getUrl();
            String url = uri == null ? "" : uri.toString();
            // Missing/corrupt packaged assets used to leave a blank page.
            // Network subresource failures are left to the page itself.
            if (url.startsWith("file:///android_asset/")) {
                showFallback(new IllegalStateException("页面资源加载失败"));
            }
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // The WebView renderer was killed (usually low memory). Returning
            // true tells the platform we handled it; we then show our panel
            // instead of letting the whole process be torn down.
            showFallback(new IllegalStateException("WebView 渲染进程已退出"));
            return true;
        }
    }

    private final class AppChromeClient extends WebChromeClient {
        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture,
                                      android.os.Message resultMsg) {
            // Popups are unsupported on watch-sized screens. Returning false
            // makes the WebView ignore window.open / target="_blank"; the page
            // should navigate its links in-place instead.
            return false;
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message,
                                 final android.webkit.JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                    .setOnCancelListener(dialog -> result.cancel())
                    .show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message,
                                   final android.webkit.JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                    .setNegativeButton(android.R.string.cancel, (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel())
                    .show();
            return true;
        }

        @Override
        public boolean onJsPrompt(WebView view, String url, String message,
                                  String defaultValue, final android.webkit.JsPromptResult result) {
            final EditText input = new EditText(MainActivity.this);
            input.setSingleLine(true);
            input.setText(defaultValue == null ? "" : defaultValue);
            input.setSelection(input.getText().length());

            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setView(input)
                    .setPositiveButton(android.R.string.ok,
                            (dialog, which) -> result.confirm(input.getText().toString()))
                    .setNegativeButton(android.R.string.cancel, (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel())
                    .show();
            return true;
        }

        @Override
        public boolean onShowFileChooser(WebView view,
                                         ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
            }
            filePathCallback = callback;

            Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            try {
                startActivityForResult(Intent.createChooser(intent, "选择备份文件"),
                        FILE_CHOOSER_REQUEST);
                return true;
            } catch (ActivityNotFoundException error) {
                ValueCallback<Uri[]> pending = filePathCallback;
                filePathCallback = null;
                if (pending != null) pending.onReceiveValue(null);
                showToast("手表上没有可用的文件选择器");
                return false;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(resultCode, data)
                );
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            try {
                webView.saveState(outState);
            } catch (Throwable ignored) {
            }
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            try {
                webView.onPause();
            } catch (Throwable ignored) {
            }
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            try {
                webView.onResume();
            } catch (Throwable ignored) {
            }
        }
        hideSystemUi();
    }

    @Override
    public void onTrimMemory(int level) {
        // Watch WebView processes are often the first thing the kernel kills.
        // Let it release caches when the system says memory is tight.
        if (webView != null && level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            try {
                webView.freeMemory();
            } catch (Throwable ignored) {
            }
        }
        super.onTrimMemory(level);
    }

    @Override
    protected void onDestroy() {
        TextToSpeech engine;
        synchronized (ttsLock) {
            ttsDestroyed = true;
            pendingTts = null;
            engine = tts;
            tts = null;
        }
        if (engine != null) {
            try {
                engine.stop();
            } catch (Throwable ignored) {
            }
            try {
                engine.shutdown();
            } catch (Throwable ignored) {
            }
        }

        try {
            netExecutor.shutdownNow();
        } catch (Throwable ignored) {
        }

        if (webView != null) {
            try {
                webView.loadUrl("about:blank");
                webView.stopLoading();
                webView.destroy();
            } catch (Throwable ignored) {
            }
            webView = null;
        }
        super.onDestroy();
    }
}
