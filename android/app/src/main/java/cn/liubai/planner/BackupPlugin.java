package cn.liubai.planner;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "Backup")
public class BackupPlugin extends Plugin {
    static byte[] backupBytes(String data) {
        if (data == null || data.isEmpty()) throw new IllegalArgumentException("Backup is empty");
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 10 * 1024 * 1024) throw new IllegalArgumentException("Backup exceeds 10 MB");
        return bytes;
    }

    static void copyBackup(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[8192];
        int length;
        while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
    }

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        File temporary = null;
        try {
            byte[] data = backupBytes(call.getString("data"));
            if (filename == null || filename.length() > 150 || !filename.matches("[\\p{L}\\p{N}_ .-]+\\.json")) {
                throw new IllegalArgumentException("Invalid backup filename");
            }
            temporary = File.createTempFile("backup-", ".json", getContext().getCacheDir());
            try (OutputStream output = new FileOutputStream(temporary)) {
                output.write(data);
            }
            // Keep large JSON out of Android's size-limited saved activity state.
            call.getData().remove("data");
            call.getData().put("temporary", temporary.getName());
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            startActivityForResult(call, intent, "saveResult");
        } catch (IOException | RuntimeException error) {
            if (temporary != null) temporary.delete();
            call.reject("Could not open backup destination", error);
        }
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        String name = call.getString("temporary", "");
        if (!name.matches("backup-[0-9]+\\.json")) {
            call.reject("Backup snapshot is unavailable");
            return;
        }
        File temporary = new File(getContext().getCacheDir(), name);
        if (result.getResultCode() != Activity.RESULT_OK) {
            temporary.delete();
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null) {
            temporary.delete();
            call.reject("No backup destination selected");
            return;
        }
        // Wait for the file to close successfully before reporting a saved backup.
        getBridge().execute(() -> {
            try {
                try (InputStream input = new FileInputStream(temporary);
                     OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new IOException("Destination could not be opened");
                    copyBackup(input, output);
                }
                call.resolve(new JSObject().put("cancelled", false));
            } catch (IOException | RuntimeException error) {
                call.reject("Backup could not be saved", error);
            } finally {
                temporary.delete();
            }
        });
    }
}
