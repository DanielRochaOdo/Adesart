package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material.icons.rounded.Business
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.FileDownload
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.TrendingUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.data.models.DashboardCadastro
import br.com.vendamais.mobile.data.models.PlanoMap
import br.com.vendamais.mobile.ui.AppUiState
import br.com.vendamais.mobile.ui.DashboardMetricType
import br.com.vendamais.mobile.ui.components.ScreenHeading
import br.com.vendamais.mobile.ui.components.VendaButton
import br.com.vendamais.mobile.ui.components.VendaButtonStyle
import br.com.vendamais.mobile.ui.components.VendaEmptyState
import br.com.vendamais.mobile.ui.components.VendaLoadingState
import br.com.vendamais.mobile.ui.components.WebCard
import br.com.vendamais.mobile.ui.theme.Amber100
import br.com.vendamais.mobile.ui.theme.Amber500
import br.com.vendamais.mobile.ui.theme.Blue100
import br.com.vendamais.mobile.ui.theme.Blue500
import br.com.vendamais.mobile.ui.theme.Emerald
import br.com.vendamais.mobile.ui.theme.EmeraldDark
import br.com.vendamais.mobile.ui.theme.EmeraldSoft
import br.com.vendamais.mobile.ui.theme.Red100
import br.com.vendamais.mobile.ui.theme.Red500
import br.com.vendamais.mobile.ui.theme.Slate100
import br.com.vendamais.mobile.ui.theme.Slate500
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.max

private enum class DashboardPeriod(val label: String) {
    DAYS_7("Ultimos 7 dias"),
    DAYS_30("Ultimos 30 dias"),
    DAYS_90("Ultimos 90 dias"),
    MONTH("Mes atual"),
    CUSTOM("Personalizado"),
}

private data class DashboardRange(
    val start: LocalDate,
    val endExclusive: LocalDate,
    val previousStart: LocalDate,
)

private data class DashboardNumbers(
    val titulares: Int = 0,
    val dependentes: Int = 0,
    val enviados: Int = 0,
    val pendentes: Int = 0,
    val dependentesIncluidos: Int = 0,
    val vidas: Int = 0,
)

private data class DashboardGroup(
    val key: String,
    val name: String,
    val total: Int,
    val enviados: Int,
    val pendentes: Int,
)

private data class DashboardIndicator(
    val label: String,
    val current: Int,
    val previous: Int,
    val icon: ImageVector,
    val container: Color,
    val content: Color,
    val detail: String? = null,
)

