package br.com.vendamais.mobile.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.ExpandLess
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.FileDownload
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.QrCode
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.core.content.FileProvider
import br.com.vendamais.mobile.data.models.CadastroLinkAssociadoResumo
import br.com.vendamais.mobile.data.models.CadastroLinkHistoryRow
import br.com.vendamais.mobile.data.models.CadastroLinkHistorySummary
import br.com.vendamais.mobile.data.models.CadastroLinkItem
import br.com.vendamais.mobile.data.models.CadastroLinkMetrics
import br.com.vendamais.mobile.data.models.TeamMemberOption
import br.com.vendamais.mobile.data.models.EmpresaResumo
import br.com.vendamais.mobile.data.models.EmpresaSearchType
import br.com.vendamais.mobile.ui.LinkWorkspaceState
import br.com.vendamais.mobile.ui.components.VendaButton
import br.com.vendamais.mobile.ui.components.VendaButtonStyle
import br.com.vendamais.mobile.ui.components.VendaEmptyState
import br.com.vendamais.mobile.ui.components.WebCard
import br.com.vendamais.mobile.ui.components.bringIntoViewOnFocus
import br.com.vendamais.mobile.ui.theme.Emerald
import br.com.vendamais.mobile.ui.theme.EmeraldDark
import br.com.vendamais.mobile.ui.theme.EmeraldSoft
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import java.io.File
import java.io.FileOutputStream
import java.text.Normalizer
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.ceil

private const val LINK_PAGE_SIZE = 5
private const val HISTORY_PAGE_SIZE = 10

private data class LinkEmpresaGroup(
    val codigo: Int,
    val nome: String,
    val cnpj: String?,
    val links: List<CadastroLinkItem>,
)

private data class AssociadosDialogState(
    val empresaNome: String,
    val associados: List<CadastroLinkAssociadoResumo>,
)

