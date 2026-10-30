package gr.exodouxoi;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/** Εμφανίζει την εφαρμογή (assets/index.html) σε WebView. Τα δεδομένα μένουν στη μνήμη της εφαρμογής. */
public class MainActivity extends Activity {
    /** Από εδώ ελέγχει για νέες εκδόσεις (GitHub Releases, asset "Exodouxoi.apk"). */
    private static final String RELEASES_API = "https://api.github.com/repos/IsidorosT/ExitArrangments/releases?per_page=20";
    private static final String APK_ASSET = "Exodouxoi.apk";

    private WebView web;
    private long downloadId = -1;
    private BroadcastReceiver downloadReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#2f4a2f"));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        if (downloadReceiver != null) {
            try { unregisterReceiver(downloadReceiver); } catch (Exception ignored) { }
        }
        super.onDestroy();
    }

    private int versionCode() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    /** Καλεί συνάρτηση της σελίδας με ένα JSON αντικείμενο. */
    private void callJs(String fn, JSONObject data) {
        String js = "window." + fn + " && window." + fn + "(" + data.toString() + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    private void status(String msg) {
        try {
            JSONObject o = new JSONObject();
            o.put("msg", msg);
            callJs("onUpdateStatus", o);
        } catch (Exception ignored) { }
    }

    private class Bridge {
        @JavascriptInterface
        public void share(String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, "Αποστολή"));
            });
        }

        @JavascriptInterface
        public void copy(String text) {
            runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("Εξοδούχοι", text));
            });
        }

        @JavascriptInterface
        public String version() {
            return versionName();
        }

        /** Βρίσκει την πιο πρόσφατη υπογεγραμμένη έκδοση στο GitHub. Απάντηση στο window.onUpdateInfo. */
        @JavascriptInterface
        public void checkUpdate(boolean silent) {
            new Thread(() -> {
                JSONObject res = new JSONObject();
                try {
                    res.put("silent", silent);
                    res.put("current", versionName());
                    HttpURLConnection c = (HttpURLConnection) new URL(RELEASES_API).openConnection();
                    c.setRequestProperty("Accept", "application/vnd.github+json");
                    c.setRequestProperty("User-Agent", "Exodouxoi-Android");
                    c.setConnectTimeout(10000);
                    c.setReadTimeout(15000);
                    if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                    StringBuilder sb = new StringBuilder();
                    try (BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
                        String line;
                        while ((line = br.readLine()) != null) sb.append(line);
                    }
                    JSONArray rels = new JSONArray(sb.toString());
                    int best = 0;
                    String bestUrl = null, bestTag = null;
                    for (int i = 0; i < rels.length(); i++) {
                        JSONObject r = rels.getJSONObject(i);
                        if (r.optBoolean("draft") || r.optBoolean("prerelease")) continue;
                        String tag = r.optString("tag_name", "");
                        int n;
                        try { n = Integer.parseInt(tag.substring(tag.lastIndexOf('.') + 1)); } catch (Exception e) { continue; }
                        JSONArray assets = r.optJSONArray("assets");
                        if (assets == null) continue;
                        for (int k = 0; k < assets.length(); k++) {
                            JSONObject a = assets.getJSONObject(k);
                            if (APK_ASSET.equals(a.optString("name")) && n > best) {
                                best = n;
                                bestUrl = a.optString("browser_download_url");
                                bestTag = tag;
                            }
                        }
                    }
                    boolean newer = best > versionCode() && bestUrl != null;
                    res.put("available", newer);
                    if (newer) {
                        res.put("latest", bestTag);
                        res.put("url", bestUrl);
                    }
                } catch (Exception e) {
                    try { res.put("error", "Δεν υπάρχει σύνδεση ή το GitHub δεν απάντησε"); } catch (Exception ignored) { }
                }
                callJs("onUpdateInfo", res);
            }).start();
        }

        /** Κατεβάζει το APK και ανοίγει τον installer του Android. */
        @JavascriptInterface
        public void installUpdate(String url) {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                    status("Επίτρεψε «Εγκατάσταση άγνωστων εφαρμογών» για τους Εξοδούχους και ξαναπάτα Ενημέρωση.");
                    startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getPackageName())));
                    return;
                }
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setTitle("Εξοδούχοι — ενημέρωση");
                req.setMimeType("application/vnd.android.package-archive");
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalFilesDir(MainActivity.this, Environment.DIRECTORY_DOWNLOADS,
                        "Exodouxoi-" + System.currentTimeMillis() + ".apk");

                if (downloadReceiver == null) {
                    downloadReceiver = new BroadcastReceiver() {
                        @Override
                        public void onReceive(Context ctx, Intent intent) {
                            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                            if (id != downloadId) return;
                            Uri apk = dm.getUriForDownloadedFile(id);
                            if (apk == null) { status("Η λήψη απέτυχε. Δοκίμασε ξανά."); return; }
                            Intent install = new Intent(Intent.ACTION_VIEW);
                            install.setDataAndType(apk, "application/vnd.android.package-archive");
                            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                            status("Πάτα «Ενημέρωση» για να ολοκληρωθεί.");
                            startActivity(install);
                        }
                    };
                    IntentFilter f = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
                    if (Build.VERSION.SDK_INT >= 33) registerReceiver(downloadReceiver, f, Context.RECEIVER_EXPORTED);
                    else registerReceiver(downloadReceiver, f);
                }
                downloadId = dm.enqueue(req);
                status("Γίνεται λήψη της νέας έκδοσης…");
            });
        }
    }
}
