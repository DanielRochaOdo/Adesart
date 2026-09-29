package br.com.vendamais.mobile

import java.net.URI

object AppConfig {
    private const val defaultPublicAppUrl = "https://vendamais.odontoart.com"
    private const val defaultPrivacyPolicyUrl = "https://odontoart.com/privacy-policy/"

    val supabaseUrl: String = BuildConfig.SUPABASE_URL.trim()
    val supabaseAnonKey: String = BuildConfig.SUPABASE_ANON_KEY.trim()
    val publicAppUrl: String = normalizePublicAppUrl(BuildConfig.PUBLIC_APP_URL)
    val privacyPolicyUrl: String = BuildConfig.PRIVACY_POLICY_URL.trim().ifBlank { defaultPrivacyPolicyUrl }
    val directUpdateEnabled: Boolean = BuildConfig.DIRECT_UPDATE_ENABLED
    val updateMetadataUrl: String = if (directUpdateEnabled) normalizeUpdateMetadataUrl(BuildConfig.UPDATE_METADATA_URL) else ""
    val updateApkUrl: String = if (directUpdateEnabled) BuildConfig.UPDATE_APK_URL.trim() else ""

    fun isConfigured(): Boolean = supabaseUrl.isNotBlank() && supabaseAnonKey.isNotBlank()

    private fun normalizePublicAppUrl(raw: String): String {
        val candidate = raw.trim().removeSuffix("/")
        if (candidate.isBlank()) return defaultPublicAppUrl
        val host = runCatching { URI(candidate).host?.trim()?.lowercase() }.getOrNull()
        if (host == "localhost" || host == "127.0.0.1" || host == "::1") {
            return defaultPublicAppUrl
        }
        return candidate
    }

    private fun normalizeUpdateMetadataUrl(raw: String): String {
        val candidate = raw.trim()
        if (candidate.isBlank()) return ""

        val uri = runCatching { URI(candidate) }.getOrNull() ?: return ""
        val scheme = uri.scheme?.lowercase()
        val host = uri.host?.trim()?.lowercase()
        if (scheme != "https" || host.isNullOrBlank() || host in setOf("localhost", "127.0.0.1", "::1")) {
            return ""
        }
        return candidate
    }
}
