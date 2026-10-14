package br.com.vendamais.mobile.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement


@Serializable
data class ApiLogItem(
    val id: String,
    @SerialName("user_email")
    val userEmail: String? = null,
    val endpoint: String = "",
    val method: String = "",
    @SerialName("status_code")
    val statusCode: Int? = null,
    val success: Boolean = false,
    @SerialName("error_message")
    val errorMessage: String? = null,
    @SerialName("duration_ms")
    val durationMs: Long? = null,
    val cost: Double? = null,
    @SerialName("created_at")
    val createdAt: String = "",
    @SerialName("request_body")
    val requestBody: JsonElement? = null,
    @SerialName("response_body")
    val responseBody: JsonElement? = null,
)

@Serializable
data class ApiLogSearchResponse(
    val total: Int = 0,
    val logs: List<ApiLogItem> = emptyList(),
)

@Serializable
data class ApiLogDetail(
    @SerialName("request_body")
    val requestBody: JsonElement? = null,
    @SerialName("response_body")
    val responseBody: JsonElement? = null,
)


@Serializable
data class AuditLemmitResponse(
    val cards: AuditLemmitCards = AuditLemmitCards(),
    @SerialName("usuario_consulta")
    val usuarioConsulta: List<AuditLemmitUsuarioConsulta> = emptyList(),
    @SerialName("usuario_custo")
    val usuarioCusto: List<AuditLemmitUsuarioCusto> = emptyList(),
    @SerialName("ultimas_consultas")
    val ultimasConsultas: List<AuditLemmitUltimaConsulta> = emptyList(),
)

@Serializable
data class AuditLemmitCards(
    @SerialName("total_limite_ajustado")
    val totalLimiteAjustado: Double = 0.0,
    @SerialName("total_consultas")
    val totalConsultas: Int = 0,
    @SerialName("bem_sucedidas")
    val bemSucedidas: Int = 0,
    @SerialName("com_erro")
    val comErro: Int = 0,
    @SerialName("custo_total")
    val custoTotal: Double = 0.0,
)

@Serializable
data class AuditLemmitUsuarioConsulta(
    @SerialName("user_id")
    val userId: String? = null,
    val nome: String = "",
    val consultas: Int = 0,
)

@Serializable
data class AuditLemmitUsuarioCusto(
    @SerialName("user_id")
    val userId: String? = null,
    val nome: String = "",
    @SerialName("custo_total")
    val custoTotal: Double = 0.0,
)

@Serializable
data class AuditLemmitUltimaConsulta(
    val nome: String = "",
    val cpf: String = "",
    val hora: String = "",
)

@Serializable
data class ErpUploadQueueItem(
    val id: String,
    @SerialName("created_at")
    val createdAt: String,
    @SerialName("updated_at")
    val updatedAt: String,
    val status: String,
    val attempts: Int = 0,
    @SerialName("next_attempt_at")
    val nextAttemptAt: String? = null,
    @SerialName("last_attempt_at")
    val lastAttemptAt: String? = null,
    @SerialName("last_error")
    val lastError: String? = null,
    @SerialName("last_status_code")
    val lastStatusCode: Int? = null,
    @SerialName("last_error_code")
    val lastErrorCode: String? = null,
    @SerialName("claimed_at")
    val claimedAt: String? = null,
    @SerialName("finished_at")
    val finishedAt: String? = null,
    @SerialName("manual_reprocess_count")
    val manualReprocessCount: Int = 0,
    @SerialName("worker_source")
    val workerSource: String? = null,
    @SerialName("file_size_bytes")
    val fileSizeBytes: Long? = null,
    @SerialName("cliente_nome")
    val clienteNome: String? = null,
    @SerialName("cliente_cpf")
    val clienteCpf: String? = null,
    @SerialName("empresa_nome")
    val empresaNome: String? = null,
    @SerialName("erp_response")
    val erpResponse: JsonElement? = null,
    @SerialName("cadastro_id")
    val cadastroId: String? = null,
    @SerialName("created_by")
    val createdBy: String? = null,
    @SerialName("id_funcionario")
    val idFuncionario: Int = 0,
    @SerialName("id_dependente")
    val idDependente: Int = 0,
    @SerialName("arquivo_path")
    val arquivoPath: String = "",
    @SerialName("arquivo_nome")
    val arquivoNome: String = "",
    val bucket: String = "cadastros-temp-files",
    val tipo: String = "dependente",
    @SerialName("cadastros")
    val cadastro: ErpUploadQueueCadastro? = null,
)

