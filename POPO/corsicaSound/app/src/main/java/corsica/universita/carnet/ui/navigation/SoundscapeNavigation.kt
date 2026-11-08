package corsica.universita.carnet.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import corsica.universita.carnet.ui.record.RecordScreen
import corsica.universita.carnet.ui.sounds.SoundDetailScreen
import corsica.universita.carnet.ui.sounds.SoundListScreen
import kotlinx.serialization.Serializable

@Serializable data object SoundList : NavKey
@Serializable data class SoundDetail(val id: Long) : NavKey
@Serializable data object Record : NavKey

@Composable
fun SoundscapeNavigation(
    notificationSoundId: Long? = null,
    onNotificationHandled: () -> Unit = {},
    openMainScreen: Boolean = false,
    onAppLinkHandled: () -> Unit = {},
) {
    val backStack = rememberNavBackStack(SoundList)
    val goBack = { if (backStack.size > 1) backStack.removeLastOrNull() }

    LaunchedEffect(openMainScreen, notificationSoundId) {
        if (openMainScreen) {
            backStack.clear()
            backStack.add(SoundList)
            onAppLinkHandled()
            if (notificationSoundId != null) onNotificationHandled()
        } else if (notificationSoundId != null && notificationSoundId > 0) {
            backStack.add(SoundDetail(notificationSoundId))
            onNotificationHandled()
        }
    }

    NavDisplay(
        backStack = backStack,
        onBack = goBack,
        entryDecorators = listOf(
            rememberSaveableStateHolderNavEntryDecorator(),
            rememberViewModelStoreNavEntryDecorator(),
        ),
        entryProvider = entryProvider {
            entry<SoundList> {
                SoundListScreen(
                    onNavigateToDetail = { id -> backStack.add(SoundDetail(id)) },
                    onNavigateToRecord = { backStack.add(Record) },
                )
            }
            entry<SoundDetail> { route ->
                SoundDetailScreen(soundId = route.id, onBack = goBack)
            }
            entry<Record> {
                RecordScreen(onNavigateBack = goBack)
            }
        },
    )
}
