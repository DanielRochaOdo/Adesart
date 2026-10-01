package br.com.vendamais.mobile.data.update

import android.util.Log
import br.com.vendamais.mobile.AppConfig
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.head
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import java.io.File
import java.net.URI

class AppUpdateRepository(
    private val client: HttpClient,
) {
    private val logTag = "AppUpdateRepository"
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    suspend fun fetchUpdateInfo(metadataUrl: String): AppUpdateInfo? {
        val resolvedMetadataUrl = metadataUrl.trim().ifBlank { AppConfig.updateMetadataUrl }
        if (resolvedMetadataUrl.isBlank()) {
            Log.e(logTag, "URL de metadata de atualizacao ausente.")
            return null
        }

        return runCatching {
            val requestUrl = withCacheBuster(resolvedMetadataUrl)
            val response = client.get(requestUrl)
            check(response.status.isSuccess()) {
                "Servidor de atualizacao respondeu HTTP ${response.status.value}."
            }

            val raw = response.body<String>().trim()
            check(raw.startsWith("{") && raw.endsWith("}")) {
                "Metadata de atualizacao nao contem JSON valido."
            }

            val payload = json.decodeFromString(AppUpdateInfo.serializer(), raw)
            check(payload.versionCode > 0) { "versionCode invalido na metadata de atualizacao." }
            check(payload.versionName.isNotBlank()) { "versionName ausente na metadata de atualizacao." }

            val normalizedApkUrl = normalizeDownloadUrl(
                payload.apkUrl.ifBlank { AppConfig.updateApkUrl },
            )
            check(isValidHttpsUrl(normalizedApkUrl)) {
                "apkUrl ausente ou invalida na metadata de atualizacao."
            }

            payload.copy(apkUrl = normalizedApkUrl)
        }.onFailure { throwable ->
            Log.e(
                logTag,
                "Falha ao consultar metadata de atualizacao em $resolvedMetadataUrl: ${throwable.message}",
                throwable,
            )
        }.getOrNull()
    }

    suspend fun verifyApkUrl(apkUrl: String): Boolean {
        val resolvedUrl = normalizeDownloadUrl(apkUrl.ifBlank { AppConfig.updateApkUrl })
        if (!isValidHttpsUrl(resolvedUrl)) return false

        return runCatching {
            val response = client.head(resolvedUrl)
            response.status.isSuccess()
        }.onFailure { throwable ->
            Log.w(logTag, "Falha ao validar URL do APK: ${throwable.message}")
        }.getOrDefault(false)
    }

    suspend fun downloadApk(apkUrl: String, target: File): File? {
        return runCatching {
            val resolvedUrl = normalizeDownloadUrl(apkUrl.ifBlank { AppConfig.updateApkUrl })
            check(isValidHttpsUrl(resolvedUrl)) { "URL do APK de atualizacao invalida." }

            val response = client.get(withCacheBuster(resolvedUrl))
            check(response.status.isSuccess()) {
                "Download do APK respondeu HTTP ${response.status.value}."
            }

            val bytes = response.body<ByteArray>()
            check(bytes.size >= MIN_APK_SIZE_BYTES) {
                "Arquivo de atualizacao recebido e muito pequeno para ser um APK valido."
            }
            check(bytes.size >= 2 && bytes[0] == ZIP_MAGIC_P && bytes[1] == ZIP_MAGIC_K) {
                "Servidor retornou um arquivo que nao parece ser um APK."
            }

            target.parentFile?.mkdirs()
            target.outputStream().use { it.write(bytes) }
            target
        }.onFailure { throwable ->
            Log.e(logTag, "Falha ao baixar APK de atualizacao: ${throwable.message}", throwable)
            runCatching { if (target.exists()) target.delete() }
        }.getOrNull()
    }

    private fun withCacheBuster(rawUrl: String): String {
        val separator = if (rawUrl.contains('?')) '&' else '?'
        return "$rawUrl${separator}ts=${System.currentTimeMillis()}"
    }

    private fun isValidHttpsUrl(rawUrl: String): Boolean {
        val uri = runCatching { URI(rawUrl.trim()) }.getOrNull() ?: return false
        return uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()
    }

    private fun normalizeDownloadUrl(rawUrl: String): String {
        val url = rawUrl.trim()
        if (!url.contains("drive.google.com", ignoreCase = true)) return url

        val uri = runCatching { URI(url) }.getOrNull() ?: return url
        val path = uri.path.orEmpty()
        val query = uri.query.orEmpty()

        val fileIdFromPath = Regex("""/file/d/([^/]+)""")
            .find(path)
            ?.groupValues
            ?.getOrNull(1)
            ?.takeIf { it.isNotBlank() }

        val fileIdFromQuery = Regex("""(?:^|&)id=([^&]+)""")
            .find(query)
            ?.groupValues
            ?.getOrNull(1)
            ?.takeIf { it.isNotBlank() }

        val fileId = fileIdFromPath ?: fileIdFromQuery ?: return url
        return "https://drive.google.com/uc?export=download&id=$fileId"
    }

    private companion object {
        const val MIN_APK_SIZE_BYTES = 16 * 1024
        val ZIP_MAGIC_P: Byte = 'P'.code.toByte()
        val ZIP_MAGIC_K: Byte = 'K'.code.toByte()
    }
}
