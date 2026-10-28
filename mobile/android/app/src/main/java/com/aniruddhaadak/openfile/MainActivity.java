package com.aniruddhaadak.openfile;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * OpenFile for Android. The web build does all the work inside the WebView.
 * Android WebView cannot save blob: or data: downloads on its own, so download link clicks are patched to send
 * the bytes to SaverPlugin, which writes them to Downloads/OpenFile.
 */
public class MainActivity extends BridgeActivity {
    private static final String PATCH =
        "(function(){if(window.__ofDl)return;window.__ofDl=1;" +
        "var o=HTMLAnchorElement.prototype.click;" +
        "window.__ofSave=function(u,n){fetch(u).then(function(r){return r.blob()}).then(function(b){" +
        "var fr=new FileReader();fr.onload=function(){var s=String(fr.result);var i=s.indexOf(',');" +
        "window.Capacitor.nativePromise('OpenFileSaver','save',{data:s.slice(i+1),mime:b.type||'application/octet-stream',name:n||'download'})};" +
        "fr.readAsDataURL(b)})};" +
        "HTMLAnchorElement.prototype.click=function(){try{var h=this.href||'';" +
        "if(this.hasAttribute('download')&&(h.indexOf('blob:')===0||h.indexOf('data:')===0)&&window.Capacitor){window.__ofSave(h,this.download);return}}catch(e){}" +
        "return o.apply(this,arguments)}})();";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaverPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                webView.evaluateJavascript(PATCH, null);
            }
        });
    }
}
