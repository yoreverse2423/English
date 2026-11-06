package com.xiaodancici.watch;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ComponentCallbacks2;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
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
            getWindow().setFlags(
                    WindowManager.LayoutParams.FLAG_FULLSCREEN,
                    WindowManager.LayoutParams.FLAG_FULLSCREEN
            );
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

        // On watch-sized screens use software rendering. Old ColorOS Watch
        // GPU drivers (and 512 MB-class devices) are the least reliable part
        // of the stack; software layers avoid GPU raster crashes at the cost
        // of some animation smoothness, which matters far less than opening.
        // Larger screens keep the default hardware path.
        if (isSmallScreen()) {
            try {
                view.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
            } catch (Throwable ignored) {
                // Fall through to the default renderer.
            }
        }

        configureWebView(view);
        view.setWebViewClient(new AppWebViewClient());
        view.setWebChromeClient(new AppChromeClient());
        return view;
    }

    private boolean isSmallScreen() {
        Configuration config = getResources().getConfiguration();
        int smallestWidthDp = config.smallestScreenWidthDp;
        return smallestWidthDp <= 0 || smallestWidthDp < 320;
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

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        // Settings uses target="_blank" for the DeepSeek/GitHub help links.
        // onCreateWindow turns those popups back into same-WebView loads, so
        // multiple-window support is genuinely needed here.
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setGeolocationEnabled(false);
        settings.setDefaultTextEncodingName("UTF-8");
    }

    private void hideSystemUi() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );
        }
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
            if (resultMsg == null
                    || !(resultMsg.obj instanceof WebView.WebViewTransport)) {
                return false;
            }

            try {
                final WebView proxy = new WebView(MainActivity.this);
                proxy.getSettings().setJavaScriptEnabled(true);
                proxy.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popup,
                                                            WebResourceRequest request) {
                        openInMainWebView(request.getUrl().toString());
                        destroyQuietly(proxy);
                        return true;
                    }

                    @Override
                    @SuppressWarnings("deprecation")
                    public boolean shouldOverrideUrlLoading(WebView popup, String url) {
                        openInMainWebView(url);
                        destroyQuietly(proxy);
                        return true;
                    }
                });

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(proxy);
                resultMsg.sendToTarget();
                return true;
            } catch (Throwable error) {
                // Popup plumbing must never take down the study screen; the
                // link simply does nothing in that case.
                return false;
            }
        }

        private void destroyQuietly(WebView view) {
            try {
                view.stopLoading();
                view.destroy();
            } catch (Throwable ignored) {
            }
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
