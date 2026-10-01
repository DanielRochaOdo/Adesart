package br.com.vendamais.mobile.data.remote

import br.com.vendamais.mobile.AppConfig
import br.com.vendamais.mobile.BuildConfig
import br.com.vendamais.mobile.data.auth.SavedSession
import br.com.vendamais.mobile.data.models.AdminTeam
import br.com.vendamais.mobile.data.models.AdminUser
import br.com.vendamais.mobile.data.models.ApiLogDetail
import br.com.vendamais.mobile.data.models.ApiLogSearchResponse
import br.com.vendamais.mobile.data.models.AuditLemmitResponse
import br.com.vendamais.mobile.data.models.CadastroExcluidoItem
import br.com.vendamais.mobile.data.models.CadastroConfig
import br.com.vendamais.mobile.data.models.CadastroDetalhe
import br.com.vendamais.mobile.data.models.CadastroResumo
import br.com.vendamais.mobile.data.models.CadastroStats
import br.com.vendamais.mobile.data.models.DashboardCadastro
import br.com.vendamais.mobile.data.models.DashboardLegacyVendedor
import br.com.vendamais.mobile.data.models.ErpUploadQueueItem
import br.com.vendamais.mobile.data.models.RequeueUploadQueueResult
import br.com.vendamais.mobile.data.models.ErpUploadQueueHealth
import br.com.vendamais.mobile.data.models.ErpUploadQueuePage
import br.com.vendamais.mobile.data.models.ErpUploadErrorSearchResponse
import br.com.vendamais.mobile.data.models.ReconcileErpUploadErrorsResult
import br.com.vendamais.mobile.data.models.RepairErpUploadQueueResult
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
import io.ktor.http.content.ByteArrayContent
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

    suspend fun fetchDashboardCadastros(
        session: SavedSession,
        profile: MobileProfile,
        startIso: String,
        endIso: String,
    ): List<DashboardCadastro> {
        return runCatching {
            client.post("${AppConfig.supabaseUrl}/rest/v1/rpc/get_dashboard_cadastros_fast_v1") {
                applyAuthHeaders(session)
                contentType(ContentType.Application.Json)
                setBody(
                    buildJsonObject {
                        put("p_inicio", startIso)
                        put("p_fim", endIso)
                    },
                )
            }.body<List<DashboardCadastro>>()
        }.getOrElse {
            fetchDashboardCadastrosFallback(
                session = session,
                profile = profile,
                startIso = startIso,
                endIso = endIso,
            )
        }
    }

    private suspend fun fetchDashboardCadastrosFallback(
        session: SavedSession,
        profile: MobileProfile,
        startIso: String,
        endIso: String,
    ): List<DashboardCadastro> {
        val allItems = mutableListOf<DashboardCadastro>()
        val pageSize = 1000
        val maxItems = 50_000
        var offset = 0

        while (offset < maxItems) {
            val chunk = getList<DashboardCadastro>(
                path = "cadastros",
                session = session,
                query = {
                    parameter(
                        "select",
                        "id,status,tipo_cadastro,created_by,team_id,vendedor_id,vendedor_codigo,vendedor_nome,adesionista_id,adesionista_codigo,adesionista_nome,empresa_codigo,empresa_nome,plano_codigo,plano_nome,dependentes,fluxo_publico,origem_link_id,created_at",
                    )
                    parameter("created_at", "gte.$startIso")
                    parameter("created_at", "lt.$endIso")
                    parameter("order", "created_at.asc,id.asc")
                    parameter("limit", pageSize)
                    parameter("offset", offset)

                    when (profile.role) {
                        "SUPERVISOR" -> profile.teamId
                            ?.takeIf { it.isNotBlank() }
                            ?.let { parameter("team_id", "eq.$it") }

                        "ADESIONISTA" -> {
                            val codigo = profile.externalId
                                ?.takeIf { it.matches(Regex("^[A-Za-z0-9_-]+$")) }

                            if (codigo != null) {
                                parameter(
                                    "or",
                                    "(adesionista_id.eq.${profile.id},adesionista_codigo.eq.$codigo)",
                                )
                            } else {
                                parameter("adesionista_id", "eq.${profile.id}")
                            }
                        }
                    }
                },
            )

            allItems += chunk
            if (chunk.size < pageSize) break
            offset += pageSize
        }

        if (allItems.size >= maxItems) {
            throw IllegalStateException(
                "O intervalo contém registros demais para o modo alternativo. Reduza o período e tente novamente.",
            )
        }

        if (allItems.isEmpty()) return allItems

        val legacyByCadastro = mutableMapOf<String, DashboardLegacyVendedor>()
        allItems.map { it.id }.chunked(200).forEach { ids ->
            val joinedIds = ids.joinToString(",")
            val rows = runCatching {
                getList<DashboardLegacyVendedor>(
                    path = "cadastro_vendedor_legacy_resolution",
                    session = session,
                    query = {
                        parameter("select", "cadastro_id,vendedor_id,vendedor_codigo,vendedor_nome")
                        parameter("cadastro_id", "in.($joinedIds)")
                    },
                )
            }.getOrDefault(emptyList())

            rows.forEach { row ->
                legacyByCadastro[row.cadastroId] = row
            }
        }

        return allItems.map { cadastro ->
            val legacy = legacyByCadastro[cadastro.id]
            if (legacy == null) {
                cadastro
            } else {
                cadastro.copy(
                    vendedorId = cadastro.vendedorId ?: legacy.vendedorId,
                    vendedorCodigo = cadastro.vendedorCodigo ?: legacy.vendedorCodigo,
                    vendedorNome = cadastro.vendedorNome ?: legacy.vendedorNome,
                )
            }
        }
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
                        "id,status,tipo_cadastro,nome,cpf,empresa_nome,empresa_cnpj,empresa_codigo,status_adesao_id,created_by,team_id,vendedor_id,vendedor_codigo,vendedor_nome,adesionista_id,adesionista_codigo,adesionista_nome,plano_codigo,plano_nome,fluxo_publico,origem_link_id,dependentes,created_at,updated_at"
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
        status: String? = null,
        page: Int = 1,
        pageSize: Int = 20,
    ): ErpUploadQueuePage {
        val safePage = page.coerceAtLeast(1)
        val safePageSize = pageSize.coerceIn(1, 100)
        val offset = (safePage - 1) * safePageSize
        val response = client.get("${AppConfig.supabaseUrl}/rest/v1/erp_upload_queue") {
            applyAuthHeaders(session)
            header("Prefer", "count=exact")
            parameter(
                "select",
                "id,created_at,updated_at,status,attempts,next_attempt_at,last_attempt_at,last_error,last_error_code,last_status_code,claimed_at,finished_at,manual_reprocess_count,worker_source,file_size_bytes,cliente_nome,cliente_cpf,empresa_nome,erp_response,cadastro_id,created_by,id_funcionario,id_dependente,arquivo_path,arquivo_nome,bucket,tipo,cadastros(nome,cpf,empresa_nome)",
            )
            status?.takeIf { it.isNotBlank() && it != "todos" }?.let { parameter("status", "eq.$it") }
            parameter("order", "created_at.desc")
            parameter("limit", safePageSize)
            parameter("offset", offset)
        }
        val items: List<ErpUploadQueueItem> = response.body()
        val total = response.headers["Content-Range"]
            ?.substringAfter("/")
            ?.toIntOrNull()
            ?: items.size
        return ErpUploadQueuePage(items = items, total = total)
    }

    suspend fun fetchUploadQueueHealth(session: SavedSession): ErpUploadQueueHealth {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/rest/v1/rpc/get_erp_upload_queue_health_v1",
            json = json,
            body = buildJsonObject { },
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun processUploadQueue(session: SavedSession): ProcessUploadQueueResponse {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/erp-process-upload-queue",
            json = json,
            body = buildJsonObject {
                put("source", "manual-android")
                put("limit", 20)
            },
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun resetStuckQueue(session: SavedSession, minutes: Int = 10): ResetStuckQueueResult {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/rest/v1/rpc/reset_stuck_queue_items_v2",
            json = json,
            body = buildJsonObject {
                put("stuck_threshold_minutes", minutes)
            },
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun requeueUploadQueue(
        session: SavedSession,
        id: String? = null,
        scope: String = "item",
    ): RequeueUploadQueueResult {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/rest/v1/rpc/requeue_erp_upload_v1",
            json = json,
            body = buildJsonObject {
                if (id.isNullOrBlank()) put("p_id", JsonNull) else put("p_id", id)
                put("p_scope", scope)
            },
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun searchErpUploadErrors(
        session: SavedSession,
        scope: String = "current",
        category: String? = null,
        cpf: String? = null,
        empresa: String? = null,
        dataInicio: String? = null,
        dataFimExclusiva: String? = null,
        page: Int = 1,
        pageSize: Int = 50,
    ): ErpUploadErrorSearchResponse {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/rest/v1/rpc/search_erp_upload_errors_v1",
            json = json,
            body = buildJsonObject {
                put("p_scope", scope)
                if (category.isNullOrBlank()) put("p_category", JsonNull) else put("p_category", category)
                if (cpf.isNullOrBlank()) put("p_cpf", JsonNull) else put("p_cpf", cpf)
                if (empresa.isNullOrBlank()) put("p_empresa", JsonNull) else put("p_empresa", empresa)
                if (dataInicio.isNullOrBlank()) put("p_data_inicio", JsonNull) else put("p_data_inicio", dataInicio)
                if (dataFimExclusiva.isNullOrBlank()) put("p_data_fim_exclusiva", JsonNull) else put("p_data_fim_exclusiva", dataFimExclusiva)
                put("p_page", page.coerceAtLeast(1))
                put("p_page_size", pageSize.coerceIn(1, 100))
            },
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun reconcileErpUploadErrors(
        session: SavedSession,
        id: String? = null,
        scope: String = "current",
    ): ReconcileErpUploadErrorsResult {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/rest/v1/rpc/reconcile_erp_upload_failures_v1",
            json = json,
            body = buildJsonObject {
                if (id.isNullOrBlank()) put("p_id", JsonNull) else put("p_id", id)
                put("p_scope", scope)
            },
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun downloadStorageObject(
        session: SavedSession,
        bucket: String,
        objectPath: String,
    ): ByteArray {
        val safeBucket = java.net.URLEncoder.encode(bucket, Charsets.UTF_8.name()).replace("+", "%20")
        val safePath = objectPath
            .split('/')
            .filter { it.isNotBlank() }
            .joinToString("/") { segment ->
                java.net.URLEncoder.encode(segment, Charsets.UTF_8.name()).replace("+", "%20")
            }
        if (safePath.isBlank()) throw IllegalStateException("Caminho do arquivo nao informado.")

        val response = client.get("${AppConfig.supabaseUrl}/storage/v1/object/$safeBucket/$safePath") {
            applyAuthHeaders(session)
        }
        if (!response.status.isSuccess()) {
            throw IllegalStateException("Arquivo nao disponivel no Storage (HTTP ${response.status.value}).")
        }
        return response.body()
    }

    suspend fun uploadStorageObject(
        session: SavedSession,
        bucket: String,
        objectPath: String,
        bytes: ByteArray,
        mimeType: String,
    ) {
        if (bytes.isEmpty()) throw IllegalStateException("Arquivo vazio.")
        val safeBucket = java.net.URLEncoder.encode(bucket, Charsets.UTF_8.name()).replace("+", "%20")
        val safePath = objectPath
            .split('/')
            .filter { it.isNotBlank() }
            .joinToString("/") { segment ->
                java.net.URLEncoder.encode(segment, Charsets.UTF_8.name()).replace("+", "%20")
            }
        if (safePath.isBlank()) throw IllegalStateException("Caminho do arquivo nao informado.")

        val response = client.post("${AppConfig.supabaseUrl}/storage/v1/object/$safeBucket/$safePath") {
            applyAuthHeaders(session)
            header("x-upsert", "false")
            setBody(ByteArrayContent(bytes, ContentType.parse(mimeType.ifBlank { "application/octet-stream" })))
        }
        if (!response.status.isSuccess()) {
            throw IllegalStateException("Falha ao enviar arquivo de substituicao para o Storage (HTTP ${response.status.value}).")
        }
    }

    suspend fun repairErpUploadQueue(
        session: SavedSession,
        id: String,
        bucket: String,
        arquivoPath: String,
        arquivoNome: String,
        fileSizeBytes: Long,
        targetDependenteId: Int?,
        targetDependenteCpf: String?,
        targetDependenteNome: String?,
    ): RepairErpUploadQueueResult {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/rest/v1/rpc/repair_erp_upload_queue_v1",
            json = json,
            body = buildJsonObject {
                put("p_id", id)
                put("p_bucket", bucket)
                put("p_arquivo_path", arquivoPath)
                put("p_arquivo_nome", arquivoNome)
                put("p_file_size_bytes", fileSizeBytes)
                if (targetDependenteId == null || targetDependenteId <= 0) put("p_target_dependente_id", JsonNull)
                else put("p_target_dependente_id", targetDependenteId)
                if (targetDependenteCpf.isNullOrBlank()) put("p_target_dependente_cpf", JsonNull)
                else put("p_target_dependente_cpf", targetDependenteCpf)
                if (targetDependenteNome.isNullOrBlank()) put("p_target_dependente_nome", JsonNull)
                else put("p_target_dependente_nome", targetDependenteNome)
            },
        ) {
            applyAuthHeaders(session)
        }
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

    suspend fun resetUserPassword(session: SavedSession, id: String, newPassword: String) {
        val requestBody = buildJsonObject {
            put("user_id", id)
            put("new_password", newPassword)
        }
        val response: JsonObject = client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/reset-user-password",
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
                ?: "Falha ao redefinir senha."
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

    suspend fun searchApiLogs(
        session: SavedSession,
        status: String = "all",
        startIso: String? = null,
        endExclusiveIso: String? = null,
        cpf: String? = null,
        usuario: String? = null,
        codigoEmpresa: String? = null,
        endpoint: String? = null,
        page: Int = 1,
        pageSize: Int = 100,
    ): ApiLogSearchResponse {
        return client.post("${AppConfig.supabaseUrl}/rest/v1/rpc/search_api_logs") {
            applyAuthHeaders(session)
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    if (startIso.isNullOrBlank()) put("p_data_inicio", JsonNull) else put("p_data_inicio", startIso)
                    if (endExclusiveIso.isNullOrBlank()) put("p_data_fim_exclusiva", JsonNull) else put("p_data_fim_exclusiva", endExclusiveIso)
                    put("p_status", status)
                    if (cpf.isNullOrBlank()) put("p_cpf", JsonNull) else put("p_cpf", cpf)
                    if (usuario.isNullOrBlank()) put("p_usuario", JsonNull) else put("p_usuario", usuario)
                    if (codigoEmpresa.isNullOrBlank()) put("p_codigo_empresa", JsonNull) else put("p_codigo_empresa", codigoEmpresa)
                    if (endpoint.isNullOrBlank()) put("p_endpoint", JsonNull) else put("p_endpoint", endpoint)
                    put("p_page", page.coerceAtLeast(1))
                    put("p_page_size", pageSize.coerceIn(1, 100))
                },
            )
        }.body()
    }

    suspend fun fetchApiLogDetail(session: SavedSession, id: String): ApiLogDetail? {
        return getList<ApiLogDetail>(
            path = "api_logs",
            session = session,
            query = {
                parameter("id", "eq.$id")
                parameter("select", "request_body,response_body")
                parameter("limit", 1)
            },
        ).firstOrNull()
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

    suspend fun reprocessUploadQueueItem(session: SavedSession, id: String): RequeueUploadQueueResult {
        return requeueUploadQueue(session = session, id = id, scope = "item")
    }

    suspend fun reprocessFailedUploadQueue(session: SavedSession): RequeueUploadQueueResult {
        return requeueUploadQueue(session = session, id = null, scope = "failed")
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