@Serializable
data class ErpUploadQueueCadastro(
    val nome: String? = null,
    val cpf: String? = null,
    @SerialName("empresa_nome")
    val empresaNome: String? = null,
    @SerialName("vendedor_nome")
    val vendedorNome: String? = null,
    @SerialName("adesionista_nome")
    val adesionistaNome: String? = null,
)

data class ErpUploadQueuePage(
    val items: List<ErpUploadQueueItem> = emptyList(),
    val total: Int = 0,
)

@Serializable
data class ProcessUploadQueueResponse(
    val ok: Boolean = false,
    val message: String? = null,
    val processed: Int = 0,
    val success: Int = 0,
    @SerialName("retry_wait")
    val retryWait: Int = 0,
    val failed: Int = 0,
    val source: String? = null,
    val results: JsonElement? = null,
)

@Serializable
data class ErpUploadQueueHealth(
    val total: Int = 0,
    val queued: Int = 0,
    val processing: Int = 0,
    @SerialName("retry_wait")
    val retryWait: Int = 0,
    val success: Int = 0,
    val failed: Int = 0,
    val claimable: Int = 0,
    val stuck: Int = 0,
    @SerialName("missing_file_pending")
    val missingFilePending: Int = 0,
    @SerialName("active_failures")
    val activeFailures: Int = 0,
    @SerialName("historical_failures")
    val historicalFailures: Int = 0,
    @SerialName("resolved_failures")
    val resolvedFailures: Int = 0,
    @SerialName("active_missing_file_failures")
    val activeMissingFileFailures: Int = 0,
    @SerialName("oldest_pending_at")
    val oldestPendingAt: String? = null,
    @SerialName("last_success_at")
    val lastSuccessAt: String? = null,
    @SerialName("last_failure_at")
    val lastFailureAt: String? = null,
)

@Serializable
data class ErpUploadErrorSummary(
    val total: Int = 0,
    @SerialName("file_not_found")
    val fileNotFound: Int = 0,
    @SerialName("file_too_large")
    val fileTooLarge: Int = 0,
    @SerialName("empty_file")
    val emptyFile: Int = 0,
    @SerialName("erp_file_locked")
    val erpFileLocked: Int = 0,
    @SerialName("erp_rejected")
    val erpRejected: Int = 0,
    @SerialName("erp_network")
    val erpNetwork: Int = 0,
    @SerialName("erp_rate_limit")
    val erpRateLimit: Int = 0,
    @SerialName("erp_server_error")
    val erpServerError: Int = 0,
    @SerialName("erp_invalid_response")
    val erpInvalidResponse: Int = 0,
    @SerialName("queue_internal")
    val queueInternal: Int = 0,
    @SerialName("primary_dependent_not_found")
    val primaryDependentNotFound: Int = 0,
    @SerialName("erp_funcionario_id_not_found")
    val erpFuncionarioIdNotFound: Int = 0,
    @SerialName("legacy_unclassified")
    val legacyUnclassified: Int = 0,
)

@Serializable
data class ErpUploadErrorPagination(
    val page: Int = 1,
    @SerialName("page_size")
    val pageSize: Int = 50,
    val total: Int = 0,
    @SerialName("total_pages")
    val totalPages: Int = 1,
)

