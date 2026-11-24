package com.streamnow.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.res.ColorStateList;
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
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.net.URI;

/** Stream Now official-site Android WebView wrapper.
 * Target is intentionally restricted to https://streamnow.pages.dev/.
 * No DrivMatch domain/Worker fallback, credentials, tracking or built-in streams.
 * This is an Android DEBUG/BETA build, not a Play Store release.
 */
public final class MainActivity extends Activity {
    private static final String HOME = "https://streamnow.pages.dev/";
    private static final int BLACK = Color.rgb(9,9,9);
    private static final int GRAPHITE = Color.rgb(25,25,25);
    private static final int RED = Color.rgb(184,0,40);
    private WebView webView;
    private View fullView;
    private WebChromeClient.CustomViewCallback fullCallback;
    private FrameLayout fullContainer;
    private boolean errorVisible=false;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BLACK);
        getWindow().setNavigationBarColor(BLACK);
        getWindow().getDecorView().setSystemUiVisibility(0);
        showApp();
    }
    private static boolean sameHost(Uri uri) {
        return uri!=null
            && "https".equalsIgnoreCase(uri.getScheme())
            && "streamnow.pages.dev".equalsIgnoreCase(uri.getHost())
            && uri.getPort()==-1;
    }
    private Button action(String text, String description) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(17);
        b.setTextColor(Color.WHITE);
        b.setAllCaps(false);
        b.setContentDescription(description);
        b.setBackgroundTintList(ColorStateList.valueOf(GRAPHITE));
        return b;
    }
    private void connectionIssue(String text) {
        if(errorVisible||isFinishing())return;
        errorVisible=true;
        new AlertDialog.Builder(this)
            .setTitle("Stream Now indisponível")
            .setMessage(text)
            .setPositiveButton("Tentar novamente",(d,w)->{
                errorVisible=false;
                if(webView!=null)webView.loadUrl(HOME);
            })
            .setNegativeButton("Fechar",(d,w)->errorVisible=false)
            .show();
    }
    private void showApp() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BLACK);
        setContentView(root);

        LinearLayout bar = new LinearLayout(this);
        bar.setPadding(12,7,12,7);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(GRAPHITE);

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.drawable.streamnow_icon);
        icon.setContentDescription("Marca Stream Now");
        LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(42,42);
        ip.setMargins(0,0,12,0);
        bar.addView(icon,ip);

        TextView title = new TextView(this);
        title.setText("STREAM NOW");
        title.setTextColor(Color.WHITE);
        title.setTextSize(20);
        title.setTypeface(null,1);
        title.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(title,new LinearLayout.LayoutParams(0,-2,1));

        Button home = action("⌂","Página inicial Stream Now");
        Button reload = action("↻","Recarregar Stream Now");
        bar.addView(home);
        bar.addView(reload);
        root.addView(bar,new LinearLayout.LayoutParams(-1,-2));

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setGeolocationEnabled(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView,false);

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                Uri uri=request.getUrl();
                if(sameHost(uri))return false;
                if("https".equalsIgnoreCase(uri.getScheme())){
                    try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}
                }
                return true;
            }
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){
                handler.cancel();
                connectionIssue("Não foi possível validar a segurança HTTPS do endereço oficial.");
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){
                if(request.isForMainFrame())connectionIssue(
                    "Não foi possível abrir streamnow.pages.dev. Verifique a conexão e a publicação do site.");
            }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){
                if(request.isForMainFrame()&&response.getStatusCode()>=400)
                    connectionIssue("O site oficial respondeu HTTP "+response.getStatusCode()+". Não há redirecionamento para outro domínio.");
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view,CustomViewCallback callback){
                if(fullView!=null){callback.onCustomViewHidden();return;}
                fullView=view;fullCallback=callback;
                fullContainer=new FrameLayout(MainActivity.this);
                fullContainer.setBackgroundColor(Color.BLACK);
                fullContainer.addView(view,new FrameLayout.LayoutParams(-1,-1));
                addContentView(fullContainer,new ViewGroup.LayoutParams(-1,-1));
            }
            @Override public void onHideCustomView(){exitFullscreen();}
        });
        root.addView(webView,new LinearLayout.LayoutParams(-1,0,1));
        home.setOnClickListener(v->webView.loadUrl(HOME));
        reload.setOnClickListener(v->webView.reload());
        webView.loadUrl(HOME);
    }
    private void exitFullscreen() {
        if(fullView==null)return;
        if(fullContainer!=null){
            ((ViewGroup)fullContainer.getParent()).removeView(fullContainer);
            fullContainer.removeAllViews();
        }
        fullView=null;fullContainer=null;
        if(fullCallback!=null)fullCallback.onCustomViewHidden();
        fullCallback=null;
    }
    @Override public void onBackPressed(){
        if(fullView!=null){exitFullscreen();return;}
        if(webView!=null&&webView.canGoBack()){webView.goBack();return;}
        super.onBackPressed();
    }
    @Override protected void onDestroy(){
        if(webView!=null){webView.destroy();webView=null;}
        super.onDestroy();
    }
}
