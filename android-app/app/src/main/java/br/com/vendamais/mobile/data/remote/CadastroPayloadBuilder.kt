package br.com.vendamais.mobile.data.remote

import br.com.vendamais.mobile.data.models.CadastroBaseData
import br.com.vendamais.mobile.data.models.CadastroContato
import br.com.vendamais.mobile.data.models.CadastroDetalhe
import br.com.vendamais.mobile.data.models.CadastroEndereco
import br.com.vendamais.mobile.data.models.DependenteCadastro
import br.com.vendamais.mobile.data.models.LemmitResponse
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

internal object CadastroPayloadBuilder {
    private const val DEFAULT_TIPO_LOGRADOURO = "816"
    private const val DEFAULT_BAIRRO = "1262"
    private const val DEFAULT_MUNICIPIO = "2"
    private const val DEFAULT_UF = "5"

    fun normalizeDigits(value: String?): String = value.orEmpty().filter(Char::isDigit)

    fun validateCpf(cpf: String): Boolean {
        val numbers = normalizeDigits(cpf)
        if (numbers.length != 11) return false
        if (numbers.all { it == numbers.first() }) return false

        fun calc(size: Int): Int {
            var sum = 0
            for (index in 0 until size) {
                sum += numbers[index].digitToInt() * ((size + 1) - index)
            }
            val remainder = (sum * 10) % 11
            return if (remainder == 10) 0 else remainder
        }

        return calc(9) == numbers[9].digitToInt() && calc(10) == numbers[10].digitToInt()
    }

    fun formatCpf(cpf: String): String {
        val digits = normalizeDigits(cpf)
        if (digits.length != 11) return digits
        return "${digits.substring(0, 3)}.${digits.substring(3, 6)}.${digits.substring(6, 9)}-${digits.substring(9)}"
    }

    fun formatDateFromIso(value: String): String {
        val raw = value.trim()
        if (raw.isBlank()) return ""

        val withoutTime = raw.substringBefore("T").substringBefore(" ")
        return when {
            Regex("""\d{4}-\d{2}-\d{2}""").matches(withoutTime) -> {
                val parts = withoutTime.split("-")
                "${parts[2]}/${parts[1]}/${parts[0]}"
            }
            Regex("""\d{2}/\d{2}/\d{4}""").matches(withoutTime) -> withoutTime
            Regex("""\d{2}-\d{2}-\d{4}""").matches(withoutTime) -> withoutTime.replace('-', '/')
            else -> {
                val parsed = runCatching {
                    OffsetDateTime.parse(raw).toLocalDate()
                }.recoverCatching {
                    Instant.parse(raw).atOffset(ZoneOffset.UTC).toLocalDate()
                }.recoverCatching {
                    LocalDate.parse(raw)
                }.getOrNull()

                parsed?.format(DateTimeFormatter.ofPattern("dd/MM/yyyy")).orEmpty()
            }
        }
    }

    fun normalizeIsoDateOrNull(value: String?): String? {
        val raw = value.orEmpty().trim()
        if (raw.isBlank()) return null

        val withoutTime = raw.substringBefore("T")
        return when {
            Regex("""\d{4}-\d{2}-\d{2}""").matches(withoutTime) -> withoutTime
            Regex("""\d{2}/\d{2}/\d{4}""").matches(withoutTime) -> {
                val parts = withoutTime.split("/")
                "${parts[2]}-${parts[1]}-${parts[0]}"
            }
            Regex("""\d{2}-\d{2}-\d{4}""").matches(withoutTime) -> {
                val parts = withoutTime.split("-")
                "${parts[2]}-${parts[1]}-${parts[0]}"
            }
            else -> null
        }
    }

    private fun currentPresentationTimestamp(): String {
        return OffsetDateTime.now(ZoneOffset.UTC)
            .format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"))
    }

