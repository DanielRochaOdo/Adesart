package br.com.vendamais.mobile.ui.screens

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.data.models.PublicCadastroContato
import br.com.vendamais.mobile.data.models.PublicCadastroDependente
import br.com.vendamais.mobile.data.models.PublicCadastroEndereco
import br.com.vendamais.mobile.data.models.PublicCadastroLinkInfo
import br.com.vendamais.mobile.data.models.PublicCadastroPayload
import br.com.vendamais.mobile.data.remote.CadastroPayloadBuilder
import br.com.vendamais.mobile.domain.cadastro.CadastroApiErrorMapper
import br.com.vendamais.mobile.ui.AppViewModel
import br.com.vendamais.mobile.ui.components.ScreenHeading
import br.com.vendamais.mobile.ui.components.WebCard
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.UUID
import br.com.vendamais.mobile.ui.components.bringIntoViewOnFocus

private const val PUBLIC_CADASTRO_DRAFT_VERSION = 1
private const val PUBLIC_CADASTRO_DRAFT_TTL_MS = 24 * 60 * 60 * 1000L
private const val PUBLIC_CADASTRO_DRAFT_PREFS = "public_cadastro_draft"

private val publicDraftJson = Json {
    ignoreUnknownKeys = true
}

@Serializable
private data class PublicCadastroDraftState(
    val version: Int = PUBLIC_CADASTRO_DRAFT_VERSION,
    val savedAt: Long,
    val cpf: String = "",
    val cpfLocked: Boolean = false,
    val nome: String = "",
    val dataNascimento: String = "",
    val sexo: String = "1",
    val nomeMae: String = "",
    val telefone: String = "",
    val cep: String = "",
    val logradouro: String = "",
    val numero: String = "",
    val complemento: String = "",
    val bairro: String = "",
    val cidade: String = "",
    val uf: String = "",
    val numeroMatricula: String = "",
    val selectedPlanoCodigo: String = "",
    val lookupMessage: String = "",
    val submissionId: String = "",
)

private data class PublicPlanoOption(
    val codigo: Int,
    val nome: String,
)