@Composable
fun DashboardScreen(
    state: AppUiState,
    onOpenDrilldown: (String, DashboardMetricType) -> Unit,
    onCloseDrilldown: () -> Unit,
    onLoadRange: (String, String) -> Unit,
    onRefreshRange: (String, String) -> Unit,
) {
    val context = LocalContext.current
    var period by rememberSaveable { mutableStateOf(DashboardPeriod.MONTH) }
    var customStart by rememberSaveable {
        mutableStateOf(LocalDate.now().withDayOfMonth(1).toString())
    }
    var customEnd by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var teamFilter by rememberSaveable { mutableStateOf("todos") }
    var companyFilter by rememberSaveable { mutableStateOf("todos") }
    var sellerFilter by rememberSaveable { mutableStateOf("todos") }
    var adesionistaFilter by rememberSaveable { mutableStateOf("todos") }
    var channelFilter by rememberSaveable { mutableStateOf("todos") }
    var statusFilter by rememberSaveable { mutableStateOf("todos") }
    var search by rememberSaveable { mutableStateOf("") }
    var exportMessage by rememberSaveable { mutableStateOf<String?>(null) }

    val range = dashboardRange(period, customStart, customEnd)
    val zoneId = ZoneId.systemDefault()
    val rangeStartIso = range?.previousStart?.atStartOfDay(zoneId)?.toInstant()?.toString()
    val rangeEndIso = range?.endExclusive?.atStartOfDay(zoneId)?.toInstant()?.toString()

    LaunchedEffect(rangeStartIso, rangeEndIso) {
        if (rangeStartIso != null && rangeEndIso != null) {
            onLoadRange(rangeStartIso, rangeEndIso)
        }
    }

    val currentUnfiltered = if (range == null) {
        emptyList()
    } else {
        state.dashboardCadastros.filter { val date = it.dashboardDate(); date >= range.start && date < range.endExclusive }
    }

    val profileRole = state.profile?.role.orEmpty()
    val isManagerial = profileRole in setOf("ADMINISTRADOR", "GERENTE")
    val supervisorTeamId = state.profile?.teamId?.takeIf { profileRole == "SUPERVISOR" }
    val teamNames = state.adminTeams.associate { it.id to it.name }

    fun facetRecords(ignore: String): List<DashboardCadastro> =
        currentUnfiltered.filter { cadastro ->
            dashboardMatchesFilters(
                cadastro = cadastro,
                team = teamFilter,
                company = companyFilter,
                seller = sellerFilter,
                adesionista = adesionistaFilter,
                channel = channelFilter,
                status = statusFilter,
                search = search,
                planos = state.planosMap,
                ignore = ignore,
            )
        }

    val teamOptions = facetRecords("team")
        .mapNotNull { cadastro ->
            cadastro.teamId?.takeIf { it.isNotBlank() }?.let { id ->
                id to (teamNames[id] ?: "Equipe")
            }
        }
        .distinctBy { it.first }
        .sortedBy { it.second.lowercase(Locale.ROOT) }
    val companyOptions = facetRecords("company")
        .map { dashboardCompanyKey(it) to dashboardCompanyLabel(it) }
        .distinctBy { it.first }
        .sortedBy { it.second.lowercase(Locale.ROOT) }
    val sellerOptions = facetRecords("seller")
        .map { dashboardSellerKey(it) to (it.vendedorNome ?: "Sem vendedor") }
        .distinctBy { it.first }
        .sortedBy { it.second.lowercase(Locale.ROOT) }
    val adesionistaOptions = facetRecords("adesionista")
        .mapNotNull {
            val key = dashboardAdesionistaKey(it)
            if (key == "sem-adesionista") null else key to (it.adesionistaNome ?: "Sem adesionista")
        }
        .distinctBy { it.first }
        .sortedBy { it.second.lowercase(Locale.ROOT) }
    val channelOptions = facetRecords("channel")
        .map { dashboardChannelKey(it) }
        .distinct()
        .sorted()
        .map { key -> key to if (key == "publico") "Link / QR Code" else "Interno" }
    val statusOptions = facetRecords("status")
        .map { it.status }
        .distinct()
        .map { it to dashboardStatusLabel(it) }
        .sortedBy { it.second.lowercase(Locale.ROOT) }

    fun applyFacetFilter(facet: String, value: String) {
        var nextTeam = if (facet == "team") value else teamFilter
        var nextCompany = if (facet == "company") value else companyFilter
        var nextSeller = if (facet == "seller") value else sellerFilter
        var nextAdesionista = if (facet == "adesionista") value else adesionistaFilter
        var nextChannel = if (facet == "channel") value else channelFilter
        var nextStatus = if (facet == "status") value else statusFilter

        fun hasMatch(): Boolean = currentUnfiltered.any { cadastro ->
            dashboardMatchesFilters(
                cadastro = cadastro,
                team = nextTeam,
                company = nextCompany,
                seller = nextSeller,
                adesionista = nextAdesionista,
                channel = nextChannel,
                status = nextStatus,
                search = search,
                planos = state.planosMap,
            )
        }

        val otherFacets = listOf("team", "company", "seller", "adesionista", "channel", "status")
        otherFacets.forEach { other ->
            if (other == facet) return@forEach
            when (other) {
                "team" -> if (nextTeam != "todos" && !hasMatch()) nextTeam = "todos"
                "company" -> if (nextCompany != "todos" && !hasMatch()) nextCompany = "todos"
                "seller" -> if (nextSeller != "todos" && !hasMatch()) nextSeller = "todos"
                "adesionista" -> if (nextAdesionista != "todos" && !hasMatch()) nextAdesionista = "todos"
                "channel" -> if (nextChannel != "todos" && !hasMatch()) nextChannel = "todos"
                "status" -> if (nextStatus != "todos" && !hasMatch()) nextStatus = "todos"
            }
        }

        teamFilter = nextTeam
        companyFilter = nextCompany
        sellerFilter = nextSeller
        adesionistaFilter = nextAdesionista
        channelFilter = nextChannel
        statusFilter = nextStatus
    }

    val filteredWindow = if (range == null) {
        emptyList()
    } else {
        state.dashboardCadastros.filter { cadastro ->
            val date = cadastro.dashboardDate()
            date >= range.previousStart &&
                date < range.endExclusive &&
                dashboardMatchesFilters(
                    cadastro = cadastro,
                    team = teamFilter,
                    company = companyFilter,
                    seller = sellerFilter,
                    adesionista = adesionistaFilter,
                    channel = channelFilter,
                    status = statusFilter,
                    search = search,
                    planos = state.planosMap,
                )
        }
    }
    val currentRecords = if (range == null) emptyList() else filteredWindow.filter {
        val date = it.dashboardDate()
        date >= range.start && date < range.endExclusive
    }
    val previousRecords = if (range == null) emptyList() else filteredWindow.filter {
        val date = it.dashboardDate()
        date >= range.previousStart && date < range.start
    }

    val current = calculateDashboard(currentRecords)
    val previous = calculateDashboard(previousRecords)
    val currentCadastros = currentRecords.filter { it.tipoCadastro == "cadastro" }
    val sellerGroups = dashboardGroups(currentCadastros, ::dashboardSellerKey) {
        it.vendedorNome ?: it.vendedorCodigo?.let { code -> "Codigo $code" } ?: "Sem vendedor"
    }
    val adesionistaGroups = dashboardGroups(currentCadastros, ::dashboardAdesionistaKey) {
        it.adesionistaNome ?: "Sem adesionista"
    }.filter { it.key != "sem-adesionista" }
    val companyGroups = dashboardGroups(currentCadastros, ::dashboardCompanyKey) {
        dashboardCompanyLabel(it)
    }
    val planRanking = dashboardPlanRanking(currentRecords, state.planosMap)
    val statusCounts = listOf(
        "Enviado ao ERP" to currentCadastros.count { it.status == "enviado" },
        "Incompleto" to currentCadastros.count { it.status == "incompleto" },
        "Adesoes pendentes" to currentCadastros.count { it.status == "adesoes_pendentes" },
        "Erro de envio" to currentCadastros.count { it.status == "erro_envio" },
    )
    val evolution = currentCadastros
        .groupBy { it.dashboardDate() }
        .toSortedMap()
        .map { (date, items) -> date.toString() to items.size }
    val internalCount = currentCadastros.count { dashboardChannelKey(it) == "interno" }
    val publicCount = currentCadastros.count { dashboardChannelKey(it) == "publico" }

    val indicators = listOf(
        DashboardIndicator("Cadastros iniciados", current.titulares, previous.titulares, Icons.Rounded.Description, Blue100, Blue500),
        DashboardIndicator("Enviados ao ERP", current.enviados, previous.enviados, Icons.Rounded.CheckCircle, EmeraldSoft, EmeraldDark, "Envio registrado no Adesart."),
        DashboardIndicator("Titulares", current.titulares, previous.titulares, Icons.Rounded.Person, Blue100, Blue500),
        DashboardIndicator("Dependentes", current.dependentes, previous.dependentes, Icons.Rounded.Groups, Slate100, Slate500, "Dependentes dos novos cadastros."),
        DashboardIndicator("Dependentes incluidos", current.dependentesIncluidos, previous.dependentesIncluidos, Icons.Rounded.PersonAdd, Slate100, Slate500),
        DashboardIndicator("Total de vidas", current.vidas, previous.vidas, Icons.Rounded.TrendingUp, EmeraldSoft, EmeraldDark),
        DashboardIndicator("Pendencias", current.pendentes, previous.pendentes, Icons.Rounded.WarningAmber, Amber100, Amber500),
    )

    LazyColumn(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            ScreenHeading(
                eyebrow = "ADESART · VISAO GERENCIAL",
                title = "Dashboard Gerencial",
                subtitle = "Producao comercial, indicadores e acompanhamento dos cadastros.",
            )
        }

        item {
            WebCard(title = "Periodo e acoes") {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SelectionField(
                        label = "Periodo",
                        value = period.label,
                        options = DashboardPeriod.entries.map { it to it.label },
                        onSelected = { period = it },
                    )
                    if (period == DashboardPeriod.CUSTOM) {
                        OutlinedTextField(
                            value = customStart,
                            onValueChange = { customStart = it },
                            label = { Text("Inicio (YYYY-MM-DD)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = customEnd,
                            onValueChange = { customEnd = it },
                            label = { Text("Fim (YYYY-MM-DD)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    if (range == null) {
                        Text(
                            "Periodo invalido. Use datas validas, com no maximo 366 dias e sem datas futuras.",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        VendaButton(
                            label = "Atualizar",
                            leadingIcon = Icons.Rounded.Refresh,
                            onClick = {
                                if (rangeStartIso != null && rangeEndIso != null) {
                                    onRefreshRange(rangeStartIso, rangeEndIso)
                                }
                            },
                            style = VendaButtonStyle.SECONDARY,
                            modifier = Modifier.weight(1f),
                        )
                        VendaButton(
                            label = "Exportar CSV",
                            leadingIcon = Icons.Rounded.FileDownload,
                            onClick = {
                                val uri = DashboardCsvExporter.exportToDownloads(context, currentRecords)
                                exportMessage = if (uri != null) {
                                    "CSV salvo em Downloads/VendaMais."
                                } else {
                                    "Nao foi possivel gerar o CSV."
                                }
                            },
                            enabled = currentRecords.isNotEmpty(),
                            modifier = Modifier.weight(1f),
                        )
                    }
                    exportMessage?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        item {
            WebCard(title = "Filtros") {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (isManagerial) {
                        SelectionField(
                            "Equipe",
                            dashboardSelectedLabel(teamFilter, teamOptions, "Todas as equipes"),
                            listOf("todos" to "Todas as equipes") + teamOptions,
                            onSelected = { applyFacetFilter("team", it) },
                        )
                    } else {
                        DashboardReadOnlyFilter(
                            label = "Equipe",
                            value = supervisorTeamId
                                ?.let { teamNames[it] ?: "Minha equipe" }
                                ?: "Escopo do meu perfil",
                        )
                    }
                    SelectionField(
                        "Empresa",
                        dashboardSelectedLabel(companyFilter, companyOptions, "Todas as empresas"),
                        listOf("todos" to "Todas as empresas") + companyOptions,
                        onSelected = { applyFacetFilter("company", it) },
                    )
                    SelectionField(
                        "Vendedor",
                        dashboardSelectedLabel(sellerFilter, sellerOptions, "Todos os vendedores"),
                        listOf("todos" to "Todos os vendedores") + sellerOptions,
                        onSelected = { applyFacetFilter("seller", it) },
                    )
                    SelectionField(
                        "Adesionista",
                        dashboardSelectedLabel(adesionistaFilter, adesionistaOptions, "Todos os adesionistas"),
                        listOf("todos" to "Todos os adesionistas") + adesionistaOptions,
                        onSelected = { applyFacetFilter("adesionista", it) },
                    )
                    SelectionField(
                        "Canal",
                        when (channelFilter) {
                            "interno" -> "Interno"
                            "publico" -> "Link / QR Code"
                            else -> "Todos"
                        },
                        listOf("todos" to "Todos") + channelOptions,
                        onSelected = { applyFacetFilter("channel", it) },
                    )
                    SelectionField(
                        "Situacao",
                        dashboardStatusLabel(statusFilter),
                        listOf("todos" to "Todas") + statusOptions,
                        onSelected = { applyFacetFilter("status", it) },
                    )
                    OutlinedTextField(
                        value = search,
                        onValueChange = { search = it },
                        label = { Text("Buscar empresa, plano ou profissional") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedButton(
                        onClick = {
                            teamFilter = "todos"
                            companyFilter = "todos"
                            sellerFilter = "todos"
                            adesionistaFilter = "todos"
                            channelFilter = "todos"
                            statusFilter = "todos"
                            search = ""
                        },
                        enabled =
                            teamFilter != "todos" ||
                                companyFilter != "todos" ||
                                sellerFilter != "todos" ||
                                adesionistaFilter != "todos" ||
                                channelFilter != "todos" ||
                                statusFilter != "todos" ||
                                search.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Limpar filtros")
                    }
                }
            }
        }

        if (state.dashboardLoading) {
            item {
                VendaLoadingState(
                    title = "Carregando indicadores",
                    message = "Consultando a mesma fonte canônica utilizada pelo Web.",
                )
            }
        } else if (state.dashboardError != null) {
            item {
                WebCard(title = "Não foi possível carregar os dados") {
                    Text(
                        text = state.dashboardError,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        } else if (range != null && currentRecords.isEmpty()) {
            item {
                VendaEmptyState(
                    title = "Nenhum registro no periodo",
                    message = "Ajuste o periodo ou os filtros para consultar outros dados.",
                )
            }
        } else if (range != null) {
            item {
                IndicatorGrid(indicators)
            }

            item {
                WebCard(title = "Evolucao de cadastros no periodo") {
                    DashboardBars(
                        entries = evolution.takeLast(31),
                        emptyMessage = "Sem cadastros para montar a evolucao.",
                    )
                }
            }

            item {
                WebCard(title = "Distribuicao dos cadastros por status") {
                    DashboardDistribution(statusCounts)
                }
            }

            item {
                WebCard(title = "Producao por vendedor") {
                    DashboardGroupList(sellerGroups, showRate = true)
                }
            }

            item {
                WebCard(title = "Producao por adesionista") {
                    DashboardGroupList(adesionistaGroups, showRate = false)
                }
            }

            item {
                WebCard(title = "Producao por empresa") {
                    DashboardGroupList(companyGroups, showRate = false)
                }
            }

            item {
                WebCard(title = "Ranking de planos") {
                    if (planRanking.isEmpty()) {
                        Text("Sem producao com plano identificado.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        DashboardBars(
                            entries = planRanking.take(15).map { it.first to it.second },
                            emptyMessage = "Sem producao com plano identificado.",
                        )
                    }
                }
            }

            item {
                WebCard(title = "Canais de origem") {
                    DashboardDistribution(
                        listOf(
                            "Interno" to internalCount,
                            "Link / QR Code" to publicCount,
                        ),
                    )
                }
            }

            item {
                WebCard(title = "Pendencias operacionais") {
                    DashboardDistribution(
                        statusCounts.filter { it.first != "Enviado ao ERP" },
                    )
                }
            }

            item {
                WebCard(title = "Resumo de performance") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        PerformanceLine(Icons.Rounded.Person, "Vendedor com maior volume", sellerGroups.firstOrNull()?.name, sellerGroups.firstOrNull()?.total)
                        PerformanceLine(Icons.Rounded.Groups, "Adesionista com maior volume", adesionistaGroups.firstOrNull()?.name, adesionistaGroups.firstOrNull()?.total)
                        PerformanceLine(Icons.Rounded.Business, "Empresa com maior volume", companyGroups.firstOrNull()?.name, companyGroups.firstOrNull()?.total)
                        PerformanceLine(Icons.Rounded.Link, "Canal predominante", if (publicCount > internalCount) "Link / QR Code" else "Interno", max(publicCount, internalCount))
                    }
                }
            }
        }
    }

    // Mantidos na assinatura por compatibilidade com o shell atual. O novo Dashboard
    // usa detalhamentos locais respeitando periodo e filtros, como o Web.
    remember(onOpenDrilldown, onCloseDrilldown) { Unit }
}

@Composable
private fun DashboardReadOnlyFilter(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
        ) {
            Text(
                text = value,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 13.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun IndicatorGrid(indicators: List<DashboardIndicator>) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        indicators.chunked(2).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                row.forEach { indicator ->
                    IndicatorCard(indicator, Modifier.weight(1f))
                }
                if (row.size == 1) {
                    Box(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun IndicatorCard(indicator: DashboardIndicator, modifier: Modifier = Modifier) {
    val variation = if (indicator.previous == 0) null
    else (indicator.current - indicator.previous).toDouble() / indicator.previous.toDouble()

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Surface(
                modifier = Modifier.size(32.dp),
                shape = RoundedCornerShape(10.dp),
                color = indicator.container,
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(indicator.icon, contentDescription = null, modifier = Modifier.size(17.dp), tint = indicator.content)
                }
            }
            Text(indicator.label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(indicator.current.toString(), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(
                text = variation?.let {
                    val prefix = if (it > 0) "+" else ""
                    "${prefix}${String.format(Locale("pt", "BR"), "%.1f", it * 100)}% vs. periodo anterior"
                } ?: "Sem base no periodo anterior",
                style = MaterialTheme.typography.labelSmall,
                color = if (variation != null && variation >= 0) Emerald else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            indicator.detail?.let {
                Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun DashboardBars(entries: List<Pair<String, Int>>, emptyMessage: String) {
    if (entries.isEmpty() || entries.all { it.second == 0 }) {
        Text(emptyMessage, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val maxValue = entries.maxOf { it.second }.coerceAtLeast(1)
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        entries.forEach { (label, value) ->
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(label, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(value.toString(), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(7.dp)
                        .background(Slate100, RoundedCornerShape(999.dp)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(value.toFloat() / maxValue.toFloat())
                            .height(7.dp)
                            .background(Emerald, RoundedCornerShape(999.dp)),
                    )
                }
            }
        }
    }
}

@Composable
private fun DashboardDistribution(entries: List<Pair<String, Int>>) {
    val total = entries.sumOf { it.second }
    if (total == 0) {
        Text("Sem registros para esta distribuicao.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        entries.forEach { (label, value) ->
            val percentage = value.toDouble() / total.toDouble()
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(label, style = MaterialTheme.typography.bodySmall)
                Text(
                    "$value · ${String.format(Locale("pt", "BR"), "%.1f", percentage * 100)}%",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun DashboardGroupList(groups: List<DashboardGroup>, showRate: Boolean) {
    if (groups.isEmpty()) {
        Text("Sem dados para este agrupamento.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        groups.take(15).forEach { group ->
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
            ) {
                Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(group.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "Total ${group.total} · Enviados ${group.enviados} · Pendentes ${group.pendentes}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (showRate) {
                        val rate = if (group.total == 0) 0.0 else group.enviados.toDouble() / group.total.toDouble()
                        Text(
                            "Taxa de envio: ${String.format(Locale("pt", "BR"), "%.1f", rate * 100)}%",
                            style = MaterialTheme.typography.labelSmall,
                            color = Emerald,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PerformanceLine(icon: ImageVector, label: String, value: String?, total: Int?) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(modifier = Modifier.size(36.dp), shape = RoundedCornerShape(10.dp), color = EmeraldSoft) {
            Box(contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = Emerald, modifier = Modifier.size(18.dp))
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value ?: "Nao informado", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
        }
        Text((total ?: 0).toString(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    }
}

private fun dashboardRange(period: DashboardPeriod, customStart: String, customEnd: String): DashboardRange? {
    val today = LocalDate.now()
    val start: LocalDate
    val endInclusive: LocalDate
    when (period) {
        DashboardPeriod.DAYS_7 -> {
            start = today.minusDays(6)
            endInclusive = today
        }
        DashboardPeriod.DAYS_30 -> {
            start = today.minusDays(29)
            endInclusive = today
        }
        DashboardPeriod.DAYS_90 -> {
            start = today.minusDays(89)
            endInclusive = today
        }
        DashboardPeriod.MONTH -> {
            start = today.withDayOfMonth(1)
            endInclusive = today
        }
        DashboardPeriod.CUSTOM -> {
            start = runCatching { LocalDate.parse(customStart) }.getOrNull() ?: return null
            endInclusive = runCatching { LocalDate.parse(customEnd) }.getOrNull() ?: return null
        }
    }
    if (endInclusive.isBefore(start) || endInclusive.isAfter(today)) return null
    val endExclusive = endInclusive.plusDays(1)
    val duration = ChronoUnit.DAYS.between(start, endExclusive)
    if (duration <= 0 || duration > 366) return null
    return DashboardRange(
        start = start,
        endExclusive = endExclusive,
        previousStart = start.minusDays(duration),
    )
}

private fun DashboardCadastro.dashboardDate(): LocalDate {
    return runCatching { OffsetDateTime.parse(createdAt).toLocalDate() }
        .getOrElse { LocalDate.MIN }
}

private fun calculateDashboard(records: List<DashboardCadastro>): DashboardNumbers {
    val cadastros = records.filter { it.tipoCadastro == "cadastro" }
    val titulares = cadastros.size
    val dependentes = cadastros.sumOf { (dashboardLives(it) - 1).coerceAtLeast(0) }
    val enviados = cadastros.count { it.status == "enviado" }
    val pendentes = cadastros.count { it.status != "enviado" }
    val dependentesIncluidos = records
        .filter { it.tipoCadastro == "inclusao_dependente" && it.status == "enviado" }
        .sumOf { cadastro -> runCatching { cadastro.dependentes?.jsonArray?.size ?: 0 }.getOrDefault(0) }
    return DashboardNumbers(
        titulares = titulares,
        dependentes = dependentes,
        enviados = enviados,
        pendentes = pendentes,
        dependentesIncluidos = dependentesIncluidos,
        vidas = titulares + dependentes,
    )
}

private fun dashboardLives(cadastro: DashboardCadastro): Int {
    val count = runCatching { cadastro.dependentes?.jsonArray?.size }.getOrNull()
    return max(1, count ?: 1)
}

private fun dashboardGroups(
    records: List<DashboardCadastro>,
    key: (DashboardCadastro) -> String,
    name: (DashboardCadastro) -> String,
): List<DashboardGroup> {
    return records.groupBy(key).map { (groupKey, items) ->
        DashboardGroup(
            key = groupKey,
            name = name(items.first()),
            total = items.size,
            enviados = items.count { it.status == "enviado" },
            pendentes = items.count { it.status != "enviado" },
        )
    }.sortedWith(compareByDescending<DashboardGroup> { it.total }.thenBy { it.name })
}

private fun dashboardPlanRanking(
    records: List<DashboardCadastro>,
    planos: List<PlanoMap>,
): List<Pair<String, Int>> {
    val names = planos.associate { it.planoId to it.nomeExibicao }
    val counts = mutableMapOf<Int, Int>()
    records.filter { it.status == "enviado" }.forEach { cadastro ->
        val lives = runCatching { cadastro.dependentes?.jsonArray }.getOrNull().orEmpty()
        lives.forEach { life ->
            dashboardPlanCode(life)?.let { code -> counts[code] = (counts[code] ?: 0) + 1 }
        }
    }
    return counts.entries
        .map { (code, total) -> (names[code] ?: "Plano $code") to total }
        .sortedByDescending { it.second }
}

private fun dashboardPlanCode(element: JsonElement): Int? {
    val obj = runCatching { element.jsonObject }.getOrNull() ?: return null
    val candidates = listOf("plano", "plano_codigo", "planoCodigo", "codigoPlano", "Plano")
    candidates.forEach { key ->
        val primitive = obj[key]?.jsonPrimitive ?: return@forEach
        primitive.intOrNull?.let { if (it > 0) return it }
        primitive.contentOrNull?.toIntOrNull()?.let { if (it > 0) return it }
    }
    return null
}

private fun dashboardSellerKey(cadastro: DashboardCadastro): String =
    cadastro.vendedorCodigo?.takeIf { it.isNotBlank() }
        ?: cadastro.vendedorId?.takeIf { it.isNotBlank() }
        ?: "sem-vendedor"

private fun dashboardAdesionistaKey(cadastro: DashboardCadastro): String =
    cadastro.adesionistaId?.takeIf { it.isNotBlank() }
        ?: cadastro.adesionistaCodigo?.takeIf { it.isNotBlank() }
        ?: "sem-adesionista"

private fun dashboardCompanyKey(cadastro: DashboardCadastro): String =
    cadastro.empresaCodigo?.toString()
        ?: cadastro.empresaNome?.takeIf { it.isNotBlank() }
        ?: "nao-informada"

private fun dashboardCompanyLabel(cadastro: DashboardCadastro): String =
    cadastro.empresaNome?.trim()?.takeIf { it.isNotBlank() }
        ?: cadastro.empresaCodigo?.let { "Empresa código $it" }
        ?: "Não informada"

private fun dashboardChannelKey(cadastro: DashboardCadastro): String =
    if (cadastro.fluxoPublico == true || !cadastro.origemLinkId.isNullOrBlank()) "publico" else "interno"

private fun dashboardMatchesFilters(
    cadastro: DashboardCadastro,
    team: String,
    company: String,
    seller: String,
    adesionista: String,
    channel: String,
    status: String,
    search: String,
    planos: List<PlanoMap>,
    ignore: String? = null,
): Boolean {
    if (ignore != "team" && team != "todos" && cadastro.teamId != team) return false
    if (ignore != "company" && company != "todos" && dashboardCompanyKey(cadastro) != company) return false
    if (ignore != "seller" && seller != "todos" && dashboardSellerKey(cadastro) != seller) return false
    if (ignore != "adesionista" && adesionista != "todos" && dashboardAdesionistaKey(cadastro) != adesionista) return false
    if (ignore != "channel" && channel != "todos" && dashboardChannelKey(cadastro) != channel) return false
    if (ignore != "status" && status != "todos" && cadastro.status != status) return false
    if (ignore == "search") return true
    val term = search.trim().lowercase(Locale("pt", "BR"))
    if (term.isBlank()) return true
    val direct = listOf(
        cadastro.empresaNome,
        cadastro.planoNome,
        cadastro.vendedorNome,
        cadastro.adesionistaNome,
    ).any { it.orEmpty().lowercase(Locale("pt", "BR")).contains(term) }
    if (direct) return true
    val planNames = planos.associate { it.planoId to it.nomeExibicao.lowercase(Locale("pt", "BR")) }
    return runCatching { cadastro.dependentes?.jsonArray }.getOrNull().orEmpty().any { life ->
        dashboardPlanCode(life)?.let { planNames[it]?.contains(term) } == true
    }
}

private fun dashboardSelectedLabel(
    selected: String,
    options: List<Pair<String, String>>,
    allLabel: String,
): String = if (selected == "todos") allLabel else options.firstOrNull { it.first == selected }?.second ?: allLabel

private fun dashboardStatusLabel(status: String): String = when (status) {
    "enviado" -> "Enviado ao ERP"
    "incompleto" -> "Incompleto"
    "adesoes_pendentes" -> "Adesoes pendentes"
    "erro_envio" -> "Erro de envio"
    else -> "Todas"
}
