package br.com.vendamais.mobile.data.auth

import br.com.vendamais.mobile.AppConfig
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.request.forms.FormDataContent
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.Parameters
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

class SupabaseAuthService(
    private val client: HttpClient,
    private val json: Json,
) {
    suspend fun login(email: String, password: String): SavedSession {
        check(AppConfig.isConfigured()) {
            "Supabase nao configurado. Atualize android-app/local.properties."
        }

        val response: TokenResponse = try {
            client.post("${AppConfig.supabaseUrl}/auth/v1/token") {
                parameter("grant_type", "password")
                header("apikey", AppConfig.supabaseAnonKey)
                header(HttpHeaders.Authorization, "Bearer ${AppConfig.supabaseAnonKey}")
                contentType(ContentType.Application.Json)
                setBody(LoginRequest(email = email, password = password))
            }.body<TokenResponse>()
        } catch (exception: ClientRequestException) {
            throw exception.toSupabaseException()
        } catch (exception: Throwable) {
            throw IllegalStateException("Falha ao interpretar resposta de autenticacao do Supabase.")
        }

        return response.toSavedSession(
            fallbackEmail = email,
            fallbackUserId = null,
            isRefreshFlow = false,
        )
    }

    suspend fun refreshIfNeeded(session: SavedSession): SavedSession {
        val expiresAt = session.expiresAt ?: return session
        val now = System.currentTimeMillis() / 1000
        return if (expiresAt <= now + 60) refreshSession(session) else session
    }

    private suspend fun refreshSession(session: SavedSession): SavedSession {
        val response: TokenResponse = try {
            client.post("${AppConfig.supabaseUrl}/auth/v1/token") {
                parameter("grant_type", "refresh_token")
                header("apikey", AppConfig.supabaseAnonKey)
                header(HttpHeaders.Authorization, "Bearer ${AppConfig.supabaseAnonKey}")
                setBody(
                    FormDataContent(
                        Parameters.build {
                            append("refresh_token", session.refreshToken)
                        },
                    ),
                )
            }.body<TokenResponse>()
        } catch (exception: ClientRequestException) {
            throw exception.toSupabaseException()
        } catch (exception: Throwable) {
            throw IllegalStateException("Refresh token invalido ou sessao expirada. Faca login novamente.")
        }

        return response.toSavedSession(
            fallbackEmail = session.email,
            fallbackUserId = session.userId,
            isRefreshFlow = true,
        )
    }

    private suspend fun ClientRequestException.toSupabaseException(): IllegalStateException {
        val errorBody = response.body<String>()
        val parsed = runCatching {
            json.decodeFromString(SupabaseError.serializer(), errorBody)
        }.getOrNull()

        return IllegalStateException(parsed?.message ?: parsed?.error ?: "Falha ao autenticar no Supabase")
    }

    private fun TokenResponse.toSavedSession(
        fallbackEmail: String,
        fallbackUserId: String?,
        isRefreshFlow: Boolean,
    ): SavedSession {
        val source = session
        val resolvedAccessToken = accessToken ?: source?.accessToken
        val resolvedRefreshToken = refreshToken ?: source?.refreshToken
        val resolvedUser = user ?: source?.user
        val resolvedUserId = resolvedUser?.id?.trim().takeUnless { it.isNullOrBlank() } ?: fallbackUserId
        val resolvedEmail = resolvedUser?.email?.takeIf { it.isNotBlank() } ?: fallbackEmail
        val resolvedExpiresAt = resolveExpiresAt(
            expiresAt = expiresAt ?: source?.expiresAt,
            expiresIn = expiresIn ?: source?.expiresIn,
        )

        if (resolvedAccessToken.isNullOrBlank() || resolvedRefreshToken.isNullOrBlank() || resolvedUserId.isNullOrBlank()) {
            val backendMessage = message?.takeIf { it.isNotBlank() } ?: error?.takeIf { it.isNotBlank() }
            val fallbackMessage = if (isRefreshFlow) {
                "Refresh token invalido ou sessao expirada. Faca login novamente."
            } else {
                "Falha ao autenticar no Supabase."
            }
            throw IllegalStateException(backendMessage ?: fallbackMessage)
        }

        return SavedSession(
            userId = resolvedUserId,
            accessToken = resolvedAccessToken,
            refreshToken = resolvedRefreshToken,
            email = resolvedEmail,
            expiresAt = resolvedExpiresAt,
        )
    }

    private fun resolveExpiresAt(expiresAt: Long?, expiresIn: Long?): Long? {
        if (expiresAt != null) return expiresAt
        val ttlSeconds = expiresIn ?: return null
        val nowSeconds = System.currentTimeMillis() / 1000
        return nowSeconds + ttlSeconds
    }
}

@Serializable
private data class SupabaseError(
    val message: String? = null,
    val error: String? = null,
)
