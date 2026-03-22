package com.pos2013.offline.data.api

import com.pos2013.offline.config.GatewayConfig
import com.pos2013.offline.data.model.Batch
import com.pos2013.offline.data.model.Protocol2013BatchRequest
import com.pos2013.offline.data.model.Protocol2013BatchResponse
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST

interface PosApi {

    // Legacy endpoint
    @POST("merchant/v1/api/payment2013/batch")
    suspend fun uploadBatch(
        @Header("X-Signature") signature: String,
        @Body batch: List<Batch>
    ): Response<Unit>
    
    // Protocol 201.3 CARD batch
    @POST("merchant/v1/pos/201.3/offline-batch")
    suspend fun uploadProtocol2013Batch(
        @Body request: Protocol2013BatchRequest
    ): Protocol2013BatchResponse
    
    // Protocol 201.3 MYFATOORAH batch
    @POST("merchant/v1/pos/201.3/myfatoorah-batch")
    suspend fun uploadMyFatoorahBatch(
        @Body request: Protocol2013BatchRequest
    ): Protocol2013BatchResponse
    
    @GET("/")
    suspend fun checkHealth(): Response<ResponseBody>
}

object ApiClient {

    private var currentBaseUrl: String = ""
    private var apiInstance: PosApi? = null

    fun create(): PosApi {
        val baseUrl = GatewayConfig.sanitizeUrl(GatewayConfig.SERVER_URL)

        if (apiInstance == null || baseUrl != currentBaseUrl) {
            currentBaseUrl = baseUrl

            apiInstance = Retrofit.Builder()
                .baseUrl(baseUrl)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(PosApi::class.java)
        }

        return apiInstance!!
    }

    fun create(baseUrl: String): PosApi {
        val safeUrl = GatewayConfig.sanitizeUrl(baseUrl)

        return Retrofit.Builder()
            .baseUrl(safeUrl)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(PosApi::class.java)
    }

    fun reset() {
        apiInstance = null
    }
}
