package corsica.universita.carnet.ui.sounds

import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import corsica.universita.carnet.data.local.SoundEntity
import corsica.universita.carnet.data.remote.ApiClient
import java.io.File
import java.text.DateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SoundDetailScreen(soundId: Long, onBack: () -> Unit) {
    val viewModel: SoundDetailViewModel = viewModel(
        key = "sound-detail-$soundId",
        factory = viewModelFactory {
            initializer {
                val handle = createSavedStateHandle()
                if (!handle.contains("soundId")) handle["soundId"] = soundId
                SoundDetailViewModel(handle)
            }
        },
    )
    val sound by viewModel.sound.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val player = remember(context) {
        ExoPlayer.Builder(context).build().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                true,
            )
        }
    }
    var isPlaying by remember { mutableStateOf(false) }
    var playbackError by remember { mutableStateOf<String?>(null) }
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }

            override fun onPlayerError(error: PlaybackException) {
                playbackError = "Lecture indisponible : ${error.errorCodeName}"
            }
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Détail du son") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour")
                    }
                },
            )
        },
    ) { innerPadding ->
        val current = sound
        if (current == null) {
            Text("Chargement du son…", modifier = Modifier.padding(innerPadding).padding(16.dp))
        } else {
            val source = audioSource(current)
            Column(
                modifier = Modifier.fillMaxSize().padding(innerPadding).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text(current.title, style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
                Text(current.description.ifBlank { "Aucune description" })
                Text("Catégorie : ${current.category}")
                Text("Date : ${DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, Locale.getDefault()).format(Date(current.createdAt))}")
                Text("Position : ${current.latitude}, ${current.longitude}")
                Button(
                    enabled = source != null,
                    onClick = {
                        if (player.isPlaying) {
                            player.pause()
                        } else {
                            if (player.currentMediaItem?.localConfiguration?.uri != source) {
                                player.setMediaItem(MediaItem.fromUri(requireNotNull(source)))
                                player.prepare()
                            }
                            playbackError = null
                            player.play()
                        }
                    },
                ) {
                    Icon(
                        if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = null,
                    )
                    Text(if (isPlaying) "Pause" else "Écouter")
                }
                if (source == null) Text("Fichier audio indisponible")
                playbackError?.let { Text(it) }
            }
        }
    }
}

private fun audioSource(sound: SoundEntity): Uri? {
    sound.audioPath?.let { path ->
        val file = File(path)
        if (file.isFile) return Uri.fromFile(file)
    }
    val relative = sound.audioUrl ?: return null
    if (!relative.startsWith("/uploads/")) return null
    return Uri.parse(ApiClient.BASE_URL.trimEnd('/') + relative)
}
