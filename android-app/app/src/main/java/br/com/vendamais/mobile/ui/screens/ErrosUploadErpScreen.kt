package br.com.vendamais.mobile.ui.screens

import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.ui.AppUiState
import br.com.vendamais.mobile.ui.AppViewModel
import br.com.vendamais.mobile.ui.components.ScreenHeading
import br.com.vendamais.mobile.ui.components.VendaButton
import br.com.vendamais.mobile.ui.components.VendaButtonStyle
import br.com.vendamais.mobile.ui.components.VendaEmptyState
import br.com.vendamais.mobile.ui.components.VendaFeedbackTone
import br.com.vendamais.mobile.ui.components.VendaInlineFeedback
import br.com.vendamais.mobile.ui.components.VendaMetricCard
import br.com.vendamais.mobile.ui.components.WebCard
import br.com.vendamais.mobile.ui.theme.Red100
import br.com.vendamais.mobile.ui.theme.Red500
import br.com.vendamais.mobile.ui.theme.Slate100
import br.com.vendamais.mobile.ui.theme.Slate500
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private val errorCategoryLabels = mapOf(
    "FILE_NOT_FOUND" to "Arquivo nao encontrado",
    "FILE_TOO_LARGE" to "Arquivo acima de 5 MB",
    "EMPTY_FILE" to "Arquivo vazio",
    "ERP_FILE_LOCKED" to "Arquivo bloqueado no ERP",
    "ERP_REJECTED" to "Rejeitado pelo ERP",
    "ERP_NETWORK" to "Falha de conexao com ERP",
    "ERP_RATE_LIMIT" to "Limite de requisicoes",
    "ERP_SERVER_ERROR" to "Erro do servidor ERP",
    "ERP_INVALID_RESPONSE" to "Resposta invalida do ERP",
    "ERP_CONFIG" to "Configuracao do ERP",
    "QUEUE_INTERNAL" to "Falha interna da fila",
    "PRIMARY_DEPENDENT_NOT_FOUND" to "CPF principal nao localizado",
    "ERP_FUNCIONARIO_ID_NOT_FOUND" to "Funcionario ERP nao identificado",
    "LEGACY_UNCLASSIFIED" to "Erro legado nao classificado",
)

