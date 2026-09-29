package br.com.vendamais.mobile.data.remote

import android.util.Log
import br.com.vendamais.mobile.AppConfig
import br.com.vendamais.mobile.data.auth.SavedSession
import br.com.vendamais.mobile.data.models.CadastroBaseData
import br.com.vendamais.mobile.data.models.CadastroConfig
import br.com.vendamais.mobile.data.models.CadastroContato
import br.com.vendamais.mobile.data.models.CadastroDetalhe
import br.com.vendamais.mobile.data.models.CadastroEndereco
import br.com.vendamais.mobile.data.models.CadastroLinkAssociadoResumo
import br.com.vendamais.mobile.data.models.CadastroLinkHistoryResponse
import br.com.vendamais.mobile.data.models.CadastroLinkItem
import br.com.vendamais.mobile.data.models.CadastroLinkMetrics
import br.com.vendamais.mobile.data.models.PublicCadastroAuthenticateResponse
import br.com.vendamais.mobile.data.models.PublicCadastroCepResponse
import br.com.vendamais.mobile.data.models.PublicCadastroCheckCpfResponse
import br.com.vendamais.mobile.data.models.PublicCadastroContractPayload
import br.com.vendamais.mobile.data.models.PublicCadastroContractPrepareResponse
import br.com.vendamais.mobile.data.models.PublicCadastroDependentLookupResponse
import br.com.vendamais.mobile.data.models.PublicCadastroLinkResolveResponse
import br.com.vendamais.mobile.data.models.PublicCadastroPayload
import br.com.vendamais.mobile.data.models.PublicCadastroSubmitResponse
import br.com.vendamais.mobile.data.models.ParentescoMap
import br.com.vendamais.mobile.data.models.PlanoMap
import br.com.vendamais.mobile.data.models.CheckCpfExistenteResponse
import br.com.vendamais.mobile.data.models.CpfConsultInput
import br.com.vendamais.mobile.data.models.CpfConsultResult
import br.com.vendamais.mobile.data.models.EmpresaResumo
import br.com.vendamais.mobile.data.models.EmpresaSearchResponse
import br.com.vendamais.mobile.data.models.EmpresaSearchType
import br.com.vendamais.mobile.data.models.ErpAssociadoItem
import br.com.vendamais.mobile.data.models.ErpAssociadoResponse
import br.com.vendamais.mobile.data.models.LemmitLimitInfo
import br.com.vendamais.mobile.data.models.LemmitResponse
import br.com.vendamais.mobile.data.models.MobileProfile
import br.com.vendamais.mobile.data.models.StatusAdesao
import br.com.vendamais.mobile.data.models.TeamMemberOption
import br.com.vendamais.mobile.domain.cadastro.CadastroApiErrorMapper
import br.com.vendamais.mobile.domain.cadastro.isPendingCadastroStatus
import br.com.vendamais.mobile.domain.cadastro.pendingCadastroStatusQueryValue
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.put
import java.util.Locale
import java.security.MessageDigest

