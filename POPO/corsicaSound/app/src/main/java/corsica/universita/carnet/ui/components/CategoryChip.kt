package corsica.universita.carnet.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

internal val categoryLabels = linkedMapOf(
    "all" to "Tous 🗺️",
    "mer" to "Mer 🌊",
    "nature" to "Nature 🌿",
    "village" to "Village 🏘️",
    "animal" to "Animal 🐦",
    "musique" to "Musique 🎵",
    "marche" to "Marché 🛒",
    "autre" to "Autre 📌",
)

@Composable
fun CategoryFilter(selected: String, onSelect: (String) -> Unit) {
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        categoryLabels.forEach { (category, label) ->
            FilterChip(
                selected = selected == category,
                onClick = { onSelect(category) },
                label = { Text(label) },
            )
        }
    }
}