@Composable
fun PublicAdesaoTokenScreen(
    token: String,
    viewModel: AppViewModel,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val draftStorage = remember(context) {
        context.getSharedPreferences(PUBLIC_CADASTRO_DRAFT_PREFS, Context.MODE_PRIVATE)
    }
    val draftStorageKey = remember(token) { "public-cadastro-link-draft:${token.trim()}" }

    var loading by rememberSaveable { mutableStateOf(true) }
    var submitting by rememberSaveable { mutableStateOf(false) }
    var consultingCpf by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var notice by rememberSaveable { mutableStateOf<String?>(null) }
    var success by rememberSaveable { mutableStateOf<String?>(null) }
    var linkInfo by remember { mutableStateOf<PublicCadastroLinkInfo?>(null) }
    var cpfLocked by rememberSaveable(token) { mutableStateOf(false) }
    var selectedPlanoCodigo by rememberSaveable(token) { mutableStateOf("") }
    var submissionId by rememberSaveable(token) { mutableStateOf("") }
    val linkVisitId = rememberSaveable(token) { UUID.randomUUID().toString() }
    var draftRestored by rememberSaveable(token) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    var nome by rememberSaveable { mutableStateOf("") }
    var cpf by rememberSaveable { mutableStateOf("") }
    var dataNascimento by rememberSaveable { mutableStateOf("") }
    var sexo by rememberSaveable { mutableStateOf("1") }
    var nomeMae by rememberSaveable { mutableStateOf("") }
    var telefone by rememberSaveable { mutableStateOf("") }
    var cep by rememberSaveable { mutableStateOf("") }
    var logradouro by rememberSaveable { mutableStateOf("") }
    var numero by rememberSaveable { mutableStateOf("") }
    var complemento by rememberSaveable { mutableStateOf("") }
    var bairro by rememberSaveable { mutableStateOf("") }
    var cidade by rememberSaveable { mutableStateOf("") }
    var uf by rememberSaveable { mutableStateOf("") }
    var numeroMatricula by rememberSaveable { mutableStateOf("") }
    var consultingCep by rememberSaveable { mutableStateOf(false) }
    var cepLookupError by rememberSaveable { mutableStateOf<String?>(null) }
    var ultimoCepConsultado by rememberSaveable { mutableStateOf("") }
    val enderecoFieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = MaterialTheme.colorScheme.onSurface,
        unfocusedTextColor = MaterialTheme.colorScheme.onSurface,
        disabledTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
        focusedContainerColor = MaterialTheme.colorScheme.surface,
        unfocusedContainerColor = MaterialTheme.colorScheme.surface,
        disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        cursorColor = MaterialTheme.colorScheme.primary,
        focusedLabelColor = MaterialTheme.colorScheme.primary,
        unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
        focusedBorderColor = MaterialTheme.colorScheme.primary,
        unfocusedBorderColor = MaterialTheme.colorScheme.outline,
    )

    LaunchedEffect(token) {
        loading = true
        linkInfo = null
        cpfLocked = false
        draftRestored = false
        error = null
        notice = null
        success = null
        runCatching { viewModel.resolvePublicCadastroLink(token, linkVisitId) }
            .onSuccess { response ->
                if (!response.ok || response.link == null) {
                    error = CadastroApiErrorMapper.mapUserMessage(
                        response.error,
                        "Link invalido ou inativo.",
                    )
                } else {
                    linkInfo = response.link
                }
            }
            .onFailure { throwable ->
                error = CadastroApiErrorMapper.mapUserMessage(
                    throwable.message,
                    "Falha ao resolver link.",
                )
            }
        loading = false
    }

    val empresa = linkInfo
    val planoOptions = remember(empresa?.id, empresa?.planosRaw) {
        extractPlanoOptions(empresa?.planosRaw)
    }
    val planoNomePadrao = remember(planoOptions) { planoOptions.firstOrNull()?.nome }

    LaunchedEffect(planoOptions) {
        if (planoOptions.isEmpty()) {
            selectedPlanoCodigo = ""
            return@LaunchedEffect
        }
        val selectedValido = planoOptions.any { it.codigo.toString() == selectedPlanoCodigo }
        if (!selectedValido) {
            selectedPlanoCodigo = planoOptions.first().codigo.toString()
        }
    }

    LaunchedEffect(empresa?.id, draftStorageKey, draftRestored) {
        if (empresa == null || draftRestored) return@LaunchedEffect
        val rawDraft = draftStorage.getString(draftStorageKey, null)
        if (rawDraft.isNullOrBlank()) {
            draftRestored = true
            return@LaunchedEffect
        }

        val restored = runCatching {
            publicDraftJson.decodeFromString(PublicCadastroDraftState.serializer(), rawDraft)
        }.getOrNull()

        if (
            restored == null ||
            restored.version != PUBLIC_CADASTRO_DRAFT_VERSION ||
            (System.currentTimeMillis() - restored.savedAt) > PUBLIC_CADASTRO_DRAFT_TTL_MS
        ) {
            draftStorage.edit().remove(draftStorageKey).apply()
            draftRestored = true
            return@LaunchedEffect
        }

        cpf = restored.cpf
        cpfLocked = restored.cpfLocked
        nome = restored.nome
        dataNascimento = restored.dataNascimento
        sexo = restored.sexo
        nomeMae = restored.nomeMae
        telefone = restored.telefone
        cep = restored.cep
        logradouro = restored.logradouro
        numero = restored.numero
        complemento = restored.complemento
        bairro = restored.bairro
        cidade = restored.cidade
        uf = restored.uf
        numeroMatricula = restored.numeroMatricula
        selectedPlanoCodigo = restored.selectedPlanoCodigo
        submissionId = restored.submissionId
        notice = restored.lookupMessage.takeIf { it.isNotBlank() }
        draftRestored = true
    }

    LaunchedEffect(
        draftRestored,
        empresa?.id,
        success,
        cpf,
        cpfLocked,
        nome,
        dataNascimento,
        sexo,
        nomeMae,
        telefone,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        numeroMatricula,
        selectedPlanoCodigo,
        notice,
        submissionId,
    ) {
        if (!draftRestored || empresa == null) return@LaunchedEffect
        if (!success.isNullOrBlank()) {
            draftStorage.edit().remove(draftStorageKey).apply()
            return@LaunchedEffect
        }

        val isEmpty = cpf.isBlank() &&
            !cpfLocked &&
            nome.isBlank() &&
            dataNascimento.isBlank() &&
            nomeMae.isBlank() &&
            telefone.isBlank() &&
            cep.isBlank() &&
            logradouro.isBlank() &&
            numero.isBlank() &&
            complemento.isBlank() &&
            bairro.isBlank() &&
            cidade.isBlank() &&
            uf.isBlank() &&
            numeroMatricula.isBlank()

        if (isEmpty) {
            draftStorage.edit().remove(draftStorageKey).apply()
            return@LaunchedEffect
        }

        val draft = PublicCadastroDraftState(
            savedAt = System.currentTimeMillis(),
            cpf = cpf,
            cpfLocked = cpfLocked,
            nome = nome,
            dataNascimento = dataNascimento,
            sexo = sexo,
            nomeMae = nomeMae,
            telefone = telefone,
            cep = cep,
            logradouro = logradouro,
            numero = numero,
            complemento = complemento,
            bairro = bairro,
            cidade = cidade,
            uf = uf,
            numeroMatricula = numeroMatricula,
            selectedPlanoCodigo = selectedPlanoCodigo,
            lookupMessage = notice.orEmpty(),
            submissionId = submissionId,
        )

        draftStorage.edit()
            .putString(draftStorageKey, publicDraftJson.encodeToString(PublicCadastroDraftState.serializer(), draft))
            .apply()
    }

    LaunchedEffect(cep) {
        val cepNormalizado = cep.filter(Char::isDigit).take(8)
        if (cepNormalizado.length != 8) return@LaunchedEffect
        if (cepNormalizado == ultimoCepConsultado) return@LaunchedEffect

        ultimoCepConsultado = cepNormalizado
        consultingCep = true
        cepLookupError = null

        runCatching { viewModel.consultarEnderecoCep(cepNormalizado) }
            .onSuccess { endereco ->
                if (endereco.cep.isNotBlank()) {
                    cep = endereco.cep.filter(Char::isDigit).take(8)
                }
                if (endereco.logradouro.isNotBlank()) {
                    logradouro = endereco.logradouro
                }
                if (endereco.bairro.isNotBlank()) {
                    bairro = endereco.bairro
                }
                if (endereco.cidade.isNotBlank()) {
                    cidade = endereco.cidade
                }
                val ufNormalizada = endereco.uf
                    .ifBlank { endereco.ufSigla.orEmpty() }
                    .uppercase()
                    .take(2)
                if (ufNormalizada.isNotBlank()) {
                    uf = ufNormalizada
                }
            }
            .onFailure { throwable ->
                cepLookupError = CadastroApiErrorMapper.mapUserMessage(
                    throwable.message,
                    "Nao foi possivel consultar o CEP no S4E.",
                )
            }

        consultingCep = false
    }

    if (loading) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom)),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                verticalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator()
                Text("Validando link...", modifier = Modifier.padding(top = 12.dp))
            }
        }
        return
    }

    if (empresa == null) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom)),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                ScreenHeading(
                    title = "Adesao por link",
                    subtitle = "Nao foi possivel iniciar o fluxo publico.",
                )
                Text(error ?: "Link invalido.")
                Button(onClick = onClose) {
                    Text("Fechar")
                }
            }
        }
        return
    }

    Surface(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom)),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            ScreenHeading(
                title = "Adesao por link",
                subtitle = "Empresa ${empresa.empresaNome}",
            )

            WebCard {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(empresa.empresaNome, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("CNPJ: ${empresa.empresaCnpj ?: "-"}")
                    Text("Vendedor: ${empresa.vendedorNome ?: "-"}")
                    empresa.vendedorTelefone?.takeIf { it.isNotBlank() }?.let {
                        Text("Telefone vendedor: $it")
                    }
                    Text("Plano padrao: ${planoNomePadrao ?: "Nao identificado"}")
                }
            }

            WebCard {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = nome,
                        onValueChange = { nome = it },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Nome completo") },
                    )
                    OutlinedTextField(
                        value = cpf,
                        onValueChange = { cpf = it.filter(Char::isDigit).take(11) },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("CPF (somente numeros)") },
                        singleLine = true,
                        enabled = !cpfLocked && !consultingCpf && !submitting,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                val cpfDigits = CadastroPayloadBuilder.normalizeDigits(cpf)
                                if (!CadastroPayloadBuilder.validateCpf(cpfDigits)) {
                                    error = "CPF invalido. Verifique os digitos."
                                    return@Button
                                }
                                consultingCpf = true
                                error = null
                                notice = null
                                scope.launch {
                                    runCatching {
                                        val cpfValidation = viewModel.checkPublicCadastroCpf(token, cpfDigits)
                                        if (!cpfValidation.ok) {
                                            throw IllegalStateException(
                                                CadastroApiErrorMapper.mapUserMessage(
                                                    cpfValidation.error,
                                                    "CPF nao permitido neste link.",
                                                ),
                                            )
                                        }
                                    }.onSuccess {
                                        cpf = cpfDigits
                                        cpfLocked = true
                                        notice = "CPF validado para este link."
                                    }.onFailure { throwable ->
                                        error = CadastroApiErrorMapper.mapUserMessage(
                                            throwable.message,
                                            "Falha ao validar CPF para este link.",
                                        )
                                    }
                                    consultingCpf = false
                                }
                            },
                            enabled = !consultingCpf && !submitting && !cpfLocked,
                        ) {
                            if (consultingCpf) {
                                CircularProgressIndicator(strokeWidth = 2.dp)
                            } else {
                                Text("Consultar CPF")
                            }
                        }
                        if (cpfLocked) {
                            TextButton(
                                onClick = {
                                    cpfLocked = false
                                    notice = null
                                },
                                enabled = !consultingCpf && !submitting,
                            ) {
                                Text("Alterar CPF")
                            }
                        }
                    }
                    OutlinedTextField(
                        value = dataNascimento,
                        onValueChange = { dataNascimento = it },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Data nascimento (YYYY-MM-DD)") },
                        singleLine = true,
                    )
                    SelectionField(
                        label = "Sexo",
                        value = if (sexo == "1") "Masculino" else "Feminino",
                        options = listOf("1" to "Masculino", "0" to "Feminino"),
                        onSelected = { sexo = it },
                    )
                    OutlinedTextField(
                        value = nomeMae,
                        onValueChange = { nomeMae = it },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Nome da mae") },
                    )
                    OutlinedTextField(
                        value = telefone,
                        onValueChange = { telefone = it.filter(Char::isDigit).take(11) },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Telefone") },
                    )
                    if (empresa.empresaExigeMatricula == 1) {
                        OutlinedTextField(
                            value = numeroMatricula,
                            onValueChange = { numeroMatricula = it },
                            modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                            label = { Text("Numero matricula") },
                        )
                    }
                    SelectionField(
                        label = "Plano do titular",
                        value = planoOptions.firstOrNull { it.codigo.toString() == selectedPlanoCodigo }?.nome ?: "Selecione",
                        options = listOf("" to "Selecione") + planoOptions.map { it.codigo.toString() to it.nome },
                        onSelected = { selectedPlanoCodigo = it },
                    )
                }
            }

            WebCard {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Endereco", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    OutlinedTextField(
                        value = cep,
                        onValueChange = {
                            val cepNormalizado = it.filter(Char::isDigit).take(8)
                            cep = cepNormalizado
                            cepLookupError = null
                            if (cepNormalizado.length < 8) {
                                ultimoCepConsultado = ""
                            }
                        },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("CEP") },
                        colors = enderecoFieldColors,
                    )
                    if (consultingCep) {
                        Text(
                            text = "Consultando CEP no S4E...",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    cepLookupError?.let { cepErro ->
                        Text(
                            text = cepErro,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    OutlinedTextField(
                        value = logradouro,
                        onValueChange = { logradouro = it },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Logradouro") },
                        colors = enderecoFieldColors,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = numero,
                            onValueChange = { numero = it },
                            modifier = Modifier.weight(1f).bringIntoViewOnFocus(),
                            label = { Text("Numero") },
                            colors = enderecoFieldColors,
                        )
                        OutlinedTextField(
                            value = uf,
                            onValueChange = { uf = it.uppercase().take(2) },
                            modifier = Modifier.weight(1f).bringIntoViewOnFocus(),
                            label = { Text("UF") },
                            colors = enderecoFieldColors,
                        )
                    }
                    OutlinedTextField(
                        value = complemento,
                        onValueChange = { complemento = it },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Complemento") },
                        colors = enderecoFieldColors,
                    )
                    OutlinedTextField(
                        value = bairro,
                        onValueChange = { bairro = it },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Bairro") },
                        colors = enderecoFieldColors,
                    )
                    OutlinedTextField(
                        value = cidade,
                        onValueChange = { cidade = it },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Cidade") },
                        colors = enderecoFieldColors,
                    )
                }
            }

            error?.let {
                WebCard {
                    Text(it, color = MaterialTheme.colorScheme.error)
                }
            }

            notice?.let {
                WebCard {
                    Text(it)
                }
            }

            success?.let {
                WebCard {
                    Text(it, color = MaterialTheme.colorScheme.primary)
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onClose, enabled = !submitting && !consultingCpf) {
                    Text("Cancelar")
                }
                Button(
                    onClick = {
                        val planoCodigo = selectedPlanoCodigo.toIntOrNull() ?: 0
                        if (!cpfLocked) {
                            error = "Consulte o CPF antes de continuar."
                            return@Button
                        }
                        if (planoCodigo <= 0) {
                            error = "Selecione um plano valido para o titular."
                            return@Button
                        }
                        val cpfDigits = CadastroPayloadBuilder.normalizeDigits(cpf)
                        if (!CadastroPayloadBuilder.validateCpf(cpfDigits)) {
                            error = "CPF invalido."
                            return@Button
                        }
                        val dataNascimentoNormalizada = dataNascimento.trim()
                        if (!isIsoDateValid(dataNascimentoNormalizada)) {
                            error = "Data nascimento invalida. Use YYYY-MM-DD."
                            return@Button
                        }
                        if (nome.trim().isBlank()) {
                            error = "Campo obrigatorio: Nome Completo."
                            return@Button
                        }
                        if (nomeMae.trim().isBlank()) {
                            error = "Campo obrigatorio: Nome da Mae."
                            return@Button
                        }
                        val sexoCodigo = sexo.toIntOrNull() ?: -1
                        if (sexoCodigo !in setOf(0, 1)) {
                            error = "Campo obrigatorio: Sexo."
                            return@Button
                        }
                        val telefoneDigits = telefone.filter(Char::isDigit)
                        if (telefoneDigits.length < 10) {
                            error = "Adicione pelo menos um telefone valido antes de cadastrar."
                            return@Button
                        }
                        if (empresa.empresaExigeMatricula == 1 && numeroMatricula.trim().isBlank()) {
                            error = "Campo obrigatorio: Matricula."
                            return@Button
                        }
                        if (
                            cep.filter(Char::isDigit).length != 8 ||
                            logradouro.trim().isBlank() ||
                            numero.trim().isBlank() ||
                            bairro.trim().isBlank() ||
                            cidade.trim().isBlank() ||
                            uf.trim().length != 2
                        ) {
                            error = "Preencha todos os campos obrigatorios do endereco."
                            return@Button
                        }

                        error = null
                        notice = null
                        success = null
                        submitting = true
                        if (submissionId.isBlank()) {
                            submissionId = UUID.randomUUID().toString()
                        }
                        val sexoDescricao = if (sexoCodigo == 1) "Masculino" else "Feminino"
                        val dependentes = listOf(
                            PublicCadastroDependente(
                                tipo = 1,
                                nome = nome.trim(),
                                dataNascimento = dataNascimentoNormalizada,
                                cpf = cpfDigits,
                                sexo = sexoCodigo,
                                sexoDescricao = sexoDescricao,
                                plano = planoCodigo,
                                planoValor = "0,00",
                                nomeMae = nomeMae.trim(),
                                carenciaAtendimento = 0,
                                funcionarioCadastro = 0,
                            ),
                        )
                        val titulares = dependentes.filter { it.tipo == 1 }
                        if (titulares.size != 1) {
                            error = "O cadastro precisa ter exatamente 1 titular nos dependentes."
                            submitting = false
                            return@Button
                        }
                        if (dependentes.any { it.plano <= 0 }) {
                            error = "Todos os dependentes precisam ter um plano selecionado."
                            submitting = false
                            return@Button
                        }

                        val payload = PublicCadastroPayload(
                            cpf = cpfDigits,
                            nome = nome.trim(),
                            dataNascimento = dataNascimentoNormalizada,
                            sexoCodigo = sexoCodigo,
                            contatos = listOf(
                                PublicCadastroContato(
                                    tipo = "celular",
                                    valor = telefoneDigits,
                                    principal = true,
                                ),
                            ),
                            endereco = PublicCadastroEndereco(
                                cep = cep,
                                logradouro = logradouro,
                                numero = numero,
                                complemento = complemento.takeIf { it.isNotBlank() },
                                bairro = bairro,
                                cidade = cidade,
                                uf = uf,
                            ),
                            nomeMae = nomeMae.trim(),
                            numeroMatricula = numeroMatricula.takeIf { it.isNotBlank() },
                            dependentes = dependentes,
                        )

                        scope.launch {
                            runCatching {
                                val cpfValidation = viewModel.checkPublicCadastroCpf(token, cpfDigits)
                                if (!cpfValidation.ok) {
                                    throw IllegalStateException(
                                        CadastroApiErrorMapper.mapUserMessage(
                                            cpfValidation.error,
                                            "CPF nao permitido neste link.",
                                        ),
                                    )
                                }
                                val idempotencyKey = "public:${token.trim()}:${cpfDigits}:$submissionId"
                                viewModel.submitPublicCadastro(token, payload, idempotencyKey)
                            }.onSuccess { response ->
                                if (!response.ok) {
                                    error = CadastroApiErrorMapper.mapUserMessage(
                                        response.error,
                                        "Falha ao concluir adesao.",
                                    )
                                } else {
                                    success = response.message ?: "Cadastro concluido com sucesso."
                                    notice = response.warning
                                    draftStorage.edit().remove(draftStorageKey).apply()
                                    submissionId = ""
                                }
                            }.onFailure { throwable ->
                                error = CadastroApiErrorMapper.mapUserMessage(
                                    throwable.message,
                                    "Falha ao enviar cadastro.",
                                )
                            }
                            submitting = false
                        }
                    },
                    enabled = !submitting && !consultingCpf,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (submitting) {
                        CircularProgressIndicator(strokeWidth = 2.dp)
                    } else {
                        Text("Concluir adesao")
                    }
                }
            }
        }
    }
}

