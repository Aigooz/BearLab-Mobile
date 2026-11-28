package com.ppapi.mobile;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;

/** Shared navigation policy for the hosted checkout WebView. */
final class PaymentNavigation {
    private static final String[] PAYMENT_SCHEMES = {"alipays", "alipay", "weixin", "wechat"};

    private PaymentNavigation() {}

    static boolean handleNavigation(Context context, Uri uri) {
        if (uri == null) return true;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if ("https".equals(scheme) && uri.getHost() != null && !uri.getHost().isEmpty()
                && uri.getUserInfo() == null) {
            return false;
        }
        Intent intent;
        if ("intent".equals(scheme)) {
            try {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
            } catch (Exception e) {
                Toast.makeText(context, "支付跳转地址无效，请返回重试", Toast.LENGTH_SHORT).show();
                return true;
            }
            if (intent.getData() == null) {
                Toast.makeText(context, "支付跳转地址无效，请返回重试", Toast.LENGTH_SHORT).show();
                return true;
            }
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.setComponent(null);
            intent.setSelector(null);
        } else if (containsScheme(scheme) && uri.getUserInfo() == null) {
            intent = new Intent(Intent.ACTION_VIEW, uri);
        } else {
            Toast.makeText(context, "无法打开支付应用，请返回重试", Toast.LENGTH_SHORT).show();
            return true;
        }
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(context, "未找到对应的支付应用，请安装后重试", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(context, "无法打开支付应用，请返回重试", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private static boolean containsScheme(String scheme) {
        for (String value : PAYMENT_SCHEMES) {
            if (value.equals(scheme)) return true;
        }
        return false;
    }
}
