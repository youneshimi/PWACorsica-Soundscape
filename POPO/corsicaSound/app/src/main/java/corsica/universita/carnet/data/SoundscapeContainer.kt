package corsica.universita.carnet.data

import android.content.Context
import androidx.room.Room
import androidx.work.WorkManager
import corsica.universita.carnet.data.local.SoundscapeDatabase
import corsica.universita.carnet.data.remote.ApiClient
import retrofit2.Retrofit

object SoundscapeContainer {
    lateinit var database: SoundscapeDatabase
        private set
    lateinit var retrofit: Retrofit
        private set
    lateinit var workManager: WorkManager
        private set
    lateinit var repository: SoundRepository
        private set

    @Synchronized
    fun init(context: Context) {
        if (::repository.isInitialized) return
        val appContext = context.applicationContext
        database = Room.databaseBuilder(appContext, SoundscapeDatabase::class.java, "soundscape.db").build()
        retrofit = ApiClient.retrofit
        workManager = WorkManager.getInstance(appContext)
        repository = SoundRepository(database, database.soundDao(), ApiClient.syncApi, workManager)
    }
}
