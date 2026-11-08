package corsica.universita.carnet.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface SoundDao {
    @Query("SELECT * FROM sounds ORDER BY createdAt DESC")
    fun all(): Flow<List<SoundEntity>>

    @Query("SELECT * FROM sounds WHERE category = :cat ORDER BY createdAt DESC")
    fun byCategory(cat: String): Flow<List<SoundEntity>>

    @Query("SELECT * FROM sounds WHERE id = :id LIMIT 1")
    suspend fun get(id: Long): SoundEntity?

    @Query("SELECT * FROM sounds WHERE clientId = :clientId LIMIT 1")
    suspend fun getByClientId(clientId: String): SoundEntity?

    @Query("SELECT * FROM sounds WHERE serverId = :serverId LIMIT 1")
    suspend fun getByServerId(serverId: String): SoundEntity?

    @Query("SELECT * FROM sounds WHERE syncState IN ('PENDING', 'UPLOADING') ORDER BY createdAt ASC")
    suspend fun pending(): List<SoundEntity>

    @Upsert
    suspend fun upsert(sound: SoundEntity): Long

    @Insert
    suspend fun insertOutbox(entry: OutboxEntity)

    @Query("DELETE FROM outbox WHERE clientId = :clientId")
    suspend fun deleteOutbox(clientId: String)

    @Query("SELECT * FROM outbox ORDER BY createdAt ASC")
    suspend fun getOutbox(): List<OutboxEntity>

    @Query("UPDATE sounds SET syncState = 'SYNCED', serverId = :serverId, audioUrl = :audioUrl WHERE id = :id")
    suspend fun markSynced(id: Long, serverId: String, audioUrl: String?)

    @Query("UPDATE sounds SET syncState = 'ACTION_REQUIRED' WHERE id = :id")
    suspend fun setActionRequired(id: Long)

    @Query("UPDATE outbox SET lastError = :error WHERE clientId = (SELECT clientId FROM sounds WHERE id = :id)")
    suspend fun setOutboxError(id: Long, error: String)

    @Transaction
    suspend fun markActionRequired(id: Long, error: String) {
        setActionRequired(id)
        setOutboxError(id, error)
    }

    @Transaction
    suspend fun finishSync(id: Long, clientId: String, serverId: String, audioUrl: String?) {
        markSynced(id, serverId, audioUrl)
        deleteOutbox(clientId)
    }

    @Transaction
    suspend fun failPermanently(id: Long, clientId: String, error: String) {
        markActionRequired(id, error)
        deleteOutbox(clientId)
    }

    @Transaction
    suspend fun insertSoundAndOutbox(sound: SoundEntity, outbox: OutboxEntity): Long {
        require(sound.clientId == outbox.clientId) { "Sound and outbox clientId must match" }
        val id = upsert(sound)
        insertOutbox(outbox)
        return id
    }

    @Delete
    suspend fun delete(sound: SoundEntity)
}
