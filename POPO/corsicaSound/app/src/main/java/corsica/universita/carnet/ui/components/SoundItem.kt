package corsica.universita.carnet.ui.components

import android.text.format.DateUtils
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import corsica.universita.carnet.data.local.SoundEntity

@Composable
fun SoundItem(sound: SoundEntity, onClick: () -> Unit) {
    val status = when (sound.syncState) {
        "SYNCED" -> "✓"
        "ACTION_REQUIRED" -> "⚠️"
        else -> "⏳"
    }
    val statusDescription = when (sound.syncState) {
        "SYNCED" -> "Synchronisé"
        "ACTION_REQUIRED" -> "Action requise"
        else -> "En attente de synchronisation"
    }
    val relativeDate = DateUtils.getRelativeTimeSpanString(
        sound.createdAt,
        System.currentTimeMillis(),
        DateUtils.MINUTE_IN_MILLIS,
    ).toString()

    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(sound.title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Text(status, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 8.dp))
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AssistChip(
                    onClick = onClick,
                    label = { Text(categoryLabels[sound.category] ?: "Autre 📌") },
                    colors = AssistChipDefaults.assistChipColors(
                        containerColor = MaterialTheme.colorScheme.secondaryContainer,
                        labelColor = MaterialTheme.colorScheme.onSecondaryContainer,
                    ),
                )
                Text(relativeDate, style = MaterialTheme.typography.bodySmall)
            }
            Text(statusDescription, style = MaterialTheme.typography.labelSmall)
        }
    }
}