    private fun requireBrDate(value: String, fieldLabel: String): String {
        val formatted = formatDateFromIso(value)
        if (!Regex("""\d{2}/\d{2}/\d{4}""").matches(formatted)) {
            throw IllegalStateException("$fieldLabel invalida para envio ao ERP.")
        }
        return formatted
    }

    fun mapLemmitToCadastro(lemitData: LemmitResponse?, cpf: String): CadastroBaseData {
        val pessoa = lemitData?.pessoa
        if (pessoa == null) {
            return CadastroBaseData(cpf = normalizeDigits(cpf))
        }

        val contatos = mutableListOf<CadastroContato>()

        val celularesOrdenados = pessoa.celulares
            .sortedBy { it.ranking ?: 999 }
        val celularesPreferenciais = celularesOrdenados
            .filter { it.plus == true }
            .ifEmpty { celularesOrdenados }

        celularesPreferenciais
            .forEachIndexed { index, item ->
                val numero = "${item.ddd ?: ""}${item.numero.orEmpty()}"
                if (numero.isNotBlank()) {
                    contatos += CadastroContato(
                        tipo = if (item.whatsapp == true) "whatsapp" else "celular",
                        valor = normalizeDigits(numero),
                        principal = index == 0,
                    )
                }
            }

        pessoa.fixos
            .sortedBy { it.ranking ?: 999 }
            .forEach { item ->
                val numero = "${item.ddd ?: ""}${item.numero.orEmpty()}"
                if (numero.isNotBlank()) {
                    contatos += CadastroContato(
                        tipo = "fixo",
                        valor = normalizeDigits(numero),
                    )
                }
            }

        pessoa.emails
            .sortedBy { it.ranking ?: 999 }
            .forEachIndexed { index, item ->
                if (!item.email.isNullOrBlank()) {
                    contatos += CadastroContato(
                        tipo = "email",
                        valor = item.email,
                        principal = index == 0,
                    )
                }
            }

        val endereco = pessoa.enderecos
            .sortedBy { it.ranking ?: 999 }
            .firstOrNull()
            ?.let { item ->
                CadastroEndereco(
                    cep = normalizeDigits(item.cep),
                    tipoLogradouro = item.tipoLogradouro.orEmpty(),
                    logradouro = item.logradouro.orEmpty(),
                    numero = item.numero.orEmpty(),
                    complemento = item.complemento.orEmpty(),
                    bairro = item.bairro.orEmpty(),
                    cidade = item.cidade.orEmpty(),
                    uf = item.uf.orEmpty(),
                )
            }

        val sexo = pessoa.sexo.orEmpty().trim().uppercase()
        val sexoCodigo = when (sexo) {
            "M", "MASCULINO" -> 1
            "F", "FEMININO" -> 0
            else -> 0
        }
        val dataNascimentoRaw = pessoa.dataNascimento
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: pessoa.dataNascimentoAlternativa
                ?.trim()
                ?.takeIf { it.isNotBlank() }
        val dataNascimento = normalizeIsoDateOrNull(dataNascimentoRaw).orEmpty()
        val nomeMae = pessoa.nomeMae
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: pessoa.nomeMaeAlternativa
                ?.trim()
                ?.takeIf { it.isNotBlank() }

        return CadastroBaseData(
            cpf = normalizeDigits(cpf),
            nome = pessoa.nome.orEmpty().trim(),
            dataNascimento = dataNascimento,
            sexo = sexo,
            sexoCodigo = sexoCodigo,
            contatos = contatos,
            endereco = endereco,
            nomeMae = nomeMae,
            numeroMatricula = null,
        )
    }

    fun detailToBaseData(json: Json, cadastro: CadastroDetalhe): CadastroBaseData {
        val contatos = decodeContatos(json, cadastro.contatos)
        val endereco = decodeEndereco(json, cadastro.endereco)
        return CadastroBaseData(
            cpf = normalizeDigits(cadastro.cpf),
            nome = cadastro.nome.orEmpty(),
            dataNascimento = cadastro.dataNascimento.orEmpty(),
            sexo = when (cadastro.sexoCodigo) {
                1 -> "M"
                0 -> "F"
                else -> ""
            },
            sexoCodigo = cadastro.sexoCodigo ?: 0,
            contatos = contatos,
            endereco = endereco,
            nomeMae = cadastro.nomeMae,
            numeroMatricula = cadastro.numeroMatricula
                ?.trim()
                ?.takeIf { it.isNotBlank() },
        )
    }

