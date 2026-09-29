package br.com.vendamais.mobile.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.Dashboard
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.AppConfig
import br.com.vendamais.mobile.domain.cadastro.isPendingCadastroStatus
import br.com.vendamais.mobile.ui.components.ScreenBackground
import br.com.vendamais.mobile.ui.components.VendaBrandIcon
import br.com.vendamais.mobile.ui.screens.AdesoesExcluidasScreen
import br.com.vendamais.mobile.ui.screens.AuditoriaLemmitScreen
import br.com.vendamais.mobile.ui.screens.CadastroDetailDialog
import br.com.vendamais.mobile.ui.screens.CadastroEditorDialog
import br.com.vendamais.mobile.ui.screens.CadastroOverlayDialogs
import br.com.vendamais.mobile.ui.screens.CadastrosScreen
import br.com.vendamais.mobile.ui.screens.DashboardScreen
import br.com.vendamais.mobile.ui.screens.FilaUploadErpScreen
import br.com.vendamais.mobile.ui.screens.InclusaoDependenteDialog
import br.com.vendamais.mobile.ui.screens.LoginScreen
import br.com.vendamais.mobile.ui.screens.ProfileScreen
import br.com.vendamais.mobile.ui.screens.PublicAdesaoParityScreen
import br.com.vendamais.mobile.ui.screens.SettingsScreen
import br.com.vendamais.mobile.ui.screens.TeamsScreen
import br.com.vendamais.mobile.ui.screens.UsersScreen
import br.com.vendamais.mobile.ui.theme.Amber100
import br.com.vendamais.mobile.ui.theme.Amber500
import br.com.vendamais.mobile.ui.theme.BrandOrange
import br.com.vendamais.mobile.ui.theme.Emerald
import br.com.vendamais.mobile.ui.theme.EmeraldDark
import br.com.vendamais.mobile.ui.theme.EmeraldSoft
import br.com.vendamais.mobile.ui.theme.Red100
import br.com.vendamais.mobile.ui.theme.Red500
import java.util.Locale

private enum class AppNavGroup {
    INICIO,
    OPERACAO,
    PESSOAS,
    ADMINISTRACAO,
    CONTA,
}

private data class AppNavModule(
    val key: String,
    val label: String,
    val icon: ImageVector,
    val tab: MainTab,
    val cadastroArea: CadastroAreaTab? = null,
    val cadastroFiltro: CadastroFiltro? = null,
)

private data class AppNavGroupItem(
    val group: AppNavGroup,
    val label: String,
    val icon: ImageVector,
    val modules: List<AppNavModule>,
)

