package corsica.universita.carnet.data.remote

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part

interface SyncApi {
    @GET("api/sounds")
    suspend fun getSounds(): List<SoundDto>

    @Multipart
    @POST("api/sounds")
    suspend fun pushSound(
        @Header("Idempotency-Key") idempotencyKey: String,
        @Part("title") title: RequestBody,
        @Part("description") description: RequestBody,
        @Part("latitude") latitude: RequestBody,
        @Part("longitude") longitude: RequestBody,
        @Part("category") category: RequestBody,
        @Part audio: MultipartBody.Part,
    ): SoundDto
}