class CadastroWorkflowRepository(
    private val client: HttpClient,
    private val json: Json,
) {
    private val logTag = "CadastroWorkflowRepository"

    private fun isDuplicateDraftConstraintError(throwable: Throwable): Boolean {
        val raw = throwable.message.orEmpty()
        val normalized = raw.lowercase(Locale.ROOT)
        val isGenericUniqueViolation =
            normalized.contains("duplicate key") ||
                normalized.contains("unique constraint") ||
                normalized.contains("23505")

        return CadastroApiErrorMapper.isPendingCadastroConstraintViolation(raw) || isGenericUniqueViolation
    }

    private fun normalizeCpfDigits(value: String?): String? {
        val digits = value?.filter(Char::isDigit).orEmpty()
        return digits.takeIf { it.length == 11 }
    }

    private fun isAttachmentDeliveryPending(response: JsonElement): Boolean {
        val root = response as? JsonObject ?: return false
        val attachmentQueue = root["attachmentQueue"] as? JsonObject ?: return false
        val required = attachmentQueue["required"]?.jsonPrimitive?.booleanOrNull == true
        val delivered = attachmentQueue["delivered"]?.jsonPrimitive?.booleanOrNull == true
        return required && !delivered
    }

    @kotlinx.serialization.Serializable
    private data class CadastroStatusRow(
        val status: String? = null,
    )
    suspend fun fetchCadastroConfig(session: SavedSession): CadastroConfig? {
        return getList<CadastroConfig>(
            path = "cadastro_config",
            session = session,
            query = {
                parameter("id", "eq.1")
                parameter("select", "*")
                parameter("limit", 1)
            },
        ).firstOrNull()
    }

    suspend fun fetchPlanosMap(session: SavedSession): List<PlanoMap> {
        return getList(
            path = "cadastro_planos_map",
            session = session,
            query = {
                parameter("select", "*")
                parameter("order", "plano_id.asc")
            },
        )
    }

    suspend fun fetchParentescosMap(session: SavedSession): List<ParentescoMap> {
        return getList(
            path = "cadastro_parentesco_map",
            session = session,
            query = {
                parameter("select", "*")
                parameter("order", "parentesco_id.asc")
            },
        )
    }

    suspend fun fetchStatusAdesoes(session: SavedSession): List<StatusAdesao> {
        return getList(
            path = "status_adesoes",
            session = session,
            query = {
                parameter("select", "*")
                parameter("order", "ordem.asc")
            },
        )
    }

    suspend fun fetchProfilesByRole(session: SavedSession, role: String): List<TeamMemberOption> {
        return getList(
            path = "profiles",
            session = session,
            query = {
                parameter("role", "eq.$role")
                parameter("is_active", "eq.true")
                parameter("external_id", "not.is.null")
                parameter("select", "id,name,email,external_id")
                parameter("order", "name.asc")
            },
        )
    }

    suspend fun fetchActiveLinks(session: SavedSession): List<CadastroLinkItem> {
        return getList(
            path = "cadastro_links",
            session = session,
            query = {
                parameter(
                    "select",
                    "id,empresa_codigo,empresa_nome,empresa_cnpj,vendedor_nome,vendedor_codigo,adesionista_id,adesionista_nome,adesionista_codigo,link_url,is_active,click_count,last_clicked_at,used_at,used_cpf,created_at,updated_at"
                )
                parameter("is_active", "eq.true")
                parameter("order", "empresa_nome.asc,updated_at.desc")
            },
        )
    }

    suspend fun fetchLinkMetrics(
        session: SavedSession,
        linkIds: List<String>,
    ): Map<String, CadastroLinkMetrics> {
        if (linkIds.isEmpty()) return emptyMap()

        val rows = getList<CadastroLinkCadastroRow>(
            path = "cadastros",
            session = session,
            query = {
                parameter("select", "origem_link_id,nome,dependentes")
                parameter("origem_link_id", "in.(${linkIds.joinToString(",")})")
                parameter("status", "eq.enviado")
            },
        )

        val associados = mutableMapOf<String, MutableList<CadastroLinkAssociadoResumo>>()
        val dependentesCount = mutableMapOf<String, Int>()

        rows.forEach { row ->
            val linkId = row.origemLinkId?.trim().orEmpty()
            if (linkId.isBlank()) return@forEach

            val dependentes = when (val normalized = decodeEmbeddedJsonElement(row.dependentes)) {
                is JsonArray -> normalized
                is JsonObject -> normalized["dependentes"] as? JsonArray ?: JsonArray(emptyList())
                else -> JsonArray(emptyList())
            }

            val nomesDependentes = dependentes.mapNotNull { item ->
                val obj = item as? JsonObject ?: return@mapNotNull null
                val tipo = obj["tipo"]?.jsonPrimitive?.intOrNull
                if (tipo == 1) return@mapNotNull null
                obj["nome"]?.jsonPrimitive?.contentOrNull?.trim()?.takeIf { it.isNotBlank() }
            }

            dependentesCount[linkId] = (dependentesCount[linkId] ?: 0) + nomesDependentes.size
            associados.getOrPut(linkId) { mutableListOf() }.add(
                CadastroLinkAssociadoResumo(
                    nome = row.nome?.trim().orEmpty().ifBlank { "Associado sem nome" },
                    dependentes = nomesDependentes,
                ),
            )
        }

        return linkIds.distinct().associateWith { linkId ->
            val linkAssociados = associados[linkId].orEmpty()
            CadastroLinkMetrics(
                associadosCount = linkAssociados.size,
                dependentesCount = dependentesCount[linkId] ?: 0,
                associados = linkAssociados,
            )
        }
    }

    suspend fun fetchCadastroLinkHistory(
        session: SavedSession,
        linkId: String,
    ): CadastroLinkHistoryResponse {
        val response: CadastroLinkHistoryResponse = client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/cadastro-link-history",
            json = json,
            body = buildJsonObject { put("linkId", linkId) },
        ) {
            applyAuthHeaders(session)
        }

        if (!response.ok) {
            throw IllegalStateException(response.error ?: "Nao foi possivel carregar o historico deste link.")
        }
        return response
    }

    suspend fun createCadastroLink(
        session: SavedSession,
        profile: MobileProfile,
        empresa: EmpresaResumo,
        adesionista: TeamMemberOption? = null,
    ): CadastroLinkItem {
        val rawToken = CadastroLinkCrypto.generateCadastroLinkToken()
        val tokenHash = CadastroLinkCrypto.hashCadastroLinkToken(rawToken)
        val linkUrl = buildPublicAdesaoUrl(rawToken)
        val vendedorCodigo = profile.externalId?.trim().orEmpty().ifBlank { "0" }

        val payload = buildJsonObject {
            put("created_by", profile.id)
            profile.teamId?.let { put("team_id", it) }
            put("token_hash", tokenHash)
            put("link_url", linkUrl)
            put("empresa_codigo", empresa.id)
            put("empresa_nome", empresa.nomeFantasia.ifBlank { empresa.razaoSocial })
            put("empresa_cnpj", empresa.cnpj)
            put("empresa_raw", empresa.raw ?: JsonObject(emptyMap()))
            put("empresa_exige_matricula", empresa.exigeMatricula ?: 0)
            put("planos_raw", empresa.precoPlano ?: buildJsonArray {})
            put("vendedor_id", profile.id)
            put("vendedor_codigo", vendedorCodigo)
            put("vendedor_nome", profile.name.ifBlank { profile.email })
            // Código e nome do adesionista são verificados e preenchidos pelo banco.
            adesionista?.id?.let { put("adesionista_id", it) }
        }

        return client.safePost<List<CadastroLinkItem>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/cadastro_links",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
        }.firstOrNull() ?: throw IllegalStateException("Falha ao gerar link.")
    }

    suspend fun regenerateCadastroLink(
        session: SavedSession,
        linkId: String,
    ): CadastroLinkItem {
        val rawToken = CadastroLinkCrypto.generateCadastroLinkToken()
        val tokenHash = CadastroLinkCrypto.hashCadastroLinkToken(rawToken)
        val linkUrl = buildPublicAdesaoUrl(rawToken)

        val payload = buildJsonObject {
            put("token_hash", tokenHash)
            put("link_url", linkUrl)
            put("is_active", true)
        }

        return client.safePost<List<CadastroLinkItem>>(
            url = "${AppConfig.supabaseUrl}/rest/v1/cadastro_links?id=eq.$linkId",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
            method = io.ktor.http.HttpMethod.Patch
            contentType(ContentType.Application.Json)
        }.firstOrNull() ?: throw IllegalStateException("Falha ao regerar link.")
    }

    suspend fun deleteCadastroLink(session: SavedSession, linkId: String) {
        client.safeDeleteNoContent(
            url = "${AppConfig.supabaseUrl}/rest/v1/cadastro_links?id=eq.$linkId",
            json = json,
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun searchEmpresa(
        session: SavedSession,
        value: String,
        type: EmpresaSearchType,
    ): List<EmpresaResumo> {
        val payload = buildJsonObject {
            when (type) {
                EmpresaSearchType.CODIGO -> put("empresaId", value)
                EmpresaSearchType.CNPJ -> put("cnpj", CadastroPayloadBuilder.normalizeDigits(value))
                EmpresaSearchType.NOME -> put("nome", value.trim())
            }
        }

        val response: EmpresaSearchResponse = client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/erp-search-empresa",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
        }

        if (!response.ok) {
            throw IllegalStateException(response.error ?: "Erro ao buscar empresa.")
        }

        return response.empresas
    }

    suspend fun createDraftFromCpf(
        session: SavedSession,
        profile: MobileProfile,
        config: CadastroConfig?,
        input: CpfConsultInput,
    ): CpfConsultResult = coroutineScope {
        val cpf = CadastroPayloadBuilder.normalizeDigits(input.cpf)
        val startedAt = System.currentTimeMillis()

        val existingDeferred = async {
            val stepStart = System.currentTimeMillis()
            val result = checkCpfExistente(session, profile.id, cpf)
            Log.i(logTag, "createDraftFromCpf check_cpf_existente took ${System.currentTimeMillis() - stepStart}ms")
            result
        }
        val clienteAnteriorDeferred = async {
            val stepStart = System.currentTimeMillis()
            val result = withTimeoutOrNull(12000) { findClienteByCpf(session, cpf) }
            Log.i(logTag, "createDraftFromCpf findClienteByCpf took ${System.currentTimeMillis() - stepStart}ms")
            result
        }

        // A base local protege apenas contra dois processos pendentes para o mesmo CPF.
        // Historico concluido nunca decide elegibilidade de recadastro: essa decisao e do ERP.
        val existing = existingDeferred.await()
        if (existing.exists) {
            val statusNormalizado = existing.status
                ?.trim()
                ?.lowercase(Locale.ROOT)
                .orEmpty()
            val statusPermiteContinuar = isPendingCadastroStatus(statusNormalizado)

            if (statusPermiteContinuar) {
                val canContinue = existing.canContinue && !existing.cadastroId.isNullOrBlank()
                throw CadastroExistenteException(
                    cadastroId = existing.cadastroId.takeIf { canContinue },
                    empresaNome = existing.empresaNome,
                    canContinue = canContinue,
                    buildString {
                        append("Ja existe uma adesao em andamento para este CPF")
                        existing.empresaNome?.let { append(" em $it") }
                        if (canContinue) {
                            append(". Abra o rascunho existente para continuar.")
                        } else {
                            append(". Finalize o processo pendente antes de iniciar outro.")
                        }
                    },
                )
            }

            Log.i(
                logTag,
                "createDraftFromCpf ignorando historico local id=${existing.cadastroId ?: "-"} status=${existing.status ?: "-"} cpf=$cpf; ERP decidira elegibilidade",
            )
        }

        val erpStepStart = System.currentTimeMillis()
        val erpCheck = withTimeoutOrNull(20000) { checkErpAssociado(session, cpf) }
            ?: throw IllegalStateException("A consulta de CPF no ERP excedeu o tempo limite. Tente novamente.")
        Log.i(logTag, "createDraftFromCpf erp-check-associado took ${System.currentTimeMillis() - erpStepStart}ms")

        if (erpCheck.exists && erpCheck.shouldBlock) {
            throw IllegalStateException(erpCheck.blockReason ?: "Cliente ja cadastrado no ERP.")
        }

        var warningMessage: String? = null
        var cadastroBase = CadastroBaseData(cpf = cpf)
        var lemmitRaw: JsonElement? = null

        if (config?.ativarLemmit != false) {
            val canUse = runCatching {
                withTimeoutOrNull(2500) { canUseLemmit(session, profile.id) }
            }.onFailure { throwable ->
                Log.w(logTag, "createDraftFromCpf canUseLemmit falhou, seguindo sem lemmit", throwable)
            }.getOrNull()

            if (canUse == true) {
                var lemmitFailureMessage: String? = null
                val lemmitResponse = runCatching {
                    withTimeoutOrNull(8500) { consultarCpfLemmit(session, cpf) }
                }.onFailure { throwable ->
                    lemmitFailureMessage = throwable.message
                    Log.w(logTag, "createDraftFromCpf consultarCpfLemmit falhou, seguindo sem lemmit", throwable)
                }.getOrNull()

                if (lemmitResponse != null) {
                    lemmitRaw = json.encodeToJsonElement(LemmitResponse.serializer(), lemmitResponse)
                    cadastroBase = CadastroPayloadBuilder.mapLemmitToCadastro(lemmitResponse, cpf)
                } else {
                    val normalized = lemmitFailureMessage
                        ?.trim()
                        ?.lowercase(Locale.ROOT)
                        .orEmpty()
                    warningMessage = when {
                        normalized.contains("unauthenticated") || normalized.contains("unauthorized") ->
                            "Integracao Lemmit sem autenticacao valida no backend. Verifique a chave da API Lemmit."

                        normalized.contains("timeout") || normalized.contains("tempo limite") ->
                            "Consulta Lemmit excedeu o tempo limite. O rascunho foi criado sem preenchimento automatico."

                        normalized.isNotBlank() ->
                            "Falha na Lemmit: ${CadastroApiErrorMapper.mapUserMessage(lemmitFailureMessage, "Consulta indisponivel")}."

                        else ->
                            "Consulta Lemmit indisponivel no momento. O rascunho foi criado sem preenchimento automatico."
                    }
                }
            } else {
                val limitInfo = runCatching {
                    withTimeoutOrNull(3000) { fetchLemmitLimitInfo(session, profile.id).firstOrNull() }
                }.onFailure { throwable ->
                    Log.w(logTag, "createDraftFromCpf getLemmitLimitInfo falhou", throwable)
                }.getOrNull()

                warningMessage = if (limitInfo?.limiteMensal != null) {
                    "Limite mensal da Lemmit atingido. O rascunho foi criado sem preenchimento automatico."
                } else {
                    "Consulta Lemmit indisponivel para este usuario. O rascunho foi criado sem preenchimento automatico."
                }
            }
        }

        clienteAnteriorDeferred.await()?.let { anterior ->
            val sexoResolvido = cadastroBase.sexo
                .takeIf { it.isNotBlank() }
                ?: anterior.sexo
            val sexoCodigoResolvido = when {
                sexoResolvido.equals("M", ignoreCase = true) ||
                    sexoResolvido.equals("MASCULINO", ignoreCase = true) -> 1

                sexoResolvido.equals("F", ignoreCase = true) ||
                    sexoResolvido.equals("FEMININO", ignoreCase = true) -> 0

                cadastroBase.sexo.isNotBlank() && cadastroBase.sexoCodigo in setOf(0, 1) -> cadastroBase.sexoCodigo
                anterior.sexoCodigo in setOf(0, 1) -> anterior.sexoCodigo
                else -> cadastroBase.sexoCodigo
            }
            cadastroBase = cadastroBase.copy(
                nome = cadastroBase.nome.ifBlank { anterior.nome }.trim(),
                dataNascimento = cadastroBase.dataNascimento.ifBlank { anterior.dataNascimento },
                sexo = sexoResolvido,
                sexoCodigo = sexoCodigoResolvido,
                contatos = if (cadastroBase.contatos.isEmpty()) anterior.contatos else cadastroBase.contatos,
                endereco = cadastroBase.endereco ?: anterior.endereco,
                nomeMae = cadastroBase.nomeMae
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                    ?: anterior.nomeMae
                        ?.trim()
                        ?.takeIf { it.isNotBlank() },
            )
        }

        val enderecoEnriquecido = cadastroBase.endereco
            ?.takeIf { it.cep.isNotBlank() }
            ?.let { endereco ->
                withTimeoutOrNull(2000) { CadastroPayloadBuilder.enrichEndereco(endereco, consultarEnderecoCep(session, endereco.cep)) }
                    ?: endereco
            }

        cadastroBase = cadastroBase.copy(
            dataNascimento = CadastroPayloadBuilder.normalizeIsoDateOrNull(cadastroBase.dataNascimento).orEmpty(),
            endereco = enderecoEnriquecido ?: cadastroBase.endereco,
        )

        val vendedorData = resolveVendedorData(profile, input)
        val adesionistaData = resolveAdesionistaData(profile, input)
        val funcionarioCadastroId = profile.externalId?.toIntOrNull() ?: 0
        val titular = CadastroPayloadBuilder.buildDependenteTitular(cadastroBase, funcionarioCadastroId)

        val draft = withTimeoutOrNull(20000) {
            createOrUpdateRascunho(
                session = session,
                profile = profile,
                payload = buildJsonObject {
                    put("tipo_cadastro", "cadastro")
                    put("cpf", cpf)
                    put("nome", cadastroBase.nome)
                    cadastroBase.nomeMae?.let { put("nome_mae", it) }
                    CadastroPayloadBuilder.normalizeIsoDateOrNull(cadastroBase.dataNascimento)?.let {
                        put("data_nascimento", it)
                    }
                    put("sexo", cadastroBase.sexo)
                    put("sexo_codigo", cadastroBase.sexoCodigo)
                    put("contatos", json.encodeToJsonElement(ListSerializerCache.contatos, cadastroBase.contatos))
                    cadastroBase.endereco?.let {
                        put("endereco", json.encodeToJsonElement(CadastroEnderecoSerializerCache.serializer, it))
                    }
                    put("dependentes", json.encodeToJsonElement(ListSerializerCache.dependentes, listOf(titular)))
                    put("cliente_sera_usuario", true)
                    put("empresa_id", input.empresa.id)
                    put("empresa_codigo", input.empresa.id)
                    put("empresa_nome", input.empresa.nomeFantasia)
                    put("empresa_cnpj", input.empresa.cnpj)
                    put("empresa_raw", input.empresa.raw ?: JsonObject(emptyMap()))
                    put("empresa_exige_matricula", input.empresa.exigeMatricula ?: 0)
                    put("planos_raw", input.empresa.precoPlano ?: buildJsonArray {})
                    if (lemmitRaw != null) put("lemit_raw", lemmitRaw)
                    vendedorData.forEach { (key, value) -> put(key, value) }
                    adesionistaData.forEach { (key, value) -> put(key, value) }
                },
            )
        } ?: throw IllegalStateException("A criação do rascunho excedeu o tempo limite. Tente novamente.")

        Log.i(logTag, "createDraftFromCpf total took ${System.currentTimeMillis() - startedAt}ms")
        CpfConsultResult(draft = draft, warningMessage = warningMessage)
    }

    suspend fun sendCadastroToErp(
        session: SavedSession,
        profile: MobileProfile,
        config: CadastroConfig?,
        cadastroId: String,
        cadastroPrefetched: CadastroDetalhe? = null,
        enderecoHint: JsonElement? = null,
        arquivoPathHint: String? = null,
        dependentesHint: JsonElement? = null,
        nomeHint: String? = null,
        dataNascimentoHint: String? = null,
        nomeMaeHint: String? = null,
        numeroMatriculaHint: String? = null,
        flowContext: String? = null,
    ): CadastroDetalhe {
        return runCatching {
            val cadastroOriginal = cadastroPrefetched ?: fetchCadastroDetalhe(session, cadastroId)
            val cadastroComCoreHints = withCoreFieldHints(
                cadastro = cadastroOriginal,
                nomeHint = nomeHint,
                dataNascimentoHint = dataNascimentoHint,
                nomeMaeHint = nomeMaeHint,
                numeroMatriculaHint = numeroMatriculaHint,
            )
            val cadastroCore = ensureCadastroCoreFields(session, cadastroComCoreHints)
            val cadastroComMatricula = reconcileNumeroMatriculaBeforeValidation(
                session = session,
                cadastroOriginal = cadastroOriginal,
                cadastroAtual = cadastroCore,
            )
            val cadastroComEndereco = withEnderecoHint(cadastroComMatricula, enderecoHint)
            val cadastroComDependentes = withDependentesHint(cadastroComEndereco, dependentesHint)
            val cadastroComArquivoHint = withArquivoPathHint(cadastroComDependentes, arquivoPathHint)

            val cadastro = persistArquivoPathBeforeSend(
                session = session,
                cadastroAnterior = cadastroComDependentes,
                cadastroAtual = cadastroComArquivoHint,
            )

            validateCadastroReady(cadastro, config)
            val targetCadastroId = cadastro.id.ifBlank { cadastroId }

            val funcionarioCadastroId = profile.externalId?.toIntOrNull()
            val baseData = CadastroPayloadBuilder.detailToBaseData(json, cadastro)
            val dependentes = CadastroPayloadBuilder.detailDependentes(json, cadastro, funcionarioCadastroId ?: 0)
            val payload = CadastroPayloadBuilder.buildErpPayload(
                cadastro = baseData,
                dependentes = dependentes,
                empresaId = cadastro.empresaId ?: cadastro.empresaCodigo
                ?: throw IllegalStateException("Empresa nao vinculada ao cadastro."),
                vendedorCodigo = cadastro.vendedorCodigo,
                funcionarioCadastroId = funcionarioCadastroId,
                userRole = profile.role,
                userExternalId = profile.externalId,
                adesionistaCodigo = cadastro.adesionistaCodigo,
                arquivoPath = cadastro.arquivoPath,
            )

            val matriculaHintNormalizada = numeroMatriculaHint
                ?.trim()
                ?.takeIf { it.isNotBlank() }
            val matriculaPersistidaNormalizada = cadastroOriginal.numeroMatricula
                ?.trim()
                ?.takeIf { it.isNotBlank() }
            val matriculaFinalNormalizada = cadastro.numeroMatricula
                ?.trim()
                ?.takeIf { it.isNotBlank() }
            val matriculaSource = when {
                !matriculaHintNormalizada.isNullOrBlank() && matriculaFinalNormalizada == matriculaHintNormalizada -> "form_payload_hint"
                !matriculaPersistidaNormalizada.isNullOrBlank() && matriculaFinalNormalizada == matriculaPersistidaNormalizada -> "cadastro_persistido"
                !matriculaFinalNormalizada.isNullOrBlank() -> "detalhe_carregado"
                else -> "ausente"
            }
            val responsavelFinanceiroPayload = runCatching {
                payload["dados"]?.jsonObject
                    ?.get("responsavelFinanceiro")
                    ?.jsonObject
            }.getOrNull()
            val payloadMatricula = responsavelFinanceiroPayload
                ?.get("Matricula")
                ?.jsonPrimitive
                ?.contentOrNull
                ?.trim()
                ?.takeIf { it.isNotBlank() }
            val payloadDataApresentacao = responsavelFinanceiroPayload
                ?.get("dataApresentacao")
                ?.jsonPrimitive
                ?.contentOrNull
                ?.trim()
                ?.takeIf { it.isNotBlank() }
            val flowLabel = flowContext
                ?.trim()
                ?.takeIf { it.isNotBlank() }
                ?: if (isPendingCadastroStatus(cadastro.status)) "pending" else "regular"
            Log.i(
                logTag,
                "Cadastro ERP payload check: cadastroId=$targetCadastroId flow=$flowLabel tipo=${cadastro.tipoCadastro} status=${cadastro.status} hasMatricula=${!matriculaFinalNormalizada.isNullOrBlank()} matriculaLength=${matriculaFinalNormalizada?.length ?: 0} hasDataApresentacao=${!payloadDataApresentacao.isNullOrBlank()} hasResponsavelFinanceiroMatricula=${!payloadMatricula.isNullOrBlank()} matriculaPayloadLength=${payloadMatricula?.length ?: 0} matriculaSource=$matriculaSource",
            )
            val response = enviarParaErp(session, targetCadastroId, payload)
            val attachmentQueuedByEdge = runCatching {
                response.jsonObject["attachmentQueue"]
                    ?.jsonObject
                    ?.get("queued")
                    ?.jsonPrimitive
                    ?.booleanOrNull == true
            }.getOrDefault(false)
            val firstDependenteId = CadastroPayloadBuilder.firstDependenteCodigo(response)

            if (
                !cadastro.arquivoPath.isNullOrBlank() &&
                !attachmentQueuedByEdge &&
                firstDependenteId != null &&
                funcionarioCadastroId != null
            ) {
                runCatching {
                    processDocumentoUpload(
                        session = session,
                        cadastro = cadastro,
                        funcionarioCadastroId = funcionarioCadastroId,
                        dependenteId = firstDependenteId,
                    )
                }.onFailure { throwable ->
                    Log.e(
                        logTag,
                        "ERP confirmou cadastro $targetCadastroId; fallback de enqueue do anexo falhou sem reabrir a adesao.",
                        throwable,
                    )
                }
            } else if (!cadastro.arquivoPath.isNullOrBlank() && !attachmentQueuedByEdge) {
                Log.w(
                    logTag,
                    "ERP confirmou cadastro $targetCadastroId, mas nao foi possivel montar fallback local do anexo. A adesao permanece enviada.",
                )
            }

            runCatching { fetchCadastroDetalhe(session, targetCadastroId) }
                .onFailure { throwable ->
                    Log.w(
                        logTag,
                        "ERP confirmou cadastro $targetCadastroId; refresh local falhou e foi ignorado para impedir reenvio duplicado.",
                        throwable,
                    )
                }
                .getOrDefault(cadastro)
        }.getOrThrow()
    }

    private fun withArquivoPathHint(
        cadastro: CadastroDetalhe,
        arquivoPathHint: String?,
    ): CadastroDetalhe {
        val arquivoAtual = cadastro.arquivoPath?.trim().orEmpty()
        val hintNormalizado = arquivoPathHint?.trim().orEmpty()
        if (arquivoAtual.isNotBlank() || hintNormalizado.isBlank()) return cadastro
        return cadastro.copy(arquivoPath = hintNormalizado)
    }

    private suspend fun persistArquivoPathBeforeSend(
        session: SavedSession,
        cadastroAnterior: CadastroDetalhe,
        cadastroAtual: CadastroDetalhe,
    ): CadastroDetalhe {
        val arquivoAnterior = cadastroAnterior.arquivoPath
            ?.trim()
            ?.takeIf { it.isNotBlank() }

        val arquivoAtual = cadastroAtual.arquivoPath
            ?.trim()
            ?.takeIf { it.isNotBlank() }

        if (arquivoAtual.isNullOrBlank()) {
            return cadastroAtual
        }

        if (arquivoAnterior == arquivoAtual) {
            return cadastroAtual.copy(arquivoPath = arquivoAtual)
        }

        runCatching {
            patchCadastroById(
                session = session,
                id = cadastroAtual.id,
                payload = buildJsonObject {
                    put("arquivo_path", arquivoAtual)
                    put("created_by", session.userId)
                },
            )
        }.onFailure { throwable ->
            Log.w(
                logTag,
                "Falha ao persistir arquivo_path antes do envio ERP id=${cadastroAtual.id} arquivoPath=$arquivoAtual",
                throwable,
            )
        }

        return cadastroAtual.copy(arquivoPath = arquivoAtual)
    }

    private fun withDependentesHint(
        cadastro: CadastroDetalhe,
        dependentesHint: JsonElement?,
    ): CadastroDetalhe {
        val hintArray = runCatching { dependentesHint?.jsonArray }.getOrNull()
        if (hintArray.isNullOrEmpty()) return cadastro
        return cadastro.copy(dependentes = dependentesHint)
    }

    private fun withEnderecoHint(
        cadastro: CadastroDetalhe,
        enderecoHint: JsonElement?,
    ): CadastroDetalhe {
        val hintObject = runCatching { enderecoHint?.jsonObject }.getOrNull() ?: return cadastro
        return cadastro.copy(endereco = hintObject)
    }

    private fun withCoreFieldHints(
        cadastro: CadastroDetalhe,
        nomeHint: String?,
        dataNascimentoHint: String?,
        nomeMaeHint: String?,
        numeroMatriculaHint: String?,
    ): CadastroDetalhe {
        val nome = nomeHint
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: cadastro.nome
        val dataNascimento = dataNascimentoHint
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: cadastro.dataNascimento
        val nomeMae = nomeMaeHint
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: cadastro.nomeMae
        val numeroMatricula = numeroMatriculaHint
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: cadastro.numeroMatricula
                ?.trim()
                ?.takeIf { it.isNotBlank() }

        if (
            nome == cadastro.nome &&
            dataNascimento == cadastro.dataNascimento &&
            nomeMae == cadastro.nomeMae &&
            numeroMatricula == cadastro.numeroMatricula
        ) {
            return cadastro
        }
        return cadastro.copy(
            nome = nome,
            dataNascimento = dataNascimento,
            nomeMae = nomeMae,
            numeroMatricula = numeroMatricula,
        )
    }

    private suspend fun reconcileNumeroMatriculaBeforeValidation(
        session: SavedSession,
        cadastroOriginal: CadastroDetalhe,
        cadastroAtual: CadastroDetalhe,
    ): CadastroDetalhe {
        val reconciled = reconcileNumeroMatriculaForSend(
            empresaExigeMatricula = cadastroAtual.empresaExigeMatricula,
            persistedNumeroMatricula = cadastroOriginal.numeroMatricula,
            hintedNumeroMatricula = cadastroAtual.numeroMatricula,
        )
        val numeroMatriculaAtual = cadastroAtual.numeroMatricula
            ?.trim()
            ?.takeIf { it.isNotBlank() }
        val cadastroComMatricula = if (numeroMatriculaAtual == reconciled.numeroMatricula) {
            cadastroAtual
        } else {
            cadastroAtual.copy(numeroMatricula = reconciled.numeroMatricula)
        }

        if (!reconciled.shouldPersist || reconciled.numeroMatricula.isNullOrBlank()) {
            return cadastroComMatricula
        }

        return runCatching {
            updateCadastro(
                session = session,
                id = cadastroComMatricula.id,
                payload = buildJsonObject {
                    put("numero_matricula", reconciled.numeroMatricula)
                },
            )
        }.onFailure { throwable ->
            Log.w(
                logTag,
                "Falha ao persistir matricula reconciliada antes do envio id=${cadastroComMatricula.id}",
                throwable,
            )
        }.getOrDefault(cadastroComMatricula)
    }

    private suspend fun ensureCadastroCoreFields(
        session: SavedSession,
        cadastro: CadastroDetalhe,
    ): CadastroDetalhe {
        val dependenteTitular = runCatching {
            cadastro.dependentes
                ?.jsonArray
                ?.firstOrNull()
                ?.jsonObject
        }.getOrNull()

        val nomeAtual = cadastro.nome?.trim().orEmpty()
        val dataAtual = cadastro.dataNascimento?.trim().orEmpty()
        val nomeMaeAtual = cadastro.nomeMae?.trim().orEmpty()

        val nomeRecuperado = if (nomeAtual.isBlank()) {
            dependenteTitular?.get("nome")?.jsonPrimitive?.contentOrNull
                ?.trim()
                ?.takeIf { it.isNotBlank() }
                ?: cadastro.responsavelFinanceiroNome?.trim()?.takeIf { it.isNotBlank() }
        } else null

        val dataRecuperada = if (dataAtual.isBlank()) {
            dependenteTitular?.get("dataNascimento")?.jsonPrimitive?.contentOrNull
                ?.takeIf { it.isNotBlank() }
                ?: dependenteTitular?.get("data_nascimento")?.jsonPrimitive?.contentOrNull
                    ?.takeIf { it.isNotBlank() }
        } else null

        val nomeMaeRecuperado = if (nomeMaeAtual.isBlank()) {
            dependenteTitular?.get("nomeMae")?.jsonPrimitive?.contentOrNull
                ?.trim()
                ?.takeIf { it.isNotBlank() }
                ?: dependenteTitular?.get("nome_mae")?.jsonPrimitive?.contentOrNull
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
        } else null

        if (nomeRecuperado == null && dataRecuperada == null && nomeMaeRecuperado == null) {
            return cadastro
        }

        return runCatching {
            updateCadastro(
                session = session,
                id = cadastro.id,
                payload = buildJsonObject {
                    nomeRecuperado?.let { put("nome", it) }
                    dataRecuperada?.let { put("data_nascimento", it) }
                    nomeMaeRecuperado?.let { put("nome_mae", it) }
                },
            )
        }.getOrElse { throwable ->
            if (isDuplicateDraftConstraintError(throwable)) {
                Log.w(
                    logTag,
                    "ensureCadastroCoreFields ignorando conflito de unicidade ao persistir core fields id=${cadastro.id}",
                    throwable,
                )
                cadastro.copy(
                    nome = nomeRecuperado ?: cadastro.nome,
                    dataNascimento = dataRecuperada ?: cadastro.dataNascimento,
                    nomeMae = nomeMaeRecuperado ?: cadastro.nomeMae,
                )
            } else {
                throw throwable
            }
        }
    }

    suspend fun fetchCadastroDetalhe(session: SavedSession, id: String): CadastroDetalhe {
        return getList<CadastroDetalhe>(
            path = "cadastros",
            session = session,
            query = {
                parameter("id", "eq.$id")
                parameter(
                    "select",
                    "id,status,tipo_cadastro,nome,cpf,data_nascimento,sexo_codigo,nome_mae,contatos,endereco,dependentes,empresa_id,empresa_codigo,empresa_nome,empresa_cnpj,empresa_exige_matricula,empresa_raw,planos_raw,numero_matricula,status_adesao_id,vendedor_nome,vendedor_codigo,adesionista_nome,adesionista_codigo,responsavel_financeiro_codigo,responsavel_financeiro_nome,responsavel_financeiro_cpf,contatos_responsavel_financeiro,motivo_bloqueio,erp_dados_associado,erp_response,arquivo_path,arquivo_nome,arquivo_mime_type,arquivo_tamanho,plano_codigo,created_at,updated_at"
                )
                parameter("limit", 1)
            },
        ).firstOrNull() ?: throw IllegalStateException("Cadastro nao encontrado.")
    }

    suspend fun backfillCadastroMissingDataByCpf(
        session: SavedSession,
        cadastro: CadastroDetalhe,
    ): CadastroDetalhe {
        val cpf = CadastroPayloadBuilder.normalizeDigits(cadastro.cpf)
        if (cpf.length != 11) return cadastro

        val enderecoAtual = parseCadastroEnderecoFlex(cadastro.endereco)
        val contatosAtuais = parseCadastroContatosFlex(cadastro.contatos)
        val precisaEndereco = !hasEnderecoData(enderecoAtual)
        val precisaContatos = contatosAtuais.isEmpty()
        if (!precisaEndereco && !precisaContatos) return cadastro

        var enderecoCandidato = parseEnderecoFromErpAssociado(cadastro.erpDadosAssociado)
        var contatosCandidatos = parseContatoFromErpAssociado(cadastro.erpDadosAssociado)

        if ((precisaEndereco && !hasEnderecoData(enderecoCandidato)) || (precisaContatos && contatosCandidatos.isEmpty())) {
            val anterior = runCatching { findClienteByCpf(session, cpf) }.getOrNull()
            if (precisaEndereco && !hasEnderecoData(enderecoCandidato)) {
                enderecoCandidato = anterior?.endereco
            }
            if (precisaContatos && contatosCandidatos.isEmpty()) {
                contatosCandidatos = anterior?.contatos.orEmpty()
            }
        }

        val contatosNormalizados = normalizeContatosForPersist(contatosCandidatos)
        val payload = buildJsonObject {
            if (precisaEndereco && hasEnderecoData(enderecoCandidato)) {
                put("endereco", json.encodeToJsonElement(CadastroEnderecoSerializerCache.serializer, enderecoCandidato!!))
            }
            if (precisaContatos && contatosNormalizados.isNotEmpty()) {
                put("contatos", json.encodeToJsonElement(ListSerializerCache.contatos, contatosNormalizados))
            }
        }
        if (payload.isEmpty()) return cadastro

        val payloadComAuditoria = buildJsonObject {
            payload.forEach { (key, value) -> put(key, value) }
            put("created_by", session.userId)
        }
        return runCatching {
            patchCadastroById(session, cadastro.id, payloadComAuditoria)
            fetchCadastroDetalhe(session, cadastro.id)
        }.onFailure { throwable ->
            Log.w(logTag, "Falha ao preencher dados faltantes por CPF para cadastro ${cadastro.id}", throwable)
        }.getOrDefault(cadastro)
    }

    suspend fun updateCadastro(
        session: SavedSession,
        id: String,
        payload: JsonObject,
        resolveDraftConflict: Boolean = true,
    ): CadastroDetalhe {
        val payloadComCreatedBy = buildJsonObject {
            payload.forEach { (key, value) -> put(key, value) }
            val createdByPayload = payload["created_by"]
                ?.jsonPrimitive
                ?.contentOrNull
                ?.trim()
            if (createdByPayload.isNullOrBlank()) {
                put("created_by", session.userId)
            }
        }
        try {
            patchCadastroById(session, id, payloadComCreatedBy)
        } catch (throwable: Throwable) {
            if (!isDuplicateDraftConstraintError(throwable)) throw throwable

            val profileId = payloadComCreatedBy["created_by"]
                ?.jsonPrimitive
                ?.contentOrNull
                ?.trim()
                ?.ifBlank { null }
                ?: session.userId
            val tipoCadastro = payloadComCreatedBy["tipo_cadastro"]
                ?.jsonPrimitive
                ?.contentOrNull
                ?.trim()
                .orEmpty()
            val cpfLookupFromPayload = extractCadastroCpfFromPayload(payloadComCreatedBy)
            val cpfLookup = if (cpfLookupFromPayload.isNotBlank()) {
                cpfLookupFromPayload
            } else {
                runCatching {
                    fetchCadastroDetalhe(session, id).cpf
                        ?.filter(Char::isDigit)
                        ?.takeIf { it.length == 11 }
                        .orEmpty()
                }.getOrDefault("")
            }
            val responsavelCpfLookup = payloadComCreatedBy["responsavel_financeiro_cpf"]
                ?.jsonPrimitive
                ?.contentOrNull
                ?.filter(Char::isDigit)
                .orEmpty()
            val existingAfterConflict = when {
                tipoCadastro == "inclusao_dependente" && responsavelCpfLookup.isNotBlank() -> {
                    findPendingInclusaoByResponsavelCpf(
                        session = session,
                        profileId = profileId,
                        responsavelCpfDigits = responsavelCpfLookup,
                        excludeCadastroId = id,
                    )
                }
                cpfLookup.isNotBlank() -> {
                    resolvePendingCadastroConflictByCpf(
                        session = session,
                        currentUserId = profileId,
                        cpfDigits = cpfLookup,
                        excludeCadastroId = id,
                    )
                }
                else -> null
            }

            if (existingAfterConflict != null && resolveDraftConflict) {
                if (existingAfterConflict.id == id) {
                    Log.w(
                        logTag,
                        "updateCadastro encontrou conflito pendente com o mesmo id=$id; retornando detalhe atual sem reaplicar patch.",
                    )
                    return fetchCadastroDetalhe(session, id)
                }
                Log.w(
                    logTag,
                    "updateCadastro detectou conflito de pendente duplicado para id=$id; reaplicando no pendente existente id=${existingAfterConflict.id}.",
                    throwable,
                )
                patchCadastroById(session, existingAfterConflict.id, payloadComCreatedBy)
                return fetchCadastroDetalhe(session, existingAfterConflict.id)
            }
            if (!resolveDraftConflict && isDuplicateDraftConstraintError(throwable)) {
                Log.w(
                    logTag,
                    "updateCadastro autosave best-effort ignorando conflito id=$id tipoCadastro=$tipoCadastro cpfLookup=$cpfLookup msg=${throwable.message}",
                )
                return fetchCadastroDetalhe(session, id)
            }
            Log.w(
                logTag,
                "updateCadastro recebeu violacao de unicidade mas nao encontrou pendente para reconciliar id=$id tipoCadastro=$tipoCadastro cpfLookup=$cpfLookup msg=${throwable.message}",
            )
            throw throwable
        }

        return fetchCadastroDetalhe(session, id)
    }

    private suspend fun patchCadastroById(
        session: SavedSession,
        id: String,
        payload: JsonObject,
    ) {
        client.safePost<JsonElement>(
            url = "${AppConfig.supabaseUrl}/rest/v1/cadastros?id=eq.$id",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("Prefer", "return=representation")
            header("Content-Profile", "public")
            header("Accept-Profile", "public")
            method = io.ktor.http.HttpMethod.Patch
            contentType(ContentType.Application.Json)
        }
    }

    private fun extractCadastroCpfFromPayload(payload: JsonObject): String {
        val fromRoot = payload["cpf"]?.jsonPrimitive?.contentOrNull?.filter(Char::isDigit).orEmpty()
        if (fromRoot.length == 11) return fromRoot

        val dependentes = runCatching { payload["dependentes"]?.jsonArray }.getOrNull() ?: return ""
        val titular = dependentes.firstOrNull() ?: return ""
        val titularObj = runCatching { titular.jsonObject }.getOrNull() ?: return ""
        val fromTitular = titularObj["cpf"]?.jsonPrimitive?.contentOrNull?.filter(Char::isDigit).orEmpty()
        return if (fromTitular.length == 11) fromTitular else ""
    }

    private suspend fun findPendingInclusaoByResponsavelCpf(
        session: SavedSession,
        profileId: String,
        responsavelCpfDigits: String,
        excludeCadastroId: String? = null,
    ): CadastroIdRow? {
        if (responsavelCpfDigits.isBlank()) return null
        val pendentes = getList<CadastroInclusaoLookupRow>(
            path = "cadastros",
            session = session,
            query = {
                parameter("tipo_cadastro", "eq.inclusao_dependente")
                parameter("status", pendingCadastroStatusQueryValue())
                parameter("created_by", "eq.$profileId")
                parameter("select", "id,responsavel_financeiro_cpf")
                parameter("order", "updated_at.desc")
                parameter("limit", 50)
            },
        )
        return pendentes
            .firstOrNull { item ->
                if (!excludeCadastroId.isNullOrBlank() && item.id == excludeCadastroId) {
                    return@firstOrNull false
                }
                item.responsavelFinanceiroCpf
                    ?.filter(Char::isDigit)
                    .orEmpty() == responsavelCpfDigits
            }
            ?.let { CadastroIdRow(id = it.id) }
    }

    private suspend fun findPendingCadastroByCpf(
        session: SavedSession,
        cpfDigits: String,
        createdBy: String? = null,
        excludeCadastroId: String? = null,
    ): CadastroIdRow? {
        val normalizedCpf = cpfDigits.filter(Char::isDigit)
        if (normalizedCpf.length != 11) return null
        return getList<CadastroIdRow>(
            path = "cadastros",
            session = session,
            query = {
                if (!excludeCadastroId.isNullOrBlank()) {
                    parameter("id", "neq.$excludeCadastroId")
                }
                parameter("tipo_cadastro", "eq.cadastro")
                parameter("status", pendingCadastroStatusQueryValue())
                parameter("cpf", "eq.$normalizedCpf")
                createdBy
                    ?.takeIf { it.isNotBlank() }
                    ?.let { parameter("created_by", "eq.$it") }
                parameter("select", "id")
                parameter("order", "updated_at.desc")
                parameter("limit", 1)
            },
        ).firstOrNull()
    }

    private suspend fun resolvePendingCadastroConflictByCpf(
        session: SavedSession,
        currentUserId: String,
        cpfDigits: String,
        excludeCadastroId: String? = null,
    ): CadastroIdRow? {
        val normalizedCpf = cpfDigits.filter(Char::isDigit)
        if (normalizedCpf.length != 11) return null

        findPendingCadastroByCpf(
            session = session,
            cpfDigits = normalizedCpf,
            createdBy = currentUserId,
            excludeCadastroId = excludeCadastroId,
        )?.let { return it }

        findPendingCadastroByCpf(
            session = session,
            cpfDigits = normalizedCpf,
            createdBy = null,
            excludeCadastroId = excludeCadastroId,
        )?.let { return it }

        val pendingFromRpc = runCatching {
            checkCpfExistente(
                session = session,
                userId = currentUserId,
                cpf = normalizedCpf,
            )
        }.getOrNull()

        val cadastroIdFromRpc = pendingFromRpc
            ?.cadastroId
            ?.trim()
            .orEmpty()

        return if (
            pendingFromRpc?.exists == true &&
            pendingFromRpc.canContinue &&
            cadastroIdFromRpc.isNotBlank() &&
            cadastroIdFromRpc != excludeCadastroId
        ) {
            CadastroIdRow(id = cadastroIdFromRpc)
        } else {
            null
        }
    }

    suspend fun resolvePendingCadastroConflictIdByCpf(
        session: SavedSession,
        currentUserId: String,
        cpfDigits: String,
        excludeCadastroId: String? = null,
    ): String? {
        return resolvePendingCadastroConflictByCpf(
            session = session,
            currentUserId = currentUserId,
            cpfDigits = cpfDigits,
            excludeCadastroId = excludeCadastroId,
        )?.id
    }

    suspend fun inspectCpfExistente(
        session: SavedSession,
        userId: String,
        cpf: String,
    ): CheckCpfExistenteResponse? {
        val normalizedCpf = normalizeCpfDigits(cpf) ?: return null
        return runCatching {
            checkCpfExistente(
                session = session,
                userId = userId,
                cpf = normalizedCpf,
            )
        }.onFailure { throwable ->
            Log.w(logTag, "inspectCpfExistente falhou cpf=$normalizedCpf", throwable)
        }.getOrNull()
    }

    suspend fun createCadastroDraft(
        session: SavedSession,
        profile: MobileProfile,
        payload: JsonObject,
    ): CadastroDetalhe {
        val profileId = ensureProfileReadyForCadastroInsert(session, profile)
        val tipoCadastro = payload["tipo_cadastro"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        val cpf = payload["cpf"]?.jsonPrimitive?.contentOrNull?.filter(Char::isDigit).orEmpty()
        val responsavelCpf = payload["responsavel_financeiro_cpf"]?.jsonPrimitive?.contentOrNull?.filter(Char::isDigit).orEmpty()
        val statusToPersist = payload["status"]
            ?.jsonPrimitive
            ?.contentOrNull
            ?.trim()
            ?.lowercase(Locale.ROOT)
            ?.takeIf { it.isNotBlank() }
            ?: "incompleto"
        val existing = when {
            tipoCadastro == "inclusao_dependente" && responsavelCpf.isNotBlank() -> {
                findPendingInclusaoByResponsavelCpf(
                    session = session,
                    profileId = profileId,
                    responsavelCpfDigits = responsavelCpf,
                )
            }
            cpf.isNotBlank() -> {
                resolvePendingCadastroConflictByCpf(
                    session = session,
                    currentUserId = profileId,
                    cpfDigits = cpf,
                )
            }
            else -> null
        }

        return if (existing != null) {
            val updatePayload = buildJsonObject {
                payload.forEach { (key, value) -> put(key, value) }
                put("created_by", profileId)
                profile.teamId?.let { put("team_id", it) }
            }
            val updatedRows = client.safePost<List<CadastroDetalhe>>(
                url = "${AppConfig.supabaseUrl}/rest/v1/cadastros?id=eq.${existing.id}",
                json = json,
                body = updatePayload,
            ) {
                applyAuthHeaders(session)
                header("Prefer", "return=representation")
                method = io.ktor.http.HttpMethod.Patch
                contentType(ContentType.Application.Json)
            }
            fetchCadastroDetalhe(session, updatedRows.firstOrNull()?.id ?: existing.id)
        } else {
            val insertPayload = buildJsonObject {
                payload.forEach { (key, value) -> put(key, value) }
                put("created_by", profileId)
                profile.teamId?.let { put("team_id", it) }
                put("status", statusToPersist)
            }

            val insertedRows = try {
                client.safePost<List<CadastroDetalhe>>(
                    url = "${AppConfig.supabaseUrl}/rest/v1/cadastros",
                    json = json,
                    body = insertPayload,
                ) {
                    applyAuthHeaders(session)
                    header("Prefer", "return=representation")
                }
            } catch (throwable: Throwable) {
                if (!isDuplicateDraftConstraintError(throwable)) throw throwable

                val existingAfterConflict = when {
                    tipoCadastro == "inclusao_dependente" && responsavelCpf.isNotBlank() -> {
                        findPendingInclusaoByResponsavelCpf(
                            session = session,
                            profileId = profileId,
                            responsavelCpfDigits = responsavelCpf,
                        )
                    }
                    cpf.isNotBlank() -> {
                        resolvePendingCadastroConflictByCpf(
                            session = session,
                            currentUserId = profileId,
                            cpfDigits = cpf,
                        )
                    }
                    else -> null
                }

                if (existingAfterConflict != null) {
                    return fetchCadastroDetalhe(session, existingAfterConflict.id)
                }
                throw throwable
            }

            val insertedId = insertedRows.firstOrNull()?.id
                ?: throw IllegalStateException("Falha ao criar rascunho.")
            fetchCadastroDetalhe(session, insertedId)
        }
    }

    suspend fun deleteCadastro(session: SavedSession, id: String) {
        client.safeDelete<JsonElement>(
            url = "${AppConfig.supabaseUrl}/rest/v1/cadastros?id=eq.$id",
            json = json,
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun deleteCadastroLogico(
        session: SavedSession,
        cadastroId: String,
        motivoExclusao: String,
    ): JsonElement {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/excluir-cadastro",
            json = json,
            body = buildJsonObject {
                put("cadastroId", cadastroId)
                put("motivoExclusao", motivoExclusao)
            },
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun uploadTempFile(
        session: SavedSession,
        userId: String,
        fileName: String,
        mimeType: String,
        bytes: ByteArray,
        prefix: String = "",
    ): UploadedTempFile {
        val maxErpAttachmentBytes = 5 * 1024 * 1024
        if (bytes.size > maxErpAttachmentBytes) {
            throw IllegalArgumentException(
                "O anexo excede o limite de 5 MB aceito pelo ERP. Reduza o arquivo antes de continuar.",
            )
        }
        val sanitizedName = fileName
            .replace(Regex("[^a-zA-Z0-9._-]"), "_")
            .lowercase()
        val finalName = "${System.currentTimeMillis()}_$sanitizedName"
        val path = if (prefix.isBlank()) "$userId/$finalName" else "$userId/$prefix/$finalName"

        client.safePutBytes(
            url = "${AppConfig.supabaseUrl}/storage/v1/object/cadastros-temp-files/$path",
            json = json,
            bytes = bytes,
            contentTypeValue = mimeType,
        ) {
            applyAuthHeaders(session)
            header("x-upsert", "false")
        }

        return UploadedTempFile(
            nome = fileName,
            path = path,
            mime = mimeType,
            size = bytes.size.toLong(),
        )
    }

    suspend fun deleteTempFile(session: SavedSession, path: String) {
        client.safeDelete<JsonElement>(
            url = "${AppConfig.supabaseUrl}/storage/v1/object/cadastros-temp-files/$path",
            json = json,
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun downloadTempFile(session: SavedSession, path: String): ByteArray {
        val normalizedPath = path.trim().removePrefix("/")
        if (normalizedPath.isBlank()) throw IllegalStateException("Arquivo nao informado para visualizacao.")
        return client.safeGet(
            url = "${AppConfig.supabaseUrl}/storage/v1/object/cadastros-temp-files/$normalizedPath",
            json = json,
        ) {
            applyAuthHeaders(session)
            header(HttpHeaders.Accept, "*/*")
        }
    }

    private suspend fun validateCadastroReady(cadastro: CadastroDetalhe, config: CadastroConfig?) {
        if (cadastro.nome.isNullOrBlank()) throw IllegalStateException("Cadastro sem nome.")
        if (cadastro.dataNascimento.isNullOrBlank()) throw IllegalStateException("Cadastro sem data de nascimento.")
        if ((cadastro.empresaId ?: cadastro.empresaCodigo) == null) throw IllegalStateException("Selecione uma empresa antes de enviar.")
        if (config?.exigirArquivo == true && cadastro.arquivoPath.isNullOrBlank()) {
            throw IllegalStateException("Anexo obrigatorio. Selecione um arquivo antes de finalizar.")
        }
        validateEnderecoCepForErp(cadastro.endereco)
        if (cadastro.empresaExigeMatricula == 1 && cadastro.numeroMatricula.isNullOrBlank()) {
            throw IllegalStateException("Matricula obrigatoria para esta empresa.")
        }
        val dependentes = CadastroPayloadBuilder.detailDependentes(json, cadastro, 0)
        if (dependentes.isEmpty()) {
            throw IllegalStateException("Cadastro sem dependentes validos para envio.")
        }
        dependentes.forEachIndexed { index, dependente ->
            if (dependente.plano <= 0) {
                val alvo = if (index == 0) "titular" else "dependente ${index + 1}"
                throw IllegalStateException("Selecione um plano valido para $alvo antes de enviar.")
            }
        }
        if (config?.exigirArquivo == true && cadastro.arquivoPath.isNullOrBlank()) {
            Log.w(logTag, "validateCadastroReady arquivo ausente id=${cadastro.id} exigirArquivo=true")
            throw IllegalStateException("Esta configuracao exige arquivo anexado antes do envio.")
        }
    }

    private suspend fun processDocumentoUpload(
        session: SavedSession,
        cadastro: CadastroDetalhe,
        funcionarioCadastroId: Int,
        dependenteId: Int,
    ) {
        client.safePost<JsonElement>(
            url = "${AppConfig.supabaseUrl}/functions/v1/erp-enqueue-upload",
            json = json,
            body = buildJsonObject {
                put("cadastroId", cadastro.id)
                put("idFuncionario", funcionarioCadastroId)
                put("idDependente", dependenteId)
                put("arquivoPath", cadastro.arquivoPath)
                put("arquivoNome", cadastro.arquivoNome ?: cadastro.arquivoPath?.substringAfterLast('/'))
                put("tipo", "titular")
            },
        ) {
            applyAuthHeaders(session)
        }
    }

    private suspend fun enviarParaErp(
        session: SavedSession,
        cadastroId: String,
        payload: JsonObject,
    ): JsonElement {
        val idempotencyKey = buildCadastroSendIdempotencyKey(cadastroId, payload)
        val response: JsonElement = client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/erp-novo-usuario2",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("X-Idempotency-Key", idempotencyKey)
            header("X-Cadastro-Id", cadastroId)
        }

        if (response is JsonObject && response["error"] != null) {
            syncCadastroAfterSendSafely(session, cadastroId, payload, response, false)
            val mensagem = response["error"]?.jsonPrimitive?.content
                ?: "Erro ao enviar cadastro para o ERP."
            throw IllegalStateException(mensagem)
        }

        val dados = response.jsonObject["data"]?.jsonObject?.get("dados")
        if (dados == null || dados is JsonPrimitive && dados.content == "null") {
            syncCadastroAfterSendSafely(session, cadastroId, payload, response, false)
            throw IllegalStateException("ERP nao retornou dados validos para o cadastro.")
        }

        syncCadastroAfterSendSafely(session, cadastroId, payload, response, true)
        return response
    }

    private fun buildCadastroSendIdempotencyKey(
        cadastroId: String,
        payload: JsonObject,
    ): String {
        val hashBytes = MessageDigest
            .getInstance("SHA-256")
            .digest(payload.toString().toByteArray(Charsets.UTF_8))
        val hashHex = hashBytes.joinToString("") { byte -> "%02x".format(byte) }
        return "cadastro:$cadastroId:$hashHex"
    }

    private suspend fun syncCadastroAfterSend(
        session: SavedSession,
        cadastroId: String,
        payload: JsonElement,
        response: JsonElement,
        success: Boolean,
    ) {
        val statusPersistido = if (success) {
            // NovoUsuario2 confirmed the remote transaction. Attachment delivery
            // is independent and must not reopen this adhesion.
            "enviado"
        } else {
            val statusAtual = runCatching {
                getList<CadastroStatusRow>(
                    path = "cadastros",
                    session = session,
                    query = {
                        parameter("id", "eq.$cadastroId")
                        parameter("select", "status")
                        parameter("limit", 1)
                    },
                ).firstOrNull()?.status?.trim()?.lowercase(Locale.ROOT)
            }.getOrNull()

            // Evita rebaixar para "incompleto" um cadastro que já foi enviado com sucesso.
            if (statusAtual == "enviado") "enviado" else "incompleto"
        }

        val cpfFromPayload = extractCpfFromErpPayload(payload)
        val cpfFromCadastro = runCatching {
            fetchCadastroDetalhe(session, cadastroId).cpf
                ?.filter(Char::isDigit)
                ?.takeIf { it.length == 11 }
        }.getOrNull()
        val cpfForSync = cpfFromPayload ?: cpfFromCadastro

        val body = buildJsonObject {
            put("status", statusPersistido)
            put("payload_erp", payload)
            put("erp_response", response)
            put("tipo_cadastro", "cadastro")
            if (success) {
                put("motivo_bloqueio", JsonNull)
            }
            cpfForSync?.let { put("cpf", it) }
            put("created_by", session.userId)
        }

        Log.i(
            logTag,
            "syncCadastroAfterSend patch cadastroId=$cadastroId status=$statusPersistido cpf=${maskCpfForLog(cpfForSync)} hasPayload=${payload is JsonObject || payload is JsonArray} hasResponse=${response is JsonObject || response is JsonArray}",
        )
        patchCadastroById(session, cadastroId, body)
        Log.i(
            logTag,
            "syncCadastroAfterSend patch success cadastroId=$cadastroId status=$statusPersistido cpf=${maskCpfForLog(cpfForSync)}",
        )
    }

    private suspend fun syncCadastroAfterSendSafely(
        session: SavedSession,
        cadastroId: String,
        payload: JsonElement,
        response: JsonElement,
        success: Boolean,
    ) {
        val result = runCatching {
            syncCadastroAfterSend(
                session = session,
                cadastroId = cadastroId,
                payload = payload,
                response = response,
                success = success,
            )
        }
        if (result.isSuccess) return

        val throwable = result.exceptionOrNull() ?: return
        if (success) {
            val fallback = runCatching {
                markCadastroAsEnviado(
                    session = session,
                    cadastroId = cadastroId,
                    payload = payload,
                    response = response,
                )
            }
            if (fallback.isSuccess) {
                Log.w(
                    logTag,
                    "syncCadastroAfterSend usou fallback minimo para manter ERP confirmado como enviado id=$cadastroId",
                    throwable,
                )
            } else {
                Log.e(
                    logTag,
                    "ERP confirmou cadastro $cadastroId, mas a reconciliacao local falhou. O erro nao sera propagado para evitar reenvio duplicado.",
                    fallback.exceptionOrNull(),
                )
            }
            return
        }

        if (!isDuplicateDraftConstraintError(throwable)) throw throwable

        val cpfDigits = extractCpfFromErpPayload(payload)
            ?: runCatching { fetchCadastroDetalhe(session, cadastroId).cpf }.getOrNull()
                ?.let(::normalizeCpfDigits)
        if (cpfDigits.isNullOrBlank()) {
            Log.w(
                logTag,
                "syncCadastroAfterSend detected duplicate conflict sem cpf para reconciliar automaticamente id=$cadastroId success=$success",
                throwable,
            )
            return
        }
        Log.w(
            logTag,
            "syncCadastroAfterSend detected duplicate conflict; automatic reconciliation disabled id=$cadastroId cpf=$cpfDigits success=$success",
            throwable,
        )
        if (success) throw throwable
    }

    private suspend fun markCadastroWaitingForAttachment(
        session: SavedSession,
        cadastroId: String,
        payload: JsonElement,
        response: JsonElement,
    ) {
        patchCadastroById(
            session = session,
            id = cadastroId,
            payload = buildJsonObject {
                put("status", "incompleto")
                put("payload_erp", payload)
                put("erp_response", response)
                put("motivo_bloqueio", "Aguardando envio do anexo ao ERP.")
            },
        )
    }

    private suspend fun markCadastroAsEnviado(
        session: SavedSession,
        cadastroId: String,
        payload: JsonElement,
        response: JsonElement,
    ) {
        patchCadastroById(
            session = session,
            id = cadastroId,
            payload = buildJsonObject {
                put("status", "enviado")
                put("payload_erp", payload)
                put("erp_response", response)
            },
        )
    }

    private fun extractCpfFromErpPayload(payload: JsonElement): String? {
        val root = runCatching { payload.jsonObject }.getOrNull() ?: return null
        val dados = runCatching { root["dados"]?.jsonObject }.getOrNull()

        val cpfResponsavel = runCatching {
            dados
                ?.get("responsavelFinanceiro")
                ?.jsonObject
                ?.get("cpf")
                ?.jsonPrimitive
                ?.contentOrNull
                ?.filter(Char::isDigit)
                ?.takeIf { it.length == 11 }
        }.getOrNull()
        if (!cpfResponsavel.isNullOrBlank()) return cpfResponsavel

        val cpfDependente = runCatching {
            dados
                ?.get("dependente")
                ?.jsonArray
                ?.firstOrNull()
                ?.jsonObject
                ?.get("cpf")
                ?.jsonPrimitive
                ?.contentOrNull
                ?.filter(Char::isDigit)
                ?.takeIf { it.length == 11 }
        }.getOrNull()

        return cpfDependente
    }

    private fun maskCpfForLog(cpf: String?): String {
        val digits = cpf?.filter(Char::isDigit).orEmpty()
        if (digits.length != 11) return "-"
        return "***${digits.takeLast(4)}"
    }

    private suspend fun createOrUpdateRascunho(
        session: SavedSession,
        profile: MobileProfile,
        payload: JsonObject,
    ): CadastroDetalhe {
        val profileId = ensureProfileReadyForCadastroInsert(session, profile)
        val cpfPayload = payload["cpf"]
            ?.jsonPrimitive
            ?.contentOrNull
            ?.filter(Char::isDigit)
            .orEmpty()
        val existing = resolvePendingCadastroConflictByCpf(
            session = session,
            currentUserId = profileId,
            cpfDigits = cpfPayload,
        )

        return if (existing != null) {
            val updatePayload = buildJsonObject {
                payload.forEach { (key, value) -> put(key, value) }
                put("tipo_cadastro", "cadastro")
                put("status", "incompleto")
                put("created_by", profileId)
                profile.teamId?.let { put("team_id", it) }
            }
            client.safePost<List<CadastroDetalhe>>(
                url = "${AppConfig.supabaseUrl}/rest/v1/cadastros?id=eq.${existing.id}",
                json = json,
                body = updatePayload,
            ) {
                applyAuthHeaders(session)
                header("Prefer", "return=representation")
                method = io.ktor.http.HttpMethod.Patch
                contentType(ContentType.Application.Json)
            }.firstOrNull() ?: fetchCadastroDetalhe(session, existing.id)
        } else {
            val insertPayload = buildJsonObject {
                payload.forEach { (key, value) -> put(key, value) }
                put("tipo_cadastro", "cadastro")
                put("status", "incompleto")
                put("created_by", profileId)
                profile.teamId?.let { put("team_id", it) }
            }

            val insertedRows = try {
                client.safePost<List<CadastroDetalhe>>(
                    url = "${AppConfig.supabaseUrl}/rest/v1/cadastros",
                    json = json,
                    body = insertPayload,
                ) {
                    applyAuthHeaders(session)
                    header("Prefer", "return=representation")
                }
            } catch (throwable: Throwable) {
                if (!isDuplicateDraftConstraintError(throwable)) throw throwable

                val existingAfterConflict = resolvePendingCadastroConflictByCpf(
                    session = session,
                    currentUserId = profileId,
                    cpfDigits = cpfPayload,
                )

                if (existingAfterConflict != null) {
                    return fetchCadastroDetalhe(session, existingAfterConflict.id)
                }
                throw throwable
            }

            insertedRows.firstOrNull() ?: throw IllegalStateException("Falha ao criar rascunho.")
        }
    }

    private suspend fun ensureProfileReadyForCadastroInsert(
        session: SavedSession,
        profile: MobileProfile,
    ): String {
        val profileId = profile.id.trim()
        if (profileId.isBlank()) {
            throw IllegalStateException("Sua sessão expirou. Faça login novamente para continuar.")
        }

        val exists = getList<CadastroIdRow>(
            path = "profiles",
            session = session,
            query = {
                parameter("id", "eq.$profileId")
                parameter("select", "id")
                parameter("limit", 1)
            },
        ).firstOrNull() != null

        if (!exists) {
            throw IllegalStateException("Sua sessão expirou. Faça login novamente para continuar.")
        }
        return profileId
    }

    private suspend fun checkCpfExistente(
        session: SavedSession,
        userId: String,
        cpf: String,
    ): CheckCpfExistenteResponse {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/rest/v1/rpc/check_cpf_existente",
            json = json,
            body = buildJsonObject {
                put("p_cpf", cpf)
                put("p_user_id", userId)
            },
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun canUseLemmit(session: SavedSession, userId: String): Boolean {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/rest/v1/rpc/can_use_lemmit",
            json = json,
            body = buildJsonObject { put("p_user_id", userId) },
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun fetchLemmitLimitInfo(session: SavedSession, userId: String): List<LemmitLimitInfo> {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/rest/v1/rpc/get_lemmit_limit_info",
            json = json,
            body = buildJsonObject { put("p_user_id", userId) },
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun consultarCpfLemmit(session: SavedSession, cpf: String): LemmitResponse {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/lemit-consulta-pessoa",
            json = json,
            body = buildJsonObject { put("cpf", cpf) },
        ) {
            applyAuthHeaders(session)
        }
    }

    private suspend fun consultarEnderecoCep(session: SavedSession, cep: String): JsonElement {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/erp-endereco-cep",
            json = json,
            body = buildJsonObject { put("cep", CadastroPayloadBuilder.normalizeDigits(cep)) },
        ) {
            applyAuthHeaders(session)
        }
    }

    suspend fun consultarEnderecoPorCep(session: SavedSession, cep: String): CadastroEndereco {
        val cepNormalizado = CadastroPayloadBuilder.normalizeDigits(cep).take(8)
        if (cepNormalizado.length != 8) {
            throw IllegalStateException("CEP invalido. Informe os 8 digitos.")
        }

        val response = consultarEnderecoCep(session, cepNormalizado)
        val root = runCatching { response.jsonObject }.getOrNull()
        val explicitError = root?.get("error")?.jsonPrimitive?.contentOrNull
            ?: root?.get("message")?.jsonPrimitive?.contentOrNull
        if (!explicitError.isNullOrBlank()) {
            throw IllegalStateException(explicitError)
        }

        val enderecoParseado = parseCadastroEnderecoFlex(response)
        val endereco = enderecoParseado?.copy(
            cep = enderecoParseado.cep.ifBlank { cepNormalizado },
        )
        if (!hasEnderecoData(endereco)) {
            throw IllegalStateException("CEP nao encontrado.")
        }
        return endereco ?: throw IllegalStateException("CEP nao encontrado.")
    }

    suspend fun buscarResponsaveisFinanceiros(
        session: SavedSession,
        tipoBusca: InclusaoBuscaTipo,
        valor: String,
    ): List<ResponsavelFinanceiroResumo> {
        val payload = buildJsonObject {
            when (tipoBusca) {
                InclusaoBuscaTipo.CODIGO -> put("codigoAssociado", valor.trim())
                InclusaoBuscaTipo.CPF -> put("cpf", CadastroPayloadBuilder.normalizeDigits(valor))
            }
        }

        val result: JsonElement = client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/erp-check-associado",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
        }

        val root = result.jsonObject
        val explicitError = root["error"]?.jsonPrimitive?.contentOrNull
            ?: root["message"]?.jsonPrimitive?.contentOrNull
        if (!explicitError.isNullOrBlank()) {
            throw IllegalStateException(explicitError)
        }

        val dados = extractAssociadosArray(root)
        if (dados.isEmpty()) {
            val dadosObj = runCatching { root["dados"]?.jsonObject }.getOrNull()
            val nestedError = dadosObj
                ?.get("error")
                ?.jsonPrimitive
                ?.contentOrNull
                ?: dadosObj
                    ?.get("message")
                    ?.jsonPrimitive
                    ?.contentOrNull
            if (!nestedError.isNullOrBlank()) {
                throw IllegalStateException(nestedError)
            }
        }
        return dados.map { item ->
            val associado = item.jsonObject
            val dependentesRaw = associado["dependentes"]?.jsonArray ?: emptyList<JsonElement>()
            ResponsavelFinanceiroResumo(
                codigo = associado["codigo"]?.jsonPrimitive?.intOrNull ?: 0,
                codigoEmpresa = associado["codigoDaEmpresa"]?.jsonPrimitive?.intOrNull ?: 0,
                nome = associado["nome"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                cpf = associado["cpf"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                empresa = associado["nomeFantasiaDaEmpresa"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                dependentes = dependentesRaw.map { dependenteElement ->
                    val dependente = dependenteElement.jsonObject
                    ResponsavelDependenteResumo(
                        codigoDependente = dependente["codigoDependente"]?.jsonPrimitive?.intOrNull ?: 0,
                        numeroCpfDependente = dependente["numeroCpfDependente"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                        codigoPlano = dependente["codigoPlano"]?.jsonPrimitive?.intOrNull ?: 0,
                        nomeSituacao = dependente["nomeSituacao"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                        codigoSituacao = dependente["codigoSituacao"]?.jsonPrimitive?.intOrNull ?: 0,
                    )
                },
            )
        }
    }

    private fun extractAssociadosArray(root: JsonObject): JsonArray {
        val dadosElement = root["dados"] ?: return buildJsonArray {}
        if (dadosElement is JsonArray) return dadosElement

        val dadosObject = runCatching { dadosElement.jsonObject }.getOrNull() ?: return buildJsonArray {}
        dadosObject["dados"]?.let { nested ->
            if (nested is JsonArray) return nested
        }
        dadosObject["associados"]?.let { nested ->
            if (nested is JsonArray) return nested
        }
        dadosObject["items"]?.let { nested ->
            if (nested is JsonArray) return nested
        }

        return buildJsonArray { add(dadosObject) }
    }

    suspend fun uploadDependenteDocumento(
        session: SavedSession,
        idFuncionario: Int,
        idDependente: Int,
        arquivoPath: String,
        arquivoNome: String,
        bucket: String = "cadastros-temp-files",
    ): Boolean {
        val response: JsonElement = client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/erp-upload-documento",
            json = json,
            body = buildJsonObject {
                put("idFuncionario", idFuncionario)
                put("idDependente", idDependente)
                put("arquivoPath", arquivoPath)
                put("arquivoNome", arquivoNome)
                put("bucket", bucket)
            },
        ) {
            applyAuthHeaders(session)
        }

        return response
            .jsonObject["success"]
            ?.jsonPrimitive
            ?.booleanOrNull == true
    }

    suspend fun enqueueDependenteUpload(
        session: SavedSession,
        cadastroId: String?,
        idFuncionario: Int,
        idDependente: Int,
        arquivoPath: String,
        arquivoNome: String,
        tipo: String = "dependente",
        bucket: String = "cadastros-temp-files",
    ): Boolean {
        val response: JsonElement = client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/erp-enqueue-upload",
            json = json,
            body = buildJsonObject {
                if (!cadastroId.isNullOrBlank()) {
                    put("cadastroId", cadastroId)
                } else {
                    put("cadastroId", JsonNull)
                }
                put("idFuncionario", idFuncionario)
                put("idDependente", idDependente)
                put("arquivoPath", arquivoPath)
                put("arquivoNome", arquivoNome)
                put("tipo", tipo)
                put("bucket", bucket)
            },
        ) {
            applyAuthHeaders(session)
        }

        return response
            .jsonObject["queued"]
            ?.jsonPrimitive
            ?.booleanOrNull == true
    }

    suspend fun enviarInclusaoDependente(
        session: SavedSession,
        payload: JsonObject,
        cadastroId: String? = null,
    ): JsonElement {
        val idempotencyKey = buildInclusaoDependenteIdempotencyKey(cadastroId, payload)
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/erp-novo-dependente",
            json = json,
            body = payload,
        ) {
            applyAuthHeaders(session)
            header("X-Idempotency-Key", idempotencyKey)
            if (!cadastroId.isNullOrBlank()) {
                header("X-Cadastro-Id", cadastroId)
            }
        }
    }

    private fun buildInclusaoDependenteIdempotencyKey(
        cadastroId: String?,
        payload: JsonObject,
    ): String {
        val cadastroPart = cadastroId?.trim()?.ifBlank { "sem-cadastro" } ?: "sem-cadastro"
        val hashBytes = MessageDigest
            .getInstance("SHA-256")
            .digest(payload.toString().toByteArray(Charsets.UTF_8))
        val hashHex = hashBytes.joinToString("") { byte -> "%02x".format(byte) }
        return "inclusao-dependente:$cadastroPart:$hashHex"
    }

    suspend fun closeDuplicateInclusaoPendentes(
        session: SavedSession,
        profileId: String,
        responsavelCpf: String,
        keepCadastroId: String,
        erpResponse: JsonElement,
    ) {
        val cpfDigits = responsavelCpf.filter(Char::isDigit).take(11)
        if (cpfDigits.length != 11) return

        val pendentes = getList<CadastroInclusaoLookupRow>(
            path = "cadastros",
            session = session,
            query = {
                parameter("tipo_cadastro", "eq.inclusao_dependente")
                parameter("status", pendingCadastroStatusQueryValue())
                parameter("created_by", "eq.$profileId")
                parameter("select", "id,responsavel_financeiro_cpf")
                parameter("order", "updated_at.desc")
                parameter("limit", 100)
            },
        )

        pendentes.forEach { item ->
            if (item.id == keepCadastroId) return@forEach
            val itemCpf = item.responsavelFinanceiroCpf?.filter(Char::isDigit).orEmpty()
            if (itemCpf != cpfDigits) return@forEach

            runCatching {
                patchCadastroById(
                    session = session,
                    id = item.id,
                    payload = buildJsonObject {
                        put("status", "enviado")
                        put("tipo_cadastro", "inclusao_dependente")
                        put("erp_response", erpResponse)
                    },
                )
            }.onFailure { throwable ->
                Log.w(logTag, "Falha ao encerrar pendente duplicado de inclusao id=${item.id}", throwable)
            }
        }
    }

    suspend fun resolvePublicCadastroLink(token: String, visitId: String): PublicCadastroLinkResolveResponse {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/cadastro-link-resolve",
            json = json,
            body = buildJsonObject {
                put("token", token.trim())
                put("visitId", visitId)
            },
        )
    }

    suspend fun authenticatePublicCadastro(
        token: String,
        cpf: String,
        birthDate: String,
        captchaToken: String? = null,
    ): PublicCadastroAuthenticateResponse {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/cadastro-public-authenticate",
            json = json,
            body = buildJsonObject {
                put("token", token.trim())
                put("cpf", CadastroPayloadBuilder.normalizeDigits(cpf))
                put("birthDate", birthDate.trim())
                captchaToken?.trim()?.takeIf { it.isNotBlank() }?.let { put("captchaToken", it) }
            },
        )
    }

    suspend fun consultarEnderecoPorCepPublicSecure(
        attemptToken: String,
        cep: String,
    ): PublicCadastroCepResponse {
        val normalizedCep = CadastroPayloadBuilder.normalizeDigits(cep).take(8)
        if (normalizedCep.length != 8) {
            throw IllegalStateException("CEP invalido. Informe os 8 digitos.")
        }
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/cadastro-public-cep",
            json = json,
            body = buildJsonObject {
                put("attemptToken", attemptToken.trim())
                put("cep", normalizedCep)
            },
        )
    }

    suspend fun lookupPublicDependent(
        attemptToken: String,
        cpf: String,
    ): PublicCadastroDependentLookupResponse {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/cadastro-public-dependent-lookup",
            json = json,
            body = buildJsonObject {
                put("attemptToken", attemptToken.trim())
                put("cpf", CadastroPayloadBuilder.normalizeDigits(cpf))
            },
        )
    }

    suspend fun preparePublicContract(
        attemptToken: String,
        confirmedEmail: String,
        cadastro: PublicCadastroContractPayload,
    ): PublicCadastroContractPrepareResponse {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/cadastro-public-contract-prepare",
            json = json,
            body = buildJsonObject {
                put("attemptToken", attemptToken.trim())
                put("confirmedEmail", confirmedEmail.trim().lowercase(Locale.ROOT))
                put(
                    "cadastro",
                    json.encodeToJsonElement(PublicCadastroContractPayload.serializer(), cadastro),
                )
            },
        )
    }

    suspend fun submitPublicCadastroSecure(
        attemptToken: String,
        contractToken: String,
        acceptedTerms: Boolean,
        acceptedData: Boolean,
        acceptedCoverage: Boolean,
    ): PublicCadastroSubmitResponse {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/cadastro-public-submit",
            json = json,
            body = buildJsonObject {
                put("attemptToken", attemptToken.trim())
                put("contractToken", contractToken.trim())
                put("acceptedTerms", acceptedTerms)
                put("acceptedData", acceptedData)
                put("acceptedCoverage", acceptedCoverage)
            },
        )
    }

    suspend fun checkPublicCadastroCpf(token: String, cpf: String): PublicCadastroCheckCpfResponse {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/cadastro-link-check-cpf",
            json = json,
            body = buildJsonObject {
                put("token", token.trim())
                put("cpf", CadastroPayloadBuilder.normalizeDigits(cpf))
            },
        )
    }

    suspend fun submitPublicCadastro(
        token: String,
        cadastro: PublicCadastroPayload,
        idempotencyKey: String? = null,
    ): PublicCadastroSubmitResponse {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/cadastro-public-submit",
            json = json,
            body = buildJsonObject {
                put("token", token.trim())
                put("cadastro", json.encodeToJsonElement(PublicCadastroPayload.serializer(), cadastro))
            },
        ) {
            idempotencyKey
                ?.trim()
                ?.takeIf { it.isNotBlank() }
                ?.let { header("X-Idempotency-Key", it) }
        }
    }

    suspend fun consultarEnderecoPorCepPublic(cep: String): CadastroEndereco {
        val cepNormalizado = CadastroPayloadBuilder.normalizeDigits(cep).take(8)
        if (cepNormalizado.length != 8) {
            throw IllegalStateException("CEP invalido. Informe os 8 digitos.")
        }
        val response: JsonElement = client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/erp-endereco-cep",
            json = json,
            body = buildJsonObject { put("cep", cepNormalizado) },
        )
        val root = runCatching { response.jsonObject }.getOrNull()
        val explicitError = root?.get("error")?.jsonPrimitive?.contentOrNull
            ?: root?.get("message")?.jsonPrimitive?.contentOrNull
        if (!explicitError.isNullOrBlank()) throw IllegalStateException(explicitError)
        val parsed = parseCadastroEnderecoFlex(response)?.copy(
            cep = parseCadastroEnderecoFlex(response)?.cep?.ifBlank { cepNormalizado } ?: cepNormalizado,
        )
        if (!hasEnderecoData(parsed)) throw IllegalStateException("CEP nao encontrado.")
        return parsed ?: throw IllegalStateException("CEP nao encontrado.")
    }

    private suspend fun checkErpAssociado(session: SavedSession, cpf: String): ErpAssociadoResponse {
        return client.safePost(
            url = "${AppConfig.supabaseUrl}/functions/v1/erp-check-associado",
            json = json,
            body = buildJsonObject { put("cpf", cpf) },
        ) {
            applyAuthHeaders(session)
        }
    }

    private suspend fun findClienteByCpf(session: SavedSession, cpf: String): ClienteAnterior? {
        val cadastro = getList<ClienteLookupRow>(
            path = "cadastros",
            session = session,
            query = {
                parameter("cpf", "eq.$cpf")
                parameter("erp_dados_associado", "not.is.null")
                parameter("order", "created_at.desc")
                parameter(
                    "select",
                    "id,nome,nome_mae,data_nascimento,sexo_codigo,contatos,endereco,erp_dados_associado,created_at,updated_at"
                )
                parameter("limit", 1)
            },
        ).firstOrNull() ?: return null

        val contatosDecodificados = runCatching {
            json.decodeFromJsonElement(ListSerializerCache.contatos, cadastro.contatos ?: buildJsonArray {})
        }.getOrDefault(emptyList())
        val contatos = contatosDecodificados
            .ifEmpty { parseCadastroContatosFlex(cadastro.contatos) }
            .ifEmpty { parseContatoFromErpAssociado(cadastro.erpDadosAssociado) }
            .let { contatosList ->
                if (contatosList.none { it.principal } && contatosList.isNotEmpty()) {
                    contatosList.mapIndexed { index, contato -> contato.copy(principal = index == 0) }
                } else {
                    contatosList
                }
            }
        val endereco = parseCadastroEnderecoFlex(cadastro.endereco)

        val erpDados = cadastro.erpDadosAssociado?.jsonObject?.get("dados")?.jsonArray ?: return null
        val associados = runCatching {
            json.decodeFromJsonElement(ListSerializerCache.erpAssociados, erpDados)
        }.getOrDefault(emptyList())

        val maisRecente = associados
            .flatMap { associado ->
                associado.dependentes.map { dependente -> associado to dependente }
            }
            .sortedByDescending { (_, dependente) -> dependente.dataSituacao.orEmpty() }
            .firstOrNull()

        val associado = maisRecente?.first ?: associados.firstOrNull() ?: return null
        val dependente = maisRecente?.second ?: associado.dependentes.firstOrNull()

        return ClienteAnterior(
            nome = associado.nome.orEmpty().ifBlank { cadastro.nome.orEmpty() },
            nomeMae = cadastro.nomeMae,
            dataNascimento = dependente?.dataNascimento ?: cadastro.dataNascimento.orEmpty(),
            sexo = when (cadastro.sexoCodigo) {
                1 -> "M"
                0 -> "F"
                else -> ""
            },
            sexoCodigo = cadastro.sexoCodigo ?: 0,
            contatos = contatos,
            endereco = endereco,
        )
    }

    private fun resolveVendedorData(
        profile: MobileProfile,
        input: CpfConsultInput,
    ): Map<String, String> {
        return when {
            profile.role == "VENDEDOR" && !profile.externalId.isNullOrBlank() -> mapOf(
                "vendedor_id" to profile.id,
                "vendedor_codigo" to profile.externalId,
                "vendedor_nome" to profile.name,
            )
            input.vendedorSelecionado != null -> mapOf(
                "vendedor_id" to input.vendedorSelecionado.id,
                "vendedor_codigo" to input.vendedorSelecionado.externalId.orEmpty(),
                "vendedor_nome" to input.vendedorSelecionado.name,
            )
            else -> emptyMap()
        }
    }

    private fun resolveAdesionistaData(
        profile: MobileProfile,
        input: CpfConsultInput,
    ): Map<String, String> {
        val adesionista = input.adesionistaSelecionado ?: when {
            profile.role == "ADESIONISTA" -> TeamMemberOption(
                id = profile.id,
                name = profile.name,
                email = profile.email,
                externalId = profile.externalId,
            )
            profile.role == "ADMINISTRADOR" && !profile.externalId.isNullOrBlank() -> TeamMemberOption(
                id = profile.id,
                name = profile.name,
                email = profile.email,
                externalId = profile.externalId,
            )
            else -> null
        }

        return adesionista?.externalId?.takeIf { it.isNotBlank() }?.let {
            mapOf(
                "adesionista_id" to adesionista.id,
                "adesionista_codigo" to it,
                "adesionista_nome" to adesionista.name,
            )
        } ?: emptyMap()
    }

    private fun buildPublicAdesaoUrl(token: String): String {
        val base = AppConfig.publicAppUrl.trim().removeSuffix("/")
        if (base.isBlank()) {
            throw IllegalStateException("PUBLIC_APP_URL nao configurada para gerar links.")
        }
        return "$base/adesao/$token"
    }

    private suspend inline fun <reified T> getList(
        path: String,
        session: SavedSession,
        noinline query: io.ktor.client.request.HttpRequestBuilder.() -> Unit,
    ): List<T> {
        return client.safeGet(
            url = "${AppConfig.supabaseUrl}/rest/v1/$path",
            json = json,
        ) {
            applyAuthHeaders(session)
            query()
        }
    }
}