@Serializable
data class ErpUploadErrorItem(
    val id: String,
    @SerialName("cadastro_id")
    val cadastroId: String? = null,
    @SerialName("created_at")
    val createdAt: String = "",
    @SerialName("finished_at")
    val finishedAt: String? = null,
    @SerialName("last_attempt_at")
    val lastAttemptAt: String? = null,
    val status: String = "failed",
    val attempts: Int = 0,
    @SerialName("cliente_nome")
    val clienteNome: String? = null,
    @SerialName("cliente_cpf")
    val clienteCpf: String? = null,
    @SerialName("empresa_nome")
    val empresaNome: String? = null,
    @SerialName("vendedor_nome")
    val vendedorNome: String? = null,
    @SerialName("adesionista_nome")
    val adesionistaNome: String? = null,
    @SerialName("arquivo_nome")
    val arquivoNome: String = "",
    @SerialName("arquivo_path")
    val arquivoPath: String = "",
    val bucket: String = "cadastros-temp-files",
    @SerialName("file_size_bytes")
    val fileSizeBytes: Long? = null,
    @SerialName("last_error_code")
    val lastErrorCode: String? = null,
    @SerialName("last_status_code")
    val lastStatusCode: Int? = null,
    @SerialName("last_error")
    val lastError: String? = null,
    @SerialName("worker_source")
    val workerSource: String? = null,
    @SerialName("id_funcionario")
    val idFuncionario: Int = 0,
    @SerialName("id_dependente")
    val idDependente: Int = 0,
    @SerialName("target_dependente_cpf")
    val targetDependenteCpf: String? = null,
    @SerialName("target_dependente_nome")
    val targetDependenteNome: String? = null,
    @SerialName("error_category")
    val errorCategory: String = "LEGACY_UNCLASSIFIED",
    @SerialName("file_exists")
    val fileExists: Boolean = false,
    @SerialName("is_legacy_failure")
    val isLegacyFailure: Boolean = false,
    @SerialName("error_resolution")
    val errorResolution: String? = null,
    @SerialName("resolved_at")
    val resolvedAt: String? = null,
    @SerialName("resolved_by_queue_id")
    val resolvedByQueueId: String? = null,
    @SerialName("replacement_count")
    val replacementCount: Int = 0,
    @SerialName("last_reconciled_at")
    val lastReconciledAt: String? = null,
    @SerialName("can_upload_replacement")
    val canUploadReplacement: Boolean = false,
    @SerialName("can_compress")
    val canCompress: Boolean = false,
    @SerialName("can_reconcile")
    val canReconcile: Boolean = false,
    @SerialName("can_reprocess")
    val canReprocess: Boolean = false,
)

@Serializable
data class ErpUploadErrorSearchResponse(
    val summary: ErpUploadErrorSummary = ErpUploadErrorSummary(),
    val pagination: ErpUploadErrorPagination = ErpUploadErrorPagination(),
    val items: List<ErpUploadErrorItem> = emptyList(),
)

@Serializable
data class ReconcileErpUploadErrorsResult(
    val checked: Int = 0,
    val reconciled: Int = 0,
)

@Serializable
data class RepairErpUploadQueueResult(
    val ok: Boolean = false,
    val id: String? = null,
    val status: String? = null,
    @SerialName("file_size_bytes")
    val fileSizeBytes: Long? = null,
)

@Serializable
data class RequeueUploadQueueResult(
    val requeued: Int = 0,
    val scope: String = "",
)

@Serializable
data class ResetStuckQueueResult(
    @SerialName("reset_count")
    val resetCount: Int = 0,
    @SerialName("reset_ids")
    val resetIds: List<String> = emptyList(),
)

@Serializable
data class CadastroExcluidoItem(
    val id: String,
    @SerialName("cadastro_id")
    val cadastroId: String,
    @SerialName("dados_cadastro")
    val dadosCadastro: JsonElement,
    @SerialName("motivo_exclusao")
    val motivoExclusao: String,
    @SerialName("excluido_por")
    val excluidoPor: String,
    @SerialName("excluido_por_nome")
    val excluidoPorNome: String,
    @SerialName("excluido_por_role")
    val excluidoPorRole: String,
    @SerialName("excluido_em")
    val excluidoEm: String,
    @SerialName("team_id")
    val teamId: String? = null,
)