@Composable
fun ErrosUploadErpScreen(
    state: AppUiState,
    viewModel: AppViewModel,
    initialScope: String,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var selectedScope by rememberSaveable {
        mutableStateOf(
            initialScope.takeIf { it in setOf("current", "historical", "resolved", "all") }
                ?: "current",
        )
    }
    var selectedCategory by rememberSaveable { mutableStateOf("") }
    var currentPage by rememberSaveable { mutableStateOf(1) }
    var pendingReplacementId by rememberSaveable { mutableStateOf<String?>(null) }

    val replacementLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        val item = state.uploadErrors.items.firstOrNull { it.id == pendingReplacementId }
        pendingReplacementId = null
        if (uri == null || item == null) return@rememberLauncherForActivityResult

        coroutineScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val resolver = context.contentResolver
                    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: throw IllegalStateException("Nao foi possivel ler o arquivo selecionado.")
                    val mime = resolver.getType(uri).orEmpty().ifBlank { inferErrorFileMime(uri.toString()) }
                    var name = "documento"
                    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                            if (index >= 0) name = cursor.getString(index) ?: name
                        }
                    }
                    Triple(bytes, name, mime)
                }
            }.onSuccess { (bytes, name, mime) ->
                viewModel.replaceErpUploadErrorFile(
                    item = item,
                    bytes = bytes,
                    fileName = name,
                    mimeType = mime,
                )
            }.onFailure { throwable ->
                android.util.Log.e("ErrosUploadErpScreen", "Falha ao preparar arquivo", throwable)
            }
        }
    }

    LaunchedEffect(selectedScope, selectedCategory, currentPage) {
        viewModel.loadErpUploadErrors(
            scope = selectedScope,
            category = selectedCategory,
            page = currentPage,
        )
    }

    val response = state.uploadErrors
    val totalPages = response.pagination.totalPages.coerceAtLeast(1)
    if (currentPage > totalPages) currentPage = totalPages

    LazyColumn(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                TextButton(onClick = onBack) { Text("Voltar") }
                TextButton(
                    onClick = { viewModel.reconcileErpUploadErrors() },
                    enabled = !state.uploadErrorsLoading,
                ) { Text("Sincronizar") }
            }
            ScreenHeading(
                title = "Erros de Upload ERP",
                subtitle = "Identifique a causa, recupere arquivos e acompanhe somente falhas que exigem acao.",
            )
        }

        state.errorMessage?.takeIf { it.isNotBlank() }?.let { error ->
            item {
                VendaInlineFeedback(
                    title = "Atencao na sincronizacao",
                    message = error,
                    tone = VendaFeedbackTone.ERROR,
                )
            }
        }
        state.noticeMessage?.takeIf { it.isNotBlank() }?.let { notice ->
            item {
                VendaInlineFeedback(
                    title = "Operacao concluida",
                    message = notice,
                    tone = VendaFeedbackTone.SUCCESS,
                )
            }
        }

        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(
                    listOf(
                        "current" to "Atuais",
                        "historical" to "Historico",
                        "resolved" to "Resolvidos",
                        "all" to "Todos",
                    ),
                ) { (value, label) ->
                    WebCard(
                        modifier = Modifier.clickable {
                            selectedScope = value
                            currentPage = 1
                        },
                    ) {
                        Text(
                            text = label,
                            fontWeight = if (selectedScope == value) FontWeight.Bold else FontWeight.Medium,
                            color = if (selectedScope == value) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ErrorMetric(
                        label = "Todos",
                        value = response.summary.total,
                        selected = selectedCategory.isBlank(),
                        modifier = Modifier.weight(1f),
                        onClick = { selectedCategory = ""; currentPage = 1 },
                    )
                    ErrorMetric(
                        label = "Sem arquivo",
                        value = response.summary.fileNotFound,
                        selected = selectedCategory == "FILE_NOT_FOUND",
                        modifier = Modifier.weight(1f),
                        onClick = { selectedCategory = "FILE_NOT_FOUND"; currentPage = 1 },
                    )
                    ErrorMetric(
                        label = "> 5 MB",
                        value = response.summary.fileTooLarge,
                        selected = selectedCategory == "FILE_TOO_LARGE",
                        modifier = Modifier.weight(1f),
                        onClick = { selectedCategory = "FILE_TOO_LARGE"; currentPage = 1 },
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ErrorMetric(
                        label = "ERP bloqueado",
                        value = response.summary.erpFileLocked,
                        selected = selectedCategory == "ERP_FILE_LOCKED",
                        modifier = Modifier.weight(1f),
                        onClick = { selectedCategory = "ERP_FILE_LOCKED"; currentPage = 1 },
                    )
                    ErrorMetric(
                        label = "ERP rejeitou",
                        value = response.summary.erpRejected,
                        selected = selectedCategory == "ERP_REJECTED",
                        modifier = Modifier.weight(1f),
                        onClick = { selectedCategory = "ERP_REJECTED"; currentPage = 1 },
                    )
                    ErrorMetric(
                        label = "Dep. principal",
                        value = response.summary.primaryDependentNotFound,
                        selected = selectedCategory == "PRIMARY_DEPENDENT_NOT_FOUND",
                        modifier = Modifier.weight(1f),
                        onClick = { selectedCategory = "PRIMARY_DEPENDENT_NOT_FOUND"; currentPage = 1 },
                    )
                }
            }
        }

        if (state.uploadErrorsLoading && response.items.isEmpty()) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(32.dp),
                    horizontalArrangement = Arrangement.Center,
                ) { CircularProgressIndicator() }
            }
        } else if (response.items.isEmpty()) {
            item {
                VendaEmptyState(
                    title = "Nenhuma falha encontrada",
                    message = "Nao ha registros para o filtro selecionado.",
                )
            }
        } else {
            items(response.items, key = { it.id }) { item ->
                WebCard {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = item.clienteNome?.takeIf { it.isNotBlank() } ?: "Cliente nao informado",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                item.clienteCpf?.takeIf { it.isNotBlank() }?.let {
                                    Text(
                                        text = formatErrorCpf(it),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                            Text(
                                text = formatErrorDate(item.createdAt),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }

                        Text(
                            text = errorCategoryLabels[item.errorCategory] ?: item.errorCategory,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = Red500,
                        )

                        item.empresaNome?.takeIf { it.isNotBlank() }?.let {
                            Text(text = "Empresa: $it", style = MaterialTheme.typography.bodySmall)
                        }
                        item.vendedorNome?.takeIf { it.isNotBlank() }?.let {
                            Text(
                                text = "Vendedor: $it",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        item.adesionistaNome?.takeIf { it.isNotBlank() }?.let {
                            Text(
                                text = "Adesionista: $it",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }

                        Text(
                            text = "Arquivo: ${item.arquivoNome.ifBlank { "-" }} (${formatErrorBytes(item.fileSizeBytes)})",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Text(
                            text = if (item.fileExists) "Arquivo disponivel no Storage" else "Arquivo ausente no Storage",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )

                        val target = item.targetDependenteNome?.takeIf { it.isNotBlank() }
                        val targetCpf = item.targetDependenteCpf?.takeIf { it.isNotBlank() }
                        if (target != null || targetCpf != null || item.idDependente > 0) {
                            Text(
                                text = buildString {
                                    append("Destino: ")
                                    append(target ?: "Dependente ERP")
                                    targetCpf?.let { append(" · ${formatErrorCpf(it)}") }
                                        ?: item.idDependente.takeIf { it > 0 }?.let { append(" · ID $it") }
                                },
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Medium,
                            )
                        }

                        item.lastError?.takeIf { it.isNotBlank() }?.let { error ->
                            VendaInlineFeedback(
                                title = listOfNotNull(
                                    item.lastErrorCode,
                                    item.lastStatusCode?.let { "HTTP $it" },
                                ).joinToString(" · ").ifBlank { "Detalhe tecnico" },
                                message = error,
                                tone = VendaFeedbackTone.ERROR,
                            )
                        }

                        Text(
                            text = "Tentativas: ${item.attempts} · Origem: ${item.workerSource ?: "-"}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )

                        if (item.isLegacyFailure) {
                            Text(
                                text = "Passivo historico: nao compoe o alerta operacional atual.",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }

                        if (item.canReconcile) {
                            VendaButton(
                                label = "Sincronizar",
                                style = VendaButtonStyle.SECONDARY,
                                enabled = !state.uploadErrorsLoading,
                                onClick = { viewModel.reconcileErpUploadErrors(item.id) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }

                        if (item.canUploadReplacement) {
                            VendaButton(
                                label = "Enviar novo arquivo",
                                enabled = !state.uploadErrorsLoading,
                                onClick = {
                                    pendingReplacementId = item.id
                                    replacementLauncher.launch(
                                        arrayOf("application/pdf", "image/jpeg", "image/png"),
                                    )
                                },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }

                        if (item.canCompress) {
                            VendaButton(
                                label = "Comprimir e reenviar",
                                enabled = !state.uploadErrorsLoading,
                                onClick = { viewModel.compressAndRequeueErpUploadError(item) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }

                        if (item.canReprocess) {
                            VendaButton(
                                label = "Tentar novamente",
                                style = VendaButtonStyle.SECONDARY,
                                enabled = !state.uploadErrorsLoading,
                                onClick = { viewModel.reprocessErpUploadError(item) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                TextButton(
                    onClick = { if (currentPage > 1) currentPage-- },
                    enabled = currentPage > 1 && !state.uploadErrorsLoading,
                ) { Text("Anterior") }
                Text(
                    text = "$currentPage / $totalPages",
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(top = 12.dp),
                )
                TextButton(
                    onClick = { if (currentPage < totalPages) currentPage++ },
                    enabled = currentPage < totalPages && !state.uploadErrorsLoading,
                ) { Text("Proxima") }
            }
        }
    }
}

@Composable
private fun ErrorMetric(
    label: String,
    value: Int,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    VendaMetricCard(
        label = label,
        value = value.toString(),
        modifier = modifier.clickable(onClick = onClick),
        containerColor = if (selected) Red100 else Slate100,
        contentColor = if (selected) Red500 else Slate500,
    )
}

private fun formatErrorCpf(value: String): String {
    val digits = value.filter(Char::isDigit)
    return if (digits.length == 11) {
        "${digits.substring(0, 3)}.${digits.substring(3, 6)}.${digits.substring(6, 9)}-${digits.substring(9)}"
    } else value
}

private fun formatErrorDate(value: String): String {
    return runCatching {
        OffsetDateTime.parse(value)
            .format(DateTimeFormatter.ofPattern("dd/MM HH:mm", Locale("pt", "BR")))
    }.getOrDefault(value)
}

private fun formatErrorBytes(value: Long?): String {
    if (value == null || value <= 0) return "-"
    val mb = value / 1024.0 / 1024.0
    return if (mb >= 1) String.format(Locale.getDefault(), "%.2f MB", mb)
    else String.format(Locale.getDefault(), "%.1f KB", value / 1024.0)
}

private fun inferErrorFileMime(value: String): String {
    val lower = value.lowercase(Locale.ROOT)
    return when {
        lower.endsWith(".pdf") -> "application/pdf"
        lower.endsWith(".png") -> "image/png"
        lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
        else -> "application/octet-stream"
    }
}