@Composable
fun VendaMaisApp(
    viewModel: AppViewModel,
    deepLinkToken: String? = null,
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var openGroupSheet by rememberSaveable { mutableStateOf<String?>(null) }
    val openWebApp = remember(context) {
        {
            if (AppConfig.publicAppUrl.isNotBlank()) {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(AppConfig.publicAppUrl)))
            }
        }
    }

    LaunchedEffect(deepLinkToken) {
        deepLinkToken
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?.let(viewModel::openPublicTokenFlow)
    }

    state.appUpdateInfo?.let { update ->
        AlertDialog(
            onDismissRequest = viewModel::dismissAppUpdate,
            title = { Text("Atualizacao disponivel") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Versao mais recente: ${update.versionName}")
                    update.notes?.takeIf { it.isNotBlank() }?.let { Text(it) }
                    Text("Recomendamos atualizar para obter melhorias de estabilidade e performance.")
                }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismissAppUpdate) {
                    Text("Agora nao")
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.dismissAppUpdate()
                        viewModel.installAppUpdate(
                            onInstallIntent = { intent ->
                                runCatching { context.startActivity(intent) }
                                    .onFailure {
                                        viewModel.dismissAppUpdate()
                                    }
                            },
                            context = context,
                        )
                    },
                    enabled = !state.appUpdateDownloading,
                ) {
                    if (state.appUpdateDownloading) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    } else {
                        Text("Atualizar")
                    }
                }
            },
        )
    }

    state.appUpdateError?.let { message ->
        AlertDialog(
            onDismissRequest = viewModel::dismissAppUpdate,
            title = { Text("Nao foi possivel atualizar") },
            text = { Text(message) },
            confirmButton = {
                TextButton(onClick = viewModel::dismissAppUpdate) {
                    Text("OK")
                }
            },
        )
    }

    state.publicToken?.let { token ->
        PublicAdesaoParityScreen(
            token = token,
            viewModel = viewModel,
            onClose = viewModel::closePublicTokenFlow,
        )
        return
    }

    if (!state.isAuthenticated) {
        LoginScreen(
            state = state,
            onEmailChange = viewModel::updateEmail,
            onPasswordChange = viewModel::updatePassword,
            rememberConnected = state.rememberConnected,
            onRememberConnectedChange = viewModel::setRememberConnected,
            onLogin = viewModel::login,
        )
        return
    }

    val navGroups = remember(state.profile?.role) {
        resolveNavigationGroups(state.profile?.role)
    }
    val activeGroup = remember(state.activeTab) { resolveActiveGroup(state.activeTab) }

    LaunchedEffect(navGroups, state.activeTab) {
        if (navGroups.isEmpty()) return@LaunchedEffect
        val activeAllowed = navGroups.any { group ->
            group.modules.any { module -> module.tab == state.activeTab }
        }
        if (!activeAllowed) {
            applyNavigationModule(viewModel, navGroups.first().modules.first())
        }
    }

    ScreenBackground {
        Column(modifier = Modifier.fillMaxSize()) {
            AppHeaderBar(
                profileName = state.profile?.name.orEmpty(),
                profileRole = state.profile?.role.orEmpty(),
            )

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom)),
            ) {
                when (state.activeTab) {
                    MainTab.DASHBOARD -> DashboardScreen(
                        state = state,
                        onOpenDrilldown = viewModel::openDashboardDrilldown,
                        onCloseDrilldown = viewModel::closeDashboardDrilldown,
                    )

                    MainTab.CADASTROS -> CadastrosScreen(
                        state = state,
                        viewModel = viewModel,
                        onTabChange = viewModel::selectCadastroAreaTab,
                        onFilterChange = viewModel::selectCadastroFiltro,
                        onCadastroClick = viewModel::openCadastro,
                        onSearchTypeChange = viewModel::updateEmpresaSearchType,
                        onSearchValueChange = viewModel::updateEmpresaSearchValue,
                        onSearchEmpresa = viewModel::searchEmpresas,
                        onSelectEmpresa = viewModel::selectEmpresa,
                        onClearEmpresa = viewModel::clearSelectedEmpresa,
                        onCpfChange = viewModel::updateCpfValue,
                        onSelectedVendedorChange = viewModel::updateSelectedVendedor,
                        onSelectedAdesionistaChange = viewModel::updateSelectedAdesionista,
                        onConsultarCpf = viewModel::createDraftFromCpf,
                        onLinkSearchTypeChange = viewModel::updateLinkSearchType,
                        onLinkSearchValueChange = viewModel::updateLinkSearchValue,
                        onLinkSearchEmpresa = viewModel::searchEmpresasForLink,
                        onLinkSelectEmpresa = viewModel::selectLinkEmpresa,
                        onLinkClearEmpresa = viewModel::clearLinkEmpresa,
                        onLinkAdesionistaChange = viewModel::updateLinkAdesionista,
                        onGenerateLink = viewModel::createCadastroLink,
                        onRegenerateLink = viewModel::regenerateCadastroLink,
                        onDeleteLink = viewModel::deleteCadastroLink,
                        onOpenLinkHistory = viewModel::openCadastroLinkHistory,
                        onCloseLinkHistory = viewModel::closeCadastroLinkHistory,
                        onOpenWebApp = if (AppConfig.publicAppUrl.isBlank()) null else openWebApp,
                    )

                    MainTab.USERS -> UsersScreen(
                        state = state,
                        viewModel = viewModel,
                    )

                    MainTab.TEAMS -> TeamsScreen(
                        state = state,
                        viewModel = viewModel,
                    )

                    MainTab.SETTINGS -> SettingsScreen(
                        state = state,
                        viewModel = viewModel,
                    )

                    MainTab.AUDITORIA_LEMMIT -> AuditoriaLemmitScreen(
                        state = state,
                        viewModel = viewModel,
                    )

                    MainTab.FILA_UPLOAD_ERP -> FilaUploadErpScreen(
                        state = state,
                        viewModel = viewModel,
                    )

                    MainTab.ADESOES_EXCLUIDAS -> AdesoesExcluidasScreen(
                        state = state,
                        viewModel = viewModel,
                    )

                    MainTab.PERFIL -> ProfileScreen(
                        state = state,
                        viewModel = viewModel,
                        onLogout = viewModel::logout,
                        onRefresh = viewModel::refresh,
                        onToggleDarkMode = viewModel::setDarkModeEnabled,
                        onCheckAndInstallUpdate = {
                            viewModel.checkAndInstallAppUpdate(
                                context = context,
                                onInstallIntent = { intent -> context.startActivity(intent) },
                            )
                        },
                    )
                }

                if (state.loading && state.profile == null) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
            }

            MagicBottomNavigationBar(
                groups = navGroups,
                activeGroup = activeGroup,
                onGroupTap = { group ->
                    if (group.modules.size > 1) {
                        openGroupSheet = group.group.name
                    } else {
                        applyNavigationModule(viewModel, group.modules.first())
                    }
                },
            )
        }
    }

    val sheetGroup = navGroups.firstOrNull { it.group.name == openGroupSheet }
    if (sheetGroup != null) {
        NavigationGroupSheet(
            group = sheetGroup,
            state = state,
            onDismiss = { openGroupSheet = null },
            onSelect = { module ->
                applyNavigationModule(viewModel, module)
                openGroupSheet = null
            },
        )
    }

    state.errorMessage?.let { message ->
        val severity = resolveGlobalMessageSeverity(message)
        val (container, textColor) = globalMessageSeverityColors(severity)
        val title = when (severity) {
            GlobalMessageSeverity.SUCCESS -> "Sucesso"
            GlobalMessageSeverity.WARNING -> "Aviso"
            GlobalMessageSeverity.ALERT -> "Atencao"
            GlobalMessageSeverity.ERROR -> "Erro"
        }
        val titleColor = when (severity) {
            GlobalMessageSeverity.SUCCESS -> EmeraldDark
            GlobalMessageSeverity.ERROR -> Red500
            else -> BrandOrange
        }
        AlertDialog(
            onDismissRequest = viewModel::clearError,
            title = { Text(title, color = titleColor) },
            text = {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = container,
                    shape = RoundedCornerShape(10.dp),
                ) {
                    Text(
                        text = message,
                        color = textColor,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = viewModel::clearError) {
                    Text("OK")
                }
            },
        )
    }

    state.noticeMessage?.let { message ->
        val severity = resolveGlobalMessageSeverity(message)
        val dismissNotice: () -> Unit = viewModel::clearNotice
        val (container, textColor) = globalMessageSeverityColors(severity)
        val title = when (severity) {
            GlobalMessageSeverity.SUCCESS -> "Sucesso"
            GlobalMessageSeverity.WARNING -> "Aviso"
            GlobalMessageSeverity.ALERT -> "Atencao"
            GlobalMessageSeverity.ERROR -> "Erro"
        }
        val titleColor = when (severity) {
            GlobalMessageSeverity.SUCCESS -> EmeraldDark
            GlobalMessageSeverity.ERROR -> Red500
            else -> BrandOrange
        }
        AlertDialog(
            onDismissRequest = dismissNotice,
            title = { Text(title, color = titleColor) },
            text = {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = container,
                    shape = RoundedCornerShape(10.dp),
                ) {
                    Text(
                        text = message,
                        color = textColor,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = dismissNotice) {
                    Text("OK")
                }
            },
        )
    }

    state.pendingCadastroPrompt?.let { prompt ->
        AlertDialog(
            onDismissRequest = {
                if (!state.pendingCadastroActionLoading) {
                    viewModel.dismissPendingCadastroPrompt()
                }
            },
            title = { Text("Cadastro pendente encontrado") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        buildString {
                            append("Ja existe um cadastro pendente para este CPF")
                            prompt.empresaNome?.takeIf { it.isNotBlank() }?.let { append(" em $it") }
                            append(".")
                        },
                    )
                    Text("Voce pode continuar o rascunho atual ou apagar e recomecar.")
                    Text("Se apagar e recomecar, o pendente atual sera excluido para evitar conflito.")
                }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(
                        onClick = viewModel::dismissPendingCadastroPrompt,
                        enabled = !state.pendingCadastroActionLoading,
                    ) {
                        Text("Cancelar")
                    }
                    TextButton(
                        onClick = viewModel::restartPendingCadastro,
                        enabled = !state.pendingCadastroActionLoading,
                    ) {
                        if (state.pendingCadastroActionLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                            )
                        } else {
                            Text("Apagar e recomecar")
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = viewModel::continuePendingCadastro,
                    enabled = !state.pendingCadastroActionLoading,
                ) {
                    Text("Continuar")
                }
            },
        )
    }

    state.selectedCadastro?.let { cadastro ->
        if (cadastro.tipoCadastro == "cadastro" && isPendingCadastroStatus(cadastro.status)) {
            CadastroEditorDialog(
                state = state,
                viewModel = viewModel,
                cadastro = cadastro,
                onDismiss = viewModel::closeCadastro,
            )
        } else if (cadastro.tipoCadastro == "inclusao_dependente" && isPendingCadastroStatus(cadastro.status)) {
            InclusaoDependenteDialog(
                state = state,
                viewModel = viewModel,
                cadastro = cadastro,
                onDismiss = viewModel::closeCadastro,
                onSuccess = {
                    viewModel.selectTab(MainTab.CADASTROS)
                    viewModel.selectCadastroAreaTab(CadastroAreaTab.DEPENDENTE)
                },
                onCompleted = {
                    viewModel.selectTab(MainTab.CADASTROS)
                    viewModel.selectCadastroAreaTab(CadastroAreaTab.COMPLETOS)
                },
            )
        } else {
            CadastroDetailDialog(
                cadastro = cadastro,
                sendingCadastro = state.sendingCadastro,
                onSendCadastro = null,
                onOpenWebApp = if (AppConfig.publicAppUrl.isBlank()) null else openWebApp,
                onDismiss = viewModel::closeCadastro,
            )
        }
    }

    CadastroOverlayDialogs(
        state = state,
        viewModel = viewModel,
    )
}

