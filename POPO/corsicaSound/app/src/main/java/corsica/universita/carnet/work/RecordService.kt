package corsica.universita.carnet.work

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Binder
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import corsica.universita.carnet.R
import java.io.File

class RecordService : Service() {
    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var stateListener: ((Boolean, String?) -> Unit)? = null
    private var startError: String? = null
    private val binder = RecordBinder()

    inner class RecordBinder : Binder() {
        fun getService(): RecordService = this@RecordService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    fun setStateListener(listener: ((Boolean, String?) -> Unit)?) {
        stateListener = listener
        if (recorder != null || startError != null) listener?.invoke(recorder != null, startError)
    }

    @Suppress("DEPRECATION")
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (recorder != null) return START_NOT_STICKY
        val path = intent?.getStringExtra(EXTRA_OUTPUT_PATH) ?: run {
            stopSelf(startId)
            return START_NOT_STICKY
        }
        val directory = File(filesDir, "recordings").canonicalFile
        val file = File(path).canonicalFile
        if (file.parentFile != directory || !directory.isDirectory) {
            startError = "Chemin d'enregistrement invalide."
            stateListener?.invoke(false, startError)
            stopSelf(startId)
            return START_NOT_STICKY
        }

        try {
            val notification = NotificationCompat.Builder(this, "recording")
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle("Enregistrement en cours")
                .setContentText("Corsica Soundscape capture un son...")
                .setOngoing(true)
                .build()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            val instance = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this) else MediaRecorder()
            try {
                instance.setAudioSource(MediaRecorder.AudioSource.MIC)
                instance.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                instance.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                instance.setAudioEncodingBitRate(128_000)
                instance.setAudioSamplingRate(44_100)
                instance.setOutputFile(file.absolutePath)
                instance.prepare()
                instance.start()
                recorder = instance
                outputFile = file
                startError = null
                stateListener?.invoke(true, null)
            } catch (error: Exception) {
                runCatching { instance.release() }
                throw error
            }
        } catch (error: Exception) {
            file.delete()
            startError = "Enregistrement impossible : ${error.localizedMessage ?: "micro indisponible"}"
            stateListener?.invoke(false, startError)
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf(startId)
        }
        return START_NOT_STICKY
    }

    fun getAmplitude(): Int = try {
        recorder?.maxAmplitude ?: 0
    } catch (_: Exception) {
        0
    }

    fun stopRecording(): Boolean {
        val instance = recorder ?: return false
        recorder = null
        val file = outputFile
        outputFile = null
        val recorded = try {
            instance.stop()
            file?.isFile == true && file.length() > 0
        } catch (_: RuntimeException) {
            false
        } finally {
            instance.release()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
        if (!recorded) file?.delete()
        stateListener?.invoke(false, null)
        return recorded
    }

    override fun onDestroy() {
        val instance = recorder
        recorder = null
        if (instance != null) {
            runCatching { instance.stop() }
            runCatching { instance.release() }
            outputFile?.delete()
        }
        outputFile = null
        stateListener = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_OUTPUT_PATH = "outputPath"
        private const val NOTIFICATION_ID = 1
    }
}