private data class ClienteAnterior(
    val nome: String,
    val nomeMae: String?,
    val dataNascimento: String,
    val sexo: String,
    val sexoCodigo: Int,
    val contatos: List<CadastroContato>,
    val endereco: br.com.vendamais.mobile.data.models.CadastroEndereco?,
)

data class UploadedTempFile(
    val nome: String,
    val path: String,
    val mime: String,
    val size: Long,
)

class CadastroExistenteException(
    val cadastroId: String?,
    val empresaNome: String?,
    val canContinue: Boolean,
    message: String,
) : IllegalStateException(message)

enum class InclusaoBuscaTipo {
    CODIGO,
    CPF,
}

data class ResponsavelDependenteResumo(
    val codigoDependente: Int,
    val numeroCpfDependente: String,
    val codigoPlano: Int,
    val nomeSituacao: String,
    val codigoSituacao: Int,
)

data class ResponsavelFinanceiroResumo(
    val codigo: Int,
    val codigoEmpresa: Int,
    val nome: String,
    val cpf: String,
    val empresa: String,
    val dependentes: List<ResponsavelDependenteResumo> = emptyList(),
)

internal data class MatriculaReconciliationResult(
    val numeroMatricula: String?,
    val shouldPersist: Boolean,
)

internal fun reconcileNumeroMatriculaForSend(
    empresaExigeMatricula: Int?,
    persistedNumeroMatricula: String?,
    hintedNumeroMatricula: String?,
): MatriculaReconciliationResult {
    val persistedNormalized = persistedNumeroMatricula
        ?.trim()
        ?.takeIf { it.isNotBlank() }
    val hintedNormalized = hintedNumeroMatricula
        ?.trim()
        ?.takeIf { it.isNotBlank() }

    if (empresaExigeMatricula != 1) {
        return MatriculaReconciliationResult(
            numeroMatricula = hintedNormalized ?: persistedNormalized,
            shouldPersist = false,
        )
    }

    val numeroMatricula = hintedNormalized ?: persistedNormalized
    return MatriculaReconciliationResult(
        numeroMatricula = numeroMatricula,
        shouldPersist = hintedNormalized != null && hintedNormalized != persistedNormalized,
    )
}