@Composable
private fun AppHeaderBar(
    profileName: String,
    profileRole: String,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding(),
        shadowElevation = 0.dp,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                VendaBrandIcon(
                    modifier = Modifier.size(36.dp),
                    showPlusBubble = false,
                )
                Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(
                        text = "Venda+",
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Bold,
                    )
                    val subtitle = listOf(profileName, profileRole)
                        .filter { it.isNotBlank() }
                        .joinToString(" • ")
                    if (subtitle.isNotBlank()) {
                        Text(
                            text = subtitle,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MagicBottomNavigationBar(
    groups: List<AppNavGroupItem>,
    activeGroup: AppNavGroup?,
    onGroupTap: (AppNavGroupItem) -> Unit,
) {
    if (groups.isEmpty()) return

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding(),
        shadowElevation = 0.dp,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 6.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            groups.take(5).forEach { group ->
                val selected = group.group == activeGroup
                val iconScale by animateFloatAsState(
                    targetValue = if (selected) 1f else 0.94f,
                    animationSpec = tween(durationMillis = 180, easing = FastOutSlowInEasing),
                    label = "nav_icon_scale",
                )
                val labelAlpha by animateFloatAsState(
                    targetValue = if (selected) 1f else 0.72f,
                    animationSpec = tween(durationMillis = 160),
                    label = "nav_label_alpha",
                )
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onGroupTap(group) }
                        .padding(horizontal = 2.dp, vertical = 3.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Surface(
                        modifier = Modifier.size(width = 44.dp, height = 32.dp),
                        shape = RoundedCornerShape(16.dp),
                        color = if (selected) EmeraldSoft else Color.Transparent,
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = group.icon,
                                contentDescription = group.label,
                                tint = if (selected) Emerald else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .size(20.dp)
                                    .graphicsLayer(scaleX = iconScale, scaleY = iconScale),
                            )
                        }
                    }
                    Text(
                        text = group.label,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (selected) Emerald else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.graphicsLayer(alpha = labelAlpha),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NavigationGroupSheet(
    group: AppNavGroupItem,
    state: AppUiState,
    onDismiss: () -> Unit,
    onSelect: (AppNavModule) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = group.label,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            group.modules.forEachIndexed { index, module ->
                val selected = isNavigationModuleActive(state, module)
                Surface(
                    onClick = { onSelect(module) },
                    shape = RoundedCornerShape(14.dp),
                    color = if (selected) EmeraldSoft else MaterialTheme.colorScheme.surface,
                    border = BorderStroke(
                        width = 1.dp,
                        color = if (selected) Emerald.copy(alpha = 0.35f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.45f),
                    ),
                ) {
                    Column {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Surface(
                                    modifier = Modifier.size(30.dp),
                                    shape = CircleShape,
                                    color = if (selected) Emerald else MaterialTheme.colorScheme.surfaceVariant,
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            imageVector = module.icon,
                                            contentDescription = module.label,
                                            tint = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.size(17.dp),
                                        )
                                    }
                                }
                                Text(
                                    text = module.label,
                                    color = if (selected) Emerald else MaterialTheme.colorScheme.onSurface,
                                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                                )
                            }
                            if (selected) {
                                Surface(
                                    modifier = Modifier.size(8.dp),
                                    shape = CircleShape,
                                    color = Emerald,
                                ) {}
                            }
                        }
                        if (index < group.modules.lastIndex) {
                            HorizontalDivider(
                                modifier = Modifier.padding(horizontal = 14.dp),
                                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f),
                            )
                        }
                    }
                }
            }
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.align(Alignment.End),
            ) {
                Text("Fechar")
            }
        }
    }
}

