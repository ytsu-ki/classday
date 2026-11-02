package cn.liubai.planner;

import static org.junit.Assert.*;
import android.app.UiModeManager;
import org.junit.Test;

public class AppearancePluginTest {
    @Test
    public void formatsColorsAsSixDigitHex() {
        // The app only accepts #rrggbb; alpha is dropped and leading zeros are kept.
        assertEquals("#3d50fa", AppearancePlugin.hex(0xFF3D50FA));
        assertEquals("#00000a", AppearancePlugin.hex(0xFF00000A));
        assertEquals("#ffffff", AppearancePlugin.hex(0x80FFFFFF));
    }

    @Test
    public void mapsThemeChoicesToNightModes() {
        assertEquals(UiModeManager.MODE_NIGHT_NO, AppearancePlugin.nightModeFor("light"));
        assertEquals(UiModeManager.MODE_NIGHT_YES, AppearancePlugin.nightModeFor("dark"));
        assertEquals(UiModeManager.MODE_NIGHT_AUTO, AppearancePlugin.nightModeFor("system"));
        // Anything unexpected follows the phone.
        assertEquals(UiModeManager.MODE_NIGHT_AUTO, AppearancePlugin.nightModeFor(null));
        assertEquals(UiModeManager.MODE_NIGHT_AUTO, AppearancePlugin.nightModeFor("sepia"));
    }

    @Test
    public void mapsLanguageChoicesToLocales() {
        assertEquals("en", AppearancePlugin.localeTag("en"));
        assertEquals("zh-CN", AppearancePlugin.localeTag("zh-Hans"));
        // System, or anything unexpected, follows the phone.
        assertEquals("", AppearancePlugin.localeTag("system"));
        assertEquals("", AppearancePlugin.localeTag(null));
        assertEquals("", AppearancePlugin.localeTag("fr"));
    }
}
