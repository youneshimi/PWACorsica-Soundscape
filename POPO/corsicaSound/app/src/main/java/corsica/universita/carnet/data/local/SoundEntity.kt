package corsica.universita.carnet.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "sounds", indices = [Index(value = ["clientId"], unique = true), Index(value = ["serverId"], unique = true)])
data class SoundEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val serverId: String? = null,
    val clientId: String,
    val title: String,
    val description: String = "",
    val latitude: Double,
    val longitude: Double,
    val category: String = "autre",
    val audioPath: String? = null,
    val audioUrl: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val syncState: String = "PENDING",
)
