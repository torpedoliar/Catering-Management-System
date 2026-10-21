package co.id.santosjayaabadi.hallofood;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Edge-to-edge handling for the status bar.
 *
 * targetSdk 36 (Android 15+) makes edge-to-edge mandatory: the window no longer
 * reserves space for the status bar, setStatusBarColor() becomes a no-op and
 * the windowOptOutEdgeToEdgeEnforcement theme flag is ignored. Capacitor 5 has
 * no edge-to-edge support, so without this the WebView draws underneath the
 * status bar and the page's sticky header collides with the system clock and
 * the notification icons.
 *
 * Fix: inset the content view by the system bar insets so the page starts
 * below the status bar, and paint the leftover strip with the window
 * background. The colour matches the splash screen and the status bar colour
 * the app requests through StatusBar.setBackgroundColor() (#0f172a); the icons
 * are forced light so they stay legible on it.
 *
 * The insets are applied to the content view rather than the WebView because
 * Capacitor's CoordinatorLayout consumes them before they reach the WebView.
 */
public class MainActivity extends BridgeActivity {

    private static final String STATUS_BAR_BG = "#0f172a";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fills the strip left above the inset content.
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.parseColor(STATUS_BAR_BG)));

        // Light (white) icons on that dark strip.
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);

        final View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            Insets cutout = windowInsets.getInsets(WindowInsetsCompat.Type.displayCutout());
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());

            v.setPadding(
                Math.max(bars.left, cutout.left),
                Math.max(bars.top, cutout.top),
                Math.max(bars.right, cutout.right),
                Math.max(bars.bottom, ime.bottom)
            );
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);
    }
}