private fun resolveNavigationGroups(roleRaw: String?): List<AppNavGroupItem> {
    val role = roleRaw?.uppercase(Locale.ROOT).orEmpty()

    val inicio = AppNavGroupItem(
        group = AppNavGroup.INICIO,
        label = "Inicio",
        icon = Icons.Rounded.Dashboard,
        modules = listOf(
            AppNavModule(
                key = "dashboard",
                label = "Dashboard",
                icon = Icons.Rounded.Dashboard,
                tab = MainTab.DASHBOARD,
            ),
        ),
    )
    val operacao = AppNavGroupItem(
        group = AppNavGroup.OPERACAO,
        label = "Cadastros",
        icon = Icons.Rounded.Description,
        modules = listOf(
            AppNavModule("cadastros", "Cadastros", Icons.Rounded.Description, MainTab.CADASTROS),
        ),
    )
    val pessoasCompleto = AppNavGroupItem(
        group = AppNavGroup.PESSOAS,
        label = "Pessoas",
        icon = Icons.Rounded.Groups,
        modules = listOf(
            AppNavModule("users", "Usuarios", Icons.Rounded.AccountCircle, MainTab.USERS),
            AppNavModule("teams", "Equipes", Icons.Rounded.Groups, MainTab.TEAMS),
        ),
    )
    val pessoasEquipes = AppNavGroupItem(
        group = AppNavGroup.PESSOAS,
        label = "Pessoas",
        icon = Icons.Rounded.Groups,
        modules = listOf(
            AppNavModule("teams", "Equipes", Icons.Rounded.Groups, MainTab.TEAMS),
        ),
    )
    val administracao = AppNavGroupItem(
        group = AppNavGroup.ADMINISTRACAO,
        label = "Admin",
        icon = Icons.Rounded.Settings,
        modules = listOf(
            AppNavModule("settings", "Configuracoes", Icons.Rounded.Settings, MainTab.SETTINGS),
            AppNavModule("aud_lemmit", "Auditoria Lemmit", Icons.Rounded.Description, MainTab.AUDITORIA_LEMMIT),
            AppNavModule("fila_upload", "Fila Upload ERP", Icons.Rounded.Refresh, MainTab.FILA_UPLOAD_ERP),
            AppNavModule("adesoes_exc", "Adesoes Excluidas", Icons.Rounded.Description, MainTab.ADESOES_EXCLUIDAS),
        ),
    )
    val conta = AppNavGroupItem(
        group = AppNavGroup.CONTA,
        label = "Conta",
        icon = Icons.Rounded.AccountCircle,
        modules = listOf(
            AppNavModule("perfil", "Meu Perfil", Icons.Rounded.AccountCircle, MainTab.PERFIL),
        ),
    )

    return when (role) {
        "ADMINISTRADOR", "ADMIN" -> listOf(inicio, operacao, pessoasCompleto, administracao, conta)
        "GERENTE", "SUPERVISOR" -> listOf(inicio, operacao, pessoasCompleto, conta)
        "CADASTRO", "VENDEDOR", "ADESIONISTA" -> {
            val groups = mutableListOf(inicio, operacao)
            if (canSeeEquipes(role)) groups.add(pessoasEquipes)
            groups.add(conta)
            groups
        }
        "GESTOR" -> listOf(inicio, operacao, conta)
        else -> listOf(inicio, operacao, conta)
    }
}

