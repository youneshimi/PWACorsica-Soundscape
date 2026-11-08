package corsica.universita.carnet.ui.record

import android.Manifest
import android.content.Context
import android.content.ComponentName
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.IBinder
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.os.CancellationSignal
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.SavedStateHandleSaveableApi
import androidx.lifecycle.viewmodel.compose.saveable
import corsica.universita.carnet.data.SoundscapeContainer
import corsica.universita.carnet.work.RecordService
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Cycle de vie :
 * - Brouillon, coordonnées et chemin du fichier terminé : SavedStateHandle, restaurés après rotation
 *   ou mort du processus si la tâche Android est conservée. Le fichier audio reste sur disque.
 * - Service, enregistrement actif et amplitudes : état éphémère, recréé à l'ouverture de l'écran.
 */
@OptIn(SavedStateHandleSaveableApi::class)
class RecordViewModel(private val savedState: SavedStateHandle) : ViewModel() {
    val draftTitle: StateFlow<String> = savedState.getStateFlow("draftTitle", "")
    val draftDescription: StateFlow<String> = savedState.getStateFlow("draftDescription", "")
    val draftCategory: StateFlow<String> = savedState.getStateFlow("draftCategory", "nature")

    var isRecording by mutableStateOf(false)
        private set
    var isStarting by mutableStateOf(false)
        private set
    var recordingPath by savedState.saveable { mutableStateOf<String?>(null) }
        private set
    var latitude by savedState.saveable { mutableStateOf<Double?>(null) }
        private set
    var longitude by savedState.saveable { mutableStateOf<Double?>(null) }
        private set
    var amplitudes by mutableStateOf<List<Int>>(emptyList())
        private set
    var savedSuccessfully by mutableStateOf(false)
        private set
    var isSaving by mutableStateOf(false)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set
    var locationLoading by mutableStateOf(false)
        private set

    private var service: RecordService? = null
    private var connection: ServiceConnection? = null
    private var applicationContext: Context? = null
    private var activeFile: File? = null
    private var amplitudeJob: Job? = null
    private var startupJob: Job? = null

    init {
        // A stopped recording survives process death only while its file still exists.
        if (recordingPath?.let { File(it).isFile && File(it).length() > 0 } == false) {
            recordingPath = null
        }
    }

    fun updateTitle(value: String) { savedState["draftTitle"] = value }
    fun updateDescription(value: String) { savedState["draftDescription"] = value }
    fun updateCategory(value: String) { savedState["draftCategory"] = value }

