package br.com.vendamais.mobile.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
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
import br.com.vendamais.mobile.ui.components.VendaStatusChip
import br.com.vendamais.mobile.ui.components.VendaStatusTone
import br.com.vendamais.mobile.ui.components.WebCard
import br.com.vendamais.mobile.ui.theme.Amber100
import br.com.vendamais.mobile.ui.theme.Amber500
import br.com.vendamais.mobile.ui.theme.Blue100
import br.com.vendamais.mobile.ui.theme.Blue500
import br.com.vendamais.mobile.ui.theme.Emerald
import br.com.vendamais.mobile.ui.theme.EmeraldSoft
import br.com.vendamais.mobile.ui.theme.Red100
import br.com.vendamais.mobile.ui.theme.Red500
import br.com.vendamais.mobile.ui.theme.Slate100
import br.com.vendamais.mobile.ui.theme.Slate500
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun FilaUploadErpScreen(
    state: AppUiState,
    viewModel: AppViewModel,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selectedFilter by rememberSaveable { mutableStateOf("todos") }
    var currentPage by rememberSaveable { mutableStateOf(1) }
    var fileError by rememberSaveable { mutableStateOf<String?>(null) }
    val itemsPerPage = 20

    LaunchedEffect(Unit) {
        while (true) {
            viewModel.loadUploadQueue()
            delay(5000)
        }
    }

    val filteredItems = state.uploadQueue.filter { item ->
        selectedFilter == "todos" || item.status == selectedFilter
    }
    val totalPages = ((filteredItems.size + itemsPerPage - 1) / itemsPerPage).coerceAtLeast(1)
    if (currentPage > totalPages) currentPage = totalPages
    val pagedItems = filteredItems.drop((currentPage - 1) * itemsPerPage).take(itemsPerPage)
    val pendingCount = state.uploadQueue.count { it.status in setOf("queued", "retry_wait") }
    val processingCount = state.uploadQueue.count { it.status == "processing" }
    val failedCount = state.uploadQueue.count { it.status == "failed" }

    LazyColumn(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            ScreenHeading(
                title = "Fila ERP",
                subtitle = "Acompanhe documentos aguardando sincronizacao e resolva falhas sem perder o cadastro.",
            )
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                QueueMetric(
                    label = "Aguardando",
                    value = pendingCount,
                    container = Amber100,
                    content = Amber500,
                    modifier = Modifier.weight(1f),
                )
                QueueMetric(
                    label = "Processando",
                    value = processingCount,
                    container = Blue100,
                    content = Blue500,
                    modifier = Modifier.weight(1f),
                )
                QueueMetric(
                    label = "Falhas",
                    value = failedCount,
                    container = Red100,
                    content = Red500,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        item {
            WebCard(title = "Operacao da fila") {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SelectionField(
                        label = "Status",
                        value = queueStatusLabel(selectedFilter),
                        options = listOf(
                            "todos" to "Todos",
                            "queued" to "Aguardando",
                            "processing" to "Processando",
                            "retry_wait" to "Aguardando nova tentativa",
                            "success" to "Concluidos",
                            "failed" to "Falhas",
                        ),
                        onSelected = {
                            selectedFilter = it
                            currentPage = 1
                        },
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        VendaButton(
                            label = "Atualizar",
                            onClick = { viewModel.loadUploadQueue() },
                            enabled = !state.adminFeatureLoading,
                            style = VendaButtonStyle.SECONDARY,
                            modifier = Modifier.weight(1f),
                        )
                        VendaButton(
                            label = "Processar agora",
                            onClick = { viewModel.processUploadQueue() },
                            enabled = !state.adminFeatureLoading,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    TextButton(
                        onClick = { viewModel.resetStuckQueue() },
                        enabled = !state.adminFeatureLoading,
                        modifier = Modifier.align(Alignment.End),
                    ) {
                        Text("Liberar itens travados")
                    }

                    state.uploadQueueOperation?.message?.takeIf { it.isNotBlank() }?.let { message ->
                        OperationalNotice(message = message, isError = false)
                    }
                    state.resetQueueResult?.let { result ->
                        OperationalNotice(
                            message = "${result.resetCount} item(ns) liberado(s) no ultimo reset.",
                            isError = false,
                        )
                    }
                }
            }
        }

        fileError?.let { message ->
            item { OperationalNotice(message = message, isError = true) }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Documentos",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "${filteredItems.size} item(ns)",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (filteredItems.isEmpty()) {
            item {
                VendaEmptyState(
                    title = "Nenhum documento na fila",
                    message = "Nao ha itens correspondentes ao status selecionado.",
                )
            }
        } else {
            items(pagedItems) { item ->
                WebCard {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top,
                        ) {
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Text(
                                    text = item.arquivoNome.ifBlank { "Documento sem nome" },
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = item.tipo.ifBlank { "Documento ERP" },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            QueueStatusPill(item.status)
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            QueueDetail(
                                label = "Tentativas",
                                value = item.attempts.toString(),
                                modifier = Modifier.weight(1f),
                            )
                            QueueDetail(
                                label = "Proxima tentativa",
                                value = item.nextAttemptAt?.let(::formatQueueDateTime) ?: "-",
                                modifier = Modifier.weight(2f),
                            )
                        }

                        item.cadastroId?.takeIf { it.isNotBlank() }?.let { cadastroId ->
                            Text(
                                text = "Cadastro ${cadastroId.take(8)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }

                        item.lastError?.takeIf { it.isNotBlank() }?.let { error ->
                            OperationalNotice(message = "Nao foi possivel sincronizar o documento. Detalhes tecnicos: $error", isError = true)
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            VendaButton(
                                label = "Abrir arquivo",
                                style = VendaButtonStyle.SECONDARY,
                                onClick = {
                                    fileError = null
                                    scope.launch {
                                        runCatching { viewModel.createQueueFileSignedUrl(item) }
                                            .onSuccess { signedUrl ->
                                                runCatching {
                                                    context.startActivity(
                                                        Intent(Intent.ACTION_VIEW, Uri.parse(signedUrl)).apply {
                                                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                                        },
                                                    )
                                                }.onFailure {
                                                    fileError = "Nao foi possivel abrir o arquivo neste dispositivo."
                                                }
                                            }
                                            .onFailure { throwable ->
                                                fileError = "Nao foi possivel preparar o arquivo para abertura."
                                            }
                                    }
                                },
                                enabled = !state.adminFeatureLoading && item.arquivoPath.isNotBlank(),
                                modifier = Modifier.weight(1f),
                            )
                            if (item.status == "failed" || item.status == "retry_wait") {
                                VendaButton(
                                    label = "Tentar novamente",
                                    onClick = { viewModel.reprocessUploadQueueItem(item.id) },
                                    enabled = !state.adminFeatureLoading,
                                    modifier = Modifier.weight(1f),
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
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(
                        onClick = { if (currentPage > 1) currentPage-- },
                        enabled = currentPage > 1,
                    ) {
                        Text("Anterior")
                    }
                    Text(
                        text = "$currentPage / $totalPages",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TextButton(
                        onClick = { if (currentPage < totalPages) currentPage++ },
                        enabled = currentPage < totalPages,
                    ) {
                        Text("Proxima")
                    }
                }
            }
        }
    }
}

@Composable
private fun QueueMetric(
    label: String,
    value: Int,
    container: androidx.compose.ui.graphics.Color,
    content: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
) {
    VendaMetricCard(
        label = label,
        value = value.toString(),
        modifier = modifier,
        containerColor = container,
        contentColor = content,
    )
}

@Composable
private fun QueueStatusPill(status: String) {
    val tone = when (status) {
        "success" -> VendaStatusTone.SUCCESS
        "failed" -> VendaStatusTone.ERROR
        "processing" -> VendaStatusTone.PROCESSING
        "queued", "retry_wait" -> VendaStatusTone.PENDING
        else -> VendaStatusTone.NEUTRAL
    }
    VendaStatusChip(label = queueStatusLabel(status), tone = tone)
}

@Composable
private fun QueueDetail(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun OperationalNotice(message: String, isError: Boolean) {
    VendaInlineFeedback(
        title = if (isError) "Atencao na sincronizacao" else "Operacao concluida",
        message = message,
        tone = if (isError) VendaFeedbackTone.ERROR else VendaFeedbackTone.SUCCESS,
    )
}

private fun queueStatusLabel(status: String): String {
    return when (status) {
        "todos" -> "Todos"
        "queued" -> "Aguardando"
        "processing" -> "Processando"
        "retry_wait" -> "Nova tentativa"
        "success" -> "Concluido"
        "failed" -> "Falhou"
        else -> status
    }
}

private fun formatQueueDateTime(value: String): String {
    return runCatching {
        java.time.OffsetDateTime.parse(value)
            .format(java.time.format.DateTimeFormatter.ofPattern("dd/MM HH:mm"))
    }.getOrDefault(value)
}
