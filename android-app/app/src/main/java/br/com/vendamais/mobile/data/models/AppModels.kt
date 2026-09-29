package br.com.vendamais.mobile.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class MobileProfile(
    val id: String,
    val name: String,
    val email: String,
    val telefone: String? = null,
    val role: String,
    @SerialName("external_id")
    val externalId: String? = null,
    @SerialName("team_id")
    val teamId: String? = null,
    @SerialName("is_active")
    val isActive: Boolean = true,
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("lemmit_limite_consultas")
    val lemmitLimiteConsultas: Double? = null,
)

@Serializable
data class MobileTeam(
    val id: String,
    val name: String,
    @SerialName("is_active")
    val isActive: Boolean = true,
)

@Serializable
data class AdminUser(
    val id: String,
    val name: String,
    val email: String,
    val telefone: String? = null,
    val role: String,
    @SerialName("external_id")
    val externalId: String? = null,
    @SerialName("team_id")
    val teamId: String? = null,
    @SerialName("is_active")
    val isActive: Boolean = true,
    @SerialName("lemmit_limite_consultas")
    val lemmitLimiteConsultas: Double? = null,
    @SerialName("created_at")
    val createdAt: String? = null,
)

@Serializable
data class AdminTeam(
    val id: String,
    val name: String,
    @SerialName("is_active")
    val isActive: Boolean = true,
    @SerialName("created_at")
    val createdAt: String? = null,
)

data class SystemOverview(
    val totalUsers: Int = 0,
    val totalTeams: Int = 0,
    val activeUsers: Int = 0,
)

@Serializable
data class VendedorStats(
    @SerialName("vendedor_id")
    val vendedorId: String? = null,
    @SerialName("vendedor_nome")
    val vendedorNome: String = "Vendedor nao identificado",
    val total: Int = 0,
    val incompletos: Int = 0,
    val enviados: Int = 0,
)

@Serializable
data class CadastroStats(
    val cadastro_total: Int = 0,
    val cadastro_cadastros: Int = 0,
    val cadastro_dependentes: Int = 0,
    val cadastro_incompletos: Int = 0,
    val cadastro_incompletos_cadastros: Int = 0,
    val cadastro_incompletos_dependentes: Int = 0,
    val cadastro_enviados: Int = 0,
    val cadastro_enviados_cadastros: Int = 0,
    val cadastro_enviados_dependentes: Int = 0,
    val inclusao_total: Int = 0,
    val inclusao_cadastros: Int = 0,
    val inclusao_dependentes: Int = 0,
    val inclusao_incompletos: Int = 0,
    val inclusao_incompletos_cadastros: Int = 0,
    val inclusao_incompletos_dependentes: Int = 0,
    val inclusao_enviados: Int = 0,
    val inclusao_enviados_cadastros: Int = 0,
    val inclusao_enviados_dependentes: Int = 0,
)

@Serializable
data class CadastroResumo(
    val id: String,
    val status: String,
    @SerialName("tipo_cadastro")
    val tipoCadastro: String = "cadastro",
    val nome: String? = null,
    val cpf: String = "",
    @SerialName("empresa_nome")
    val empresaNome: String? = null,
    @SerialName("empresa_cnpj")
    val empresaCnpj: String? = null,
    @SerialName("empresa_codigo")
    val empresaCodigo: Int? = null,
    @SerialName("status_adesao_id")
    val statusAdesaoId: String? = null,
    @SerialName("vendedor_id")
    val vendedorId: String? = null,
    @SerialName("vendedor_nome")
    val vendedorNome: String? = null,
    @SerialName("adesionista_nome")
    val adesionistaNome: String? = null,
    val dependentes: JsonElement? = null,
    @SerialName("data_envio")
    val dataEnvio: String? = null,
    @SerialName("created_at")
    val createdAt: String,
    @SerialName("updated_at")
    val updatedAt: String,
)

@Serializable
data class CadastroDetalhe(
    val id: String,
    val status: String,
    @SerialName("tipo_cadastro")
    val tipoCadastro: String = "cadastro",
    val nome: String? = null,
    val cpf: String = "",
    @SerialName("data_nascimento")
    val dataNascimento: String? = null,
    @SerialName("sexo_codigo")
    val sexoCodigo: Int? = null,
    @SerialName("nome_mae")
    val nomeMae: String? = null,
    val contatos: JsonElement? = null,
    val endereco: JsonElement? = null,
    @SerialName("empresa_nome")
    val empresaNome: String? = null,
    @SerialName("empresa_id")
    val empresaId: Int? = null,
    @SerialName("empresa_codigo")
    val empresaCodigo: Int? = null,
    @SerialName("empresa_cnpj")
    val empresaCnpj: String? = null,
    @SerialName("empresa_exige_matricula")
    val empresaExigeMatricula: Int? = null,
    @SerialName("empresa_raw")
    val empresaRaw: JsonElement? = null,
    @SerialName("planos_raw")
    val planosRaw: JsonElement? = null,
    @SerialName("numero_matricula")
    val numeroMatricula: String? = null,
    @SerialName("status_adesao_id")
    val statusAdesaoId: String? = null,
    @SerialName("vendedor_nome")
    val vendedorNome: String? = null,
    @SerialName("vendedor_codigo")
    val vendedorCodigo: String? = null,
    @SerialName("adesionista_nome")
    val adesionistaNome: String? = null,
    @SerialName("adesionista_codigo")
    val adesionistaCodigo: String? = null,
    @SerialName("responsavel_financeiro_codigo")
    val responsavelFinanceiroCodigo: Int? = null,
    @SerialName("responsavel_financeiro_nome")
    val responsavelFinanceiroNome: String? = null,
    @SerialName("responsavel_financeiro_cpf")
    val responsavelFinanceiroCpf: String? = null,
    @SerialName("contatos_responsavel_financeiro")
    val contatosResponsavelFinanceiro: JsonElement? = null,
    @SerialName("motivo_bloqueio")
    val motivoBloqueio: String? = null,
    @SerialName("data_envio")
    val dataEnvio: String? = null,
    val dependentes: JsonElement? = null,
    @SerialName("erp_dados_associado")
    val erpDadosAssociado: JsonElement? = null,
    @SerialName("erp_response")
    val erpResponse: JsonElement? = null,
    @SerialName("arquivo_path")
    val arquivoPath: String? = null,
    @SerialName("arquivo_nome")
    val arquivoNome: String? = null,
    @SerialName("arquivo_mime_type")
    val arquivoMimeType: String? = null,
    @SerialName("arquivo_tamanho")
    val arquivoTamanho: Long? = null,
    @SerialName("plano_codigo")
    val planoCodigo: Int? = null,
    @SerialName("created_at")
    val createdAt: String,
    @SerialName("updated_at")
    val updatedAt: String,
)
