package corsica.universita.carnet.data.preferences

import android.content.Context
import androidx.datastore.preferences.preferencesDataStore
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey

val Context.settingsDataStore by preferencesDataStore(name = "settings")

object SettingsKeys {
    val DARK_THEME = booleanPreferencesKey("dark_theme")
    val LAST_SYNC = longPreferencesKey("last_sync")
    val FCM_TOKEN = stringPreferencesKey("fcm_token")
    val ASKED_RECORD_PERM = booleanPreferencesKey("asked_record_perm")
    val ASKED_LOCATION_PERM = booleanPreferencesKey("asked_location_perm")
}
