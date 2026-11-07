package com.xiaodancici.watch;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ComponentCallbacks2;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
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
