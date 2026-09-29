package br.com.vendamais.mobile.data.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.KSerializer
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class CadastroConfig(
    val id: Int = 1,
    @SerialName("ativar_lemmit")
    val ativarLemmit: Boolean = true,
    @SerialName("situacoes_que_barram")
    val situacoesQueBarram: List<Int> = emptyList(),
    @SerialName("planos_validos")
    val planosValidos: List<Int> = emptyList(),
    @SerialName("planos_ocultos")
    val planosOcultos: List<String> = emptyList(),
    @SerialName("codigos_empresa_invalidos")
    val codigosEmpresaInvalidos: List<String> = emptyList(),
    @SerialName("exigir_arquivo")
    val exigirArquivo: Boolean = false,
    @SerialName("lemmit_dependente")
    val lemmitDependente: Boolean = false,
    @SerialName("lemmit_inclusao_dependente")
    val lemmitInclusaoDependente: Boolean = false,
)

@Serializable
data class PlanoMap(
    val id: String,
    @SerialName("plano_id")
    val planoId: Int,
    @SerialName("nome_exibicao")
    val nomeExibicao: String,
    @SerialName("registro_produto")
    val registroProduto: String? = null,
    @SerialName("regra_valor")
    val regraValor: String = "dependente",
    val ativo: Boolean = true,
)

@Serializable
data class ParentescoMap(
    val id: String,
    @SerialName("parentesco_id")
    val parentescoId: Int,
    val label: String,
    val ativo: Boolean = true,
)

@Serializable
data class StatusAdesao(
    val id: String,
    val nome: String,
    val cor: String,
    val ordem: Int = 0,
)

@Serializable
data class TeamMemberOption(
    val id: String,
    val name: String,
    val email: String? = null,
    @SerialName("external_id")
    val externalId: String? = null,
)

@Serializable
data class EmpresaResumo(
    val id: Int = 0,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    val codigo: Int? = null,
    @SerialName("razaoSocial")
    val razaoSocial: String = "",
    @SerialName("nomeFantasia")
    val nomeFantasia: String = "",
    val cnpj: String = "",
    @SerialName("codigoSituacao")
    val codigoSituacao: Int? = null,
    @SerialName("enderecoEmpresa")
    val enderecoEmpresa: JsonElement? = null,
    @SerialName("precoPlano")
    val precoPlano: JsonElement? = null,
    @SerialName("exigeMatricula")
    val exigeMatricula: Int? = null,
    val observacoes: String? = null,
    val observacao: String? = null,
    val raw: JsonElement? = null,
) {
    val observacoesResolvidas: String?
        get() = observacoes ?: observacao
}

@Serializable
data class EmpresaSearchResponse(
    val ok: Boolean = false,
    val empresas: List<EmpresaResumo> = emptyList(),
    val error: String? = null,
)

@Serializable
data class CheckCpfExistenteResponse(
    val exists: Boolean = false,
    @SerialName("cadastro_id")
    val cadastroId: String? = null,
    val status: String? = null,
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("empresa_nome")
    val empresaNome: String? = null,
    @SerialName("can_continue")
    val canContinue: Boolean = false,
)

@Serializable
data class ErpAssociadoSummary(
    val empresa: String? = null,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    val codigo: Int? = null,
    @SerialName("nomeFantasiaDaEmpresa")
    val nomeFantasiaDaEmpresa: String? = null,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    @SerialName("codigoPlano")
    val codigoPlano: Int? = null,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    @SerialName("codigoSituacao")
    val codigoSituacao: Int? = null,
    @SerialName("nomeSituacao")
    val nomeSituacao: String? = null,
)

@Serializable
data class ErpAssociadoDependente(
    @SerialName("numeroCpfDependente")
    val numeroCpfDependente: String? = null,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    @SerialName("codigoDependente")
    val codigoDependente: Int? = null,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    @SerialName("codigoSituacao")
    val codigoSituacao: Int? = null,
    @SerialName("nomeSituacao")
    val nomeSituacao: String? = null,
    @SerialName("dataSituacao")
    val dataSituacao: String? = null,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    @SerialName("codigoPlano")
    val codigoPlano: Int? = null,
    @SerialName("dataNascimento")
    val dataNascimento: String? = null,
)

@Serializable
data class ErpAssociadoItem(
    val cpf: String? = null,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    val codigo: Int? = null,
    val nome: String? = null,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    @SerialName("codigoDaEmpresa")
    val codigoDaEmpresa: Int? = null,
    @SerialName("nomeFantasiaDaEmpresa")
    val nomeFantasiaDaEmpresa: String? = null,
    val dependentes: List<ErpAssociadoDependente> = emptyList(),
)

@Serializable
data class ErpAssociadoResponse(
    val exists: Boolean = false,
    @SerialName("shouldBlock")
    val shouldBlock: Boolean = false,
    @SerialName("blockReason")
    val blockReason: String? = null,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    @SerialName("totalRegistros")
    val totalRegistros: Int? = null,
    val dados: List<ErpAssociadoItem> = emptyList(),
    val summary: ErpAssociadoSummary? = null,
)

