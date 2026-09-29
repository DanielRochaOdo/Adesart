package br.com.vendamais.mobile.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log
import android.webkit.MimeTypeMap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import br.com.vendamais.mobile.data.models.CadastroDetalhe
import br.com.vendamais.mobile.data.models.MobileProfile
import br.com.vendamais.mobile.data.models.TeamMemberOption
import br.com.vendamais.mobile.data.remote.DraftAttachmentStorage
import br.com.vendamais.mobile.domain.cadastro.CadastroApiErrorMapper
import br.com.vendamais.mobile.domain.cadastro.CadastroModalSignal
import br.com.vendamais.mobile.domain.cadastro.LemmitAgePolicy
import br.com.vendamais.mobile.domain.cadastro.isPendingCadastroStatus
import br.com.vendamais.mobile.ui.AppUiState
import br.com.vendamais.mobile.ui.AppViewModel
import br.com.vendamais.mobile.ui.components.bringIntoViewOnFocus
import br.com.vendamais.mobile.ui.components.rememberKeyboardAwareFooterState
import br.com.vendamais.mobile.ui.components.WebCard
import br.com.vendamais.mobile.ui.components.VendaWizardProgress
import br.com.vendamais.mobile.ui.theme.Amber100
import br.com.vendamais.mobile.ui.theme.Amber500
import br.com.vendamais.mobile.ui.theme.BrandOrange
import br.com.vendamais.mobile.ui.theme.EmeraldDark
import br.com.vendamais.mobile.ui.theme.EmeraldSoft
import br.com.vendamais.mobile.ui.theme.Red100
import br.com.vendamais.mobile.ui.theme.Red500
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.text.NumberFormat
import java.io.File
import java.time.LocalDate
import java.time.Period
import java.text.Normalizer
import java.util.Locale

private const val MAX_UPLOAD_BYTES = 5 * 1024 * 1024
private const val LEMMIT_DEPENDENTE_MAX_ATTEMPTS = 1
private const val LEMMIT_DEPENDENTE_TIMEOUT_MS = 9000L
private const val LEMMIT_DEPENDENTE_RETRY_DELAY_MS = 0L
private val cadastroEditorJsonParser = Json {
    ignoreUnknownKeys = true
    isLenient = true
}

private data class ContatoFormState(
    val tipo: String = "celular",
    val valor: String = "",
    val principal: Boolean = false,
)

private data class CadastroDependenteFormState(
    val tipo: Int = 0,
    val nome: String = "",
    val dataNascimento: TextFieldValue = TextFieldValue(""),
    val cpf: TextFieldValue = TextFieldValue(""),
    val sexo: Int = -1,
    val plano: Int = 0,
    val planoValor: String = "0,00",
    val planoNome: String = "",
    val tipoPlano: String = "",
    val nomeMae: String = "",
    val carenciaAtendimento: Int = 0,
)

private data class CadastroPlanoOption(
    val codigo: Int,
    val nome: String,
    val valorTitular: Double? = null,
    val valorDependente: Double? = null,
    val regraValor: String = "",
    val label: String = nome,
)

private data class CadastroEnderecoFormState(
    val cep: String = "",
    val tipoLogradouro: String = "",
    val logradouro: String = "",
    val numero: String = "",
    val complemento: String = "",
    val bairro: String = "",
    val cidade: String = "",
    val uf: String = "",
    val idTipoLogradouro: Int? = null,
    val idBairro: Int? = null,
    val idMunicipio: Int? = null,
    val idUf: Int? = null,
    val ufSigla: String? = null,
)

private enum class CadastroMessageTone {
    WARNING,
    ALERT,
    ERROR,
    SUCCESS,
}