@kotlinx.serialization.Serializable
private data class CadastroIdRow(
    val id: String,
)

@kotlinx.serialization.Serializable
private data class CadastroLinkCadastroRow(
    @kotlinx.serialization.SerialName("origem_link_id")
    val origemLinkId: String? = null,
    val nome: String? = null,
    val dependentes: JsonElement? = null,
)

@kotlinx.serialization.Serializable
private data class CadastroInclusaoLookupRow(
    val id: String,
    @kotlinx.serialization.SerialName("responsavel_financeiro_cpf")
    val responsavelFinanceiroCpf: String? = null,
)

@kotlinx.serialization.Serializable
private data class ClienteLookupRow(
    val id: String,
    val nome: String? = null,
    @kotlinx.serialization.SerialName("nome_mae")
    val nomeMae: String? = null,
    @kotlinx.serialization.SerialName("data_nascimento")
    val dataNascimento: String? = null,
    @kotlinx.serialization.SerialName("sexo_codigo")
    val sexoCodigo: Int? = null,
    val contatos: JsonElement? = null,
    val endereco: JsonElement? = null,
    @kotlinx.serialization.SerialName("erp_dados_associado")
    val erpDadosAssociado: JsonElement? = null,
)

private object CadastroEnderecoSerializerCache {
    val serializer = br.com.vendamais.mobile.data.models.CadastroEndereco.serializer()
}

