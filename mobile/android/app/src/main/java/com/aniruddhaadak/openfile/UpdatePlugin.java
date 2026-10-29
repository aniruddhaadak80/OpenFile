package com.aniruddhaadak.openfile;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;

/**
 * In-app updates for the sideloaded APK (src/lib/app/updateAndroid.ts drives this).
 *  - info:      app version, whether OpenFile may open the installer, and whether the connection is metered
 *  - download:  fetches the APK from GitHub Releases into the app cache, with progress
 *  - verify:    the APK must be com.aniruddhaadak.openfile, newer than this install, and signed with the same
 *               certificate; anything else is deleted and refused
 *  - install:   opens the system installer through the FileProvider (Android always asks the user)
 *  - get/setPrefs: update preferences shared by the bundled copy and the hosted web version
 */
@CapacitorPlugin(name = "OpenFileUpdater")
public class UpdatePlugin extends Plugin {
    private static final String ALLOWED_PREFIX_1 = "https://github.com/aniruddhaadak80/OpenFile/releases/";
    private volatile String state = "idle";
    private volatile long done = 0;
    private volatile long total = 0;
    private volatile String error = null;
    private volatile File apk = null;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences("openfile_updates", Context.MODE_PRIVATE);
    }

    @SuppressWarnings("deprecation")
    private PackageInfo self() throws PackageManager.NameNotFoundException {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        return pm.getPackageInfo(getContext().getPackageName(), flags);
    }

    @SuppressWarnings("deprecation")
    private static long code(PackageInfo p) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? p.getLongVersionCode() : p.versionCode;
    }

    @SuppressWarnings("deprecation")
    private static Set<String> certs(PackageInfo p) {
        Set<String> out = new HashSet<>();
        Signature[] sigs = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && p.signingInfo != null) {
            sigs = p.signingInfo.hasMultipleSigners() ? p.signingInfo.getApkContentsSigners() : p.signingInfo.getSigningCertificateHistory();
        }
        if (sigs == null) sigs = p.signatures;
        if (sigs == null) return out;
        for (Signature s : sigs) {
            try {
                byte[] d = MessageDigest.getInstance("SHA-256").digest(s.toByteArray());
                StringBuilder b = new StringBuilder();
                for (byte x : d) b.append(String.format("%02x", x));
                out.add(b.toString());
            } catch (Exception ignored) { }
        }
        return out;
    }

    private boolean metered() {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        return cm.isActiveNetworkMetered();
    }

    private boolean online() {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        Network n = cm.getActiveNetwork();
        if (n == null) return false;
        NetworkCapabilities c = cm.getNetworkCapabilities(n);
        return c != null && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void info(PluginCall call) {
        try {
            PackageInfo p = self();
            JSObject r = new JSObject();
            r.put("version", p.versionName);
            r.put("code", code(p));
            r.put("sdk", Build.VERSION.SDK_INT);
            r.put("canInstall", canInstall());
            r.put("metered", metered());
            r.put("online", online());
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void getPrefs(PluginCall call) {
        JSObject r = new JSObject();
        r.put("json", prefs().getString("prefs", "{}"));
        call.resolve(r);
    }

    @PluginMethod
    public void setPrefs(PluginCall call) {
        String json = call.getString("json", "{}");
        if (json.length() > 16384) { call.reject("too large"); return; }
        prefs().edit().putString("prefs", json).apply();
        call.resolve();
    }

    @PluginMethod
    public void progress(PluginCall call) {
        JSObject r = new JSObject();
        r.put("state", state);
        r.put("done", done);
        r.put("total", total);
        if (error != null) r.put("error", error);
        call.resolve(r);
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url", "");
        final String version = call.getString("version", "update").replaceAll("[^0-9A-Za-z.\\-]", "_");
        if (!url.startsWith(ALLOWED_PREFIX_1)) { call.reject("download source not allowed"); return; }
        if ("downloading".equals(state)) { call.reject("a download is already running"); return; }
        if ("verified".equals(state) && apk != null && apk.exists() && apk.getName().contains(version)) { call.resolve(); return; }
        state = "downloading"; done = 0; total = 0; error = null;
        new Thread(() -> {
            File dir = new File(getContext().getCacheDir(), "updates");
            File out = new File(dir, "OpenFile-" + version + ".apk");
            try {
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("could not create the update folder");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) if (!f.equals(out)) f.delete();
                URL u = new URL(url);
                HttpURLConnection c = null;
                // GitHub answers with redirects to its download host; follow them (https only)
                for (int i = 0; i < 6; i++) {
                    c = (HttpURLConnection) u.openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(30000);
                    c.setRequestProperty("Accept", "application/octet-stream");
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = c.getHeaderField("Location");
                        c.disconnect();
                        if (loc == null) throw new Exception("redirect without a location");
                        u = new URL(u, loc);
                        if (!"https".equals(u.getProtocol())) throw new Exception("insecure redirect refused");
                        continue;
                    }
                    if (code != 200) throw new Exception("download failed: HTTP " + code);
                    break;
                }
                if (c == null) throw new Exception("too many redirects");
                total = c.getContentLengthLong();
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) { os.write(buf, 0, n); done += n; }
                }
                c.disconnect();
                verify(out);
                apk = out;
                state = "verified";
                call.resolve();
            } catch (Exception e) {
                out.delete();
                error = e.getMessage();
                state = "error";
                call.reject(error);
            }
        }).start();
    }

    @SuppressWarnings("deprecation")
    private void verify(File f) throws Exception {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo a = pm.getPackageArchiveInfo(f.getAbsolutePath(), flags);
        if (a == null) throw new Exception("the download is not a valid APK");
        PackageInfo me = self();
        if (!getContext().getPackageName().equals(a.packageName)) throw new Exception("the APK is not OpenFile");
        if (code(a) <= code(me)) throw new Exception("the APK is not newer than the installed version");
        Set<String> mine = certs(me), theirs = certs(a);
        if (!mine.isEmpty() && !theirs.isEmpty() && !mine.equals(theirs)) {
            throw new Exception("signed-with-different-key: this APK is signed with a different key than the installed app. Uninstall OpenFile once, then install the new version from the release page.");
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        if (apk == null || !apk.exists() || !"verified".equals(state)) { call.reject("no verified update to install"); return; }
        if (!canInstall()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(s);
            call.reject("needs-permission");
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://")) { call.reject("only https links"); return; }
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