@Composable
fun CadastroEditorDialog(
    state: AppUiState,
    viewModel: AppViewModel,
    cadastro: CadastroDetalhe,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val profile = state.profile
    val enderecoInicial = remember(cadastro.id) { parseCadastroEndereco(cadastro.endereco) }

    var nome by rememberSaveable(cadastro.id) { mutableStateOf(cadastro.nome.orEmpty()) }
    var sexoCodigo by rememberSaveable(cadastro.id) { mutableStateOf(cadastro.sexoCodigo?.toString() ?: "") }
    var nomeMae by rememberSaveable(cadastro.id) { mutableStateOf(cadastro.nomeMae.orEmpty()) }
    var numeroMatricula by rememberSaveable(cadastro.id) { mutableStateOf(cadastro.numeroMatricula.orEmpty()) }
    var statusAdesaoId by rememberSaveable(cadastro.id) { mutableStateOf(cadastro.statusAdesaoId.orEmpty()) }
    var arquivoPath by rememberSaveable(cadastro.id) { mutableStateOf(cadastro.arquivoPath.orEmpty()) }
    var arquivoNome by rememberSaveable(cadastro.id) { mutableStateOf(cadastro.arquivoNome ?: cadastro.arquivoPath?.substringAfterLast('/') ?: "") }
    var arquivoMimeType by rememberSaveable(cadastro.id) { mutableStateOf(cadastro.arquivoMimeType ?: "application/octet-stream") }
    var arquivoTamanho by rememberSaveable(cadastro.id) { mutableStateOf(cadastro.arquivoTamanho ?: 0L) }
    var currentStep by rememberSaveable(cadastro.id) { mutableStateOf(1) }
    var selectedVendedorId by rememberSaveable(cadastro.id) {
        mutableStateOf(if (profile?.role == "VENDEDOR") profile.id else "")
    }
    var selectedAdesionistaId by rememberSaveable(cadastro.id) {
        mutableStateOf(if (profile?.role == "ADESIONISTA") profile.id else "")
    }

    var novoContatoTipo by rememberSaveable(cadastro.id) { mutableStateOf("celular") }
    var novoContatoValorField by rememberSaveable(cadastro.id, stateSaver = textFieldValueSaver()) {
        mutableStateOf(TextFieldValue(""))
    }
    var enderecoCep by rememberSaveable(cadastro.id) { mutableStateOf(enderecoInicial.cep) }
    var enderecoTipoLogradouro by rememberSaveable(cadastro.id) { mutableStateOf(enderecoInicial.tipoLogradouro) }
    var enderecoLogradouro by rememberSaveable(cadastro.id) { mutableStateOf(enderecoInicial.logradouro) }
    var enderecoNumero by rememberSaveable(cadastro.id) { mutableStateOf(enderecoInicial.numero) }
    var enderecoComplemento by rememberSaveable(cadastro.id) { mutableStateOf(enderecoInicial.complemento) }
    var enderecoBairro by rememberSaveable(cadastro.id) { mutableStateOf(enderecoInicial.bairro) }
    var enderecoCidade by rememberSaveable(cadastro.id) { mutableStateOf(enderecoInicial.cidade) }
    var enderecoUf by rememberSaveable(cadastro.id) { mutableStateOf(enderecoInicial.uf) }
    var enderecoIdTipoLogradouro by rememberSaveable(cadastro.id) { mutableStateOf(enderecoInicial.idTipoLogradouro) }
    var enderecoIdBairro by rememberSaveable(cadastro.id) { mutableStateOf(enderecoInicial.idBairro) }
    var enderecoIdMunicipio by rememberSaveable(cadastro.id) { mutableStateOf(enderecoInicial.idMunicipio) }
    var enderecoIdUf by rememberSaveable(cadastro.id) { mutableStateOf(enderecoInicial.idUf) }
    var enderecoUfSigla by rememberSaveable(cadastro.id) { mutableStateOf(enderecoInicial.ufSigla.orEmpty()) }
    var enderecoCepTouched by rememberSaveable(cadastro.id) { mutableStateOf(false) }
    var cepLookupLoading by rememberSaveable(cadastro.id) { mutableStateOf(false) }
    var cepLookupError by rememberSaveable(cadastro.id) { mutableStateOf<String?>(null) }
    var ultimoCepConsultado by rememberSaveable(cadastro.id) { mutableStateOf("") }

    var saving by rememberSaveable { mutableStateOf(false) }
    var uploading by rememberSaveable { mutableStateOf(false) }
    var previewingArquivo by rememberSaveable { mutableStateOf(false) }
    var localMessage by rememberSaveable { mutableStateOf<String?>(null) }
    var showSelectStatusOnClose by rememberSaveable { mutableStateOf(false) }
    var suppressBackgroundPersist by rememberSaveable(cadastro.id) { mutableStateOf(false) }
    var showArquivoSourceModal by rememberSaveable { mutableStateOf(false) }
    var cameraCapturePath by rememberSaveable { mutableStateOf("") }
    val keyboardAwareFooter = rememberKeyboardAwareFooterState()

    var dataNascimentoField by rememberSaveable(cadastro.id, stateSaver = textFieldValueSaver()) {
        val digits = extractDateDigits(cadastro.dataNascimento.orEmpty())
        mutableStateOf(TextFieldValue(digits, TextRange(digits.length)))
    }

    val planoOptions = remember(
        cadastro.id,
        cadastro.planosRaw,
        cadastro.empresaRaw,
        state.planosMap,
        state.cadastroWorkspace.config?.planosOcultos,
    ) {
        extractPlanosFromCadastro(
            cadastro = cadastro,
            hiddenPlanos = state.cadastroWorkspace.config?.planosOcultos.orEmpty(),
            planosMap = state.planosMap,
        )
    }

    val contatos = remember(cadastro.id) {
        mutableStateListOf<ContatoFormState>().apply {
            addAll(parseContatos(cadastro))
        }
    }

    val dependentes = remember(cadastro.id) {
        mutableStateListOf<CadastroDependenteFormState>().apply {
            val parsed = parseDependentes(cadastro, planoOptions)
            if (parsed.isEmpty()) {
                add(buildTitularDependente(cadastro))
            } else {
                addAll(parsed)
            }
        }
    }
    val cpfValidationErrors = remember(cadastro.id) { mutableStateMapOf<Int, String>() }
    val consultedCpfByIndex = remember(cadastro.id) { mutableStateMapOf<Int, String>() }
    var consultingLemmitIndex by rememberSaveable(cadastro.id) { mutableStateOf<Int?>(null) }

    val parentescoOptions = remember(state.parentescosMap) {
        listOf(0 to "Selecione") +
            state.parentescosMap
                .filter { it.ativo && it.parentescoId != 1 }
                .map { it.parentescoId to it.label }
    }

    val canChooseVendedor = profile?.role in setOf(
        "ADMINISTRADOR",
        "ADMIN",
        "GERENTE",
        "GESTOR",
        "SUPERVISOR",
        "CADASTRO",
        "ADESIONISTA",
    )
    val canChooseAdesionista = profile?.role in setOf(
        "ADMINISTRADOR",
        "GERENTE",
        "GESTOR",
        "SUPERVISOR",
        "VENDEDOR",
        "CADASTRO",
    )
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

    LaunchedEffect(enderecoCep, enderecoCepTouched) {
        val cepNormalizado = enderecoCep.filter(Char::isDigit).take(8)
        if (!enderecoCepTouched) return@LaunchedEffect
        if (cepNormalizado.length != 8) return@LaunchedEffect
        if (cepNormalizado == ultimoCepConsultado) return@LaunchedEffect

        ultimoCepConsultado = cepNormalizado
        cepLookupLoading = true
        cepLookupError = null

        runCatching { viewModel.consultarEnderecoCep(cepNormalizado) }
            .onSuccess { endereco ->
                if (endereco.cep.isNotBlank()) {
                    enderecoCep = endereco.cep.filter(Char::isDigit).take(8)
                }
                if (endereco.tipoLogradouro.isNotBlank()) {
                    enderecoTipoLogradouro = endereco.tipoLogradouro
                }
                if (endereco.logradouro.isNotBlank()) {
                    enderecoLogradouro = endereco.logradouro
                }
                if (endereco.bairro.isNotBlank()) {
                    enderecoBairro = endereco.bairro
                }
                if (endereco.cidade.isNotBlank()) {
                    enderecoCidade = endereco.cidade
                }
                val ufNormalizada = endereco.uf
                    .ifBlank { endereco.ufSigla.orEmpty() }
                    .uppercase(Locale.ROOT)
                    .take(2)
                if (ufNormalizada.isNotBlank()) {
                    enderecoUf = ufNormalizada
                    enderecoUfSigla = ufNormalizada
                }
                endereco.idTipoLogradouro?.let { enderecoIdTipoLogradouro = it }
                endereco.idBairro?.let { enderecoIdBairro = it }
                endereco.idMunicipio?.let { enderecoIdMunicipio = it }
                endereco.idUf?.let { enderecoIdUf = it }
            }
            .onFailure { throwable ->
                cepLookupError = CadastroApiErrorMapper.mapUserMessage(
                    throwable.message,
                    "Nao foi possivel consultar o endereco pelo CEP.",
                )
            }

        cepLookupLoading = false
    }

    suspend fun uploadSelectedArquivo(
        fileName: String,
        mimeType: String,
        bytes: ByteArray,
    ) {
        validateUpload(
            fileName = fileName,
            mimeType = mimeType,
            size = bytes.size.toLong(),
        )
        val previousPath = arquivoPath
        val draftAttachment = withContext(Dispatchers.IO) {
            DraftAttachmentStorage.copyBytesToDraftStorage(
                context = context,
                draftId = cadastro.id,
                originalName = fileName,
                mimeType = mimeType,
                bytes = bytes,
            )
        }
        if (previousPath.isNotBlank()) {
            val existingFile = File(previousPath)
            if (existingFile.exists()) {
                withContext(Dispatchers.IO) { runCatching { existingFile.delete() } }
            } else {
                runCatching { viewModel.deleteTempFile(previousPath) }
            }
        }
        arquivoPath = draftAttachment.path
        arquivoNome = draftAttachment.name
        arquivoMimeType = draftAttachment.mimeType
        arquivoTamanho = draftAttachment.size
        viewModel.persistCadastroDraftSilently(
            cadastro.id,
            buildJsonObject {
                put("arquivo_path", draftAttachment.path)
                put("arquivo_nome", draftAttachment.name)
                put("arquivo_mime_type", draftAttachment.mimeType)
                put("arquivo_tamanho", draftAttachment.size)
            },
        )
        localMessage = "Arquivo atualizado com sucesso."
    }

    suspend fun openArquivoPreview() {
        val path = arquivoPath.trim()
        if (path.isBlank()) {
            localMessage = "Nenhum arquivo anexado para visualizacao."
            return
        }
        previewingArquivo = true
        runCatching {
            val bytes = if (File(path).exists()) {
                File(path).readBytes()
            } else {
                viewModel.downloadTempFile(path)
            }
            val uri = writePreviewFile(
                context = context,
                fileName = arquivoNome.ifBlank { path.substringAfterLast('/') },
                bytes = bytes,
            )
            val mime = resolvePreviewMimeType(arquivoNome.ifBlank { path.substringAfterLast('/') })
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mime)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(Intent.createChooser(intent, "Visualizar arquivo"))
        }.onFailure { throwable ->
            localMessage = CadastroApiErrorMapper.mapUserMessage(
                throwable.message,
                "Nao foi possivel abrir o arquivo.",
            )
        }
        previewingArquivo = false
    }

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        suppressBackgroundPersist = false
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            uploading = true
            runCatching {
                val bytes = withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: error("Nao foi possivel ler o arquivo.")
                }
                uploadSelectedArquivo(
                    fileName = resolveFileName(context, uri),
                    mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream",
                    bytes = bytes,
                )
            }.onSuccess {
            }.onFailure { throwable ->
                localMessage = CadastroApiErrorMapper.mapUserMessage(
                    throwable.message,
                    "Falha ao carregar arquivo.",
                )
            }
            uploading = false
        }
    }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        suppressBackgroundPersist = false
        val cameraPath = cameraCapturePath
        cameraCapturePath = ""
        if (!success || cameraPath.isBlank()) return@rememberLauncherForActivityResult

        scope.launch {
            uploading = true
            runCatching {
                val cameraFile = File(cameraPath)
                val bytes = withContext(Dispatchers.IO) { cameraFile.readBytes() }
                uploadSelectedArquivo(
                    fileName = cameraFile.name,
                    mimeType = "image/jpeg",
                    bytes = bytes,
                )
            }.onFailure { throwable ->
                localMessage = CadastroApiErrorMapper.mapUserMessage(
                    throwable.message,
                    "Falha ao capturar arquivo pela camera.",
                )
            }
            runCatching { File(cameraPath).delete() }
            uploading = false
        }
    }

    LaunchedEffect(nome, nomeMae, sexoCodigo, dataNascimentoField.text, cadastro.cpf) {
        if (dependentes.isEmpty()) {
            dependentes += buildTitularDependente(cadastro)
        }

        val titular = dependentes.firstOrNull() ?: return@LaunchedEffect
        val titularCpf = cadastro.cpf.filter(Char::isDigit).take(11)
        val titularDateDigits = dataNascimentoField.text.filter(Char::isDigit).take(8)
        val desiredDate = TextFieldValue(titularDateDigits, TextRange(titularDateDigits.length))
        val desiredCpf = TextFieldValue(titularCpf, TextRange(titularCpf.length))
        val desiredSexo = sexoCodigo.toIntOrNull() ?: -1

        dependentes[0] = titular.copy(
            tipo = 1,
            nome = nome,
            dataNascimento = desiredDate,
            cpf = desiredCpf,
            sexo = desiredSexo,
            nomeMae = nomeMae,
        )
    }

    LaunchedEffect(cadastro.id, state.vendedores, state.adesionistas, profile?.id, profile?.role) {
        if (profile?.role == "VENDEDOR") {
            selectedVendedorId = profile.id
        } else if (selectedVendedorId.isBlank() && !cadastro.vendedorCodigo.isNullOrBlank()) {
            selectedVendedorId = state.vendedores
                .firstOrNull { it.externalId == cadastro.vendedorCodigo }
                ?.id
                .orEmpty()
        }

        if (profile?.role == "ADESIONISTA") {
            selectedAdesionistaId = profile.id
        } else if (selectedAdesionistaId.isBlank() && !cadastro.adesionistaCodigo.isNullOrBlank()) {
            selectedAdesionistaId = state.adesionistas
                .firstOrNull { it.externalId == cadastro.adesionistaCodigo }
                ?.id
                .orEmpty()
        }
    }

    fun normalizeContatoValor(tipo: String, valor: String): String {
        val raw = valor.trim()
        return if (tipo == "email") raw else raw.filter(Char::isDigit)
    }

    fun contatoMaxDigits(tipo: String): Int = if (tipo == "fixo") 10 else 11

    fun normalizeContatoEditingValue(tipo: String, value: TextFieldValue): TextFieldValue {
        if (tipo == "email") return value
        val digits = value.text.filter(Char::isDigit).take(contatoMaxDigits(tipo))
        return TextFieldValue(
            text = digits,
            selection = TextRange(digits.length),
        )
    }

    fun buildDraftPatchPayload(): JsonObject {
        val dataIso = toIsoDateOrNull(dataNascimentoField.text)
        val funcionarioCadastro = state.profile?.externalId?.toIntOrNull() ?: 0
        val vendedor = resolveVendedor(profile, state, selectedVendedorId)
        val adesionista = resolveAdesionista(profile, state, selectedAdesionistaId)
        val traceId = "snap-${cadastro.id.take(8)}-${System.currentTimeMillis()}"

        val contatosJson = buildJsonArray {
            contatos.forEach { contato ->
                add(
                    buildJsonObject {
                        put("tipo", contato.tipo)
                        put("valor", contato.valor)
                        put("principal", contato.principal)
                    },
                )
            }
        }

        val dependentesJson = buildJsonArray {
            dependentes.forEachIndexed { index, dep ->
                val cpfDigits = dep.cpf.text.filter(Char::isDigit)
                val sexo = dep.sexo
                val sexoDescricao = when (sexo) {
                    1 -> "Masculino"
                    0 -> "Feminino"
                    else -> ""
                }
                val dataDep = toIsoDateOrNull(dep.dataNascimento.text).orEmpty()
                val tipo = if (index == 0) 1 else dep.tipo

                add(
                    buildJsonObject {
                        put("tipo", tipo)
                        put("nome", dep.nome.trim())
                        put("dataNascimento", dataDep)
                        put("cpf", cpfDigits)
                        put("sexo", sexo)
                        put("sexoDescricao", sexoDescricao)
                        put("plano", dep.plano)
                        val planoOption = planoOptions.firstOrNull { it.codigo == dep.plano }
                        if (planoOption != null) {
                            put("planoNome", planoOption.nome)
                            put("tipoPlano", planoOption.regraValor)
                        } else {
                            if (dep.planoNome.isNotBlank()) put("planoNome", dep.planoNome)
                            if (dep.tipoPlano.isNotBlank()) put("tipoPlano", dep.tipoPlano)
                        }
                        put("planoValor", dep.planoValor.ifBlank { "0,00" })
                        put("nomeMae", dep.nomeMae.trim())
                        put("carenciaAtendimento", dep.carenciaAtendimento)
                        put("funcionarioCadastro", funcionarioCadastro)
                    },
                )
            }
        }
        val dependentesCount = dependentesJson.size
        val titularTemPlano = dependentes.firstOrNull()?.plano?.takeIf { it != 0 } != null
        val dependenteComPlanoCount = dependentes.drop(1).count { it.plano != 0 }
        val arquivoPathFlag = arquivoPath.isNotBlank()
        val arquivoNomeFlag = arquivoNome.isNotBlank()
        val arquivoMimeFlag = arquivoMimeType.isNotBlank()
        val arquivoTamanhoFlag = arquivoTamanho > 0
        Log.i(
            "CadastroDraftTrace",
            "SNAPSHOT_BUILD trace=$traceId id=${cadastro.id} dependentesCount=$dependentesCount titularPlano=$titularTemPlano dependentePlanoCount=$dependenteComPlanoCount arquivoPath=$arquivoPathFlag arquivoNome=$arquivoNomeFlag mime=$arquivoMimeFlag tamanho=$arquivoTamanhoFlag",
        )
        val cpfTitularPersist = dependentes
            .firstOrNull()
            ?.cpf
            ?.text
            ?.filter(Char::isDigit)
            ?.takeIf { it.length == 11 }
            ?: cadastro.cpf
                ?.filter(Char::isDigit)
                ?.takeIf { it.length == 11 }

        return buildJsonObject {
            put("tipo_cadastro", "cadastro")
            cpfTitularPersist?.let { put("cpf", it) }
            put("nome", nome.ifBlank { "" })
            if (dataIso != null) {
                put("data_nascimento", dataIso)
            }
            sexoCodigo.toIntOrNull()?.let { put("sexo_codigo", it) }
            put("nome_mae", nomeMae.ifBlank { "" })
            put("numero_matricula", numeroMatricula.ifBlank { "" })
            put(
                "endereco",
                buildJsonObject {
                    put("cep", enderecoCep.filter(Char::isDigit).take(8))
                    put("tipoLogradouro", enderecoTipoLogradouro.trim())
                    put("logradouro", enderecoLogradouro.trim())
                    put("numero", enderecoNumero.trim())
                    put("complemento", enderecoComplemento.trim())
                    put("bairro", enderecoBairro.trim())
                    put("cidade", enderecoCidade.trim())
                    put("uf", enderecoUf.trim().uppercase(Locale.ROOT).take(2))
                    enderecoIdTipoLogradouro?.let { put("idTipoLogradouro", it) }
                    enderecoIdBairro?.let { put("idBairro", it) }
                    enderecoIdMunicipio?.let { put("idMunicipio", it) }
                    enderecoIdUf?.let { put("idUf", it) }
                    enderecoUfSigla
                        .trim()
                        .uppercase(Locale.ROOT)
                        .take(2)
                        .takeIf { it.isNotBlank() }
                        ?.let { put("ufSigla", it) }
                },
            )
            if (statusAdesaoId.isNotBlank()) put("status_adesao_id", statusAdesaoId)
            put("arquivo_path", arquivoPath.ifBlank { "" })
            put("arquivo_nome", arquivoNome.ifBlank { "" })
            put("arquivo_mime_type", arquivoMimeType.ifBlank { "application/octet-stream" })
            put("arquivo_tamanho", arquivoTamanho)
            put("contatos", contatosJson)
            put("dependentes", dependentesJson)
            vendedor?.let {
                put("vendedor_id", it.id)
                if (!it.externalId.isNullOrBlank()) put("vendedor_codigo", it.externalId)
                put("vendedor_nome", it.name)
            }
            adesionista?.let {
                put("adesionista_id", it.id)
                if (!it.externalId.isNullOrBlank()) put("adesionista_codigo", it.externalId)
                put("adesionista_nome", it.name)
            }
        }
    }

    fun persistDraftSnapshotSilently() {
        if (saving || uploading || state.sendingCadastro || suppressBackgroundPersist) return
        val payload = buildDraftPatchPayload()
        viewModel.persistCadastroDraftSilently(cadastro.id, payload)
    }

    fun requestCloseEditor() {
        if (statusAdesaoId.isBlank()) {
            if (state.statusAdesoes.isEmpty()) {
                localMessage = "Nenhum status de adesao disponivel. Cadastre ao menos um status antes de fechar."
                return
            }
            showSelectStatusOnClose = true
            return
        }
        scope.launch {
            val payload = buildDraftPatchPayload()
            runCatching { viewModel.updateCadastroRecord(cadastro.id, payload) }
                .onFailure { throwable ->
                    localMessage = CadastroApiErrorMapper.mapUserMessage(
                        throwable.message,
                        "Falha ao salvar rascunho antes de fechar.",
                    )
                    return@launch
                }
            onDismiss()
        }
    }

    fun addContato() {
        val normalized = normalizeContatoValor(novoContatoTipo, novoContatoValorField.text)
        if (normalized.isBlank()) {
            localMessage = "Informe um valor de contato antes de adicionar."
            return
        }
        val shouldBePrincipal = contatos.none { it.principal }
        contatos += ContatoFormState(
            tipo = novoContatoTipo,
            valor = normalized,
            principal = shouldBePrincipal,
        )
        novoContatoValorField = TextFieldValue("")
        persistDraftSnapshotSilently()
    }

    fun removeContato(index: Int) {
        if (index !in contatos.indices) return
        val removedPrincipal = contatos[index].principal
        contatos.removeAt(index)
        if (removedPrincipal && contatos.isNotEmpty()) {
            contatos[0] = contatos[0].copy(principal = true)
        }
        persistDraftSnapshotSilently()
    }

    fun toggleContatoPrincipal(index: Int) {
        if (index !in contatos.indices) return
        contatos.indices.forEach { i ->
            contatos[i] = contatos[i].copy(principal = i == index)
        }
        persistDraftSnapshotSilently()
    }

    fun addDependente() {
        dependentes += CadastroDependenteFormState()
        persistDraftSnapshotSilently()
    }

    fun removeDependente(index: Int) {
        if (index <= 0 || index !in dependentes.indices) return
        dependentes.removeAt(index)
        cpfValidationErrors.clear()
        consultedCpfByIndex.clear()
        persistDraftSnapshotSilently()
    }

    suspend fun consultarLemmitDependente(index: Int, cpfDigits: String) {
        if (state.cadastroWorkspace.config?.lemmitDependente != true) return
        if (cpfDigits.length != 11 || !validateCpf(cpfDigits)) return

        consultingLemmitIndex = index
        try {
            val canUse = viewModel.canUseLemmit()
            if (!canUse) {
                val limitInfo = runCatching { viewModel.fetchLemmitLimitInfo() }.getOrNull()
                val motivo = if (limitInfo?.limiteMensal != null) {
                    "Limite mensal da Lemmit atingido."
                } else {
                    "Consulta Lemmit indisponivel para este usuario."
                }
                cpfValidationErrors[index] = "$motivo Apague e digite novamente o CPF para nova leitura."
                return
            }

            var lastFailure: Throwable? = null
            repeat(LEMMIT_DEPENDENTE_MAX_ATTEMPTS) { attempt ->
                val result = runCatching {
                    withTimeoutOrNull(LEMMIT_DEPENDENTE_TIMEOUT_MS) {
                        viewModel.consultarCpfLemmit(cpfDigits)
                    } ?: throw IllegalStateException("Tempo limite da consulta Lemmit excedido.")
                }

                val lemmitData = result.getOrNull()
                if (lemmitData != null) {
                    val pessoa = lemmitData.pessoa
                    if (pessoa == null) {
                        consultedCpfByIndex.remove(index)
                        cpfValidationErrors[index] =
                            "CPF sem retorno na Lemmit. Apague e digite novamente para nova leitura."
                        return
                    }

                    if (LemmitAgePolicy.shouldShowUnderageNotice(lemmitData)) {
                        consultedCpfByIndex.remove(index)
                        cpfValidationErrors.remove(index)
                        localMessage = LemmitAgePolicy.UNDERAGE_NOTICE
                        return
                    }
                    val dataNascimentoRaw = pessoa.dataNascimento
                        ?.trim()
                        ?.takeIf { it.isNotBlank() }
                        ?: pessoa.dataNascimentoAlternativa
                            ?.trim()
                            ?.takeIf { it.isNotBlank() }
                    val dataNascimentoDigits = resolveLemmitDateDigits(dataNascimentoRaw)
                    val sexoCodigoLemmit = resolveLemmitSexoCodigo(pessoa.sexo)
                    val nomeMaeLemmit = pessoa.nomeMae
                        ?.trim()
                        ?.takeIf { it.isNotBlank() }
                        ?: pessoa.nomeMaeAlternativa
                            ?.trim()
                            ?.takeIf { it.isNotBlank() }

                    if (index !in dependentes.indices) return
                    dependentes[index] = dependentes[index].copy(
                        nome = pessoa.nome?.trim().takeIf { !it.isNullOrBlank() } ?: dependentes[index].nome,
                        nomeMae = nomeMaeLemmit ?: dependentes[index].nomeMae,
                        dataNascimento = dataNascimentoDigits?.let { TextFieldValue(it, TextRange(it.length)) }
                            ?: dependentes[index].dataNascimento,
                        sexo = sexoCodigoLemmit ?: dependentes[index].sexo,
                    )
                    cpfValidationErrors.remove(index)
                    localMessage = "Dados Lemmit carregados para o CPF informado."
                    return
                }

                lastFailure = result.exceptionOrNull()
                val shouldRetry = shouldRetryLemmitRequest(lastFailure?.message)
                if (!shouldRetry || attempt == LEMMIT_DEPENDENTE_MAX_ATTEMPTS - 1) return@repeat
                delay(LEMMIT_DEPENDENTE_RETRY_DELAY_MS)
            }

            consultedCpfByIndex.remove(index)
            val fallback = CadastroApiErrorMapper.mapUserMessage(
                lastFailure?.message,
                "Falha na consulta Lemmit.",
            )
            val retryPrompt = if (shouldRetryLemmitRequest(lastFailure?.message)) {
                "Instabilidade na API Lemmit. Apague e digite novamente o CPF para nova leitura."
            } else {
                "$fallback Apague e digite novamente o CPF para nova leitura."
            }
            cpfValidationErrors[index] = retryPrompt
        } catch (throwable: Throwable) {
            consultedCpfByIndex.remove(index)
            val fallback = CadastroApiErrorMapper.mapUserMessage(
                throwable.message,
                "Falha na consulta Lemmit.",
            )
            val retryPrompt = if (shouldRetryLemmitRequest(throwable.message)) {
                "Instabilidade na API Lemmit. Apague e digite novamente o CPF para nova leitura."
            } else {
                "$fallback Apague e digite novamente o CPF para nova leitura."
            }
            cpfValidationErrors[index] = retryPrompt
        } finally {
            consultingLemmitIndex = null
        }
    }

    fun validateStepOne(): String? {
        val dataIso = toIsoDateOrNull(dataNascimentoField.text)
        val vendedor = resolveVendedor(profile, state, selectedVendedorId)
        if (requiresVendedorSelection(profile) && vendedor?.externalId.isNullOrBlank()) {
            return "Selecione um vendedor antes de continuar."
        }
        if (nome.isBlank()) return "Nome completo obrigatorio."
        if (dataIso == null) return "Data de nascimento invalida. Use dd/mm/aaaa."
        if (sexoCodigo.toIntOrNull() !in setOf(0, 1)) return "Selecione o sexo."
        if (nomeMae.isBlank()) return "Nome da mae obrigatorio."
        if (cadastro.empresaExigeMatricula == 1 && numeroMatricula.isBlank()) {
            return "Matricula obrigatoria para esta empresa."
        }

        val telefones = contatos.filter {
            it.tipo in setOf("celular", "fixo", "whatsapp") && it.valor.isNotBlank()
        }
        if (telefones.isEmpty()) return "Adicione pelo menos um telefone."

        val cepDigits = enderecoCep.filter(Char::isDigit).take(8)
        if (cepDigits.length != 8) return "CEP obrigatorio. Informe 8 digitos."
        if (enderecoLogradouro.isBlank()) return "Logradouro obrigatorio."
        if (enderecoNumero.isBlank()) return "Numero do endereco obrigatorio."
        if (enderecoBairro.isBlank()) return "Bairro obrigatorio."
        if (enderecoCidade.isBlank()) return "Cidade obrigatoria."
        if (enderecoUf.trim().length != 2) return "UF obrigatoria."

        if (dependentes.isEmpty()) return "Adicione ao menos o titular e um plano."
        val titular = dependentes.firstOrNull()
        if (titular == null || titular.tipo != 1) return "Titular nao identificado nos dependentes."

        dependentes.forEachIndexed { index, dep ->
            val label = if (index == 0) "Titular" else "Dependente ${index + 1}"
            val dateIsoDep = toIsoDateOrNull(dep.dataNascimento.text)
            if (dep.nome.isBlank()) return "$label: nome obrigatorio."
            if (dateIsoDep == null) return "$label: data de nascimento invalida."

            val cpfDigits = dep.cpf.text.filter(Char::isDigit)
            if (index == 0 && !validateCpf(cpfDigits)) return "$label: CPF invalido."
            if (index > 0) {
                if (!isUnder18(dateIsoDep) && cpfDigits.length != 11) {
                    return "$label: CPF obrigatorio para maior de idade."
                }
                if (cpfDigits.isNotBlank() && !validateCpf(cpfDigits)) {
                    return "$label: CPF invalido."
                }
            }

            if (dep.sexo !in setOf(0, 1)) return "$label: sexo obrigatorio."
            if (index > 0 && dep.tipo == 0) return "$label: parentesco obrigatorio."
            if (dep.plano == 0) return "$label: plano obrigatorio."
            if (dep.nomeMae.isBlank()) return "$label: nome da mae obrigatorio."
        }

        return null
    }

    fun buildPayload(
        requireStatus: Boolean,
        silentValidation: Boolean = false,
    ): JsonObject? {
        val dataIso = toIsoDateOrNull(dataNascimentoField.text)
        if (!silentValidation && dataNascimentoField.text.isNotBlank() && dataIso == null) {
            localMessage = "Data de nascimento invalida. Use formato dd/mm/aaaa."
            return null
        }

        if (requireStatus && statusAdesaoId.isBlank()) {
            if (!silentValidation) {
                localMessage = "Selecione o status da adesao antes de continuar."
            }
            return null
        }

        val firstPrincipalIndex = contatos.indexOfFirst { it.principal }
        if (firstPrincipalIndex == -1 && contatos.isNotEmpty()) {
            contatos[0] = contatos[0].copy(principal = true)
        }

        val funcionarioCadastro = state.profile?.externalId?.toIntOrNull() ?: 0
        val vendedor = resolveVendedor(profile, state, selectedVendedorId)
        val adesionista = resolveAdesionista(profile, state, selectedAdesionistaId)
        val empresaSelecionada = state.cadastroWorkspace.selectedEmpresa
        val empresaIdPersist = empresaSelecionada?.id?.takeIf { it > 0 }
            ?: cadastro.empresaId
            ?: cadastro.empresaCodigo
        val empresaCodigoPersist = empresaSelecionada?.codigo?.takeIf { it > 0 }
            ?: empresaSelecionada?.id?.takeIf { it > 0 }
            ?: cadastro.empresaCodigo
            ?: cadastro.empresaId
        val empresaNomePersist = empresaSelecionada
            ?.nomeFantasia
            ?.takeIf { it.isNotBlank() }
            ?: empresaSelecionada
                ?.razaoSocial
                ?.takeIf { it.isNotBlank() }
            ?: cadastro.empresaNome
        val empresaCnpjPersist = empresaSelecionada?.cnpj?.takeIf { it.isNotBlank() } ?: cadastro.empresaCnpj

        val contatosJson = buildJsonArray {
            contatos.forEach { contato ->
                add(
                    buildJsonObject {
                        put("tipo", contato.tipo)
                        put("valor", contato.valor)
                        put("principal", contato.principal)
                    },
                )
            }
        }

        val dependentesJson = buildJsonArray {
            dependentes.forEachIndexed { index, dep ->
                val cpfDigits = dep.cpf.text.filter(Char::isDigit)
                val sexo = dep.sexo
                val sexoDescricao = when (sexo) {
                    1 -> "Masculino"
                    0 -> "Feminino"
                    else -> ""
                }
                val dataDep = toIsoDateOrNull(dep.dataNascimento.text).orEmpty()
                val tipo = if (index == 0) 1 else dep.tipo

                add(
                    buildJsonObject {
                        put("tipo", tipo)
                        put("nome", dep.nome.trim())
                        put("dataNascimento", dataDep)
                        put("cpf", cpfDigits)
                        put("sexo", sexo)
                        put("sexoDescricao", sexoDescricao)
                        put("plano", dep.plano)
                        planoOptions.firstOrNull { it.codigo == dep.plano }?.let { planoOption ->
                            put("planoNome", planoOption.nome)
                            put("tipoPlano", planoOption.regraValor)
                        }
                        put("planoValor", dep.planoValor.ifBlank { "0,00" })
                        put("nomeMae", dep.nomeMae.trim())
                        put("carenciaAtendimento", dep.carenciaAtendimento)
                        put("funcionarioCadastro", funcionarioCadastro)
                    },
                )
            }
        }
        val cpfTitularPersist = dependentes
            .firstOrNull()
            ?.cpf
            ?.text
            ?.filter(Char::isDigit)
            ?.takeIf { it.length == 11 }
            ?: cadastro.cpf
                ?.filter(Char::isDigit)
                ?.takeIf { it.length == 11 }

        return buildJsonObject {
            profile?.id?.takeIf { it.isNotBlank() }?.let { put("created_by", it) }
            profile?.teamId?.takeIf { it.isNotBlank() }?.let { put("team_id", it) }
            put("tipo_cadastro", "cadastro")
            cpfTitularPersist?.let { put("cpf", it) }
            empresaIdPersist?.let { put("empresa_id", it) }
            empresaCodigoPersist?.let { put("empresa_codigo", it) }
            empresaNomePersist?.takeIf { it.isNotBlank() }?.let { put("empresa_nome", it) }
            empresaCnpjPersist?.takeIf { it.isNotBlank() }?.let { put("empresa_cnpj", it) }
            empresaSelecionada?.raw?.let { put("empresa_raw", it) }
            put("nome", nome)
            if (dataIso != null) {
                put("data_nascimento", dataIso)
            } else {
                put("data_nascimento", JsonNull)
            }
            sexoCodigo.toIntOrNull()?.let { put("sexo_codigo", it) } ?: put("sexo_codigo", JsonNull)
            put("nome_mae", nomeMae.ifBlank { "" })
            put("numero_matricula", numeroMatricula.ifBlank { "" })
            put(
                "endereco",
                buildJsonObject {
                    put("cep", enderecoCep.filter(Char::isDigit).take(8))
                    put("tipoLogradouro", enderecoTipoLogradouro.trim())
                    put("logradouro", enderecoLogradouro.trim())
                    put("numero", enderecoNumero.trim())
                    put("complemento", enderecoComplemento.trim())
                    put("bairro", enderecoBairro.trim())
                    put("cidade", enderecoCidade.trim())
                    put("uf", enderecoUf.trim().uppercase(Locale.ROOT).take(2))
                    enderecoIdTipoLogradouro?.let { put("idTipoLogradouro", it) }
                    enderecoIdBairro?.let { put("idBairro", it) }
                    enderecoIdMunicipio?.let { put("idMunicipio", it) }
                    enderecoIdUf?.let { put("idUf", it) }
                    enderecoUfSigla
                        .trim()
                        .uppercase(Locale.ROOT)
                        .take(2)
                        .takeIf { it.isNotBlank() }
                        ?.let { put("ufSigla", it) }
                },
            )
            if (statusAdesaoId.isNotBlank()) put("status_adesao_id", statusAdesaoId)
            vendedor?.let {
                put("vendedor_id", it.id)
                if (!it.externalId.isNullOrBlank()) put("vendedor_codigo", it.externalId)
                put("vendedor_nome", it.name)
            }
            adesionista?.let {
                put("adesionista_id", it.id)
                if (!it.externalId.isNullOrBlank()) put("adesionista_codigo", it.externalId)
                put("adesionista_nome", it.name)
            }
            put("arquivo_path", arquivoPath.ifBlank { "" })
            put("arquivo_nome", arquivoNome.ifBlank { "" })
            put("arquivo_mime_type", arquivoMimeType.ifBlank { "application/octet-stream" })
            put("arquivo_tamanho", arquivoTamanho)
            put("contatos", contatosJson)
            put("dependentes", dependentesJson)
        }
    }

    suspend fun submitCadastro() {
        val submitTraceId = "ui-submit-${cadastro.id.take(8)}-${System.currentTimeMillis()}"
        Log.i("CadastroEditorDialog", "[$submitTraceId] clickCadastrar saving=$saving sending=${state.sendingCadastro} uploading=$uploading")
        if (saving || state.sendingCadastro) {
            Log.i("CadastroEditorDialog", "[$submitTraceId] ignored busyState")
            return
        }
        saving = true
        if (uploading) {
            localMessage = "Aguarde o upload do arquivo finalizar antes de cadastrar."
            Log.w("CadastroEditorDialog", "[$submitTraceId] blocked uploadingInProgress")
            saving = false
            return
        }
        if (arquivoPath.isBlank()) {
            localMessage = "Anexo obrigatorio. Selecione um arquivo antes de finalizar."
            Log.w("CadastroEditorDialog", "[$submitTraceId] blocked missingArquivoPath cadastroId=${cadastro.id}")
            saving = false
            return
        }
        val validation = validateStepOne()
        if (validation != null) {
            localMessage = validation
            currentStep = 1
            Log.w("CadastroEditorDialog", "[$submitTraceId] blocked validationStepOne msg=$validation")
            saving = false
            return
        }

        val payload = buildPayload(requireStatus = false)
        if (payload == null) {
            Log.w("CadastroEditorDialog", "[$submitTraceId] blocked payloadNull")
            saving = false
            return
        }
        val payloadCpf = runCatching {
            payload["cpf"]?.jsonPrimitive?.contentOrNull
                ?.filter(Char::isDigit)
                ?.takeIf { it.length == 11 }
        }.getOrNull().orEmpty()
        val payloadCpfMask = if (payloadCpf.length == 11) "***${payloadCpf.takeLast(4)}" else "-"
        Log.i(
            "CadastroEditorDialog",
            "[$submitTraceId] dispatch sendSelectedCadastro id=${cadastro.id} cpf=$payloadCpfMask hasArquivo=${arquivoPath.isNotBlank()}",
        )
        runCatching {
            viewModel.sendSelectedCadastro(
                cadastroSnapshot = cadastro,
                payloadHint = payload,
            )
        }.onFailure { throwable ->
            Log.e("CadastroEditorDialog", "[$submitTraceId] sendSelectedCadastro threw synchronously", throwable)
            localMessage = CadastroApiErrorMapper.mapUserMessage(
                throwable.message,
                "Falha ao preparar envio.",
            )
        }
        saving = false
    }

    val autosaveSignature = buildString {
        append(nome)
        append('|')
        append(sexoCodigo)
        append('|')
        append(nomeMae)
        append('|')
        append(dataNascimentoField.text)
        append('|')
        append(numeroMatricula)
        append('|')
        append(statusAdesaoId)
        append('|')
        append(selectedVendedorId)
        append('|')
        append(selectedAdesionistaId)
        append('|')
        append(arquivoPath)
        append('|')
        append(arquivoNome)
        append('|')
        append(enderecoCep)
        append('|')
        append(enderecoTipoLogradouro)
        append('|')
        append(enderecoLogradouro)
        append('|')
        append(enderecoNumero)
        append('|')
        append(enderecoComplemento)
        append('|')
        append(enderecoBairro)
        append('|')
        append(enderecoCidade)
        append('|')
        append(enderecoUf)
        contatos.forEach { contato ->
            append("|c:")
            append(contato.tipo)
            append(':')
            append(contato.valor)
            append(':')
            append(contato.principal)
        }
        dependentes.forEach { dep ->
            append("|d:")
            append(dep.tipo)
            append(':')
            append(dep.nome)
            append(':')
            append(dep.cpf.text)
            append(':')
            append(dep.dataNascimento.text)
            append(':')
            append(dep.sexo)
            append(':')
            append(dep.plano)
            append(':')
            append(dep.planoValor)
            append(':')
            append(dep.nomeMae)
            append(':')
            append(dep.carenciaAtendimento)
        }
    }

    LaunchedEffect(cadastro.id, autosaveSignature) {
        if (saving || uploading || state.sendingCadastro || suppressBackgroundPersist) return@LaunchedEffect
        delay(1200)
        if (saving || uploading || state.sendingCadastro || suppressBackgroundPersist) return@LaunchedEffect
        val payload = buildPayload(
            requireStatus = false,
            silentValidation = true,
        ) ?: return@LaunchedEffect
        viewModel.persistCadastroDraftSilently(cadastro.id, payload)
    }

    val persistDraftOnBackground = rememberUpdatedState {
        if (saving || uploading || state.sendingCadastro || suppressBackgroundPersist) return@rememberUpdatedState
        val payload = buildPayload(
            requireStatus = false,
            silentValidation = true,
        ) ?: return@rememberUpdatedState

        viewModel.persistCadastroDraftSilently(cadastro.id, payload)
    }

    DisposableEffect(lifecycleOwner, cadastro.id) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) {
                persistDraftOnBackground.value.invoke()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    val editorScrollState = rememberScrollState()
    LaunchedEffect(cadastro.id, currentStep) {
        editorScrollState.scrollTo(0)
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = "Nova adesao",
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = if (currentStep == 1) "Etapa 1 de 2 · Dados do titular" else "Etapa 2 de 2 · Documento e conclusao",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Text(
                            text = cadastro.empresaNome ?: "Sem empresa vinculada",
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    TextButton(
                        onClick = { requestCloseEditor() },
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = null,
                            )
                            Text("Fechar")
                        }
                    }
                }
                HorizontalDivider(
                    color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f),
                )
                VendaWizardProgress(currentStep = currentStep, labels = listOf("Dados", "Documento"))

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(bottom = keyboardAwareFooter.contentBottomPadding)
                        .verticalScroll(editorScrollState),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (currentStep == 1) {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                value = nome,
                                onValueChange = { nome = it },
                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                label = { Text("Nome Completo") },
                                colors = enderecoFieldColors,
                            )
                            OutlinedTextField(
                                value = formatCpf(cadastro.cpf),
                                onValueChange = {},
                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                label = { Text("CPF") },
                                enabled = false,
                                colors = enderecoFieldColors,
                            )
                            OutlinedTextField(
                                value = dataNascimentoField,
                                onValueChange = { input ->
                                    val digits = input.text.filter(Char::isDigit).take(8)
                                    dataNascimentoField = TextFieldValue(digits, TextRange(digits.length))
                                },
                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                label = { Text("Data de Nascimento") },
                                placeholder = { Text("dd/mm/aaaa") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                visualTransformation = DateVisualTransformation(),
                                singleLine = true,
                                colors = enderecoFieldColors,
                            )
                            SelectionField(
                                label = "Sexo",
                                value = when (sexoCodigo) {
                                    "1" -> "Masculino"
                                    "0" -> "Feminino"
                                    else -> "Selecione"
                                },
                                options = listOf("" to "Selecione", "1" to "Masculino", "0" to "Feminino"),
                                onSelected = { sexoCodigo = it },
                            )
                            OutlinedTextField(
                                value = nomeMae,
                                onValueChange = { nomeMae = it },
                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                label = { Text("Nome da Mae") },
                                colors = enderecoFieldColors,
                            )
                            if (cadastro.empresaExigeMatricula == 1) {
                                OutlinedTextField(
                                    value = numeroMatricula,
                                    onValueChange = { numeroMatricula = it },
                                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                    label = { Text("Matricula") },
                                    colors = enderecoFieldColors,
                                )
                            }

                            if (canChooseVendedor) {
                                SelectionField(
                                    label = "Vendedor",
                                    value = state.vendedores
                                        .firstOrNull { it.id == selectedVendedorId }
                                        ?.toTeamSelectionLabel()
                                        ?: "Selecione um vendedor",
                                    options = state.vendedores.map { it.id to it.toTeamSelectionLabel() },
                                    onSelected = { selectedVendedorId = it },
                                )
                                if (state.vendedores.isEmpty()) {
                                    Text(
                                        text = "Nenhum vendedor disponível. Entre em contato com o administrador.",
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                            } else if (profile?.role == "VENDEDOR") {
                                OutlinedTextField(
                                    value = profile.toTeamSelectionLabel(),
                                    onValueChange = {},
                                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                    label = { Text("Vendedor") },
                                    enabled = false,
                                    colors = enderecoFieldColors,
                                )
                            }

                            if (canChooseAdesionista) {
                                SelectionField(
                                    label = "Adesionista",
                                    value = state.adesionistas
                                        .firstOrNull { it.id == selectedAdesionistaId }
                                        ?.toTeamSelectionLabel()
                                        ?: "Selecione um adesionista",
                                    options = listOf("" to "Nenhum adesionista") + state.adesionistas.map { it.id to it.toTeamSelectionLabel() },
                                    onSelected = { selectedAdesionistaId = it },
                                )
                            }

                            Text("Endereco", fontWeight = FontWeight.SemiBold)
                            OutlinedTextField(
                                value = enderecoCep,
                                onValueChange = {
                                    val cepNormalizado = it.filter(Char::isDigit).take(8)
                                    enderecoCepTouched = true
                                    enderecoCep = cepNormalizado
                                    cepLookupError = null
                                    if (cepNormalizado.length < 8) {
                                        ultimoCepConsultado = ""
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                label = { Text("CEP") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                colors = enderecoFieldColors,
                            )
                            if (cepLookupLoading) {
                                Text(
                                    text = "Buscando endereco pelo CEP...",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            cepLookupError?.let { erroCep ->
                                Text(
                                    text = erroCep,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }
                            OutlinedTextField(
                                value = enderecoTipoLogradouro,
                                onValueChange = { enderecoTipoLogradouro = it },
                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                label = { Text("Tipo Logradouro") },
                                singleLine = true,
                                colors = enderecoFieldColors,
                            )
                            OutlinedTextField(
                                value = enderecoLogradouro,
                                onValueChange = { enderecoLogradouro = it },
                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                label = { Text("Logradouro") },
                                singleLine = true,
                                colors = enderecoFieldColors,
                            )
                            OutlinedTextField(
                                value = enderecoNumero,
                                onValueChange = { enderecoNumero = it },
                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                label = { Text("Numero") },
                                singleLine = true,
                                colors = enderecoFieldColors,
                            )
                            OutlinedTextField(
                                value = enderecoComplemento,
                                onValueChange = { enderecoComplemento = it },
                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                label = { Text("Complemento") },
                                singleLine = true,
                                colors = enderecoFieldColors,
                            )
                            OutlinedTextField(
                                value = enderecoBairro,
                                onValueChange = { enderecoBairro = it },
                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                label = { Text("Bairro") },
                                singleLine = true,
                                colors = enderecoFieldColors,
                            )
                            OutlinedTextField(
                                value = enderecoCidade,
                                onValueChange = { enderecoCidade = it },
                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                label = { Text("Cidade") },
                                singleLine = true,
                                colors = enderecoFieldColors,
                            )
                            OutlinedTextField(
                                value = enderecoUf,
                                onValueChange = {
                                    enderecoUf = it.uppercase(Locale.ROOT).filter(Char::isLetter).take(2)
                                    enderecoUfSigla = enderecoUf
                                },
                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                label = { Text("UF") },
                                singleLine = true,
                                colors = enderecoFieldColors,
                            )
                        }

                        WebCard {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("Contatos", fontWeight = FontWeight.SemiBold)

                                if (contatos.isEmpty()) {
                                    Text(
                                        "Nenhum contato adicionado. Adicione pelo menos um telefone.",
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }

                                contatos.forEachIndexed { index, contato ->
                                    Surface(
                                        modifier = Modifier.fillMaxWidth(),
                                        tonalElevation = 1.dp,
                                        shape = MaterialTheme.shapes.medium,
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(10.dp),
                                            verticalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            Text("${contato.tipo.uppercase()}${if (contato.principal) " - Principal" else ""}")
                                            Text(
                                                if (contato.tipo == "email") contato.valor else formatPhone(contato.valor),
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                TextButton(onClick = { toggleContatoPrincipal(index) }) {
                                                    Row(
                                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                    ) {
                                                        Icon(
                                                            imageVector = Icons.Rounded.CheckCircle,
                                                            contentDescription = null,
                                                        )
                                                        Text(if (contato.principal) "Principal" else "Tornar principal")
                                                    }
                                                }
                                                IconButton(onClick = { removeContato(index) }) {
                                                    Icon(
                                                        imageVector = Icons.Rounded.Delete,
                                                        contentDescription = "Remover",
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }

                                SelectionField(
                                    label = "Tipo",
                                    value = when (novoContatoTipo) {
                                        "celular" -> "Celular"
                                        "whatsapp" -> "WhatsApp"
                                        "fixo" -> "Fixo"
                                        "email" -> "Email"
                                        else -> "Celular"
                                    },
                                    options = listOf(
                                        "celular" to "Celular",
                                        "whatsapp" to "WhatsApp",
                                        "fixo" to "Fixo",
                                        "email" to "Email",
                                    ),
                                    onSelected = {
                                        novoContatoTipo = it
                                        novoContatoValorField = normalizeContatoEditingValue(it, novoContatoValorField)
                                    },
                                )

                                OutlinedTextField(
                                    value = novoContatoValorField,
                                    onValueChange = { value ->
                                        novoContatoValorField = normalizeContatoEditingValue(novoContatoTipo, value)
                                    },
                                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                    label = { Text("Contato") },
                                    keyboardOptions = KeyboardOptions(
                                        keyboardType = if (novoContatoTipo == "email") KeyboardType.Email else KeyboardType.Number,
                                    ),
                                    visualTransformation = if (novoContatoTipo == "email") {
                                        VisualTransformation.None
                                    } else {
                                        ContatoPhoneVisualTransformation()
                                    },
                                    singleLine = true,
                                    colors = enderecoFieldColors,
                                )

                                Button(onClick = ::addContato, modifier = Modifier.fillMaxWidth()) {
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.Add,
                                            contentDescription = null,
                                        )
                                        Text("Adicionar contato")
                                    }
                                }
                            }
                        }

                        WebCard {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("Dependentes", fontWeight = FontWeight.SemiBold)

                                if (planoOptions.isEmpty()) {
                                    Text(
                                        "Nenhum plano disponivel para a empresa selecionada.",
                                        color = MaterialTheme.colorScheme.error,
                                    )
                                }

                                dependentes.forEachIndexed { index, dep ->
                                    val isTitular = index == 0

                                    Surface(
                                        modifier = Modifier.fillMaxWidth(),
                                        tonalElevation = 1.dp,
                                        shape = MaterialTheme.shapes.medium,
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(10.dp),
                                            verticalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                Text(
                                                    if (isTitular) "Titular" else "Dependente ${index + 1}",
                                                    fontWeight = FontWeight.SemiBold,
                                                )
                                                if (!isTitular) {
                                                    IconButton(onClick = { removeDependente(index) }) {
                                                        Icon(
                                                            imageVector = Icons.Rounded.Delete,
                                                            contentDescription = "Remover",
                                                        )
                                                    }
                                                }
                                            }

                                            if (!isTitular) {
                                                SelectionField(
                                                    label = "Parentesco",
                                                    value = parentescoOptions.firstOrNull { it.first == dep.tipo }?.second ?: "Selecione",
                                                    options = parentescoOptions,
                                                    onSelected = { tipo ->
                                                        dependentes[index] = dependentes[index].copy(tipo = tipo)
                                                    },
                                                )
                                            } else {
                                                Text("Parentesco: Titular", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }

                                            OutlinedTextField(
                                                value = dep.nome,
                                                onValueChange = { value ->
                                                    dependentes[index] = dependentes[index].copy(nome = value)
                                                },
                                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                                label = { Text("Nome") },
                                                enabled = !isTitular,
                                                colors = enderecoFieldColors,
                                            )

                                            OutlinedTextField(
                                                value = dep.cpf,
                                                onValueChange = { value ->
                                                    val digits = value.text.filter(Char::isDigit).take(11)
                                                    dependentes[index] = dependentes[index].copy(
                                                        cpf = TextFieldValue(digits, TextRange(digits.length)),
                                                    )
                                                    when {
                                                        digits.isBlank() || digits.length < 11 -> {
                                                            cpfValidationErrors.remove(index)
                                                            consultedCpfByIndex.remove(index)
                                                        }

                                                        !validateCpf(digits) -> {
                                                            cpfValidationErrors[index] = "CPF invalido."
                                                            consultedCpfByIndex.remove(index)
                                                        }

                                                        else -> {
                                                            cpfValidationErrors.remove(index)
                                                            if (state.cadastroWorkspace.config?.lemmitDependente == true &&
                                                                consultedCpfByIndex[index] != digits
                                                            ) {
                                                                consultedCpfByIndex[index] = digits
                                                                scope.launch {
                                                                    consultarLemmitDependente(index, digits)
                                                                }
                                                            }
                                                        }
                                                    }
                                                },
                                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                                label = { Text("CPF") },
                                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                                visualTransformation = CadastroDependenteCpfVisualTransformation(),
                                                singleLine = true,
                                                enabled = !isTitular,
                                                colors = enderecoFieldColors,
                                            )
                                            cpfValidationErrors[index]?.let { cpfError ->
                                                Text(
                                                    text = cpfError,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.error,
                                                )
                                            }
                                            if (consultingLemmitIndex == index) {
                                                Text(
                                                    text = "Consultando Lemmit...",
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                            }

                                            OutlinedTextField(
                                                value = dep.dataNascimento,
                                                onValueChange = { value ->
                                                    val digits = value.text.filter(Char::isDigit).take(8)
                                                    dependentes[index] = dependentes[index].copy(
                                                        dataNascimento = TextFieldValue(digits, TextRange(digits.length)),
                                                    )
                                                },
                                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                                label = { Text("Data de Nascimento") },
                                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                                visualTransformation = DateVisualTransformation(),
                                                singleLine = true,
                                                enabled = !isTitular,
                                                colors = enderecoFieldColors,
                                            )

                                            SelectionField(
                                                label = "Sexo",
                                                value = when (dep.sexo) {
                                                    1 -> "Masculino"
                                                    0 -> "Feminino"
                                                    else -> "Selecione"
                                                },
                                                options = listOf(-1 to "Selecione", 1 to "Masculino", 0 to "Feminino"),
                                                onSelected = { selected ->
                                                    dependentes[index] = dependentes[index].copy(sexo = selected)
                                                },
                                                enabled = !isTitular,
                                            )

                                            SelectionField(
                                                label = "Plano",
                                                value = planoOptions.firstOrNull { it.codigo == dep.plano }?.label ?: "Selecione",
                                                options = listOf(0 to "Selecione") + planoOptions.map { it.codigo to it.label },
                                                enabled = planoOptions.isNotEmpty(),
                                                highlighted = true,
                                                onSelected = { selected ->
                                                    val selectedOption = planoOptions.firstOrNull { it.codigo == selected }
                                                    val planoValor = selectedOption
                                                        ?.valorFor(isTitular = isTitular)
                                                        ?.let(::formatPlanoValor)
                                                        ?: "0,00"
                                                    dependentes[index] = dependentes[index].copy(
                                                        plano = selected,
                                                        planoValor = planoValor,
                                                    )
                                                    persistDraftSnapshotSilently()
                                                },
                                            )

                                            OutlinedTextField(
                                                value = dep.nomeMae,
                                                onValueChange = { value ->
                                                    dependentes[index] = dependentes[index].copy(nomeMae = value)
                                                },
                                                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                                                label = { Text("Nome da Mae") },
                                                enabled = !isTitular,
                                                colors = enderecoFieldColors,
                                            )
                                        }
                                    }
                                }

                                Button(onClick = ::addDependente, modifier = Modifier.fillMaxWidth()) {
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.Add,
                                            contentDescription = null,
                                        )
                                        Text("Incluir dependente")
                                    }
                                }
                            }
                        }
                    } else {
                        val titularDependente = dependentes.firstOrNull()
                        val planoTitularResumo = when {
                            titularDependente == null -> "Nao informado"
                            titularDependente.plano <= 0 -> "Nao informado"
                            else -> planoOptions
                                .firstOrNull { it.codigo == titularDependente.plano }
                                ?.label
                                ?: "Plano ${titularDependente.plano}"
                        }

                        WebCard {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("Resumo", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                Text("Titular: ${nome.ifBlank { "Nao informado" }}")
                                Text("Empresa: ${cadastro.empresaNome ?: "Nao informada"}")
                                Text("Plano do titular: $planoTitularResumo")
                                Text("Dependentes: ${dependentes.size}")
                                Text("Contatos: ${contatos.size}")
                                Text("Arquivo obrigatorio: ${if (state.cadastroWorkspace.config?.exigirArquivo == true) "Sim" else "Nao"}")
                            }
                        }

                        WebCard {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("Documento", fontWeight = FontWeight.SemiBold)
                                Text(
                                    text = "PDF, JPG ou PNG · maximo 5 MB",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                if (arquivoNome.isNotBlank()) {
                                    TextButton(
                                        onClick = { scope.launch { openArquivoPreview() } },
                                        enabled = arquivoPath.isNotBlank() && !previewingArquivo,
                                    ) {
                                        Row(
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Icon(
                                                imageVector = Icons.Rounded.Description,
                                                contentDescription = null,
                                            )
                                            Text(
                                                text = if (previewingArquivo) "Abrindo arquivo..." else "Arquivo atual: $arquivoNome",
                                            )
                                        }
                                    }
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Button(
                                        onClick = {
                                            showArquivoSourceModal = true
                                        },
                                        enabled = !uploading,
                                    ) {
                                        if (uploading) {
                                            CircularProgressIndicator(strokeWidth = 2.dp)
                                        } else {
                                            Row(
                                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Rounded.Description,
                                                    contentDescription = null,
                                                )
                                                Text(if (arquivoNome.isBlank()) "Selecionar Arquivo" else "Trocar Arquivo")
                                            }
                                        }
                                    }
                                    if (arquivoPath.isNotBlank()) {
                                        IconButton(
                                            onClick = {
                                                scope.launch {
                                                    runCatching { viewModel.deleteTempFile(arquivoPath) }
                                                    arquivoPath = ""
                                                    arquivoNome = ""
                                                    arquivoMimeType = "application/octet-stream"
                                                    arquivoTamanho = 0L
                                                    viewModel.persistCadastroDraftSilently(
                                                        cadastro.id,
                                                        buildJsonObject {
                                                            put("arquivo_path", "")
                                                            put("arquivo_nome", "")
                                                            put("arquivo_mime_type", "application/octet-stream")
                                                            put("arquivo_tamanho", 0L)
                                                        },
                                                    )
                                                }
                                            },
                                        ) {
                                            Icon(
                                                imageVector = Icons.Rounded.Delete,
                                                contentDescription = "Remover",
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    localMessage?.let { message ->
                        val tone = resolveCadastroMessageTone(message)
                        val (container, textColor) = messageToneColors(tone)
                        WebCard {
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                color = container,
                                shape = MaterialTheme.shapes.medium,
                            ) {
                                Text(
                                    text = message,
                                    color = textColor,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                )
                            }
                        }
                    }
                }

                Box(
                    modifier = keyboardAwareFooter.containerModifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = keyboardAwareFooter.footerModifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                    if (
                        state.profile?.role in setOf("ADMINISTRADOR", "ADMIN", "VENDEDOR") &&
                        currentStep == 1 &&
                        isPendingCadastroStatus(cadastro.status)
                    ) {
                        IconButton(
                            onClick = {
                                viewModel.resolveCadastroOverlay(
                                    CadastroModalSignal(
                                        excluirCadastroId = cadastro.id,
                                        excluirCadastroTitular = cadastro.nome.orEmpty().ifBlank { cadastro.cpf.orEmpty() },
                                    ),
                                )
                            },
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Delete,
                                contentDescription = "Excluir",
                            )
                        }
                    }

                    Spacer(modifier = Modifier.weight(1f))

                    IconButton(
                        onClick = { requestCloseEditor() },
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = "Cancelar",
                        )
                    }

                    if (currentStep == 1) {
                            Button(
                                onClick = {
                                    scope.launch {
                                        if (uploading) {
                                            localMessage = "Aguarde o upload do arquivo finalizar antes de salvar."
                                            return@launch
                                        }
                                        val validation = validateStepOne()
                                        if (validation != null) {
                                            localMessage = validation
                                            return@launch
                                        }
                                        val payload = buildPayload(requireStatus = false) ?: return@launch
                                        saving = true
                                        runCatching { viewModel.updateCadastroRecord(cadastro.id, payload) }
                                            .onSuccess { localMessage = "Cadastro salvo com sucesso." }
                                            .onFailure { throwable ->
                                                localMessage = CadastroApiErrorMapper.mapUserMessage(
                                                    throwable.message,
                                                    "Falha ao salvar cadastro.",
                                                )
                                            }
                                        saving = false
                                    }
                                },
                                enabled = !saving && !uploading && !state.sendingCadastro,
                            ) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.CheckCircle,
                                        contentDescription = null,
                                    )
                                    Text("Salvar", maxLines = 1, softWrap = false)
                                }
                            }

                        IconButton(
                            onClick = {
                                scope.launch {
                                    val validation = validateStepOne()
                                    if (validation != null) {
                                        localMessage = validation
                                        return@launch
                                    }
                                    val payload = buildPayload(requireStatus = false) ?: return@launch
                                    localMessage = null
                                    currentStep = 2
                                    viewModel.persistCadastroDraftSilently(cadastro.id, payload)
                                }
                            },
                            enabled = !saving && !uploading && !state.sendingCadastro,
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Rounded.ArrowForward,
                                contentDescription = "Seguinte",
                            )
                        }
                    } else {
                        IconButton(
                            onClick = { currentStep = 1 },
                            enabled = !saving && !uploading && !state.sendingCadastro,
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                                contentDescription = "Voltar",
                            )
                        }

                        Button(
                            onClick = {
                                scope.launch {
                                    submitCadastro()
                                }
                            },
                            enabled = !saving && !uploading && !state.sendingCadastro,
                        ) {
                            if (state.sendingCadastro) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                )
                            } else {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.CheckCircle,
                                        contentDescription = null,
                                    )
                                    Text("Cadastrar")
                                }
                            }
                        }
                    }
                }
                }
        }
    }
    }

    if (showArquivoSourceModal) {
        AlertDialog(
            onDismissRequest = {
                showArquivoSourceModal = false
                suppressBackgroundPersist = false
            },
            title = { Text("Anexar arquivo") },
            text = { Text("Escolha a origem do arquivo.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showArquivoSourceModal = false
                        suppressBackgroundPersist = true
                        filePicker.launch("*/*")
                    },
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Description,
                            contentDescription = null,
                        )
                        Text("Documentos")
                    }
                }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    TextButton(
                        onClick = {
                            showArquivoSourceModal = false
                            runCatching {
                                val (uri, path) = createCameraCaptureUri(context)
                                cameraCapturePath = path
                                suppressBackgroundPersist = true
                                cameraLauncher.launch(uri)
                            }.onFailure { throwable ->
                                suppressBackgroundPersist = false
                                localMessage = CadastroApiErrorMapper.mapUserMessage(
                                    throwable.message,
                                    "Nao foi possivel iniciar a camera.",
                                )
                            }
                        },
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Add,
                                contentDescription = null,
                            )
                            Text("Camera")
                        }
                    }
                    TextButton(
                        onClick = {
                            showArquivoSourceModal = false
                            suppressBackgroundPersist = false
                        },
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = null,
                            )
                            Text("Cancelar")
                        }
                    }
                }
            },
        )
    }

    if (showSelectStatusOnClose) {
        AlertDialog(
            onDismissRequest = { showSelectStatusOnClose = false },
            title = { Text("Selecionar status") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Antes de fechar, selecione o status da adesao.")
                    SelectionField(
                        label = "Status da Adesao",
                        value = state.statusAdesoes.firstOrNull { it.id == statusAdesaoId }?.nome ?: "Selecione",
                        options = listOf("" to "Selecione") + state.statusAdesoes.map { it.id to it.nome },
                        onSelected = { statusAdesaoId = it },
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            val payload = buildPayload(requireStatus = true) ?: return@launch
                            saving = true
                            runCatching { viewModel.updateCadastroRecord(cadastro.id, payload) }
                                .onSuccess {
                                    showSelectStatusOnClose = false
                                    onDismiss()
                                }
                                .onFailure { throwable ->
                                    localMessage = CadastroApiErrorMapper.mapUserMessage(
                                        throwable.message,
                                        "Falha ao salvar status antes de fechar.",
                                    )
                                }
                            saving = false
                        }
                    },
                    enabled = !saving,
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.CheckCircle,
                            contentDescription = null,
                        )
                        Text("Salvar e fechar", maxLines = 1, softWrap = false)
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { showSelectStatusOnClose = false }, enabled = !saving) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = null,
                        )
                        Text("Continuar editando")
                    }
                }
            },
        )
    }

}

