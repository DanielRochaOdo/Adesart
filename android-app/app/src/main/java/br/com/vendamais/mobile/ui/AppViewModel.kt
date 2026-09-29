package br.com.vendamais.mobile.ui

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import br.com.vendamais.mobile.AppConfig
import br.com.vendamais.mobile.data.auth.SavedSession
import br.com.vendamais.mobile.data.auth.SessionStore
import br.com.vendamais.mobile.data.auth.SupabaseAuthService
import br.com.vendamais.mobile.data.models.AdminTeam
import br.com.vendamais.mobile.data.models.AdminUser
import br.com.vendamais.mobile.data.models.ApiLogItem
import br.com.vendamais.mobile.data.models.AuditLemmitResponse
import br.com.vendamais.mobile.data.models.CadastroConfig
import br.com.vendamais.mobile.data.models.CadastroDetalhe
import br.com.vendamais.mobile.data.models.CadastroEndereco
import br.com.vendamais.mobile.data.models.CadastroExcluidoItem
import br.com.vendamais.mobile.data.models.CadastroLinkHistoryRow
import br.com.vendamais.mobile.data.models.CadastroLinkHistorySummary
import br.com.vendamais.mobile.data.models.CadastroLinkItem
import br.com.vendamais.mobile.data.models.CadastroLinkMetrics
import br.com.vendamais.mobile.data.models.CadastroResumo
import br.com.vendamais.mobile.data.models.CadastroStats
import br.com.vendamais.mobile.data.models.CpfConsultInput
import br.com.vendamais.mobile.data.models.ErpUploadQueueItem
import br.com.vendamais.mobile.data.models.EmpresaResumo
import br.com.vendamais.mobile.data.models.EmpresaSearchType
import br.com.vendamais.mobile.data.models.MobileProfile
import br.com.vendamais.mobile.data.models.MobileTeam
import br.com.vendamais.mobile.data.models.ParentescoMap
import br.com.vendamais.mobile.data.models.PlanoMap
import br.com.vendamais.mobile.data.models.ProcessUploadQueueResponse
import br.com.vendamais.mobile.data.models.LemmitLimitInfo
import br.com.vendamais.mobile.data.models.LemmitResponse
import br.com.vendamais.mobile.data.models.PublicCadastroAuthenticateResponse
import br.com.vendamais.mobile.data.models.PublicCadastroCepResponse
import br.com.vendamais.mobile.data.models.PublicCadastroCheckCpfResponse
import br.com.vendamais.mobile.data.models.PublicCadastroContractPayload
import br.com.vendamais.mobile.data.models.PublicCadastroContractPrepareResponse
import br.com.vendamais.mobile.data.models.PublicCadastroDependentLookupResponse
import br.com.vendamais.mobile.data.models.PublicCadastroLinkResolveResponse
import br.com.vendamais.mobile.data.models.PublicCadastroPayload
import br.com.vendamais.mobile.data.models.PublicCadastroSubmitResponse
import br.com.vendamais.mobile.data.models.ResetStuckQueueResult
import br.com.vendamais.mobile.data.models.StatusAdesao
import br.com.vendamais.mobile.data.models.SystemOverview
import br.com.vendamais.mobile.data.models.TeamMemberOption
import br.com.vendamais.mobile.data.update.AppUpdateInfo
import br.com.vendamais.mobile.data.update.AppUpdateRepository
import br.com.vendamais.mobile.data.models.VendedorStats
import br.com.vendamais.mobile.domain.cadastro.CadastroApiErrorMapper
import br.com.vendamais.mobile.domain.cadastro.CadastroErpError
import br.com.vendamais.mobile.domain.cadastro.CadastroModalSignal
import br.com.vendamais.mobile.domain.cadastro.CadastroModalStateMachine
import br.com.vendamais.mobile.domain.cadastro.CadastroOverlayIntent
import br.com.vendamais.mobile.domain.cadastro.isPendingCadastroStatus
import br.com.vendamais.mobile.data.remote.CadastroPayloadBuilder
import br.com.vendamais.mobile.data.remote.CadastroExistenteException
import br.com.vendamais.mobile.data.remote.CadastroWorkflowRepository
import br.com.vendamais.mobile.data.remote.DraftUxStateCache
import br.com.vendamais.mobile.data.remote.DraftAttachmentStorage
import br.com.vendamais.mobile.data.remote.InclusaoBuscaTipo
import br.com.vendamais.mobile.data.remote.ResponsavelFinanceiroResumo
import br.com.vendamais.mobile.data.remote.SupabaseRepository
import br.com.vendamais.mobile.data.remote.UploadedTempFile
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.Locale
import java.io.File

enum class MainTab {
    DASHBOARD,
    CADASTROS,
    USERS,
    TEAMS,
    SETTINGS,
    AUDITORIA_LEMMIT,
    FILA_UPLOAD_ERP,
    ADESOES_EXCLUIDAS,
    PERFIL,
}

enum class CadastroAreaTab {
    NOVO,
    LINK,
    DEPENDENTE,
    INCOMPLETOS,
    COMPLETOS,
}

enum class CadastroFiltro {
    PENDENTES,
    ENVIADOS,
}

enum class DashboardMetricType {
    TOTAL,
    PENDENTES,
    CADASTRADOS,
}

data class DashboardDrilldown(
    val title: String,
    val metricType: DashboardMetricType,
    val items: List<VendedorStats>,
)

data class PendingCadastroPrompt(
    val cadastroId: String,
    val cpf: String,
    val empresaNome: String? = null,
)

data class CadastroWorkspaceState(
    val config: CadastroConfig? = null,
    val empresaSearchType: EmpresaSearchType = EmpresaSearchType.CODIGO,
    val empresaSearchValue: String = "",
    val empresaSearchResults: List<EmpresaResumo> = emptyList(),
    val selectedEmpresa: EmpresaResumo? = null,
    val selectedVendedorId: String = "",
    val selectedAdesionistaId: String = "",
    val cpfValue: String = "",
    val operationLoading: Boolean = false,
)

data class LinkWorkspaceState(
    val selectedAdesionistaId: String = "",
    val empresaSearchType: EmpresaSearchType = EmpresaSearchType.CODIGO,
    val empresaSearchValue: String = "",
    val empresaSearchResults: List<EmpresaResumo> = emptyList(),
    val selectedEmpresa: EmpresaResumo? = null,
    val operationLoading: Boolean = false,
    val links: List<CadastroLinkItem> = emptyList(),
    val metricsByLinkId: Map<String, CadastroLinkMetrics> = emptyMap(),
    val historyLinkId: String? = null,
    val historySummary: CadastroLinkHistorySummary? = null,
    val historyRows: List<CadastroLinkHistoryRow> = emptyList(),
    val historyLoading: Boolean = false,
    val historyError: String? = null,
)

data class AppUiState(
    val email: String = "",
    val password: String = "",
    val darkModeEnabled: Boolean = false,
    val rememberConnected: Boolean = true,
    val loading: Boolean = true,
    val isAuthenticated: Boolean = false,
    val configurationMissing: Boolean = !AppConfig.isConfigured(),
    val profile: MobileProfile? = null,
    val team: MobileTeam? = null,
    val systemOverview: SystemOverview = SystemOverview(),
    val cadastroStats: CadastroStats = CadastroStats(),
    val cadastros: List<CadastroResumo> = emptyList(),
    val cadastrosLoading: Boolean = false,
    val cadastrosLoaded: Boolean = false,
    val cadastroSupportLoading: Boolean = false,
    val cadastroSupportLoaded: Boolean = false,
    val selectedCadastro: CadastroDetalhe? = null,
    val detailLoading: Boolean = false,
    val dashboardDrilldown: DashboardDrilldown? = null,
    val dashboardDrilldownLoading: Boolean = false,
    val vendedores: List<TeamMemberOption> = emptyList(),
    val adesionistas: List<TeamMemberOption> = emptyList(),
    val planosMap: List<PlanoMap> = emptyList(),
    val parentescosMap: List<ParentescoMap> = emptyList(),
    val statusAdesoes: List<StatusAdesao> = emptyList(),
    val cadastroWorkspace: CadastroWorkspaceState = CadastroWorkspaceState(),
    val linkWorkspace: LinkWorkspaceState = LinkWorkspaceState(),
    val sendingCadastro: Boolean = false,
    val adminUsers: List<AdminUser> = emptyList(),
    val adminTeams: List<AdminTeam> = emptyList(),
    val adminLoading: Boolean = false,
    val adminLoaded: Boolean = false,
    val auditLemmit: AuditLemmitResponse = AuditLemmitResponse(),
    val apiLogs: List<ApiLogItem> = emptyList(),
    val uploadQueue: List<ErpUploadQueueItem> = emptyList(),
    val uploadQueueOperation: ProcessUploadQueueResponse? = null,
    val resetQueueResult: ResetStuckQueueResult? = null,
    val cadastrosExcluidos: List<CadastroExcluidoItem> = emptyList(),
    val adminFeatureLoading: Boolean = false,
    val publicToken: String? = null,
    val cadastroOverlay: CadastroOverlayIntent? = null,
    val errorMessage: String? = null,
    val noticeMessage: String? = null,
    val pendingCadastroPrompt: PendingCadastroPrompt? = null,
    val pendingCadastroActionLoading: Boolean = false,
    val appUpdateInfo: AppUpdateInfo? = null,
    val appUpdateChecking: Boolean = false,
    val appUpdateDownloading: Boolean = false,
    val appUpdateError: String? = null,
    val activeTab: MainTab = MainTab.DASHBOARD,
    val cadastroTab: CadastroAreaTab = CadastroAreaTab.NOVO,
    val cadastroFiltro: CadastroFiltro = CadastroFiltro.PENDENTES,
)

