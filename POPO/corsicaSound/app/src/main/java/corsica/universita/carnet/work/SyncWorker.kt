package corsica.universita.carnet.work

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import corsica.universita.carnet.data.SoundscapeContainer
import java.io.IOException
import retrofit2.HttpException

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        return try {
            SoundscapeContainer.repository.syncPending()
            Result.success()
        } catch (error: IOException) {
            Log.w(TAG, "Synchronization will retry", error)
            Result.retry()
        } catch (error: HttpException) {
            Log.w(TAG, "Server rejected synchronization temporarily", error)
            Result.retry()
        }
    }

    private companion object {
        const val TAG = "SyncWorker"
    }
}