private fun textFieldValueSaver(): Saver<TextFieldValue, Any> {
    return Saver(
        save = { listOf(it.text, it.selection.start, it.selection.end) },
        restore = {
            @Suppress("UNCHECKED_CAST")
            val values = it as List<Any>
            val text = values[0] as String
            val start = values[1] as Int
            val end = values[2] as Int
            TextFieldValue(text, TextRange(start, end))
        },
    )
}

private fun extractDateDigits(value: String): String {
    val normalized = value.trim()
    return when {
        Regex("""\d{4}-\d{2}-\d{2}""").matches(normalized) -> {
            val parts = normalized.split("-")
            "${parts[2]}${parts[1]}${parts[0]}"
        }

        Regex("""\d{2}/\d{2}/\d{4}""").matches(normalized) -> normalized.filter(Char::isDigit)
        else -> normalized.filter(Char::isDigit).take(8)
    }
}

private fun toIsoDateOrNull(value: String): String? {
    val digits = value.filter(Char::isDigit)
    if (digits.isEmpty()) return null
    if (digits.length != 8) return null
    val day = digits.substring(0, 2).toIntOrNull() ?: return null
    val month = digits.substring(2, 4).toIntOrNull() ?: return null
    val year = digits.substring(4, 8).toIntOrNull() ?: return null
    if (day !in 1..31 || month !in 1..12 || year !in 1900..2100) return null
    return "%04d-%02d-%02d".format(year, month, day)
}

