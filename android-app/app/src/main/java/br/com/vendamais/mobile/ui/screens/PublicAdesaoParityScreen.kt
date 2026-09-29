package br.com.vendamais.mobile.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.data.models.PublicCadastroContato
import br.com.vendamais.mobile.data.models.PublicCadastroContractPayload
import br.com.vendamais.mobile.data.models.PublicCadastroDependente
import br.com.vendamais.mobile.data.models.PublicCadastroEndereco
import br.com.vendamais.mobile.data.models.PublicCadastroLinkInfo
import br.com.vendamais.mobile.data.remote.CadastroPayloadBuilder
import br.com.vendamais.mobile.domain.cadastro.CadastroApiErrorMapper
import br.com.vendamais.mobile.ui.AppViewModel
import br.com.vendamais.mobile.ui.components.OdontoartBrandMark
import br.com.vendamais.mobile.ui.components.ScreenHeading
import br.com.vendamais.mobile.ui.components.VendaButton
import br.com.vendamais.mobile.ui.components.VendaButtonSize
import br.com.vendamais.mobile.ui.components.VendaButtonStyle
import br.com.vendamais.mobile.ui.components.VendaFeedbackTone
import br.com.vendamais.mobile.ui.components.VendaInlineFeedback
import br.com.vendamais.mobile.ui.components.VendaLoadingState
import br.com.vendamais.mobile.ui.components.VendaWizardProgress
import br.com.vendamais.mobile.ui.components.WebCard
import br.com.vendamais.mobile.ui.components.bringIntoViewOnFocus
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate
import java.util.Locale
import java.util.UUID

private const val ASSOCIADO_GOOGLE_PLAY_URL =
    "https://play.google.com/store/apps/details?id=com.odontoart.associado&pli=1"

private enum class PublicStage {
    IDENTIFY,
    DETAILS,
    DEPENDENTS,
    REVIEW,
    CONTRACT,
    SUCCESS,
    COMPLETED,
    NOT_ELIGIBLE,
}

private data class PublicContactDraft(
    val key: String = UUID.randomUUID().toString(),
    val tipo: String = "whatsapp",
    val valor: String = "",
    val principal: Boolean = false,
)

private data class PublicDependentDraft(
    val key: String = UUID.randomUUID().toString(),
    val tipo: Int = 0,
    val nome: String = "",
    val dataNascimento: String = "",
    val cpf: String = "",
    val sexo: Int = -1,
    val plano: Int = 0,
    val planoValor: String = "0,00",
    val nomeMae: String = "",
)

private fun coverageFamilyLabel(code: Int): String = when (code) {
    18 -> "Multiprev"
    19 -> "Multiplus"
    2, 17, 20 -> "Multimaster"
    else -> "Plano sem cobertura configurada"
}

private data class PublicSecurePlan(
    val codigo: Int,
    val nome: String,
    val valorTitular: Double,
    val valorDependente: Double,
) {
    fun titularValor(): String = formatPlanValue(valorTitular)
    fun dependenteValor(): String = formatPlanValue(valorDependente)
}