private object ListSerializerCache {
    val contatos = kotlinx.serialization.builtins.ListSerializer(CadastroContato.serializer())
    val dependentes = kotlinx.serialization.builtins.ListSerializer(br.com.vendamais.mobile.data.models.DependenteCadastro.serializer())
    val erpAssociados = kotlinx.serialization.builtins.ListSerializer(ErpAssociadoItem.serializer())
}

private fun parseCadastroContatosFlex(raw: JsonElement?): List<CadastroContato> {
    val normalized = decodeEmbeddedJsonElement(raw)
    val contatosArray = when (normalized) {
        is kotlinx.serialization.json.JsonArray -> normalized
        is JsonObject -> {
            normalized.jsonArrayFlexible("contatos", "telefones", "items")
                ?: normalized.jsonObjectFlexible("dados", "data")
                    ?.jsonArrayFlexible("contatos", "telefones", "items")
        }
        else -> normalized.asJsonArrayFlexible()
    } ?: return emptyList()

    return contatosArray.mapNotNull { item ->
        val obj = item.asJsonObjectFlexible() ?: return@mapNotNull null
        val tipoRaw = obj.readString("tipo", "tipoContato", "tipo_contato", "kind")
            ?.lowercase(Locale.ROOT)
            ?.trim()
            .orEmpty()
        val valorRaw = obj.readString("valor", "telefone", "numero", "contato", "email", "value")
            ?.trim()
            .orEmpty()
        if (valorRaw.isBlank()) return@mapNotNull null

        val tipo = when (tipoRaw) {
            "cel", "cell", "celular" -> "celular"
            "fixo", "telefone", "residencial" -> "fixo"
            "whatsapp", "zap" -> "whatsapp"
            "email", "e-mail" -> "email"
            else -> if (valorRaw.contains('@')) "email" else "celular"
        }
        val valor = if (tipo == "email") valorRaw else valorRaw.filter(Char::isDigit)
        if (valor.isBlank()) return@mapNotNull null

        val principal = obj["principal"]?.jsonPrimitive?.booleanOrNull
            ?: obj["isPrincipal"]?.jsonPrimitive?.booleanOrNull
            ?: obj["prioritario"]?.jsonPrimitive?.booleanOrNull
            ?: obj["principal"]?.jsonPrimitive?.contentOrNull?.equals("true", ignoreCase = true)
            ?: false

        CadastroContato(tipo = tipo, valor = valor, principal = principal)
    }.distinctBy { "${it.tipo}:${it.valor}" }
}