@Serializable
data class PublicCadastroLinkResolveResponse(
    val ok: Boolean = false,
    val link: PublicCadastroLinkInfo? = null,
    val consultant: PublicConsultantInfo? = null,
    val error: String? = null,
)

@Serializable
data class PublicConsultantInfo(
    val nome: String = "",
    val telefone: String = "",
)

@Serializable
data class PublicCadastroLinkInfo(
    val id: String,
    @SerialName("empresaCodigo")
    val empresaCodigo: Int,
    @SerialName("empresaNome")
    val empresaNome: String,
    @SerialName("empresaCnpj")
    val empresaCnpj: String? = null,
    @SerialName("empresaRaw")
    val empresaRaw: JsonElement? = null,
    @SerialName("empresaExigeMatricula")
    val empresaExigeMatricula: Int? = null,
    val planos: List<PublicPlanoInfo> = emptyList(),
    @SerialName("planosRaw")
    val planosRaw: JsonElement? = null,
    @SerialName("planosOcultos")
    val planosOcultos: List<String> = emptyList(),
    val parentescos: List<PublicParentescoInfo> = emptyList(),
    @SerialName("vendedorCodigo")
    val vendedorCodigo: String? = null,
    @SerialName("vendedorNome")
    val vendedorNome: String? = null,
    @SerialName("vendedorTelefone")
    val vendedorTelefone: String? = null,
    @SerialName("coberturaPlanos")
    val coberturaPlanos: Map<String, String> = emptyMap(),
)

@Serializable
data class PublicPlanoInfo(
    @SerialName("Plano")
    val plano: Int,
    val nomeExibicao: String = "",
    @SerialName("ValorTitular")
    val valorTitular: Double = 0.0,
    @SerialName("ValorDependente")
    val valorDependente: Double = 0.0,
    @SerialName("ValorAgregado")
    val valorAgregado: Double = 0.0,
)

@Serializable
data class PublicParentescoInfo(
    val id: Int? = null,
    @SerialName("parentescoId")
    val parentescoId: Int? = null,
    val label: String,
    val ativo: Boolean = true,
) {
    val resolvedId: Int
        get() = parentescoId ?: id ?: 0
}

@Serializable
data class PublicCadastroPrefill(
    val cpf: String? = null,
    val nome: String? = null,
    @SerialName("dataNascimento")
    val dataNascimento: String? = null,
    @SerialName("sexoCodigo")
    val sexoCodigo: Int? = null,
    val contatos: List<PublicCadastroContato> = emptyList(),
    val endereco: PublicCadastroEndereco? = null,
    @SerialName("nomeMae")
    val nomeMae: String? = null,
)

@Serializable
data class PublicExistingMemberInfo(
    val nome: String = "",
    val empresa: String = "",
    val telefone: String = "",
    val email: String = "",
)

@Serializable
data class PublicCadastroAuthenticateResponse(
    val ok: Boolean = false,
    val state: String? = null,
    @SerialName("attemptToken")
    val attemptToken: String? = null,
    val person: PublicCadastroPrefill? = null,
    val member: PublicExistingMemberInfo? = null,
    val plans: List<PublicPlanoInfo> = emptyList(),
    val reason: String? = null,
    val error: String? = null,
    val code: String? = null,
)

@Serializable
data class PublicCadastroCepResponse(
    val ok: Boolean = false,
    val dados: PublicCadastroCepData? = null,
    val error: String? = null,
)

@Serializable
data class PublicCadastroCepData(
    @SerialName("IdTipoLogradouro")
    val idTipoLogradouro: Int? = null,
    @SerialName("TipoLogradouro")
    val tipoLogradouro: String? = null,
    @SerialName("Logradouro")
    val logradouro: String? = null,
    @SerialName("IdBairro")
    val idBairro: Int? = null,
    @SerialName("Bairro")
    val bairro: String? = null,
    @SerialName("IdMunicipio")
    val idMunicipio: Int? = null,
    @SerialName("Municipio")
    val municipio: String? = null,
    @SerialName("IdUf")
    val idUf: Int? = null,
    @SerialName("Uf")
    val uf: String? = null,
    @SerialName("UfSigla")
    val ufSigla: String? = null,
)