class AppViewModel(
    private val sessionStore: SessionStore,
    private val authService: SupabaseAuthService,
    private val repository: SupabaseRepository,
    private val workflowRepository: CadastroWorkflowRepository,
    private val draftUxStateCache: DraftUxStateCache,
    private val appUpdateRepository: AppUpdateRepository,
) : ViewModel() {
    private val logTag = "VendaMaisApp"
    private val _uiState = MutableStateFlow(AppUiState())
    val uiState: StateFlow<AppUiState> = _uiState.asStateFlow()

    private var currentSession: SavedSession? = null
    private var inMemorySessionActive: Boolean = false
    private var cadastrosSyncJob: Job? = null
    private var cadastroDraftSaveJob: Job? = null
    private var cadastroDraftSaveSeq: Long = 0L
    private val cadastrosSyncIntervalMs = 25_000L
    @Volatile
    private var createDraftInFlight: Boolean = false

    init {
        viewModelScope.launch {
            sessionStore.darkModeFlow.collectLatest { enabled ->
                _uiState.update { it.copy(darkModeEnabled = enabled) }
            }
        }

        viewModelScope.launch {
            sessionStore.rememberConnectedFlow.collectLatest { enabled ->
                _uiState.update { it.copy(rememberConnected = enabled) }
            }
        }

        viewModelScope.launch {
            sessionStore.sessionFlow.collectLatest { session ->
                if (session == null && inMemorySessionActive) {
                    return@collectLatest
                }
                if (session != null) {
                    inMemorySessionActive = false
                }
                currentSession = session
                if (session == null) {
                    stopCadastrosAutoSync()
                    _uiState.update {
                        AppUiState(
                            email = it.email,
                            password = "",
                            darkModeEnabled = it.darkModeEnabled,
                            rememberConnected = it.rememberConnected,
                            loading = false,
                            configurationMissing = !AppConfig.isConfigured(),
                            appUpdateInfo = it.appUpdateInfo,
                            appUpdateChecking = it.appUpdateChecking,
                            appUpdateDownloading = it.appUpdateDownloading,
                            appUpdateError = it.appUpdateError,
                        )
                    }
                } else {
                    bootstrapSession(session)
                    updateCadastrosSyncState()
                }
            }
        }

        checkForAppUpdate()
    }

    fun updateEmail(value: String) {
        _uiState.update { it.copy(email = value, errorMessage = null, noticeMessage = null) }
    }

    fun updatePassword(value: String) {
        _uiState.update { it.copy(password = value, errorMessage = null, noticeMessage = null) }
    }

    fun setDarkModeEnabled(enabled: Boolean) {
        _uiState.update { it.copy(darkModeEnabled = enabled) }
        viewModelScope.launch {
            sessionStore.setDarkMode(enabled)
        }
    }

    fun setRememberConnected(enabled: Boolean) {
        _uiState.update { it.copy(rememberConnected = enabled) }
        viewModelScope.launch {
            sessionStore.setRememberConnected(enabled)
        }
    }

    fun updateEmpresaSearchType(type: EmpresaSearchType) {
        _uiState.update {
            it.copy(
                cadastroWorkspace = it.cadastroWorkspace.copy(
                    empresaSearchType = type,
                    empresaSearchValue = "",
                    empresaSearchResults = emptyList(),
                ),
            )
        }
    }

    fun updateEmpresaSearchValue(value: String) {
        _uiState.update {
            it.copy(
                cadastroWorkspace = it.cadastroWorkspace.copy(
                    empresaSearchValue = value,
                    empresaSearchResults = emptyList(),
                ),
            )
        }
    }

    fun updateCpfValue(value: String) {
        val digits = value.filter(Char::isDigit).take(11)
        _uiState.update {
            it.copy(
                cadastroWorkspace = it.cadastroWorkspace.copy(cpfValue = digits),
                errorMessage = null,
                noticeMessage = null,
            )
        }
    }

    fun updateLinkSearchType(type: EmpresaSearchType) {
        _uiState.update {
            it.copy(
                linkWorkspace = it.linkWorkspace.copy(
                    empresaSearchType = type,
                    empresaSearchValue = "",
                    empresaSearchResults = emptyList(),
                ),
            )
        }
    }

    fun updateLinkSearchValue(value: String) {
        _uiState.update {
            it.copy(
                linkWorkspace = it.linkWorkspace.copy(
                    empresaSearchValue = value,
                    empresaSearchResults = emptyList(),
                ),
            )
        }
    }

    fun selectLinkEmpresa(empresa: EmpresaResumo) {
        _uiState.update {
            it.copy(
                linkWorkspace = it.linkWorkspace.copy(
                    selectedEmpresa = empresa,
                    selectedAdesionistaId = "",
                    empresaSearchResults = emptyList(),
                    empresaSearchValue = "",
                ),
            )
        }
    }

    fun updateLinkAdesionista(value: String) {
        _uiState.update {
            it.copy(linkWorkspace = it.linkWorkspace.copy(selectedAdesionistaId = value))
        }
    }

    fun clearLinkEmpresa() {
        _uiState.update {
            it.copy(
                linkWorkspace = it.linkWorkspace.copy(
                    selectedEmpresa = null,
                    selectedAdesionistaId = "",
                    empresaSearchResults = emptyList(),
                    empresaSearchValue = "",
                ),
            )
        }
    }

    fun updateSelectedVendedor(value: String) {
        _uiState.update {
            it.copy(cadastroWorkspace = it.cadastroWorkspace.copy(selectedVendedorId = value))
        }
    }

    fun updateSelectedAdesionista(value: String) {
        _uiState.update {
            it.copy(cadastroWorkspace = it.cadastroWorkspace.copy(selectedAdesionistaId = value))
        }
    }

    fun selectEmpresa(empresa: EmpresaResumo) {
        val invalidCodes = _uiState.value.cadastroWorkspace.config?.codigosEmpresaInvalidos.orEmpty()
        val situacaoCode = empresa.codigoSituacao?.toString()
        if (!situacaoCode.isNullOrBlank() && invalidCodes.contains(situacaoCode)) {
            resolveCadastroOverlay(
                CadastroModalSignal(
                    empresaCanceladaNome = empresa.nomeFantasia.ifBlank {
                        empresa.razaoSocial.ifBlank { "Empresa sem nome" }
                    },
                ),
            )
            return
        }

        _uiState.update {
            it.copy(
                cadastroWorkspace = it.cadastroWorkspace.copy(
                    selectedEmpresa = empresa,
                    empresaSearchResults = emptyList(),
                    empresaSearchValue = "",
                ),
            )
        }

        empresa.observacoesResolvidas
            ?.takeIf { it.isNotBlank() }
            ?.let { observacoes ->
                resolveCadastroOverlay(
                    CadastroModalSignal(
                        empresaObservacaoNome = empresa.nomeFantasia.ifBlank {
                            empresa.razaoSocial.ifBlank { "Empresa sem nome" }
                        },
                        empresaObservacaoTexto = observacoes,
                    ),
                )
            }
    }

    fun clearSelectedEmpresa() {
        _uiState.update {
            it.copy(
                cadastroWorkspace = it.cadastroWorkspace.copy(
                    selectedEmpresa = null,
                    empresaSearchResults = emptyList(),
                    empresaSearchValue = "",
                ),
            )
        }
    }

    fun login() {
        val current = _uiState.value
        if (current.configurationMissing) {
            _uiState.update { it.copy(errorMessage = "Configure o Supabase em android-app/local.properties.") }
            return
        }
        if (current.email.isBlank() || current.password.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Informe email e senha.") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, errorMessage = null) }
            runCatching { authService.login(current.email.trim(), current.password) }
                .onSuccess { session ->
                    if (current.rememberConnected) {
                        inMemorySessionActive = false
                        sessionStore.save(session)
                        _uiState.update { it.copy(password = "") }
                    } else {
                        inMemorySessionActive = true
                        sessionStore.clearSavedSession()
                        currentSession = session
                        _uiState.update { it.copy(password = "") }
                        bootstrapSession(session)
                    }
                }
                .onFailure { throwable ->
                    Log.e(logTag, "Falha no login", throwable)
                    _uiState.update {
                        it.copy(
                            loading = false,
                            errorMessage = throwable.message ?: "Erro inesperado ao autenticar.",
                        )
                    }
                }
        }
    }

    fun logout() {
        stopCadastrosAutoSync()
        inMemorySessionActive = false
        currentSession = null
        viewModelScope.launch { sessionStore.clear() }
    }

    fun selectTab(tab: MainTab) {
        _uiState.update { it.copy(activeTab = tab, errorMessage = null, noticeMessage = null) }
        when (tab) {
            MainTab.CADASTROS -> ensureCadastroResourcesLoaded(force = true)
            MainTab.USERS,
            MainTab.TEAMS,
            MainTab.SETTINGS,
            -> ensureAdminResourcesLoaded()
            MainTab.AUDITORIA_LEMMIT -> loadAuditLemmit()
            MainTab.FILA_UPLOAD_ERP -> loadUploadQueue()
            MainTab.ADESOES_EXCLUIDAS -> loadCadastrosExcluidos()
            else -> Unit
        }
        updateCadastrosSyncState()
    }

    fun selectCadastroFiltro(filtro: CadastroFiltro) {
        _uiState.update { it.copy(cadastroFiltro = filtro) }
    }

    fun selectCadastroAreaTab(tab: CadastroAreaTab) {
        _uiState.update {
            it.copy(
                cadastroTab = tab,
                cadastroFiltro = when (tab) {
                    CadastroAreaTab.INCOMPLETOS -> CadastroFiltro.PENDENTES
                    CadastroAreaTab.COMPLETOS -> CadastroFiltro.ENVIADOS
                    else -> it.cadastroFiltro
                },
            )
        }

        if (tab in setOf(CadastroAreaTab.INCOMPLETOS, CadastroAreaTab.COMPLETOS)) {
            ensureCadastroResourcesLoaded()
        }
    }

    fun refresh() {
        currentSession?.let { session ->
            viewModelScope.launch { refreshAll(session) }
        }
        checkForAppUpdate(force = true)
    }

    fun checkForAppUpdate(force: Boolean = false) {
        if (!AppConfig.directUpdateEnabled || AppConfig.updateMetadataUrl.isBlank()) {
            _uiState.update { it.copy(appUpdateInfo = null, appUpdateChecking = false, appUpdateError = null) }
            return
        }
        if (!force && _uiState.value.appUpdateChecking) return
        viewModelScope.launch {
            _uiState.update { it.copy(appUpdateChecking = true, appUpdateError = null) }
            val currentVersionCode = runCatching { br.com.vendamais.mobile.BuildConfig.VERSION_CODE }.getOrDefault(0)
            val updateInfo = withContext(Dispatchers.IO) {
                appUpdateRepository.fetchUpdateInfo(AppConfig.updateMetadataUrl)
            }
            val availableUpdate = updateInfo?.takeIf { it.versionCode > currentVersionCode }
            _uiState.update {
                it.copy(
                    appUpdateInfo = availableUpdate,
                    appUpdateChecking = false,
                )
            }
        }
    }

    fun dismissAppUpdate() {
        _uiState.update { it.copy(appUpdateInfo = null, appUpdateError = null) }
    }

    fun installAppUpdate(onInstallIntent: (android.content.Intent) -> Unit, context: Context) {
        val update = _uiState.value.appUpdateInfo ?: return
        installAppUpdate(update, onInstallIntent, context)
    }

    private fun installAppUpdate(
        update: AppUpdateInfo,
        onInstallIntent: (android.content.Intent) -> Unit,
        context: Context,
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(appUpdateDownloading = true, appUpdateError = null) }
            Log.d(logTag, "Iniciando download da atualizacao ${update.versionName} (${update.versionCode}) em ${update.apkUrl}")
            val apkFile = withContext(Dispatchers.IO) {
                val cacheDir = File(context.cacheDir, "updates").apply { mkdirs() }
                val target = File(cacheDir, "vendamais-update.apk")
                appUpdateRepository.downloadApk(update.apkUrl, target)
            }
            _uiState.update { it.copy(appUpdateDownloading = false) }
            if (apkFile != null) {
                Log.d(logTag, "APK baixado em ${apkFile.absolutePath} tamanho=${apkFile.length()}")
                val uri = androidx.core.content.FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    apkFile,
                )
                Log.d(logTag, "URI gerada para instalacao: $uri")
                val intent = android.content.Intent(android.content.Intent.ACTION_INSTALL_PACKAGE).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                    putExtra(android.content.Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
                }
                runCatching { onInstallIntent(intent) }
                    .onFailure { throwable ->
                        Log.e(logTag, "Falha ao iniciar instalador", throwable)
                        _uiState.update { it.copy(appUpdateError = throwable.message ?: "Falha ao iniciar instalador.") }
                    }
            } else {
                Log.e(logTag, "Falha ao baixar o APK da atualizacao.")
                _uiState.update { it.copy(appUpdateError = "Nao foi possivel baixar a atualizacao.") }
            }
        }
    }

    fun checkAndInstallAppUpdate(
        context: Context,
        onInstallIntent: (android.content.Intent) -> Unit,
    ) {
        if (!AppConfig.directUpdateEnabled || AppConfig.updateMetadataUrl.isBlank()) {
            _uiState.update {
                it.copy(
                    appUpdateInfo = null,
                    appUpdateChecking = false,
                    appUpdateError = null,
                    noticeMessage = "Atualizacoes desta versao sao distribuidas pela Google Play.",
                )
            }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(appUpdateChecking = true, appUpdateError = null) }
            val currentVersionCode = runCatching { br.com.vendamais.mobile.BuildConfig.VERSION_CODE }.getOrDefault(0)
            val updateInfo = withContext(Dispatchers.IO) {
                appUpdateRepository.fetchUpdateInfo(AppConfig.updateMetadataUrl)
            }
            val availableUpdate = updateInfo?.takeIf { it.versionCode > currentVersionCode }
            _uiState.update {
                it.copy(
                    appUpdateInfo = availableUpdate,
                    appUpdateChecking = false,
                )
            }

            if (availableUpdate != null) {
                installAppUpdate(
                    update = availableUpdate,
                    onInstallIntent = onInstallIntent,
                    context = context,
                )
            } else {
                _uiState.update {
                    it.copy(
                        appUpdateChecking = false,
                        appUpdateError = null,
                        noticeMessage = "Nao ha atualizacoes disponiveis.",
                    )
                }
            }
        }
    }

    fun searchEmpresas() {
        val session = currentSession ?: return
        val state = _uiState.value
        val query = state.cadastroWorkspace.empresaSearchValue.trim()
        if (query.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Digite um valor para buscar a empresa.") }
            return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    cadastroWorkspace = it.cadastroWorkspace.copy(operationLoading = true),
                    errorMessage = null,
                    noticeMessage = null,
                )
            }

            runCatching {
                val activeSession = ensureFreshSession(session)
                workflowRepository.searchEmpresa(
                    session = activeSession,
                    value = query,
                    type = state.cadastroWorkspace.empresaSearchType,
                )
            }.onSuccess { empresas ->
                _uiState.update {
                    it.copy(
                        cadastroWorkspace = it.cadastroWorkspace.copy(
                            operationLoading = false,
                            empresaSearchResults = empresas,
                        ),
                        errorMessage = if (empresas.isEmpty()) "Nenhuma empresa encontrada." else null,
                    )
                }
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao buscar empresas", throwable)
                _uiState.update {
                    it.copy(
                        cadastroWorkspace = it.cadastroWorkspace.copy(operationLoading = false),
                        errorMessage = throwable.message ?: "Falha ao buscar empresa.",
                    )
                }
            }
        }
    }

    fun searchEmpresasForLink() {
        val session = currentSession ?: return
        val state = _uiState.value
        val query = state.linkWorkspace.empresaSearchValue.trim()
        if (query.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Digite um valor para buscar a empresa do link.") }
            return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    linkWorkspace = it.linkWorkspace.copy(operationLoading = true),
                    errorMessage = null,
                )
            }

            runCatching {
                val activeSession = ensureFreshSession(session)
                workflowRepository.searchEmpresa(
                    session = activeSession,
                    value = query,
                    type = state.linkWorkspace.empresaSearchType,
                )
            }.onSuccess { empresas ->
                _uiState.update {
                    it.copy(
                        linkWorkspace = it.linkWorkspace.copy(
                            operationLoading = false,
                            empresaSearchResults = empresas,
                        ),
                        errorMessage = if (empresas.isEmpty()) "Nenhuma empresa encontrada para o link." else null,
                    )
                }
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao buscar empresas para link", throwable)
                _uiState.update {
                    it.copy(
                        linkWorkspace = it.linkWorkspace.copy(operationLoading = false),
                        errorMessage = throwable.message ?: "Falha ao buscar empresa para link.",
                    )
                }
            }
        }
    }

    fun createCadastroLink() {
        val session = currentSession ?: return
        val profile = _uiState.value.profile ?: return
        val empresa = _uiState.value.linkWorkspace.selectedEmpresa
        val selectedAdesionistaId = _uiState.value.linkWorkspace.selectedAdesionistaId
        val adesionista = if (selectedAdesionistaId.isBlank()) null
            else _uiState.value.adesionistas.firstOrNull { it.id == selectedAdesionistaId }
        if (selectedAdesionistaId.isNotBlank() && adesionista == null) {
            _uiState.update { it.copy(errorMessage = "Adesionista indisponível. Atualize a lista e selecione novamente.") }
            return
        }
        if (empresa == null) {
            _uiState.update { it.copy(errorMessage = "Selecione uma empresa antes de gerar o link.") }
            return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    linkWorkspace = it.linkWorkspace.copy(operationLoading = true),
                    errorMessage = null,
                )
            }

            runCatching {
                val activeSession = ensureFreshSession(session)
                workflowRepository.createCadastroLink(activeSession, profile, empresa, adesionista)
                loadLinkWorkspaceData(activeSession)
            }.onSuccess { linkData ->
                _uiState.update {
                    it.copy(
                        linkWorkspace = it.linkWorkspace.copy(
                            operationLoading = false,
                            links = linkData.links,
                            metricsByLinkId = linkData.metricsByLinkId,
                            selectedEmpresa = null,
                            selectedAdesionistaId = "",
                            empresaSearchResults = emptyList(),
                        ),
                        errorMessage = "Link gerado com sucesso.",
                    )
                }
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao gerar link", throwable)
                _uiState.update {
                    it.copy(
                        linkWorkspace = it.linkWorkspace.copy(operationLoading = false),
                        errorMessage = throwable.message ?: "Falha ao gerar link.",
                    )
                }
            }
        }
    }

    fun regenerateCadastroLink(linkId: String) {
        val session = currentSession ?: return
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    linkWorkspace = it.linkWorkspace.copy(operationLoading = true),
                    errorMessage = null,
                )
            }
            runCatching {
                val activeSession = ensureFreshSession(session)
                workflowRepository.regenerateCadastroLink(activeSession, linkId)
                loadLinkWorkspaceData(activeSession)
            }.onSuccess { linkData ->
                _uiState.update {
                    it.copy(
                        linkWorkspace = it.linkWorkspace.copy(
                            operationLoading = false,
                            links = linkData.links,
                            metricsByLinkId = linkData.metricsByLinkId,
                        ),
                        errorMessage = "Link regerado com sucesso.",
                    )
                }
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao regerar link", throwable)
                _uiState.update {
                    it.copy(
                        linkWorkspace = it.linkWorkspace.copy(operationLoading = false),
                        errorMessage = throwable.message ?: "Falha ao regerar link.",
                    )
                }
            }
        }
    }

    fun deleteCadastroLink(linkId: String) {
        val session = currentSession ?: return
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    linkWorkspace = it.linkWorkspace.copy(operationLoading = true),
                    errorMessage = null,
                )
            }
            runCatching {
                val activeSession = ensureFreshSession(session)
                workflowRepository.deleteCadastroLink(activeSession, linkId)
                loadLinkWorkspaceData(activeSession)
            }.onSuccess { linkData ->
                _uiState.update {
                    it.copy(
                        linkWorkspace = it.linkWorkspace.copy(
                            operationLoading = false,
                            links = linkData.links,
                            metricsByLinkId = linkData.metricsByLinkId,
                        ),
                        errorMessage = "Link excluido com sucesso.",
                    )
                }
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao excluir link", throwable)
                _uiState.update {
                    it.copy(
                        linkWorkspace = it.linkWorkspace.copy(operationLoading = false),
                        errorMessage = throwable.message ?: "Falha ao excluir link.",
                    )
                }
            }
        }
    }

    fun openCadastroLinkHistory(linkId: String) {
        val session = currentSession ?: return
        if (linkId.isBlank()) return

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    linkWorkspace = it.linkWorkspace.copy(
                        historyLinkId = linkId,
                        historySummary = null,
                        historyRows = emptyList(),
                        historyLoading = true,
                        historyError = null,
                    ),
                )
            }

            runCatching {
                val activeSession = ensureFreshSession(session)
                workflowRepository.fetchCadastroLinkHistory(activeSession, linkId)
            }.onSuccess { response ->
                _uiState.update {
                    it.copy(
                        linkWorkspace = it.linkWorkspace.copy(
                            historySummary = response.summary,
                            historyRows = response.rows,
                            historyLoading = false,
                            historyError = null,
                        ),
                    )
                }
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao carregar historico do link", throwable)
                _uiState.update {
                    it.copy(
                        linkWorkspace = it.linkWorkspace.copy(
                            historyLoading = false,
                            historyError = throwable.message ?: "Nao foi possivel carregar o historico deste link.",
                        ),
                    )
                }
            }
        }
    }

    fun closeCadastroLinkHistory() {
        _uiState.update {
            it.copy(
                linkWorkspace = it.linkWorkspace.copy(
                    historyLinkId = null,
                    historySummary = null,
                    historyRows = emptyList(),
                    historyLoading = false,
                    historyError = null,
                ),
            )
        }
    }

    fun createDraftFromCpf() {
        val session = currentSession ?: return
        val state = _uiState.value
        val profile = state.profile ?: return
        val workspace = state.cadastroWorkspace
        if (createDraftInFlight || workspace.operationLoading) {
            return
        }
        val empresa = workspace.selectedEmpresa
        if (empresa == null) {
            _uiState.update { it.copy(errorMessage = "Selecione uma empresa antes de consultar o CPF.") }
            return
        }

        val invalidCodes = workspace.config?.codigosEmpresaInvalidos.orEmpty()
        val situacaoCode = empresa.codigoSituacao?.toString()
        if (!situacaoCode.isNullOrBlank() && invalidCodes.contains(situacaoCode)) {
            resolveCadastroOverlay(
                CadastroModalSignal(
                    empresaCanceladaNome = empresa.nomeFantasia.ifBlank {
                        empresa.razaoSocial.ifBlank { "Empresa sem nome" }
                    },
                ),
            )
            return
        }

        val cpf = CadastroPayloadBuilder.normalizeDigits(workspace.cpfValue)
        if (!CadastroPayloadBuilder.validateCpf(cpf)) {
            _uiState.update { it.copy(errorMessage = "CPF invalido. Verifique os digitos.") }
            return
        }

        val vendedorSelecionado = state.vendedores.firstOrNull { it.id == workspace.selectedVendedorId }
        if (requiresVendedorSelection(profile) && profile.role != "VENDEDOR" && state.vendedores.isEmpty()) {
            _uiState.update {
                it.copy(errorMessage = "Nenhum vendedor disponível. Entre em contato com o administrador.")
            }
            return
        }
        val vendedorVinculado = when (profile.role) {
            "VENDEDOR" -> !profile.externalId.isNullOrBlank()
            else -> !vendedorSelecionado?.externalId.isNullOrBlank()
        }
        if (requiresVendedorSelection(profile) && !vendedorVinculado) {
            val message = if (profile.role == "VENDEDOR") {
                "Seu usuário não possui código de vendedor. Contate o administrador."
            } else {
                "Selecione um vendedor antes de consultar."
            }
            _uiState.update { it.copy(errorMessage = message) }
            return
        }

        val adesionistaSelecionado = state.adesionistas.firstOrNull { it.id == workspace.selectedAdesionistaId }
        createDraftInFlight = true
        _uiState.update {
            it.copy(
                cadastroWorkspace = it.cadastroWorkspace.copy(operationLoading = true),
                errorMessage = null,
                pendingCadastroPrompt = null,
                pendingCadastroActionLoading = false,
            )
        }

        viewModelScope.launch {
            try {
                runCatching {
                    val activeSession = ensureFreshSession(session)
                    withContext(Dispatchers.IO) {
                        workflowRepository.createDraftFromCpf(
                            session = activeSession,
                            profile = profile,
                            config = state.cadastroWorkspace.config,
                            input = CpfConsultInput(
                                cpf = cpf,
                                empresa = empresa,
                                vendedorSelecionado = vendedorSelecionado,
                                adesionistaSelecionado = adesionistaSelecionado,
                            ),
                        )
                    }
                }.onSuccess { result ->
                    val warning = result.warningMessage.orEmpty()
                    val postSuccessNotice = warning
                        .takeIf {
                            it.isNotBlank() &&
                                !it.contains("Lemit", ignoreCase = true) &&
                                !it.contains("Lemmit", ignoreCase = true)
                        }
                    _uiState.update {
                        it.copy(
                            selectedCadastro = result.draft,
                            cadastroWorkspace = it.cadastroWorkspace.copy(
                                operationLoading = false,
                                cpfValue = "",
                                empresaSearchResults = emptyList(),
                            ),
                            errorMessage = null,
                            noticeMessage = postSuccessNotice,
                            pendingCadastroPrompt = null,
                            pendingCadastroActionLoading = false,
                        )
                    }
                    viewModelScope.launch refreshDraftList@{
                        val refreshSession = runCatching { ensureFreshSession(session) }.getOrNull()
                            ?: return@refreshDraftList
                        runCatching {
                            withContext(Dispatchers.IO) { repository.fetchCadastros(refreshSession) }
                        }.onSuccess { refreshed ->
                            _uiState.update { current -> current.copy(cadastros = refreshed) }
                        }.onFailure {
                            Log.w(logTag, "Rascunho criado; refresh da lista ficou para a proxima sincronizacao", it)
                        }
                    }
                    if (warning.contains("Limite mensal da Lemmit atingido", ignoreCase = true)) {
                        resolveCadastroOverlay(
                            CadastroModalSignal(
                                lemmitLimit = CadastroOverlayIntent.LemmitLimit(),
                            ),
                        )
                    } else if (warning.isNotBlank()) {
                        resolveCadastroOverlay(
                            CadastroModalSignal(
                                lemmitErrorMessage = warning,
                            ),
                        )
                    }
                }.onFailure { throwable ->
                    Log.e(logTag, "Falha ao consultar CPF e criar rascunho", throwable)
                    if (throwable is CadastroExistenteException && throwable.canContinue && !throwable.cadastroId.isNullOrBlank()) {
                        val activeSession = runCatching { ensureFreshSession(session) }.getOrNull()
                        val resolvedPrompt = if (activeSession != null) {
                            resolvePendingPromptByIdOrCpf(
                                session = activeSession,
                                cpf = cpf,
                                preferredCadastroId = throwable.cadastroId,
                            )
                        } else {
                            null
                        }
                        if (resolvedPrompt != null) {
                            _uiState.update {
                                it.copy(
                                    cadastroWorkspace = it.cadastroWorkspace.copy(operationLoading = false),
                                    errorMessage = null,
                                    pendingCadastroPrompt = resolvedPrompt,
                                    pendingCadastroActionLoading = false,
                                )
                            }
                            return@onFailure
                        }

                        Log.w(
                            logTag,
                            "createDraftFromCpf recebeu canContinue=true, mas nao encontrou pendente visivel id=${throwable.cadastroId} cpf=$cpf",
                        )
                        _uiState.update {
                            it.copy(
                                cadastroWorkspace = it.cadastroWorkspace.copy(operationLoading = false),
                                pendingCadastroPrompt = null,
                                pendingCadastroActionLoading = false,
                                errorMessage = "Nao foi encontrado cadastro pendente visivel para este CPF. Tente novamente.",
                            )
                        }
                    } else if (throwable is CadastroExistenteException && !throwable.canContinue) {
                        val promptFromList = runCatching {
                            val activeSession = ensureFreshSession(session)
                            resolvePendingPromptByIdOrCpf(
                                session = activeSession,
                                cpf = cpf,
                                preferredCadastroId = throwable.cadastroId,
                            )
                        }.getOrNull()

                        if (promptFromList != null) {
                            _uiState.update {
                                it.copy(
                                    cadastroWorkspace = it.cadastroWorkspace.copy(operationLoading = false),
                                    pendingCadastroPrompt = promptFromList,
                                    errorMessage = null,
                                    pendingCadastroActionLoading = false,
                                )
                            }
                            return@onFailure
                        }

                        resolveCadastroOverlay(
                            CadastroModalSignal(
                                alreadyExistsCpf = cpf,
                                alreadyExistsSummary = throwable.message.orEmpty().ifBlank {
                                    "Ja existe cadastro para este CPF."
                                },
                            ),
                        )
                        _uiState.update {
                            it.copy(
                                cadastroWorkspace = it.cadastroWorkspace.copy(operationLoading = false),
                                pendingCadastroPrompt = null,
                                errorMessage = null,
                                pendingCadastroActionLoading = false,
                            )
                        }
                    } else {
                        val duplicatePrompt = if (isDuplicatePendingConstraintError(throwable.message)) {
                            val activeSession = runCatching { ensureFreshSession(session) }.getOrNull()
                            activeSession?.let { resolvePendingPromptByCpf(it, cpf) }
                        } else {
                            null
                        }

                        if (duplicatePrompt != null) {
                            _uiState.update {
                                it.copy(
                                    cadastroWorkspace = it.cadastroWorkspace.copy(operationLoading = false),
                                    pendingCadastroPrompt = duplicatePrompt,
                                    pendingCadastroActionLoading = false,
                                    errorMessage = null,
                                )
                            }
                            return@onFailure
                        }

                        val erpError = CadastroApiErrorMapper.mapErpError(throwable.message)
                        if (erpError != null) {
                            resolveCadastroOverlay(CadastroModalSignal(erpError = erpError))
                        }
                        _uiState.update {
                            it.copy(
                                cadastroWorkspace = it.cadastroWorkspace.copy(operationLoading = false),
                                pendingCadastroPrompt = null,
                                errorMessage = mapCadastroFlowErrorMessage(
                                    throwable.message,
                                    "Falha ao criar rascunho.",
                                ),
                                pendingCadastroActionLoading = false,
                            )
                        }
                    }
                }
            } finally {
                createDraftInFlight = false
            }
        }
    }

    private suspend fun resolvePendingPromptByCpf(
        session: SavedSession,
        cpf: String,
    ): PendingCadastroPrompt? {
        return resolvePendingPromptByIdOrCpf(
            session = session,
            cpf = cpf,
            preferredCadastroId = null,
        )
    }

    private suspend fun resolvePendingPromptByIdOrCpf(
        session: SavedSession,
        cpf: String,
        preferredCadastroId: String?,
    ): PendingCadastroPrompt? {
        val localCadastros = _uiState.value.cadastros
        val fromLocalById = preferredCadastroId
            ?.takeIf { it.isNotBlank() }
            ?.let { findPendingPromptById(localCadastros, it) }
        if (fromLocalById != null) return fromLocalById

        val fromLocalByCpf = findPendingPromptByCpf(localCadastros, cpf)
        if (fromLocalByCpf != null) return fromLocalByCpf

        val refreshed = runCatching {
            withContext(Dispatchers.IO) { repository.fetchCadastros(session) }
        }.getOrNull() ?: return null

        _uiState.update { it.copy(cadastros = refreshed) }

        val fromRemoteById = preferredCadastroId
            ?.takeIf { it.isNotBlank() }
            ?.let { findPendingPromptById(refreshed, it) }
        if (fromRemoteById != null) return fromRemoteById

        return findPendingPromptByCpf(refreshed, cpf)
    }

    private fun findPendingPromptById(
        cadastros: List<CadastroResumo>,
        cadastroId: String,
    ): PendingCadastroPrompt? {
        val selected = cadastros.firstOrNull { cadastro ->
            cadastro.id == cadastroId &&
                isPendingCadastroStatus(cadastro.status)
        } ?: return null

        return PendingCadastroPrompt(
            cadastroId = selected.id,
            cpf = CadastroPayloadBuilder.normalizeDigits(selected.cpf),
            empresaNome = selected.empresaNome,
        )
    }

    private fun findPendingPromptByCpf(
        cadastros: List<CadastroResumo>,
        cpf: String,
    ): PendingCadastroPrompt? {
        val cpfDigits = CadastroPayloadBuilder.normalizeDigits(cpf)
        if (cpfDigits.length != 11) return null

        val selected = cadastros
            .asSequence()
            .filter { it.tipoCadastro == "cadastro" }
            .filter { isPendingCadastroStatus(it.status) }
            .filter { CadastroPayloadBuilder.normalizeDigits(it.cpf) == cpfDigits }
            .sortedByDescending { it.updatedAt }
            .firstOrNull()
            ?: return null

        return PendingCadastroPrompt(
            cadastroId = selected.id,
            cpf = cpfDigits,
            empresaNome = selected.empresaNome,
        )
    }

    private fun isDuplicatePendingConstraintError(message: String?): Boolean {
        return CadastroApiErrorMapper.isPendingCadastroConstraintViolation(message)
    }

    private fun maskCpfForLog(cpf: String?): String {
        val digits = cpf?.filter(Char::isDigit).orEmpty()
        if (digits.length != 11) return "-"
        return "***${digits.takeLast(4)}"
    }

    private fun cpfHashForLog(cpf: String?): String {
        val digits = cpf?.filter(Char::isDigit).orEmpty()
        if (digits.length != 11) return "-"
        val digest = java.security.MessageDigest.getInstance("SHA-256")
            .digest(digits.toByteArray(Charsets.UTF_8))
        return digest.take(4).joinToString("") { "%02x".format(it) }
    }

    fun openCadastro(id: String) {
        val session = currentSession ?: return
        val traceId = "open-${id.take(8)}-${System.currentTimeMillis()}"
        viewModelScope.launch {
            _uiState.update { it.copy(detailLoading = true, errorMessage = null) }
            runCatching {
                val activeSession = ensureFreshSession(session)
                Log.i("CadastroDraftTrace", "OPEN_START trace=$traceId id=$id")
                Log.i("CadastroDraftTrace", "OPEN_FETCH_START trace=$traceId id=$id")
                val detalhe = workflowRepository.fetchCadastroDetalhe(activeSession, id)
                val detalheBackfilled = workflowRepository.backfillCadastroMissingDataByCpf(activeSession, detalhe)
                applyDraftUxStateCache(detalheBackfilled)
            }.onSuccess { detalhe ->
                val dependentesCount = runCatching { detalhe.dependentes?.jsonArray?.size }.getOrNull() ?: 0
                Log.i(
                    "CadastroDraftTrace",
                    "OPEN_FETCH_OK trace=$traceId id=${detalhe.id} arquivoPath=${!detalhe.arquivoPath.isNullOrBlank()} arquivoNome=${!detalhe.arquivoNome.isNullOrBlank()} mime=${!detalhe.arquivoMimeType.isNullOrBlank()} tamanho=${detalhe.arquivoTamanho != null} dependentesCount=$dependentesCount",
                )
                _uiState.update {
                    it.copy(detailLoading = false, selectedCadastro = detalhe)
                }
                Log.i("CadastroDraftTrace", "OPEN_SELECTED_SET trace=$traceId id=${detalhe.id}")
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao carregar detalhe do cadastro", throwable)
                _uiState.update {
                    it.copy(
                        detailLoading = false,
                        errorMessage = throwable.message ?: "Falha ao carregar cadastro.",
                    )
                }
            }
        }
    }

    fun sendSelectedCadastro(
        cadastroSnapshot: CadastroDetalhe? = null,
        payloadHint: JsonObject? = null,
    ) {
        if (_uiState.value.sendingCadastro) return
        val session = currentSession
        if (session == null) {
            _uiState.update { it.copy(errorMessage = "Sua sessão expirou. Faça login novamente para continuar.") }
            return
        }
        val profile = _uiState.value.profile
        if (profile == null) {
            _uiState.update { it.copy(errorMessage = "Sua sessão expirou. Faça login novamente para continuar.") }
            return
        }
        val cadastroSelecionadoAtual = _uiState.value.selectedCadastro
        val cadastro = when {
            cadastroSnapshot == null && cadastroSelecionadoAtual != null -> cadastroSelecionadoAtual
            cadastroSnapshot != null && cadastroSelecionadoAtual == null -> cadastroSnapshot
            cadastroSnapshot == null && cadastroSelecionadoAtual == null -> return
            cadastroSnapshot != null && cadastroSelecionadoAtual != null && cadastroSnapshot.id == cadastroSelecionadoAtual.id -> cadastroSelecionadoAtual
            cadastroSelecionadoAtual != null && cadastroSelecionadoAtual.tipoCadastro == "cadastro" && isPendingCadastroStatus(cadastroSelecionadoAtual.status) -> {
                Log.w(
                    logTag,
                    "sendSelectedCadastro recebeu snapshot desatualizado snapshotId=${cadastroSnapshot?.id ?: "-"} selectedId=${cadastroSelecionadoAtual.id}; usando selectedCadastro atual.",
                )
                cadastroSelecionadoAtual
            }
            else -> cadastroSnapshot ?: return
        }
        val originalCadastroId = cadastro.id
        val sendTraceId = "send-${originalCadastroId.take(8)}-${System.currentTimeMillis()}"
        val fluxoContinuacaoPendente = cadastro.tipoCadastro == "cadastro" && isPendingCadastroStatus(cadastro.status)
        Log.i(
            logTag,
            "[$sendTraceId] clickCadastrar received originalCadastroId=$originalCadastroId status=${cadastro.status ?: "-"} tipo=${cadastro.tipoCadastro} continuarPendente=$fluxoContinuacaoPendente hasPayloadHint=${payloadHint != null}",
        )

        _uiState.update { it.copy(sendingCadastro = true, errorMessage = null) }
        viewModelScope.launch {
            runCatching {
                val activeSession = ensureFreshSession(session)
                val nomeFromPayload = payloadHint
                    ?.get("nome")
                    ?.jsonPrimitive
                    ?.contentOrNull
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                val dataNascimentoFromPayload = payloadHint
                    ?.get("data_nascimento")
                    ?.jsonPrimitive
                    ?.contentOrNull
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                val nomeMaeFromPayload = payloadHint
                    ?.get("nome_mae")
                    ?.jsonPrimitive
                    ?.contentOrNull
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                val contatosFromPayload = payloadHint?.get("contatos")
                val enderecoFromPayload = payloadHint?.get("endereco")
                val dependentesFromPayload = payloadHint?.get("dependentes")
                val titularPlanoFromPayload = runCatching {
                    dependentesFromPayload
                        ?.jsonArray
                        ?.firstOrNull()
                        ?.jsonObject
                        ?.get("plano")
                        ?.jsonPrimitive
                        ?.intOrNull
                }.getOrNull()
                val empresaIdFromPayload = payloadHint
                    ?.get("empresa_id")
                    ?.jsonPrimitive
                    ?.intOrNull
                val empresaCodigoFromPayload = payloadHint
                    ?.get("empresa_codigo")
                    ?.jsonPrimitive
                    ?.intOrNull
                val empresaNomeFromPayload = payloadHint
                    ?.get("empresa_nome")
                    ?.jsonPrimitive
                    ?.contentOrNull
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                val empresaCnpjFromPayload = payloadHint
                    ?.get("empresa_cnpj")
                    ?.jsonPrimitive
                    ?.contentOrNull
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                val empresaRawFromPayload = payloadHint?.get("empresa_raw")
                val planosRawFromPayload = payloadHint?.get("planos_raw")
                val numeroMatriculaFromPayload = payloadHint
                    ?.get("numero_matricula")
                    ?.jsonPrimitive
                    ?.contentOrNull
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                val statusAdesaoIdFromPayload = payloadHint
                    ?.get("status_adesao_id")
                    ?.jsonPrimitive
                    ?.contentOrNull
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                val arquivoPathFromPayload = payloadHint
                    ?.get("arquivo_path")
                    ?.jsonPrimitive
                    ?.contentOrNull
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                val cpfFromPayload = runCatching {
                    payloadHint
                        ?.get("cpf")
                        ?.jsonPrimitive
                        ?.contentOrNull
                        ?.let(CadastroPayloadBuilder::normalizeDigits)
                        ?.takeIf { it.length == 11 }
                }.getOrNull()
                val cpfFromTitularPayload = runCatching {
                    payloadHint
                        ?.get("dependentes")
                        ?.jsonArray
                        ?.firstOrNull()
                        ?.jsonObject
                        ?.get("cpf")
                        ?.jsonPrimitive
                        ?.contentOrNull
                        ?.let(CadastroPayloadBuilder::normalizeDigits)
                        ?.takeIf { it.length == 11 }
                }.getOrNull()
                val cpfFromSnapshot = CadastroPayloadBuilder.normalizeDigits(cadastro.cpf).takeIf { it.length == 11 }
                val cpfForUpdate = cpfFromPayload ?: cpfFromTitularPayload ?: cpfFromSnapshot
                val arquivoPathForSend = arquivoPathFromPayload
                    ?: cadastro.arquivoPath
                        ?.trim()
                        ?.takeIf { it.isNotBlank() }
                val arquivoNomeForSend = payloadHint
                    ?.get("arquivo_nome")
                    ?.jsonPrimitive
                    ?.contentOrNull
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                    ?: arquivoPathForSend?.substringAfterLast('/')
                val arquivoMimeTypeForSend = payloadHint
                    ?.get("arquivo_mime_type")
                    ?.jsonPrimitive
                    ?.contentOrNull
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                    ?: "application/octet-stream"
                val arquivoPathFinalForSend = when {
                    arquivoPathForSend.isNullOrBlank() -> null
                    File(arquivoPathForSend).exists() -> {
                        val bytes = withContext(Dispatchers.IO) { File(arquivoPathForSend).readBytes() }
                        val uploaded = uploadTempFile(
                            fileName = arquivoNomeForSend ?: File(arquivoPathForSend).name,
                            mimeType = arquivoMimeTypeForSend,
                            bytes = bytes,
                            prefix = "cadastros/${cadastro.id}",
                        )
                        uploaded.path
                    }
                    else -> arquivoPathForSend
                }
                val numeroMatriculaFromSnapshot = cadastro.numeroMatricula
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                val numeroMatriculaForUpdate = numeroMatriculaFromPayload ?: numeroMatriculaFromSnapshot
                val origemMatricula = when {
                    !numeroMatriculaFromPayload.isNullOrBlank() -> "form_payload_hint"
                    !numeroMatriculaFromSnapshot.isNullOrBlank() -> "cadastro_snapshot"
                    else -> "ausente"
                }
                val cpfDigitsForConflictCheck = cpfForUpdate
                    ?.let(CadastroPayloadBuilder::normalizeDigits)
                    ?.takeIf { it.length == 11 }
                val foreignConflict = cpfDigitsForConflictCheck?.let { cpfDigits ->
                    workflowRepository.inspectCpfExistente(
                        session = activeSession,
                        userId = profile.id,
                        cpf = cpfDigits,
                    )
                }
                val foreignConflictId = foreignConflict
                    ?.cadastroId
                    ?.trim()
                    .orEmpty()
                if (foreignConflict?.exists == true && foreignConflictId != originalCadastroId) {
                    Log.w(
                        logTag,
                        "[$sendTraceId] blocked foreignCpfConflict originalCadastroId=$originalCadastroId conflictId=${foreignConflictId.ifBlank { "-" }} cpf=${maskCpfForLog(cpfDigitsForConflictCheck)} status=${foreignConflict.status ?: "-"} canContinue=${foreignConflict.canContinue} arquivoPath=${arquivoPathFinalForSend.orEmpty()}",
                    )
                    throw IllegalStateException(
                        "Detectamos outro cadastro ativo para este CPF. Reabra o cadastro correto ou consolide os registros antes de finalizar.",
                    )
                }
                Log.i(
                    logTag,
                    "[$sendTraceId] preflight operation=update originalCadastroId=$originalCadastroId status=${cadastro.status ?: "-"} cpf=${maskCpfForLog(cpfForUpdate)} hasMatricula=${!numeroMatriculaForUpdate.isNullOrBlank()} matriculaLength=${numeroMatriculaForUpdate?.length ?: 0} matriculaSource=$origemMatricula arquivoPath=${arquivoPathFinalForSend.orEmpty().isNotBlank()} titularPlanoPayload=${titularPlanoFromPayload ?: 0}",
                )

                val cadastroBase = runCatching {
                    workflowRepository.updateCadastro(
                        session = activeSession,
                        id = originalCadastroId,
                        payload = buildJsonObject {
                            put("created_by", profile.id)
                            profile.teamId?.takeIf { it.isNotBlank() }?.let { put("team_id", it) }
                            put("tipo_cadastro", "cadastro")
                            cpfForUpdate?.let { put("cpf", it) }
                            nomeFromPayload
                                ?.let { put("nome", it) }
                                ?: cadastro.nome
                                ?.trim()
                                ?.takeIf { it.isNotBlank() }
                                ?.let { put("nome", it) }
                            dataNascimentoFromPayload
                                ?.let { put("data_nascimento", it) }
                                ?: cadastro.dataNascimento
                                ?.trim()
                                ?.takeIf { it.isNotBlank() }
                                ?.let { put("data_nascimento", it) }
                            nomeMaeFromPayload
                                ?.let { put("nome_mae", it) }
                                ?: cadastro.nomeMae
                                ?.trim()
                                ?.takeIf { it.isNotBlank() }
                                ?.let { put("nome_mae", it) }
                            contatosFromPayload?.let { put("contatos", it) } ?: cadastro.contatos?.let { put("contatos", it) }
                            enderecoFromPayload?.let { put("endereco", it) } ?: cadastro.endereco?.let { put("endereco", it) }
                            dependentesFromPayload?.let { put("dependentes", it) } ?: cadastro.dependentes?.let { put("dependentes", it) }
                            empresaIdFromPayload?.let { put("empresa_id", it) } ?: cadastro.empresaId?.let { put("empresa_id", it) }
                            empresaCodigoFromPayload?.let { put("empresa_codigo", it) } ?: cadastro.empresaCodigo?.let { put("empresa_codigo", it) }
                            empresaNomeFromPayload
                                ?.let { put("empresa_nome", it) }
                                ?: cadastro.empresaNome
                                ?.takeIf { it.isNotBlank() }
                                ?.let { put("empresa_nome", it) }
                            empresaCnpjFromPayload
                                ?.let { put("empresa_cnpj", it) }
                                ?: cadastro.empresaCnpj
                                ?.takeIf { it.isNotBlank() }
                                ?.let { put("empresa_cnpj", it) }
                            empresaRawFromPayload?.let { put("empresa_raw", it) } ?: cadastro.empresaRaw?.let { put("empresa_raw", it) }
                            planosRawFromPayload?.let { put("planos_raw", it) } ?: cadastro.planosRaw?.let { put("planos_raw", it) }
                            numeroMatriculaFromPayload?.let { put("numero_matricula", it) }
                                ?: cadastro.numeroMatricula
                                    ?.trim()
                                    ?.takeIf { it.isNotBlank() }
                                    ?.let { put("numero_matricula", it) }
                            statusAdesaoIdFromPayload?.let { put("status_adesao_id", it) }
                                ?: cadastro.statusAdesaoId
                                    ?.takeIf { it.isNotBlank() }
                                    ?.let { put("status_adesao_id", it) }
                            (arquivoPathFinalForSend ?: arquivoPathFromPayload)?.let { put("arquivo_path", it) } ?: cadastro.arquivoPath
                                ?.takeIf { it.isNotBlank() }
                                ?.let { put("arquivo_path", it) }
                        },
                    )
                }.getOrElse { throwable ->
                    if (!isDuplicatePendingConstraintError(throwable.message)) {
                        throw throwable
                    }

                    val cpfConflito = cpfForUpdate
                        ?.let(CadastroPayloadBuilder::normalizeDigits)
                        ?.takeIf { it.length == 11 }
                    Log.w(
                        logTag,
                        "[$sendTraceId] preflight duplicateConstraint idAtual=${cadastro.id} continuarPendente=$fluxoContinuacaoPendente tipo=${cadastro.tipoCadastro} status=${cadastro.status ?: "-"} cpf=${maskCpfForLog(cpfConflito)}",
                        throwable,
                    )

                    val idReconciliado = cpfConflito?.let { cpfDigits ->
                        workflowRepository.resolvePendingCadastroConflictIdByCpf(
                            session = activeSession,
                            currentUserId = profile.id,
                            cpfDigits = cpfDigits,
                            excludeCadastroId = cadastro.id,
                        )
                    }
                    if (!idReconciliado.isNullOrBlank()) {
                        Log.w(
                            logTag,
                            "[$sendTraceId] preflight duplicate reconciledByList idAnterior=${cadastro.id} idAtual=$idReconciliado",
                            throwable,
                        )
                        return@getOrElse workflowRepository.fetchCadastroDetalhe(activeSession, idReconciliado)
                    }

                    val checkConflict = cpfConflito?.let { cpfDigits ->
                        workflowRepository.inspectCpfExistente(
                            session = activeSession,
                            userId = profile.id,
                            cpf = cpfDigits,
                        )
                    }
                    Log.i(
                        logTag,
                        "[$sendTraceId] check_cpf_existente cpf=${maskCpfForLog(cpfConflito)} exists=${checkConflict?.exists ?: false} status=${checkConflict?.status ?: "-"} canContinue=${checkConflict?.canContinue ?: false} idRpc=${checkConflict?.cadastroId ?: "-"}",
                    )
                    val idFromCheckConflict = checkConflict
                        ?.cadastroId
                        ?.trim()
                        ?.takeIf { it.isNotBlank() && it != cadastro.id }
                    if (!idFromCheckConflict.isNullOrBlank()) {
                        Log.w(
                            logTag,
                            "[$sendTraceId] preflight duplicate reconciledByRpc idAnterior=${cadastro.id} idAtual=$idFromCheckConflict",
                            throwable,
                        )
                        return@getOrElse workflowRepository.fetchCadastroDetalhe(activeSession, idFromCheckConflict)
                    }

                    if (
                        checkConflict?.exists == true &&
                        isPendingCadastroStatus(checkConflict.status) &&
                        checkConflict.cadastroId?.trim() == cadastro.id
                    ) {
                        Log.w(
                            logTag,
                            "[$sendTraceId] preflight duplicate with same cadastro_id from rpc; continuing with current id=${cadastro.id}",
                            throwable,
                        )
                        return@getOrElse workflowRepository.fetchCadastroDetalhe(activeSession, cadastro.id)
                    }

                    val detalheAtual = runCatching {
                        workflowRepository.fetchCadastroDetalhe(activeSession, cadastro.id)
                    }.getOrNull()
                val cpfDetalheAtual = CadastroPayloadBuilder.normalizeDigits(detalheAtual?.cpf).takeIf { it.length == 11 }
                val selfPendingByContext =
                    detalheAtual?.tipoCadastro == "cadastro" &&
                            isPendingCadastroStatus(detalheAtual.status) &&
                            !cpfConflito.isNullOrBlank() &&
                            cpfDetalheAtual == cpfConflito
                    if (selfPendingByContext) {
                        Log.w(
                            logTag,
                            "[$sendTraceId] duplicate unresolved by rpc, but current pending context is valid id=${cadastro.id} cpf=${maskCpfForLog(cpfDetalheAtual)}; continuing with current cadastro.",
                            throwable,
                        )
                        return@getOrElse detalheAtual
                    }

                    if (checkConflict?.exists == true && isPendingCadastroStatus(checkConflict.status)) {
                        Log.w(
                            logTag,
                            "[$sendTraceId] preflight duplicate unresolved exists=${checkConflict.exists} canContinue=${checkConflict.canContinue} status=${checkConflict.status ?: "-"} idRpc=${checkConflict.cadastroId ?: "-"} idAtual=${cadastro.id}",
                        )
                        val mensagemBloqueio = if (checkConflict.canContinue) {
                            "Detectamos outro cadastro pendente para este CPF, mas nao foi possivel localizar o ID correto para continuidade. Atualize a lista de pendentes e tente novamente."
                        } else {
                            "Existe cadastro pendente para este CPF sem permissao de continuidade para o usuario atual. Solicite ao gestor a liberacao para continuar."
                        }
                        throw IllegalStateException(mensagemBloqueio)
                    }

                    if (fluxoContinuacaoPendente) {
                        val mensagemContexto = if (cpfConflito.isNullOrBlank()) {
                            "Nao foi possivel confirmar o CPF do cadastro pendente atual para concluir o envio. Reabra o pendente e tente novamente."
                        } else {
                            "Conflito de pendencia nao reconciliado para o cadastro atual. Reabra o pendente pela lista e tente novamente."
                        }
                        throw IllegalStateException(mensagemContexto)
                    }

                    throw throwable
                }
                if (cadastroBase.id != originalCadastroId) {
                    Log.w(
                        logTag,
                        "[$sendTraceId] blocked targetIdChange originalCadastroId=$originalCadastroId currentId=${cadastroBase.id}",
                    )
                    throw IllegalStateException(
                        "Detectamos reconciliação para outro cadastro durante a finalização. Reabra o cadastro correto ou consolide os registros antes de finalizar.",
                    )
                }
                val targetCadastroId = originalCadastroId
                Log.i(
                    logTag,
                    "[$sendTraceId] afterUpdate originalCadastroId=$originalCadastroId targetCadastroId=$targetCadastroId statusBeforeSend=${cadastroBase.status ?: "-"} arquivoPathPersisted=${!cadastroBase.arquivoPath.isNullOrBlank()}",
                )
                val cadastroComEmpresa = ensureCadastroEmpresaBeforeSend(
                    session = activeSession,
                    cadastroId = targetCadastroId,
                    fallbackEmpresa = _uiState.value.cadastroWorkspace.selectedEmpresa,
                    cachedCadastro = cadastroBase,
                )
                if (cadastroComEmpresa.id != originalCadastroId) {
                    Log.w(
                        logTag,
                        "[$sendTraceId] blocked empresaReconciliation originalCadastroId=$originalCadastroId currentId=${cadastroComEmpresa.id}",
                    )
                    throw IllegalStateException(
                        "Detectamos reconciliação para outro cadastro antes do envio. Reabra o cadastro correto ou consolide os registros antes de finalizar.",
                    )
                }
                val detalheAtualizado = workflowRepository.sendCadastroToErp(
                    session = activeSession,
                    profile = profile,
                    config = _uiState.value.cadastroWorkspace.config,
                    cadastroId = targetCadastroId,
                    cadastroPrefetched = cadastroComEmpresa,
                    enderecoHint = enderecoFromPayload,
                    arquivoPathHint = arquivoPathFinalForSend ?: arquivoPathForSend ?: cadastroComEmpresa.arquivoPath,
                    dependentesHint = dependentesFromPayload ?: cadastroComEmpresa.dependentes,
                    nomeHint = nomeFromPayload ?: cadastroComEmpresa.nome,
                    dataNascimentoHint = dataNascimentoFromPayload ?: cadastroComEmpresa.dataNascimento,
                    nomeMaeHint = nomeMaeFromPayload ?: cadastroComEmpresa.nomeMae,
                    numeroMatriculaHint = numeroMatriculaFromPayload
                        ?.trim()
                        ?.takeIf { it.isNotBlank() }
                        ?: cadastroComEmpresa.numeroMatricula
                            ?.trim()
                            ?.takeIf { it.isNotBlank() },
                    flowContext = if (fluxoContinuacaoPendente) "pending_continuation" else "regular_send",
                )
                Log.i(
                    logTag,
                    "[$sendTraceId] sendCadastroToErp finished originalCadastroId=$originalCadastroId targetCadastroId=$targetCadastroId statusAfterSend=${detalheAtualizado.status ?: "-"} arquivoPath=${arquivoPathFinalForSend.orEmpty()}",
                )
                if (!arquivoPathForSend.isNullOrBlank() && File(arquivoPathForSend).exists()) {
                    DraftAttachmentStorage.deleteDraftDirAfterSuccess(File(arquivoPathForSend).parentFile?.parentFile)
                }
                val successMessage = if (!arquivoPathFinalForSend.isNullOrBlank() || !arquivoPathForSend.isNullOrBlank()) {
                    "Cadastro enviado com sucesso ao ERP. O documento sera sincronizado automaticamente."
                } else {
                    "Cadastro enviado com sucesso ao ERP."
                }
                detalheAtualizado to successMessage
            }.onSuccess { (_, noticeMessage) ->
                Log.i(logTag, "[$sendTraceId] flowSuccess")
                draftUxStateCache.clear(originalCadastroId)
                _uiState.update {
                    it.copy(
                        sendingCadastro = false,
                        selectedCadastro = null,
                        errorMessage = null,
                        noticeMessage = noticeMessage,
                        cadastroOverlay = null,
                        activeTab = MainTab.CADASTROS,
                        cadastroTab = CadastroAreaTab.COMPLETOS,
                        cadastroFiltro = CadastroFiltro.ENVIADOS,
                    )
                }
                viewModelScope.launch refreshAfterSend@{
                    val refreshSession = runCatching { ensureFreshSession(session) }.getOrNull()
                        ?: return@refreshAfterSend
                    val (cadastrosResult, statsResult) = coroutineScope {
                        val cadastrosDeferred = async { runCatching { repository.fetchCadastros(refreshSession) } }
                        val statsDeferred = async { runCatching { repository.fetchCadastroStats(refreshSession) } }
                        cadastrosDeferred.await() to statsDeferred.await()
                    }
                    _uiState.update { current ->
                        current.copy(
                            cadastros = cadastrosResult.getOrElse {
                                Log.w(logTag, "Envio concluido; falhou refresh da lista em background", it)
                                current.cadastros
                            },
                            cadastroStats = statsResult.getOrElse {
                                Log.w(logTag, "Envio concluido; falhou refresh das estatisticas em background", it)
                                current.cadastroStats
                            },
                        )
                    }
                }
            }.onFailure { throwable ->
                Log.e(logTag, "[$sendTraceId] flowFailure", throwable)
                val erpError = CadastroApiErrorMapper.mapErpError(throwable.message)
                if (erpError != null) {
                    resolveCadastroOverlay(CadastroModalSignal(erpError = erpError))
                }
                _uiState.update {
                    it.copy(
                        sendingCadastro = false,
                        errorMessage = mapCadastroFlowErrorMessage(
                            throwable.message,
                            "Falha ao enviar cadastro.",
                        ),
                    )
                }
            }
        }
    }

    fun retrySendSelectedCadastroWithVendedor(
        vendedorCodigo: String,
        vendedorNome: String,
    ) {
        if (_uiState.value.sendingCadastro) return
        val session = currentSession
        if (session == null) {
            _uiState.update { it.copy(errorMessage = "Sua sessão expirou. Faça login novamente para continuar.") }
            return
        }
        val profile = _uiState.value.profile
        if (profile == null) {
            _uiState.update { it.copy(errorMessage = "Sua sessão expirou. Faça login novamente para continuar.") }
            return
        }
        val cadastro = _uiState.value.selectedCadastro ?: return
        if (vendedorCodigo.isBlank() || vendedorNome.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Informe codigo e nome do vendedor para reenviar.") }
            return
        }
        if (vendedorCodigo.toIntOrNull() == null) {
            _uiState.update { it.copy(errorMessage = "Codigo de vendedor invalido.") }
            return
        }
        val vendedorCodigoNormalizado = vendedorCodigo.trim()
        val vendedorNomeNormalizado = vendedorNome.trim()
        val vendedorValido = _uiState.value.vendedores.firstOrNull { option ->
            option.externalId?.trim() == vendedorCodigoNormalizado &&
                option.name.trim().equals(vendedorNomeNormalizado, ignoreCase = true)
        }
        if (vendedorValido == null) {
            _uiState.update {
                it.copy(
                    errorMessage = "Selecione um vendedor ativo e vinculado ao ERP para reenviar.",
                )
            }
            return
        }

        _uiState.update { it.copy(sendingCadastro = true, errorMessage = null) }
        viewModelScope.launch {
            runCatching {
                val activeSession = ensureFreshSession(session)
                val cadastroComVendedor = workflowRepository.updateCadastro(
                    session = activeSession,
                    id = cadastro.id,
                    payload = buildJsonObject {
                        put("vendedor_codigo", vendedorCodigoNormalizado)
                        put("vendedor_nome", vendedorNomeNormalizado)
                    },
                )
                val targetCadastroId = cadastroComVendedor.id.ifBlank { cadastro.id }
                if (targetCadastroId != cadastro.id) {
                    Log.w(
                        logTag,
                        "retrySendSelectedCadastroWithVendedor reconciliado para cadastro pendente existente idAnterior=${cadastro.id} idAtual=$targetCadastroId",
                    )
                }
                val cadastroComEmpresa = ensureCadastroEmpresaBeforeSend(
                    session = activeSession,
                    cadastroId = targetCadastroId,
                    fallbackEmpresa = _uiState.value.cadastroWorkspace.selectedEmpresa,
                    cachedCadastro = cadastroComVendedor,
                )
                if (cadastroComEmpresa.id != cadastro.id) {
                    Log.w(
                        logTag,
                        "retrySendSelectedCadastroWithVendedor bloqueado por troca de id originalCadastroId=${cadastro.id} currentId=${cadastroComEmpresa.id}",
                    )
                    throw IllegalStateException(
                        "Detectamos reconciliação para outro cadastro antes do reenvio. Reabra o cadastro correto ou consolide os registros antes de reenviar.",
                    )
                }
                val detalheAtualizado = workflowRepository.sendCadastroToErp(
                    session = activeSession,
                    profile = profile,
                    config = _uiState.value.cadastroWorkspace.config,
                    cadastroId = targetCadastroId,
                    cadastroPrefetched = cadastroComEmpresa,
                    enderecoHint = cadastroComEmpresa.endereco,
                    arquivoPathHint = cadastroComEmpresa.arquivoPath,
                    dependentesHint = cadastroComEmpresa.dependentes,
                    nomeHint = cadastroComEmpresa.nome,
                    dataNascimentoHint = cadastroComEmpresa.dataNascimento,
                    nomeMaeHint = cadastroComEmpresa.nomeMae,
                    numeroMatriculaHint = cadastroComEmpresa.numeroMatricula
                        ?.trim()
                        ?.takeIf { it.isNotBlank() },
                    flowContext = "retry_send",
                )
                val cadastrosResult = runCatching { repository.fetchCadastros(activeSession) }
                val statsResult = runCatching { repository.fetchCadastroStats(activeSession) }
                val notice = buildString {
                    append("Cadastro reenviado com sucesso.")
                    if (cadastrosResult.isFailure || statsResult.isFailure) {
                        append(" Houve falha ao atualizar a listagem local, mas o reenvio foi concluido.")
                    }
                }
                val cadastrosAtualizados = cadastrosResult.getOrElse {
                    Log.w(logTag, "Reenvio concluido, mas falhou ao atualizar lista de cadastros", it)
                    _uiState.value.cadastros
                }
                val statsAtualizadas = statsResult.getOrElse {
                    Log.w(logTag, "Reenvio concluido, mas falhou ao atualizar estatisticas", it)
                    _uiState.value.cadastroStats
                }
                Triple(detalheAtualizado, cadastrosAtualizados, statsAtualizadas) to notice
            }.onSuccess { (payload, noticeMessage) ->
                val (_, cadastrosAtualizados, statsAtualizadas) = payload
                dismissCadastroOverlay()
                _uiState.update {
                    it.copy(
                        sendingCadastro = false,
                        selectedCadastro = null,
                        cadastros = cadastrosAtualizados,
                        cadastroStats = statsAtualizadas,
                        noticeMessage = noticeMessage,
                        activeTab = MainTab.CADASTROS,
                        cadastroTab = CadastroAreaTab.COMPLETOS,
                        cadastroFiltro = CadastroFiltro.ENVIADOS,
                    )
                }
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao reenviar cadastro com vendedor ajustado", throwable)
                val erpError = CadastroApiErrorMapper.mapErpError(throwable.message)
                if (erpError != null) {
                    resolveCadastroOverlay(CadastroModalSignal(erpError = erpError))
                }
                _uiState.update {
                    it.copy(
                        sendingCadastro = false,
                        errorMessage = mapCadastroFlowErrorMessage(
                            throwable.message,
                            "Falha ao reenviar cadastro.",
                        ),
                    )
                }
            }
        }
    }

    fun deleteCadastroByOverlay(cadastroId: String, motivoExclusao: String) {
        if (cadastroId.isBlank()) return
        viewModelScope.launch {
            runCatching { deleteCadastroRecord(cadastroId, motivoExclusao) }
                .onSuccess {
                    dismissCadastroOverlay()
                    _uiState.update { it.copy(noticeMessage = "Cadastro excluido com sucesso.") }
                }
                .onFailure { throwable ->
                    _uiState.update { it.copy(errorMessage = throwable.message ?: "Falha ao excluir cadastro.") }
                }
        }
    }

    fun closeCadastro() {
        _uiState.update { it.copy(selectedCadastro = null, detailLoading = false, sendingCadastro = false) }
    }

    fun openDashboardDrilldown(tipoCadastro: String, metricType: DashboardMetricType) {
        val session = currentSession ?: return
        val profile = _uiState.value.profile ?: return
        if (profile.role !in setOf("ADMINISTRADOR", "ADMIN", "GERENTE", "GESTOR", "SUPERVISOR")) return

        val titlePrefix = when (metricType) {
            DashboardMetricType.TOTAL -> "Total"
            DashboardMetricType.PENDENTES -> "Pendentes"
            DashboardMetricType.CADASTRADOS -> "Enviados"
        }
        val titleSuffix = if (tipoCadastro == "cadastro") "Cadastro" else "Inclusao de Dependente"

        viewModelScope.launch {
            _uiState.update { it.copy(dashboardDrilldownLoading = true, errorMessage = null) }
            runCatching {
                val activeSession = ensureFreshSession(session)
                repository.fetchStatsByVendedor(activeSession, tipoCadastro)
            }.onSuccess { stats ->
                _uiState.update {
                    it.copy(
                        dashboardDrilldownLoading = false,
                        dashboardDrilldown = DashboardDrilldown(
                            title = "$titlePrefix por vendedor - $titleSuffix",
                            metricType = metricType,
                            items = stats,
                        ),
                    )
                }
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao carregar drilldown do dashboard", throwable)
                _uiState.update {
                    it.copy(
                        dashboardDrilldownLoading = false,
                        errorMessage = throwable.message ?: "Falha ao carregar detalhamento.",
                    )
                }
            }
        }
    }

    fun closeDashboardDrilldown() {
        _uiState.update { it.copy(dashboardDrilldown = null, dashboardDrilldownLoading = false) }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    fun clearNotice() {
        _uiState.update { it.copy(noticeMessage = null) }
    }

    fun dismissPendingCadastroPrompt() {
        if (_uiState.value.pendingCadastroActionLoading) return
        _uiState.update { it.copy(pendingCadastroPrompt = null) }
    }

    fun continuePendingCadastro() {
        if (_uiState.value.pendingCadastroActionLoading) return
        val prompt = _uiState.value.pendingCadastroPrompt ?: return
        val session = currentSession

        viewModelScope.launch {
            _uiState.update { it.copy(pendingCadastroActionLoading = true, errorMessage = null) }

            val resolvedPrompt = if (session != null) {
                val activeSession = runCatching { ensureFreshSession(session) }.getOrNull()
                if (activeSession != null) {
                    resolvePendingPromptByIdOrCpf(
                        session = activeSession,
                        cpf = prompt.cpf,
                        preferredCadastroId = prompt.cadastroId,
                    )
                } else {
                    null
                }
            } else {
                null
            }

            val targetCadastroId = prompt.cadastroId.ifBlank { resolvedPrompt?.cadastroId.orEmpty() }
            if (targetCadastroId.isBlank()) {
                _uiState.update {
                    it.copy(
                        pendingCadastroPrompt = null,
                        pendingCadastroActionLoading = false,
                        cadastroWorkspace = it.cadastroWorkspace.copy(operationLoading = false),
                        errorMessage = "Nao foi possivel localizar o cadastro pendente para continuar.",
                    )
                }
                return@launch
            }

            _uiState.update {
                it.copy(
                    pendingCadastroPrompt = null,
                    pendingCadastroActionLoading = false,
                    cadastroWorkspace = it.cadastroWorkspace.copy(
                        operationLoading = false,
                        cpfValue = "",
                        empresaSearchResults = emptyList(),
                    ),
                )
            }

            openCadastro(targetCadastroId)
        }
    }

    fun restartPendingCadastro() {
        val prompt = _uiState.value.pendingCadastroPrompt ?: return
        if (_uiState.value.pendingCadastroActionLoading) return

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    pendingCadastroActionLoading = true,
                    errorMessage = null,
                    noticeMessage = null,
                )
            }

            runCatching {
                deleteCadastroRecord(
                    id = prompt.cadastroId,
                    motivoExclusao = "Reinicio de adesao pendente pelo app mobile",
                )
            }.onSuccess {
                _uiState.update {
                    it.copy(
                        pendingCadastroPrompt = null,
                        pendingCadastroActionLoading = false,
                    )
                }
                createDraftFromCpf()
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao reiniciar cadastro pendente", throwable)
                _uiState.update {
                    it.copy(
                        pendingCadastroActionLoading = false,
                        errorMessage = mapCadastroFlowErrorMessage(
                            throwable.message,
                            "Falha ao reiniciar adesao pendente.",
                        ),
                    )
                }
            }
        }
    }

    fun openPublicTokenFlow(token: String) {
        val normalized = token.trim()
        if (normalized.isBlank()) return
        _uiState.update {
            it.copy(
                publicToken = normalized,
                errorMessage = null,
                noticeMessage = null,
            )
        }
    }

    fun closePublicTokenFlow() {
        _uiState.update { it.copy(publicToken = null, errorMessage = null, noticeMessage = null) }
    }

    fun resolveCadastroOverlay(signal: CadastroModalSignal) {
        val overlay = CadastroModalStateMachine.resolve(signal)
        _uiState.update { it.copy(cadastroOverlay = overlay) }
    }

    fun dismissCadastroOverlay() {
        _uiState.update { it.copy(cadastroOverlay = null) }
    }

    fun loadAuditLemmit(
        startIso: String? = null,
        endIso: String? = null,
        limit: Int = 100,
        offset: Int = 0,
    ) {
        val session = currentSession ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(adminFeatureLoading = true, errorMessage = null) }
            runCatching {
                val activeSession = ensureFreshSession(session)
                val periodStart = startIso ?: java.time.LocalDate.now()
                    .withDayOfMonth(1)
                    .atStartOfDay(java.time.ZoneOffset.UTC)
                    .toInstant()
                    .toString()
                val periodEnd = endIso ?: java.time.Instant.now().toString()
                repository.fetchAuditLemmit(
                    session = activeSession,
                    startIso = periodStart,
                    endIso = periodEnd,
                    limit = limit,
                    offset = offset,
                )
            }.onSuccess { audit ->
                _uiState.update {
                    it.copy(
                        adminFeatureLoading = false,
                        auditLemmit = audit,
                    )
                }
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao carregar auditoria lemmit", throwable)
                _uiState.update {
                    it.copy(
                        adminFeatureLoading = false,
                        errorMessage = throwable.message ?: "Falha ao carregar auditoria Lemmit.",
                    )
                }
            }
        }
    }

    fun loadUploadQueue(statuses: List<String> = emptyList()) {
        val session = currentSession ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(adminFeatureLoading = true, errorMessage = null) }
            runCatching {
                val activeSession = ensureFreshSession(session)
                repository.fetchErpUploadQueue(activeSession, statuses = statuses)
            }.onSuccess { queue ->
                _uiState.update {
                    it.copy(
                        adminFeatureLoading = false,
                        uploadQueue = queue,
                    )
                }
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao carregar fila upload ERP", throwable)
                _uiState.update {
                    it.copy(
                        adminFeatureLoading = false,
                        errorMessage = throwable.message ?: "Falha ao carregar fila de upload ERP.",
                    )
                }
            }
        }
    }

    fun processUploadQueue() {
        val session = currentSession ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(adminFeatureLoading = true, errorMessage = null) }
            runCatching {
                val activeSession = ensureFreshSession(session)
                repository.processUploadQueue(activeSession)
            }.onSuccess { result ->
                _uiState.update {
                    it.copy(
                        adminFeatureLoading = false,
                        uploadQueueOperation = result,
                        noticeMessage = result.message ?: "Processamento da fila iniciado.",
                    )
                }
                loadUploadQueue()
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao iniciar processamento de fila", throwable)
                _uiState.update {
                    it.copy(
                        adminFeatureLoading = false,
                        errorMessage = throwable.message ?: "Falha ao processar fila de upload ERP.",
                    )
                }
            }
        }
    }

    fun resetStuckQueue(minutes: Int = 15) {
        val session = currentSession ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(adminFeatureLoading = true, errorMessage = null) }
            runCatching {
                val activeSession = ensureFreshSession(session)
                repository.resetStuckQueue(activeSession, minutes)
            }.onSuccess { result ->
                _uiState.update {
                    it.copy(
                        adminFeatureLoading = false,
                        resetQueueResult = result,
                        noticeMessage = if (result.resetCount > 0) {
                            "${result.resetCount} item(ns) travado(s) foram resetados."
                        } else {
                            "Nenhum item travado encontrado."
                        },
                    )
                }
                loadUploadQueue()
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao resetar itens travados da fila", throwable)
                _uiState.update {
                    it.copy(
                        adminFeatureLoading = false,
                        errorMessage = throwable.message ?: "Falha ao resetar itens travados da fila.",
                    )
                }
            }
        }
    }

    fun loadCadastrosExcluidos(limit: Int = 1000) {
        val session = currentSession ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(adminFeatureLoading = true, errorMessage = null) }
            runCatching {
                val activeSession = ensureFreshSession(session)
                repository.fetchCadastrosExcluidos(activeSession, limit)
            }.onSuccess { items ->
                _uiState.update {
                    it.copy(
                        adminFeatureLoading = false,
                        cadastrosExcluidos = items,
                    )
                }
            }.onFailure { throwable ->
                Log.e(logTag, "Falha ao carregar adesoes excluidas", throwable)
                _uiState.update {
                    it.copy(
                        adminFeatureLoading = false,
                        errorMessage = throwable.message ?: "Falha ao carregar adesoes excluidas.",
                    )
                }
            }
        }
    }

    suspend fun resolvePublicCadastroLink(token: String, visitId: String): PublicCadastroLinkResolveResponse {
        return workflowRepository.resolvePublicCadastroLink(token, visitId)
    }

    suspend fun authenticatePublicCadastro(
        token: String,
        cpf: String,
        birthDate: String,
    ): PublicCadastroAuthenticateResponse {
        return workflowRepository.authenticatePublicCadastro(
            token = token,
            cpf = cpf,
            birthDate = birthDate,
        )
    }

    suspend fun consultarEnderecoCepPublicSecure(
        attemptToken: String,
        cep: String,
    ): PublicCadastroCepResponse {
        return workflowRepository.consultarEnderecoPorCepPublicSecure(attemptToken, cep)
    }

    suspend fun lookupPublicDependent(
        attemptToken: String,
        cpf: String,
    ): PublicCadastroDependentLookupResponse {
        return workflowRepository.lookupPublicDependent(attemptToken, cpf)
    }

    suspend fun preparePublicContract(
        attemptToken: String,
        confirmedEmail: String,
        cadastro: PublicCadastroContractPayload,
    ): PublicCadastroContractPrepareResponse {
        return workflowRepository.preparePublicContract(attemptToken, confirmedEmail, cadastro)
    }

    suspend fun submitPublicCadastroSecure(
        attemptToken: String,
        contractToken: String,
        acceptedTerms: Boolean,
        acceptedData: Boolean,
        acceptedCoverage: Boolean,
    ): PublicCadastroSubmitResponse {
        return workflowRepository.submitPublicCadastroSecure(
            attemptToken = attemptToken,
            contractToken = contractToken,
            acceptedTerms = acceptedTerms,
            acceptedData = acceptedData,
            acceptedCoverage = acceptedCoverage,
        )
    }

    suspend fun checkPublicCadastroCpf(token: String, cpf: String): PublicCadastroCheckCpfResponse {
        return workflowRepository.checkPublicCadastroCpf(token, cpf)
    }

    suspend fun submitPublicCadastro(
        token: String,
        payload: PublicCadastroPayload,
        idempotencyKey: String? = null,
    ): PublicCadastroSubmitResponse {
        return workflowRepository.submitPublicCadastro(token, payload, idempotencyKey)
    }

    suspend fun consultarEnderecoCepPublic(cep: String): CadastroEndereco {
        return workflowRepository.consultarEnderecoPorCepPublic(cep)
    }

    suspend fun searchEmpresaDirect(value: String, type: EmpresaSearchType): List<EmpresaResumo> {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        return workflowRepository.searchEmpresa(activeSession, value, type)
    }

    suspend fun createUser(payload: JsonObject) {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        repository.createUser(activeSession, payload)
        refreshAdminData(activeSession)
    }

    suspend fun updateUser(id: String, payload: JsonObject): AdminUser {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        val updated = repository.updateUser(activeSession, id, payload)
        refreshAdminData(activeSession)
        return updated
    }

    suspend fun updateOwnProfile(
        name: String,
        telefone: String?,
        externalId: String?,
    ): MobileProfile {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val profile = _uiState.value.profile ?: throw IllegalStateException("Perfil nao encontrado.")
        val activeSession = ensureFreshSession(session)
        val updated = repository.updateOwnProfile(
            session = activeSession,
            userId = profile.id,
            name = name,
            telefone = telefone,
            externalId = externalId,
        )
        val updatedTeam = updated.teamId?.takeIf { it.isNotBlank() }?.let { teamId ->
            repository.fetchTeam(activeSession, teamId)
        }
        _uiState.update {
            it.copy(
                profile = updated,
                team = updatedTeam,
                noticeMessage = "Perfil atualizado com sucesso.",
            )
        }
        return updated
    }

    suspend fun updateTeamMemberAssignment(userId: String, teamId: String?) {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        repository.updateProfileTeamAssignment(activeSession, userId, teamId)
        refreshAdminData(activeSession)
    }

    suspend fun createTeam(name: String): AdminTeam {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        val created = repository.createTeam(activeSession, name)
        refreshAdminData(activeSession)
        return created
    }

    suspend fun updateTeam(id: String, payload: JsonObject): AdminTeam {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        val updated = repository.updateTeam(activeSession, id, payload)
        refreshAdminData(activeSession)
        return updated
    }

    suspend fun updateCadastroConfig(payload: JsonObject): CadastroConfig {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        val updated = repository.updateCadastroConfig(activeSession, payload)
        _uiState.update {
            it.copy(cadastroWorkspace = it.cadastroWorkspace.copy(config = updated))
        }
        return updated
    }

    suspend fun createPlanoMap(payload: JsonObject): PlanoMap {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        val created = repository.createPlanoMap(activeSession, payload)
        val items = workflowRepository.fetchPlanosMap(activeSession)
        _uiState.update { it.copy(planosMap = items) }
        return created
    }

    suspend fun updatePlanoMap(id: String, payload: JsonObject): PlanoMap {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        val updated = repository.updatePlanoMap(activeSession, id, payload)
        val items = workflowRepository.fetchPlanosMap(activeSession)
        _uiState.update { it.copy(planosMap = items) }
        return updated
    }

    suspend fun deletePlanoMap(id: String) {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        repository.deletePlanoMap(activeSession, id)
        val items = workflowRepository.fetchPlanosMap(activeSession)
        _uiState.update { it.copy(planosMap = items) }
    }

    suspend fun createParentescoMap(payload: JsonObject): ParentescoMap {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        val created = repository.createParentescoMap(activeSession, payload)
        val items = workflowRepository.fetchParentescosMap(activeSession)
        _uiState.update { it.copy(parentescosMap = items) }
        return created
    }

    suspend fun updateParentescoMap(id: String, payload: JsonObject): ParentescoMap {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        val updated = repository.updateParentescoMap(activeSession, id, payload)
        val items = workflowRepository.fetchParentescosMap(activeSession)
        _uiState.update { it.copy(parentescosMap = items) }
        return updated
    }

    suspend fun deleteParentescoMap(id: String) {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        repository.deleteParentescoMap(activeSession, id)
        val items = workflowRepository.fetchParentescosMap(activeSession)
        _uiState.update { it.copy(parentescosMap = items) }
    }

    suspend fun createStatusAdesao(payload: JsonObject): StatusAdesao {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        val created = repository.createStatusAdesao(activeSession, payload)
        val items = workflowRepository.fetchStatusAdesoes(activeSession)
        _uiState.update { it.copy(statusAdesoes = items) }
        return created
    }

    suspend fun updateStatusAdesao(id: String, payload: JsonObject): StatusAdesao {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        val updated = repository.updateStatusAdesao(activeSession, id, payload)
        val items = workflowRepository.fetchStatusAdesoes(activeSession)
        _uiState.update { it.copy(statusAdesoes = items) }
        return updated
    }

    suspend fun deleteStatusAdesao(id: String) {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        repository.deleteStatusAdesao(activeSession, id)
        val items = workflowRepository.fetchStatusAdesoes(activeSession)
        _uiState.update { it.copy(statusAdesoes = items) }
    }

    fun loadApiLogs(
        success: Boolean? = null,
        startIso: String? = null,
        endIso: String? = null,
        limit: Int = 100,
        offset: Int = 0,
    ) {
        val session = currentSession ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(adminFeatureLoading = true, errorMessage = null) }
            runCatching {
                val activeSession = ensureFreshSession(session)
                repository.fetchApiLogs(activeSession, success, startIso, endIso, limit, offset)
            }.onSuccess { logs ->
                _uiState.update { it.copy(apiLogs = logs, adminFeatureLoading = false) }
            }.onFailure { throwable ->
                _uiState.update { it.copy(adminFeatureLoading = false, errorMessage = throwable.message) }
            }
        }
    }

    suspend fun createQueueFileSignedUrl(item: ErpUploadQueueItem): String {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        return repository.createStorageSignedUrl(
            session = activeSession,
            bucket = item.bucket,
            objectPath = item.arquivoPath,
        )
    }

    fun reprocessUploadQueueItem(id: String) {
        val session = currentSession ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(adminFeatureLoading = true, errorMessage = null) }
            runCatching {
                val activeSession = ensureFreshSession(session)
                repository.reprocessUploadQueueItem(activeSession, id)
                repository.fetchErpUploadQueue(activeSession)
            }.onSuccess { items ->
                _uiState.update {
                    it.copy(
                        uploadQueue = items,
                        adminFeatureLoading = false,
                        noticeMessage = "Item marcado para reprocessamento.",
                    )
                }
            }.onFailure { throwable ->
                _uiState.update { it.copy(adminFeatureLoading = false, errorMessage = throwable.message) }
            }
        }
    }
    suspend fun updateCadastroRecord(id: String, payload: kotlinx.serialization.json.JsonObject): CadastroDetalhe {
        val traceId = "close-${id.take(8)}-${System.currentTimeMillis()}"
        return runCatching {
            val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
            val profile = _uiState.value.profile
                ?: throw IllegalStateException("Sua sessão expirou. Faça login novamente para continuar.")
            val activeSession = ensureFreshSession(session)
            val dependentesCount = runCatching { payload["dependentes"]?.jsonArray?.size }.getOrDefault(0)
            Log.i(
                "CadastroDraftTrace",
                "CLOSE_SAVE_START trace=$traceId id=$id dependentesCount=$dependentesCount arquivoPath=${!payload["arquivo_path"]?.jsonPrimitive?.contentOrNull.isNullOrBlank()} arquivoNome=${!payload["arquivo_nome"]?.jsonPrimitive?.contentOrNull.isNullOrBlank()} mime=${!payload["arquivo_mime_type"]?.jsonPrimitive?.contentOrNull.isNullOrBlank()} tamanho=${payload["arquivo_tamanho"] != null}",
            )
            val payloadPersistencia = buildJsonObject {
                payload.forEach { (key, value) -> put(key, value) }
                put("created_by", profile.id)
                profile.teamId?.takeIf { it.isNotBlank() }?.let { put("team_id", it) }
            }
            val updated = workflowRepository.updateCadastro(activeSession, id, payloadPersistencia)
            draftUxStateCache.save(id, payloadPersistencia)
            val cadastrosAtualizados = repository.fetchCadastros(activeSession)
            _uiState.update {
                it.copy(
                    selectedCadastro = updated,
                    cadastros = cadastrosAtualizados,
                )
            }
            Log.i(
                "CadastroDraftTrace",
                "CLOSE_SAVE_OK trace=$traceId id=$id selectedUpdated=${_uiState.value.selectedCadastro?.id == id} listReloaded=${cadastrosAtualizados.isNotEmpty()}",
            )
            updated
        }.getOrElse { throwable ->
            if (isDuplicatePendingConstraintError(throwable.message)) {
                val session = currentSession
                if (session != null) {
                    val activeSession = runCatching { ensureFreshSession(session) }.getOrNull()
                    val cpfHint = payload["cpf"]
                        ?.jsonPrimitive
                        ?.contentOrNull
                        ?.takeIf { it.isNotBlank() }
                        ?: _uiState.value.selectedCadastro
                            ?.takeIf { it.id == id }
                            ?.cpf
                            ?.takeIf { it.isNotBlank() }
                    val resolvedPrompt = if (!cpfHint.isNullOrBlank() && activeSession != null) {
                        resolvePendingPromptByIdOrCpf(
                            session = activeSession,
                            cpf = cpfHint,
                            preferredCadastroId = id,
                        )
                    } else {
                        null
                    }

                    if (resolvedPrompt?.cadastroId == id && activeSession != null) {
                        val recarregado = runCatching {
                            val detalhe = workflowRepository.fetchCadastroDetalhe(activeSession, id)
                            val cadastrosAtualizados = repository.fetchCadastros(activeSession)
                            _uiState.update {
                                it.copy(
                                    selectedCadastro = detalhe,
                                    cadastros = cadastrosAtualizados,
                                    pendingCadastroPrompt = null,
                                    pendingCadastroActionLoading = false,
                                )
                            }
                            detalhe
                        }.getOrNull()

                        if (recarregado != null) {
                            return recarregado
                        }
                    }

                    val prompt = resolvedPrompt?.takeIf { it.cadastroId != id }
                    if (prompt != null) {
                        Log.w(
                            logTag,
                            "updateCadastroRecord detectou pendente concorrente idAtual=$id idPendente=${prompt.cadastroId} cpf=${prompt.cpf}",
                        )
                        _uiState.update {
                            it.copy(
                                pendingCadastroPrompt = prompt,
                                pendingCadastroActionLoading = false,
                            )
                        }
                        throw IllegalStateException(
                            "Ja existe outro cadastro pendente para este CPF. Escolha continuar o pendente existente ou apagar e recomecar.",
                        )
                    }
                }
            }
            throw IllegalStateException(
                mapCadastroFlowErrorMessage(
                    throwable.message,
                    "Falha ao atualizar cadastro.",
                ),
            )
        }
    }

    suspend fun createCadastroRecord(payload: kotlinx.serialization.json.JsonObject): CadastroDetalhe {
        return runCatching {
            val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
            val profile = _uiState.value.profile ?: throw IllegalStateException("Usuario nao autenticado.")
            val activeSession = ensureFreshSession(session)
            val created = workflowRepository.createCadastroDraft(activeSession, profile, payload)
            val cadastrosAtualizados = repository.fetchCadastros(activeSession)
            val statsAtualizadas = repository.fetchCadastroStats(activeSession)
            _uiState.update {
                it.copy(
                    selectedCadastro = created,
                    cadastros = cadastrosAtualizados,
                    cadastroStats = statsAtualizadas,
                )
            }
            created
        }.getOrElse { throwable ->
            throw IllegalStateException(
                mapCadastroFlowErrorMessage(
                    throwable.message,
                    "Falha ao criar cadastro.",
                ),
            )
        }
    }

    private fun applyDraftUxStateCache(cadastro: CadastroDetalhe): CadastroDetalhe {
        val draftUxState = draftUxStateCache.load(cadastro.id) ?: return cadastro
        val dependentesFromCache = draftUxState["dependentes"]
        val arquivoPathFromCache = draftUxState["arquivo_path"]?.jsonPrimitive?.contentOrNull
        val arquivoNomeFromCache = draftUxState["arquivo_nome"]?.jsonPrimitive?.contentOrNull
        val arquivoMimeTypeFromCache = draftUxState["arquivo_mime_type"]?.jsonPrimitive?.contentOrNull
        val arquivoTamanhoFromCache = draftUxState["arquivo_tamanho"]?.jsonPrimitive?.longOrNull
        val planoCodigoFromCache = draftUxState["plano_codigo"]?.jsonPrimitive?.intOrNull

        val merged = cadastro.copy(
            dependentes = dependentesFromCache ?: cadastro.dependentes,
            arquivoPath = arquivoPathFromCache?.takeIf { it.isNotBlank() } ?: cadastro.arquivoPath,
            arquivoNome = arquivoNomeFromCache?.takeIf { it.isNotBlank() } ?: cadastro.arquivoNome,
            arquivoMimeType = arquivoMimeTypeFromCache?.takeIf { it.isNotBlank() } ?: cadastro.arquivoMimeType,
            arquivoTamanho = arquivoTamanhoFromCache ?: cadastro.arquivoTamanho,
            planoCodigo = planoCodigoFromCache ?: cadastro.planoCodigo,
        )
        if (merged != cadastro) {
            Log.i(
                logTag,
                "UX_DRAFT_RESTORE id=${cadastro.id} hasDependentes=${dependentesFromCache != null} hasArquivoPath=${!arquivoPathFromCache.isNullOrBlank()} hasArquivoNome=${!arquivoNomeFromCache.isNullOrBlank()} hasArquivoMime=${!arquivoMimeTypeFromCache.isNullOrBlank()} hasArquivoTamanho=${arquivoTamanhoFromCache != null} hasPlanoCodigo=${planoCodigoFromCache != null}",
            )
        }
        return merged
    }

    fun persistCadastroDraftSilently(id: String, payload: JsonObject) {
        val session = currentSession ?: return
        val traceId = "auto-${id.take(8)}-${System.currentTimeMillis()}"
        val saveSeq = ++cadastroDraftSaveSeq
        cadastroDraftSaveJob?.cancel()
        viewModelScope.launch {
            cadastroDraftSaveJob = this.coroutineContext[Job]
            val startMs = System.currentTimeMillis()
            val dependentesCount = runCatching { payload["dependentes"]?.jsonArray?.size }.getOrDefault(0)
            var payloadPersistencia: JsonObject? = null
            var cpfForPersist: String? = null
            Log.i(
                "CadastroDraftTrace",
                "AUTOSAVE_START seq=$saveSeq trace=$traceId id=$id dependentesCount=$dependentesCount arquivoPath=${!payload["arquivo_path"]?.jsonPrimitive?.contentOrNull.isNullOrBlank()} arquivoNome=${!payload["arquivo_nome"]?.jsonPrimitive?.contentOrNull.isNullOrBlank()} mime=${!payload["arquivo_mime_type"]?.jsonPrimitive?.contentOrNull.isNullOrBlank()} tamanho=${payload["arquivo_tamanho"] != null}",
            )
            runCatching {
                val activeSession = ensureFreshSession(session)
                val profile = _uiState.value.profile
                val cpfFromPayload = runCatching {
                    payload["cpf"]
                        ?.jsonPrimitive
                        ?.contentOrNull
                        ?.let(CadastroPayloadBuilder::normalizeDigits)
                        ?.takeIf { it.length == 11 }
                }.getOrNull()
                val cpfFromDependentePayload = runCatching {
                    payload["dependentes"]
                        ?.jsonArray
                        ?.firstOrNull()
                        ?.jsonObject
                        ?.get("cpf")
                        ?.jsonPrimitive
                        ?.contentOrNull
                        ?.let(CadastroPayloadBuilder::normalizeDigits)
                        ?.takeIf { it.length == 11 }
                }.getOrNull()
                val cpfFromSelectedCadastro = _uiState.value.selectedCadastro
                    ?.takeIf { it.id == id }
                    ?.cpf
                    ?.let(CadastroPayloadBuilder::normalizeDigits)
                    ?.takeIf { it.length == 11 }
                cpfForPersist = cpfFromPayload ?: cpfFromDependentePayload ?: cpfFromSelectedCadastro
                Log.i(
                    "CadastroDraftConflict",
                    "DRAFT_CONFLICT_PREP trace=$traceId seq=$saveSeq id=$id hasPayloadCpf=${cpfFromPayload != null} hasDepCpf=${cpfFromDependentePayload != null} hasSelectedCpf=${cpfFromSelectedCadastro != null} cpfSource=${when {
                        cpfFromPayload != null -> "payload.cpf"
                        cpfFromDependentePayload != null -> "dependentes[0].cpf"
                        cpfFromSelectedCadastro != null -> "selectedCadastro.cpf"
                        else -> "none"
                    }} willSendTopCpf=${cpfForPersist != null} cpfHash=${cpfHashForLog(cpfForPersist)} cpfLength=${cpfForPersist?.length ?: 0} dependentesCount=${runCatching { payload["dependentes"]?.jsonArray?.size }.getOrDefault(0)} hasStatusAdesao=${!payload["status_adesao_id"]?.jsonPrimitive?.contentOrNull.isNullOrBlank()} arquivoPath=${!payload["arquivo_path"]?.jsonPrimitive?.contentOrNull.isNullOrBlank()} arquivoNome=${!payload["arquivo_nome"]?.jsonPrimitive?.contentOrNull.isNullOrBlank()}",
                )
                payloadPersistencia = buildJsonObject {
                    payload.forEach { (key, value) ->
                        if (key != "cpf" && key != "tipo_cadastro") {
                            put(key, value)
                        }
                    }
                    profile?.id?.takeIf { it.isNotBlank() }?.let { put("created_by", it) }
                    profile?.teamId?.takeIf { it.isNotBlank() }?.let { put("team_id", it) }
                }
                Log.i(
                    "CadastroDraftConflict",
                    "DRAFT_CONFLICT_SEND trace=$traceId seq=$saveSeq id=$id keys=${payloadPersistencia!!.keys.sorted()} willSendCpf=${payloadPersistencia!!.containsKey("cpf")} willSendTipoCadastro=${payloadPersistencia!!.containsKey("tipo_cadastro")} cpfHash=${cpfHashForLog(payloadPersistencia!!["cpf"]?.jsonPrimitive?.contentOrNull)} cpfLength=${payloadPersistencia!!["cpf"]?.jsonPrimitive?.contentOrNull?.filter(Char::isDigit)?.length ?: 0} statusAdesao=${!payloadPersistencia!!["status_adesao_id"]?.jsonPrimitive?.contentOrNull.isNullOrBlank()} dependentesCount=${runCatching { payloadPersistencia!!["dependentes"]?.jsonArray?.size }.getOrDefault(0)} cpfOmittedForAutosave=true tipoCadastroOmittedForAutosave=true statusOmittedForAutosave=true",
                )
                val updated = workflowRepository.updateCadastro(activeSession, id, payloadPersistencia!!, resolveDraftConflict = false)
                draftUxStateCache.save(id, payloadPersistencia!!)
                updated
            }.onSuccess { updated ->
                val durationMs = System.currentTimeMillis() - startMs
                Log.i("CadastroDraftTrace", "AUTOSAVE_OK seq=$saveSeq trace=$traceId id=$id durationMs=$durationMs")
                _uiState.update { current ->
                    if (current.selectedCadastro?.id == id) {
                        current.copy(selectedCadastro = updated)
                    } else {
                        current
                    }
                }
            }.onFailure { throwable ->
                if (isDuplicatePendingConstraintError(throwable.message)) {
                    Log.w(logTag, "Conflito de pendencia ignorado no autosave id=$id", throwable)
                } else {
                    Log.w(logTag, "Falha ao persistir rascunho em background", throwable)
                }
                val durationMs = System.currentTimeMillis() - startMs
                Log.w("CadastroDraftTrace", "AUTOSAVE_FAIL seq=$saveSeq trace=$traceId id=$id durationMs=$durationMs error=${throwable::class.java.simpleName}")
                Log.w(
                    "CadastroDraftConflict",
                    "DRAFT_CONFLICT_FAIL trace=$traceId seq=$saveSeq id=$id hasCpf=${payloadPersistencia?.containsKey("cpf") ?: false} cpfHash=${cpfHashForLog(payloadPersistencia?.get("cpf")?.jsonPrimitive?.contentOrNull)} constraint=${if (isDuplicatePendingConstraintError(throwable.message)) "cadastros_cadastro_incompleto_cpf_unique_idx" else "-"} error=${throwable.message?.lineSequence()?.firstOrNull().orEmpty().take(180)}",
                )
            }.also {
                if (cadastroDraftSaveJob?.isActive == false) {
                    cadastroDraftSaveJob = null
                }
            }
        }
    }

    suspend fun deleteCadastroRecord(
        id: String,
        motivoExclusao: String = "Exclusao solicitada pelo app mobile",
    ) {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        workflowRepository.deleteCadastroLogico(
            session = activeSession,
            cadastroId = id,
            motivoExclusao = motivoExclusao,
        )
        val cadastrosAtualizados = runCatching { repository.fetchCadastros(activeSession) }
            .getOrElse {
                Log.w(logTag, "Falha ao atualizar lista apos exclusao, removendo localmente", it)
                _uiState.value.cadastros.filterNot { cadastro -> cadastro.id == id }
            }
        val statsAtualizadas = runCatching { repository.fetchCadastroStats(activeSession) }
            .getOrDefault(_uiState.value.cadastroStats)
        _uiState.update {
            it.copy(
                selectedCadastro = null,
                cadastros = cadastrosAtualizados,
                cadastroStats = statsAtualizadas,
            )
        }
    }

    suspend fun uploadTempFile(
        fileName: String,
        mimeType: String,
        bytes: ByteArray,
        prefix: String = "",
    ): UploadedTempFile {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val profile = _uiState.value.profile ?: throw IllegalStateException("Usuario nao autenticado.")
        val activeSession = ensureFreshSession(session)
        return workflowRepository.uploadTempFile(activeSession, profile.id, fileName, mimeType, bytes, prefix)
    }

    suspend fun deleteTempFile(path: String) {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        workflowRepository.deleteTempFile(activeSession, path)
    }

    suspend fun downloadTempFile(path: String): ByteArray {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        return workflowRepository.downloadTempFile(activeSession, path)
    }

    suspend fun buscarResponsaveisFinanceiros(
        tipoBusca: InclusaoBuscaTipo,
        valor: String,
    ): List<ResponsavelFinanceiroResumo> {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        return workflowRepository.buscarResponsaveisFinanceiros(activeSession, tipoBusca, valor)
    }

    suspend fun canUseLemmit(): Boolean {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val profile = _uiState.value.profile ?: throw IllegalStateException("Usuario nao autenticado.")
        val activeSession = ensureFreshSession(session)
        return workflowRepository.canUseLemmit(activeSession, profile.id)
    }

    suspend fun fetchLemmitLimitInfo(): LemmitLimitInfo? {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val profile = _uiState.value.profile ?: throw IllegalStateException("Usuario nao autenticado.")
        val activeSession = ensureFreshSession(session)
        return workflowRepository.fetchLemmitLimitInfo(activeSession, profile.id).firstOrNull()
    }

    suspend fun consultarCpfLemmit(cpf: String): LemmitResponse {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        return workflowRepository.consultarCpfLemmit(activeSession, cpf)
    }

    suspend fun consultarEnderecoCep(cep: String): CadastroEndereco {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        return workflowRepository.consultarEnderecoPorCep(activeSession, cep)
    }

    suspend fun enviarInclusaoDependente(
        payload: kotlinx.serialization.json.JsonObject,
        cadastroId: String? = null,
    ): kotlinx.serialization.json.JsonElement {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        return workflowRepository.enviarInclusaoDependente(
            session = activeSession,
            payload = payload,
            cadastroId = cadastroId,
        )
    }

    suspend fun closeDuplicateInclusaoPendentes(
        responsavelCpf: String,
        keepCadastroId: String,
        erpResponse: kotlinx.serialization.json.JsonElement,
    ) {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val profile = _uiState.value.profile ?: throw IllegalStateException("Usuario nao autenticado.")
        val activeSession = ensureFreshSession(session)
        workflowRepository.closeDuplicateInclusaoPendentes(
            session = activeSession,
            profileId = profile.id,
            responsavelCpf = responsavelCpf,
            keepCadastroId = keepCadastroId,
            erpResponse = erpResponse,
        )
        val cadastrosAtualizados = repository.fetchCadastros(activeSession)
        _uiState.update { it.copy(cadastros = cadastrosAtualizados) }
    }

    suspend fun uploadDependenteDocumento(
        idFuncionario: Int,
        idDependente: Int,
        arquivoPath: String,
        arquivoNome: String,
        bucket: String = "cadastros-temp-files",
    ): Boolean {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        return workflowRepository.uploadDependenteDocumento(
            session = activeSession,
            idFuncionario = idFuncionario,
            idDependente = idDependente,
            arquivoPath = arquivoPath,
            arquivoNome = arquivoNome,
            bucket = bucket,
        )
    }

    suspend fun enqueueDependenteUpload(
        cadastroId: String?,
        idFuncionario: Int,
        idDependente: Int,
        arquivoPath: String,
        arquivoNome: String,
        tipo: String = "dependente",
        bucket: String = "cadastros-temp-files",
    ): Boolean {
        val session = currentSession ?: throw IllegalStateException("Sessao nao encontrada.")
        val activeSession = ensureFreshSession(session)
        return workflowRepository.enqueueDependenteUpload(
            session = activeSession,
            cadastroId = cadastroId,
            idFuncionario = idFuncionario,
            idDependente = idDependente,
            arquivoPath = arquivoPath,
            arquivoNome = arquivoNome,
            tipo = tipo,
            bucket = bucket,
        )
    }

    private suspend fun bootstrapSession(session: SavedSession) {
        _uiState.update {
            it.copy(
                loading = true,
                isAuthenticated = true,
                configurationMissing = !AppConfig.isConfigured(),
                cadastros = emptyList(),
                cadastrosLoading = false,
                cadastrosLoaded = false,
                cadastroSupportLoading = false,
                cadastroSupportLoaded = false,
                vendedores = emptyList(),
                adesionistas = emptyList(),
                planosMap = emptyList(),
                parentescosMap = emptyList(),
                statusAdesoes = emptyList(),
                adminUsers = emptyList(),
                adminTeams = emptyList(),
                adminLoading = false,
                adminLoaded = false,
                auditLemmit = AuditLemmitResponse(),
                uploadQueue = emptyList(),
                uploadQueueOperation = null,
                resetQueueResult = null,
                cadastrosExcluidos = emptyList(),
                adminFeatureLoading = false,
                cadastroWorkspace = CadastroWorkspaceState(),
                linkWorkspace = LinkWorkspaceState(),
                cadastroOverlay = null,
                errorMessage = null,
            )
        }

        runCatching { withContext(Dispatchers.IO) { loadCriticalSessionData(session) } }
            .onSuccess { critical ->
                applyCriticalSessionData(critical, null)
                registerCurrentAppVersionBestEffort(session)
                prefetchCadastroSupport(session, critical.profile)
                if (_uiState.value.activeTab == MainTab.CADASTROS) {
                    ensureCadastroResourcesLoaded()
                }
                if (_uiState.value.activeTab in setOf(
                        MainTab.USERS,
                        MainTab.TEAMS,
                        MainTab.SETTINGS,
                        MainTab.AUDITORIA_LEMMIT,
                        MainTab.FILA_UPLOAD_ERP,
                        MainTab.ADESOES_EXCLUIDAS,
                    )
                ) {
                    ensureAdminResourcesLoaded()
                }
            }
            .onFailure { throwable ->
                Log.e(logTag, "Falha ao carregar dados completos da sessao", throwable)
                runCatching { withContext(Dispatchers.IO) { loadFallbackSessionData(session) } }
                    .onSuccess { fallback ->
                        applyCriticalSessionData(
                            critical = fallback,
                            errorMessage = "Sessao iniciada com dados parciais. Use Atualizar para tentar novamente.",
                        )
                        registerCurrentAppVersionBestEffort(session)
                    }
                    .onFailure { fallbackThrowable ->
                        Log.e(logTag, "Falha ao carregar fallback da sessao", fallbackThrowable)
                        inMemorySessionActive = false
                        currentSession = null
                        sessionStore.clear()
                        _uiState.update {
                            it.copy(
                                loading = false,
                                isAuthenticated = false,
                                profile = null,
                                team = null,
                                cadastros = emptyList(),
                                cadastrosLoaded = false,
                                cadastroSupportLoaded = false,
                                errorMessage = fallbackThrowable.message ?: "Sessao invalida ou expirada.",
                            )
                        }
                    }
            }
    }

    private suspend fun registerCurrentAppVersionBestEffort(session: SavedSession) {
        runCatching {
            withContext(Dispatchers.IO) {
                repository.registerCurrentAppVersion(ensureFreshSession(session))
            }
        }.onFailure { throwable ->
            Log.e(logTag, "Falha ao registrar versao do app", throwable)
        }
    }

    private fun applyCriticalSessionData(critical: CriticalSessionData, errorMessage: String?) {
        _uiState.update { current ->
            current.copy(
                loading = false,
                isAuthenticated = true,
                profile = critical.profile,
                team = critical.team,
                systemOverview = critical.systemOverview,
                cadastroStats = critical.cadastroStats,
                cadastrosLoading = false,
                configurationMissing = !AppConfig.isConfigured(),
                errorMessage = errorMessage,
            )
        }
    }

    private suspend fun refreshAll(session: SavedSession) {
        _uiState.update { it.copy(loading = true, errorMessage = null) }
        runCatching { withContext(Dispatchers.IO) { loadCriticalSessionData(session) } }
            .onSuccess { critical ->
                _uiState.update {
                    it.copy(
                        loading = false,
                        profile = critical.profile,
                        team = critical.team,
                        systemOverview = critical.systemOverview,
                        cadastroStats = critical.cadastroStats,
                    )
                }
                prefetchCadastroSupport(session, critical.profile, force = true)
                if (_uiState.value.activeTab == MainTab.CADASTROS || _uiState.value.cadastrosLoaded) {
                    ensureCadastroResourcesLoaded(force = true)
                }
                if (_uiState.value.activeTab in setOf(
                        MainTab.USERS,
                        MainTab.TEAMS,
                        MainTab.SETTINGS,
                        MainTab.AUDITORIA_LEMMIT,
                        MainTab.FILA_UPLOAD_ERP,
                        MainTab.ADESOES_EXCLUIDAS,
                    ) || _uiState.value.adminLoaded
                ) {
                    ensureAdminResourcesLoaded(force = true)
                }
            }
            .onFailure { throwable ->
                Log.e(logTag, "Falha ao atualizar dados da sessao", throwable)
                _uiState.update {
                    it.copy(
                        loading = false,
                        errorMessage = throwable.message ?: "Falha ao atualizar dados.",
                    )
                }
            }
    }

    private fun ensureCadastroResourcesLoaded(force: Boolean = false) {
        val session = currentSession ?: return
        val profile = _uiState.value.profile ?: return
        if (!force && _uiState.value.cadastroSupportLoaded && _uiState.value.cadastrosLoaded) return

        if (force || !_uiState.value.cadastroSupportLoaded) {
            prefetchCadastroSupport(session, profile, force = force)
        }

        if (force || !_uiState.value.cadastrosLoaded) {
            viewModelScope.launch {
                _uiState.update { it.copy(cadastrosLoading = true, errorMessage = null) }
                runCatching { withContext(Dispatchers.IO) { loadCadastros(session) } }
                    .onSuccess { cadastros ->
                        _uiState.update {
                            it.copy(
                                cadastros = cadastros,
                                cadastrosLoading = false,
                                cadastrosLoaded = true,
                            )
                        }
                    }
                    .onFailure { throwable ->
                        Log.e(logTag, "Falha ao carregar lista de cadastros", throwable)
                        _uiState.update {
                            it.copy(
                                cadastrosLoading = false,
                                errorMessage = throwable.message ?: "Falha ao carregar cadastros.",
                            )
                        }
                    }
            }
        }
    }

    private fun updateCadastrosSyncState() {
        val shouldSync =
            currentSession != null &&
                _uiState.value.isAuthenticated &&
                _uiState.value.activeTab == MainTab.CADASTROS
        if (shouldSync) {
            startCadastrosAutoSync()
        } else {
            stopCadastrosAutoSync()
        }
    }

    private fun startCadastrosAutoSync() {
        if (cadastrosSyncJob?.isActive == true) return
        cadastrosSyncJob = viewModelScope.launch {
            while (isActive) {
                runCatching { syncCadastrosQuietly() }
                    .onFailure { throwable ->
                        Log.w(logTag, "Falha no auto-sync de cadastros", throwable)
                    }
                delay(cadastrosSyncIntervalMs)
            }
        }
    }

    private fun stopCadastrosAutoSync() {
        cadastrosSyncJob?.cancel()
        cadastrosSyncJob = null
    }

    private suspend fun syncCadastrosQuietly() {
        val session = currentSession ?: return
        val activeSession = ensureFreshSession(session)
        val cadastrosAtualizados = withContext(Dispatchers.IO) { repository.fetchCadastros(activeSession) }
        val needsStatsRefresh = cadastrosAtualizados.size != _uiState.value.cadastros.size
        val statsAtualizadas = if (needsStatsRefresh) {
            runCatching { repository.fetchCadastroStats(activeSession) }.getOrNull()
        } else {
            null
        }

        _uiState.update { current ->
            val selected = current.selectedCadastro
            val selectedStillExists = selected == null || cadastrosAtualizados.any { it.id == selected.id }
            current.copy(
                cadastros = cadastrosAtualizados,
                cadastrosLoaded = true,
                cadastroStats = statsAtualizadas ?: current.cadastroStats,
                selectedCadastro = if (selectedStillExists) selected else null,
            )
        }
    }

    private fun ensureAdminResourcesLoaded(force: Boolean = false) {
        val session = currentSession ?: return
        if (!force && (_uiState.value.adminLoaded || _uiState.value.adminLoading)) return

        viewModelScope.launch {
            _uiState.update { it.copy(adminLoading = true, errorMessage = null) }
            runCatching { withContext(Dispatchers.IO) { loadAdminData(session) } }
                .onSuccess { adminData ->
                    _uiState.update {
                        it.copy(
                            adminUsers = adminData.users,
                            adminTeams = adminData.teams,
                            adminLoading = false,
                            adminLoaded = true,
                        )
                    }
                }
                .onFailure { throwable ->
                    Log.e(logTag, "Falha ao carregar dados administrativos", throwable)
                    _uiState.update {
                        it.copy(
                            adminLoading = false,
                            errorMessage = throwable.message ?: "Falha ao carregar dados administrativos.",
                        )
                    }
                }
        }
    }

    private suspend fun refreshAdminData(session: SavedSession) {
        val adminData = withContext(Dispatchers.IO) { loadAdminData(session) }
        _uiState.update {
            it.copy(
                adminUsers = adminData.users,
                adminTeams = adminData.teams,
                adminLoaded = true,
            )
        }
    }

    private fun prefetchCadastroSupport(
        session: SavedSession,
        profile: MobileProfile,
        force: Boolean = false,
    ) {
        if (!force && (_uiState.value.cadastroSupportLoading || _uiState.value.cadastroSupportLoaded)) return

        viewModelScope.launch {
            _uiState.update { it.copy(cadastroSupportLoading = true) }
            runCatching { withContext(Dispatchers.IO) { loadCadastroSupportData(session, profile) } }
                .onSuccess { support ->
                    _uiState.update { current ->
                        current.copy(
                            cadastroSupportLoading = false,
                            cadastroSupportLoaded = true,
                            vendedores = support.vendedores,
                            adesionistas = support.adesionistas,
                            planosMap = support.planos,
                            parentescosMap = support.parentescos,
                            statusAdesoes = support.statusAdesoes,
                            cadastroWorkspace = current.cadastroWorkspace.copy(
                                config = support.config,
                                selectedVendedorId = current.cadastroWorkspace.selectedVendedorId
                                    .takeIf { value -> support.vendedores.any { it.id == value } }
                                    ?: "",
                                selectedAdesionistaId = current.cadastroWorkspace.selectedAdesionistaId
                                    .takeIf { value -> support.adesionistas.any { it.id == value } }
                                    ?: "",
                            ),
                            linkWorkspace = current.linkWorkspace.copy(
                                links = support.links,
                                metricsByLinkId = support.linkMetricsById,
                            ),
                        )
                    }
                }
                .onFailure { throwable ->
                    Log.e(logTag, "Falha ao carregar suporte do modulo cadastro", throwable)
                    _uiState.update {
                        it.copy(
                            cadastroSupportLoading = false,
                            errorMessage = throwable.message ?: "Falha ao carregar modulo cadastro.",
                        )
                    }
                }
        }
    }

    private suspend fun loadCriticalSessionData(session: SavedSession): CriticalSessionData {
        val activeSession = ensureFreshSession(session)
        val profile = repository.fetchProfile(activeSession)

        return coroutineScope {
            val teamDeferred = async { profile.teamId?.let { repository.fetchTeam(activeSession, it) } }
            val statsDeferred = async {
                runCatching { repository.fetchCadastroStats(activeSession) }
                    .recoverCatching { repository.fetchCadastroStatsFromCache(activeSession) }
                    .getOrDefault(CadastroStats())
            }
            val overviewDeferred = async {
                if (profile.role in setOf("ADMINISTRADOR", "ADMIN", "GERENTE", "GESTOR")) {
                    repository.fetchSystemOverview(activeSession)
                } else {
                    SystemOverview()
                }
            }

            CriticalSessionData(
                profile = profile,
                team = teamDeferred.await(),
                systemOverview = overviewDeferred.await(),
                cadastroStats = statsDeferred.await(),
            )
        }
    }

    private suspend fun loadLinkWorkspaceData(session: SavedSession): LinkWorkspaceData {
        val links = workflowRepository.fetchActiveLinks(session)
        val metrics = workflowRepository.fetchLinkMetrics(session, links.map { it.id })
        return LinkWorkspaceData(
            links = links,
            metricsByLinkId = metrics,
        )
    }

    private suspend fun loadCadastroSupportData(
        session: SavedSession,
        profile: MobileProfile,
    ): CadastroSupportData {
        val activeSession = ensureFreshSession(session)

        return coroutineScope {
            val configDeferred = async { workflowRepository.fetchCadastroConfig(activeSession) }
            val vendedoresDeferred = async {
                if (profile.role != "VENDEDOR") {
                    workflowRepository.fetchProfilesByRole(activeSession, "VENDEDOR")
                } else {
                    emptyList()
                }
            }
            val adesionistasDeferred = async {
                if (profile.role in setOf("ADMINISTRADOR", "ADMIN", "GERENTE", "GESTOR", "SUPERVISOR", "VENDEDOR", "CADASTRO")) {
                    workflowRepository.fetchProfilesByRole(activeSession, "ADESIONISTA")
                } else {
                    emptyList()
                }
            }
            val linkDataDeferred = async { loadLinkWorkspaceData(activeSession) }
            val planosDeferred = async { workflowRepository.fetchPlanosMap(activeSession) }
            val parentescosDeferred = async { workflowRepository.fetchParentescosMap(activeSession) }
            val statusDeferred = async { workflowRepository.fetchStatusAdesoes(activeSession) }

            val linkData = linkDataDeferred.await()
            CadastroSupportData(
                config = configDeferred.await(),
                vendedores = vendedoresDeferred.await(),
                adesionistas = adesionistasDeferred.await(),
                links = linkData.links,
                linkMetricsById = linkData.metricsByLinkId,
                planos = planosDeferred.await(),
                parentescos = parentescosDeferred.await(),
                statusAdesoes = statusDeferred.await(),
            )
        }
    }

    private suspend fun loadCadastros(session: SavedSession): List<CadastroResumo> {
        val activeSession = ensureFreshSession(session)
        return repository.fetchCadastros(activeSession)
    }

    private suspend fun loadAdminData(session: SavedSession): AdminData {
        val activeSession = ensureFreshSession(session)
        return coroutineScope {
            val usersDeferred = async { repository.fetchUsers(activeSession) }
            val teamsDeferred = async { repository.fetchTeamsAdmin(activeSession) }
            AdminData(
                users = usersDeferred.await(),
                teams = teamsDeferred.await(),
            )
        }
    }

    private suspend fun loadFallbackSessionData(session: SavedSession): LoadedSessionData {
        val activeSession = ensureFreshSession(session)
        val profile = repository.fetchProfile(activeSession)
        val team = profile.teamId?.let { repository.fetchTeam(activeSession, it) }
        return LoadedSessionData(
            profile = profile,
            team = team,
            systemOverview = SystemOverview(),
            cadastroStats = CadastroStats(),
        )
    }

    private suspend fun ensureFreshSession(session: SavedSession): SavedSession {
        val refreshed = try {
            authService.refreshIfNeeded(session)
        } catch (throwable: Throwable) {
            if (shouldForceLogoutOnRefreshFailure(throwable.message)) {
                Log.w(logTag, "Sessao invalida detectada no refresh; limpando sessao local", throwable)
                stopCadastrosAutoSync()
                inMemorySessionActive = false
                currentSession = null
                sessionStore.clearSavedSession()
                _uiState.update {
                    AppUiState(
                        email = it.email,
                        password = "",
                        darkModeEnabled = it.darkModeEnabled,
                        rememberConnected = it.rememberConnected,
                        loading = false,
                        configurationMissing = !AppConfig.isConfigured(),
                        appUpdateInfo = it.appUpdateInfo,
                        appUpdateChecking = it.appUpdateChecking,
                        appUpdateDownloading = it.appUpdateDownloading,
                        appUpdateError = it.appUpdateError,
                        errorMessage = "Sua sessao expirou. Faca login novamente para continuar.",
                    )
                }
                throw IllegalStateException("Sua sessao expirou. Faca login novamente para continuar.")
            }
            throw throwable
        }

        if (refreshed != session) {
            currentSession = refreshed
            if (_uiState.value.rememberConnected) {
                sessionStore.save(refreshed)
            }
        }
        return refreshed
    }

    private fun shouldForceLogoutOnRefreshFailure(message: String?): Boolean {
        val normalized = message
            ?.trim()
            ?.lowercase(Locale.ROOT)
            .orEmpty()
        if (normalized.isBlank()) return false

        return normalized.contains("refresh token") ||
            normalized.contains("invalid_grant") ||
            normalized.contains("session expired") ||
            normalized.contains("jwt expired") ||
            normalized.contains("token is expired") ||
            normalized.contains("revoked")
    }

    private fun requiresVendedorSelection(profile: MobileProfile): Boolean {
        return profile.role in setOf(
            "ADMINISTRADOR",
            "ADMIN",
            "GERENTE",
            "GESTOR",
            "SUPERVISOR",
            "CADASTRO",
            "ADESIONISTA",
            "VENDEDOR",
        )
    }

    private suspend fun ensureCadastroEmpresaBeforeSend(
        session: SavedSession,
        cadastroId: String,
        fallbackEmpresa: EmpresaResumo?,
        cachedCadastro: CadastroDetalhe? = null,
    ): CadastroDetalhe {
        var detalhe = cachedCadastro ?: workflowRepository.fetchCadastroDetalhe(session, cadastroId)
        if ((detalhe.empresaId ?: detalhe.empresaCodigo) != null) return detalhe

        val inferredFromRaw = inferEmpresaCodigoFromRaw(detalhe.empresaRaw)
        val empresaId = fallbackEmpresa?.id?.takeIf { it > 0 } ?: inferredFromRaw
        val empresaCodigo = fallbackEmpresa?.codigo?.takeIf { it > 0 } ?: empresaId

        if (empresaId == null || empresaCodigo == null) {
            throw IllegalStateException("Selecione uma empresa antes de enviar.")
        }

        detalhe = workflowRepository.updateCadastro(
            session = session,
            id = cadastroId,
            payload = buildJsonObject {
                put("empresa_id", empresaId)
                put("empresa_codigo", empresaCodigo)
                fallbackEmpresa?.nomeFantasia
                    ?.takeIf { it.isNotBlank() }
                    ?.let { put("empresa_nome", it) }
                fallbackEmpresa?.cnpj
                    ?.takeIf { it.isNotBlank() }
                    ?.let { put("empresa_cnpj", it) }
                fallbackEmpresa?.raw?.let { put("empresa_raw", it) }
                    ?: detalhe.empresaRaw?.let { put("empresa_raw", it) }
                fallbackEmpresa?.exigeMatricula?.let { put("empresa_exige_matricula", it) }
                fallbackEmpresa?.precoPlano?.let { put("planos_raw", it) }
                    ?: detalhe.planosRaw?.let { put("planos_raw", it) }
            },
        )

        if ((detalhe.empresaId ?: detalhe.empresaCodigo) == null) {
            detalhe = workflowRepository.fetchCadastroDetalhe(session, cadastroId)
            if ((detalhe.empresaId ?: detalhe.empresaCodigo) == null) {
                throw IllegalStateException("Selecione uma empresa antes de enviar.")
            }
        }
        return detalhe
    }

    private fun inferEmpresaCodigoFromRaw(raw: JsonElement?): Int? {
        val obj = runCatching { raw?.jsonObject }.getOrNull() ?: return null
        val keys = listOf("id", "codigo", "codigoDaEmpresa", "empresa_codigo", "empresaId", "codigoEmpresa")
        for (key in keys) {
            val primitive = obj[key]?.jsonPrimitive ?: continue
            primitive.intOrNull?.takeIf { it > 0 }?.let { return it }
            primitive.contentOrNull?.toIntOrNull()?.takeIf { it > 0 }?.let { return it }
        }
        return null
    }

    private fun mapCadastroFlowErrorMessage(message: String?, fallback: String): String {
        val normalized = message?.lowercase().orEmpty()
        val isAuthSessionError =
            normalized.contains("jwt expired") ||
                normalized.contains("invalid jwt") ||
                normalized.contains("auth session missing") ||
                normalized.contains("refresh token") ||
                normalized.contains("token has expired") ||
                normalized.contains("401 unauthorized") ||
                normalized.contains("status: 401")
        val isCreatedByProfileError =
            normalized.contains("created_by") &&
                (
                    normalized.contains("violates") ||
                        normalized.contains("foreign key") ||
                        normalized.contains("not-null")
                    )
        return when {
            isCreatedByProfileError ->
                "Perfil do usuário não encontrado para este cadastro. Saia e entre novamente; se persistir, solicite ajuste do perfil."
            isAuthSessionError ->
                "Sua sessão expirou. Faça login novamente para continuar."
            normalized.contains("row-level security") || normalized.contains("permission denied") ->
                "Você não tem permissão para concluir esta operação com o usuário atual."
            normalized.contains("invalid input syntax for type integer") ->
                "Existe um campo numerico invalido no cadastro. Revise empresa, vendedor, planos e dados obrigatorios."
            normalized.contains("conversion failed when converting date and/or time from character string") ->
                "Existe uma data invalida no cadastro. Revise data de nascimento do titular/dependentes e tente novamente."
            normalized.contains("cd_plano") || normalized.contains("plano valido para") ->
                "Selecione um plano valido para o titular e dependentes antes de cadastrar."
            normalized.contains("cadastro sem nome") ->
                "Cadastro sem nome. Preencha o nome do titular na etapa 1."
            normalized.contains("selecione uma empresa antes de enviar") ->
                "Selecione uma empresa valida antes de cadastrar."
            else -> CadastroApiErrorMapper.mapUserMessage(message, fallback)
        }
    }

    override fun onCleared() {
        stopCadastrosAutoSync()
        super.onCleared()
    }

    companion object {
        fun factory(context: Context): ViewModelProvider.Factory {
            val appContext = context.applicationContext
            val json = Json {
                ignoreUnknownKeys = true
                explicitNulls = false
                coerceInputValues = true
            }
            val client = HttpClient(OkHttp) {
                install(ContentNegotiation) {
                    json(json)
                }
            }
            val sessionStore = SessionStore(appContext)
            val authService = SupabaseAuthService(client = client, json = json)
            val repository = SupabaseRepository(client = client, json = json)
            val workflowRepository = CadastroWorkflowRepository(client = client, json = json)
            val draftUxStateCache = DraftUxStateCache(appContext)
            val appUpdateRepository = AppUpdateRepository(client = client)

            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return AppViewModel(
                        sessionStore = sessionStore,
                        authService = authService,
                        repository = repository,
                        workflowRepository = workflowRepository,
                        draftUxStateCache = draftUxStateCache,
                        appUpdateRepository = appUpdateRepository,
                    ) as T
                }
            }
        }
    }
}

private data class CriticalSessionData(
    val profile: MobileProfile,
    val team: MobileTeam?,
    val systemOverview: SystemOverview,
    val cadastroStats: CadastroStats,
)

private data class LinkWorkspaceData(
    val links: List<CadastroLinkItem>,
    val metricsByLinkId: Map<String, CadastroLinkMetrics>,
)

private data class CadastroSupportData(
    val config: CadastroConfig?,
    val vendedores: List<TeamMemberOption>,
    val adesionistas: List<TeamMemberOption>,
    val links: List<CadastroLinkItem>,
    val linkMetricsById: Map<String, CadastroLinkMetrics>,
    val planos: List<PlanoMap>,
    val parentescos: List<ParentescoMap>,
    val statusAdesoes: List<StatusAdesao>,
)

private data class AdminData(
    val users: List<AdminUser>,
    val teams: List<AdminTeam>,
)

private typealias LoadedSessionData = CriticalSessionData
