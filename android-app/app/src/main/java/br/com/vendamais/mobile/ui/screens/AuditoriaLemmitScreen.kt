package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.ui.AppUiState
import br.com.vendamais.mobile.ui.AppViewModel
import br.com.vendamais.mobile.ui.components.ScreenHeading
import br.com.vendamais.mobile.ui.components.VendaButton
import br.com.vendamais.mobile.ui.components.VendaEmptyState
import br.com.vendamais.mobile.ui.components.VendaMetricCard
import br.com.vendamais.mobile.ui.components.WebCard
import br.com.vendamais.mobile.ui.components.bringIntoViewOnFocus
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

@Composable
fun AuditoriaLemmitScreen(
    state: AppUiState,
    viewModel: AppViewModel,
) {
    var startDate by rememberSaveable { mutableStateOf(java.time.LocalDate.now().withDayOfMonth(1).toString()) }
    var endDate by rememberSaveable { mutableStateOf(java.time.LocalDate.now().withDayOfMonth(1).plusMonths(1).toString()) }
    var currentPage by rememberSaveable { mutableStateOf(1) }
    val itemsPerPage = 20

    LaunchedEffect(currentPage) {
        val startIso = "${startDate}T00:00:00Z"
        val endIso = "${endDate}T00:00:00Z"
        viewModel.loadAuditLemmit(
            startIso = startIso,
            endIso = endIso,
            limit = itemsPerPage,
            offset = (currentPage - 1) * itemsPerPage,
        )
    }

    val audit = state.auditLemmit

    LazyColumn(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            ScreenHeading(
                title = "Auditoria Lemmit",
                subtitle = "Acompanhe consumo, custo e comportamento das consultas de CPF.",
            )
        }

        item {
            WebCard(title = "Periodo analisado") {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = startDate,
                            onValueChange = { startDate = it },
                            modifier = Modifier.weight(1f).bringIntoViewOnFocus(),
                            label = { Text("Inicio") },
                            supportingText = { Text("AAAA-MM-DD") },
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = endDate,
                            onValueChange = { endDate = it },
                            modifier = Modifier.weight(1f).bringIntoViewOnFocus(),
                            label = { Text("Fim") },
                            supportingText = { Text("AAAA-MM-DD") },
                            singleLine = true,
                        )
                    }
                    VendaButton(
                        label = "Atualizar periodo",
                        onClick = {
                            currentPage = 1
                            val startIso = "${startDate}T00:00:00Z"
                            val endIso = "${endDate}T00:00:00Z"
                            viewModel.loadAuditLemmit(
                                startIso = startIso,
                                endIso = endIso,
                                limit = itemsPerPage,
                                offset = 0,
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !state.adminFeatureLoading,
                    )
                }
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Resumo do consumo",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AuditMetric(
                        label = "Consultas",
                        value = audit.cards.totalConsultas.toString(),
                        container = Blue100,
                        content = Blue500,
                        modifier = Modifier.weight(1f),
                    )
                    AuditMetric(
                        label = "Sucesso",
                        value = audit.cards.bemSucedidas.toString(),
                        container = EmeraldSoft,
                        content = Emerald,
                        modifier = Modifier.weight(1f),
                    )
                    AuditMetric(
                        label = "Erros",
                        value = audit.cards.comErro.toString(),
                        container = Red100,
                        content = Red500,
                        modifier = Modifier.weight(1f),
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AuditMetric(
                        label = "Custo total",
                        value = formatAuditCurrency(audit.cards.custoTotal),
                        container = Amber100,
                        content = Amber500,
                        modifier = Modifier.weight(1f),
                    )
                    AuditMetric(
                        label = "Limite ajustado",
                        value = formatAuditCurrency(audit.cards.totalLimiteAjustado),
                        container = Slate100,
                        content = Slate500,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        item {
            WebCard(title = "Uso por usuario") {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (audit.usuarioConsulta.isEmpty()) {
                        Text(
                            text = "Sem dados de consumo para o periodo.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        audit.usuarioConsulta.forEach { row ->
                            AuditUserRow(
                                name = row.nome.ifBlank { "Sem nome" },
                                primaryValue = "${row.consultas} consulta(s)",
                            )
                        }
                    }
                }
            }
        }

        item {
            WebCard(title = "Custo por usuario") {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (audit.usuarioCusto.isEmpty()) {
                        Text(
                            text = "Sem dados de custo para o periodo.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        audit.usuarioCusto.forEach { row ->
                            AuditUserRow(
                                name = row.nome.ifBlank { "Sem nome" },
                                primaryValue = formatAuditCurrency(row.custoTotal),
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
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = "Ultimas consultas",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Pagina $currentPage",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        if (audit.ultimasConsultas.isEmpty()) {
            item {
                VendaEmptyState(
                    title = "Nenhuma consulta no periodo",
                    message = "Ajuste o intervalo de datas para consultar outros registros Lemmit.",
                )
            }
        } else {
            items(audit.ultimasConsultas) { consulta ->
                WebCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(
                                text = consulta.nome.ifBlank { "Desconhecido" },
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = "CPF ${consulta.cpf.ifBlank { "N/A" }}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant,
                        ) {
                            Text(
                                text = formatAuditDateTime(consulta.hora),
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
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
                        text = "Pagina $currentPage",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TextButton(
                        onClick = { currentPage++ },
                        enabled = audit.ultimasConsultas.size == itemsPerPage,
                    ) {
                        Text("Proxima")
                    }
                }
            }
        }
    }
}

@Composable
private fun AuditMetric(
    label: String,
    value: String,
    container: androidx.compose.ui.graphics.Color,
    content: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
) {
    VendaMetricCard(
        label = label,
        value = value,
        modifier = modifier,
        containerColor = container,
        contentColor = content,
    )
}

@Composable
private fun AuditUserRow(
    name: String,
    primaryValue: String,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = name,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = primaryValue,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

private fun formatAuditCurrency(value: Double): String {
    return runCatching {
        java.text.NumberFormat.getCurrencyInstance(java.util.Locale("pt", "BR")).format(value)
    }.getOrDefault(value.toString())
}

private fun formatAuditDateTime(value: String): String {
    return runCatching {
        java.time.OffsetDateTime.parse(value)
            .format(java.time.format.DateTimeFormatter.ofPattern("dd/MM HH:mm"))
    }.getOrDefault(value)
}