@Composable
fun CadastroLinksCard(
    workspace: LinkWorkspaceState,
    adesionistas: List<TeamMemberOption> = emptyList(),
    onSelectedAdesionistaChange: (String) -> Unit = {},
    invalidCompanyCodes: List<String> = emptyList(),
    onSearchTypeChange: (EmpresaSearchType) -> Unit,
    onSearchValueChange: (String) -> Unit,
    onSearchEmpresa: () -> Unit,
    onSelectEmpresa: (EmpresaResumo) -> Unit,
    onClearEmpresa: () -> Unit,
    onGenerateLink: () -> Unit,
    onRegenerateLink: (String) -> Unit,
    onDeleteLink: (String) -> Unit,
    onOpenHistory: (String) -> Unit,
    onCloseHistory: () -> Unit,
) {
    val context = LocalContext.current
    var qrDialogLink by remember { mutableStateOf<CadastroLinkItem?>(null) }
    var pendingEmpresa by remember { mutableStateOf<EmpresaResumo?>(null) }
    var showObservacoesModal by remember { mutableStateOf(false) }
    var showAuthorizationModal by remember { mutableStateOf(false) }
    var authorizationError by remember { mutableStateOf<String?>(null) }
    var invalidCompanyName by remember { mutableStateOf<String?>(null) }
    var associadosDialog by remember { mutableStateOf<AssociadosDialogState?>(null) }
    var listSearchTerm by remember { mutableStateOf("") }
    var currentPage by remember { mutableIntStateOf(1) }
    val expandedGroups = remember { mutableStateMapOf<String, Boolean>() }

    val filteredLinks = workspace.links.filter { link ->
        val search = normalizeSearch(listSearchTerm)
        if (search.isBlank()) {
            true
        } else {
            listOf(
                link.empresaCodigo.toString(),
                link.empresaNome,
                link.empresaCnpj.orEmpty(),
                link.vendedorNome.orEmpty(),
                link.vendedorCodigo.orEmpty(),
            ).joinToString(" ")
                .let(::normalizeSearch)
                .contains(search)
        }
    }

    val totalPages = maxOf(1, ceil(filteredLinks.size / LINK_PAGE_SIZE.toDouble()).toInt())
    LaunchedEffect(totalPages) {
        if (currentPage > totalPages) currentPage = totalPages
    }
    val pageStart = (currentPage - 1) * LINK_PAGE_SIZE
    val pagedLinks = filteredLinks.drop(pageStart).take(LINK_PAGE_SIZE)
    val groups = groupLinksByEmpresa(pagedLinks)

    fun beginEmpresaSelection(empresa: EmpresaResumo) {
        val situacao = empresa.codigoSituacao?.toString()
        if (!situacao.isNullOrBlank() && invalidCompanyCodes.contains(situacao)) {
            invalidCompanyName = empresa.nomeFantasia.ifBlank {
                empresa.razaoSocial.ifBlank { "Empresa sem nome" }
            }
            return
        }

        authorizationError = null
        pendingEmpresa = empresa
        if (!empresa.observacoesResolvidas.isNullOrBlank()) {
            showObservacoesModal = true
        } else {
            showAuthorizationModal = true
        }
    }

    WebCard {
        Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "Links de adesao",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Selecione uma empresa para gerar um link publico e acompanhe os links ativos.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            Text(
                text = if (workspace.selectedEmpresa == null) "1. Localize a empresa" else "Empresa selecionada",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )

            if (workspace.selectedEmpresa == null) {
                LinkSearchTypeRow(
                    selected = workspace.empresaSearchType,
                    onSelected = onSearchTypeChange,
                )

                OutlinedTextField(
                    value = workspace.empresaSearchValue,
                    onValueChange = onSearchValueChange,
                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                    label = {
                        Text(
                            when (workspace.empresaSearchType) {
                                EmpresaSearchType.CODIGO -> "Codigo da empresa"
                                EmpresaSearchType.CNPJ -> "CNPJ"
                                EmpresaSearchType.NOME -> "Nome da empresa"
                            },
                        )
                    },
                    placeholder = {
                        Text(
                            when (workspace.empresaSearchType) {
                                EmpresaSearchType.CODIGO -> "Digite o codigo"
                                EmpresaSearchType.CNPJ -> "00.000.000/0000-00"
                                EmpresaSearchType.NOME -> "Digite o nome da empresa"
                            },
                        )
                    },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = when (workspace.empresaSearchType) {
                            EmpresaSearchType.CODIGO -> KeyboardType.Number
                            EmpresaSearchType.CNPJ -> KeyboardType.Number
                            EmpresaSearchType.NOME -> KeyboardType.Text
                        },
                        imeAction = ImeAction.Search,
                    ),
                    keyboardActions = KeyboardActions(
                        onSearch = { onSearchEmpresa() },
                        onDone = { onSearchEmpresa() },
                    ),
                    singleLine = true,
                    shape = MaterialTheme.shapes.small,
                )

                VendaButton(
                    label = "Buscar empresa",
                    onClick = onSearchEmpresa,
                    enabled = workspace.empresaSearchValue.isNotBlank(),
                    loading = workspace.operationLoading,
                    leadingIcon = Icons.Rounded.Search,
                    modifier = Modifier.fillMaxWidth(),
                )

                if (workspace.empresaSearchResults.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = "Resultados",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.SemiBold,
                        )
                        workspace.empresaSearchResults.forEach { empresa ->
                            LinkEmpresaResultCard(
                                empresa = empresa,
                                onSelect = { beginEmpresaSelection(empresa) },
                            )
                        }
                    }
                }
            } else {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.medium,
                    color = EmeraldSoft.copy(alpha = 0.72f),
                    border = BorderStroke(1.dp, Emerald.copy(alpha = 0.20f)),
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(
                                text = workspace.selectedEmpresa.nomeFantasia.ifBlank {
                                    workspace.selectedEmpresa.razaoSocial.ifBlank { "Empresa sem nome" }
                                },
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            if (workspace.selectedEmpresa.razaoSocial.isNotBlank()) {
                                Text(
                                    text = workspace.selectedEmpresa.razaoSocial,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                            Text(
                                text = "Codigo ${workspace.selectedEmpresa.id} · ${workspace.selectedEmpresa.cnpj}",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }

                        SelectionField(
                            label = "Adesionista (Opcional)",
                            value = adesionistas.firstOrNull { it.id == workspace.selectedAdesionistaId }
                                ?.let { "${it.name} · Código ${it.externalId.orEmpty()}" }
                                ?: "Selecione um adesionista (opcional)",
                            options = listOf("" to "Nenhum adesionista") +
                                adesionistas.filter { !it.externalId.isNullOrBlank() }
                                    .map { it.id to "${it.name} · Código ${it.externalId}" },
                            enabled = !workspace.operationLoading,
                            onSelected = onSelectedAdesionistaChange,
                        )

                        VendaButton(
                            label = "Gerar link publico",
                            onClick = onGenerateLink,
                            loading = workspace.operationLoading,
                            leadingIcon = Icons.Rounded.Share,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        VendaButton(
                            label = "Alterar empresa",
                            onClick = {
                                authorizationError = null
                                pendingEmpresa = null
                                onClearEmpresa()
                            },
                            leadingIcon = Icons.Rounded.Edit,
                            style = VendaButtonStyle.SECONDARY,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            authorizationError?.let { message ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.small,
                    color = MaterialTheme.colorScheme.errorContainer,
                ) {
                    Text(
                        text = message,
                        modifier = Modifier.padding(12.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            HorizontalDivider()

            Text(
                text = "Links ativos",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )

            if (workspace.links.isNotEmpty()) {
                OutlinedTextField(
                    value = listSearchTerm,
                    onValueChange = {
                        listSearchTerm = it
                        currentPage = 1
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Buscar links") },
                    placeholder = { Text("Empresa, codigo, CNPJ ou vendedor") },
                    leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                    singleLine = true,
                )

                Text(
                    text = if (filteredLinks.isEmpty()) {
                        "Nenhum link encontrado"
                    } else {
                        "Mostrando ${pageStart + 1}-${minOf(pageStart + LINK_PAGE_SIZE, filteredLinks.size)} de ${filteredLinks.size} links · 5 por pagina"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (workspace.links.isEmpty()) {
                VendaEmptyState(
                    title = "Nenhum link criado",
                    message = "Selecione uma empresa e gere um link publico de adesao.",
                )
            } else if (filteredLinks.isEmpty()) {
                VendaEmptyState(
                    title = "Nenhum resultado",
                    message = "Tente buscar por outro codigo, empresa ou vendedor.",
                )
            } else {
                groups.forEach { group ->
                    val groupKey = "${group.codigo}-${group.nome}"
                    val expanded = expandedGroups[groupKey] == true
                    val metrics = aggregateMetrics(group.links, workspace.metricsByLinkId)
                    LinkEmpresaGroupCard(
                        group = group,
                        metrics = metrics,
                        expanded = expanded,
                        loading = workspace.operationLoading,
                        onToggleExpanded = {
                            expandedGroups[groupKey] = !(expandedGroups[groupKey] ?: false)
                        },
                        onShowAssociados = {
                            associadosDialog = AssociadosDialogState(
                                empresaNome = group.nome,
                                associados = metrics.associados,
                            )
                        },
                        onShowQrCode = { qrDialogLink = it },
                        onOpenHistory = onOpenHistory,
                        onRegenerate = onRegenerateLink,
                        onDelete = onDeleteLink,
                    )
                }

                if (totalPages > 1) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Pagina $currentPage de $totalPages",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(
                                onClick = { currentPage = maxOf(1, currentPage - 1) },
                                enabled = currentPage > 1,
                            ) { Text("Anterior") }
                            TextButton(
                                onClick = { currentPage = minOf(totalPages, currentPage + 1) },
                                enabled = currentPage < totalPages,
                            ) { Text("Proxima") }
                        }
                    }
                }
            }
        }
    }

    pendingEmpresa?.let { empresa ->
        if (showObservacoesModal) {
            AlertDialog(
                onDismissRequest = {
                    showObservacoesModal = false
                    showAuthorizationModal = true
                },
                title = { Text("Observacoes da Empresa") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = empresa.nomeFantasia.ifBlank { empresa.razaoSocial },
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(empresa.observacoesResolvidas.orEmpty())
                    }
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            showObservacoesModal = false
                            showAuthorizationModal = true
                        },
                    ) { Text("Entendi") }
                },
            )
        }

        if (showAuthorizationModal) {
            AlertDialog(
                onDismissRequest = {},
                title = { Text("A empresa requer autorização?") },
                text = {
                    Text(
                        "Empresa ${empresa.id} - ${empresa.nomeFantasia.ifBlank { empresa.razaoSocial }}",
                    )
                },
                dismissButton = {
                    TextButton(
                        onClick = {
                            showAuthorizationModal = false
                            authorizationError = "O QR Code não tem permissão ser gerado"
                            pendingEmpresa = null
                        },
                    ) { Text("Sim") }
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            showAuthorizationModal = false
                            authorizationError = null
                            pendingEmpresa = null
                            onSelectEmpresa(empresa)
                        },
                    ) { Text("Não") }
                },
            )
        }
    }

    invalidCompanyName?.let { empresaNome ->
        AlertDialog(
            onDismissRequest = { invalidCompanyName = null },
            title = { Text("Empresa bloqueada") },
            text = { Text("A empresa $empresaNome esta com situacao bloqueada para novos cadastros.") },
            confirmButton = {
                TextButton(onClick = { invalidCompanyName = null }) { Text("Buscar outra") }
            },
        )
    }

    qrDialogLink?.let { link ->
        LinkQrCodeDialog(
            context = context,
            link = link,
            onDismiss = { qrDialogLink = null },
        )
    }

    associadosDialog?.let { dialog ->
        AssociadosLinkDialog(
            state = dialog,
            onDismiss = { associadosDialog = null },
        )
    }

    workspace.historyLinkId?.let { linkId ->
        workspace.links.firstOrNull { it.id == linkId }?.let { link ->
            LinkHistoryDialog(
                context = context,
                link = link,
                summary = workspace.historySummary,
                rows = workspace.historyRows,
                loading = workspace.historyLoading,
                error = workspace.historyError,
                onDismiss = onCloseHistory,
            )
        }
    }
}

@Composable
private fun LinkSearchTypeRow(
    selected: EmpresaSearchType,
    onSelected: (EmpresaSearchType) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        LinkSearchTypePill(
            modifier = Modifier.weight(1f),
            label = "Codigo",
            selected = selected == EmpresaSearchType.CODIGO,
            onClick = { onSelected(EmpresaSearchType.CODIGO) },
        )
        LinkSearchTypePill(
            modifier = Modifier.weight(1f),
            label = "CNPJ",
            selected = selected == EmpresaSearchType.CNPJ,
            onClick = { onSelected(EmpresaSearchType.CNPJ) },
        )
        LinkSearchTypePill(
            modifier = Modifier.weight(1f),
            label = "Nome",
            selected = selected == EmpresaSearchType.NOME,
            onClick = { onSelected(EmpresaSearchType.NOME) },
        )
    }
}

