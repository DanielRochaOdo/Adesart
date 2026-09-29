package br.com.vendamais.mobile.data.remote

import br.com.vendamais.mobile.AppConfig
import br.com.vendamais.mobile.BuildConfig
import br.com.vendamais.mobile.data.auth.SavedSession
import br.com.vendamais.mobile.data.models.AdminTeam
import br.com.vendamais.mobile.data.models.AdminUser
import br.com.vendamais.mobile.data.models.AuditLemmitResponse
import br.com.vendamais.mobile.data.models.CadastroExcluidoItem
import br.com.vendamais.mobile.data.models.CadastroConfig
import br.com.vendamais.mobile.data.models.CadastroDetalhe
import br.com.vendamais.mobile.data.models.CadastroResumo
import br.com.vendamais.mobile.data.models.CadastroStats
import br.com.vendamais.mobile.data.models.ErpUploadQueueItem
import br.com.vendamais.mobile.data.models.MobileProfile
import br.com.vendamais.mobile.data.models.MobileTeam
import br.com.vendamais.mobile.data.models.ProcessUploadQueueResponse
import br.com.vendamais.mobile.data.models.ResetStuckQueueResult
import br.com.vendamais.mobile.data.models.SystemOverview
import br.com.vendamais.mobile.data.models.VendedorStats
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.get
import io.ktor.client.request.delete
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class SupabaseRepository(
    private val client: HttpClient,
    private val json: Json,
) {
    suspend fun fetchProfile(session: SavedSession): MobileProfile {
        return getList<MobileProfile>(
            path = "profiles",
            session = session,
            query = {
                parameter("id", "eq.${session.userId}")
                parameter("select", "id,name,email,telefone,role,external_id,team_id,is_active,created_at,lemmit_limite_consultas")
            },
        ).firstOrNull() ?: throw IllegalStateException("Perfil nao encontrado para o usuario autenticado.")
    }

    suspend fun fetchTeam(session: SavedSession, teamId: String): MobileTeam? {
        return getList<MobileTeam>(
            path = "teams",
            session = session,
            query = {
                parameter("id", "eq.$teamId")
                parameter("select", "id,name,is_active")
            },
        ).firstOrNull()
    }

    suspend fun fetchSystemOverview(session: SavedSession): SystemOverview {
        val totalUsers = fetchCount(
            path = "profiles",
            session = session,
            filters = mapOf("select" to "id"),
        )
        val activeUsers = fetchCount(
            path = "profiles",
            session = session,
            filters = mapOf(
                "select" to "id",
                "is_active" to "eq.true",
            ),
        )
        val totalTeams = fetchCount(
            path = "teams",
            session = session,
            filters = mapOf("select" to "id"),
        )

        return SystemOverview(
            totalUsers = totalUsers,
            totalTeams = totalTeams,
            activeUsers = activeUsers,
        )
    }

    suspend fun fetchCadastroStats(session: SavedSession): CadastroStats {
        return client.post("${AppConfig.supabaseUrl}/rest/v1/rpc/get_cadastros_stats") {
            applyAuthHeaders(session)
            contentType(ContentType.Application.Json)
            setBody(mapOf("p_user_id" to session.userId))
        }.body()
    }

    suspend fun fetchCadastroStatsFromCache(session: SavedSession): CadastroStats {
        return client.post("${AppConfig.supabaseUrl}/rest/v1/rpc/get_stats_from_cache") {
            applyAuthHeaders(session)
            contentType(ContentType.Application.Json)
            setBody(mapOf("p_user_id" to session.userId))
        }.body()
    }

    suspend fun registerCurrentAppVersion(session: SavedSession) {
        val response = client.post("${AppConfig.supabaseUrl}/rest/v1/rpc/record_profile_app_seen") {
            applyAuthHeaders(session)
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    put("p_version_name", BuildConfig.VERSION_NAME)
                    put("p_version_code", BuildConfig.VERSION_CODE)
                    put("p_platform", "android")
                },
            )
        }
        if (!response.status.isSuccess()) throw IllegalStateException("Falha ao registrar versao do app.")
    }

    suspend fun fetchCadastros(session: SavedSession): List<CadastroResumo> {
        val allCadastros = mutableListOf<CadastroResumo>()
        var offset = 0
        val pageSize = 1000

        while (true) {
            val chunk = getList<CadastroResumo>(
                path = "cadastros",
                session = session,
                query = {
                    parameter(
                        "select",
                        "id,status,tipo_cadastro,nome,cpf,empresa_nome,empresa_cnpj,empresa_codigo,status_adesao_id,vendedor_id,vendedor_nome,adesionista_nome,dependentes,created_at,updated_at"
                    )
                    parameter("order", "updated_at.desc")
                    parameter("limit", pageSize)
                    parameter("offset", offset)
                },
            )

            allCadastros += chunk
            if (chunk.size < pageSize) break
            offset += pageSize
        }

        return allCadastros
    }

    suspend fun fetchCadastroDetalhe(session: SavedSession, id: String): CadastroDetalhe {
        return getList<CadastroDetalhe>(
            path = "cadastros",
            session = session,
            query = {
                parameter("id", "eq.$id")
                parameter(
                    "select",
                    "id,status,tipo_cadastro,nome,cpf,data_nascimento,nome_mae,empresa_nome,empresa_cnpj,numero_matricula,vendedor_nome,adesionista_nome,motivo_bloqueio,dependentes,erp_response,created_at,updated_at"
                )
                parameter("limit", 1)
            },
        ).firstOrNull() ?: throw IllegalStateException("Cadastro nao encontrado.")
    }

    suspend fun fetchStatsByVendedor(
        session: SavedSession,
        tipoCadastro: String,
    ): List<VendedorStats> {
        try {
            return client.post("${AppConfig.supabaseUrl}/rest/v1/rpc/get_stats_by_vendedor") {
                applyAuthHeaders(session)
                contentType(ContentType.Application.Json)
                setBody(
                    mapOf(
                        "p_user_id" to session.userId,
                        "p_tipo_cadastro" to tipoCadastro,
                    ),
                )
            }.body()
        } catch (exception: ClientRequestException) {
            throw exception.toSupabaseException(json)
        }
    }

    suspend fun fetchUsers(session: SavedSession): List<AdminUser> {
        return getList(
            path = "profiles",
            session = session,
            query = {
                parameter("select", "id,name,email,telefone,role,external_id,team_id,is_active,lemmit_limite_consultas,created_at")
                parameter("order", "created_at.desc")
            },
        )
    }

    suspend fun fetchTeamsAdmin(session: SavedSession): List<AdminTeam> {
        return getList(
            path = "teams",
            session = session,
            query = {
                parameter("select", "id,name,is_active,created_at")
                parameter("order", "name.asc")
            },
        )
    }

    suspend fun fetchAuditLemmit(
        session: SavedSession,
        startIso: String,
        endIso: String,
        limit: Int = 100,
        offset: Int = 0,
    ): AuditLemmitResponse {
        return client.post("${AppConfig.supabaseUrl}/rest/v1/rpc/audit_lemmit") {
            applyAuthHeaders(session)
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    put("p_start", startIso)
                    put("p_end", endIso)
                    put("p_limit", limit)
                    put("p_offset", offset)
                },
            )
        }.body()
    }

    suspend fun fetchErpUploadQueue(
        session: SavedSession,
        statuses: List<String> = emptyList(),
        limit: Int = 500,
    ): List<ErpUploadQueueItem> {
        return getList(
            path = "erp_upload_queue",
            session = session,
            query = {
                parameter(
                    "select",
                    "id,created_at,updated_at,status,attempts,next_attempt_at,last_attempt_at,last_error,last_status_code,erp_response,cadastro_id,created_by,id_funcionario,id_dependente,arquivo_path,arquivo_nome,bucket,tipo",
                )
                if (statuses.isNotEmpty()) {
                    val payload = statuses.joinToString(",") { it.trim() }
                    parameter("status", "in.($payload)")
                }
                parameter("order", "created_at.desc")
                parameter("limit", limit)
            },
        )
    }

    suspend fun processUploadQueue(session: SavedSession): ProcessUploadQueueResponse {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/erp-process-upload-queue",
            json = json,
            body = buildJsonObject { },
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun resetStuckQueue(session: SavedSession, minutes: Int = 15): ResetStuckQueueResult {
        val response: List<ResetStuckQueueResult> = client.safePost(
            url = "${AppConfig.supabaseUrl}/rest/v1/rpc/reset_stuck_queue_items",
            json = json,
            body = buildJsonObject {
                put("stuck_threshold_minutes", minutes)
            },
        ) {
            applyAuthHeaders(session)
        }
        return response.firstOrNull() ?: ResetStuckQueueResult()
    }

    suspend fun fetchCadastrosExcluidos(session: SavedSession, limit: Int = 100): List<CadastroExcluidoItem> {
        return getList(
            path = "cadastros_excluidos",
            session = session,
            query = {
                parameter(
                    "select",
                    "id,cadastro_id,dados_cadastro,motivo_exclusao,excluido_por,excluido_por_nome,excluido_por_role,excluido_em,team_id",
                )
                parameter("order", "excluido_em.desc")
                parameter("limit", limit)
            },
        )
    }

    suspend fun createUser(session: SavedSession, payload: JsonObject) {
        val response: JsonObject = client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/create-user",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
        }

        val success = response["success"]
            ?.let { it as? JsonPrimitive }
            ?.content
            ?.toBooleanStrictOrNull()
            ?: false

        if (!success) {
            val message = response["error"]
                ?.let { it as? JsonPrimitive }
                ?.content
                ?.takeIf { it.isNotBlank() }
                ?: "Falha ao criar usuario."
            throw IllegalStateException(message)
        }
    }

    suspend fun updateUser(session: SavedSession, id: String, payload: JsonObject): AdminUser {
        val requestBody = buildJsonObject {
            put("user_id", id)
            payload.forEach { (key, value) -> put(key, value) }
        }
        val response: JsonObject = client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/update-user",
            json = json,
            body = requestBody,
        ) {
            applyAuthHeaders(session)
        }
        val success = response["success"]
            ?.let { it as? JsonPrimitive }
            ?.content
            ?.toBooleanStrictOrNull()
            ?: false
        if (!success) {
            val message = response["error"]
                ?.let { it as? JsonPrimitive }
                ?.content
                ?.takeIf { it.isNotBlank() }
                ?: "Falha ao atualizar usuario."
            throw IllegalStateException(message)
        }
        val user = response["user"] ?: throw IllegalStateException("Usuario atualizado sem retorno do backend.")
        return json.decodeFromString(AdminUser.serializer(), user.toString())
    }

    suspend fun updateOwnProfile(
        session: SavedSession,
        userId: String,
        name: String,
        telefone: String?,
        externalId: String?,
    ): MobileProfile {
        val payload = buildJsonObject {
            put("name", name.trim())
            if (telefone.isNullOrBlank()) put("telefone", JsonNull) else put("telefone", telefone)
            externalId?.trim()?.takeIf { it.isNotBlank() }?.let { put("external_id", it) }
        }
        return client.safePatch<List<MobileProfile>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/profiles?id=eq.$userId",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
        }.firstOrNull() ?: throw IllegalStateException("Falha ao atualizar perfil.")
    }

    suspend fun updateProfileTeamAssignment(
        session: SavedSession,
        userId: String,
        teamId: String?,
    ): AdminUser {
        val payload = buildJsonObject {
            teamId?.takeIf { it.isNotBlank() }?.let { put("team_id", it) } ?: put("team_id", JsonNull)
        }
        return client.safePatch<List<AdminUser>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/profiles?id=eq.$userId",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
        }.firstOrNull() ?: throw IllegalStateException("Falha ao atualizar equipe do usuario.")
    }

    suspend fun createTeam(session: SavedSession, name: String): AdminTeam {
        val payload = buildJsonObject { put("name", name) }
        return client.safePost<List<AdminTeam>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/teams",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
        }.firstOrNull() ?: throw IllegalStateException("Falha ao criar equipe.")
    }

    suspend fun updateTeam(session: SavedSession, id: String, payload: JsonObject): AdminTeam {
        return client.safePatch<List<AdminTeam>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/teams?id=eq.$id",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
        }.firstOrNull() ?: throw IllegalStateException("Falha ao atualizar equipe.")
    }

    suspend fun updateCadastroConfig(session: SavedSession, payload: JsonObject): CadastroConfig {
        return client.safePatch<List<CadastroConfig>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/cadastro_config?id=eq.1",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
            contentType(ContentType.Application.Json)
        }.firstOrNull() ?: throw IllegalStateException("Falha ao atualizar configuracoes.")
    }

    suspend fun createPlanoMap(session: SavedSession, payload: JsonObject): br.com.vendamais.mobile.data.models.PlanoMap {
        return client.safePost<List<br.com.vendamais.mobile.data.models.PlanoMap>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/cadastro_planos_map",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
        }.firstOrNull() ?: throw IllegalStateException("Falha ao criar plano.")
    }

    suspend fun updatePlanoMap(session: SavedSession, id: String, payload: JsonObject): br.com.vendamais.mobile.data.models.PlanoMap {
        return client.safePatch<List<br.com.vendamais.mobile.data.models.PlanoMap>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/cadastro_planos_map?id=eq.$id",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
        }.firstOrNull() ?: throw IllegalStateException("Falha ao atualizar plano.")
    }

    suspend fun deletePlanoMap(session: SavedSession, id: String) {
        client.delete("${AppConfig.supabaseUrl}/rest/v1/cadastro_planos_map?id=eq.$id") {
            applyAuthHeaders(session)
        }
    }

    suspend fun createParentescoMap(session: SavedSession, payload: JsonObject): br.com.vendamais.mobile.data.models.ParentescoMap {
        return client.safePost<List<br.com.vendamais.mobile.data.models.ParentescoMap>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/cadastro_parentesco_map",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
        }.firstOrNull() ?: throw IllegalStateException("Falha ao criar parentesco.")
    }

    suspend fun updateParentescoMap(session: SavedSession, id: String, payload: JsonObject): br.com.vendamais.mobile.data.models.ParentescoMap {
        return client.safePatch<List<br.com.vendamais.mobile.data.models.ParentescoMap>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/cadastro_parentesco_map?id=eq.$id",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
        }.firstOrNull() ?: throw IllegalStateException("Falha ao atualizar parentesco.")
    }

    suspend fun deleteParentescoMap(session: SavedSession, id: String) {
        client.delete("${AppConfig.supabaseUrl}/rest/v1/cadastro_parentesco_map?id=eq.$id") {
            applyAuthHeaders(session)
        }
    }

    suspend fun createStatusAdesao(session: SavedSession, payload: JsonObject): br.com.vendamais.mobile.data.models.StatusAdesao {
        return client.safePost<List<br.com.vendamais.mobile.data.models.StatusAdesao>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/status_adesoes",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
        }.firstOrNull() ?: throw IllegalStateException("Falha ao criar status.")
    }

    suspend fun updateStatusAdesao(session: SavedSession, id: String, payload: JsonObject): br.com.vendamais.mobile.data.models.StatusAdesao {
        return client.safePatch<List<br.com.vendamais.mobile.data.models.StatusAdesao>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/status_adesoes?id=eq.$id",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
        }.firstOrNull() ?: throw IllegalStateException("Falha ao atualizar status.")
    }

    suspend fun deleteStatusAdesao(session: SavedSession, id: String) {
        client.delete("${AppConfig.supabaseUrl}/rest/v1/status_adesoes?id=eq.$id") {
            applyAuthHeaders(session)
        }
    }

    suspend fun fetchApiLogs(
        session: SavedSession,
        success: Boolean? = null,
        startIso: String? = null,
        endIso: String? = null,
        limit: Int = 100,
        offset: Int = 0,
    ): List<br.com.vendamais.mobile.data.models.ApiLogItem> {
        return getList(
            path = "api_logs",
            session = session,
            query = {
                parameter("select", "id,user_email,endpoint,method,status_code,success,error_message,duration_ms,cost,created_at,request_body,response_body")
                success?.let { parameter("success", "eq.$it") }
                startIso?.takeIf { it.isNotBlank() }?.let { parameter("created_at", "gte.$it") }
                endIso?.takeIf { it.isNotBlank() }?.let { parameter("created_at", "lte.$it") }
                parameter("order", "created_at.desc")
                parameter("limit", limit)
                parameter("offset", offset)
            },
        )
    }

    suspend fun createStorageSignedUrl(
        session: SavedSession,
        bucket: String,
        objectPath: String,
        expiresIn: Int = 60,
    ): String {
        val safeBucket = java.net.URLEncoder.encode(bucket, Charsets.UTF_8.name()).replace("+", "%20")
        val safePath = objectPath
            .split('/')
            .filter { it.isNotBlank() }
            .joinToString("/") { segment ->
                java.net.URLEncoder.encode(segment, Charsets.UTF_8.name()).replace("+", "%20")
            }
        if (safePath.isBlank()) throw IllegalStateException("Caminho do arquivo nao informado.")
        val response: JsonObject = client.safePost(
            url = "${AppConfig.supabaseUrl}/storage/v1/object/sign/$safeBucket/$safePath",
            json = json,
            body = buildJsonObject { put("expiresIn", expiresIn.coerceIn(30, 3600)) },
        ) {
            applyAuthHeaders(session)
        }
        val raw = listOf("signedURL", "signedUrl", "signed_url")
            .firstNotNullOfOrNull { key ->
                (response[key] as? JsonPrimitive)?.content?.takeIf { it.isNotBlank() }
            }
            ?: throw IllegalStateException("Nao foi possivel gerar link temporario do arquivo.")
        val base = AppConfig.supabaseUrl.trimEnd('/')
        return when {
            raw.startsWith("http://") || raw.startsWith("https://") -> raw
            raw.startsWith("/storage/v1/") -> "$base$raw"
            raw.startsWith("/") -> "$base/storage/v1$raw"
            else -> "$base/storage/v1/$raw"
        }
    }

    suspend fun reprocessUploadQueueItem(session: SavedSession, id: String): ErpUploadQueueItem {
        val payload = buildJsonObject {
            put("status", "queued")
            put("attempts", 0)
            put("next_attempt_at", java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).toString())
            put("last_error", JsonNull)
        }
        return client.safePatch<List<ErpUploadQueueItem>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/erp_upload_queue?id=eq.$id",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
        }.firstOrNull() ?: throw IllegalStateException("Falha ao reprocessar item da fila.")
    }

    private suspend inline fun <reified T> getList(
        path: String,
        session: SavedSession,
        noinline query: HttpRequestBuilder.() -> Unit,
    ): List<T> {
        return client.safeGet(
            url = "${AppConfig.supabaseUrl}/rest/v1/$path",
            json = json,
        ) {
            applyAuthHeaders(session)
            query()
        }
    }

    private suspend fun fetchCount(
        path: String,
        session: SavedSession,
        filters: Map<String, String>,
    ): Int {
        try {
            val response = client.get("${AppConfig.supabaseUrl}/rest/v1/$path") {
                applyAuthHeaders(session)
                header("Prefer", "count=exact")
                method = HttpMethod.Head
                filters.forEach { (key, value) ->
                    parameter(key, value)
                }
            }

            return response.headers["Content-Range"]
                ?.substringAfter("/")
                ?.toIntOrNull()
                ?: 0
        } catch (_: Exception) {
            return 0
        }
    }

    private fun io.ktor.client.request.HttpRequestBuilder.applyAuthHeaders(session: SavedSession) {
        header("apikey", AppConfig.supabaseAnonKey)
        header(HttpHeaders.Authorization, "Bearer ${session.accessToken}")
        header(HttpHeaders.Accept, "application/json")
    }
}

private suspend fun ClientRequestException.toSupabaseException(json: Json): IllegalStateException {
    val body = response.body<String>()
    val parsed = runCatching {
        json.decodeFromString(SupabaseRepositoryError.serializer(), body)
    }.getOrNull()

    return IllegalStateException(
        parsed?.message ?: parsed?.error ?: "Falha ao consultar o backend.",
    )
}

@kotlinx.serialization.Serializable
private data class SupabaseRepositoryError(
    val message: String? = null,
    val error: String? = null,
)
