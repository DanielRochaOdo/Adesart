package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.DateRange
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.data.models.AdminTeam
import br.com.vendamais.mobile.data.models.AdminUser
import br.com.vendamais.mobile.data.models.CadastroDetalhe
import br.com.vendamais.mobile.data.models.CadastroResumo
import br.com.vendamais.mobile.data.models.EmpresaResumo
import br.com.vendamais.mobile.data.models.EmpresaSearchType
import br.com.vendamais.mobile.domain.cadastro.CadastroApiErrorMapper
import br.com.vendamais.mobile.domain.cadastro.CadastroModalSignal
import br.com.vendamais.mobile.domain.cadastro.isPendingCadastroStatus
import br.com.vendamais.mobile.ui.AppUiState
import br.com.vendamais.mobile.ui.AppViewModel
import br.com.vendamais.mobile.ui.CadastroAreaTab
import br.com.vendamais.mobile.ui.CadastroFiltro
import br.com.vendamais.mobile.ui.MainTab
import br.com.vendamais.mobile.ui.components.ScreenHeading
import br.com.vendamais.mobile.ui.components.WebCard
import br.com.vendamais.mobile.ui.components.VendaButton
import br.com.vendamais.mobile.ui.components.VendaButtonSize
import br.com.vendamais.mobile.ui.components.VendaEmptyState
import br.com.vendamais.mobile.ui.components.VendaLoadingState
import br.com.vendamais.mobile.ui.theme.Amber100
import br.com.vendamais.mobile.ui.theme.Amber500
import br.com.vendamais.mobile.ui.theme.Emerald
import br.com.vendamais.mobile.ui.theme.EmeraldSoft
import br.com.vendamais.mobile.ui.theme.Slate100
import br.com.vendamais.mobile.ui.theme.Slate500
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import br.com.vendamais.mobile.ui.components.bringIntoViewOnFocus

private enum class TipoBuscaFiltro {
    ASSOCIADO,
    EMPRESA,
}

private data class EmpresaCadastroGroup(
    val key: String,
    val nome: String,
    val cnpj: String?,
    val cadastros: List<CadastroResumo>,
)

private data class VendedorCadastroGroup(
    val key: String,
    val nome: String,
    val empresas: List<EmpresaCadastroGroup>,
)

private data class EquipeCadastroGroup(
    val key: String,
    val nome: String,
    val vendedores: List<VendedorCadastroGroup>,
)

