package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.data.models.CadastroExcluidoItem
import br.com.vendamais.mobile.ui.AppUiState
import br.com.vendamais.mobile.ui.AppViewModel
import br.com.vendamais.mobile.ui.components.ScreenHeading
import br.com.vendamais.mobile.ui.components.VendaButton
import br.com.vendamais.mobile.ui.components.VendaEmptyState
import br.com.vendamais.mobile.ui.components.VendaMetricCard
import br.com.vendamais.mobile.ui.components.WebCard
import br.com.vendamais.mobile.ui.components.bringIntoViewOnFocus
import br.com.vendamais.mobile.ui.theme.Red100
import br.com.vendamais.mobile.ui.theme.Red500
import br.com.vendamais.mobile.ui.theme.Slate100
import br.com.vendamais.mobile.ui.theme.Slate500
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate
import java.time.OffsetDateTime

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdesoesExcluidasScreen(
    state: AppUiState,
    viewModel: AppViewModel,
) {
    var selected by remember { mutableStateOf<CadastroExcluidoItem?>(null) }
    var nome by rememberSaveable { mutableStateOf("") }
    var cpf by rememberSaveable { mutableStateOf("") }
    var start by rememberSaveable { mutableStateOf("") }
    var end by rememberSaveable { mutableStateOf("") }
    var exclusor by rememberSaveable { mutableStateOf("") }
    var page by rememberSaveable { mutableStateOf(1) }
    val perPage = 15

    LaunchedEffect(Unit) {
        viewModel.loadCadastrosExcluidos(1000)
    }

    val filtered = state.cadastrosExcluidos.filter { item ->
        val data = runCatching { item.dadosCadastro.jsonObject }.getOrNull()
        val title = data?.get("nome")?.jsonPrimitive?.contentOrNull.orEmpty()
        val dependentes = runCatching { data?.get("dependentes")?.jsonArray }.getOrNull().orEmpty()
        val matchNome = nome.isBlank() ||
            title.contains(nome, true) ||
            dependentes.any {
                runCatching {
                    it.jsonObject["nome"]?.jsonPrimitive?.contentOrNull.orEmpty().contains(nome, true)
                }.getOrDefault(false)
            }
        val cpfData = data?.get("cpf")?.jsonPrimitive?.contentOrNull.orEmpty().filter(Char::isDigit)
        val matchCpf = cpf.filter(Char::isDigit).let { digits -> digits.isBlank() || cpfData.contains(digits) }
        val date = runCatching { OffsetDateTime.parse(item.excluidoEm).toLocalDate() }.getOrNull()
        val matchStart = start.takeIf { it.isNotBlank() }?.let { value ->
            runCatching { date != null && !date.isBefore(LocalDate.parse(value)) }.getOrDefault(false)
        } ?: true
        val matchEnd = end.takeIf { it.isNotBlank() }?.let { value ->
            runCatching { date != null && !date.isAfter(LocalDate.parse(value)) }.getOrDefault(false)
        } ?: true
        val matchExclusor = exclusor.isBlank() || item.excluidoPor == exclusor
        matchNome && matchCpf && matchStart && matchEnd && matchExclusor
    }

    val totalPages = ((filtered.size + perPage - 1) / perPage).coerceAtLeast(1)
    if (page > totalPages) page = totalPages
    val paged = filtered.drop((page - 1) * perPage).take(perPage)
    val exclusores = state.cadastrosExcluidos
        .distinctBy { it.excluidoPor }
        .sortedBy { it.excluidoPorNome }

    LazyColumn(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            ScreenHeading(
                title = "Adesoes Excluidas",
                subtitle = "Audite exclusoes logicas, motivo, responsavel e dados preservados do cadastro.",
            )
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                DeletedMetric(
                    value = state.cadastrosExcluidos.size.toString(),
                    label = "Historico",
                    modifier = Modifier.weight(1f),
                )
                DeletedMetric(
                    value = filtered.size.toString(),
                    label = "No filtro",
                    modifier = Modifier.weight(1f),
                )
            }
        }

        item {
            WebCard(title = "Filtros") {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = nome,
                        onValueChange = { nome = it; page = 1 },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Titular ou dependente") },
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = cpf,
                        onValueChange = { cpf = it.filter(Char::isDigit).take(11); page = 1 },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("CPF do titular") },
                        singleLine = true,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = start,
                            onValueChange = { start = it; page = 1 },
                            modifier = Modifier.weight(1f).bringIntoViewOnFocus(),
                            label = { Text("Inicio") },
                            supportingText = { Text("AAAA-MM-DD") },
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = end,
                            onValueChange = { end = it; page = 1 },
                            modifier = Modifier.weight(1f).bringIntoViewOnFocus(),
                            label = { Text("Fim") },
                            supportingText = { Text("AAAA-MM-DD") },
                            singleLine = true,
                        )
                    }
                    SelectionField(
                        label = "Excluido por",
                        value = exclusores.firstOrNull { it.excluidoPor == exclusor }?.excluidoPorNome ?: "Todos",
                        options = listOf("" to "Todos") + exclusores.map { it.excluidoPor to it.excluidoPorNome },
                        onSelected = { exclusor = it; page = 1 },
                    )
                    OutlinedButton(
                        onClick = {
                            nome = ""
                            cpf = ""
                            start = ""
                            end = ""
                            exclusor = ""
                            page = 1
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Limpar filtros")
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
                Text(
                    text = "Registros",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "${paged.size} nesta pagina",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (paged.isEmpty()) {
            item {
                WebCard {
                    Text(
                        text = "Nenhuma exclusao encontrada para os filtros informados.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            items(paged) { item ->
                val obj = runCatching { item.dadosCadastro.jsonObject }.getOrNull()
                val title = obj?.get("nome")?.jsonPrimitive?.contentOrNull ?: "Nome nao informado"
                val empresa = obj?.get("empresa_nome")?.jsonPrimitive?.contentOrNull ?: "-"
                val vendedor = obj?.get("vendedor_nome")?.jsonPrimitive?.contentOrNull ?: "-"

                WebCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { selected = item },
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top,
                        ) {
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(3.dp),
                            ) {
                                Text(
                                    text = title,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = empresa,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Text(
                                text = formatDeletedDateTime(item.excluidoEm),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }

                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            color = Red100,
                        ) {
                            Text(
                                text = item.motivoExclusao.ifBlank { "Motivo nao informado" },
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = Red500,
                            )
                        }

                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(
                                text = "Vendedor: $vendedor",
                                modifier = Modifier.fillMaxWidth(),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = "Excluido por: ${item.excluidoPorNome}",
                                modifier = Modifier.fillMaxWidth(),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.primary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
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
                    onClick = { if (page > 1) page-- },
                    enabled = page > 1,
                ) {
                    Text("Anterior")
                }
                Text(
                    text = "$page / $totalPages",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(
                    onClick = { if (page < totalPages) page++ },
                    enabled = page < totalPages,
                ) {
                    Text("Proxima")
                }
            }
        }
    }

    selected?.let { current ->
        val obj = runCatching { current.dadosCadastro.jsonObject }.getOrNull()
        val deps = runCatching { obj?.get("dependentes")?.jsonArray }.getOrNull().orEmpty()
        val title = obj?.get("nome")?.jsonPrimitive?.contentOrNull ?: "Detalhes da exclusao"

        ModalBottomSheet(onDismissRequest = { selected = null }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "Excluido em ${formatDeletedDateTime(current.excluidoEm)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                DeletedDetail("CPF", obj?.get("cpf")?.jsonPrimitive?.contentOrNull ?: "-")
                DeletedDetail("Empresa", obj?.get("empresa_nome")?.jsonPrimitive?.contentOrNull ?: "-")
                DeletedDetail("Vendedor", obj?.get("vendedor_nome")?.jsonPrimitive?.contentOrNull ?: "-")
                DeletedDetail("Tipo", obj?.get("tipo_cadastro")?.jsonPrimitive?.contentOrNull ?: "-")
                DeletedDetail("Excluido por", "${current.excluidoPorNome} (${current.excluidoPorRole})")

                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = Red100,
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            text = "Motivo",
                            style = MaterialTheme.typography.labelSmall,
                            color = Red500,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = current.motivoExclusao.ifBlank { "Nao informado" },
                            style = MaterialTheme.typography.bodyMedium,
                            color = Red500,
                        )
                    }
                }

                if (deps.isNotEmpty()) {
                    Text(
                        text = "Dependentes preservados",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    deps.forEach { dep ->
                        val data = runCatching { dep.jsonObject }.getOrNull()
                        val depName = data?.get("nome")?.jsonPrimitive?.contentOrNull ?: "Dependente"
                        val depCpf = data?.get("cpf")?.jsonPrimitive?.contentOrNull.orEmpty()
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                        ) {
                            Column(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalArrangement = Arrangement.spacedBy(2.dp),
                            ) {
                                Text(depName, fontWeight = FontWeight.Medium)
                                if (depCpf.isNotBlank()) {
                                    Text(
                                        text = depCpf,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }

                VendaButton(
                    label = "Fechar",
                    onClick = { selected = null },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun DeletedMetric(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
) {
    VendaMetricCard(
        label = label,
        value = value,
        modifier = modifier,
        containerColor = Slate100,
        contentColor = MaterialTheme.colorScheme.onSurface,
    )
}

@Composable
private fun DeletedDetail(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

private fun formatDeletedDateTime(value: String): String {
    return runCatching {
        OffsetDateTime.parse(value)
            .format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
    }.getOrDefault(value)
}
