package corsica.universita.carnet.ui.record

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

enum class PermissionState { NotAsked, Granted, DeniedOnce, DeniedForever }

class PermissionFlow internal constructor(
    private val computeState: () -> PermissionState,
    private val request: () -> Unit,
    private val settings: () -> Unit,
) {
    fun compute(): PermissionState = computeState()
    fun launch() = request()
    fun openSettings() = settings()
}

@Composable
fun rememberPermissionFlow(vararg permissions: String): PermissionFlow {
    require(permissions.isNotEmpty()) { "At least one permission is required" }
    val context = LocalContext.current
    val activity = context.findActivity()
    val lifecycleOwner = LocalLifecycleOwner.current
    var askedBefore by rememberSaveable { mutableStateOf(false) }
    var refreshCount by rememberSaveable { mutableIntStateOf(0) }
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        refreshCount++
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) refreshCount++
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    return PermissionFlow(
        computeState = {
            // Reading this state makes permission changes after the system dialog/settings recompose UI.
            @Suppress("UNUSED_VARIABLE") val revision = refreshCount
            when {
                permissions.all {
                    ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
                } -> PermissionState.Granted
                activity != null && permissions.any {
                    ActivityCompat.shouldShowRequestPermissionRationale(activity, it)
                } -> PermissionState.DeniedOnce
                askedBefore -> PermissionState.DeniedForever
                else -> PermissionState.NotAsked
            }
        },
        request = {
            askedBefore = true
            launcher.launch(permissions.toList().toTypedArray())
        },
        settings = {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
                if (context !is Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        },
    )
}

private fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
