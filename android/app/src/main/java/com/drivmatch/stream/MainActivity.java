package com.drivmatch.stream;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.net.URI;
import java.net.URISyntaxException;

/**
 * DrivMatch Stream test client.
 * No passwords, personal favorites, access tokens, or video streams are stored in the app.
 * The server is a separate HTTPS Cloudflare Worker chosen by the founder.
 */
public final class MainActivity extends Activity {
    private static final String PREFS = "stream_test_config";
    private static final String PREF_URL = "worker_url";
    private WebView webView;
    private LinearLayout root;
    private String baseUrl;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private FrameLayout fullscreenContainer;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(10, 24, 40));
        getWindow().setNavigationBarColor(Color.rgb(10, 24, 40));
        baseUrl = getPreferences(MODE_PRIVATE).getString(PREF_URL, BuildConfig.STREAM_DEFAULT_URL);
        if (validatedUrl(baseUrl) == null) showSetup();
        else showApp();
    }
    private LinearLayout newRoot() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(Color.rgb(10,24,40));
        layout.setPadding(14,14,14,14);
        setContentView(layout);
        root = layout;
        return layout;
    }
    private static String validatedUrl(String text) {
        if (text == null || text.length() > 255) return null;
        try {
            URI uri = new URI(text.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null ||
                uri.getUserInfo() != null || uri.getPort() != -1 || uri.getFragment() != null ||
                uri.getQuery() != null) return null;
            String host = uri.getHost().toLowerCase(java.util.Locale.ROOT);
            String configured = "";
            try { configured = new URI(BuildConfig.STREAM_DEFAULT_URL).getHost(); }
            catch (Exception ignored) {}
            boolean worker = host.endsWith(".workers.dev") && host.length() > ".workers.dev".length();
            boolean matchedConfig = configured != null && host.equalsIgnoreCase(configured);
            if (!worker && !matchedConfig) return null;
            String path = uri.getPath();
            if (path == null || !(path.equals("/stream") || path.equals("/stream/"))) return null;
            return "https://" + host + "/stream/";
        } catch (URISyntaxException ex) { return null; }
    }
    private TextView label(String text, int size) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(Color.WHITE);
        view.setTextSize(size);
        view.setPadding(8, 12, 8, 12);
        return view;
    }
    private Button button(String text) {
        Button b = new Button(this);
        b.setText(text);
        return b;
    }
    private void showSetup() {
        newRoot();
        root.addView(label("DrivMatch Stream",26));
        root.addView(label("Primeira configuração: informe o endereço HTTPS do Stream na sua conta Cloudflare.",16));
        root.addView(label("O aplicativo não usa o servidor de outros projetos.",14));
        EditText address = new EditText(this);
        address.setSingleLine(true);
        address.setHint("https://nome.conta.workers.dev/stream/");
        address.setText(baseUrl == null ? "" : baseUrl);
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT |
            android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setTextColor(Color.WHITE);
        address.setHintTextColor(Color.LTGRAY);
        root.addView(address,new LinearLayout.LayoutParams(-1,-2));
        Button connect = button("Conectar ao Stream");
        root.addView(connect);
        connect.setOnClickListener(v -> {
            String validated = validatedUrl(address.getText().toString());
            if (validated == null) {
                new AlertDialog.Builder(this).setTitle("Endereço inválido")
                    .setMessage("Use somente o endereço HTTPS do Worker Cloudflare do DrivMatch Stream.")
                    .setPositiveButton("Entendi",null).show();
                return;
            }
            baseUrl = validated;
            getPreferences(MODE_PRIVATE).edit().putString(PREF_URL, baseUrl).apply();
            showApp();
        });
    }
    private void showApp() {
        if (validatedUrl(baseUrl) == null) {showSetup();return;}
        newRoot();
        LinearLayout nav = new LinearLayout(this);
        nav.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = label("DrivMatch Stream",18);
        nav.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        Button reload = button("↻");
        reload.setContentDescription("Recarregar");
        nav.addView(reload);
        Button server = button("⚙");
        server.setContentDescription("Trocar servidor");
        nav.addView(server);
        root.addView(nav);
        reload.setOnClickListener(v -> {if(webView != null) webView.reload();});
        server.setOnClickListener(v -> new AlertDialog.Builder(this)
            .setTitle("Trocar servidor")
            .setMessage("Isso encerrará a exibição nesta tela. Os Favoritos permanecem na conta.")
            .setNegativeButton("Cancelar",null)
            .setPositiveButton("Continuar",(dialog,which) -> {
                if(webView != null){webView.destroy();webView=null;}
                showSetup();
            }).show());

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView,false);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equalsIgnoreCase(uri.getScheme()) &&
                    sameOrigin(uri.toString(),baseUrl) && uri.getPath() != null &&
                    uri.getPath().startsWith("/stream/")) return false;
                if ("https".equalsIgnoreCase(uri.getScheme())) {
                    try {startActivity(new Intent(Intent.ACTION_VIEW,uri));} catch (Exception ignored) {}
                }
                return true;
            }
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error) {
                handler.cancel(); // NEVER bypass TLS verification.
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,
                                                   WebResourceError error) {
                if (request.isForMainFrame()) {
                    new AlertDialog.Builder(MainActivity.this).setTitle("Falha de conexão")
                        .setMessage("Não foi possível carregar o Stream. Verifique a internet e tente novamente.")
                        .setPositiveButton("OK",null).show();
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view,CustomViewCallback callback) {
                if(fullscreenView!=null){callback.onCustomViewHidden();return;}
                fullscreenView=view; fullscreenCallback=callback;
                fullscreenContainer=new FrameLayout(MainActivity.this);
                fullscreenContainer.setBackgroundColor(Color.BLACK);
                fullscreenContainer.addView(view,new FrameLayout.LayoutParams(-1,-1));
                addContentView(fullscreenContainer,new ViewGroup.LayoutParams(-1,-1));
            }
            @Override public void onHideCustomView() {exitFullscreen();}
        });
        root.addView(webView,new LinearLayout.LayoutParams(-1,0,1));
        webView.loadUrl(baseUrl);
    }
    private static boolean sameOrigin(String a,String b){
        try {
            URI x=new URI(a),y=new URI(b);
            return x.getScheme().equalsIgnoreCase(y.getScheme()) &&
                x.getHost().equalsIgnoreCase(y.getHost()) && x.getPort()==y.getPort();
        } catch(Exception ex){return false;}
    }
    private void exitFullscreen(){
        if(fullscreenView==null)return;
        if(fullscreenContainer!=null){
            ((ViewGroup)fullscreenContainer.getParent()).removeView(fullscreenContainer);
            fullscreenContainer.removeAllViews();
        }
        fullscreenView=null; fullscreenContainer=null;
        if(fullscreenCallback!=null)fullscreenCallback.onCustomViewHidden();
        fullscreenCallback=null;
    }
    @Override public void onBackPressed(){
        if(fullscreenView!=null){exitFullscreen();return;}
        if(webView!=null && webView.canGoBack()){webView.goBack();return;}
        super.onBackPressed();
    }
    @Override protected void onDestroy(){
        if(webView!=null){webView.destroy();webView=null;}
        super.onDestroy();
    }
}