    fun detailDependentes(json: Json, cadastro: CadastroDetalhe, funcionarioCadastro: Int): List<DependenteCadastro> {
        val decoded = decodeDependentes(cadastro.dependentes)
        if (decoded.isNotEmpty()) return decoded

        val sexoCodigo = cadastro.sexoCodigo ?: 0
        return listOf(
            DependenteCadastro(
                tipo = 1,
                nome = cadastro.nome.orEmpty(),
                dataNascimento = cadastro.dataNascimento.orEmpty(),
                cpf = normalizeDigits(cadastro.cpf),
                sexo = sexoCodigo,
                sexoDescricao = if (sexoCodigo == 1) "Masculino" else "Feminino",
                plano = cadastro.planoCodigo ?: 0,
                planoValor = "0,00",
                nomeMae = cadastro.nomeMae.orEmpty(),
                carenciaAtendimento = 0,
                funcionarioCadastro = funcionarioCadastro,
            ),
        )
    }

    fun enrichEndereco(base: CadastroEndereco?, response: JsonElement?): CadastroEndereco? {
        if (base == null || response !is JsonObject) return base
        val dados = response["dados"]?.jsonObject ?: return base
        return base.copy(
            idTipoLogradouro = dados["IdTipoLogradouro"]?.jsonPrimitive?.intOrNull ?: base.idTipoLogradouro,
            tipoLogradouro = dados["TipoLogradouro"]?.jsonPrimitive?.contentOrNull ?: base.tipoLogradouro,
            logradouro = dados["Logradouro"]?.jsonPrimitive?.contentOrNull ?: base.logradouro,
            idBairro = dados["IdBairro"]?.jsonPrimitive?.intOrNull ?: base.idBairro,
            bairro = dados["Bairro"]?.jsonPrimitive?.contentOrNull ?: base.bairro,
            idMunicipio = dados["IdMunicipio"]?.jsonPrimitive?.intOrNull ?: base.idMunicipio,
            cidade = dados["Municipio"]?.jsonPrimitive?.contentOrNull ?: base.cidade,
            idUf = dados["IdUf"]?.jsonPrimitive?.intOrNull ?: base.idUf,
            uf = dados["Uf"]?.jsonPrimitive?.contentOrNull ?: base.uf,
            ufSigla = dados["UfSigla"]?.jsonPrimitive?.contentOrNull ?: base.ufSigla,
        )
    }

    fun buildDependenteTitular(base: CadastroBaseData, funcionarioCadastro: Int): DependenteCadastro {
        val sexoCodigo = base.sexoCodigo
        val sexoDescricao = if (sexoCodigo == 1) "Masculino" else "Feminino"
        return DependenteCadastro(
            tipo = 1,
            nome = base.nome,
            dataNascimento = base.dataNascimento,
            cpf = normalizeDigits(base.cpf),
            sexo = sexoCodigo,
            sexoDescricao = sexoDescricao,
            plano = 0,
            planoValor = "0,00",
            nomeMae = base.nomeMae.orEmpty(),
            carenciaAtendimento = 0,
            funcionarioCadastro = funcionarioCadastro,
        )
    }

