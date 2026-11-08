package corsica.universita.carnet.data.remote

import corsica.universita.carnet.data.local.SoundEntity
import java.time.OffsetDateTime

/** JSON returned by the Cloudflare Worker. audioUrl is relative to its base URL. */
data class SoundDto(
    val id: String,
    val clientId: String?,
    val title: String,
    val description: String,
    val latitude: Double,
    val longitude: Double,
    val category: String,
    val audioUrl: String,
    val createdAt: String,
    val version: Int,
    val synced: Boolean,
) {
    fun toEntity(): SoundEntity = SoundEntity(
        serverId = id,
        clientId = clientId?.takeIf { it.isNotBlank() } ?: "remote-$id",
        title = title,
        description = description,
        latitude = latitude,
        longitude = longitude,
        category = category,
        audioUrl = "/${audioUrl.trimStart('/')}",
        createdAt = OffsetDateTime.parse(createdAt).toInstant().toEpochMilli(),
        syncState = "SYNCED",
    )
}