private fun shouldRetryLemmitRequest(message: String?): Boolean {
    val normalized = message
        ?.lowercase(Locale.ROOT)
        ?.trim()
        .orEmpty()
    if (normalized.isBlank()) return true
    if (normalized.contains("cpf invalido")) return false
    if (normalized.contains("nao encontrado")) return false
    if (normalized.contains("não encontrado")) return false
    if (normalized.contains("forbidden") || normalized.contains("unauthorized")) return false

    return listOf(
        "timeout",
        "timed out",
        "tempo limite",
        "indisponivel",
        "indisponível",
        "temporar",
        "service unavailable",
        "bad gateway",
        "gateway timeout",
        "failed to connect",
        "connection reset",
        "network",
        "socket",
        "i/o",
        "status: 5",
        "status 5",
        "429",
    ).any { normalized.contains(it) }
}

private fun resolveLemmitDateDigits(rawValue: String?): String? {
    val iso = rawValue
        ?.trim()
        ?.substringBefore('T')
        ?.takeIf { Regex("""\d{4}-\d{2}-\d{2}""").matches(it) }
        ?: return null
    val parts = iso.split("-")
    if (parts.size != 3) return null
    return "${parts[2]}${parts[1]}${parts[0]}"
}

private fun resolveLemmitSexoCodigo(rawValue: String?): Int? {
    val normalized = rawValue
        ?.trim()
        ?.lowercase(Locale.ROOT)
        ?.normalizeForComparison()
        ?: return null
    return when {
        normalized.contains("masculino") || normalized == "m" || normalized == "1" -> 1
        normalized.contains("feminino") || normalized == "f" || normalized == "0" || normalized == "2" -> 0
        else -> null
    }
}