private fun canSeeEquipes(role: String): Boolean {
    return role in setOf(
        "ADMINISTRADOR",
        "ADMIN",
        "GERENTE",
        "SUPERVISOR",
        "CADASTRO",
        "VENDEDOR",
        "ADESIONISTA",
    )
}

private fun resolveActiveGroup(activeTab: MainTab): AppNavGroup {
    return when (activeTab) {
        MainTab.DASHBOARD -> AppNavGroup.INICIO
        MainTab.CADASTROS -> AppNavGroup.OPERACAO
        MainTab.USERS, MainTab.TEAMS -> AppNavGroup.PESSOAS
        MainTab.SETTINGS,
        MainTab.AUDITORIA_LEMMIT,
        MainTab.FILA_UPLOAD_ERP,
        MainTab.ADESOES_EXCLUIDAS,
        -> AppNavGroup.ADMINISTRACAO
        MainTab.PERFIL -> AppNavGroup.CONTA
    }
}

private fun applyNavigationModule(
    viewModel: AppViewModel,
    module: AppNavModule,
) {
    viewModel.selectTab(module.tab)
    if (module.tab == MainTab.CADASTROS) {
        module.cadastroArea?.let(viewModel::selectCadastroAreaTab)
        module.cadastroFiltro?.let(viewModel::selectCadastroFiltro)
    }
}

