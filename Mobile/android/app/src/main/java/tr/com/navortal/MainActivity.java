package tr.com.navortal;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowInsets;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import java.util.Set;
import org.json.JSONObject;

/** Yalnız birinci taraf HTTPS çerçevesinin sayaç mesajlarına erişimi var. */
public final class MainActivity extends ComponentActivity {
    static final String ORIGIN = "https://www.navortal.com.tr";
    private WebView web;
    private TimerNotification timer;
    private ValueCallback<Uri[]> fileResult;
    private static final int FILE = 9103;

    static boolean trusted(Uri uri) {
        return "https".equals(uri.getScheme()) && "www.navortal.com.tr".equals(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        timer = new TimerNotification(this);
        web = new WebView(this);
        setContentView(web);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack();
                else finish();
            }
        });
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            web.setOnApplyWindowInsetsListener((view, insets) -> {
                var safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return insets;
            });
        }
        var settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(false);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            new AlertDialog.Builder(this).setMessage("Sayaç bildirimi için Android System WebView bileşenini güncelle.")
                    .setPositiveButton("Tamam", null).show();
        } else {
            WebViewCompat.addWebMessageListener(web, "navortalTimer", Set.of(ORIGIN),
                    (view, message, sourceOrigin, mainFrame, reply) -> {
                        if (!mainFrame || !trusted(sourceOrigin) || message.getType() != WebMessageCompat.TYPE_STRING || message.getData() == null || message.getData().length() > 4096) return;
                        try { timer.accept(TimerSnapshot.parse(new JSONObject(message.getData()), System.currentTimeMillis())); }
                        catch (Exception ignored) { /* Geçersiz köprü mesajı çalışmaya veya oturuma dokunmaz. */ }
                    });
        }
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (trusted(request.getUrl())) return false;
                if (request.isForMainFrame() && request.hasGesture()) external(request.getUrl());
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileResult != null) fileResult.onReceiveValue(null);
                fileResult = callback;
                try { startActivityForResult(params.createIntent(), FILE); }
                catch (android.content.ActivityNotFoundException ignored) { fileResult.onReceiveValue(null); fileResult = null; }
                return true;
            }
        });
        web.loadUrl(ORIGIN + "/planning");
    }

    private void external(Uri uri) {
        if (!Set.of("https", "mailto", "tel").contains(uri.getScheme())) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (android.content.ActivityNotFoundException ignored) { }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == FILE && fileResult != null) {
            fileResult.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileResult = null;
        }
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        timer.permissionResult(code);
    }

    @Override protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            if (web.getUrl() != null && trusted(Uri.parse(web.getUrl())))
                web.evaluateJavascript("window.dispatchEvent(new Event('navortal:resume'))", null);
        }
    }

    @Override protected void onPause() {
        if (web != null) web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (fileResult != null) fileResult.onReceiveValue(null);
        // Ekranın veya uygulama sürecinin kapanması sunucudaki çalışmayı bitirmez.
        web.destroy();
        super.onDestroy();
    }
}