private fun String.normalizeForComparison(): String {
    return java.text.Normalizer
        .normalize(this, java.text.Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "")
}

private fun isUnder18(isoDate: String): Boolean {
    return runCatching {
        val birth = LocalDate.parse(isoDate)
        Period.between(birth, LocalDate.now()).years < 18
    }.getOrDefault(false)
}

private fun validateCpf(cpf: String): Boolean {
    if (cpf.length != 11) return false
    if (cpf.all { it == cpf[0] }) return false

    var sum = 0
    for (i in 0..8) sum += cpf[i].digitToInt() * (10 - i)
    var remainder = 11 - (sum % 11)
    if (remainder >= 10) remainder = 0
    if (remainder != cpf[9].digitToInt()) return false

    sum = 0
    for (i in 0..9) sum += cpf[i].digitToInt() * (11 - i)
    remainder = 11 - (sum % 11)
    if (remainder >= 10) remainder = 0
    return remainder == cpf[10].digitToInt()
}

private fun decodeEmbeddedJsonElement(value: JsonElement?): JsonElement? {
    val current = value ?: return null
    if (current is JsonNull) return null
    if (current !is kotlinx.serialization.json.JsonPrimitive) return current
    val raw = current.contentOrNull?.trim().orEmpty()
    if (raw.isBlank()) return null
    if (!raw.startsWith("{") && !raw.startsWith("[")) return current
    return runCatching { cadastroEditorJsonParser.parseToJsonElement(raw) }.getOrNull() ?: current
}