private fun isNavigationModuleActive(
    state: AppUiState,
    module: AppNavModule,
): Boolean {
    if (state.activeTab != module.tab) return false
    if (module.tab != MainTab.CADASTROS) return true
    if (module.cadastroArea != null && state.cadastroTab != module.cadastroArea) return false
    if (module.cadastroFiltro != null && state.cadastroFiltro != module.cadastroFiltro) return false
    return true
}

private enum class GlobalMessageSeverity {
    WARNING,
    ALERT,
    ERROR,
    SUCCESS,
}

private fun resolveGlobalMessageSeverity(message: String): GlobalMessageSeverity {
    val normalized = message.lowercase(Locale.ROOT)
    return when {
        normalized.contains("sucesso") -> GlobalMessageSeverity.SUCCESS
        normalized.contains("falha") || normalized.contains("erro") || normalized.contains("invalid input syntax") -> GlobalMessageSeverity.ERROR
        normalized.contains("obrigatorio") || normalized.contains("invalido") || normalized.contains("selecione") -> GlobalMessageSeverity.ALERT
        else -> GlobalMessageSeverity.WARNING
    }
}

@Composable
private fun globalMessageSeverityColors(severity: GlobalMessageSeverity): Pair<Color, Color> {
    val darkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f
    return when (severity) {
        GlobalMessageSeverity.SUCCESS ->
            if (darkTheme) MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
            else EmeraldSoft to EmeraldDark
        GlobalMessageSeverity.WARNING ->
            if (darkTheme) Color(0xFF4A3A1E) to Color(0xFFFFDE9E)
            else Amber100 to Amber500
        GlobalMessageSeverity.ALERT ->
            if (darkTheme) Color(0xFF4B2F1F) to Color(0xFFFFC39A)
            else BrandOrange.copy(alpha = 0.18f) to BrandOrange
        GlobalMessageSeverity.ERROR ->
            if (darkTheme) MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
            else Red100 to Red500
    }
}

@Composable
private fun TopBarActionButton(
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .padding(10.dp),
            contentAlignment = Alignment.Center,
        ) {
            content()
        }
    }
}
