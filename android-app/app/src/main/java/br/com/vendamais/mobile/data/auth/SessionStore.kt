package br.com.vendamais.mobile.data.auth

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException

private val Context.authDataStore by preferencesDataStore(name = "vendamais_auth")

class SessionStore(private val context: Context) {
    private val userIdKey = stringPreferencesKey("user_id")
    private val accessTokenKey = stringPreferencesKey("access_token")
    private val refreshTokenKey = stringPreferencesKey("refresh_token")
    private val emailKey = stringPreferencesKey("email")
    private val expiresAtKey = longPreferencesKey("expires_at")
    private val darkModeKey = booleanPreferencesKey("dark_mode")
    private val rememberConnectedKey = booleanPreferencesKey("remember_connected")

    val sessionFlow: Flow<SavedSession?> =
        context.authDataStore.data
            .catch { throwable ->
                if (throwable is IOException) {
                    emit(emptyPreferences())
                } else {
                    throw throwable
                }
            }
            .map { preferences ->
                val userId = preferences[userIdKey]
                val accessToken = preferences[accessTokenKey]
                val refreshToken = preferences[refreshTokenKey]
                val email = preferences[emailKey]
                val expiresAt = preferences[expiresAtKey]

                if (
                    userId.isNullOrBlank() ||
                    accessToken.isNullOrBlank() ||
                    refreshToken.isNullOrBlank() ||
                    email.isNullOrBlank()
                ) {
                    null
                } else {
                    SavedSession(
                        userId = userId,
                        accessToken = accessToken,
                        refreshToken = refreshToken,
                        email = email,
                        expiresAt = expiresAt,
                    )
                }
            }

    val darkModeFlow: Flow<Boolean> =
        context.authDataStore.data
            .catch { throwable ->
                if (throwable is IOException) {
                    emit(emptyPreferences())
                } else {
                    throw throwable
                }
            }
            .map { preferences -> preferences[darkModeKey] ?: false }

    val rememberConnectedFlow: Flow<Boolean> =
        context.authDataStore.data
            .catch { throwable ->
                if (throwable is IOException) {
                    emit(emptyPreferences())
                } else {
                    throw throwable
                }
            }
            .map { preferences -> preferences[rememberConnectedKey] ?: true }

    suspend fun save(session: SavedSession) {
        context.authDataStore.edit { preferences ->
            preferences[userIdKey] = session.userId
            preferences[accessTokenKey] = session.accessToken
            preferences[refreshTokenKey] = session.refreshToken
            preferences[emailKey] = session.email
            session.expiresAt?.let { preferences[expiresAtKey] = it } ?: preferences.remove(expiresAtKey)
        }
    }

    suspend fun clear() {
        context.authDataStore.edit { preferences ->
            val darkMode = preferences[darkModeKey] ?: false
            val rememberConnected = preferences[rememberConnectedKey] ?: true
            preferences.clear()
            preferences[darkModeKey] = darkMode
            preferences[rememberConnectedKey] = rememberConnected
        }
    }

    suspend fun clearSavedSession() {
        context.authDataStore.edit { preferences ->
            preferences.remove(userIdKey)
            preferences.remove(accessTokenKey)
            preferences.remove(refreshTokenKey)
            preferences.remove(emailKey)
            preferences.remove(expiresAtKey)
        }
    }

    suspend fun setDarkMode(enabled: Boolean) {
        context.authDataStore.edit { preferences ->
            preferences[darkModeKey] = enabled
        }
    }

    suspend fun setRememberConnected(enabled: Boolean) {
        context.authDataStore.edit { preferences ->
            preferences[rememberConnectedKey] = enabled
        }
    }
}
