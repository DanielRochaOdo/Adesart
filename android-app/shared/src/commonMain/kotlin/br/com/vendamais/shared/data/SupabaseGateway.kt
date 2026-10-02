package br.com.vendamais.shared.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class SupabaseSession(
    @SerialName("access_token")
    val accessToken: String,
    @SerialName("refresh_token")
    val refreshToken: String,
    @SerialName("expires_in")
    val expiresIn: Long? = null,
    @SerialName("token_type")
    val tokenType: String? = null,
)

class SupabaseGateway(
    baseUrl: String,
    private val anonKey: String,
    private val httpClient: HttpClient = createPlatformHttpClient(),
) {
    private val normalizedBaseUrl = baseUrl.trim().removeSuffix("/")

    suspend fun signIn(email: String, password: String): SupabaseSession {
        val response = httpClient.post(normalizedBaseUrl + "/auth/v1/token") {
            parameter("grant_type", "password")
            header("apikey", anonKey)
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    put("email", email.trim())
                    put("password", password)
                },
            )
        }

        if (!response.status.isSuccess()) {
            error("Falha ao autenticar no Supabase: HTTP " + response.status.value)
        }

        return response.body()
    }

    suspend fun rpc(name: String, body: JsonObject, accessToken: String? = null): JsonElement {
        val response = httpClient.post(normalizedBaseUrl + "/rest/v1/rpc/" + name) {
            header("apikey", anonKey)
            accessToken?.takeIf { it.isNotBlank() }?.let {
                header(HttpHeaders.Authorization, "Bearer " + it)
            }
            contentType(ContentType.Application.Json)
            setBody(body)
        }

        if (!response.status.isSuccess()) {
            error("Falha na RPC " + name + ": HTTP " + response.status.value)
        }

        return response.body()
    }

    suspend fun invokeFunction(name: String, body: JsonElement, accessToken: String? = null): JsonElement {
        val response = httpClient.post(normalizedBaseUrl + "/functions/v1/" + name) {
            header("apikey", anonKey)
            accessToken?.takeIf { it.isNotBlank() }?.let {
                header(HttpHeaders.Authorization, "Bearer " + it)
            }
            contentType(ContentType.Application.Json)
            setBody(body)
        }

        if (!response.status.isSuccess()) {
            error("Falha na Edge Function " + name + ": HTTP " + response.status.value)
        }

        return response.body()
    }

    fun close() {
        httpClient.close()
    }
}
