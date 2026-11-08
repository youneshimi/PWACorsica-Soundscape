package corsica.universita.carnet.ui.sounds

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import corsica.universita.carnet.data.SoundscapeContainer
import corsica.universita.carnet.data.local.SoundEntity
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Cycle de vie : le filtre est dans SavedStateHandle et revient après rotation ou mort du processus.
 * Les sons viennent de Room, qui persiste indépendamment de l'écran.
 */
class SoundListViewModel(private val savedState: SavedStateHandle) : ViewModel() {
    val sounds: StateFlow<List<SoundEntity>> = SoundscapeContainer.repository.sounds
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val selectedCategory: StateFlow<String> = savedState.getStateFlow("category", "all")

    val filteredSounds: StateFlow<List<SoundEntity>> = combine(sounds, selectedCategory) { items, category ->
        if (category == "all") items else items.filter { it.category == category }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    var isLoading by mutableStateOf(true)
        private set
    var isRefreshing by mutableStateOf(false)
        private set
    var isOffline by mutableStateOf(false)
        private set
    var isServerUnavailable by mutableStateOf(false)
        private set

    init {
        launchRefresh(initial = true)
    }

    fun refresh() = launchRefresh(initial = false)

    private fun launchRefresh(initial: Boolean) {
        if (!initial && (isLoading || isRefreshing)) return
        if (!initial) isRefreshing = true
        viewModelScope.launch {
            try {
                isOffline = !SoundscapeContainer.repository.refreshFromServer()
                isServerUnavailable = false
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                isOffline = false
                isServerUnavailable = true
                Log.e("SoundList", "Refresh failed; Room cache remains available", error)
            } finally {
                if (initial) isLoading = false else isRefreshing = false
            }
        }
    }

    fun selectCategory(cat: String) {
        savedState["category"] = cat
    }
}
