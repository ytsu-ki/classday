package cn.liubai.planner;

import android.app.UiModeManager;
import android.content.res.Resources;
import android.os.Build;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.content.ContextCompat;
import androidx.core.os.ConfigurationCompat;
import androidx.core.os.LocaleListCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/** The phone's wallpaper colors for the Wallpaper accent, and the app's light/dark and language choices. */
@CapacitorPlugin(name = "Appearance")
public class AppearancePlugin extends Plugin {
    static String hex(int color) {
        return String.format(Locale.ROOT, "#%06x", color & 0xFFFFFF);
    }

    /** The Android locale for a language choice; "" follows the phone. Matches res/xml/locales_config.xml. */
    static String localeTag(String language) {
        if ("en".equals(language)) return "en";
        if ("zh-Hans".equals(language)) return "zh-CN";
        return "";
    }

    static int nightModeFor(String mode) {
        if ("light".equals(mode)) return UiModeManager.MODE_NIGHT_NO;
        if ("dark".equals(mode)) return UiModeManager.MODE_NIGHT_YES;
        return UiModeManager.MODE_NIGHT_AUTO;
    }

    @PluginMethod
    public void wallpaper(PluginCall call) {
        JSArray colors = new JSArray();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Tone 40 of the primary, secondary and tertiary system palettes.
            colors.put(hex(ContextCompat.getColor(getContext(), android.R.color.system_accent1_600)));
            colors.put(hex(ContextCompat.getColor(getContext(), android.R.color.system_accent2_600)));
            colors.put(hex(ContextCompat.getColor(getContext(), android.R.color.system_accent3_600)));
        }
        JSObject result = new JSObject();
        result.put("colors", colors);
        call.resolve(result);
    }

    /**
     * Tells Android 12+ which mode the app uses. Android remembers it, so the launch screen
     * already has the right background next time. Older versions rely on the in-app theme alone.
     */
    @PluginMethod
    public void nightMode(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            UiModeManager uiMode = getContext().getSystemService(UiModeManager.class);
            if (uiMode != null) uiMode.setApplicationNightMode(nightModeFor(call.getString("mode", "system")));
        }
        call.resolve();
    }

    /**
     * The phone's own languages, unaffected by the app's, and the language Android 13+ keeps for
     * the app (Settings → Apps → Language), so a change made there reaches the app's setting.
     */
    @PluginMethod
    public void languages(PluginCall call) {
        JSArray system = new JSArray();
        LocaleListCompat locales = ConfigurationCompat.getLocales(Resources.getSystem().getConfiguration());
        for (int i = 0; i < locales.size(); i++) system.put(locales.get(i).toLanguageTag());
        JSObject result = new JSObject();
        result.put("system", system);
        result.put("app", AppCompatDelegate.getApplicationLocales().toLanguageTags());
        result.put("perApp", Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU);
        call.resolve(result);
    }

    /** Android's own screens and dialogs, such as the time picker, follow the app's language. */
    @PluginMethod
    public void setLanguage(PluginCall call) {
        String tag = localeTag(call.getString("language", "system"));
        getActivity().runOnUiThread(() -> {
            AppCompatDelegate.setApplicationLocales(tag.isEmpty() ? LocaleListCompat.getEmptyLocaleList() : LocaleListCompat.forLanguageTags(tag));
            call.resolve();
        });
    }
}
