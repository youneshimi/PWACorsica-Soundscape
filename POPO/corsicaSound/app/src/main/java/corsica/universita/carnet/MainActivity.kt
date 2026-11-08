package corsica.universita.carnet

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import corsica.universita.carnet.ui.navigation.SoundscapeNavigation
import corsica.universita.carnet.ui.theme.CorsicaSoundTheme

class MainActivity : ComponentActivity() {
    // === DEMO CHECKLIST ===
    // 1. Repository : SoundRepository est la source de vérité pour les sons.
    // 2. Données : Room (SoundscapeDatabase) et DataStore (SettingsDataStore).
    // 3. Arrière-plan : SyncWorker synchronise la file locale via WorkManager.
    // 4. Notifications : SoundMessagingService ouvre le détail au clic.
    // 5. Permissions : PermissionFlow gère RECORD_AUDIO et la position.
    // 6. Cycle de vie : SavedStateHandle restaure le brouillon et la navigation.
    // 7. App Link : le domaine Worker ouvre l'application après vérification.
    // 8. Natif : RecordService garde la capture audio active en arrière-plan.
    // Test rotation : remplir le formulaire d'enregistrement, tourner -> champs et position conservés.
    // Test process death : remplir le formulaire, Home, puis :
    //   adb shell am kill corsica.universita.carnet
    //   Rouvrir la tâche depuis les applications récentes -> formulaire restauré.
    // App Link : la vérification nécessite assetlinks.json sur le Worker.
    // URL : https://pwacorsica-soundscape.ounesshimi.workers.dev/.well-known/assetlinks.json
    // Contenu : [{"relation":["delegate_permission/common.handle_all_urls"],
    //   "target":{"namespace":"android_app","package_name":"corsica.universita.carnet",
    //   "sha256_cert_fingerprints":["<DEBUG_FINGERPRINT>"]}}]
    // Fingerprint : keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
    // Test sans vérification du domaine :
    //   adb shell am start -a android.intent.action.VIEW -d "https://pwacorsica-soundscape.ounesshimi.workers.dev/" corsica.universita.carnet
    private var notificationSoundId by mutableStateOf<Long?>(null)
    private var pendingAppLink by mutableStateOf<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        notificationSoundId = soundIdFrom(intent)
        handleAppLink(intent, "Opened from URL")
        enableEdgeToEdge()
        setContent {
            CorsicaSoundTheme {
                SoundscapeNavigation(
                    notificationSoundId = notificationSoundId,
                    onNotificationHandled = {
                        notificationSoundId = null
                        intent?.removeExtra("soundId")
                    },
                    openMainScreen = pendingAppLink != null,
                    onAppLinkHandled = {
                        pendingAppLink = null
                        intent?.data = null
                    },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        notificationSoundId = soundIdFrom(intent)
        handleAppLink(intent, "New intent from URL")
    }

    private fun handleAppLink(intent: Intent?, message: String) {
        val uri = intent?.data ?: return
        if (intent.action == Intent.ACTION_VIEW && uri.scheme == "https" &&
            uri.host == "pwacorsica-soundscape.ounesshimi.workers.dev"
        ) {
            Log.d("AppLink", "$message: $uri")
            pendingAppLink = uri
        }
    }

    @Suppress("DEPRECATION")
    private fun soundIdFrom(intent: Intent?): Long? {
        val raw = intent?.extras?.get("soundId")
        return when (raw) {
            is Long -> raw
            is Int -> raw.toLong()
            is String -> raw.toLongOrNull()
            else -> null
        }?.takeIf { it > 0 }
    }
}
