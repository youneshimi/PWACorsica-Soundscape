package corsica.universita.carnet.ui.sounds

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import corsica.universita.carnet.data.SoundscapeContainer
import corsica.universita.carnet.data.local.SoundEntity
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/**
 * Cycle de vie : l'ID du son est dans SavedStateHandle ; la navigation le restaure aussi.
 * Le contenu vient de Room et est relu après une recréation du processus.
 */
class SoundDetailViewModel(savedState: SavedStateHandle) : ViewModel() {
    val soundId: Long = checkNotNull(savedState["soundId"])
    val sound: StateFlow<SoundEntity?> = SoundscapeContainer.repository.sounds
        .map { items -> items.firstOrNull { it.id == soundId } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
}