private fun JsonElement?.asJsonObjectFlexible(): JsonObject? {
    val normalized = decodeEmbeddedJsonElement(this)
    return when (normalized) {
        is JsonObject -> normalized
        else -> runCatching { normalized?.jsonObject }.getOrNull()
    }
}

private fun JsonElement?.asJsonArrayFlexible(): JsonArray? {
    val normalized = decodeEmbeddedJsonElement(this)
    return when (normalized) {
        is JsonArray -> normalized
        else -> runCatching { normalized?.jsonArray }.getOrNull()
    }
}

private fun JsonObject.jsonObjectFlexible(vararg keys: String): JsonObject? {
    keys.forEach { key ->
        this[key].asJsonObjectFlexible()?.let { return it }
    }
    return null
}

private fun JsonObject.jsonArrayFlexible(vararg keys: String): JsonArray? {
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

private fun resolveEnderecoObject(value: JsonElement?): JsonObject? {
    val root = value.asJsonObjectFlexible() ?: return null
    val data = root.jsonObjectFlexible("data", "Data")
    val dados = root.jsonObjectFlexible("dados", "Dados")
    val responsavel = root.jsonObjectFlexible("responsavelFinanceiro", "responsavel_financeiro", "ResponsavelFinanceiro")
    val nestedResponsavel = data?.jsonObjectFlexible("responsavelFinanceiro", "responsavel_financeiro", "ResponsavelFinanceiro")
    val candidates = listOfNotNull(
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
    )
    return candidates.firstOrNull { it.hasEnderecoHints() } ?: candidates.firstOrNull()
}

private fun parseContatos(cadastro: CadastroDetalhe): List<ContatoFormState> {
    val contatosElement = decodeEmbeddedJsonElement(cadastro.contatos) ?: return emptyList()
    val contatosArray = when (contatosElement) {
        is JsonArray -> contatosElement
        is JsonObject -> {
            contatosElement.jsonArrayFlexible("contatos", "telefones", "items")
                ?: contatosElement.jsonObjectFlexible("data", "dados")
                    ?.jsonArrayFlexible("contatos", "telefones", "items")
        }

        else -> contatosElement.asJsonArrayFlexible()
    } ?: return emptyList()

    return contatosArray.mapNotNull { item ->
        val obj = item.asJsonObjectFlexible() ?: return@mapNotNull null
        val tipoRaw = obj.jsonString("tipo", "tipoContato", "tipo_contato", "kind")
            ?.lowercase(Locale.ROOT)
            ?.trim()
            .orEmpty()
        val valorRaw = obj.jsonString("valor", "telefone", "numero", "contato", "email", "value")
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

        ContatoFormState(tipo = tipo, valor = valor, principal = principal)
    }
}

private fun parseDependentes(
    cadastro: CadastroDetalhe,
    planoOptions: List<CadastroPlanoOption>,
): List<CadastroDependenteFormState> {
    val dependentesRaw = decodeEmbeddedJsonElement(cadastro.dependentes) ?: return emptyList()
    val dependentesArray = when (dependentesRaw) {
        is JsonArray -> dependentesRaw
        is JsonObject -> {
            dependentesRaw.jsonArrayFlexible("dependentes", "items")
                ?: dependentesRaw.jsonObjectFlexible("dados", "data")
                    ?.jsonArrayFlexible("dependentes", "items")
        }
        else -> dependentesRaw.asJsonArrayFlexible()
    } ?: return emptyList()
    return dependentesArray.mapIndexedNotNull { index, element ->
        val obj = element.asJsonObjectFlexible() ?: return@mapIndexedNotNull null
        val nome = obj["nome"]?.jsonPrimitive?.contentOrNull
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: if (index == 0) cadastro.nome.orEmpty() else ""
        if (nome.isBlank()) return@mapIndexedNotNull null

        val tipo = obj["tipo"]?.jsonPrimitive?.intOrNull
            ?: obj["parentesco"]?.jsonPrimitive?.intOrNull
            ?: if (index == 0) 1 else 0
        val cpf = obj["cpf"]?.jsonPrimitive?.contentOrNull?.filter(Char::isDigit).orEmpty().take(11)
        val dataRaw = obj["dataNascimento"]?.jsonPrimitive?.contentOrNull
            ?: obj["data_nascimento"]?.jsonPrimitive?.contentOrNull
            ?: ""
        val dateDigits = extractDateDigits(dataRaw)

        val sexo = obj["sexo"]?.jsonPrimitive?.intOrNull
            ?: when (obj["sexo"]?.jsonPrimitive?.contentOrNull?.lowercase()) {
                "masculino" -> 1
                "feminino" -> 0
                else -> -1
            }

        val plano = obj.jsonInt(
            "plano",
            "plano_codigo",
            "planoCodigo",
            "codigoPlano",
            "codigo_plano",
            "Plano",
        ) ?: 0

        val planoValor = obj["planoValor"]?.jsonPrimitive?.contentOrNull
            ?: obj["plano_valor"]?.jsonPrimitive?.contentOrNull
            ?: "0,00"
        val planoNome = obj["planoNome"]?.jsonPrimitive?.contentOrNull
            ?: obj["plano_nome"]?.jsonPrimitive?.contentOrNull
            ?: ""
        val tipoPlano = obj["tipoPlano"]?.jsonPrimitive?.contentOrNull
            ?: obj["tipo_plano"]?.jsonPrimitive?.contentOrNull
            ?: ""
        val resolvedPlano = resolvePlanoFromMetadados(
            planoCodigo = plano,
            planoNome = planoNome,
            tipoPlano = tipoPlano,
            planoValor = planoValor,
            planoOptions = planoOptions,
            dependenteIndex = index,
        )

        val nomeMae = obj["nomeMae"]?.jsonPrimitive?.contentOrNull
            ?: obj["nome_mae"]?.jsonPrimitive?.contentOrNull
            ?: ""

        CadastroDependenteFormState(
            tipo = tipo,
            nome = nome,
            dataNascimento = TextFieldValue(dateDigits, TextRange(dateDigits.length)),
            cpf = TextFieldValue(cpf, TextRange(cpf.length)),
            sexo = sexo,
            plano = resolvedPlano.plano,
            planoValor = resolvedPlano.planoValor,
            planoNome = resolvedPlano.planoNome,
            tipoPlano = resolvedPlano.tipoPlano,
            nomeMae = nomeMae,
            carenciaAtendimento = obj["carenciaAtendimento"]?.jsonPrimitive?.intOrNull
                ?: obj["carencia_atendimento"]?.jsonPrimitive?.intOrNull
                ?: 0,
        )
    }
}

private fun buildTitularDependente(cadastro: CadastroDetalhe): CadastroDependenteFormState {
    val cpf = cadastro.cpf.filter(Char::isDigit).take(11)
    val dateDigits = extractDateDigits(cadastro.dataNascimento.orEmpty())
    return CadastroDependenteFormState(
        tipo = 1,
        nome = cadastro.nome.orEmpty(),
        dataNascimento = TextFieldValue(dateDigits, TextRange(dateDigits.length)),
        cpf = TextFieldValue(cpf, TextRange(cpf.length)),
        sexo = cadastro.sexoCodigo ?: -1,
        plano = cadastro.planoCodigo ?: 0,
        planoValor = "0,00",
        planoNome = "",
        tipoPlano = "",
        nomeMae = cadastro.nomeMae.orEmpty(),
        carenciaAtendimento = 0,
    )
}

private fun extractPlanosFromCadastro(
    cadastro: CadastroDetalhe,
    hiddenPlanos: List<String>,
    planosMap: List<br.com.vendamais.mobile.data.models.PlanoMap>,
): List<CadastroPlanoOption> {
    val source = when (val raw = cadastro.planosRaw ?: cadastro.empresaRaw) {
        is JsonObject -> raw["precoPlano"]?.jsonArray
        is JsonArray -> raw
        else -> null
    }
    val hiddenSet = hiddenPlanos.toSet()

    if (source == null) {
        return planosMap
            .filter { it.ativo && !hiddenSet.contains(it.planoId.toString()) }
            .map {
                CadastroPlanoOption(
                    codigo = it.planoId,
                    nome = it.nomeExibicao,
                    regraValor = it.regraValor,
                    label = it.nomeExibicao,
                )
            }
    }

    return source.mapNotNull { item ->
        val obj = item.jsonObject
        val codigo = extractPlanoCodigo(obj) ?: return@mapNotNull null
        if (hiddenSet.contains(codigo.toString())) return@mapNotNull null

        val nome = planosMap.firstOrNull { it.planoId == codigo }?.nomeExibicao
            ?: obj.jsonString("NomeANS", "nomeANS", "nome", "nomeExibicao")
            ?: "Plano $codigo"
        val valorTitular = obj.jsonMoney("ValorTitular", "valorTitular", "valor_titular")
        val valorDependente = obj.jsonMoney("ValorDependente", "valorDependente", "valor_dependente")

        CadastroPlanoOption(
            codigo = codigo,
            nome = nome,
            valorTitular = valorTitular,
            valorDependente = valorDependente,
            regraValor = planosMap.firstOrNull { it.planoId == codigo }?.regraValor.orEmpty(),
            label = buildPlanoLabel(
                nome = nome,
                valorTitular = valorTitular,
                valorDependente = valorDependente,
            ),
        )
    }
}

private fun parseCadastroEndereco(value: JsonElement?): CadastroEnderecoFormState {
    val obj = resolveEnderecoObject(value) ?: return CadastroEnderecoFormState()
    val municipioObj = obj.jsonObjectFlexible("municipio", "Municipio", "cidadeObj", "Cidade")
    val bairroObj = obj.jsonObjectFlexible("bairro", "Bairro")
    val tipoLogradouroObj = obj.jsonObjectFlexible("tipoLogradouro", "TipoLogradouro")
    val ufObj = obj.jsonObjectFlexible("uf", "Uf", "estado", "Estado")
    val cep = obj.jsonString("cep", "CEP", "codigoPostal", "postalCode")
        ?: obj.jsonString("enderecoCep", "cepResponsavel")
    val tipoLogradouro = obj.jsonString("tipoLogradouro", "tipo_logradouro", "TipoLogradouro")
        ?: tipoLogradouroObj?.jsonString("nome", "descricao", "tipo")
    val logradouro = obj.jsonString("logradouro", "Logradouro", "endereco", "Endereco")
    val bairro = obj.jsonString("bairro", "Bairro")
        ?: bairroObj?.jsonString("nome", "descricao")
    val cidade = obj.jsonString("cidade", "Cidade", "municipio", "Municipio")
        ?: municipioObj?.jsonString("nome", "descricao", "municipio", "cidade")
    val uf = obj.jsonString("uf", "Uf", "descricaoUf", "ufSigla", "UfSigla", "estado", "Estado")
        ?: ufObj?.jsonString("sigla", "uf", "descricao", "nome")
        ?: municipioObj?.jsonString("uf", "Uf", "ufSigla", "UfSigla")
    val idTipoLogradouro = obj.jsonIntFlexible("idTipoLogradouro", "IdTipoLogradouro")
        ?: tipoLogradouroObj?.jsonIntFlexible("id", "Id", "codigo")
    val idBairro = obj.jsonIntFlexible("idBairro", "IdBairro")
        ?: bairroObj?.jsonIntFlexible("id", "Id", "codigo")
    val idMunicipio = obj.jsonIntFlexible("idMunicipio", "IdMunicipio")
        ?: municipioObj?.jsonIntFlexible("id", "Id", "codigo", "codigoMunicipio")
    val idUf = obj.jsonIntFlexible("idUf", "IdUf")
        ?: ufObj?.jsonIntFlexible("id", "Id", "codigo", "codigoUf")
    val ufSigla = obj.jsonString("ufSigla", "UfSigla", "descricaoUf")
        ?: ufObj?.jsonString("sigla", "uf")
    return CadastroEnderecoFormState(
        cep = cep?.filter(Char::isDigit).orEmpty().take(8),
        tipoLogradouro = tipoLogradouro.orEmpty(),
        logradouro = logradouro.orEmpty(),
        numero = obj.jsonString("numero", "Numero", "numeroLogradouro").orEmpty(),
        complemento = obj.jsonString("complemento", "Complemento").orEmpty(),
        bairro = bairro.orEmpty(),
        cidade = cidade.orEmpty(),
        uf = uf.orEmpty().uppercase(Locale.ROOT).take(2),
        idTipoLogradouro = idTipoLogradouro,
        idBairro = idBairro,
        idMunicipio = idMunicipio,
        idUf = idUf,
        ufSigla = ufSigla?.uppercase(Locale.ROOT),
    )
}

private fun CadastroPlanoOption.valorFor(isTitular: Boolean): Double? {
    return if (isTitular) valorTitular else valorDependente
}

private fun formatPlanoValor(value: Double): String {
    return "%.2f".format(Locale.US, value).replace('.', ',')
}

private fun extractPlanoCodigo(obj: JsonObject): Int? {
    return obj.jsonInt("Plano", "plano", "plano_id", "codigoPlano", "codigo_plano", "Id", "id")
}

private data class PlanoResolutionResult(
    val plano: Int,
    val planoNome: String,
    val tipoPlano: String,
    val planoValor: String,
)

private fun resolvePlanoFromMetadados(
    planoCodigo: Int,
    planoNome: String,
    tipoPlano: String,
    planoValor: String,
    planoOptions: List<CadastroPlanoOption>,
    dependenteIndex: Int,
): PlanoResolutionResult {
        val codigoMatch = planoOptions.firstOrNull { it.codigo == planoCodigo }
        if (codigoMatch != null) {
        Log.i(
            "CadastroEditorDialog",
            "Plano restaurado por codigo para dependente index=$dependenteIndex plano=${codigoMatch.codigo}",
        )
        return PlanoResolutionResult(
            plano = codigoMatch.codigo,
            planoNome = codigoMatch.nome,
            tipoPlano = codigoMatch.regraValor,
            planoValor = planoValor,
        )
    }

    val nomeNorm = normalizePlanoTexto(planoNome)
    val tipoNorm = normalizePlanoTexto(tipoPlano)
    val valorNorm = normalizePlanoValor(planoValor)
    if (nomeNorm.isBlank() && tipoNorm.isBlank() && valorNorm.isBlank()) {
        Log.w(
            "CadastroEditorDialog",
            "Plano salvo no rascunho nao encontrado em planoOptions index=$dependenteIndex sem metadados suficientes",
        )
        return PlanoResolutionResult(
            plano = planoCodigo,
            planoNome = planoNome,
            tipoPlano = tipoPlano,
            planoValor = planoValor,
        )
    }

    fun candidateMatches(option: CadastroPlanoOption): Triple<Boolean, Boolean, Boolean> {
        val optionNomeNorm = normalizePlanoTexto(option.nome)
        val optionTipoNorm = normalizePlanoTexto(option.regraValor)
        val optionValorNorm = normalizePlanoValor(
            option.valorTitular?.let(::formatPlanoValor) ?: option.valorDependente?.let(::formatPlanoValor).orEmpty(),
        )
        val nomeMatch = nomeNorm.isNotBlank() && optionNomeNorm == nomeNorm
        val tipoMatch = tipoNorm.isNotBlank() && optionTipoNorm == tipoNorm
        val valorMatch = valorNorm.isNotBlank() && optionValorNorm == valorNorm
        return Triple(nomeMatch, tipoMatch, valorMatch)
    }

        val exactMatches = planoOptions.filter { option ->
            val (nomeMatch, tipoMatch, valorMatch) = candidateMatches(option)
            nomeMatch && tipoMatch && valorMatch
        }
    val typeMatches = planoOptions.filter { option ->
        val (nomeMatch, tipoMatch, _) = candidateMatches(option)
        nomeMatch && tipoMatch
    }
    val nameMatches = planoOptions.filter { option ->
        val (nomeMatch, _, _) = candidateMatches(option)
        nomeMatch
    }

    val resolved = when {
        exactMatches.size == 1 -> exactMatches.single()
        typeMatches.size == 1 -> typeMatches.single()
        nameMatches.size == 1 -> nameMatches.single()
        else -> null
    }

    return when {
        resolved != null -> {
            Log.i(
                "CadastroEditorDialog",
                "Plano restaurado por fallback de nome/tipo/valor index=$dependenteIndex plano=${resolved.codigo}",
            )
            PlanoResolutionResult(
                plano = resolved.codigo,
                planoNome = resolved.nome,
                tipoPlano = resolved.regraValor,
                planoValor = planoValor,
            )
        }
        nameMatches.size > 1 || typeMatches.size > 1 || exactMatches.size > 1 -> {
            Log.w(
                "CadastroEditorDialog",
                "Fallback de plano ambiguo; selecao automatica ignorada index=$dependenteIndex matches=${exactMatches.size}/${typeMatches.size}/${nameMatches.size}",
            )
            PlanoResolutionResult(
                plano = planoCodigo,
                planoNome = planoNome,
                tipoPlano = tipoPlano,
                planoValor = planoValor,
            )
        }
        else -> {
            Log.w(
                "CadastroEditorDialog",
                "Plano salvo no rascunho nao encontrado em planoOptions index=$dependenteIndex nome=${planoNome.take(40)} tipo=${tipoPlano.take(24)}",
            )
            PlanoResolutionResult(
                plano = planoCodigo,
                planoNome = planoNome,
                tipoPlano = tipoPlano,
                planoValor = planoValor,
            )
        }
    }
}

private fun normalizePlanoTexto(value: String): String {
    return Normalizer.normalize(value.trim(), Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "")
        .lowercase(Locale.ROOT)
        .replace(Regex("\\s+"), " ")
}

private fun normalizePlanoValor(value: String): String {
    val trimmed = value.trim()
    if (trimmed.isBlank()) return ""
    val digits = trimmed.filter { it.isDigit() || it == ',' || it == '.' }
    if (digits.isBlank()) return ""
    val normalized = digits.replace(".", "").replace(",", ".")
    return normalized.toBigDecimalOrNull()?.toPlainString() ?: digits
}

private fun JsonObject.jsonInt(vararg keys: String): Int? {
    keys.forEach { key ->
        val value = this[key]?.jsonPrimitive?.intOrNull
        if (value != null) return value
    }
    return null
}

private fun JsonObject.jsonIntFlexible(vararg keys: String): Int? {
    keys.forEach { key ->
        val primitive = this[key]?.jsonPrimitive ?: return@forEach
        primitive.intOrNull?.let { return it }
        primitive.contentOrNull?.toIntOrNull()?.let { return it }
    }
    return null
}

private fun JsonObject.jsonString(vararg keys: String): String? {
    keys.forEach { key ->
        val value = this[key]?.jsonPrimitive?.contentOrNull?.trim()
        if (!value.isNullOrBlank()) return value
    }
    return null
}

private fun JsonObject.jsonMoney(vararg keys: String): Double? {
    keys.forEach { key ->
        val raw = this[key]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        if (raw.isBlank()) return@forEach

        val normalized = raw
            .replace("R$", "", ignoreCase = true)
            .replace(" ", "")
            .let {
                when {
                    it.contains(',') && it.contains('.') -> it.replace(".", "").replace(",", ".")
                    it.contains(',') -> it.replace(",", ".")
                    else -> it
                }
            }

        val asDouble = normalized.toDoubleOrNull()
        if (asDouble != null) return asDouble
    }
    return null
}

private fun buildPlanoLabel(
    nome: String,
    valorTitular: Double?,
    valorDependente: Double?,
): String {
    if (valorTitular == null && valorDependente == null) return nome

    val titular = valorTitular?.let(::formatCurrencyBr) ?: "-"
    val dependente = valorDependente?.let(::formatCurrencyBr) ?: "-"
    return "$nome | Titular: $titular | Dependente: $dependente"
}

private fun formatCurrencyBr(value: Double): String {
    return runCatching {
        NumberFormat.getCurrencyInstance(Locale("pt", "BR")).format(value)
    }.getOrDefault(value.toString())
}

private fun requiresVendedorSelection(profile: MobileProfile?): Boolean {
    return profile?.role in setOf(
        "ADMINISTRADOR",
        "ADMIN",
        "GERENTE",
        "GESTOR",
        "SUPERVISOR",
        "CADASTRO",
        "ADESIONISTA",
        "VENDEDOR",
    )
}

private fun resolveVendedor(
    profile: MobileProfile?,
    state: AppUiState,
    selectedVendedorId: String,
): TeamMemberOption? {
    return if (profile?.role == "VENDEDOR") {
        TeamMemberOption(
            id = profile.id,
            name = profile.name,
            email = profile.email,
            externalId = profile.externalId,
        )
    } else {
        state.vendedores.firstOrNull { it.id == selectedVendedorId }
    }
}

private fun resolveAdesionista(
    profile: MobileProfile?,
    state: AppUiState,
    selectedAdesionistaId: String,
): TeamMemberOption? {
    return if (profile?.role == "ADESIONISTA") {
        TeamMemberOption(
            id = profile.id,
            name = profile.name,
            email = profile.email,
            externalId = profile.externalId,
        )
    } else {
        state.adesionistas.firstOrNull { it.id == selectedAdesionistaId.takeIf { it.isNotBlank() } }
    }
}

private fun TeamMemberOption.toTeamSelectionLabel(): String {
    val codigo = externalId?.takeIf { it.isNotBlank() } ?: "-"
    return "$name - Codigo $codigo"
}

private fun MobileProfile.toTeamSelectionLabel(): String {
    val codigo = externalId?.takeIf { it.isNotBlank() } ?: "-"
    return "$name - Codigo $codigo"
}

private fun resolveCadastroMessageTone(message: String): CadastroMessageTone {
    val normalized = message.lowercase(Locale.ROOT)
    return when {
        normalized.contains("sucesso") -> CadastroMessageTone.SUCCESS
        normalized.contains("falha") || normalized.contains("erro") || normalized.contains("invalid input syntax") -> CadastroMessageTone.ERROR
        normalized.contains("obrigatorio") || normalized.contains("invalido") || normalized.contains("selecione") -> CadastroMessageTone.ALERT
        else -> CadastroMessageTone.WARNING
    }
}

@Composable
private fun messageToneColors(tone: CadastroMessageTone): Pair<androidx.compose.ui.graphics.Color, androidx.compose.ui.graphics.Color> {
    val darkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f
    return when (tone) {
        CadastroMessageTone.SUCCESS ->
            if (darkTheme) MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
            else EmeraldSoft to EmeraldDark
        CadastroMessageTone.WARNING ->
            if (darkTheme) androidx.compose.ui.graphics.Color(0xFF4A3A1E) to androidx.compose.ui.graphics.Color(0xFFFFDE9E)
            else Amber100 to Amber500
        CadastroMessageTone.ALERT ->
            if (darkTheme) androidx.compose.ui.graphics.Color(0xFF4B2F1F) to androidx.compose.ui.graphics.Color(0xFFFFC39A)
            else BrandOrange.copy(alpha = 0.18f) to BrandOrange
        CadastroMessageTone.ERROR ->
            if (darkTheme) MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
            else Red100 to Red500
    }
}

private class ContatoPhoneVisualTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val digits = text.text.filter(Char::isDigit).take(11)
        val originalToTransformed = IntArray(digits.length + 1)
        val isMobile = digits.length > 10
        val formatted = buildString {
            originalToTransformed[0] = 0
            digits.forEachIndexed { index, char ->
                if (index == 0) append('(')
                append(char)
                if (index == 1 && digits.length > 2) append(") ")
                if (!isMobile && index == 5 && digits.length > 6) append('-')
                if (isMobile && index == 6 && digits.length > 7) append('-')
                originalToTransformed[index + 1] = length
            }
        }
        val transformedToOriginal = IntArray(formatted.length + 1) { offset ->
            formatted.take(offset).count(Char::isDigit).coerceAtMost(digits.length)
        }
        val offsetMapping = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int {
                return originalToTransformed[offset.coerceIn(0, digits.length)]
            }

            override fun transformedToOriginal(offset: Int): Int {
                return transformedToOriginal[offset.coerceIn(0, formatted.length)]
            }
        }
        return TransformedText(AnnotatedString(formatted), offsetMapping)
    }
}