@Composable
fun PublicAdesaoParityScreen(
    token: String,
    viewModel: AppViewModel,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var loading by rememberSaveable(token) { mutableStateOf(true) }
    var busy by rememberSaveable(token) { mutableStateOf(false) }
    var link by remember { mutableStateOf<PublicCadastroLinkInfo?>(null) }
    var invalidConsultant by remember { mutableStateOf<br.com.vendamais.mobile.data.models.PublicConsultantInfo?>(null) }
    var error by rememberSaveable(token) { mutableStateOf<String?>(null) }
    var notice by rememberSaveable(token) { mutableStateOf<String?>(null) }
    var validationErrors by remember { mutableStateOf<List<String>>(emptyList()) }
    var stageName by rememberSaveable(token) { mutableStateOf(PublicStage.IDENTIFY.name) }
    val stage = runCatching { PublicStage.valueOf(stageName) }.getOrDefault(PublicStage.IDENTIFY)

    var cpf by rememberSaveable(token) { mutableStateOf("") }
    var birthDate by rememberSaveable(token) { mutableStateOf("") }
    var attemptToken by rememberSaveable(token) { mutableStateOf("") }

    var nome by rememberSaveable(token) { mutableStateOf("") }
    var dataNascimento by rememberSaveable(token) { mutableStateOf("") }
    var sexo by rememberSaveable(token) { mutableStateOf(-1) }
    var nomeMae by rememberSaveable(token) { mutableStateOf("") }
    var numeroMatricula by rememberSaveable(token) { mutableStateOf("") }
    var titularPlano by rememberSaveable(token) { mutableStateOf(0) }

    var cep by rememberSaveable(token) { mutableStateOf("") }
    var tipoLogradouro by rememberSaveable(token) { mutableStateOf("") }
    var logradouro by rememberSaveable(token) { mutableStateOf("") }
    var numero by rememberSaveable(token) { mutableStateOf("") }
    var complemento by rememberSaveable(token) { mutableStateOf("") }
    var bairro by rememberSaveable(token) { mutableStateOf("") }
    var cidade by rememberSaveable(token) { mutableStateOf("") }
    var uf by rememberSaveable(token) { mutableStateOf("") }
    var idTipoLogradouro by rememberSaveable(token) { mutableStateOf<Int?>(null) }
    var idBairro by rememberSaveable(token) { mutableStateOf<Int?>(null) }
    var idMunicipio by rememberSaveable(token) { mutableStateOf<Int?>(null) }
    var idUf by rememberSaveable(token) { mutableStateOf<Int?>(null) }

    val contatos = remember(token) { mutableStateListOf<PublicContactDraft>() }
    val dependentes = remember(token) { mutableStateListOf<PublicDependentDraft>() }
    var dependentLookupKey by rememberSaveable(token) { mutableStateOf<String?>(null) }

    var emailDialogOpen by rememberSaveable(token) { mutableStateOf(false) }
    var emailToConfirm by rememberSaveable(token) { mutableStateOf("") }
    var contractToken by rememberSaveable(token) { mutableStateOf("") }
    var contractText by rememberSaveable(token) { mutableStateOf("") }
    var contractHash by rememberSaveable(token) { mutableStateOf("") }
    var acceptedTerms by rememberSaveable(token) { mutableStateOf(false) }
    var acceptedData by rememberSaveable(token) { mutableStateOf(false) }
    var acceptedCoverage by rememberSaveable(token) { mutableStateOf(false) }
    var preparedCoverageUrl by rememberSaveable(token) { mutableStateOf("") }
    var successMessage by rememberSaveable(token) { mutableStateOf("") }
    val linkVisitId = rememberSaveable(token) { UUID.randomUUID().toString() }

    fun setStage(value: PublicStage) {
        stageName = value.name
        error = null
        notice = null
        validationErrors = emptyList()
    }

    LaunchedEffect(token) {
        loading = true
        runCatching { viewModel.resolvePublicCadastroLink(token, linkVisitId) }
            .onSuccess { result ->
                if (result.ok && result.link != null) {
                    link = result.link
                } else {
                    invalidConsultant = result.consultant
                    error = result.error ?: "Link invalido ou inativo."
                }
            }
            .onFailure {
                error = CadastroApiErrorMapper.mapUserMessage(it.message, "Falha ao carregar link.")
            }
        loading = false
    }

    val currentLink = link
    val plans = remember(currentLink?.id, currentLink?.planos, currentLink?.planosRaw) {
        if (currentLink?.planos.orEmpty().isNotEmpty()) {
            currentLink!!.planos.map {
                PublicSecurePlan(
                    codigo = it.plano,
                    nome = it.nomeExibicao.ifBlank { "Plano ${it.plano}" },
                    valorTitular = it.valorTitular,
                    valorDependente = it.valorDependente,
                )
            }
        } else {
            extractLegacyPlans(currentLink?.planosRaw, currentLink?.planosOcultos.orEmpty())
        }
    }
    // Apenas a sessao preparada pelo servidor determina se ha cobertura a apresentar.
    val coverageUrl = preparedCoverageUrl
    val coverageLabel = coverageFamilyLabel(titularPlano)
    val scrollState = rememberScrollState()
    LaunchedEffect(stageName) { scrollState.scrollTo(0) }
    LaunchedEffect(titularPlano) { preparedCoverageUrl = "" }
    LaunchedEffect(titularPlano, coverageUrl) { acceptedCoverage = false }
    val relationships = remember(currentLink?.id, currentLink?.parentescos) {
        currentLink?.parentescos.orEmpty()
            .filter { it.ativo && it.resolvedId > 1 }
            .map { it.resolvedId to it.label }
    }

    if (loading) {
        PublicLoadingScreen()
        return
    }

    if (currentLink == null) {
        PublicUnavailableScreen(error = error, consultant = invalidConsultant, onClose = onClose)
        return
    }

    if (stage == PublicStage.COMPLETED) {
        PublicFinalStateScreen(
            title = "Sua adesão já foi realizada",
            message = "Identificamos que você já concluiu sua adesão. Para consultar seu plano ou realizar outras solicitações, utilize o App do Associado.",
            consultantName = currentLink.vendedorNome,
            consultantPhone = currentLink.vendedorTelefone,
            onInstallApp = { openAssociadoApp(context) },
            onClose = onClose,
        )
        return
    }

    if (stage == PublicStage.NOT_ELIGIBLE) {
        PublicFinalStateScreen(
            title = "Vamos continuar seu atendimento pelo WhatsApp",
            message = "Não foi possível concluir por este canal, mas fique tranquilo. Seu consultor está disponível para continuar seu atendimento.",
            consultantName = currentLink.vendedorNome,
            consultantPhone = currentLink.vendedorTelefone,
            onInstallApp = { openAssociadoApp(context) },
            onClose = onClose,
        )
        return
    }

    if (stage == PublicStage.SUCCESS) {
        PublicFinalStateScreen(
            title = "Adesão recebida",
            message = successMessage,
            consultantName = currentLink.vendedorNome,
            consultantPhone = currentLink.vendedorTelefone,
            onInstallApp = { openAssociadoApp(context) },
            onClose = onClose,
        )
        return
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .imePadding()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(scrollState),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                OdontoartBrandMark(modifier = Modifier.fillMaxWidth())
                ScreenHeading(
                    "Nova Adesão",
                    "Empresa: ${currentLink.empresaNome}" +
                        (currentLink.vendedorNome?.takeIf { it.isNotBlank() }?.let { " · Consultor: $it" } ?: ""),
                )
                ConsultantContactCard(currentLink.vendedorNome, currentLink.vendedorTelefone)

                if (stage != PublicStage.IDENTIFY) {
                    val progressStep = when (stage) {
                        PublicStage.DETAILS -> 1
                        PublicStage.DEPENDENTS -> 2
                        PublicStage.REVIEW -> 3
                        PublicStage.CONTRACT -> 4
                        else -> 1
                    }
                    VendaWizardProgress(
                        currentStep = progressStep,
                        labels = listOf("Dados", "Plano", "Dependentes", "Confirmação"),
                    )
                }

                error?.let {
                    VendaInlineFeedback(
                        title = "Revise esta etapa",
                        message = it,
                        tone = VendaFeedbackTone.ERROR,
                    )
                }
                notice?.let {
                    VendaInlineFeedback(
                        title = "Informacao",
                        message = it,
                        tone = VendaFeedbackTone.SUCCESS,
                    )
                }

                when (stage) {
                    PublicStage.IDENTIFY -> {
                        WebCard {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text(
                                    "Vamos comecar sua adesao",
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    "Informe CPF e data de nascimento do responsavel financeiro para validar sua identidade.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                OutlinedTextField(
                                    value = cpf,
                                    onValueChange = { cpf = it.filter(Char::isDigit).take(11) },
                                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                    label = { Text("CPF") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    isError = validationErrors.contains("CPF"),
                                    enabled = !busy,
                                )
                                OutlinedTextField(
                                    value = displayBirthDate(birthDate),
                                    onValueChange = { birthDate = parseBirthDate(it) },
                                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                    label = { Text("Data de nascimento (dd/mm/aaaa)") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    isError = validationErrors.contains("Data de nascimento"),
                                    enabled = !busy,
                                )
                                VendaButton(
                                    label = "Continuar",
                                    onClick = authenticate@{
                                        val cpfDigits = cpf.filter(Char::isDigit)
                                        val missing = listOfNotNull(
                                            if (!CadastroPayloadBuilder.validateCpf(cpfDigits)) "CPF" else null,
                                            if (!isIsoDate(birthDate)) "Data de nascimento" else null,
                                        )
                                        if (missing.isNotEmpty()) {
                                            validationErrors = missing
                                            error = null
                                            return@authenticate
                                        }
                                        busy = true
                                        error = null
                                        scope.launch {
                                            runCatching {
                                                viewModel.authenticatePublicCadastro(
                                                    token = token,
                                                    cpf = cpfDigits,
                                                    birthDate = birthDate,
                                                )
                                            }.onSuccess { response ->
                                                when (response.state) {
                                                    "completed" -> setStage(PublicStage.COMPLETED)
                                                    "not_eligible" -> setStage(PublicStage.NOT_ELIGIBLE)
                                                    "authenticated" -> {
                                                        val person = response.person
                                                        val sessionToken = response.attemptToken
                                                        if (person == null || sessionToken.isNullOrBlank()) {
                                                            error = "Nao foi possivel iniciar a adesao."
                                                        } else {
                                                            attemptToken = sessionToken
                                                            cpf = person.cpf?.filter(Char::isDigit)?.take(11)
                                                                ?.takeIf { it.isNotBlank() } ?: cpfDigits
                                                            nome = person.nome.orEmpty()
                                                            dataNascimento = person.dataNascimento.orEmpty().ifBlank { birthDate }
                                                            sexo = person.sexoCodigo ?: -1
                                                            nomeMae = person.nomeMae.orEmpty()

                                                            contatos.clear()
                                                            person.contatos.forEachIndexed { index, contact ->
                                                                contatos.add(
                                                                    PublicContactDraft(
                                                                        tipo = contact.tipo,
                                                                        valor = contact.valor,
                                                                        principal = contact.principal ||
                                                                            (index == 0 && person.contatos.none { it.principal }),
                                                                    ),
                                                                )
                                                            }
                                                            if (contatos.none { it.tipo in setOf("whatsapp", "celular", "fixo") }) {
                                                                contatos.add(PublicContactDraft(principal = true))
                                                            }
                                                            if (contatos.none { it.tipo == "email" }) {
                                                                contatos.add(PublicContactDraft(tipo = "email"))
                                                            }

                                                            person.endereco?.let { address ->
                                                                cep = address.cep.filter(Char::isDigit).take(8)
                                                                tipoLogradouro = address.tipoLogradouro.orEmpty()
                                                                logradouro = address.logradouro
                                                                numero = address.numero
                                                                complemento = address.complemento.orEmpty()
                                                                bairro = address.bairro
                                                                cidade = address.cidade
                                                                uf = (address.ufSigla ?: address.uf).uppercase().take(2)
                                                                idTipoLogradouro = address.idTipoLogradouro
                                                                idBairro = address.idBairro
                                                                idMunicipio = address.idMunicipio
                                                                idUf = address.idUf
                                                            }
                                                            if (plans.size == 1) titularPlano = plans.first().codigo
                                                            setStage(PublicStage.DETAILS)
                                                        }
                                                    }
                                                    else -> error = response.error ?: "Nao foi possivel validar seus dados."
                                                }
                                            }.onFailure {
                                                error = CadastroApiErrorMapper.mapUserMessage(
                                                    it.message,
                                                    "Nao foi possivel validar seus dados.",
                                                )
                                            }
                                            busy = false
                                        }
                                    },
                                    loading = busy,
                                    enabled = !busy,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }

                    PublicStage.DETAILS -> {
                        WebCard {
                            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                                Text(
                                    "Seus dados",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                OutlinedTextField(
                                    nome,
                                    { nome = it },
                                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                    label = { Text("Nome completo") },
                                    enabled = !busy,
                                )
                                OutlinedTextField(
                                    displayBirthDate(dataNascimento),
                                    { dataNascimento = parseBirthDate(it) },
                                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                    label = { Text("Data de nascimento (dd/mm/aaaa)") },
                                    enabled = false,
                                )
                                PublicChoiceField(
                                    "Sexo",
                                    if (sexo == 1) "Masculino" else if (sexo == 0) "Feminino" else "Selecione",
                                    listOf(1 to "Masculino", 0 to "Feminino"),
                                ) { sexo = it }
                                OutlinedTextField(
                                    nomeMae,
                                    { nomeMae = it },
                                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                    label = { Text("Nome da mae") },
                                    enabled = !busy,
                                )
                                if (currentLink.empresaExigeMatricula == 1) {
                                    OutlinedTextField(
                                        numeroMatricula,
                                        { numeroMatricula = it },
                                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                        label = { Text("Matricula") },
                                        enabled = !busy,
                                    )
                                }
                                PublicChoiceField(
                                    "Plano do titular",
                                    plans.firstOrNull { it.codigo == titularPlano }?.let {
                                        "${it.nome} - R$ ${it.titularValor()}"
                                    } ?: "Selecione",
                                    plans.map { it.codigo to "${it.nome} - R$ ${it.titularValor()}" },
                                ) { titularPlano = it }
                            }
                        }

                        ContactsCard(contatos, busy)

                        WebCard {
                            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                                Text(
                                    "Endereco",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        cep,
                                        { cep = it.filter(Char::isDigit).take(8) },
                                        modifier = Modifier.weight(1f).bringIntoViewOnFocus(),
                                        label = { Text("CEP") },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                        enabled = !busy,
                                    )
                                    Button(
                                        onClick = {
                                            val cepDigits = cep.filter(Char::isDigit)
                                            if (cepDigits.length != 8) {
                                                error = "Informe um CEP valido."
                                            } else {
                                                busy = true
                                                error = null
                                                scope.launch {
                                                    runCatching {
                                                        viewModel.consultarEnderecoCepPublicSecure(
                                                            attemptToken,
                                                            cepDigits,
                                                        )
                                                    }.onSuccess { response ->
                                                        val address = response.dados
                                                        if (!response.ok || address == null) {
                                                            error = response.error ?: "CEP nao localizado."
                                                        } else {
                                                            cep = cepDigits
                                                            tipoLogradouro = address.tipoLogradouro.orEmpty()
                                                            logradouro = address.logradouro.orEmpty()
                                                            bairro = address.bairro.orEmpty()
                                                            cidade = address.municipio.orEmpty()
                                                            uf = (address.ufSigla ?: address.uf).orEmpty().uppercase().take(2)
                                                            idTipoLogradouro = address.idTipoLogradouro
                                                            idBairro = address.idBairro
                                                            idMunicipio = address.idMunicipio
                                                            idUf = address.idUf
                                                        }
                                                    }.onFailure {
                                                        error = CadastroApiErrorMapper.mapUserMessage(
                                                            it.message,
                                                            "Nao foi possivel consultar o CEP.",
                                                        )
                                                    }
                                                    busy = false
                                                }
                                            }
                                        },
                                        enabled = !busy,
                                    ) {
                                        if (busy) CircularProgressIndicator(strokeWidth = 2.dp) else Text("Buscar")
                                    }
                                }
                                OutlinedTextField(
                                    logradouro,
                                    { logradouro = it },
                                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                    label = { Text("Logradouro") },
                                    enabled = !busy,
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        numero,
                                        { numero = it },
                                        modifier = Modifier.weight(1f).bringIntoViewOnFocus(),
                                        label = { Text("Numero") },
                                        enabled = !busy,
                                    )
                                    OutlinedTextField(
                                        uf,
                                        { uf = it.uppercase().take(2) },
                                        modifier = Modifier.weight(1f).bringIntoViewOnFocus(),
                                        label = { Text("UF") },
                                        enabled = !busy,
                                    )
                                }
                                OutlinedTextField(
                                    complemento,
                                    { complemento = it },
                                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                    label = { Text("Complemento") },
                                    enabled = !busy,
                                )
                                OutlinedTextField(
                                    bairro,
                                    { bairro = it },
                                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                    label = { Text("Bairro") },
                                    enabled = !busy,
                                )
                                OutlinedTextField(
                                    cidade,
                                    { cidade = it },
                                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                    label = { Text("Cidade") },
                                    enabled = !busy,
                                )
                            }
                        }
                    }

                    PublicStage.DEPENDENTS -> {
                        DependentsCard(
                            items = dependentes,
                            relationships = relationships,
                            plans = plans,
                            disabled = busy,
                            lookupKey = dependentLookupKey,
                            onLookup = { index ->
                                val dep = dependentes.getOrNull(index) ?: return@DependentsCard
                                val depCpf = dep.cpf.filter(Char::isDigit)
                                val holderCpf = cpf.filter(Char::isDigit)
                                if (!CadastroPayloadBuilder.validateCpf(depCpf)) {
                                    error = "Informe um CPF valido para o dependente."
                                    return@DependentsCard
                                }
                                if (depCpf == holderCpf) {
                                    error = "O CPF do dependente nao pode ser o mesmo do responsavel financeiro."
                                    return@DependentsCard
                                }
                                dependentLookupKey = dep.key
                                error = null
                                scope.launch {
                                    runCatching {
                                        viewModel.lookupPublicDependent(attemptToken, depCpf)
                                    }.onSuccess { response ->
                                        val person = response.pessoa as? JsonObject
                                        if (!response.ok || person == null) {
                                            if (response.canContinue) {
                                                notice = response.error?.let { "$it. Preencha os dados manualmente." }
                                            } else {
                                                error = response.error ?: "Nao foi possivel consultar o dependente."
                                            }
                                        } else {
                                            dependentes[index] = dep.copy(
                                                cpf = depCpf,
                                                nome = person.valueString("nome") ?: dep.nome,
                                                dataNascimento = normalizePersonDate(
                                                    person.valueString("data_nascimento") ?: dep.dataNascimento,
                                                ),
                                                sexo = resolvePersonSex(person.valueString("sexo"), dep.sexo),
                                                nomeMae = person.valueString("nome_mae") ?: dep.nomeMae,
                                            )
                                            notice = "Dados do dependente localizados."
                                        }
                                    }.onFailure {
                                        error = CadastroApiErrorMapper.mapUserMessage(
                                            it.message,
                                            "Nao foi possivel consultar o dependente.",
                                        )
                                    }
                                    dependentLookupKey = null
                                }
                            },
                        )
                    }

                    PublicStage.REVIEW -> {
                        val primaryPhone = contatos.firstOrNull {
                            it.tipo in setOf("whatsapp", "celular", "fixo") && it.principal
                        } ?: contatos.firstOrNull { it.tipo in setOf("whatsapp", "celular", "fixo") }
                        val email = contatos.firstOrNull { it.tipo == "email" && it.principal }
                            ?: contatos.firstOrNull { it.tipo == "email" }

                        WebCard {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text(
                                    "Revise sua adesao",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                ReviewLine("Responsavel financeiro", nome)
                                ReviewLine("CPF", formatCpf(cpf))
                                ReviewLine(
                                    "Plano do titular",
                                    plans.firstOrNull { it.codigo == titularPlano }?.nome ?: "-",
                                )
                                ReviewLine("Dependentes", dependentes.size.toString())
                                dependentes.forEach { dep ->
                                    Text(
                                        "${dep.nome} - ${plans.firstOrNull { it.codigo == dep.plano }?.nome ?: "-"}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                ReviewLine("Telefone", formatPhone(primaryPhone?.valor.orEmpty()))
                                ReviewLine("E-mail", email?.valor.orEmpty())
                            }
                        }

                        VendaButton(
                            label = "Revisar contrato",
                            onClick = {
                                emailToConfirm = email?.valor.orEmpty()
                                emailDialogOpen = true
                                error = null
                            },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !busy,
                        )
                    }

                    PublicStage.CONTRACT -> {
                        WebCard {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text(
                                    "Contrato de adesao",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    "Hash: ${contractHash.take(16)}...",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Surface(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .heightIn(max = 420.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant,
                                    shape = MaterialTheme.shapes.small,
                                ) {
                                    Text(
                                        text = contractText,
                                        modifier = Modifier
                                            .padding(12.dp)
                                            .verticalScroll(rememberScrollState()),
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                                if (coverageUrl.isNotBlank()) {
                                    WebCard {
                                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Text("Cobertura do plano $coverageLabel", fontWeight = FontWeight.Bold)
                                            Text("Leia os procedimentos cobertos antes de concluir a sua adesão.")
                                            VendaButton(
                                                label = "Ver cobertura do plano",
                                                onClick = {
                                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(coverageUrl)))
                                                },
                                                modifier = Modifier.fillMaxWidth(),
                                            )
                                            VendaButton(
                                                label = "Baixar PDF de cobertura",
                                                onClick = {
                                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(coverageUrl)))
                                                },
                                                style = VendaButtonStyle.SECONDARY,
                                                modifier = Modifier.fillMaxWidth(),
                                            )
                                            Row {
                                                Checkbox(
                                                    checked = acceptedCoverage,
                                                    onCheckedChange = { acceptedCoverage = it },
                                                    enabled = !busy,
                                                )
                                                Text(
                                                    "Estou ciente da cobertura do plano contratado, disponibilizada para consulta.",
                                                    modifier = Modifier.padding(top = 12.dp),
                                                )
                                            }
                                        }
                                    }
                                }
                                Row {
                                    Checkbox(
                                        checked = acceptedTerms,
                                        onCheckedChange = { acceptedTerms = it },
                                        enabled = !busy,
                                    )
                                    Text(
                                        "Li e aceito os termos e condicoes do contrato apresentado.",
                                        modifier = Modifier.padding(top = 12.dp),
                                    )
                                }
                                Row {
                                    Checkbox(
                                        checked = acceptedData,
                                        onCheckedChange = { acceptedData = it },
                                        enabled = !busy,
                                    )
                                    Text(
                                        "Confirmo que os dados informados estao corretos.",
                                        modifier = Modifier.padding(top = 12.dp),
                                    )
                                }
                            }
                        }
                    }

                    else -> Unit
                }
            }

            if (validationErrors.isNotEmpty()) {
                WebCard {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Corrija os seguintes campos:", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
                        validationErrors.forEach { field ->
                            Text("• $field", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }

            when (stage) {
                PublicStage.IDENTIFY -> {
                    VendaButton(
                        label = "Sair",
                        onClick = onClose,
                        style = VendaButtonStyle.TERTIARY,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !busy,
                    )
                }

                PublicStage.DETAILS -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        VendaButton(
                            label = "Sair",
                            onClick = onClose,
                            style = VendaButtonStyle.TERTIARY,
                            size = VendaButtonSize.MEDIUM,
                            modifier = Modifier.weight(0.8f),
                            enabled = !busy,
                        )
                        VendaButton(
                            label = "Continuar",
                            onClick = {
                                val validation = validateDetails(
                                    nome = nome,
                                    dataNascimento = dataNascimento,
                                    sexo = sexo,
                                    nomeMae = nomeMae,
                                    titularPlano = titularPlano,
                                    exigeMatricula = currentLink.empresaExigeMatricula,
                                    matricula = numeroMatricula,
                                    contatos = contatos,
                                    cep = cep,
                                    logradouro = logradouro,
                                    numero = numero,
                                    bairro = bairro,
                                    cidade = cidade,
                                    uf = uf,
                                )
                                if (validation != null) {
                                    validationErrors = listOfNotNull(
                                        if (nome.isBlank()) "Nome completo" else null,
                                        if (!isIsoDate(dataNascimento)) "Data de nascimento" else null,
                                        if (sexo !in setOf(0, 1)) "Sexo" else null,
                                        if (nomeMae.isBlank()) "Nome da mãe" else null,
                                        if (titularPlano <= 0) "Plano do titular" else null,
                                        if (currentLink.empresaExigeMatricula == 1 && numeroMatricula.isBlank()) "Matrícula" else null,
                                        if (contatos.none { it.tipo != "email" && it.valor.filter(Char::isDigit).length >= 10 }) "Telefone" else null,
                                        if (contatos.none { it.tipo == "email" && isValidEmail(it.valor) }) "E-mail" else null,
                                        if (cep.filter(Char::isDigit).length != 8) "CEP" else null,
                                        if (logradouro.isBlank()) "Logradouro" else null,
                                        if (numero.isBlank()) "Número" else null,
                                        if (bairro.isBlank()) "Bairro" else null,
                                        if (cidade.isBlank()) "Cidade" else null,
                                        if (uf.length != 2) "UF" else null,
                                    )
                                    error = null
                                } else setStage(PublicStage.DEPENDENTS)
                            },
                            size = VendaButtonSize.MEDIUM,
                            modifier = Modifier.weight(1.2f),
                            enabled = !busy,
                        )
                    }
                }

                PublicStage.DEPENDENTS -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        VendaButton(
                            label = "Voltar",
                            onClick = { setStage(PublicStage.DETAILS) },
                            style = VendaButtonStyle.TERTIARY,
                            size = VendaButtonSize.MEDIUM,
                            modifier = Modifier.weight(0.8f),
                            enabled = !busy,
                        )
                        VendaButton(
                            label = if (dependentes.isEmpty()) "Continuar sem dependentes" else "Continuar",
                            onClick = {
                                val validation = validateDependents(cpf, dependentes)
                                if (validation != null) {
                                    validationErrors = listOf(validation)
                                    error = null
                                } else setStage(PublicStage.REVIEW)
                            },
                            size = VendaButtonSize.MEDIUM,
                            modifier = Modifier.weight(1.2f),
                            enabled = !busy,
                        )
                    }
                }

                PublicStage.REVIEW -> {
                    VendaButton(
                        label = "Voltar",
                        onClick = { setStage(PublicStage.DEPENDENTS) },
                        style = VendaButtonStyle.TERTIARY,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !busy,
                    )
                }

                PublicStage.CONTRACT -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        VendaButton(
                            label = "Voltar",
                            onClick = { setStage(PublicStage.REVIEW) },
                            style = VendaButtonStyle.TERTIARY,
                            size = VendaButtonSize.MEDIUM,
                            modifier = Modifier.weight(0.8f),
                            enabled = !busy,
                        )
                        VendaButton(
                            label = "Aceitar e concluir",
                            onClick = finalize@{
                                if (!acceptedTerms || !acceptedData || (coverageUrl.isNotBlank() && !acceptedCoverage)) {
                                    error = if (coverageUrl.isNotBlank()) {
                                        "Marque os três aceites para concluir. A cobertura está disponível para consulta, caso deseje."
                                    } else {
                                        "Aceite os termos do contrato e confirme os dados para concluir."
                                    }
                                    return@finalize
                                }
                                busy = true
                                error = null
                                scope.launch {
                                    runCatching {
                                        viewModel.submitPublicCadastroSecure(
                                            attemptToken = attemptToken,
                                            contractToken = contractToken,
                                            acceptedTerms = acceptedTerms,
                                            acceptedData = acceptedData,
                                            acceptedCoverage = coverageUrl.isNotBlank() && acceptedCoverage,
                                        )
                                    }.onSuccess { response ->
                                        if (!response.ok) {
                                            error = response.error ?: "Nao foi possivel concluir a adesao."
                                        } else {
                                            successMessage = if (response.message?.contains("processada", ignoreCase = true) == true) {
                                                "Recebemos sua adesão e ela está sendo processada. Não é necessário preencher novamente."
                                            } else {
                                                "Adesão concluída com sucesso! Seu contrato será enviado para o e-mail confirmado. Agora você já pode aproveitar os benefícios e utilizar o App Odontoart Associado."
                                            }
                                            setStage(PublicStage.SUCCESS)
                                        }
                                    }.onFailure {
                                        error = CadastroApiErrorMapper.mapUserMessage(
                                            it.message,
                                            "Nao foi possivel concluir a adesao.",
                                        )
                                    }
                                    busy = false
                                }
                            },
                            loading = busy,
                            enabled = !busy && acceptedTerms && acceptedData &&
                                (coverageUrl.isBlank() || acceptedCoverage),
                            size = VendaButtonSize.MEDIUM,
                            modifier = Modifier.weight(1.2f),
                        )
                    }
                }

                else -> Unit
            }
        }
    }

    if (emailDialogOpen) {
        AlertDialog(
            onDismissRequest = {
                if (!busy) emailDialogOpen = false
            },
            title = { Text("Confirme seu e-mail") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("O contrato sera enviado para este endereco. Voce pode corrigi-lo antes de continuar.")
                    OutlinedTextField(
                        value = emailToConfirm,
                        onValueChange = { emailToConfirm = it },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("E-mail do contrato") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        enabled = !busy,
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { emailDialogOpen = false },
                    enabled = !busy,
                ) { Text("Cancelar") }
            },
            confirmButton = {
                TextButton(
                    onClick = prepare@{
                        if (!isValidEmail(emailToConfirm)) {
                            error = "Confirme um e-mail valido."
                            return@prepare
                        }
                        val payload = buildContractPayload(
                            cpf = cpf,
                            nome = nome,
                            dataNascimento = dataNascimento,
                            sexo = sexo,
                            nomeMae = nomeMae,
                            numeroMatricula = numeroMatricula,
                            contatos = contatos,
                            cep = cep,
                            tipoLogradouro = tipoLogradouro,
                            logradouro = logradouro,
                            numero = numero,
                            complemento = complemento,
                            bairro = bairro,
                            cidade = cidade,
                            uf = uf,
                            idTipoLogradouro = idTipoLogradouro,
                            idBairro = idBairro,
                            idMunicipio = idMunicipio,
                            idUf = idUf,
                            titularPlano = titularPlano,
                            dependentes = dependentes,
                        )
                        busy = true
                        error = null
                        scope.launch {
                            runCatching {
                                viewModel.preparePublicContract(
                                    attemptToken = attemptToken,
                                    confirmedEmail = emailToConfirm,
                                    cadastro = payload,
                                )
                            }.onSuccess { response ->
                                if (!response.ok || response.contractToken.isNullOrBlank() || response.contractText.isNullOrBlank()) {
                                    error = if (
                                        response.code == "CONTRACT_NOT_CONFIGURED" &&
                                        response.missingPlans.isNotEmpty()
                                    ) {
                                        "Contrato ainda nao configurado para o(s) plano(s): ${response.missingPlans.joinToString(", ")}."
                                    } else {
                                        response.error ?: "Nao foi possivel preparar o contrato."
                                    }
                                } else {
                                    contractToken = response.contractToken
                                    preparedCoverageUrl = if (response.coverageAvailable) response.coverageUrl.orEmpty() else ""
                                    contractText = response.contractText
                                    contractHash = response.contractHash.orEmpty()
                                    acceptedTerms = false
                                    acceptedData = false
                                    acceptedCoverage = false
                                    emailDialogOpen = false
                                    setStage(PublicStage.CONTRACT)
                                }
                            }.onFailure {
                                error = CadastroApiErrorMapper.mapUserMessage(
                                    it.message,
                                    "Nao foi possivel preparar o contrato.",
                                )
                            }
                            busy = false
                        }
                    },
                    enabled = !busy,
                ) {
                    if (busy) CircularProgressIndicator(strokeWidth = 2.dp) else Text("Confirmar")
                }
            },
        )
    }
}