    fun buildErpPayload(
        cadastro: CadastroBaseData,
        dependentes: List<DependenteCadastro>,
        empresaId: Int,
        vendedorCodigo: String?,
        funcionarioCadastroId: Int?,
        userRole: String?,
        userExternalId: String?,
        adesionistaCodigo: String?,
        arquivoPath: String? = null,
    ): JsonObject {
        val titularDataNascimento = requireBrDate(
            value = cadastro.dataNascimento,
            fieldLabel = "Data de nascimento do titular",
        )
        val sexoDescricao = if (cadastro.sexoCodigo == 1) "Masculino" else "Feminino"
        val codigoVendedor = when {
            userRole == "VENDEDOR" && !userExternalId.isNullOrBlank() -> userExternalId.toIntOrNull() ?: 0
            !vendedorCodigo.isNullOrBlank() -> vendedorCodigo.toIntOrNull() ?: 0
            else -> 0
        }
        val codigoAdesionista = adesionistaCodigo?.toIntOrNull() ?: 0
        val funcionarioCadastroCode = userExternalId?.toIntOrNull() ?: funcionarioCadastroId ?: 0
        val endereco = cadastro.endereco ?: CadastroEndereco()

        return buildJsonObject {
            put("empresa", empresaId.toString())
            put("dados", buildJsonObject {
                put("parceiro", buildJsonObject {
                    put("codigo", codigoVendedor)
                    put("tipoCobranca", 1)
                    if (codigoAdesionista > 0) {
                        put("adesionista", codigoAdesionista)
                    }
                })
                put("parcelaRetidaComissao", "0")
                put("responsavelFinanceiro", buildJsonObject {
                    put("codigoContrato", empresaId.toString())
                    put("nome", cadastro.nome)
                    put("dataNascimento", titularDataNascimento)
                    put("cpf", formatCpf(cadastro.cpf))
                    put("sexo", cadastro.sexoCodigo)
                    put("grupoFaturamento", 0)
                    put("sexoDescricao", sexoDescricao)
                    put("identidadeNumero", "123456789")
                    put("identidadeOrgaoExpeditor", "SSPDS")
                    put("endereco", buildJsonObject {
                        put("cep", normalizeDigits(endereco.cep))
                        put("tipoLogradouro", (endereco.idTipoLogradouro?.toString() ?: DEFAULT_TIPO_LOGRADOURO))
                        put("logradouro", endereco.logradouro)
                        put("numero", endereco.numero)
                        put("complemento", endereco.complemento.ifBlank { "N/D" })
                        put("bairro", (endereco.idBairro?.toString() ?: DEFAULT_BAIRRO))
                        put("municipio", (endereco.idMunicipio?.toString() ?: DEFAULT_MUNICIPIO))
                        put("uf", (endereco.idUf?.toString() ?: DEFAULT_UF))
                        put("descricaoUf", endereco.ufSigla ?: endereco.uf)
                    })
                    put("contatoResponsavelFinanceiro", kotlinx.serialization.json.buildJsonArray {
                        cadastro.contatos.forEach { contato ->
                            add(buildJsonObject {
                                put("tipo", contatoTipoCodigo(contato.tipo))
                                put("dado", contato.valor)
                            })
                        }
                    })
                    cadastro.numeroMatricula
                        ?.trim()
                        ?.takeIf { it.isNotBlank() }
                        ?.let { put("Matricula", it) }
                    put("fl_AlteraSituacao", 1)
                    put("dataApresentacao", currentPresentationTimestamp())
                })
                put("dependente", kotlinx.serialization.json.buildJsonArray {
                    dependentes.forEachIndexed { index, dependente ->
                        val dependenteDataNascimento = requireBrDate(
                            value = dependente.dataNascimento,
                            fieldLabel = "Data de nascimento do dependente ${index + 1}",
                        )
                        if (dependente.plano <= 0) {
                            throw IllegalStateException("Dependente ${index + 1} sem plano valido para envio.")
                        }
                        add(buildJsonObject {
                            put("tipo", dependente.tipo)
                            put("nome", dependente.nome)
                            put("dataNascimento", dependenteDataNascimento)
                            put("cpf", formatCpf(dependente.cpf))
                            put("sexo", dependente.sexo)
                            put("sexoDescricao", dependente.sexoDescricao)
                            put("plano", dependente.plano)
                            put("planoValor", dependente.planoValor)
                            put("nomeMae", dependente.nomeMae)
                            put("carenciaAtendimento", dependente.carenciaAtendimento)
                            put("funcionarioCadastro", funcionarioCadastroCode)
                        })
                    }
                })
                arquivoPath?.trim()?.takeIf { it.isNotBlank() }?.let { path ->
                    put("documento", buildJsonObject {
                        put("caminho", path)
                        put("nome", path.substringAfterLast('/'))
                    })
                }
            })
        }
    }