private class DateVisualTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val digits = text.text.filter(Char::isDigit).take(8)
        val originalToTransformed = IntArray(digits.length + 1)
        val formatted = buildString {
            originalToTransformed[0] = 0
            digits.forEachIndexed { index, char ->
                append(char)
                if (index == 1 && digits.length > 2) append('/')
                if (index == 3 && digits.length > 4) append('/')
                originalToTransformed[index + 1] = length
            }
        }
        val transformedToOriginal = IntArray(formatted.length + 1) { offset ->
            formatted.take(offset).count(Char::isDigit).coerceAtMost(digits.length)
        }

        val offsetMapping = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int {
                return originalToTransformed[offset.coerceIn(0, digits.length)]
            }

            override fun transformedToOriginal(offset: Int): Int {
                return transformedToOriginal[offset.coerceIn(0, formatted.length)]
            }
        }

        return TransformedText(AnnotatedString(formatted), offsetMapping)
    }
}

private class CadastroDependenteCpfVisualTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val digits = text.text.filter(Char::isDigit).take(11)
        val originalToTransformed = IntArray(digits.length + 1)
        val formatted = buildString {
            originalToTransformed[0] = 0
            digits.forEachIndexed { index, c ->
                append(c)
                if (index == 2 && digits.length > 3) append('.')
                if (index == 5 && digits.length > 6) append('.')
                if (index == 8 && digits.length > 9) append('-')
                originalToTransformed[index + 1] = length
            }
        }
        val transformedToOriginal = IntArray(formatted.length + 1) { pos ->
            formatted.take(pos).count(Char::isDigit).coerceAtMost(digits.length)
        }
        val offset = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int = originalToTransformed[offset.coerceIn(0, digits.length)]
            override fun transformedToOriginal(offset: Int): Int = transformedToOriginal[offset.coerceIn(0, formatted.length)]
        }
        return TransformedText(AnnotatedString(formatted), offset)
    }
}