    fun startRecording(context: Context) {
        if (isRecording || isStarting || isSaving) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            errorMessage = "Autorisez le microphone pour enregistrer."
            return
        }
        val directory = File(context.filesDir, "recordings")
        if (!directory.exists() && !directory.mkdirs()) {
            errorMessage = "Impossible de préparer le dossier d'enregistrement."
            return
        }
        val file = File(directory, "sound_${System.currentTimeMillis()}.m4a")
        try {
            recordingPath?.let { File(it).delete() }
            recordingPath = null
            amplitudes = emptyList()
            errorMessage = null
            activeFile = file
            isStarting = true
            val appContext = context.applicationContext
            applicationContext = appContext
            val intent = Intent(appContext, RecordService::class.java)
                .putExtra(RecordService.EXTRA_OUTPUT_PATH, file.absolutePath)
            val serviceConnection = object : ServiceConnection {
                override fun onServiceConnected(name: ComponentName, binder: IBinder) {
                    val recordService = (binder as RecordService.RecordBinder).getService()
                    service = recordService
                    recordService.setStateListener { recording, error ->
                        startupJob?.cancel()
                        startupJob = null
                        isStarting = false
                        isRecording = recording
                        if (recording) {
                            amplitudeJob?.cancel()
                            amplitudeJob = viewModelScope.launch {
                                while (isActive) {
                                    amplitudes = (amplitudes + recordService.getAmplitude()).takeLast(24)
                                    delay(100)
                                }
                            }
                        } else if (error != null) {
                            errorMessage = error
                            activeFile?.delete()
                            activeFile = null
                            unbindRecordingService()
                        }
                    }
                }

                override fun onServiceDisconnected(name: ComponentName) {
                    amplitudeJob?.cancel()
                    amplitudeJob = null
                    service = null
                    isStarting = false
                    if (isRecording) errorMessage = "Enregistrement interrompu. Réessayez."
                    isRecording = false
                    activeFile?.delete()
                    activeFile = null
                    unbindRecordingService()
                }
            }
            connection = serviceConnection
            ContextCompat.startForegroundService(appContext, intent)
            if (!appContext.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)) {
                throw IllegalStateException("service indisponible")
            }
            startupJob = viewModelScope.launch {
                delay(5_000)
                if (isStarting) {
                    isStarting = false
                    errorMessage = "Démarrage du micro impossible. Réessayez."
                    unbindRecordingService()
                    appContext.stopService(intent)
                    activeFile?.delete()
                    activeFile = null
                }
            }
        } catch (error: Exception) {
            startupJob?.cancel()
            startupJob = null
            isStarting = false
            isRecording = false
            unbindRecordingService()
            applicationContext?.stopService(Intent(applicationContext, RecordService::class.java))
            file.delete()
            activeFile = null
            errorMessage = "Enregistrement impossible : ${error.localizedMessage ?: "micro indisponible"}"
        }
    }

    fun stopRecording() {
        val recordService = service ?: return
        amplitudeJob?.cancel()
        amplitudeJob = null
        val file = activeFile
        activeFile = null
        val recorded = recordService.stopRecording()
        isRecording = false
        unbindRecordingService()
        if (recorded && file != null) {
            recordingPath = file.absolutePath
        } else {
            file?.delete()
            recordingPath = null
            errorMessage = "Enregistrement trop court ou interrompu. Réessayez."
        }
    }

    private fun unbindRecordingService() {
        service?.setStateListener(null)
        val appContext = applicationContext
        val boundConnection = connection
        connection = null
        service = null
        if (appContext != null && boundConnection != null) {
            runCatching { appContext.unbindService(boundConnection) }
        }
    }

    fun updateLocation(lat: Double, lng: Double) {
        if (lat.isFinite() && lat in -90.0..90.0 && lng.isFinite() && lng in -180.0..180.0) {
            latitude = lat
            longitude = lng
            errorMessage = null
        } else {
            clearLocation()
        }
    }

    fun clearLocation() {
        latitude = null
        longitude = null
    }

    fun requestLocation(context: Context) {
        if (locationLoading) return
        val fineGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarseGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!fineGranted && !coarseGranted) {
            errorMessage = "Autorisez la position ou saisissez les coordonnées manuellement."
            return
        }
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val provider = when {
            fineGranted && manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            else -> null
        }
        if (provider == null) {
            errorMessage = "Position indisponible. Saisissez les coordonnées manuellement."
            return
        }
        locationLoading = true
        viewModelScope.launch {
            try {
                val location = withTimeoutOrNull(15_000) {
                    suspendCancellableCoroutine { continuation ->
                        val signal = CancellationSignal()
                        continuation.invokeOnCancellation { signal.cancel() }
                        try {
                            LocationManagerCompat.getCurrentLocation(
                                manager, provider, signal, ContextCompat.getMainExecutor(context),
                            ) { result -> if (continuation.isActive) continuation.resume(result) }
                        } catch (error: Exception) {
                            if (continuation.isActive) continuation.resume(null)
                        }
                    }
                }
                if (location != null) updateLocation(location.latitude, location.longitude)
                else errorMessage = "Position introuvable. Saisissez les coordonnées manuellement."
            } catch (error: CancellationException) {
                throw error
            } finally {
                locationLoading = false
            }
        }
    }

    fun saveSound() {
        if (isSaving || isRecording || isStarting) return
        val title = draftTitle.value.trim()
        val path = recordingPath
        val lat = latitude
        val lng = longitude
        if (title.isEmpty() || path == null || lat == null || lng == null) return
        isSaving = true
        errorMessage = null
        viewModelScope.launch {
            try {
                SoundscapeContainer.repository.addSound(
                    title = title,
                    description = draftDescription.value,
                    lat = lat,
                    lng = lng,
                    category = draftCategory.value,
                    audioPath = path,
                )
                savedSuccessfully = true
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                errorMessage = "Sauvegarde impossible : ${error.localizedMessage ?: "réessayez"}"
            } finally {
                isSaving = false
            }
        }
    }

    override fun onCleared() {
        startupJob?.cancel()
        amplitudeJob?.cancel()
        service?.stopRecording()
        unbindRecordingService()
        applicationContext?.let { it.stopService(Intent(it, RecordService::class.java)) }
        activeFile?.delete()
        super.onCleared()
    }
}