@Serializable
data class LemmitCelular(
    @Serializable(with = FlexibleNullableIntSerializer::class)
    val ddd: Int? = null,
    @Serializable(with = FlexibleNullableStringSerializer::class)
    val numero: String? = null,
    @Serializable(with = FlexibleNullableBooleanSerializer::class)
    val plus: Boolean? = null,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    val ranking: Int? = null,
    @Serializable(with = FlexibleNullableBooleanSerializer::class)
    val whatsapp: Boolean? = null,
)

@Serializable
data class LemmitFixo(
    @Serializable(with = FlexibleNullableIntSerializer::class)
    val ddd: Int? = null,
    @Serializable(with = FlexibleNullableStringSerializer::class)
    val numero: String? = null,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    val ranking: Int? = null,
)

@Serializable
data class LemmitEmail(
    val email: String? = null,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    val ranking: Int? = null,
    @SerialName("possui_cookie")
    @Serializable(with = FlexibleNullableBooleanSerializer::class)
    val possuiCookie: Boolean? = null,
)

@Serializable
data class LemmitEndereco(
    val endereco: String? = null,
    @SerialName("tipo_logradouro")
    val tipoLogradouro: String? = null,
    @SerialName("titulo_logradouro")
    val tituloLogradouro: String? = null,
    val logradouro: String? = null,
    @Serializable(with = FlexibleNullableStringSerializer::class)
    val numero: String? = null,
    val complemento: String? = null,
    val bairro: String? = null,
    val cidade: String? = null,
    val uf: String? = null,
    val cep: String? = null,
    val tipo: String? = null,
    @Serializable(with = FlexibleNullableIntSerializer::class)
    val ranking: Int? = null,
)

@Serializable
data class LemmitPessoa(
    val cpf: String? = null,
    val nome: String? = null,
    @SerialName("data_nascimento")
    val dataNascimento: String? = null,
    @SerialName("dataNascimento")
    val dataNascimentoAlternativa: String? = null,
    val sexo: String? = null,
    @SerialName("nome_mae")
    val nomeMae: String? = null,
    @SerialName("nomeMae")
    val nomeMaeAlternativa: String? = null,
    val celulares: List<LemmitCelular> = emptyList(),
    val fixos: List<LemmitFixo> = emptyList(),
    val emails: List<LemmitEmail> = emptyList(),
    val enderecos: List<LemmitEndereco> = emptyList(),
)

@Serializable
data class LemmitResponse(
    @SerialName("data_consulta")
    val dataConsulta: String? = null,
    val pessoa: LemmitPessoa? = null,
)

@Serializable
data class LemmitLimitInfo(
    @SerialName("limite_mensal")
    val limiteMensal: Double? = null,
    @SerialName("consumo_mensal")
    val consumoMensal: Double = 0.0,
    @SerialName("saldo_disponivel")
    val saldoDisponivel: Double = 0.0,
)

@Serializable
data class CadastroContato(
    val tipo: String,
    val valor: String,
    val principal: Boolean = false,
)