@Composable
fun CadastrosScreen(
    state: AppUiState,
    viewModel: AppViewModel,
    onTabChange: (CadastroAreaTab) -> Unit,
    onFilterChange: (CadastroFiltro) -> Unit,
    onCadastroClick: (String) -> Unit,
    onSearchTypeChange: (EmpresaSearchType) -> Unit,
    onSearchValueChange: (String) -> Unit,
    onSearchEmpresa: () -> Unit,
    onSelectEmpresa: (EmpresaResumo) -> Unit,
    onClearEmpresa: () -> Unit,
    onCpfChange: (String) -> Unit,
    onSelectedVendedorChange: (String) -> Unit,
    onSelectedAdesionistaChange: (String) -> Unit,
    onConsultarCpf: () -> Unit,
    onLinkSearchTypeChange: (EmpresaSearchType) -> Unit,
    onLinkSearchValueChange: (String) -> Unit,
    onLinkSearchEmpresa: () -> Unit,
    onLinkSelectEmpresa: (EmpresaResumo) -> Unit,
    onLinkClearEmpresa: () -> Unit,
    onLinkAdesionistaChange: (String) -> Unit,
    onGenerateLink: () -> Unit,
    onRegenerateLink: (String) -> Unit,
    onDeleteLink: (String) -> Unit,
    onOpenLinkHistory: (String) -> Unit,
    onCloseLinkHistory: () -> Unit,
    onOpenWebApp: (() -> Unit)? = null,
) {
    var showInclusaoDialog by rememberSaveable { mutableStateOf(false) }
    var showFilters by rememberSaveable { mutableStateOf(false) }
    val defaultDataInicio = firstDayOfCurrentMonthIso()
    var tipoBusca by rememberSaveable { mutableStateOf(TipoBuscaFiltro.ASSOCIADO) }
    var tipoBuscaAplicada by rememberSaveable { mutableStateOf(TipoBuscaFiltro.ASSOCIADO) }
    var buscaNome by rememberSaveable { mutableStateOf("") }
    var buscaNomeAplicada by rememberSaveable { mutableStateOf("") }
    var buscaCpf by rememberSaveable { mutableStateOf("") }
    var buscaCpfAplicada by rememberSaveable { mutableStateOf("") }
    var buscaCnpj by rememberSaveable { mutableStateOf("") }
    var buscaCnpjAplicada by rememberSaveable { mutableStateOf("") }
    var buscaCodigo by rememberSaveable { mutableStateOf("") }
    var buscaCodigoAplicada by rememberSaveable { mutableStateOf("") }
    var tipoCadastroFiltro by rememberSaveable { mutableStateOf("todos") }
    var tipoCadastroFiltroAplicado by rememberSaveable { mutableStateOf("todos") }
    var vendedorFiltro by rememberSaveable { mutableStateOf("") }
    var vendedorFiltroAplicado by rememberSaveable { mutableStateOf("") }
    var statusAdesaoFiltro by rememberSaveable { mutableStateOf("") }
    var statusAdesaoFiltroAplicado by rememberSaveable { mutableStateOf("") }
    var dataInicioFiltro by rememberSaveable { mutableStateOf(defaultDataInicio) }
    var dataFimFiltro by rememberSaveable { mutableStateOf("") }
    var dataInicioFiltroAplicado by rememberSaveable { mutableStateOf(defaultDataInicio) }
    var dataFimFiltroAplicado by rememberSaveable { mutableStateOf("") }

    val cpfsComCadastroConcluido = state.cadastros
        .asSequence()
        .filter { it.status == "enviado" && it.tipoCadastro == "cadastro" }
        .map { it.cpf.filter(Char::isDigit) }
        .filter { it.length == 11 }
        .toSet()
    val baseCadastros = state.cadastros.filter { cadastro ->
        when (state.cadastroFiltro) {
            CadastroFiltro.PENDENTES -> {
                val cpf = cadastro.cpf.filter(Char::isDigit)
                isPendingCadastroStatus(cadastro.status) &&
                    !(cadastro.tipoCadastro == "cadastro" && cpf.length == 11 && cpf in cpfsComCadastroConcluido)
            }
            CadastroFiltro.ENVIADOS -> cadastro.status == "enviado"
        }
    }
    val buscaNomeAplicadaTrim = buscaNomeAplicada.trim()
    val buscaCpfAplicadaDigits = buscaCpfAplicada.filter(Char::isDigit)
    val buscaCnpjAplicadaDigits = buscaCnpjAplicada.filter(Char::isDigit)
    val buscaCodigoAplicadaTrim = buscaCodigoAplicada.trim()
    val vendedorFiltroAplicadoTrim = vendedorFiltroAplicado.trim()
    val dataInicio = parseFilterDate(dataInicioFiltroAplicado)
    val dataFim = parseFilterDate(dataFimFiltroAplicado)
    val isVendedor = state.profile?.role == "VENDEDOR"

    val cadastrosPorPeriodo = baseCadastros.filter { cadastro ->
        val cadastroData = parseCadastroDate(resolveCadastroDateForFilter(cadastro, state.cadastroFiltro))
        val matchesDataInicio = dataInicio?.let { start -> cadastroData?.let { !it.isBefore(start) } ?: false } ?: true
        val matchesDataFim = dataFim?.let { end -> cadastroData?.let { !it.isAfter(end) } ?: false } ?: true
        matchesDataInicio && matchesDataFim
    }

    val filteredCadastros = baseCadastros.filter { cadastro ->
        val matchesBusca = when (tipoBuscaAplicada) {
            TipoBuscaFiltro.ASSOCIADO -> {
                val matchNomeTitular = buscaNomeAplicadaTrim.isBlank() || cadastro.nome.orEmpty().contains(buscaNomeAplicadaTrim, ignoreCase = true)
                val matchCpfTitular = buscaCpfAplicadaDigits.isBlank() || cadastro.cpf.filter(Char::isDigit).contains(buscaCpfAplicadaDigits)
                val titularOk = matchNomeTitular && matchCpfTitular
                if (titularOk) {
                    true
                } else {
                    searchInDependentes(cadastro, buscaNomeAplicadaTrim, buscaCpfAplicadaDigits)
                }
            }
            TipoBuscaFiltro.EMPRESA -> {
                val matchNomeEmpresa = buscaNomeAplicadaTrim.isBlank() || cadastro.empresaNome.orEmpty().contains(buscaNomeAplicadaTrim, ignoreCase = true)
                val matchCnpj = buscaCnpjAplicadaDigits.isBlank() || cadastro.empresaCnpj.orEmpty().filter(Char::isDigit).contains(buscaCnpjAplicadaDigits)
                val matchCodigo = buscaCodigoAplicadaTrim.isBlank() || cadastro.empresaCodigo?.toString()?.contains(buscaCodigoAplicadaTrim) == true
                matchNomeEmpresa && matchCnpj && matchCodigo
            }
        }

        val matchesTipo = when (tipoCadastroFiltroAplicado) {
            "cadastro" -> cadastro.tipoCadastro == "cadastro"
            "inclusao_dependente" -> cadastro.tipoCadastro == "inclusao_dependente"
            else -> true
        }

        val matchesStatusAdesao = if (statusAdesaoFiltroAplicado.isBlank()) {
            true
        } else {
            cadastro.statusAdesaoId == statusAdesaoFiltroAplicado
        }

        val matchesVendedor = if (isVendedor || vendedorFiltroAplicadoTrim.isBlank()) {
            true
        } else {
            cadastro.vendedorId == vendedorFiltroAplicadoTrim
        }

        val cadastroData = parseCadastroDate(resolveCadastroDateForFilter(cadastro, state.cadastroFiltro))
        val matchesDataInicio = dataInicio?.let { start -> cadastroData?.let { !it.isBefore(start) } ?: false } ?: true
        val matchesDataFim = dataFim?.let { end -> cadastroData?.let { !it.isAfter(end) } ?: false } ?: true

        matchesBusca && matchesTipo && matchesStatusAdesao && matchesVendedor && matchesDataInicio && matchesDataFim
    }
    val vendedoresUnicos = baseCadastros
        .mapNotNull { cadastro ->
            val id = cadastro.vendedorId?.trim().orEmpty()
            val nome = cadastro.vendedorNome?.trim().orEmpty()
            if (id.isBlank()) null else id to (nome.ifBlank { "Vendedor" })
        }
        .distinctBy { it.first }
        .sortedBy { it.second.lowercase() }

    fun applyFilters() {
        tipoBuscaAplicada = tipoBusca
        buscaNomeAplicada = buscaNome
        buscaCpfAplicada = buscaCpf
        buscaCnpjAplicada = buscaCnpj
        buscaCodigoAplicada = buscaCodigo
        tipoCadastroFiltroAplicado = tipoCadastroFiltro
        statusAdesaoFiltroAplicado = statusAdesaoFiltro
        vendedorFiltroAplicado = vendedorFiltro
        dataInicioFiltroAplicado = dataInicioFiltro
        dataFimFiltroAplicado = dataFimFiltro
    }

    fun clearFilters() {
        tipoBusca = TipoBuscaFiltro.ASSOCIADO
        tipoBuscaAplicada = TipoBuscaFiltro.ASSOCIADO
        buscaNome = ""
        buscaNomeAplicada = ""
        buscaCpf = ""
        buscaCpfAplicada = ""
        buscaCnpj = ""
        buscaCnpjAplicada = ""
        buscaCodigo = ""
        buscaCodigoAplicada = ""
        tipoCadastroFiltro = "todos"
        tipoCadastroFiltroAplicado = "todos"
        statusAdesaoFiltro = ""
        statusAdesaoFiltroAplicado = ""
        vendedorFiltro = ""
        vendedorFiltroAplicado = ""
        dataInicioFiltro = defaultDataInicio
        dataInicioFiltroAplicado = defaultDataInicio
        dataFimFiltro = ""
        dataFimFiltroAplicado = ""
    }

    val pendentesCount = state.cadastroStats.cadastro_incompletos + state.cadastroStats.inclusao_incompletos
    val completosCount = state.cadastroStats.cadastro_enviados + state.cadastroStats.inclusao_enviados
    val profileRole = state.profile?.role.orEmpty()
    val isListTab = state.cadastroTab in setOf(CadastroAreaTab.INCOMPLETOS, CadastroAreaTab.COMPLETOS)
    val useSupervisorGroupedView = isListTab && profileRole == "SUPERVISOR"
    val useGerenteGroupedView = isListTab && profileRole == "GERENTE"

    LazyColumn(
        modifier = Modifier
            .imePadding()
            .padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            ScreenHeading(
                title = "Cadastros",
                subtitle = "Inicie adesoes, resolva pendencias e acompanhe o que ja foi enviado.",
            )
        }

        item {
            CadastroTabBar(
                selectedTab = state.cadastroTab,
                pendentesCount = pendentesCount,
                completosCount = completosCount,
                onTabSelected = { tab ->
                    when (tab) {
                        CadastroAreaTab.INCOMPLETOS -> onFilterChange(CadastroFiltro.PENDENTES)
                        CadastroAreaTab.COMPLETOS -> onFilterChange(CadastroFiltro.ENVIADOS)
                        else -> Unit
                    }
                    onTabChange(tab)
                },
            )
        }

        when (state.cadastroTab) {
            CadastroAreaTab.NOVO -> {
                item {
                    CadastroOperationsCard(
                        profile = state.profile,
                        workspace = state.cadastroWorkspace,
                        vendedores = state.vendedores,
                        adesionistas = state.adesionistas,
                        onSearchTypeChange = onSearchTypeChange,
                        onSearchValueChange = onSearchValueChange,
                        onSearchEmpresa = onSearchEmpresa,
                        onSelectEmpresa = onSelectEmpresa,
                        onClearEmpresa = onClearEmpresa,
                        onCpfChange = onCpfChange,
                        onSelectedVendedorChange = onSelectedVendedorChange,
                        onSelectedAdesionistaChange = onSelectedAdesionistaChange,
                        onConsultarCpf = onConsultarCpf,
                    )
                }
            }

            CadastroAreaTab.LINK -> {
                item {
                    CadastroLinksCard(
                        workspace = state.linkWorkspace,
                        adesionistas = state.adesionistas,
                        onSelectedAdesionistaChange = onLinkAdesionistaChange,
                        invalidCompanyCodes = state.cadastroWorkspace.config?.codigosEmpresaInvalidos.orEmpty(),
                        onSearchTypeChange = onLinkSearchTypeChange,
                        onSearchValueChange = onLinkSearchValueChange,
                        onSearchEmpresa = onLinkSearchEmpresa,
                        onSelectEmpresa = onLinkSelectEmpresa,
                        onClearEmpresa = onLinkClearEmpresa,
                        onGenerateLink = onGenerateLink,
                        onRegenerateLink = onRegenerateLink,
                        onDeleteLink = onDeleteLink,
                        onOpenHistory = onOpenLinkHistory,
                        onCloseHistory = onCloseLinkHistory,
                    )
                }
            }

            CadastroAreaTab.DEPENDENTE -> {
                item {
                    WebCard {
                        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            Text(
                                text = "Inclusao de Dependente",
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = "Clique no botao para buscar um responsavel financeiro e adicionar novos dependentes.",
                                color = Slate500,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            VendaButton(
                                label = "Iniciar inclusao de dependente",
                                onClick = { showInclusaoDialog = true },
                                modifier = Modifier.fillMaxWidth(),
                                size = VendaButtonSize.LARGE,
                            )
                        }
                    }
                }
            }

            CadastroAreaTab.INCOMPLETOS,
            CadastroAreaTab.COMPLETOS,
            -> {
                if (useSupervisorGroupedView) {
                    if (state.cadastrosLoading && !state.cadastrosLoaded) {
                        item {
                            VendaLoadingState(
                                title = "Carregando lista",
                                message = "Buscando os cadastros mais recentes para voce.",
                            )
                        }
                    } else {
                        item {
                            CadastrosSupervisorGroupedSection(
                                cadastros = baseCadastros,
                                state = state,
                                viewModel = viewModel,
                                onCadastroClick = onCadastroClick,
                            )
                        }
                    }
                } else if (useGerenteGroupedView) {
                    if (state.cadastrosLoading && !state.cadastrosLoaded) {
                        item {
                            VendaLoadingState(
                                title = "Carregando lista",
                                message = "Buscando os cadastros mais recentes para voce.",
                            )
                        }
                    } else {
                        item {
                            CadastrosGerenteGroupedSection(
                                cadastros = baseCadastros,
                                users = state.adminUsers,
                                teams = state.adminTeams,
                                state = state,
                                viewModel = viewModel,
                                onCadastroClick = onCadastroClick,
                            )
                        }
                    }
                } else {
                    item {
                        CadastrosFilterPanel(
                            expanded = showFilters,
                            onToggleExpanded = { showFilters = !showFilters },
                            isVendedor = state.profile?.role == "VENDEDOR",
                            tipoBusca = tipoBusca,
                            onTipoBuscaChange = { tipoBusca = it },
                            buscaNome = buscaNome,
                            onBuscaNomeChange = { buscaNome = it },
                            buscaCpf = buscaCpf,
                            onBuscaCpfChange = { buscaCpf = it },
                            buscaCnpj = buscaCnpj,
                            onBuscaCnpjChange = { buscaCnpj = it },
                            buscaCodigo = buscaCodigo,
                            onBuscaCodigoChange = { buscaCodigo = it },
                            tipoCadastroFiltro = tipoCadastroFiltro,
                            onTipoCadastroFiltroChange = { tipoCadastroFiltro = it },
                            statusAdesaoFiltro = statusAdesaoFiltro,
                            onStatusAdesaoFiltroChange = { statusAdesaoFiltro = it },
                            statusOptions = state.statusAdesoes.map { it.id to it.nome },
                            vendedorFiltro = vendedorFiltro,
                            onVendedorFiltroChange = { vendedorFiltro = it },
                            vendedorOptions = vendedoresUnicos,
                            dataInicioFiltro = dataInicioFiltro,
                            onDataInicioFiltroChange = { dataInicioFiltro = it },
                            dataFimFiltro = dataFimFiltro,
                            onDataFimFiltroChange = { dataFimFiltro = it },
                            onApplyFilters = ::applyFilters,
                            filteredCount = filteredCadastros.size,
                            totalCount = cadastrosPorPeriodo.size,
                            onClearFilters = ::clearFilters,
                        )
                    }

                    if (state.cadastrosLoading && !state.cadastrosLoaded) {
                        item {
                            VendaLoadingState(
                                title = "Carregando lista",
                                message = "Buscando os cadastros mais recentes para voce.",
                            )
                        }
                    } else if (filteredCadastros.isEmpty()) {
                        item {
                            VendaEmptyState(
                                title = if (state.cadastroTab == CadastroAreaTab.INCOMPLETOS) {
                                    "Nenhum cadastro pendente"
                                } else {
                                    "Nenhum cadastro enviado"
                                },
                                message = if (state.cadastroTab == CadastroAreaTab.INCOMPLETOS) {
                                    "Quando houver adesoes aguardando conclusao, elas aparecerao aqui."
                                } else {
                                    "Os cadastros enviados para processamento aparecerao aqui."
                                },
                            )
                        }
                    } else {
                        items(filteredCadastros) { cadastro ->
                            CadastroCard(
                                cadastro = cadastro,
                                state = state,
                                viewModel = viewModel,
                                onClick = { onCadastroClick(cadastro.id) },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showInclusaoDialog) {
        InclusaoDependenteDialog(
            state = state,
            viewModel = viewModel,
            onDismiss = { showInclusaoDialog = false },
            onSuccess = {
                showInclusaoDialog = false
            },
            onCompleted = {
                viewModel.selectTab(MainTab.CADASTROS)
                viewModel.selectCadastroAreaTab(CadastroAreaTab.COMPLETOS)
            },
            onQueued = {
                viewModel.selectTab(MainTab.CADASTROS)
                viewModel.selectCadastroAreaTab(CadastroAreaTab.INCOMPLETOS)
            },
        )
    }
}

@Composable
private fun CadastrosSupervisorGroupedSection(
    cadastros: List<CadastroResumo>,
    state: AppUiState,
    viewModel: AppViewModel,
    onCadastroClick: (String) -> Unit,
) {
    if (cadastros.isEmpty()) {
        WebCard {
            Text(
                text = "Nenhuma adesao pendente encontrada.",
                style = MaterialTheme.typography.bodyLarge,
            )
        }
        return
    }

    val groups = remember(cadastros) { groupByVendedorEmpresa(cadastros) }
    var expandedVendedores by remember { mutableStateOf(setOf<String>()) }
    var expandedEmpresas by remember { mutableStateOf(setOf<String>()) }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        groups.forEach { vendedorGroup ->
            val vendedorExpanded = expandedVendedores.contains(vendedorGroup.key)
            val totalCadastros = vendedorGroup.empresas.sumOf { it.cadastros.size }
            WebCard {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { expandedVendedores = toggleKey(expandedVendedores, vendedorGroup.key) },
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text(
                                text = vendedorGroup.nome,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = "${vendedorGroup.empresas.size} empresas",
                                style = MaterialTheme.typography.bodySmall,
                                color = Slate500,
                            )
                        }
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            BoxBadge(
                                value = totalCadastros.toString(),
                                bgColor = Amber100,
                                textColor = Amber500,
                            )
                            Text(
                                text = if (vendedorExpanded) "Ocultar" else "Ver",
                                style = MaterialTheme.typography.labelLarge,
                                color = Emerald,
                            )
                        }
                    }

                    if (vendedorExpanded) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            vendedorGroup.empresas.forEach { empresaGroup ->
                                val empresaExpanded = expandedEmpresas.contains(empresaGroup.key)
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Slate100,
                                ) {
                                    Column(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable { expandedEmpresas = toggleKey(expandedEmpresas, empresaGroup.key) },
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Column {
                                                Text(
                                                    text = empresaGroup.nome,
                                                    style = MaterialTheme.typography.titleSmall,
                                                    fontWeight = FontWeight.Medium,
                                                )
                                                empresaGroup.cnpj?.takeIf { it.isNotBlank() }?.let { cnpj ->
                                                    Text(
                                                        text = "CNPJ: $cnpj",
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = Slate500,
                                                    )
                                                }
                                            }
                                            Row(
                                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                BoxBadge(
                                                    value = empresaGroup.cadastros.size.toString(),
                                                    bgColor = EmeraldSoft,
                                                    textColor = Emerald,
                                                )
                                                Text(
                                                    text = if (empresaExpanded) "Ocultar" else "Abrir",
                                                    style = MaterialTheme.typography.labelLarge,
                                                    color = Emerald,
                                                )
                                            }
                                        }

                                        if (empresaExpanded) {
                                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                empresaGroup.cadastros.forEach { cadastro ->
                                                    CadastroCard(
                                                        cadastro = cadastro,
                                                        state = state,
                                                        viewModel = viewModel,
                                                        onClick = { onCadastroClick(cadastro.id) },
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

@Composable
private fun CadastrosGerenteGroupedSection(
    cadastros: List<CadastroResumo>,
    users: List<AdminUser>,
    teams: List<AdminTeam>,
    state: AppUiState,
    viewModel: AppViewModel,
    onCadastroClick: (String) -> Unit,
) {
    if (cadastros.isEmpty()) {
        WebCard {
            Text(
                text = "Nenhuma adesao pendente encontrada.",
                style = MaterialTheme.typography.bodyLarge,
            )
        }
        return
    }

    val groups = remember(cadastros, users, teams) { groupByEquipeVendedorEmpresa(cadastros, users, teams) }
    var expandedEquipes by remember { mutableStateOf(setOf<String>()) }
    var expandedVendedores by remember { mutableStateOf(setOf<String>()) }
    var expandedEmpresas by remember { mutableStateOf(setOf<String>()) }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        groups.forEach { equipeGroup ->
            val equipeExpanded = expandedEquipes.contains(equipeGroup.key)
            val totalEquipe = equipeGroup.vendedores.sumOf { vendedor -> vendedor.empresas.sumOf { it.cadastros.size } }
            WebCard {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { expandedEquipes = toggleKey(expandedEquipes, equipeGroup.key) },
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text(
                                text = equipeGroup.nome,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = "${equipeGroup.vendedores.size} vendedores",
                                style = MaterialTheme.typography.bodySmall,
                                color = Slate500,
                            )
                        }
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            BoxBadge(
                                value = totalEquipe.toString(),
                                bgColor = Amber100,
                                textColor = Amber500,
                            )
                            Text(
                                text = if (equipeExpanded) "Ocultar" else "Ver",
                                style = MaterialTheme.typography.labelLarge,
                                color = Emerald,
                            )
                        }
                    }

                    if (equipeExpanded) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            equipeGroup.vendedores.forEach { vendedorGroup ->
                                val vendedorPath = "${equipeGroup.key}:${vendedorGroup.key}"
                                val vendedorExpanded = expandedVendedores.contains(vendedorPath)
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Slate100,
                                ) {
                                    Column(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable { expandedVendedores = toggleKey(expandedVendedores, vendedorPath) },
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Text(
                                                text = vendedorGroup.nome,
                                                style = MaterialTheme.typography.titleSmall,
                                                fontWeight = FontWeight.Medium,
                                            )
                                            Row(
                                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                BoxBadge(
                                                    value = vendedorGroup.empresas.sumOf { it.cadastros.size }.toString(),
                                                    bgColor = EmeraldSoft,
                                                    textColor = Emerald,
                                                )
                                                Text(
                                                    text = if (vendedorExpanded) "Ocultar" else "Abrir",
                                                    style = MaterialTheme.typography.labelLarge,
                                                    color = Emerald,
                                                )
                                            }
                                        }

                                        if (vendedorExpanded) {
                                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                vendedorGroup.empresas.forEach { empresaGroup ->
                                                    val empresaPath = "$vendedorPath:${empresaGroup.key}"
                                                    val empresaExpanded = expandedEmpresas.contains(empresaPath)
                                                    Surface(
                                                        shape = RoundedCornerShape(10.dp),
                                                        color = MaterialTheme.colorScheme.surface,
                                                    ) {
                                                        Column(
                                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                                            verticalArrangement = Arrangement.spacedBy(8.dp),
                                                        ) {
                                                            Row(
                                                                modifier = Modifier
                                                                    .fillMaxWidth()
                                                                    .clickable { expandedEmpresas = toggleKey(expandedEmpresas, empresaPath) },
                                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                                verticalAlignment = Alignment.CenterVertically,
                                                            ) {
                                                                Column {
                                                                    Text(
                                                                        text = empresaGroup.nome,
                                                                        style = MaterialTheme.typography.bodyMedium,
                                                                        fontWeight = FontWeight.Medium,
                                                                    )
                                                                    empresaGroup.cnpj?.takeIf { it.isNotBlank() }?.let { cnpj ->
                                                                        Text(
                                                                            text = "CNPJ: $cnpj",
                                                                            style = MaterialTheme.typography.bodySmall,
                                                                            color = Slate500,
                                                                        )
                                                                    }
                                                                }
                                                                Row(
                                                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                                    verticalAlignment = Alignment.CenterVertically,
                                                                ) {
                                                                    BoxBadge(
                                                                        value = empresaGroup.cadastros.size.toString(),
                                                                        bgColor = EmeraldSoft,
                                                                        textColor = Emerald,
                                                                    )
                                                                    Text(
                                                                        text = if (empresaExpanded) "Ocultar" else "Abrir",
                                                                        style = MaterialTheme.typography.labelLarge,
                                                                        color = Emerald,
                                                                    )
                                                                }
                                                            }

                                                            if (empresaExpanded) {
                                                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                                    empresaGroup.cadastros.forEach { cadastro ->
                                                                        CadastroCard(
                                                                            cadastro = cadastro,
                                                                            state = state,
                                                                            viewModel = viewModel,
                                                                            onClick = { onCadastroClick(cadastro.id) },
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
                }
            }
        }
    }
}

private fun groupByVendedorEmpresa(cadastros: List<CadastroResumo>): List<VendedorCadastroGroup> {
    val groupedByVendedor = cadastros.groupBy { cadastro ->
        cadastro.vendedorId?.takeIf { it.isNotBlank() } ?: "sem_vendedor"
    }

    return groupedByVendedor.map { (vendedorKey, vendedorCadastros) ->
        val vendedorNome = vendedorCadastros.firstNotNullOfOrNull { cadastro ->
            cadastro.vendedorNome?.takeIf { it.isNotBlank() }
        } ?: "Vendedor nao identificado"

        val empresas = vendedorCadastros
            .groupBy { cadastro ->
                val codigo = cadastro.empresaCodigo?.toString() ?: "sem_codigo"
                val nome = cadastro.empresaNome?.trim().orEmpty()
                val cnpj = cadastro.empresaCnpj?.filter(Char::isDigit).orEmpty()
                "$codigo|$nome|$cnpj"
            }
            .map { (empresaKey, empresaCadastros) ->
                val first = empresaCadastros.first()
                EmpresaCadastroGroup(
                    key = "$vendedorKey:$empresaKey",
                    nome = first.empresaNome?.takeIf { it.isNotBlank() } ?: "Empresa nao informada",
                    cnpj = first.empresaCnpj,
                    cadastros = empresaCadastros.sortedByDescending { it.updatedAt },
                )
            }
            .sortedBy { it.nome.lowercase() }

        VendedorCadastroGroup(
            key = vendedorKey,
            nome = vendedorNome,
            empresas = empresas,
        )
    }.sortedWith(
        compareBy<VendedorCadastroGroup> { if (it.key == "sem_vendedor") 1 else 0 }
            .thenBy { it.nome.lowercase() },
    )
}

private fun groupByEquipeVendedorEmpresa(
    cadastros: List<CadastroResumo>,
    users: List<AdminUser>,
    teams: List<AdminTeam>,
): List<EquipeCadastroGroup> {
    val userById = users.associateBy { it.id }
    val teamById = teams.associateBy { it.id }

    val groupedByEquipe = cadastros.groupBy { cadastro ->
        val teamId = cadastro.vendedorId?.let { vendedorId -> userById[vendedorId]?.teamId }
        teamId?.takeIf { it.isNotBlank() } ?: "sem_equipe"
    }

    return groupedByEquipe.map { (equipeKey, equipeCadastros) ->
        val equipeNome = teamById[equipeKey]?.name ?: "Equipe nao informada"
        EquipeCadastroGroup(
            key = equipeKey,
            nome = equipeNome,
            vendedores = groupByVendedorEmpresa(equipeCadastros),
        )
    }.sortedWith(
        compareBy<EquipeCadastroGroup> { if (it.key == "sem_equipe") 1 else 0 }
            .thenBy { it.nome.lowercase() },
    )
}

private fun toggleKey(current: Set<String>, key: String): Set<String> {
    return if (current.contains(key)) current - key else current + key
}

@Composable
private fun CadastrosFilterPanel(
    expanded: Boolean,
    onToggleExpanded: () -> Unit,
    isVendedor: Boolean,
    tipoBusca: TipoBuscaFiltro,
    onTipoBuscaChange: (TipoBuscaFiltro) -> Unit,
    buscaNome: String,
    onBuscaNomeChange: (String) -> Unit,
    buscaCpf: String,
    onBuscaCpfChange: (String) -> Unit,
    buscaCnpj: String,
    onBuscaCnpjChange: (String) -> Unit,
    buscaCodigo: String,
    onBuscaCodigoChange: (String) -> Unit,
    tipoCadastroFiltro: String,
    onTipoCadastroFiltroChange: (String) -> Unit,
    statusAdesaoFiltro: String,
    onStatusAdesaoFiltroChange: (String) -> Unit,
    statusOptions: List<Pair<String, String>>,
    vendedorFiltro: String,
    onVendedorFiltroChange: (String) -> Unit,
    vendedorOptions: List<Pair<String, String>>,
    dataInicioFiltro: String,
    onDataInicioFiltroChange: (String) -> Unit,
    dataFimFiltro: String,
    onDataFimFiltroChange: (String) -> Unit,
    onApplyFilters: () -> Unit,
    filteredCount: Int,
    totalCount: Int,
    onClearFilters: () -> Unit,
) {
    WebCard {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Column {
                    Text(
                        text = "Filtros de busca",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Mostrando $filteredCount de $totalCount adesoes",
                        style = MaterialTheme.typography.bodySmall,
                        color = Slate500,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(
                        onClick = onClearFilters,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Limpar", maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Button(
                        onClick = onToggleExpanded,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            if (expanded) "Ocultar" else "Filtrar",
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            if (expanded) {
                SelectionField(
                    label = "Tipo de Busca",
                    value = if (tipoBusca == TipoBuscaFiltro.ASSOCIADO) "Associado" else "Empresa",
                    options = listOf(
                        TipoBuscaFiltro.ASSOCIADO to "Associado",
                        TipoBuscaFiltro.EMPRESA to "Empresa",
                    ),
                    onSelected = {
                        onTipoBuscaChange(it)
                        onBuscaNomeChange("")
                        onBuscaCpfChange("")
                        onBuscaCnpjChange("")
                        onBuscaCodigoChange("")
                    },
                )

                if (tipoBusca == TipoBuscaFiltro.ASSOCIADO) {
                    OutlinedTextField(
                        value = buscaNome,
                        onValueChange = onBuscaNomeChange,
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Nome") },
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = buscaCpf,
                        onValueChange = onBuscaCpfChange,
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("CPF") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                    )
                } else {
                    OutlinedTextField(
                        value = buscaNome,
                        onValueChange = onBuscaNomeChange,
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Nome da empresa") },
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = buscaCnpj,
                        onValueChange = onBuscaCnpjChange,
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("CNPJ") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = buscaCodigo,
                        onValueChange = onBuscaCodigoChange,
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Codigo da empresa") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                    )
                }

                SelectionField(
                    label = "Tipo",
                    value = when (tipoCadastroFiltro) {
                        "cadastro" -> "Cadastro"
                        "inclusao_dependente" -> "Inclusao"
                        else -> "Todos"
                    },
                    options = listOf(
                        "todos" to "Todos",
                        "cadastro" to "Cadastro",
                        "inclusao_dependente" to "Inclusao",
                    ),
                    onSelected = onTipoCadastroFiltroChange,
                )

                SelectionField(
                    label = "Status da Adesao",
                    value = statusOptions.firstOrNull { it.first == statusAdesaoFiltro }?.second ?: "Todos os Status",
                    options = listOf("" to "Todos os Status") + statusOptions,
                    onSelected = onStatusAdesaoFiltroChange,
                )

                if (!isVendedor) {
                    SelectionField(
                        label = "Vendedor",
                        value = vendedorOptions.firstOrNull { it.first == vendedorFiltro }?.second ?: "Todos",
                        options = listOf("" to "Todos") + vendedorOptions,
                        onSelected = onVendedorFiltroChange,
                    )
                }

                DateFilterField(
                    label = "Data inicio",
                    value = dataInicioFiltro,
                    onValueChange = onDataInicioFiltroChange,
                )
                DateFilterField(
                    label = "Data fim",
                    value = dataFimFiltro,
                    onValueChange = onDataFimFiltroChange,
                )

                Button(
                    onClick = onApplyFilters,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Aplicar filtros")
                }
            }
        }
    }
}

@Composable
private fun CadastroTabBar(
    selectedTab: CadastroAreaTab,
    pendentesCount: Int,
    completosCount: Int,
    onTabSelected: (CadastroAreaTab) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CadastroTabButton(
            label = "Novo",
            selected = selectedTab == CadastroAreaTab.NOVO,
            onClick = { onTabSelected(CadastroAreaTab.NOVO) },
            modifier = Modifier.fillMaxWidth(),
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            CadastroTabButton(
                label = "Dependente",
                selected = selectedTab == CadastroAreaTab.DEPENDENTE,
                onClick = { onTabSelected(CadastroAreaTab.DEPENDENTE) },
                modifier = Modifier.weight(1f),
            )
            CadastroTabButton(
                label = "Link",
                selected = selectedTab == CadastroAreaTab.LINK,
                onClick = { onTabSelected(CadastroAreaTab.LINK) },
                modifier = Modifier.weight(1f),
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            CadastroTabButton(
                label = "Enviadas",
                selected = selectedTab == CadastroAreaTab.COMPLETOS,
                onClick = { onTabSelected(CadastroAreaTab.COMPLETOS) },
                modifier = Modifier.weight(1f),
                badge = completosCount.takeIf { it > 0 }?.toString(),
            )
            CadastroTabButton(
                label = "Pendente",
                selected = selectedTab == CadastroAreaTab.INCOMPLETOS,
                onClick = { onTabSelected(CadastroAreaTab.INCOMPLETOS) },
                modifier = Modifier.weight(1f),
                badge = pendentesCount.takeIf { it > 0 }?.toString(),
            )
        }
    }
}

@Composable
private fun CadastroTabButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    badge: String? = null,
) {
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = if (selected) EmeraldSoft else Slate100,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                modifier = Modifier.weight(1f),
                color = if (selected) Emerald else Slate500,
                fontWeight = FontWeight.Medium,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (badge != null) {
                BoxBadge(
                    value = badge,
                    bgColor = if (selected) Emerald else Amber100,
                    textColor = if (selected) androidx.compose.ui.graphics.Color.White else Amber500,
                )
            }
        }
    }
}

@Composable
private fun BoxBadge(
    value: String,
    bgColor: androidx.compose.ui.graphics.Color,
    textColor: androidx.compose.ui.graphics.Color,
) {
    Text(
        text = value,
        modifier = Modifier
            .widthIn(min = 32.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(bgColor)
            .padding(horizontal = 6.dp, vertical = 2.dp),
        color = textColor,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        maxLines = 1,
        overflow = TextOverflow.Clip,
    )
}

@Composable
fun CadastroDetailDialog(
    cadastro: CadastroDetalhe,
    sendingCadastro: Boolean,
    onSendCadastro: (() -> Unit)?,
    onOpenWebApp: (() -> Unit)? = null,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                onOpenWebApp?.let { openWeb ->
                    TextButton(onClick = openWeb) {
                        Text("Web")
                    }
                }
                if (cadastro.status != "enviado" && onSendCadastro != null) {
                    TextButton(onClick = onSendCadastro, enabled = !sendingCadastro) {
                        if (sendingCadastro) {
                            CircularProgressIndicator(strokeWidth = 2.dp)
                        } else {
                            Text("Enviar")
                        }
                    }
                }
                TextButton(onClick = onDismiss) {
                    Text("Fechar")
                }
            }
        },
        title = { Text(cadastro.nome ?: "Cadastro ${cadastro.id.take(8)}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                DetailLine("Status", cadastro.status)
                DetailLine("Tipo", tipoCadastroLabel(cadastro.tipoCadastro))
                DetailLine("CPF", cadastro.cpf)
                DetailLine("Empresa", cadastro.empresaNome ?: "-")
                DetailLine("Vendedor", cadastro.vendedorNome ?: "-")
                DetailLine("Adesionista", cadastro.adesionistaNome ?: "-")
                DetailLine("Matricula", cadastro.numeroMatricula ?: "-")
                DetailLine("Arquivo", cadastro.arquivoPath ?: "-")
                DetailLine("Data de envio", cadastro.dataEnvio?.let(::formatDateTime) ?: "-")
                DetailLine("Atualizado", formatDateTime(cadastro.updatedAt))
                if (!cadastro.motivoBloqueio.isNullOrBlank()) {
                    DetailLine("Motivo do bloqueio", cadastro.motivoBloqueio)
                }
            }
        },
    )
}

@Composable
private fun CadastroCard(
    cadastro: CadastroResumo,
    state: AppUiState,
    viewModel: AppViewModel,
    onClick: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var selectedStatusId by rememberSaveable(cadastro.id, cadastro.statusAdesaoId) {
        mutableStateOf(cadastro.statusAdesaoId.orEmpty())
    }
    var updatingStatus by rememberSaveable(cadastro.id) { mutableStateOf(false) }
    var statusError by rememberSaveable(cadastro.id) { mutableStateOf<String?>(null) }
    val statusNome = state.statusAdesoes.firstOrNull { it.id == selectedStatusId }?.nome ?: "Selecione"
    val isPendingCadastro = isPendingCadastroStatus(cadastro.status)
    val canDeleteCadastro = isPendingCadastro && canDeleteCadastroByRole(state.profile?.role)

    WebCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = truncateLabelWithEllipsis(cadastro.nome, 25),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!isPendingCadastro) {
                    Text(
                        text = formatDateTime(cadastro.updatedAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = if (cadastro.status == "enviado") EmeraldSoft else Amber100,
            ) {
                Text(
                    text = "${tipoCadastroLabel(cadastro.tipoCadastro)} · ${statusLabel(cadastro.status)}",
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = if (cadastro.status == "enviado") Emerald else Amber500,
                )
            }
            Text("CPF: ${formatCpf(cadastro.cpf)}", style = MaterialTheme.typography.bodyMedium)
            Text("Empresa: ${cadastro.empresaNome ?: "-"}", style = MaterialTheme.typography.bodyMedium)
            Text(
                text = "Atualizado em ${formatDateTime(cadastro.updatedAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (isPendingCadastro) {
                SelectionField(
                    label = "Status da adesao",
                    value = statusNome,
                    options = listOf("" to "Selecione") + state.statusAdesoes.map { it.id to it.nome },
                    onSelected = { statusId ->
                        if (selectedStatusId == statusId || updatingStatus) return@SelectionField
                        selectedStatusId = statusId
                        statusError = null
                        scope.launch {
                            updatingStatus = true
                            runCatching {
                                viewModel.updateCadastroRecord(
                                    cadastro.id,
                                    buildJsonObject {
                                        if (statusId.isBlank()) put("status_adesao_id", JsonNull) else put("status_adesao_id", statusId)
                                    },
                                )
                            }.onFailure { throwable ->
                                statusError = CadastroApiErrorMapper.mapUserMessage(
                                    throwable.message,
                                    "Falha ao atualizar status da adesao.",
                                )
                            }
                            updatingStatus = false
                        }
                    },
                )
                statusError?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (canDeleteCadastro) {
                        OutlinedButton(
                            onClick = {
                                val titularNome = cadastro.nome.orEmpty().ifBlank {
                                    cadastro.cpf
                                        .filter(Char::isDigit)
                                        .takeIf { it.isNotBlank() }
                                        ?.let(::formatCpf)
                                        ?: "Cadastro ${cadastro.id.take(8)}"
                                }
                                viewModel.resolveCadastroOverlay(
                                    CadastroModalSignal(
                                        excluirCadastroId = cadastro.id,
                                        excluirCadastroTitular = titularNome,
                                    ),
                                )
                            },
                            enabled = !updatingStatus,
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("Excluir")
                        }
                    }
                    Button(
                        onClick = onClick,
                        enabled = !updatingStatus,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Continuar")
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailLine(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

private fun formatDateTime(value: String): String {
    return runCatching {
        OffsetDateTime.parse(value).format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
    }.getOrDefault(value)
}

private fun tipoCadastroLabel(value: String): String {
    return when (value) {
        "inclusao_dependente" -> "Inclusao de Dependente"
        else -> "Cadastro"
    }
}

private fun statusLabel(value: String): String {
    return when (value) {
        "enviado" -> "Cadastrado"
        else -> if (isPendingCadastroStatus(value)) "Pendente" else value
    }
}

private fun formatCpf(value: String): String {
    val digits = value.filter(Char::isDigit).take(11)
    if (digits.length != 11) return value
    return "${digits.substring(0, 3)}.${digits.substring(3, 6)}.${digits.substring(6, 9)}-${digits.substring(9, 11)}"
}

private fun firstDayOfCurrentMonthIso(): String {
    val now = LocalDate.now()
    return now.withDayOfMonth(1).toString()
}

private fun searchInDependentes(cadastro: CadastroResumo, nome: String, cpfDigits: String): Boolean {
    val deps = runCatching { cadastro.dependentes?.jsonArray }.getOrNull() ?: return false
    return deps.any { dep ->
        val obj = runCatching { dep.jsonObject }.getOrNull() ?: return@any false
        val depNome = obj["nome"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val depCpf = obj["cpf"]?.jsonPrimitive?.contentOrNull.orEmpty().filter(Char::isDigit)
        val matchNome = nome.isBlank() || depNome.contains(nome, ignoreCase = true)
        val matchCpf = cpfDigits.isBlank() || depCpf.contains(cpfDigits)
        matchNome && matchCpf
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateFilterField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
) {
    var showDatePicker by rememberSaveable { mutableStateOf(false) }
    val interactionSource = remember { MutableInteractionSource() }

    OutlinedTextField(
        value = value,
        onValueChange = {},
        modifier = Modifier
            .fillMaxWidth()
            .bringIntoViewOnFocus()
            .clickable(
                interactionSource = interactionSource,
                indication = null,
            ) { showDatePicker = true },
        label = { Text(label) },
        readOnly = true,
        singleLine = true,
        trailingIcon = {
            IconButton(onClick = { showDatePicker = true }) {
                Icon(
                    imageVector = Icons.Rounded.DateRange,
                    contentDescription = "Selecionar data",
                )
            }
        },
    )

    if (showDatePicker) {
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = isoDateToUtcMillis(value))
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        val selected = pickerState.selectedDateMillis
                        if (selected != null) {
                            onValueChange(utcMillisToIsoDate(selected))
                        }
                        showDatePicker = false
                    },
                ) {
                    Text("Selecionar")
                }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(
                        onClick = {
                            onValueChange("")
                            showDatePicker = false
                        },
                    ) {
                        Text("Limpar")
                    }
                    TextButton(onClick = { showDatePicker = false }) {
                        Text("Cancelar")
                    }
                }
            },
        ) {
            DatePicker(state = pickerState)
        }
    }
}

private fun parseFilterDate(value: String): LocalDate? {
    val normalized = value.trim()
    if (normalized.isBlank()) return null
    return runCatching { LocalDate.parse(normalized) }.getOrNull()
}

private fun resolveCadastroDateForFilter(cadastro: CadastroResumo, filtro: CadastroFiltro): String {
    return if (filtro == CadastroFiltro.ENVIADOS) {
        cadastro.dataEnvio?.takeIf { it.isNotBlank() } ?: cadastro.updatedAt
    } else {
        cadastro.createdAt
    }
}

private fun parseCadastroDate(value: String): LocalDate? {
    return runCatching { OffsetDateTime.parse(value).toLocalDate() }.getOrNull()
}

private fun canDeleteCadastroByRole(role: String?): Boolean {
    return role in setOf("VENDEDOR", "ADESIONISTA")
}

private fun truncateLabelWithEllipsis(value: String?, maxChars: Int): String {
    val normalized = value?.trim().orEmpty().ifBlank { "Sem nome" }
    if (normalized.length <= maxChars) return normalized
    if (maxChars <= 3) return normalized.take(maxChars)
    return normalized.take(maxChars - 3) + "..."
}

private fun isoDateToUtcMillis(value: String): Long? {
    val date = parseFilterDate(value) ?: return null
    return runCatching {
        date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
    }.getOrNull()
}

private fun utcMillisToIsoDate(value: Long): String {
    return Instant.ofEpochMilli(value)
        .atZone(ZoneOffset.UTC)
        .toLocalDate()
        .toString()
}

