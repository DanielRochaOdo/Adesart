package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.data.models.LinkPendenciaItem
import br.com.vendamais.mobile.ui.LinkWorkspaceState
import br.com.vendamais.mobile.ui.components.VendaButton
import br.com.vendamais.mobile.ui.components.VendaButtonStyle
import br.com.vendamais.mobile.ui.components.VendaEmptyState
import br.com.vendamais.mobile.ui.components.WebCard
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

@Composable
fun LinkPendenciasCard(
    workspace: LinkWorkspaceState,
    profileRole: String,
    onSendPending: (String) -> Unit,
    onDownloadContract: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        WebCard {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "Link Pendencias",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Solicitacoes identificadas nos links. Links com autorizacao podem ser concluidos internamente; os demais ficam para acompanhamento.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                val activeCount = workspace.linkPendencias.count {
                    it.status !in setOf("enviado", "encerrado")
                }
                Text(
                    text = "$activeCount pendencia(s) ativa(s)",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        workspace.linkPendenciasError?.let { message ->
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.small,
                color = MaterialTheme.colorScheme.errorContainer,
            ) {
                Text(
                    text = message,
                    modifier = Modifier.padding(12.dp),
                    color = MaterialTheme.colorScheme.onErrorContainer,
                )
            }
        }

        when {
            workspace.linkPendenciasLoading -> {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator()
                }
            }

            workspace.linkPendencias.isEmpty() -> {
                VendaEmptyState(
                    title = "Nenhum registro encontrado",
                    message = "As solicitacoes identificadas por links aparecerao aqui.",
                )
            }

            else -> workspace.linkPendencias.forEach { item ->
                LinkPendenciaRow(
                    item = item,
                    profileRole = profileRole,
                    onSendPending = onSendPending,
                    onDownloadContract = onDownloadContract,
                )
            }
        }
    }
}

@Composable
private fun LinkPendenciaRow(
    item: LinkPendenciaItem,
    profileRole: String,
    onSendPending: (String) -> Unit,
    onDownloadContract: (String) -> Unit,
) {
    val canRepairErpError = profileRole.uppercase() in setOf("ADMINISTRADOR", "CADASTRO", "GERENTE")
    val canTreat = item.requiresAuthorization && item.contractSessionId != null &&
        item.status !in setOf("enviando", "enviado", "encerrado") &&
        (item.status != "erro_envio" || canRepairErpError)

    WebCard {
        Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = item.nome?.takeIf { it.isNotBlank() } ?: "Pessoa identificada",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = buildString {
                            val cpf = item.cpf?.filter(Char::isDigit).orEmpty()
                            if (cpf.length == 11) {
                                append(
                                    cpf.replace(
                                        Regex("(\\d{3})(\\d{3})(\\d{3})(\\d{2})"),
                                        "$1.$2.$3-$4",
                                    ),
                                )
                                append(" · ")
                            }
                            append(item.empresaCodigo)
                            append(" - ")
                            append(item.empresaNome)
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text = statusLabel(item.status),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = when (item.status) {
                        "enviado" -> MaterialTheme.colorScheme.primary
                        "erro_envio" -> MaterialTheme.colorScheme.error
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }

            Text(
                text = if (item.operationType == "existing_member") {
                    "Inclusao de dependente"
                } else {
                    "Nova adesao"
                },
                style = MaterialTheme.typography.labelLarge,
            )
            Text(
                text = "Autorizacao: ${if (item.requiresAuthorization) "Sim" else "Nao"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Primeira tentativa: ${formatPendingDate(item.firstAttemptAt)} · Ultima atividade: ${formatPendingDate(item.lastActivityAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (item.sourceAttemptIds.size > 1) {
                Text(
                    text = "${item.sourceAttemptIds.size} tentativas consolidadas nesta jornada",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            if (!item.requiresAuthorization && item.status !in setOf("enviado", "encerrado")) {
                Text(
                    text = "Aguardando o proprio cliente retomar e concluir pelo link.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (item.status == "erro_envio" && !canRepairErpError) {
                Text(
                    text = "Tratativa de erro ERP restrita a Administrador, Cadastro e Gerente.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            item.lastError?.takeIf { it.isNotBlank() }?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            if (item.contractSessionId != null) {
                VendaButton(
                    label = "Baixar contrato aceito",
                    onClick = { onDownloadContract(item.id) },
                    style = VendaButtonStyle.SECONDARY,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (canTreat) {
                VendaButton(
                    label = "Enviar ao ERP e concluir",
                    onClick = { onSendPending(item.id) },
                    modifier = Modifier.fillMaxWidth(),
                )
            } else if (item.requiresAuthorization && item.status == "enviando") {
                VendaButton(
                    label = "Envio em andamento",
                    onClick = {},
                    enabled = false,
                    style = VendaButtonStyle.SECONDARY,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

private fun statusLabel(status: String): String = when (status) {
    "aguardando_analise" -> "Aguardando analise"
    "pronto_erp" -> "Pronto para ERP"
    "enviando" -> "Enviando"
    "enviado" -> "Enviado"
    "erro_envio" -> "Erro de envio"
    "encerrado" -> "Encerrado"
    else -> status.replace('_', ' ')
}

private fun formatPendingDate(value: String): String {
    return runCatching {
        OffsetDateTime.parse(value).format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss"))
    }.getOrDefault(value)
}
