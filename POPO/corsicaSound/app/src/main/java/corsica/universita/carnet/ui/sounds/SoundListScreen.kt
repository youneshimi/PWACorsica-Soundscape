package corsica.universita.carnet.ui.sounds

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import corsica.universita.carnet.ui.components.CategoryFilter
import corsica.universita.carnet.ui.components.SoundItem
import corsica.universita.carnet.ui.components.SoundMap

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SoundListScreen(
    onNavigateToDetail: (Long) -> Unit,
    onNavigateToRecord: () -> Unit,
    viewModel: SoundListViewModel = viewModel(),
) {
    val sounds by viewModel.filteredSounds.collectAsStateWithLifecycle()
    val selectedCategory by viewModel.selectedCategory.collectAsStateWithLifecycle()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Corsica Soundscape") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = onNavigateToRecord) {
                Icon(Icons.Default.Mic, contentDescription = "Enregistrer un son")
            }
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            SoundMap(sounds = sounds, modifier = Modifier.fillMaxWidth().height(200.dp), onSoundClick = onNavigateToDetail)
            CategoryFilter(selected = selectedCategory, onSelect = viewModel::selectCategory)
            if (viewModel.isOffline || viewModel.isServerUnavailable) {
                Surface(color = MaterialTheme.colorScheme.errorContainer) {
                    Text(
                        if (viewModel.isOffline) "Mode hors-ligne — données locales"
                        else "Serveur indisponible — données locales",
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }
            PullToRefreshBox(
                isRefreshing = viewModel.isRefreshing,
                onRefresh = viewModel::refresh,
                modifier = Modifier.weight(1f).fillMaxWidth(),
            ) {
                if (viewModel.isLoading && sounds.isEmpty()) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (sounds.isEmpty()) {
                            item { Text("Aucun son à afficher. Glissez vers le bas pour réessayer.") }
                        }
                        items(sounds, key = { it.id }) { sound ->
                            SoundItem(sound = sound, onClick = { onNavigateToDetail(sound.id) })
                        }
                    }
                }
            }
        }
    }
}