    fun firstDependenteCodigo(response: JsonElement?): Int? {
        val root = runCatching { response?.jsonObject }.getOrNull() ?: return null
        val payloads = listOfNotNull(
            root,
            runCatching { root["data"]?.jsonObject }.getOrNull(),
            runCatching { root["data"]?.jsonObject?.get("data")?.jsonObject }.getOrNull(),
        )

        payloads.forEach { payload ->
            val dados = runCatching { payload["dados"]?.jsonObject }.getOrNull() ?: return@forEach
            dados["codigo"]
                ?.jsonPrimitive
                ?.contentOrNull
                ?.toIntOrNull()
                ?.takeIf { it > 0 }
                ?.let { return it }

            listOf("dependentes", "dependente").forEach { key ->
                val value = dados[key] ?: return@forEach
                val items = runCatching { value.jsonArray.toList() }
                    .getOrElse { listOf(value) }
                items.forEach { item ->
                    val obj = runCatching { item.jsonObject }.getOrNull() ?: return@forEach
                    listOf("codigo", "codigoDependente", "idDependente").forEach { codeKey ->
                        obj[codeKey]
                            ?.jsonPrimitive
                            ?.contentOrNull
                            ?.toIntOrNull()
                            ?.takeIf { it > 0 }
                            ?.let { return it }
                    }
                }
            }
        }

        return null
    }

    private fun contatoTipoCodigo(tipo: String): Int {
        return when (tipo) {
            "celular" -> 8
            "whatsapp" -> 10
            "fixo" -> 1
            "email" -> 50
            else -> 8
        }
    }

    private fun decodeEndereco(json: Json, value: JsonElement?): CadastroEndereco? {
        val normalized = decodeEmbeddedJsonElement(value) ?: return null
        runCatching { json.decodeFromJsonElement(CadastroEndereco.serializer(), normalized) }
            .getOrNull()
            ?.let { return it }

        val obj = resolveEnderecoObject(normalized) ?: return null
        val municipioObj = obj.readObject("municipio", "Municipio")
        val bairroObj = obj.readObject("bairro", "Bairro")
        val tipoLogradouroObj = obj.readObject("tipoLogradouro", "TipoLogradouro")
        val ufObj = obj.readObject("uf", "Uf", "estado", "Estado")
        val uf = obj.readString("uf", "Uf", "descricaoUf", "ufSigla", "UfSigla")
            ?: ufObj?.readString("sigla", "uf", "descricao", "nome")
            ?: municipioObj?.readString("uf", "Uf", "ufSigla", "UfSigla")

        return CadastroEndereco(
            cep = obj.readString("cep", "CEP", "codigoPostal", "postalCode")
                ?.filter(Char::isDigit)
                .orEmpty()
                .take(8),
            tipoLogradouro = obj.readString("tipoLogradouro", "tipo_logradouro", "TipoLogradouro")
                ?: tipoLogradouroObj?.readString("nome", "descricao", "tipo")
                ?: "",
            logradouro = obj.readString("logradouro", "Logradouro", "endereco", "Endereco").orEmpty(),
            numero = obj.readString("numero", "Numero", "numeroLogradouro").orEmpty(),
            complemento = obj.readString("complemento", "Complemento").orEmpty(),
            bairro = obj.readString("bairro", "Bairro")
                ?: bairroObj?.readString("nome", "descricao")
                ?: "",
            cidade = obj.readString("cidade", "Cidade", "municipio", "Municipio")
                ?: municipioObj?.readString("nome", "descricao", "municipio", "cidade")
                ?: "",
            uf = uf.orEmpty().uppercase().take(2),
            idTipoLogradouro = obj.readInt("idTipoLogradouro", "IdTipoLogradouro")
                ?: tipoLogradouroObj?.readInt("id", "Id", "codigo"),
            idBairro = obj.readInt("idBairro", "IdBairro")
                ?: bairroObj?.readInt("id", "Id", "codigo"),
            idMunicipio = obj.readInt("idMunicipio", "IdMunicipio")
                ?: municipioObj?.readInt("id", "Id", "codigo", "codigoMunicipio"),
            idUf = obj.readInt("idUf", "IdUf")
                ?: ufObj?.readInt("id", "Id", "codigo", "codigoUf"),
            ufSigla = obj.readString("ufSigla", "UfSigla", "descricaoUf")
                ?: ufObj?.readString("sigla", "uf"),
        )
    }

