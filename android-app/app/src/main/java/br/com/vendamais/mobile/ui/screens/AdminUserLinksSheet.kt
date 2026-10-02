package br.com.vendamais.mobile.ui.screens

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.data.models.AdminUser
import br.com.vendamais.mobile.data.models.CadastroLinkHistoryResponse
import br.com.vendamais.mobile.data.models.CadastroLinkItem
import br.com.vendamais.mobile.ui.AppViewModel
import kotlinx.coroutines.launch
import java.text.Normalizer
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.ceil

private const val ADMIN_LINK_COMPANIES_PAGE_SIZE = 5

private data class AdminUserLinkCompanyGroup(
    val key: String,
    val empresaCodigo: Int,
    val empresaNome: String,
    val availableCount: Int,
    val deletedCount: Int,
    val links: List<CadastroLinkItem>,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminUserLinksSheet(
    user: AdminUser,
    viewModel: AppViewModel,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    var links by remember(user.id) { mutableStateOf<List<CadastroLinkItem>>(emptyList()) }
    var loading by remember(user.id) { mutableStateOf(true) }
    var error by remember(user.id) { mutableStateOf<String?>(null) }
    var searchText by remember(user.id) { mutableStateOf("") }
    var currentPage by remember(user.id) { mutableIntStateOf(1) }
    var expandedCompanyKey by remember(user.id) { mutableStateOf<String?>(null) }
    var selectedLinkId by remember(user.id) { mutableStateOf<String?>(null) }
    var historyLoadingId by remember(user.id) { mutableStateOf<String?>(null) }
    var deleteLoadingId by remember(user.id) { mutableStateOf<String?>(null) }
    var pendingDelete by remember(user.id) { mutableStateOf<CadastroLinkItem?>(null) }

    val historyByLink = remember(user.id) {
        mutableStateMapOf<String, CadastroLinkHistoryResponse>()
    }

    val companyGroups = remember(links) {
        links
            .groupBy { link ->
                "${link.empresaCodigo}::${normalizeAdminLinkSearch(link.empresaNome)}"
            }
            .map { (key, companyLinks) ->
                val orderedLinks = companyLinks.sortedByDescending { it.createdAt }
                val first = orderedLinks.first()
                AdminUserLinkCompanyGroup(
                    key = key,
                    empresaCodigo = first.empresaCodigo,
                    empresaNome = first.empresaNome,
                    availableCount = orderedLinks.count { it.deletedAt.isNullOrBlank() },
                    deletedCount = orderedLinks.count { !it.deletedAt.isNullOrBlank() },
                    links = orderedLinks,
                )
            }
            .sortedWith(
                compareBy<AdminUserLinkCompanyGroup> { it.empresaCodigo }
                    .thenBy { it.empresaNome.lowercase() },
            )
    }

    val filteredGroups = remember(companyGroups, searchText) {
        val term = normalizeAdminLinkSearch(searchText)
        if (term.isBlank()) {
            companyGroups
        } else {
            companyGroups.filter { group ->
                group.empresaCodigo.toString().contains(term) ||
                    normalizeAdminLinkSearch(group.empresaNome).contains(term)
            }
        }
    }

    val totalPages = maxOf(
        1,
        ceil(filteredGroups.size / ADMIN_LINK_COMPANIES_PAGE_SIZE.toDouble()).toInt(),
    )
    val pageStart = (currentPage - 1) * ADMIN_LINK_COMPANIES_PAGE_SIZE
    val pagedGroups = filteredGroups
        .drop(pageStart)
        .take(ADMIN_LINK_COMPANIES_PAGE_SIZE)

    LaunchedEffect(searchText) {
        currentPage = 1
        expandedCompanyKey = null
        selectedLinkId = null
    }

    LaunchedEffect(totalPages) {
        if (currentPage > totalPages) currentPage = totalPages
    }

    LaunchedEffect(user.id) {
        loading = true
        error = null

        runCatching { viewModel.fetchAdminUserCadastroLinks(user.id) }
            .onSuccess { rows -> links = rows }
            .onFailure { throwable ->
                error = throwable.message ?: "Nao foi possivel carregar os links deste usuario."
            }

        loading = false
    }

    fun loadHistory(
        link: CadastroLinkItem,
        after: (CadastroLinkHistoryResponse) -> Unit = {},
    ) {
        historyByLink[link.id]?.let { cached ->
            selectedLinkId = if (selectedLinkId == link.id) null else link.id
            after(cached)
            return
        }

        historyLoadingId = link.id
        error = null

        scope.launch {
            runCatching { viewModel.fetchAdminUserCadastroLinkHistory(link.id) }
                .onSuccess { response ->
                    historyByLink[link.id] = response
                    selectedLinkId = link.id
                    after(response)
                }
                .onFailure { throwable ->
                    error = throwable.message ?: "Nao foi possivel carregar o historico do link."
                }
            historyLoadingId = null
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.90f),
        tonalElevation = 10.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = "Historico de links",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "${user.name} · ${user.email}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            OutlinedTextField(
                value = searchText,
                onValueChange = { searchText = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Buscar empresa") },
                placeholder = { Text("Codigo ou nome da empresa") },
                singleLine = true,
            )

            error?.let { message ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = MaterialTheme.shapes.medium,
                ) {
                    Text(
                        text = message,
                        modifier = Modifier.padding(10.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }

            when {
                loading -> {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp),
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                }

                filteredGroups.isEmpty() -> {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = MaterialTheme.shapes.medium,
                    ) {
                        Text(
                            text = if (searchText.isBlank()) {
                                "Este usuario ainda nao criou links."
                            } else {
                                "Nenhuma empresa encontrada para esta busca."
                            },
                            modifier = Modifier.padding(18.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.heightIn(max = 560.dp),
                        verticalArrangement = Arrangement.spacedBy(7.dp),
                    ) {
                        items(pagedGroups, key = { it.key }) { group ->
                            val companyExpanded = expandedCompanyKey == group.key

                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = MaterialTheme.shapes.medium,
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                            ) {
                                Column {
                                    TextButton(
                                        onClick = {
                                            expandedCompanyKey = if (companyExpanded) null else group.key
                                            selectedLinkId = null
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        ) {
                                            Text(
                                                text = group.empresaCodigo.toString(),
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.weight(0.18f),
                                            )
                                            Text(
                                                text = group.empresaNome,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                                fontWeight = FontWeight.SemiBold,
                                                modifier = Modifier.weight(0.50f),
                                            )
                                            Text(
                                                text = "Disponiveis: ${group.availableCount}",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.primary,
                                                modifier = Modifier.weight(0.22f),
                                            )
                                            Text(
                                                text = "Excluidos: ${group.deletedCount}",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                modifier = Modifier.weight(0.20f),
                                            )
                                        }
                                    }

                                    if (companyExpanded) {
                                        HorizontalDivider()
                                        Column(
                                            modifier = Modifier.padding(8.dp),
                                            verticalArrangement = Arrangement.spacedBy(7.dp),
                                        ) {
                                            group.links.forEachIndexed { index, link ->
                                                val history = historyByLink[link.id]
                                                val expanded = selectedLinkId == link.id
                                                val historyLoading = historyLoadingId == link.id
                                                val deleting = deleteLoadingId == link.id

                                                Surface(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    shape = MaterialTheme.shapes.small,
                                                    color = MaterialTheme.colorScheme.surface,
                                                ) {
                                                    Column(
                                                        modifier = Modifier.padding(10.dp),
                                                        verticalArrangement = Arrangement.spacedBy(6.dp),
                                                    ) {
                                                        Row(
                                                            modifier = Modifier.fillMaxWidth(),
                                                            horizontalArrangement = Arrangement.SpaceBetween,
                                                        ) {
                                                            Text(
                                                                text = "Link ${group.links.size - index}",
                                                                style = MaterialTheme.typography.labelMedium,
                                                                fontWeight = FontWeight.SemiBold,
                                                            )
                                                            Text(
                                                                text = if (link.deletedAt.isNullOrBlank()) {
                                                                    "Disponivel"
                                                                } else {
                                                                    "Excluido"
                                                                },
                                                                style = MaterialTheme.typography.labelSmall,
                                                                color = if (link.deletedAt.isNullOrBlank()) {
                                                                    MaterialTheme.colorScheme.primary
                                                                } else {
                                                                    MaterialTheme.colorScheme.error
                                                                },
                                                            )
                                                        }

                                                        Text(
                                                            text = "Criacao: ${formatAdminLinkDateTime(link.createdAt)}",
                                                            style = MaterialTheme.typography.bodySmall,
                                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                        )
                                                        Text(
                                                            text = "Exclusao: ${formatAdminLinkDateTime(link.deletedAt)}",
                                                            style = MaterialTheme.typography.bodySmall,
                                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                        )

                                                        link.adesionistaNome
                                                            ?.trim()
                                                            ?.takeIf { it.isNotBlank() }
                                                            ?.let { adesionista ->
                                                                Text(
                                                                    text = "Adesionista: $adesionista",
                                                                    style = MaterialTheme.typography.bodySmall,
                                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                                )
                                                            }

                                                        Row(
                                                            modifier = Modifier.fillMaxWidth(),
                                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                        ) {
                                                            OutlinedButton(
                                                                onClick = { loadHistory(link) },
                                                                enabled = !historyLoading && !deleting,
                                                                modifier = Modifier.weight(1f),
                                                            ) {
                                                                Text(
                                                                    if (historyLoading) "Carregando..."
                                                                    else "Resumo",
                                                                )
                                                            }

                                                            OutlinedButton(
                                                                onClick = {
                                                                    val cached = historyByLink[link.id]
                                                                    if (cached != null) {
                                                                        val uri = LinkHistoryXlsxExporter.exportToDownloads(
                                                                            context,
                                                                            link,
                                                                            cached.rows,
                                                                        )
                                                                        Toast.makeText(
                                                                            context,
                                                                            if (uri != null) {
                                                                                "Historico XLSX salvo com sucesso."
                                                                            } else {
                                                                                "Nao foi possivel exportar o historico."
                                                                            },
                                                                            Toast.LENGTH_SHORT,
                                                                        ).show()
                                                                    } else {
                                                                        loadHistory(link) { response ->
                                                                            val uri = LinkHistoryXlsxExporter.exportToDownloads(
                                                                                context,
                                                                                link,
                                                                                response.rows,
                                                                            )
                                                                            Toast.makeText(
                                                                                context,
                                                                                if (uri != null) {
                                                                                    "Historico XLSX salvo com sucesso."
                                                                                } else {
                                                                                    "Nao foi possivel exportar o historico."
                                                                                },
                                                                                Toast.LENGTH_SHORT,
                                                                            ).show()
                                                                        }
                                                                    }
                                                                },
                                                                enabled = !historyLoading && !deleting,
                                                                modifier = Modifier.weight(1f),
                                                            ) {
                                                                Text("Exportar")
                                                            }
                                                        }

                                                        if (!link.deletedAt.isNullOrBlank()) {
                                                            OutlinedButton(
                                                                onClick = { pendingDelete = link },
                                                                enabled = !deleting && !historyLoading,
                                                                modifier = Modifier.fillMaxWidth(),
                                                            ) {
                                                                Text(
                                                                    if (deleting) "Excluindo..."
                                                                    else "Excluir definitivamente",
                                                                )
                                                            }
                                                        }

                                                        if (expanded && history != null) {
                                                            HorizontalDivider()
                                                            Row(
                                                                modifier = Modifier.fillMaxWidth(),
                                                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                            ) {
                                                                AdminLinkSummaryMetric(
                                                                    label = "Visitas por sessao",
                                                                    value = history.summary?.clickCount ?: 0,
                                                                    modifier = Modifier.weight(1f),
                                                                )
                                                                AdminLinkSummaryMetric(
                                                                    label = "Tentativas identificadas",
                                                                    value = history.summary?.identifiedAttempts ?: 0,
                                                                    modifier = Modifier.weight(1f),
                                                                )
                                                                AdminLinkSummaryMetric(
                                                                    label = "Apenas abriu",
                                                                    value = history.summary?.anonymousDetailed ?: 0,
                                                                    modifier = Modifier.weight(1f),
                                                                )
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = if (filteredGroups.isEmpty()) {
                        "0 empresas"
                    } else {
                        "Mostrando ${pageStart + 1}-${minOf(
                            pageStart + ADMIN_LINK_COMPANIES_PAGE_SIZE,
                            filteredGroups.size,
                        )} de ${filteredGroups.size}"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "$currentPage / $totalPages",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = { currentPage = maxOf(1, currentPage - 1) },
                    enabled = currentPage > 1,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Anterior")
                }
                OutlinedButton(
                    onClick = { currentPage = minOf(totalPages, currentPage + 1) },
                    enabled = currentPage < totalPages,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Proxima")
                }
            }

            TextButton(
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Fechar")
            }
        }
    }

    pendingDelete?.let { link ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Excluir definitivamente?") },
            text = {
                Text(
                    "O link da empresa ${link.empresaNome} (codigo ${link.empresaCodigo}) " +
                        "e todo o historico relacionado serao apagados do banco. " +
                        "Esta acao nao pode ser desfeita.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingDelete = null
                        deleteLoadingId = link.id
                        error = null
                        scope.launch {
                            runCatching {
                                viewModel.permanentlyDeleteAdminCadastroLink(link.id)
                            }.onSuccess {
                                links = links.filterNot { it.id == link.id }
                                historyByLink.remove(link.id)
                                if (selectedLinkId == link.id) selectedLinkId = null
                            }.onFailure { throwable ->
                                error = throwable.message
                                    ?: "Nao foi possivel excluir definitivamente o link."
                            }
                            deleteLoadingId = null
                        }
                    },
                ) {
                    Text("Excluir")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) {
                    Text("Cancelar")
                }
            },
        )
    }
}

@Composable
private fun AdminLinkSummaryMetric(
    label: String,
    value: Int,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier.padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = value.toString(),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

private fun normalizeAdminLinkSearch(value: String): String =
    Normalizer.normalize(value, Normalizer.Form.NFD)
        .replace("\\p{Mn}+".toRegex(), "")
        .lowercase()
        .trim()

private fun formatAdminLinkDateTime(value: String?): String {
    if (value.isNullOrBlank()) return "Nao excluido"
    return runCatching {
        OffsetDateTime.parse(value)
            .format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
    }.getOrElse { value }
}
