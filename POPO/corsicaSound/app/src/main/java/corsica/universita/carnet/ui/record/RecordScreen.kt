package corsica.universita.carnet.ui.record

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

private val categories = linkedMapOf(
    "mer" to "Mer 🌊", "nature" to "Nature 🌿", "village" to "Village 🏘️",
    "animal" to "Animal 🐦", "musique" to "Musique 🎵", "marche" to "Marché 🛒",
    "autre" to "Autre 📌",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecordScreen(onNavigateBack: () -> Unit, viewModel: RecordViewModel = viewModel()) {
    val context = LocalContext.current
    val micPermission = rememberPermissionFlow(Manifest.permission.RECORD_AUDIO)
    val micState = micPermission.compute()
    var showMicRationale by rememberSaveable { mutableStateOf(true) }

    LaunchedEffect(viewModel.savedSuccessfully) {
        if (viewModel.savedSuccessfully) onNavigateBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Enregistrer un son") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).imePadding()
                .verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            when (micState) {
                PermissionState.NotAsked -> {
                    Text("Le microphone sert à enregistrer les ambiances sonores de la Corse.")
                    Button(onClick = micPermission::launch) { Text("Autoriser le micro") }
                }
                PermissionState.DeniedOnce -> {
                    Text("Le microphone est nécessaire pour enregistrer un son.")
                    Button(onClick = { showMicRationale = true }) { Text("Réessayer") }
                }
                PermissionState.DeniedForever -> {
                    Text("L'accès au micro est désactivé pour cette application.")
                    Button(onClick = micPermission::openSettings) { Text("Ouvrir les réglages") }
                }
                PermissionState.Granted -> RecordForm(viewModel, context)
            }
        }
    }

    if (micState == PermissionState.DeniedOnce && showMicRationale) {
        AlertDialog(
            onDismissRequest = { showMicRationale = false },
            title = { Text("Autorisation du microphone") },
            text = { Text("Le micro est nécessaire pour enregistrer les sons de la Corse.") },
            confirmButton = {
                TextButton(onClick = {
                    showMicRationale = false
                    micPermission.launch()
                }) { Text("Autoriser") }
            },
            dismissButton = {
                TextButton(onClick = { showMicRationale = false }) { Text("Plus tard") }
            },
        )
    }
}

