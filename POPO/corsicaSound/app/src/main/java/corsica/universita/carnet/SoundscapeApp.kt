package corsica.universita.carnet

import android.app.Application
import corsica.universita.carnet.data.SoundscapeContainer
import corsica.universita.carnet.notifications.createNotificationChannels

class SoundscapeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        createNotificationChannels(this)
        SoundscapeContainer.init(this)
    }
}
