package corsica.universita.carnet.notifications

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import corsica.universita.carnet.BuildConfig
import corsica.universita.carnet.MainActivity
import corsica.universita.carnet.R

class SoundMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        // Web Push and FCM use different tokens; keep this one on the device.
        if (BuildConfig.DEBUG) Log.d("FCM", "Token: $token")
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val title = message.data["title"] ?: message.notification?.title ?: "Nouveau son"
        val body = message.data["body"] ?: message.notification?.body ?: "Un nouveau son a été ajouté en Corse"
        val soundId = message.data["soundId"]?.toLongOrNull()?.takeIf { it > 0 }
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (soundId != null) putExtra("soundId", soundId)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            soundId?.hashCode() ?: 0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, "new_sound")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        getSystemService(NotificationManager::class.java)
            .notify(System.currentTimeMillis().toInt(), notification)
    }
}