    private fun decodeContatos(json: Json, value: JsonElement?): List<CadastroContato> {
        val normalized = decodeEmbeddedJsonElement(value) ?: return emptyList()
        val contatosArray = when (normalized) {
            is JsonArray -> normalized
            is JsonObject -> {
                normalized.readArray("contatos", "telefones", "items")
                    ?: normalized.readObject("dados", "data")?.readArray("contatos", "telefones", "items")
            }
            else -> null
        } ?: return emptyList()

        val decoded = runCatching {
            json.decodeFromJsonElement(ListSerializer(CadastroContato.serializer()), contatosArray)
        }.getOrDefault(emptyList())
        if (decoded.isNotEmpty()) return decoded

        return contatosArray.mapNotNull { item ->
            val obj = item.readObject() ?: return@mapNotNull null
            val tipoRaw = obj.readString("tipo", "tipoContato", "tipo_contato", "kind")
                ?.lowercase()
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
            val principal = obj["principal"]?.jsonPrimitive?.contentOrNull?.equals("true", ignoreCase = true)
                ?: false
            CadastroContato(tipo = tipo, valor = valor, principal = principal)
        }.distinctBy { "${it.tipo}:${it.valor}" }
    }

    private fun decodeDependentes(value: JsonElement?): List<DependenteCadastro> {
        val normalized = decodeEmbeddedJsonElement(value) ?: return emptyList()
        val dependentes = when (normalized) {
            is JsonArray -> normalized
            is JsonObject -> {
                normalized.readArray("dependentes", "items")
                    ?: normalized.readObject("dados", "data")?.readArray("dependentes", "items")
            }
            else -> null
        } ?: return emptyList()

        return dependentes.mapNotNull { item ->
            val obj = item.readObject() ?: return@mapNotNull null
            val nome = obj.readString("nome").orEmpty().trim()
            if (nome.isBlank()) return@mapNotNull null

            val dataNascimento = obj.readString("dataNascimento", "data_nascimento").orEmpty().trim()
            val cpf = obj.readString("cpf").orEmpty()
            val sexo = obj.readInt("sexo") ?: when (obj.readString("sexoDescricao", "sexo_descricao")?.trim()?.lowercase()) {
                "masculino" -> 1
                "feminino" -> 0
                else -> 0
            }
            val sexoDescricao = obj.readString("sexoDescricao", "sexo_descricao")
                ?.takeIf { it.isNotBlank() }
                ?: if (sexo == 1) "Masculino" else "Feminino"

            DependenteCadastro(
                tipo = obj.readInt("tipo", "parentesco") ?: 0,
                nome = nome,
                dataNascimento = dataNascimento,
                cpf = cpf,
                sexo = sexo,
                sexoDescricao = sexoDescricao,
                plano = obj.readInt("plano", "plano_codigo", "planoCodigo") ?: 0,
                planoValor = obj.readString("planoValor", "plano_valor").orEmpty().ifBlank { "0,00" },
                nomeMae = obj.readString("nomeMae", "nome_mae").orEmpty(),
                carenciaAtendimento = obj.readInt("carenciaAtendimento", "carencia_atendimento") ?: 0,
                funcionarioCadastro = obj.readInt("funcionarioCadastro", "funcionario_cadastro") ?: 0,
            )
        }
    }