@Serializable
data class PublicCadastroDependentLookupResponse(
    val ok: Boolean = false,
    val pessoa: JsonElement? = null,
    val error: String? = null,
    val code: String? = null,
    val canContinue: Boolean = false,
)

@Serializable
data class PublicCadastroContractPrepareResponse(
    val ok: Boolean = false,
    @SerialName("contractToken")
    val contractToken: String? = null,
    @SerialName("contractHash")
    val contractHash: String? = null,
    @SerialName("contractText")
    val contractText: String? = null,
    @SerialName("coverageAvailable")
    val coverageAvailable: Boolean = false,
    @SerialName("coverageUrl")
    val coverageUrl: String? = null,
    val summary: JsonElement? = null,
    val error: String? = null,
    val code: String? = null,
    val missingPlans: List<Int> = emptyList(),
)

@Serializable
data class PublicCadastroCheckCpfResponse(
    val ok: Boolean = false,
    val error: String? = null,
    val code: String? = null,
    val prefill: PublicCadastroPrefill? = null,
    val message: String? = null,
)

@Serializable
data class PublicCadastroSubmitResponse(
    val ok: Boolean = false,
    val error: String? = null,
    @SerialName("cadastroId")
    val cadastroId: String? = null,
    val warning: String? = null,
    val message: String? = null,
    val details: JsonElement? = null,
)

@Serializable
data class PublicCadastroContractPayload(
    val cpf: String,
    val nome: String,
    @SerialName("dataNascimento")
    val dataNascimento: String,
    @SerialName("sexoCodigo")
    val sexoCodigo: Int,
    @SerialName("nomeMae")
    val nomeMae: String,
    @SerialName("numeroMatricula")
    val numeroMatricula: String? = null,
    val contatos: List<PublicCadastroContato>,
    val endereco: PublicCadastroEndereco,
    @SerialName("titularPlano")
    val titularPlano: Int,
    val dependentes: List<PublicCadastroDependente>,
)

@Serializable
data class PublicCadastroPayload(
    val cpf: String,
    val nome: String,
    @SerialName("dataNascimento")
    val dataNascimento: String,
    @SerialName("sexoCodigo")
    val sexoCodigo: Int,
    val contatos: List<PublicCadastroContato>,
    val endereco: PublicCadastroEndereco,
    @SerialName("nomeMae")
    val nomeMae: String,
    @SerialName("numeroMatricula")
    val numeroMatricula: String? = null,
    val dependentes: List<PublicCadastroDependente>,
)

@Serializable
data class PublicCadastroContato(
    val tipo: String,
    val valor: String,
    val principal: Boolean = false,
)

@Serializable
data class PublicCadastroEndereco(
    val cep: String,
    @SerialName("tipoLogradouro")
    val tipoLogradouro: String? = null,
    val logradouro: String,
    val numero: String,
    val complemento: String? = null,
    val bairro: String,
    val cidade: String,
    val uf: String,
    @SerialName("idTipoLogradouro")
    val idTipoLogradouro: Int? = null,
    @SerialName("idBairro")
    val idBairro: Int? = null,
    @SerialName("idMunicipio")
    val idMunicipio: Int? = null,
    @SerialName("idUf")
    val idUf: Int? = null,
    @SerialName("ufSigla")
    val ufSigla: String? = null,
)

@Serializable
data class PublicCadastroDependente(
    val tipo: Int,
    val nome: String,
    @SerialName("dataNascimento")
    val dataNascimento: String,
    val cpf: String,
    val sexo: Int,
    @SerialName("sexoDescricao")
    val sexoDescricao: String,
    val plano: Int,
    @SerialName("planoValor")
    val planoValor: String = "0,00",
    @SerialName("nomeMae")
    val nomeMae: String,
    @SerialName("carenciaAtendimento")
    val carenciaAtendimento: Int = 0,
    @SerialName("funcionarioCadastro")
    val funcionarioCadastro: Int = 0,
)