@Composable
private fun PublicLoadingScreen() {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.padding(24.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            OdontoartBrandMark(modifier = Modifier.fillMaxWidth())
            VendaLoadingState(
                title = "Preparando sua adesao",
                message = "Estamos carregando os dados necessarios para iniciar.",
            )
        }
    }
}

@Composable
private fun PublicUnavailableScreen(
    error: String?,
    consultant: br.com.vendamais.mobile.data.models.PublicConsultantInfo?,
    onClose: () -> Unit,
) {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            OdontoartBrandMark(modifier = Modifier.fillMaxWidth())
            VendaInlineFeedback(
                title = "Link indisponível",
                message = error ?: "Não foi possível carregar este link de adesão.",
                tone = VendaFeedbackTone.ERROR,
            )
            ConsultantContactCard(consultant?.nome, consultant?.telefone)
            VendaButton(
                label = "Fechar",
                onClick = onClose,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun PublicFinalStateScreen(
    title: String,
    message: String,
    consultantName: String?,
    consultantPhone: String?,
    onInstallApp: () -> Unit,
    onClose: () -> Unit,
) {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            OdontoartBrandMark(modifier = Modifier.fillMaxWidth())
            WebCard {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            ConsultantContactCard(consultantName, consultantPhone)
            VendaButton(
                label = "Instalar aplicativo",
                onClick = onInstallApp,
                modifier = Modifier.fillMaxWidth(),
            )
            VendaButton(
                label = "Fechar",
                onClick = onClose,
                style = VendaButtonStyle.SECONDARY,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun ConsultantContactCard(name: String?, phone: String?) {
    val context = LocalContext.current
    val phoneDigits = phone.orEmpty().filter(Char::isDigit)
    val whatsappNumber = if (phoneDigits.startsWith("55")) phoneDigits else "55$phoneDigits"
    if (name.isNullOrBlank() && phoneDigits.length < 10) return
    WebCard {
        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text("Precisa de ajuda? Fale com seu consultor", fontWeight = FontWeight.Bold)
            if (!name.isNullOrBlank()) Text(name)
            if (phoneDigits.length >= 10) {
                Text("WhatsApp: $phone")
                Button(
                    modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFEA580C),
                        contentColor = Color.White,
                    ),
                    onClick = {
                        val message = Uri.encode("Olá! Preciso de ajuda com minha adesão à Odontoart.")
                        val uri = Uri.parse("https://wa.me/$whatsappNumber?text=$message")
                        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                    },
                ) {
                    Text("Falar com meu consultor", fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}

@Composable
private fun ContactsCard(
    items: MutableList<PublicContactDraft>,
    disabled: Boolean,
) {
    WebCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Contatos", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            items.forEachIndexed { index, item ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    PublicChoiceField(
                        "Tipo",
                        item.tipo.replaceFirstChar { it.uppercase() },
                        listOf(
                            "celular" to "Celular",
                            "fixo" to "Fixo",
                            "whatsapp" to "WhatsApp",
                            "email" to "Email",
                        ),
                    ) { value -> items[index] = item.copy(tipo = value) }
                    OutlinedTextField(
                        item.valor,
                        { value ->
                            items[index] = item.copy(
                                valor = if (item.tipo == "email") value else value.filter(Char::isDigit).take(11),
                            )
                        },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Contato ${index + 1}") },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = if (item.tipo == "email") KeyboardType.Email else KeyboardType.Phone,
                        ),
                        enabled = !disabled,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(
                            onClick = {
                                items.indices.forEach { i ->
                                    items[i] = items[i].copy(principal = i == index)
                                }
                            },
                            enabled = !disabled,
                        ) {
                            Text(if (item.principal) "Principal ✓" else "Tornar principal")
                        }
                        if (items.size > 1) {
                            TextButton(
                                onClick = { items.removeAt(index) },
                                enabled = !disabled,
                            ) { Text("Remover") }
                        }
                    }
                }
                if (index < items.lastIndex) HorizontalDivider()
            }
            Button(
                onClick = { items.add(PublicContactDraft(principal = items.isEmpty())) },
                enabled = !disabled,
            ) {
                Text("Adicionar contato")
            }
        }
    }
}

@Composable
private fun DependentsCard(
    items: MutableList<PublicDependentDraft>,
    relationships: List<Pair<Int, String>>,
    plans: List<PublicSecurePlan>,
    disabled: Boolean,
    lookupKey: String?,
    onLookup: (Int) -> Unit,
) {
    WebCard {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Dependentes", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(items.size.toString(), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            items.forEachIndexed { index, dep ->
                Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("Dependente ${index + 1}", fontWeight = FontWeight.SemiBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            dep.cpf,
                            { items[index] = dep.copy(cpf = it.filter(Char::isDigit).take(11)) },
                            modifier = Modifier.weight(1f).bringIntoViewOnFocus(),
                            label = { Text("CPF") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            enabled = !disabled && lookupKey == null,
                        )
                        Button(
                            onClick = { onLookup(index) },
                            enabled = !disabled && lookupKey == null && dep.cpf.filter(Char::isDigit).length == 11,
                        ) {
                            if (lookupKey == dep.key) CircularProgressIndicator(strokeWidth = 2.dp)
                            else Text("Consultar")
                        }
                    }
                    PublicChoiceField(
                        "Grau de parentesco",
                        relationships.firstOrNull { it.first == dep.tipo }?.second ?: "Selecione",
                        relationships,
                    ) { items[index] = dep.copy(tipo = it) }
                    OutlinedTextField(
                        dep.nome,
                        { items[index] = dep.copy(nome = it) },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Nome completo") },
                        enabled = !disabled,
                    )
                    OutlinedTextField(
                        dep.dataNascimento,
                        { items[index] = dep.copy(dataNascimento = it.take(10)) },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Data nascimento (YYYY-MM-DD)") },
                        enabled = !disabled,
                    )
                    PublicChoiceField(
                        "Sexo",
                        if (dep.sexo == 1) "Masculino" else if (dep.sexo == 0) "Feminino" else "Selecione",
                        listOf(1 to "Masculino", 0 to "Feminino"),
                    ) { items[index] = dep.copy(sexo = it) }
                    OutlinedTextField(
                        dep.nomeMae,
                        { items[index] = dep.copy(nomeMae = it) },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Nome da mae") },
                        enabled = !disabled,
                    )
                    PublicChoiceField(
                        "Plano",
                        plans.firstOrNull { it.codigo == dep.plano }?.let {
                            "${it.nome} - R$ ${it.dependenteValor()}"
                        } ?: "Selecione",
                        plans.map { it.codigo to "${it.nome} - R$ ${it.dependenteValor()}" },
                    ) { code ->
                        val plan = plans.first { it.codigo == code }
                        items[index] = dep.copy(
                            plano = code,
                            planoValor = plan.dependenteValor(),
                        )
                    }
                    TextButton(
                        onClick = { items.removeAt(index) },
                        enabled = !disabled,
                    ) { Text("Remover dependente") }
                }
                HorizontalDivider()
            }

            Button(
                onClick = {
                    val plan = plans.singleOrNull()
                    items.add(PublicDependentDraft(
                        plano = plan?.codigo ?: 0,
                        planoValor = plan?.dependenteValor() ?: "0,00",
                    ))
                },
                enabled = !disabled && relationships.isNotEmpty() && plans.isNotEmpty(),
            ) {
                Text("Adicionar dependente")
            }
        }
    }
}

