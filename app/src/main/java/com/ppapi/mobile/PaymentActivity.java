package com.ppapi.mobile;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.Iterator;

/**
 * Hosted checkout container. The payment gateway expects a POST form, which
 * Android browsers do not reliably perform through ACTION_VIEW extras.
 */
public final class PaymentActivity extends Activity {
    static final String EXTRA_URL = "payment_url";
    static final String EXTRA_FIELDS = "payment_fields";

    private WebView web;
    private FrameLayout root;
    private View loading;
    private boolean failed;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.parseColor("#F7F9FC"));
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        String rawUrl = getIntent().getStringExtra(EXTRA_URL);
        Uri action = Uri.parse(rawUrl == null ? "" : rawUrl);
        String baseUrl = origin(action);
        if (!"https".equalsIgnoreCase(action.getScheme()) || TextUtils.isEmpty(action.getHost())
                || action.getUserInfo() != null) {
            Toast.makeText(this, "支付地址无效", Toast.LENGTH_SHORT).show();
            setResult(RESULT_CANCELED);
            finish();
            return;
        }

        JSONObject fields;
        try {
            fields = new JSONObject(getIntent().getStringExtra(EXTRA_FIELDS) == null
                    ? "{}" : getIntent().getStringExtra(EXTRA_FIELDS));
        } catch (Exception e) {
            Toast.makeText(this, "支付参数无效", Toast.LENGTH_SHORT).show();
            setResult(RESULT_CANCELED);
            finish();
            return;
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#F7F9FC"));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(18), dp(10), dp(10), dp(10));
        header.setBackgroundColor(Color.parseColor("#F7F9FC"));
        TextView title = new TextView(this);
        title.setText("BearLab 充值");
        title.setTextColor(Color.parseColor("#18212B"));
        title.setTextSize(18);
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        header.addView(title, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        Button close = new Button(this);
        close.setText("关闭");
        close.setAllCaps(false);
        close.setTextColor(Color.parseColor("#1764A9"));
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setMinWidth(0);
        close.setMinimumWidth(0);
        close.setPadding(dp(16), 0, dp(8), 0);
        close.setOnClickListener(v -> closeCheckout());
        header.addView(close, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#F7F9FC"));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " BearLab-Mobile-Android/1.0");
        CookieManager.getInstance().setAcceptCookie(true);
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        }
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return PaymentNavigation.handleNavigation(PaymentActivity.this, Uri.parse(url));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return PaymentNavigation.handleNavigation(PaymentActivity.this, request.getUrl());
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                showContent();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // The first page is the local POST form. A later main-frame
                // finish means the gateway rendered, even if commit is absent.
                if (!"about:blank".equals(url)) showContent();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) showFailure();
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                            android.webkit.WebResourceResponse response) {
                if (request.isForMainFrame()) showFailure();
            }
        });

        loading = buildLoadingView();
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(loading);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.addView(header, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        content.addView(root, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(content);

        web.loadDataWithBaseURL(
                baseUrl,
                paymentHtml(action, fields),
                "text/html",
                "UTF-8",
                null
        );
    }

    private void showContent() {
        if (loading == null) return;
        loading.animate().cancel();
        loading.animate().alpha(0f).setDuration(180).withEndAction(() -> {
            if (loading != null) loading.setVisibility(View.GONE);
        }).start();
    }

    private void showFailure() {
        if (loading == null) return;
        failed = true;
        loading.animate().cancel();
        loading.animate().alpha(1f).setDuration(150).start();
        loading.setVisibility(View.VISIBLE);
        loading.setAlpha(1f);
        ((FrameLayout) loading).removeAllViews();
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(24), dp(22), dp(24), dp(22));
        TextView message = new TextView(this);
        message.setText("无法打开支付页面。订单可能已经创建，请返回充值中心重新发起并核对记录。");
        message.setTextColor(Color.parseColor("#41596D"));
        message.setTextSize(15);
        message.setGravity(Gravity.CENTER);
        box.addView(message);
        Button retry = new Button(this);
        retry.setText("返回充值");
        retry.setAllCaps(false);
        retry.setTextColor(Color.WHITE);
        retry.setBackgroundColor(Color.parseColor("#0873CA"));
        retry.setOnClickListener(v -> closeCheckout());
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(dp(120), dp(44));
        retryParams.topMargin = dp(16);
        box.addView(retry, retryParams);
        FrameLayout.LayoutParams boxParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        boxParams.setMargins(dp(24), 0, dp(24), 0);
        boxParams.gravity = Gravity.CENTER;
        ((FrameLayout) loading).addView(box, boxParams);
    }

    private void closeCheckout() {
        setResult(failed ? RESULT_CANCELED : RESULT_OK);
        finish();
    }

    private View buildLoadingView() {
        FrameLayout mask = new FrameLayout(this);
        mask.setBackgroundColor(Color.parseColor("#F7F9FC"));
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(28), dp(24), dp(28), dp(24));
        GradientDrawable card = new GradientDrawable();
        card.setColor(Color.WHITE);
        card.setCornerRadius(dp(14));
        box.setBackground(card);
        TextView label = new TextView(this);
        label.setText("正在打开安全支付页面…");
        label.setTextColor(Color.parseColor("#41596D"));
        label.setTextSize(15);
        box.addView(label);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.gravity = Gravity.CENTER;
        mask.addView(box, params);
        return mask;
    }

    @Override
    public void onBackPressed() {
        closeCheckout();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.stopLoading();
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private static String paymentHtml(Uri action, JSONObject fields) {
        StringBuilder html = new StringBuilder(4096);
        html.append("<!doctype html><html lang=\"zh-Hans\"><head><meta charset=\"utf-8\">")
                .append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,maximum-scale=1\">")
                .append("<style>html,body{margin:0;min-height:100%;background:#f7f9fc}body{display:grid;place-items:center;")
                .append("font:15px/1.5 system-ui,sans-serif;color:#41596d}.c{margin:16px;padding:22px;max-width:440px;")
                .append("border:1px solid #dfe7f0;border-radius:14px;background:#fff;text-align:center}</style></head><body>")
                .append("<div class=\"c\"><div>正在跳转到安全支付页面…</div></div>")
                .append("<form id=\"payment\" method=\"post\" action=\"")
                .append(attribute(action.toString())).append("\">");
        Iterator<String> names = fields.keys();
        while (names.hasNext()) {
            String name = names.next();
            html.append("<input type=\"hidden\" name=\"").append(attribute(name))
                    .append("\" value=\"").append(attribute(fields.optString(name, ""))).append("\">");
        }
        html.append("</form><script>document.getElementById('payment').submit()</script></body></html>");
        return html.toString();
    }

    private static String origin(Uri uri) {
        StringBuilder value = new StringBuilder(uri.getScheme()).append("://").append(uri.getHost());
        if (uri.getPort() != -1) value.append(':').append(uri.getPort());
        return value.append('/').toString();
    }

    private static String attribute(String value) {
        return value.replace("&", "&amp;")
                .replace("\"", "&quot;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