private fun extractPlanoOptions(planosRaw: kotlinx.serialization.json.JsonElement?): List<PublicPlanoOption> {
    val array = when (planosRaw) {
        is JsonArray -> planosRaw
        is JsonObject -> planosRaw["precoPlano"] as? JsonArray
        else -> null
    } ?: return emptyList()

    return array.mapNotNull { element ->
        val item = element as? JsonObject ?: return@mapNotNull null
        val codigo = item["Plano"]?.jsonPrimitive?.intOrNull
            ?: item["plano"]?.jsonPrimitive?.intOrNull
            ?: item["codigoPlano"]?.jsonPrimitive?.intOrNull
            ?: return@mapNotNull null

        val nome = item["NomeANS"]?.jsonPrimitive?.contentOrNull
            ?: item["nomeANS"]?.jsonPrimitive?.contentOrNull
            ?: item["nome"]?.jsonPrimitive?.contentOrNull
            ?: "Plano $codigo"

        PublicPlanoOption(codigo = codigo, nome = nome)
    }.distinctBy { it.codigo }
}

private fun isIsoDateValid(value: String): Boolean {
    if (!Regex("""\d{4}-\d{2}-\d{2}""").matches(value)) return false
    return runCatching { LocalDate.parse(value) }.isSuccess
}

private val kotlinx.serialization.json.JsonPrimitive.contentOrNull: String?
    get() = content.takeIf { it.isNotBlank() }