@Composable
private fun LinkSearchTypePill(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = if (selected) EmeraldSoft else MaterialTheme.colorScheme.surface,
        border = BorderStroke(
            1.dp,
            if (selected) Emerald.copy(alpha = 0.28f) else MaterialTheme.colorScheme.outline,
        ),
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            color = if (selected) EmeraldDark else MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
        )
    }
}

@Composable
private fun LinkEmpresaResultCard(
    empresa: EmpresaResumo,
    onSelect: () -> Unit,
) {
    Surface(
        onClick = onSelect,
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = empresa.nomeFantasia.ifBlank { empresa.razaoSocial.ifBlank { "Empresa sem nome" } },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            if (empresa.razaoSocial.isNotBlank()) {
                Text(
                    text = empresa.razaoSocial,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Text(
                text = "Codigo ${empresa.id} · ${empresa.cnpj}",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun LinkEmpresaGroupCard(
    group: LinkEmpresaGroup,
    metrics: CadastroLinkMetrics,
    expanded: Boolean,
    loading: Boolean,
    onToggleExpanded: () -> Unit,
    onShowAssociados: () -> Unit,
    onShowQrCode: (CadastroLinkItem) -> Unit,
    onOpenHistory: (String) -> Unit,
    onRegenerate: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    val clicks = group.links.sumOf { it.clickCount ?: 0 }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column {
            Surface(
                onClick = onToggleExpanded,
                color = MaterialTheme.colorScheme.surface,
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = group.nome,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = "Codigo ${group.codigo}${group.cnpj?.takeIf { it.isNotBlank() }?.let { " · $it" }.orEmpty()}",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        Icon(
                            imageVector = if (expanded) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore,
                            contentDescription = if (expanded) "Recolher empresa" else "Expandir empresa",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        LinkMetricBox(
                            label = "Cliques",
                            value = clicks,
                            modifier = Modifier.weight(1f),
                        )
                        LinkMetricBox(
                            label = "Associados",
                            value = metrics.associadosCount,
                            modifier = Modifier.weight(1f),
                            onClick = onShowAssociados,
                        )
                        LinkMetricBox(
                            label = "Dependentes",
                            value = metrics.dependentesCount,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            if (expanded) {
                HorizontalDivider()
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    group.links.forEach { link ->
                        LinkListItem(
                            link = link,
                            loading = loading,
                            onShowQrCode = { onShowQrCode(link) },
                            onOpenHistory = { onOpenHistory(link.id) },
                            onRegenerate = { onRegenerate(link.id) },
                            onDelete = { onDelete(link.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LinkMetricBox(
    label: String,
    value: Int,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
) {
    val content: @Composable () -> Unit = {
        Column(
            modifier = Modifier.padding(horizontal = 5.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
            Text(
                text = value.toString(),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
        }
    }

    if (onClick != null) {
        Surface(
            onClick = onClick,
            modifier = modifier,
            shape = MaterialTheme.shapes.small,
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) { content() }
    } else {
        Surface(
            modifier = modifier,
            shape = MaterialTheme.shapes.small,
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) { content() }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LinkListItem(
    link: CadastroLinkItem,
    loading: Boolean,
    onShowQrCode: () -> Unit,
    onOpenHistory: () -> Unit,
    onRegenerate: () -> Unit,
    onDelete: () -> Unit,
) {
    val context = LocalContext.current
    val linkUrl = link.linkUrl.orEmpty().trim()

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Vendedor: ${link.vendedorNome ?: "-"}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (!link.adesionistaId.isNullOrBlank()) {
                        Text(
                            text = "Adesionista: ${link.adesionistaNome?.takeIf { it.isNotBlank() } ?: "Não identificado"}" +
                                link.adesionistaCodigo?.takeIf { it.isNotBlank() }?.let { " (Código $it)" }.orEmpty(),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    Text(
                        text = "Código ${link.vendedorCodigo ?: "-"} · ${link.clickCount ?: 0} cliques · ${formatDateTime(link.createdAt)}",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Surface(
                    shape = MaterialTheme.shapes.extraSmall,
                    color = EmeraldSoft,
                ) {
                    Text(
                        text = "Ativo",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        color = EmeraldDark,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.extraSmall,
                color = MaterialTheme.colorScheme.surface,
            ) {
                Text(
                    text = linkUrl.ifBlank { "Link indisponivel" },
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                LinkActionChip(
                    icon = Icons.Rounded.History,
                    label = "Historico",
                    enabled = !loading,
                    onClick = onOpenHistory,
                )
                LinkActionChip(
                    icon = Icons.Rounded.ContentCopy,
                    label = "Copiar",
                    enabled = linkUrl.isNotBlank(),
                    onClick = {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newPlainText("cadastro-link", linkUrl))
                        Toast.makeText(context, "Link copiado.", Toast.LENGTH_SHORT).show()
                    },
                )
                LinkActionChip(
                    icon = Icons.AutoMirrored.Rounded.OpenInNew,
                    label = "Abrir",
                    enabled = linkUrl.isNotBlank(),
                    onClick = {
                        if (linkUrl.isNotBlank()) {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(linkUrl)))
                        }
                    },
                )
                LinkActionChip(
                    icon = Icons.Rounded.QrCode,
                    label = "QR Code",
                    enabled = linkUrl.isNotBlank(),
                    onClick = onShowQrCode,
                )
                LinkActionChip(
                    icon = Icons.Rounded.Refresh,
                    label = "Regerar",
                    enabled = !loading,
                    onClick = onRegenerate,
                )
                LinkActionChip(
                    icon = Icons.Rounded.Delete,
                    label = "Excluir",
                    enabled = !loading,
                    danger = true,
                    onClick = onDelete,
                )
            }
        }
    }
}

@Composable
private fun LinkActionChip(
    icon: ImageVector,
    label: String,
    enabled: Boolean = true,
    danger: Boolean = false,
    onClick: () -> Unit,
) {
    val contentColor = when {
        !enabled -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f)
        danger -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.primary
    }
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = MaterialTheme.shapes.small,
        color = if (danger) {
            MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.55f)
        } else {
            MaterialTheme.colorScheme.surface
        },
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, tint = contentColor, modifier = Modifier.size(16.dp))
            Text(
                label,
                color = contentColor,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun AssociadosLinkDialog(
    state: AssociadosDialogState,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Associados Cadastrados") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = state.empresaNome,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (state.associados.isEmpty()) {
                    Text("Nenhum associado concluido para esta empresa ainda.")
                } else {
                    LazyColumn(
                        modifier = Modifier.heightIn(max = 380.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(state.associados) { associado ->
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = MaterialTheme.shapes.small,
                                color = MaterialTheme.colorScheme.surfaceVariant,
                            ) {
                                Column(
                                    modifier = Modifier.padding(10.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text(associado.nome, fontWeight = FontWeight.SemiBold)
                                    Text(
                                        text = if (associado.dependentes.isEmpty()) {
                                            "Nenhum dependente cadastrado."
                                        } else {
                                            "Dependentes: ${associado.dependentes.joinToString(", ")}"
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Fechar") }
        },
    )
}

@Composable
private fun LinkHistoryDialog(
    context: Context,
    link: CadastroLinkItem,
    summary: CadastroLinkHistorySummary?,
    rows: List<CadastroLinkHistoryRow>,
    loading: Boolean,
    error: String?,
    onDismiss: () -> Unit,
) {
    var currentPage by remember(link.id) { mutableIntStateOf(1) }
    val totalPages = maxOf(1, ceil(rows.size / HISTORY_PAGE_SIZE.toDouble()).toInt())
    LaunchedEffect(rows.size, totalPages) {
        if (currentPage > totalPages) currentPage = totalPages
    }
    val pageStart = (currentPage - 1) * HISTORY_PAGE_SIZE
    val pagedRows = rows.drop(pageStart).take(HISTORY_PAGE_SIZE)

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 720.dp),
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Historico do link",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "${link.empresaNome} · Codigo ${link.empresaCodigo}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = "Vendedor: ${link.vendedorNome ?: "-"} (Código ${link.vendedorCodigo ?: "-"})",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (!link.adesionistaId.isNullOrBlank()) {
                            Text(
                                text = "Adesionista: ${link.adesionistaNome?.takeIf { it.isNotBlank() } ?: "Não identificado"}" +
                                    link.adesionistaCodigo?.takeIf { it.isNotBlank() }?.let { " (Código $it)" }.orEmpty(),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Rounded.Close, contentDescription = "Fechar historico")
                    }
                }

                summary?.let {
                    HorizontalDivider()
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            HistorySummaryBox("Cliques", it.clickCount.toString(), Modifier.weight(1f))
                            HistorySummaryBox("Identificados", it.identifiedAttempts.toString(), Modifier.weight(1f))
                            HistorySummaryBox("So abriu", it.anonymousDetailed.toString(), Modifier.weight(1f))
                        }
                        Text(
                            text = "Ultimo clique: ${it.lastClickedAt?.let(::formatDateTime) ?: "-"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                HorizontalDivider()

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 180.dp, max = 430.dp)
                        .padding(12.dp),
                    contentAlignment = if (loading) Alignment.Center else Alignment.TopStart,
                ) {
                    when {
                        loading -> CircularProgressIndicator()
                        !error.isNullOrBlank() -> Text(
                            text = error,
                            color = MaterialTheme.colorScheme.error,
                        )
                        rows.isEmpty() -> Text(
                            "Nenhum registro de tentativa encontrado para este link ainda.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        else -> LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            items(pagedRows, key = { it.id }) { row ->
                                LinkHistoryRowCard(row)
                            }
                        }
                    }
                }

                if (!loading && error.isNullOrBlank() && rows.isNotEmpty()) {
                    HorizontalDivider()
                    Column(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = "Mostrando ${pageStart + 1}-${minOf(pageStart + HISTORY_PAGE_SIZE, rows.size)} de ${rows.size} registros · 10 por pagina",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            TextButton(
                                onClick = { currentPage = maxOf(1, currentPage - 1) },
                                enabled = currentPage > 1,
                            ) { Text("Anterior") }
                            Text(
                                "$currentPage de $totalPages",
                                style = MaterialTheme.typography.labelMedium,
                            )
                            TextButton(
                                onClick = { currentPage = minOf(totalPages, currentPage + 1) },
                                enabled = currentPage < totalPages,
                            ) { Text("Proxima") }
                        }
                    }
                }

                HorizontalDivider()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(10.dp),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(
                        onClick = {
                            val uri = LinkHistoryXlsxExporter.exportToDownloads(context, link, rows)
                            Toast.makeText(
                                context,
                                if (uri != null) "Historico XLSX salvo com sucesso." else "Nao foi possivel exportar o historico.",
                                Toast.LENGTH_SHORT,
                            ).show()
                        },
                        enabled = !loading && rows.isNotEmpty(),
                    ) {
                        Icon(
                            Icons.Rounded.FileDownload,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Text(" Exportar XLSX")
                    }
                }
            }
        }
    }
}

@Composable
private fun HistorySummaryBox(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Column(
            modifier = Modifier.padding(7.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
            Text(value, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun LinkHistoryRowCard(row: CadastroLinkHistoryRow) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = formatDateTime(row.timestamp),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Surface(
                    shape = MaterialTheme.shapes.extraSmall,
                    color = historyStatusColor(row.status),
                ) {
                    Text(
                        text = row.status,
                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 2,
                    )
                }
            }
            Text(
                text = row.nomeRf ?: "Acesso sem identificacao",
                fontWeight = FontWeight.SemiBold,
            )
            if (!row.telefone.isNullOrBlank()) {
                Text(
                    "Telefone: ${formatPhone(row.telefone)}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (row.dependentes.isNotEmpty()) {
                Text(
                    "Dependentes: ${row.dependentes.joinToString(", ")}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun historyStatusColor(status: String) = when (status) {
    "Concluiu a adesão" -> EmeraldSoft
    "Chegou ao contrato e não concluiu" -> MaterialTheme.colorScheme.tertiaryContainer
    "Validou CPF/data e abandonou depois" -> MaterialTheme.colorScheme.secondaryContainer
    else -> MaterialTheme.colorScheme.surface
}

@Composable
private fun LinkQrCodeDialog(
    context: Context,
    link: CadastroLinkItem,
    onDismiss: () -> Unit,
) {
    val linkUrl = link.linkUrl.orEmpty().trim()
    val qrBitmap = remember(linkUrl) {
        if (linkUrl.isBlank()) null else runCatching { generateQrCodeBitmap(linkUrl, 1024) }.getOrNull()
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("QR Code") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = link.empresaNome,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                if (qrBitmap != null) {
                    Image(
                        bitmap = qrBitmap.asImageBitmap(),
                        contentDescription = "QR Code do link",
                        modifier = Modifier.size(240.dp).padding(2.dp),
                    )
                } else {
                    Text(
                        text = "Nao foi possivel gerar o QR Code para este link.",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Surface(
                    shape = MaterialTheme.shapes.extraSmall,
                    color = MaterialTheme.colorScheme.surfaceVariant,
                ) {
                    Text(
                        text = linkUrl.ifBlank { "-" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                    )
                }
            }
        },
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconButton(
                    onClick = {
                        val bitmap = qrBitmap ?: run {
                            Toast.makeText(context, "QR Code indisponivel para compartilhar.", Toast.LENGTH_SHORT).show()
                            return@IconButton
                        }
                        val uri = saveQrToCacheForShare(context, bitmap, "qrcode_${link.id}.png")
                        if (uri == null) {
                            Toast.makeText(context, "Falha ao preparar compartilhamento.", Toast.LENGTH_SHORT).show()
                            return@IconButton
                        }
                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "image/png"
                            putExtra(Intent.EXTRA_STREAM, uri)
                            putExtra(Intent.EXTRA_TEXT, linkUrl)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        context.startActivity(Intent.createChooser(shareIntent, "Compartilhar QR Code"))
                    },
                    enabled = qrBitmap != null && linkUrl.isNotBlank(),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Share,
                        contentDescription = "Compartilhar QR Code",
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
                IconButton(
                    onClick = {
                        val bitmap = qrBitmap ?: run {
                            Toast.makeText(context, "QR Code indisponivel para download.", Toast.LENGTH_SHORT).show()
                            return@IconButton
                        }
                        val uri = saveQrToDownloads(context, bitmap, "qrcode_${link.id}.png")
                        if (uri == null) {
                            Toast.makeText(context, "Falha ao salvar QR Code.", Toast.LENGTH_SHORT).show()
                        } else {
                            Toast.makeText(context, "QR Code salvo com sucesso.", Toast.LENGTH_SHORT).show()
                        }
                    },
                    enabled = qrBitmap != null,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.FileDownload,
                        contentDescription = "Baixar QR Code",
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        },
        dismissButton = {
            IconButton(onClick = onDismiss) {
                Icon(
                    imageVector = Icons.Rounded.Close,
                    contentDescription = "Fechar",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
    )
}

private fun groupLinksByEmpresa(items: List<CadastroLinkItem>): List<LinkEmpresaGroup> {
    return items
        .groupBy { "${it.empresaCodigo}-${it.empresaNome}" }
        .values
        .map { links ->
            val first = links.first()
            LinkEmpresaGroup(
                codigo = first.empresaCodigo,
                nome = first.empresaNome,
                cnpj = first.empresaCnpj,
                links = links,
            )
        }
        .sortedBy { normalizeSearch(it.nome) }
}

private fun aggregateMetrics(
    links: List<CadastroLinkItem>,
    metricsByLinkId: Map<String, CadastroLinkMetrics>,
): CadastroLinkMetrics {
    val associados = links.flatMap { metricsByLinkId[it.id]?.associados.orEmpty() }
    return CadastroLinkMetrics(
        associadosCount = links.sumOf { metricsByLinkId[it.id]?.associadosCount ?: 0 },
        dependentesCount = links.sumOf { metricsByLinkId[it.id]?.dependentesCount ?: 0 },
        associados = associados,
    )
}

private fun normalizeSearch(value: String): String = Normalizer
    .normalize(value, Normalizer.Form.NFD)
    .replace(Regex("\\p{M}+"), "")
    .lowercase(Locale.ROOT)
    .trim()

private fun formatPhone(value: String?): String {
    val digits = value.orEmpty().filter(Char::isDigit)
    return when (digits.length) {
        11 -> "(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}"
        10 -> "(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}"
        else -> value.orEmpty()
    }
}

private fun generateQrCodeBitmap(content: String, size: Int): Bitmap {
    val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    for (x in 0 until size) {
        for (y in 0 until size) {
            bitmap.setPixel(x, y, if (matrix[x, y]) AndroidColor.BLACK else AndroidColor.WHITE)
        }
    }
    return bitmap
}

private fun saveQrToCacheForShare(context: Context, bitmap: Bitmap, fileName: String): Uri? {
    return runCatching {
        val dir = File(context.cacheDir, "shared_qrcodes").apply { mkdirs() }
        val file = File(dir, fileName)
        FileOutputStream(file).use { stream ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
            stream.flush()
        }
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    }.getOrNull()
}

private fun saveQrToDownloads(context: Context, bitmap: Bitmap, fileName: String): Uri? {
    return runCatching {
        val resolver = context.contentResolver
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                put(MediaStore.Downloads.MIME_TYPE, "image/png")
                put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/VendaMais")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: return@runCatching null
            resolver.openOutputStream(uri)?.use { stream ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
                stream.flush()
            } ?: return@runCatching null
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            uri
        } else {
            val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
            val file = File(dir, fileName)
            FileOutputStream(file).use { stream ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
                stream.flush()
            }
            Uri.fromFile(file)
        }
    }.getOrNull()
}

private fun formatDateTime(value: String): String {
    return runCatching {
        OffsetDateTime.parse(value).format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
    }.getOrDefault(value)
}
