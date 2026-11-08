package corsica.universita.carnet.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

fun createNotificationChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannels(
        listOf(
            NotificationChannel("recording", "Enregistrement", NotificationManager.IMPORTANCE_LOW)
                .apply { description = "Enregistrement audio en cours" },
            NotificationChannel("sync", "Synchronisation", NotificationManager.IMPORTANCE_LOW)
                .apply { description = "Envoi des sons au serveur" },
            NotificationChannel("new_sound", "Nouveaux sons", NotificationManager.IMPORTANCE_HIGH)
                .apply { description = "Notification de nouveau son en Corse" },
        ),
    )
}