@Composable
private fun ReviewLine(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value.ifBlank { "-" }, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun <T> PublicChoiceField(
    label: String,
    value: String,
    options: List<Pair<T, String>>,
    onSelected: (T) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontWeight = FontWeight.Medium)
        options.chunked(2).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                row.forEach { (key, display) ->
                    TextButton(
                        onClick = { onSelected(key) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(display, maxLines = 2)
                    }
                }
                if (row.size == 1) {
                    androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

private fun validateDetails(
    nome: String,
    dataNascimento: String,
    sexo: Int,
    nomeMae: String,
    titularPlano: Int,
    exigeMatricula: Int?,
    matricula: String,
    contatos: List<PublicContactDraft>,
    cep: String,
    logradouro: String,
    numero: String,
    bairro: String,
    cidade: String,
    uf: String,
): String? {
    if (nome.trim().isBlank()) return "Campo obrigatorio: Nome Completo."
    if (!isIsoDate(dataNascimento)) return "Campo obrigatorio: Data de Nascimento valida."
    if (sexo !in setOf(0, 1)) return "Campo obrigatorio: Sexo."
    if (nomeMae.trim().isBlank()) return "Campo obrigatorio: Nome da Mae."
    if (titularPlano <= 0) return "Selecione um plano para o titular."
    if (exigeMatricula == 1 && matricula.trim().isBlank()) return "Campo obrigatorio: Matricula."

    val phone = contatos.firstOrNull {
        it.tipo in setOf("celular", "fixo", "whatsapp") && it.valor.filter(Char::isDigit).length >= 10
    }
    if (phone == null) return "Informe um telefone valido."

    val email = contatos.firstOrNull { it.tipo == "email" && isValidEmail(it.valor) }
    if (email == null) return "Informe um e-mail valido."

    if (
        cep.filter(Char::isDigit).length != 8 ||
        logradouro.isBlank() ||
        numero.isBlank() ||
        bairro.isBlank() ||
        cidade.isBlank() ||
        uf.length != 2
    ) {
        return "Complete o endereco antes de continuar."
    }
    return null
}

private fun validateDependents(
    titularCpf: String,
    dependentes: List<PublicDependentDraft>,
): String? {
    val seenCpfs = mutableSetOf(titularCpf.filter(Char::isDigit))
    dependentes.forEachIndexed { index, dep ->
        val depCpf = dep.cpf.filter(Char::isDigit)
        if (!CadastroPayloadBuilder.validateCpf(depCpf)) {
            return "Dependente ${index + 1}: informe um CPF valido."
        }
        if (!seenCpfs.add(depCpf)) return "Existem CPFs duplicados no cadastro."
        if (dep.tipo <= 1) return "Dependente ${index + 1}: selecione o grau de parentesco."
        if (dep.nome.isBlank()) return "Dependente ${index + 1}: nome e obrigatorio."
        if (!isIsoDate(dep.dataNascimento)) return "Dependente ${index + 1}: data de nascimento invalida."
        if (dep.sexo !in setOf(0, 1)) return "Dependente ${index + 1}: sexo e obrigatorio."
        if (dep.nomeMae.isBlank()) return "Dependente ${index + 1}: nome da mae e obrigatorio."
        if (dep.plano <= 0) return "Dependente ${index + 1}: selecione um plano."
    }
    return null
}

private fun buildContractPayload(
    cpf: String,
    nome: String,
    dataNascimento: String,
    sexo: Int,
    nomeMae: String,
    numeroMatricula: String,
    contatos: List<PublicContactDraft>,
    cep: String,
    tipoLogradouro: String,
    logradouro: String,
    numero: String,
    complemento: String,
    bairro: String,
    cidade: String,
    uf: String,
    idTipoLogradouro: Int?,
    idBairro: Int?,
    idMunicipio: Int?,
    idUf: Int?,
    titularPlano: Int,
    dependentes: List<PublicDependentDraft>,
): PublicCadastroContractPayload {
    val normalizedContacts = contatos.mapIndexed { index, contact ->
        PublicCadastroContato(
            tipo = contact.tipo,
            valor = if (contact.tipo == "email") {
                contact.valor.trim().lowercase(Locale.ROOT)
            } else {
                contact.valor.filter(Char::isDigit)
            },
            principal = contact.principal || (index == 0 && contatos.none { it.principal }),
        )
    }

    return PublicCadastroContractPayload(
        cpf = cpf.filter(Char::isDigit),
        nome = nome.trim(),
        dataNascimento = dataNascimento.trim(),
        sexoCodigo = sexo,
        nomeMae = nomeMae.trim(),
        numeroMatricula = numeroMatricula.trim().takeIf { it.isNotBlank() },
        contatos = normalizedContacts,
        endereco = PublicCadastroEndereco(
            cep = cep.filter(Char::isDigit),
            tipoLogradouro = tipoLogradouro.takeIf { it.isNotBlank() },
            logradouro = logradouro.trim(),
            numero = numero.trim(),
            complemento = complemento.trim().takeIf { it.isNotBlank() },
            bairro = bairro.trim(),
            cidade = cidade.trim(),
            uf = uf.uppercase(),
            idTipoLogradouro = idTipoLogradouro,
            idBairro = idBairro,
            idMunicipio = idMunicipio,
            idUf = idUf,
            ufSigla = uf.uppercase(),
        ),
        titularPlano = titularPlano,
        dependentes = dependentes.map { dep ->
            PublicCadastroDependente(
                tipo = dep.tipo,
                nome = dep.nome.trim(),
                dataNascimento = dep.dataNascimento.trim(),
                cpf = dep.cpf.filter(Char::isDigit),
                sexo = dep.sexo,
                sexoDescricao = if (dep.sexo == 1) "Masculino" else "Feminino",
                plano = dep.plano,
                planoValor = dep.planoValor,
                nomeMae = dep.nomeMae.trim(),
            )
        },
    )
}

private fun extractLegacyPlans(
    raw: JsonElement?,
    hidden: List<String>,
): List<PublicSecurePlan> {
    val array = when (raw) {
        is kotlinx.serialization.json.JsonArray -> raw
        is JsonObject -> raw["precoPlano"] as? kotlinx.serialization.json.JsonArray
        else -> null
    } ?: return emptyList()

    val hiddenIds = hidden.mapNotNull { it.toIntOrNull() }.toSet()
    return array.mapNotNull { element ->
        val obj = element as? JsonObject ?: return@mapNotNull null
        val code = obj.valueString("Plano", "plano", "codigoPlano")?.toIntOrNull()
            ?: return@mapNotNull null
        if (code in hiddenIds) return@mapNotNull null
        val titular = obj.valueMoney("ValorTitular", "valorTitular")
        val dependente = obj.valueMoney("ValorDependente", "valorDependente")
        PublicSecurePlan(
            codigo = code,
            nome = obj.valueString("NomeANS", "nomeANS", "nome") ?: "Plano $code",
            valorTitular = titular ?: dependente ?: 0.0,
            valorDependente = dependente ?: titular ?: 0.0,
        )
    }.distinctBy { it.codigo }
}

private fun JsonObject.valueString(vararg keys: String): String? {
    keys.forEach { key ->
        this[key]?.jsonPrimitive?.contentOrNull?.trim()?.takeIf { it.isNotBlank() }?.let { return it }
    }
    return null
}

private fun JsonObject.valueMoney(vararg keys: String): Double? {
    keys.forEach { key ->
        val raw = this[key]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        if (raw.isNotBlank()) {
            val normalized = if (raw.contains(',') && raw.contains('.')) {
                raw.replace(".", "").replace(',', '.')
            } else {
                raw.replace(',', '.')
            }
            normalized.toDoubleOrNull()?.let { return it }
        }
    }
    return null
}

private fun resolvePersonSex(value: String?, fallback: Int): Int {
    val normalized = value.orEmpty().trim().lowercase(Locale.ROOT)
    return when {
        normalized == "m" || normalized == "1" || normalized.contains("masculino") -> 1
        normalized == "f" || normalized == "0" || normalized == "2" || normalized.contains("feminino") -> 0
        else -> fallback
    }
}

private fun normalizePersonDate(value: String): String {
    val trimmed = value.trim()
    return if (Regex("^\\d{4}-\\d{2}-\\d{2}").containsMatchIn(trimmed)) trimmed.take(10) else trimmed
}

private fun displayBirthDate(value: String): String {
    return if (Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(value)) {
        value.substring(8, 10) + "/" + value.substring(5, 7) + "/" + value.substring(0, 4)
    } else value
}

private fun parseBirthDate(value: String): String {
    val digits = value.filter(Char::isDigit).take(8)
    if (digits.length < 8) {
        return when {
            digits.length <= 2 -> digits
            digits.length <= 4 -> digits.take(2) + "/" + digits.drop(2)
            else -> digits.take(2) + "/" + digits.substring(2, 4) + "/" + digits.drop(4)
        }
    }
    val iso = digits.substring(4, 8) + "-" + digits.substring(2, 4) + "-" + digits.take(2)
    return if (runCatching { LocalDate.parse(iso) }.isSuccess) iso else value.take(10)
}

private fun isIsoDate(value: String): Boolean =
    runCatching { LocalDate.parse(value.trim()) }.isSuccess

private fun isValidEmail(value: String): Boolean =
    Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(value.trim())

private fun formatPlanValue(value: Double): String =
    "%.2f".format(Locale.US, value).replace('.', ',')

private fun formatCpf(value: String): String {
    val d = value.filter(Char::isDigit)
    if (d.length != 11) return value
    return "${d.substring(0, 3)}.${d.substring(3, 6)}.${d.substring(6, 9)}-${d.substring(9)}"
}

private fun openAssociadoApp(context: android.content.Context) {
    val market = Intent(
        Intent.ACTION_VIEW,
        Uri.parse("market://details?id=com.odontoart.associado"),
    ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }

    runCatching { context.startActivity(market) }
        .onFailure {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse(ASSOCIADO_GOOGLE_PLAY_URL))
                    .apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) },
            )
        }
}
