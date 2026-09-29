package br.com.vendamais.mobile.data.remote

import android.content.Context
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObject.Companion.serializer
import kotlinx.serialization.json.Json

class DraftUxStateCache(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    fun save(cadastroId: String, payload: JsonObject) {
        if (cadastroId.isBlank()) return
        prefs.edit()
            .putString(keyFor(cadastroId), json.encodeToString(serializer(), payload))
            .apply()
    }

    fun load(cadastroId: String): JsonObject? {
        if (cadastroId.isBlank()) return null
        val raw = prefs.getString(keyFor(cadastroId), null) ?: return null
        return runCatching { json.decodeFromString(serializer(), raw) }.getOrNull()
    }

    fun clear(cadastroId: String) {
        if (cadastroId.isBlank()) return
        prefs.edit().remove(keyFor(cadastroId)).apply()
    }

    private fun keyFor(cadastroId: String): String = "draft_ux_state_$cadastroId"

    private companion object {
        private const val PREFS_NAME = "draft_ux_state_cache"
    }
}