@Composable
private fun RecordForm(viewModel: RecordViewModel, context: Context) {
    val title by viewModel.draftTitle.collectAsStateWithLifecycle()
    val description by viewModel.draftDescription.collectAsStateWithLifecycle()
    val category by viewModel.draftCategory.collectAsStateWithLifecycle()
    val locationPermission = rememberPermissionFlow(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    )
    val locationState = locationPermission.compute()
    val hasLocationPermission = listOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    ).any { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }
    var requestedLocation by rememberSaveable { mutableStateOf(false) }
    var manualLatitude by rememberSaveable { mutableStateOf("") }
    var manualLongitude by rememberSaveable { mutableStateOf("") }
    var askedNotificationPermission by rememberSaveable { mutableStateOf(false) }
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* Recording and saving remain available if notifications are declined. */ }

    LaunchedEffect(viewModel.recordingPath) {
        if (Build.VERSION.SDK_INT >= 33 && viewModel.recordingPath != null &&
            !askedNotificationPermission &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            askedNotificationPermission = true
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    LaunchedEffect(hasLocationPermission, requestedLocation) {
        if (requestedLocation && hasLocationPermission) {
            requestedLocation = false
            viewModel.requestLocation(context)
        }
    }

    OutlinedTextField(
        value = title,
        onValueChange = viewModel::updateTitle,
        label = { Text("Titre *") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = description,
        onValueChange = viewModel::updateDescription,
        label = { Text("Description") },
        minLines = 2,
        modifier = Modifier.fillMaxWidth(),
    )

    Text("Catégorie", style = MaterialTheme.typography.titleMedium)
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        categories.forEach { (value, label) ->
            FilterChip(
                selected = category == value,
                onClick = { viewModel.updateCategory(value) },
                label = { Text(label) },
            )
        }
    }

    Text("Capture audio", style = MaterialTheme.typography.titleMedium)
    Button(
        onClick = {
            if (viewModel.isRecording) viewModel.stopRecording()
            else viewModel.startRecording(context)
        },
        modifier = Modifier.size(96.dp),
        enabled = !viewModel.isStarting,
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = if (viewModel.isRecording) Color(0xFFB3261E)
                else MaterialTheme.colorScheme.primary,
        ),
    ) {
        Icon(
            if (viewModel.isRecording) Icons.Default.Stop else Icons.Default.Mic,
            contentDescription = if (viewModel.isRecording) "Arrêter" else "Enregistrer",
            modifier = Modifier.size(36.dp),
        )
    }
    Text(
        when {
            viewModel.isStarting -> "Démarrage de l'enregistrement…"
            viewModel.isRecording -> "Enregistrement en cours…"
            else -> "Appuyez pour enregistrer"
        },
    )
    if (viewModel.isRecording) {
        val amplitude = (viewModel.amplitudes.lastOrNull() ?: 0) / 32767f
        LinearProgressIndicator(
            progress = { amplitude.coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth(),
        )
    }
    viewModel.recordingPath?.let { path -> AudioPreview(path) }

    Spacer(Modifier.height(4.dp))
    Text("Position du son *", style = MaterialTheme.typography.titleMedium)
    Button(
        enabled = !viewModel.locationLoading,
        onClick = {
            if (hasLocationPermission) {
                requestedLocation = false
                viewModel.requestLocation(context)
            } else {
                requestedLocation = true
                locationPermission.launch()
            }
        },
    ) { Text(if (viewModel.locationLoading) "Localisation…" else "Ma position 📍") }
    if (!hasLocationPermission && locationState == PermissionState.DeniedOnce) {
        Text("La position aide à placer le son. Vous pouvez aussi saisir les coordonnées.")
    }
    if (!hasLocationPermission && locationState == PermissionState.DeniedForever) {
        TextButton(onClick = locationPermission::openSettings) { Text("Autoriser la position dans les réglages") }
    }
    OutlinedTextField(
        value = manualLatitude,
        onValueChange = {
            manualLatitude = it
            requestedLocation = false
            updateManualLocation(viewModel, it, manualLongitude)
        },
        label = { Text("Latitude manuelle") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = manualLongitude,
        onValueChange = {
            manualLongitude = it
            requestedLocation = false
            updateManualLocation(viewModel, manualLatitude, it)
        },
        label = { Text("Longitude manuelle") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = Modifier.fillMaxWidth(),
    )
    if (viewModel.latitude != null && viewModel.longitude != null) {
        Text("Position : ${viewModel.latitude}, ${viewModel.longitude}")
    }

    viewModel.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    Button(
        onClick = viewModel::saveSound,
        enabled = title.isNotBlank() && viewModel.recordingPath != null &&
            viewModel.latitude != null && viewModel.longitude != null &&
            !viewModel.isRecording && !viewModel.isStarting && !viewModel.isSaving,
        modifier = Modifier.fillMaxWidth(),
    ) { Text(if (viewModel.isSaving) "Sauvegarde…" else "Sauvegarder") }
}

private fun updateManualLocation(viewModel: RecordViewModel, latitude: String, longitude: String) {
    val lat = latitude.toDoubleOrNull()
    val lng = longitude.toDoubleOrNull()
    if (lat != null && lng != null) viewModel.updateLocation(lat, lng)
    else viewModel.clearLocation()
}

@Composable
private fun AudioPreview(path: String) {
    var player by remember(path) { mutableStateOf<MediaPlayer?>(null) }
    var playing by remember(path) { mutableStateOf(false) }
    var previewError by remember(path) { mutableStateOf<String?>(null) }
    DisposableEffect(path) {
        onDispose {
            player?.release()
            player = null
        }
    }
    Button(onClick = {
        try {
            val current = player
            if (current?.isPlaying == true) {
                current.pause()
                playing = false
            } else if (current != null) {
                current.start()
                playing = true
            } else {
                val fresh = MediaPlayer()
                player = fresh
                fresh.setDataSource(path)
                fresh.prepare()
                fresh.setOnCompletionListener {
                    it.release()
                    player = null
                    playing = false
                }
                fresh.start()
                playing = true
            }
            previewError = null
        } catch (error: Exception) {
            player?.release()
            player = null
            playing = false
            previewError = "Préécoute indisponible"
        }
    }) {
        Icon(if (playing) Icons.Default.Pause else Icons.Default.PlayArrow, contentDescription = null)
        Text(if (playing) "Pause" else "Préécouter ▶️")
    }
    previewError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
}