private fun normalizeContatosForPersist(contatos: List<CadastroContato>): List<CadastroContato> {
    val filtered = contatos.mapNotNull { contato ->
        val tipo = contato.tipo.trim().lowercase(Locale.ROOT)
        val tipoNormalizado = when (tipo) {
            "cel", "cell", "celular" -> "celular"
            "fixo", "telefone", "residencial" -> "fixo"
            "whatsapp", "zap" -> "whatsapp"
            "email", "e-mail" -> "email"
            else -> if (contato.valor.contains('@')) "email" else "celular"
        }
        val valor = if (tipoNormalizado == "email") {
            contato.valor.trim()
        } else {
            contato.valor.filter(Char::isDigit)
        }
        if (valor.isBlank()) return@mapNotNull null
        CadastroContato(
            tipo = tipoNormalizado,
            valor = valor,
            principal = contato.principal,
        )
    }.distinctBy { "${it.tipo}:${it.valor}" }

    if (filtered.isEmpty()) return emptyList()
    return if (filtered.any { it.principal }) {
        filtered
    } else {
        filtered.mapIndexed { index, contato -> contato.copy(principal = index == 0) }
    }
}

private fun parseContatoFromErpAssociado(raw: JsonElement?): List<CadastroContato> {
    val dados = raw.asJsonObjectFlexible()
        ?.jsonArrayFlexible("dados", "data")
        ?: raw.asJsonObjectFlexible()
            ?.jsonObjectFlexible("data", "dados")
            ?.jsonArrayFlexible("dados", "data")
        ?: return emptyList()
    val contatos = mutableListOf<CadastroContato>()

    dados.forEach { item ->
        val obj = item.asJsonObjectFlexible() ?: return@forEach

        contatos += parseCadastroContatosFlex(obj["contatos"])

        addContatoIfPresent(contatos, "celular", obj.readString("celular", "numeroCelular", "telefoneCelular", "celular1"))
        addContatoIfPresent(contatos, "celular", obj.readString("celular2"))
        addContatoIfPresent(contatos, "whatsapp", obj.readString("whatsapp"))
        addContatoIfPresent(contatos, "fixo", obj.readString("telefone", "telefone1", "numeroTelefone", "fone"))
        addContatoIfPresent(contatos, "fixo", obj.readString("telefone2"))
    }

    return contatos
        .filter { it.valor.isNotBlank() }
        .distinctBy { "${it.tipo}:${it.valor}" }
}

