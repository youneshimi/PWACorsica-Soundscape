package corsica.universita.carnet.ui.components

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import corsica.universita.carnet.data.local.SoundEntity
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker

private data class MapViewport(val latitude: Double, val longitude: Double, val zoom: Double)

private val viewportSaver = listSaver<MapViewport, Double>(
    save = { listOf(it.latitude, it.longitude, it.zoom) },
    restore = { MapViewport(it[0], it[1], it[2]) },
)

@Composable
fun SoundMap(
    sounds: List<SoundEntity>,
    modifier: Modifier = Modifier,
    onSoundClick: (Long) -> Unit = {},
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentOnSoundClick by rememberUpdatedState(onSoundClick)
    var viewport by rememberSaveable(stateSaver = viewportSaver) {
        mutableStateOf(MapViewport(42.15, 9.1, 9.0))
    }
    val mapView = remember(context) {
        Configuration.getInstance().apply {
            load(context, context.getSharedPreferences("osmdroid", Context.MODE_PRIVATE))
            userAgentValue = context.packageName
        }
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            controller.setZoom(viewport.zoom)
            controller.setCenter(GeoPoint(viewport.latitude, viewport.longitude))
            addMapListener(object : MapListener {
                private fun saveViewport() {
                    val center = mapCenter
                    viewport = MapViewport(center.latitude, center.longitude, zoomLevelDouble)
                }

                override fun onScroll(event: ScrollEvent): Boolean {
                    saveViewport()
                    return false
                }

                override fun onZoom(event: ZoomEvent): Boolean {
                    saveViewport()
                    return false
                }
            })
        }
    }

    DisposableEffect(mapView, lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        if (lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) mapView.onResume()
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onPause()
            mapView.onDetach()
        }
    }

    LaunchedEffect(mapView, sounds) {
        mapView.overlays.removeAll { it is Marker }
        sounds.forEach { sound ->
            mapView.overlays.add(Marker(mapView).apply {
                position = GeoPoint(sound.latitude, sound.longitude)
                title = sound.title
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                setOnMarkerClickListener { _, _ ->
                    currentOnSoundClick(sound.id)
                    true
                }
            })
        }
        mapView.invalidate()
    }

    AndroidView(
        factory = { mapView },
        modifier = modifier,
    )
}
