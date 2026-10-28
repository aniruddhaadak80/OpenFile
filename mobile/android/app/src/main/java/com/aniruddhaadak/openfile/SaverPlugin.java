package com.aniruddhaadak.openfile;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** Saves a file the web app "downloads" (blob: or data: link) into Downloads/OpenFile. */
@CapacitorPlugin(name = "OpenFileSaver")
public class SaverPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data", "");
        String mime = call.getString("mime", "application/octet-stream");
        String name = call.getString("name", "download").replaceAll("[\\\\/:*?\"<>|]", "_");
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/OpenFile");
                Uri uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Exception("could not create the file");
                try (OutputStream os = getContext().getContentResolver().openOutputStream(uri)) { os.write(bytes); }
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "OpenFile");
                if (!dir.exists()) dir.mkdirs();
                try (FileOutputStream os = new FileOutputStream(new File(dir, name))) { os.write(bytes); }
            }
            toast("Saved to Downloads/OpenFile: " + name);
            JSObject ret = new JSObject();
            ret.put("name", name);
            call.resolve(ret);
        } catch (Exception e) {
            toast("Could not save the file: " + e.getMessage());
            call.reject(e.getMessage());
        }
    }

    private void toast(final String msg) {
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), msg, Toast.LENGTH_LONG).show());
    }
}