private fun addContatoIfPresent(
    contatos: MutableList<CadastroContato>,
    tipo: String,
    rawValue: String?,
) {
    val normalized = rawValue?.filter(Char::isDigit).orEmpty()
    if (normalized.length < 10) return
    contatos += CadastroContato(tipo = tipo, valor = normalized, principal = false)
}

private val cadastroRepositoryJsonParser = Json {
    ignoreUnknownKeys = true
    isLenient = true
}

private fun decodeEmbeddedJsonElement(value: JsonElement?): JsonElement? {
    val current = value ?: return null
    if (current is JsonNull) return null
    if (current !is JsonPrimitive) return current
    val raw = current.contentOrNull?.trim().orEmpty()
    if (raw.isBlank()) return null
    if (!raw.startsWith("{") && !raw.startsWith("[")) return current
    return runCatching { cadastroRepositoryJsonParser.parseToJsonElement(raw) }.getOrNull() ?: current
}

private fun JsonElement?.asJsonObjectFlexible(): JsonObject? {
    val normalized = decodeEmbeddedJsonElement(this)
    return when (normalized) {
        is JsonObject -> normalized
        else -> runCatching { normalized?.jsonObject }.getOrNull()
    }
}

private fun JsonElement?.asJsonArrayFlexible(): kotlinx.serialization.json.JsonArray? {
    val normalized = decodeEmbeddedJsonElement(this)
    return when (normalized) {
        is kotlinx.serialization.json.JsonArray -> normalized
        else -> runCatching { normalized?.jsonArray }.getOrNull()
    }
}

