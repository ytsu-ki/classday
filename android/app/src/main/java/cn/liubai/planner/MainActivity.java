package cn.liubai.planner;

import android.os.Bundle;
import android.webkit.CookieManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlannerStorePlugin.class);
        registerPlugin(BackupPlugin.class);
        registerPlugin(AppearancePlugin.class);
        super.onCreate(savedInstanceState);
        // Match the light or dark app background so the first frame never flashes.
        getBridge().getWebView().setBackgroundColor(ContextCompat.getColor(this, R.color.appBackground));
        // The school sign-in window is gone; end any session it left behind. The app itself uses no cookies.
        CookieManager.getInstance().removeAllCookies(null);
    }
}
