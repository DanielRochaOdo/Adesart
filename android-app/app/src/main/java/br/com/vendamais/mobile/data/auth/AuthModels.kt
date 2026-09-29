package br.com.vendamais.mobile.data.auth

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
)

@Serializable
data class TokenUser(
    val id: String? = null,
    val email: String? = null,
)

@Serializable
data class TokenResponse(
    @SerialName("access_token")
    val accessToken: String? = null,
    @SerialName("refresh_token")
    val refreshToken: String? = null,
    val user: TokenUser? = null,
    @SerialName("expires_at")
    val expiresAt: Long? = null,
    @SerialName("expires_in")
    val expiresIn: Long? = null,
    val session: TokenSession? = null,
    val message: String? = null,
    val error: String? = null,
)

@Serializable
data class TokenSession(
    @SerialName("access_token")
    val accessToken: String? = null,
    @SerialName("refresh_token")
    val refreshToken: String? = null,
    val user: TokenUser? = null,
    @SerialName("expires_at")
    val expiresAt: Long? = null,
    @SerialName("expires_in")
    val expiresIn: Long? = null,
)

@Serializable
data class RefreshTokenRequest(
    @SerialName("refresh_token")
    val refreshToken: String,
)

data class SavedSession(
    val userId: String,
    val accessToken: String,
    val refreshToken: String,
    val email: String,
    val expiresAt: Long? = null,
)