private fun formatCpf(value: String): String {
    val digits = value.filter(Char::isDigit).take(11)
    return when (digits.length) {
        in 0..3 -> digits
        in 4..6 -> "${digits.take(3)}.${digits.drop(3)}"
        in 7..9 -> "${digits.take(3)}.${digits.substring(3, 6)}.${digits.drop(6)}"
        else -> "${digits.take(3)}.${digits.substring(3, 6)}.${digits.substring(6, 9)}-${digits.drop(9)}"
    }
}

private fun validateUpload(fileName: String, mimeType: String, size: Long) {
    val lower = fileName.lowercase()
    val acceptedName = lower.endsWith(".pdf") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png")
    val acceptedMime = mimeType in setOf("application/pdf", "image/jpeg", "image/png")
    if (!acceptedName && !acceptedMime) throw IllegalStateException("Arquivo invalido. Use PDF, JPG ou PNG.")
    if (size > MAX_UPLOAD_BYTES) throw IllegalStateException("O anexo excede o limite de 5 MB aceito pelo ERP. Escolha um arquivo menor.")
}

private fun createCameraCaptureUri(context: Context): Pair<Uri, String> {
    val directory = File(context.cacheDir, "camera_uploads").apply { mkdirs() }
    val file = File.createTempFile("cadastro_", ".jpg", directory)
    val uri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file,
    )
    return uri to file.absolutePath
}

private fun resolveFileName(context: Context, uri: Uri): String {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (cursor.moveToFirst() && index >= 0) {
            return cursor.getString(index)
        }
    }
    return uri.lastPathSegment ?: "arquivo"
}

private fun writePreviewFile(
    context: Context,
    fileName: String,
    bytes: ByteArray,
): Uri {
    val directory = File(context.cacheDir, "shared_qrcodes").apply { mkdirs() }
    val safeName = fileName
        .ifBlank { "arquivo" }
        .replace(Regex("[^a-zA-Z0-9._-]"), "_")
    val file = File(directory, "preview_${System.currentTimeMillis()}_$safeName")
    file.writeBytes(bytes)
    return FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file,
    )
}

private fun resolvePreviewMimeType(fileName: String): String {
    val extension = fileName.substringAfterLast('.', "").lowercase(Locale.ROOT)
    return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: "*/*"
}
