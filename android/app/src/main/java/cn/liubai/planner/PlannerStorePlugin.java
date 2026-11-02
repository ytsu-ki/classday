package cn.liubai.planner;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import org.json.JSONObject;

/** Durable planner storage for the web layer. Calls run one at a time on Capacitor's plugin thread. */
@CapacitorPlugin(name = "PlannerStore")
public class PlannerStorePlugin extends Plugin {
    private StateFiles files;

    @Override
    public void load() {
        files = new StateFiles(new File(getContext().getFilesDir(), "planner"));
    }

    private static JSObject text(String value) {
        JSObject result = new JSObject();
        result.put("data", value == null ? JSONObject.NULL : value);
        return result;
    }

    @PluginMethod
    public void read(PluginCall call) {
        try { call.resolve(text(files.read())); }
        catch (Exception error) { call.reject("Saved data could not be read", error); }
    }

    @PluginMethod
    public void readPrevious(PluginCall call) {
        try { call.resolve(text(files.readPrevious())); }
        catch (Exception error) { call.reject("The previous save could not be read", error); }
    }

    @PluginMethod
    public void write(PluginCall call) {
        try {
            files.write(call.getString("data"));
            call.resolve();
        } catch (Exception error) {
            call.reject("Changes could not be saved", error);
        }
    }

    @PluginMethod
    public void snapshot(PluginCall call) {
        try {
            files.snapshot(call.getString("data"), call.getString("day", ""), call.getInt("keep", 7));
            call.resolve();
        } catch (Exception error) {
            call.reject("The daily copy could not be saved", error);
        }
    }

    @PluginMethod
    public void listSnapshots(PluginCall call) {
        JSArray list = new JSArray();
        for (String day : files.snapshotDays()) {
            JSObject entry = new JSObject();
            entry.put("day", day);
            entry.put("size", files.snapshotSize(day));
            list.put(entry);
        }
        JSObject result = new JSObject();
        result.put("snapshots", list);
        call.resolve(result);
    }

    @PluginMethod
    public void readSnapshot(PluginCall call) {
        try { call.resolve(text(files.readSnapshot(call.getString("day", "")))); }
        catch (Exception error) { call.reject("That copy could not be read", error); }
    }
}
