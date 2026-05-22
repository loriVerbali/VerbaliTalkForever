package com.verbali.matalkai

import android.os.Bundle
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    // Handle the splash screen transition
    val splashScreen = installSplashScreen()
    
    super.onCreate(savedInstanceState)
    // Hide system UI for immersive experience
    hideSystemUI()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      // Re-apply immersive mode after transient reveals (e.g., notification panel swipe)
      hideSystemUI()
    }
  }

  /**
   * Hide system bars (status bar and navigation buttons) using immersive sticky mode.
   * This allows content to draw edge-to-edge while keeping bars hidden during normal use.
   * Users can still reveal bars temporarily by swiping from edges.
   */
  private fun hideSystemUI() {
    // Allow content to draw behind system bars for edge-to-edge experience
    WindowCompat.setDecorFitsSystemWindows(window, false)

    val controller = WindowInsetsControllerCompat(window, window.decorView)
    
    // Use immersive sticky behavior - bars auto-hide after transient reveals
    controller.systemBarsBehavior =
      WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

    // Hide both status bar and navigation bars
    controller.hide(WindowInsetsCompat.Type.systemBars())
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "MatalkForever"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