private fun JsonObject.jsonObjectFlexible(vararg keys: String): JsonObject? {
    keys.forEach { key ->
        this[key].asJsonObjectFlexible()?.let { return it }
    }
    return null
}

private fun JsonObject.jsonArrayFlexible(vararg keys: String): kotlinx.serialization.json.JsonArray? {
    keys.forEach { key ->
        this[key].asJsonArrayFlexible()?.let { return it }
    }
    return null
}

private fun JsonObject.hasEnderecoHints(): Boolean {
    return containsKey("cep") ||
        containsKey("CEP") ||
        containsKey("logradouro") ||
        containsKey("Logradouro") ||
        containsKey("bairro") ||
        containsKey("Bairro") ||
        containsKey("cidade") ||
        containsKey("Cidade") ||
        containsKey("municipio") ||
        containsKey("Municipio") ||
        containsKey("uf") ||
        containsKey("Uf") ||
        containsKey("ufSigla") ||
        containsKey("UfSigla")
}

private fun parseCadastroEnderecoFlex(raw: JsonElement?): CadastroEndereco? {
    val root = raw.asJsonObjectFlexible() ?: return null
    val data = root.jsonObjectFlexible("data", "Data")
    val dados = root.jsonObjectFlexible("dados", "Dados")
    val responsavel = root.jsonObjectFlexible("responsavelFinanceiro", "responsavel_financeiro", "ResponsavelFinanceiro")
    val nestedResponsavel = data?.jsonObjectFlexible("responsavelFinanceiro", "responsavel_financeiro", "ResponsavelFinanceiro")
    val target = listOfNotNull(
        root,
        root.jsonObjectFlexible("endereco", "Endereco"),
        data,
        data?.jsonObjectFlexible("endereco", "Endereco"),
        dados,
        dados?.jsonObjectFlexible("endereco", "Endereco"),
        responsavel,
        responsavel?.jsonObjectFlexible("endereco", "Endereco"),
        nestedResponsavel,
        nestedResponsavel?.jsonObjectFlexible("endereco", "Endereco"),
    ).firstOrNull { it.hasEnderecoHints() } ?: return null

    val municipioObj = target.jsonObjectFlexible("municipio", "Municipio")
    val bairroObj = target.jsonObjectFlexible("bairro", "Bairro")
    val tipoLogradouroObj = target.jsonObjectFlexible("tipoLogradouro", "TipoLogradouro")
    val ufObj = target.jsonObjectFlexible("uf", "Uf", "estado", "Estado")
    val uf = target.readString("uf", "Uf", "descricaoUf", "ufSigla", "UfSigla")
        ?: ufObj?.readString("sigla", "uf", "descricao", "nome")
        ?: municipioObj?.readString("uf", "Uf", "ufSigla", "UfSigla")

    return CadastroEndereco(
        cep = target.readString("cep", "CEP", "codigoPostal", "postalCode")
            ?.filter(Char::isDigit)
            .orEmpty()
            .take(8),
        tipoLogradouro = target.readString("tipoLogradouro", "tipo_logradouro", "TipoLogradouro")
            ?: tipoLogradouroObj?.readString("nome", "descricao", "tipo")
            ?: "",
        logradouro = target.readString("logradouro", "Logradouro", "endereco", "Endereco").orEmpty(),
        numero = target.readString("numero", "Numero", "numeroLogradouro").orEmpty(),
        complemento = target.readString("complemento", "Complemento").orEmpty(),
        bairro = target.readString("bairro", "Bairro")
            ?: bairroObj?.readString("nome", "descricao")
            ?: "",
        cidade = target.readString("cidade", "Cidade", "municipio", "Municipio")
            ?: municipioObj?.readString("nome", "descricao", "municipio", "cidade")
            ?: "",
        uf = uf.orEmpty().uppercase(Locale.ROOT).take(2),
        idTipoLogradouro = target.readInt("idTipoLogradouro", "IdTipoLogradouro")
            ?: tipoLogradouroObj?.readInt("id", "Id", "codigo"),
        idBairro = target.readInt("idBairro", "IdBairro")
            ?: bairroObj?.readInt("id", "Id", "codigo"),
        idMunicipio = target.readInt("idMunicipio", "IdMunicipio")
            ?: municipioObj?.readInt("id", "Id", "codigo", "codigoMunicipio"),
        idUf = target.readInt("idUf", "IdUf")
            ?: ufObj?.readInt("id", "Id", "codigo", "codigoUf"),
        ufSigla = target.readString("ufSigla", "UfSigla", "descricaoUf")
            ?: ufObj?.readString("sigla", "uf"),
    )
}

private fun hasEnderecoData(endereco: CadastroEndereco?): Boolean {
    if (endereco == null) return false
    return endereco.cep.isNotBlank() ||
        endereco.logradouro.isNotBlank() ||
        endereco.numero.isNotBlank() ||
        endereco.bairro.isNotBlank() ||
        endereco.cidade.isNotBlank() ||
        endereco.uf.isNotBlank()
}

internal fun validateEnderecoCepForErp(endereco: CadastroEndereco?) {
    val cepDigits = CadastroPayloadBuilder.normalizeDigits(endereco?.cep)
    if (cepDigits.length != 8) {
        throw IllegalStateException("Informe um CEP valido de 8 digitos antes de cadastrar.")
    }
}

internal fun validateEnderecoCepForErp(rawEndereco: JsonElement?) {
    val cepDigits = extractCepDigitsFromEndereco(rawEndereco)
    if (cepDigits.length != 8) {
        throw IllegalStateException("Informe um CEP valido de 8 digitos antes de cadastrar.")
    }
}

private fun parseEnderecoFromErpAssociado(raw: JsonElement?): CadastroEndereco? {
    val root = raw.asJsonObjectFlexible() ?: return null
    val dados = root.jsonArrayFlexible("dados", "data")
        ?: root.jsonObjectFlexible("data", "dados")?.jsonArrayFlexible("dados", "data")
        ?: return null

    dados.forEach { item ->
        val obj = item.asJsonObjectFlexible() ?: return@forEach
        val enderecoDireto = parseCadastroEnderecoFlex(obj["endereco"] ?: obj)
        if (hasEnderecoData(enderecoDireto)) return enderecoDireto

        val responsavel = obj.jsonObjectFlexible("responsavelFinanceiro", "responsavel_financeiro", "ResponsavelFinanceiro")
        val enderecoResponsavel = parseCadastroEnderecoFlex(responsavel?.get("endereco") ?: responsavel)
        if (hasEnderecoData(enderecoResponsavel)) return enderecoResponsavel
    }
    return null
}

private fun JsonObject.readString(vararg keys: String): String? {
    keys.forEach { key ->
        val value = this[key]?.jsonPrimitive?.contentOrNull?.trim()
        if (!value.isNullOrBlank()) return value
    }
    return null
}

private fun JsonObject.readInt(vararg keys: String): Int? {
    keys.forEach { key ->
        val primitive = this[key]?.jsonPrimitive ?: return@forEach
        primitive.intOrNull?.let { return it }
        primitive.contentOrNull
            ?.trim()
            ?.toIntOrNull()
            ?.let { return it }
    }
    return null
}

private fun extractCepDigitsFromEndereco(raw: JsonElement?): String {
    val normalized = decodeEmbeddedJsonElement(raw) ?: return ""
    return when (normalized) {
        is JsonObject -> {
            val direct = normalized.readString("cep", "CEP", "codigoPostal", "postalCode")
            if (!direct.isNullOrBlank()) {
                CadastroPayloadBuilder.normalizeDigits(direct).take(8)
            } else {
                normalized.values.asSequence()
                    .map { extractCepDigitsFromEndereco(it) }
                    .firstOrNull { it.isNotBlank() }
                    .orEmpty()
            }
        }
        is JsonArray -> normalized.asSequence()
            .map { extractCepDigitsFromEndereco(it) }
            .firstOrNull { it.isNotBlank() }
            .orEmpty()
        else -> ""
    }
}