@Serializable
data class CadastroEndereco(
    val cep: String = "",
    @SerialName("tipoLogradouro")
    val tipoLogradouro: String = "",
    val logradouro: String = "",
    val numero: String = "",
    val complemento: String = "",
    val bairro: String = "",
    val cidade: String = "",
    val uf: String = "",
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
data class DependenteCadastro(
    val tipo: Int = 0,
    val nome: String = "",
    @SerialName("dataNascimento")
    val dataNascimento: String = "",
    val cpf: String = "",
    val sexo: Int = 0,
    @SerialName("sexoDescricao")
    val sexoDescricao: String = "",
    val plano: Int = 0,
    @SerialName("planoNome")
    val planoNome: String = "",
    @SerialName("planoValor")
    val planoValor: String = "0,00",
    @SerialName("tipoPlano")
    val tipoPlano: String = "",
    val vigencia: String = "",
    @SerialName("nomeMae")
    val nomeMae: String = "",
    @SerialName("carenciaAtendimento")
    val carenciaAtendimento: Int = 0,
    @SerialName("funcionarioCadastro")
    val funcionarioCadastro: Int = 0,
)

data class CadastroBaseData(
    val cpf: String,
    val nome: String = "",
    val dataNascimento: String = "",
    val sexo: String = "",
    val sexoCodigo: Int = 0,
    val contatos: List<CadastroContato> = emptyList(),
    val endereco: CadastroEndereco? = null,
    val nomeMae: String? = null,
    val numeroMatricula: String? = null,
)

data class CpfConsultInput(
    val cpf: String,
    val empresa: EmpresaResumo,
    val vendedorSelecionado: TeamMemberOption? = null,
    val adesionistaSelecionado: TeamMemberOption? = null,
)

data class CpfConsultResult(
    val draft: CadastroDetalhe,
    val warningMessage: String? = null,
)

data class CadastroOperationPayload(
    val draftId: String,
    val warningMessage: String? = null,
)

enum class EmpresaSearchType {
    CODIGO,
    CNPJ,
    NOME,
}

@Serializable
data class CadastroLinkItem(
    val id: String,
    @SerialName("empresa_codigo")
    val empresaCodigo: Int,
    @SerialName("empresa_nome")
    val empresaNome: String,
    @SerialName("empresa_cnpj")
    val empresaCnpj: String? = null,
    @SerialName("vendedor_nome")
    val vendedorNome: String? = null,
    @SerialName("vendedor_codigo")
    val vendedorCodigo: String? = null,
    @SerialName("adesionista_id")
    val adesionistaId: String? = null,
    @SerialName("adesionista_nome")
    val adesionistaNome: String? = null,
    @SerialName("adesionista_codigo")
    val adesionistaCodigo: String? = null,
    @SerialName("link_url")
    val linkUrl: String? = null,
    @SerialName("is_active")
    val isActive: Boolean = true,
    @SerialName("click_count")
    val clickCount: Int? = null,
    @SerialName("last_clicked_at")
    val lastClickedAt: String? = null,
    @SerialName("used_at")
    val usedAt: String? = null,
    @SerialName("used_cpf")
    val usedCpf: String? = null,
    @SerialName("created_at")
    val createdAt: String,
    @SerialName("updated_at")
    val updatedAt: String? = null,
)

data class CadastroLinkAssociadoResumo(
    val nome: String,
    val dependentes: List<String> = emptyList(),
)

data class CadastroLinkMetrics(
    val associadosCount: Int = 0,
    val dependentesCount: Int = 0,
    val associados: List<CadastroLinkAssociadoResumo> = emptyList(),
)

@Serializable
data class CadastroLinkHistoryResponse(
    val ok: Boolean = false,
    val link: CadastroLinkHistoryInfo? = null,
    val summary: CadastroLinkHistorySummary? = null,
    val rows: List<CadastroLinkHistoryRow> = emptyList(),
    val error: String? = null,
)

@Serializable
data class CadastroLinkHistoryInfo(
    val id: String = "",
    val empresaNome: String = "",
    val empresaCodigo: Int = 0,
    val vendedor: String = "",
    val vendedorCodigo: String = "",
)

@Serializable
data class CadastroLinkHistorySummary(
    val clickCount: Int = 0,
    val identifiedAttempts: Int = 0,
    val anonymousDetailed: Int = 0,
    val detailedAccessEvents: Int = 0,
    val lastClickedAt: String? = null,
)

@Serializable
data class CadastroLinkHistoryRow(
    val id: String = "",
    val timestamp: String = "",
    val nomeRf: String? = null,
    val dependentes: List<String> = emptyList(),
    val telefone: String? = null,
    val status: String = "",
    val vendedor: String = "",
    val vendedorCodigo: String = "",
    val empresaNome: String = "",
    val empresaCodigo: Int = 0,
)

@OptIn(ExperimentalSerializationApi::class)
object FlexibleNullableIntSerializer : KSerializer<Int?> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleNullableInt", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: Int?) {
        if (value == null) {
            encoder.encodeNull()
        } else {
            encoder.encodeInt(value)
        }
    }

    override fun deserialize(decoder: Decoder): Int? {
        val jsonDecoder = decoder as? kotlinx.serialization.json.JsonDecoder
            ?: return decoder.decodeInt()
        val element = jsonDecoder.decodeJsonElement()
        if (element is JsonNull) return null
        val primitive = element as? JsonPrimitive ?: return null
        return primitive.content.trim().toIntOrNull()
    }
}

@OptIn(ExperimentalSerializationApi::class)
object FlexibleNullableStringSerializer : KSerializer<String?> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleNullableString", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: String?) {
        if (value == null) {
            encoder.encodeNull()
        } else {
            encoder.encodeString(value)
        }
    }

    override fun deserialize(decoder: Decoder): String? {
        val jsonDecoder = decoder as? kotlinx.serialization.json.JsonDecoder
            ?: return decoder.decodeString()
        val element = jsonDecoder.decodeJsonElement()
        if (element is JsonNull) return null
        val primitive = element as? JsonPrimitive ?: return null
        return primitive.contentOrNull?.trim()
    }
}

@OptIn(ExperimentalSerializationApi::class)
object FlexibleNullableBooleanSerializer : KSerializer<Boolean?> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleNullableBoolean", PrimitiveKind.BOOLEAN)

    override fun serialize(encoder: Encoder, value: Boolean?) {
        if (value == null) {
            encoder.encodeNull()
        } else {
            encoder.encodeBoolean(value)
        }
    }

    override fun deserialize(decoder: Decoder): Boolean? {
        val jsonDecoder = decoder as? kotlinx.serialization.json.JsonDecoder
            ?: return decoder.decodeBoolean()
        val element = jsonDecoder.decodeJsonElement()
        if (element is JsonNull) return null
        val primitive = element as? JsonPrimitive ?: return null
        val normalized = primitive.contentOrNull?.trim()?.lowercase().orEmpty()
        return when (normalized) {
            "true", "1", "sim", "yes", "y" -> true
            "false", "0", "nao", "não", "no", "n" -> false
            else -> null
        }
    }
}