    private fun decodeEmbeddedJsonElement(value: JsonElement?): JsonElement? {
        val element = value ?: return null
        if (element is JsonPrimitive) {
            val raw = element.contentOrNull?.trim().orEmpty()
            if (raw.isBlank()) return null
            if (raw.startsWith("{") || raw.startsWith("[")) {
                return runCatching { Json.parseToJsonElement(raw) }.getOrNull() ?: element
            }
        }
        return element
    }

    private fun resolveEnderecoObject(value: JsonElement?): JsonObject? {
        val root = value?.readObject() ?: return null
        val data = root.readObject("data", "Data")
        val dados = root.readObject("dados", "Dados")
        val responsavel = root.readObject("responsavelFinanceiro", "responsavel_financeiro", "ResponsavelFinanceiro")
        val nestedResponsavel = data?.readObject("responsavelFinanceiro", "responsavel_financeiro", "ResponsavelFinanceiro")
        val candidates = listOfNotNull(
            root,
            root.readObject("endereco", "Endereco"),
            data,
            data?.readObject("endereco", "Endereco"),
            dados,
            dados?.readObject("endereco", "Endereco"),
            responsavel,
            responsavel?.readObject("endereco", "Endereco"),
            nestedResponsavel,
            nestedResponsavel?.readObject("endereco", "Endereco"),
        )
        return candidates.firstOrNull { candidate ->
            candidate.containsKey("cep") ||
                candidate.containsKey("CEP") ||
                candidate.containsKey("logradouro") ||
                candidate.containsKey("Logradouro") ||
                candidate.containsKey("bairro") ||
                candidate.containsKey("Bairro") ||
                candidate.containsKey("cidade") ||
                candidate.containsKey("Cidade") ||
                candidate.containsKey("municipio") ||
                candidate.containsKey("Municipio") ||
                candidate.containsKey("uf") ||
                candidate.containsKey("Uf")
        } ?: candidates.firstOrNull()
    }
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

private fun JsonObject.readObject(vararg keys: String): JsonObject? {
    if (keys.isEmpty()) return runCatching { this }.getOrNull()
    keys.forEach { key ->
        runCatching { this[key]?.jsonObject }.getOrNull()?.let { return it }
        val embedded = runCatching { this[key] as? JsonPrimitive }.getOrNull()?.contentOrNull?.trim().orEmpty()
        if (embedded.startsWith("{")) {
            runCatching { Json.parseToJsonElement(embedded).jsonObject }.getOrNull()?.let { return it }
        }
    }
    return null
}

private fun JsonObject.readArray(vararg keys: String): JsonArray? {
    keys.forEach { key ->
        runCatching { this[key]?.jsonArray }.getOrNull()?.let { return it }
        val embedded = runCatching { this[key] as? JsonPrimitive }.getOrNull()?.contentOrNull?.trim().orEmpty()
        if (embedded.startsWith("[")) {
            runCatching { Json.parseToJsonElement(embedded).jsonArray }.getOrNull()?.let { return it }
        }
    }
    return null
}

private fun JsonElement.readObject(): JsonObject? {
    return when (this) {
        is JsonObject -> this
        is JsonPrimitive -> {
            val raw = contentOrNull?.trim().orEmpty()
            if (raw.startsWith("{")) {
                runCatching { Json.parseToJsonElement(raw).jsonObject }.getOrNull()
            } else {
                null
            }
        }
        else -> null
    }
}

private val JsonPrimitive.contentOrNull: String?
    get() = content.takeIf { !isString || content.isNotBlank() }
