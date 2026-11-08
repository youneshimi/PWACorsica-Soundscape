package corsica.universita.carnet.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [SoundEntity::class, OutboxEntity::class], version = 1, exportSchema = true)
abstract class SoundscapeDatabase : RoomDatabase() {
    abstract fun soundDao(): SoundDao
}
