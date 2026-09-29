package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.data.models.ApiLogItem
import br.com.vendamais.mobile.data.models.ParentescoMap
import br.com.vendamais.mobile.data.models.PlanoMap
import br.com.vendamais.mobile.data.models.StatusAdesao
import br.com.vendamais.mobile.ui.AppUiState
import br.com.vendamais.mobile.ui.AppViewModel
import br.com.vendamais.mobile.ui.components.ScreenHeading
import br.com.vendamais.mobile.ui.components.VendaButton
import br.com.vendamais.mobile.ui.components.VendaButtonSize
import br.com.vendamais.mobile.ui.components.VendaButtonStyle
import br.com.vendamais.mobile.ui.components.VendaEmptyState
import br.com.vendamais.mobile.ui.components.VendaLoadingState
import br.com.vendamais.mobile.ui.components.VendaSectionTabs
import br.com.vendamais.mobile.ui.components.VendaStatusChip
import br.com.vendamais.mobile.ui.components.VendaStatusTone
import br.com.vendamais.mobile.ui.components.WebCard
import br.com.vendamais.mobile.ui.components.bringIntoViewOnFocus
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate

private enum class SettingsSection { GERAL, PLANOS, PARENTESCO, STATUS, LOGS }

@Composable
fun SettingsScreen(state: AppUiState, viewModel: AppViewModel) {
    val scope = rememberCoroutineScope()
    var section by rememberSaveable { mutableStateOf(SettingsSection.GERAL) }
    val role = state.profile?.role
    val canModifyMappings = role in setOf("ADMINISTRADOR", "GERENTE", "CADASTRO", "ADESIONISTA")
    val canDeleteMappings = role == "ADMINISTRADOR"

    LazyColumn(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { ScreenHeading(title = "Configuracoes", subtitle = "Regras operacionais, tabelas do ERP e diagnostico do sistema.") }
        item {
            val entries = listOf(
                SettingsSection.GERAL to "Geral",
                SettingsSection.PLANOS to "Planos",
                SettingsSection.PARENTESCO to "Parentesco",
                SettingsSection.STATUS to "Status",
                SettingsSection.LOGS to "Logs API",
            )
            VendaSectionTabs(
                items = entries.map { it.second },
                selectedIndex = entries.indexOfFirst { it.first == section }.coerceAtLeast(0),
                onSelected = { index -> section = entries[index].first },
            )
        }

        when (section) {
            SettingsSection.GERAL -> {
                val config = state.cadastroWorkspace.config
                if (config == null) item { SettingsLoadingCard() } else {
                    item { ConfigSwitchCard("Consulta Lemmit", "Consulta a Lemmit no fluxo de cadastro.", config.ativarLemmit) { v -> scope.launch { viewModel.updateCadastroConfig(buildJsonObject { put("ativar_lemmit", v) }) } } }
                    item { ConfigSwitchCard("Exigir Envio de Arquivo", "Quando ativo, o envio exige documento anexado.", config.exigirArquivo) { v -> scope.launch { viewModel.updateCadastroConfig(buildJsonObject { put("exigir_arquivo", v) }) } } }
                    item { ConfigSwitchCard("Lemmit no Dependente", "Preenchimento automatico no dependente do novo cadastro.", config.lemmitDependente) { v -> scope.launch { viewModel.updateCadastroConfig(buildJsonObject { put("lemmit_dependente", v) }) } } }
                    item { ConfigSwitchCard("Lemmit Incluir Dep.", "Preenchimento automatico na inclusao de dependente.", config.lemmitInclusaoDependente) { v -> scope.launch { viewModel.updateCadastroConfig(buildJsonObject { put("lemmit_inclusao_dependente", v) }) } } }
                    item { ConfigListEditorCard("Situacoes que Barram Cadastro", "Codigos que impedem recadastro.", config.situacoesQueBarram.joinToString(", ")) { value -> scope.launch { viewModel.updateCadastroConfig(buildJsonObject { put("situacoes_que_barram", settingsIntJsonArray(value.split(',').mapNotNull { it.trim().toIntOrNull() })) }) } } }
                    item { ConfigListEditorCard("Planos Validos", "Planos permitidos para recadastro.", config.planosValidos.joinToString(", ")) { value -> scope.launch { viewModel.updateCadastroConfig(buildJsonObject { put("planos_validos", settingsIntJsonArray(value.split(',').mapNotNull { it.trim().toIntOrNull() })) }) } } }
                    item { ConfigListEditorCard("Planos Ocultos", "Codigos que nao aparecem na selecao.", config.planosOcultos.joinToString(", ")) { value -> scope.launch { viewModel.updateCadastroConfig(buildJsonObject { put("planos_ocultos", settingsStringJsonArray(value.split(',').map { it.trim() }.filter { it.isNotBlank() })) }) } } }
                    item { ConfigListEditorCard("Codigos de Empresa Invalidos", "Empresas invalidas para novos cadastros.", config.codigosEmpresaInvalidos.joinToString(", ")) { value -> scope.launch { viewModel.updateCadastroConfig(buildJsonObject { put("codigos_empresa_invalidos", settingsStringJsonArray(value.split(',').map { it.trim() }.filter { it.isNotBlank() })) }) } } }
                }
            }
            SettingsSection.PLANOS -> item { PlanosEditor(state, viewModel, canModifyMappings, canDeleteMappings) }
            SettingsSection.PARENTESCO -> item { ParentescosEditor(state, viewModel, canModifyMappings, canDeleteMappings) }
            SettingsSection.STATUS -> item { StatusEditor(state, viewModel) }
            SettingsSection.LOGS -> item { ApiLogsEditor(state, viewModel) }
        }
    }
}

@Composable
private fun PlanosEditor(state: AppUiState, viewModel: AppViewModel, canModify: Boolean, canDelete: Boolean) {
    val scope = rememberCoroutineScope()
    var editing by remember { mutableStateOf<PlanoMap?>(null) }
    var creating by remember { mutableStateOf(false) }
    WebCard {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Planos", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            if (canModify) VendaButton(label = "Adicionar plano", onClick = { creating = true }, modifier = Modifier.fillMaxWidth())
            state.planosMap.forEach { item ->
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("${item.planoId} - ${item.nomeExibicao}", fontWeight = FontWeight.Medium)
                        Text(item.regraValor, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        VendaStatusChip(
                            label = if (item.ativo) "Ativo" else "Inativo",
                            tone = if (item.ativo) VendaStatusTone.SUCCESS else VendaStatusTone.NEUTRAL,
                        )
                    }
                    if (canModify) TextButton(onClick = { editing = item }) { Text("Editar") }
                    if (canDelete) TextButton(onClick = { scope.launch { viewModel.deletePlanoMap(item.id) } }) { Text("Excluir") }
                }
            }
            if (state.planosMap.isEmpty()) VendaEmptyState(title = "Nenhum plano cadastrado", message = "Os planos configurados para o ERP aparecerao aqui.")
        }
    }
    if (creating || editing != null) {
        PlanoDialog(editing, onDismiss = { creating = false; editing = null }) { id, nome, registro, regra, ativo ->
            scope.launch {
                val payload = buildJsonObject {
                    put("plano_id", id); put("nome_exibicao", nome); put("registro_produto", registro); put("regra_valor", regra); put("ativo", ativo)
                }
                if (editing == null) viewModel.createPlanoMap(payload) else viewModel.updatePlanoMap(editing!!.id, payload)
                creating = false; editing = null
            }
        }
    }
}

@Composable
private fun PlanoDialog(item: PlanoMap?, onDismiss: () -> Unit, onSave: (Int, String, String, String, Boolean) -> Unit) {
    var id by remember(item?.id) { mutableStateOf(item?.planoId?.toString().orEmpty()) }
    var nome by remember(item?.id) { mutableStateOf(item?.nomeExibicao.orEmpty()) }
    var registro by remember(item?.id) { mutableStateOf(item?.registroProduto.orEmpty()) }
    var regra by remember(item?.id) { mutableStateOf(item?.regraValor ?: "titular") }
    var ativo by remember(item?.id) { mutableStateOf(item?.ativo ?: true) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (item == null) "Novo Plano" else "Editar Plano") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(id, { id = it.filter(Char::isDigit) }, label = { Text("ID do Plano no ERP") }, enabled = item == null, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            OutlinedTextField(nome, { nome = it }, label = { Text("Nome para Exibicao") })
            OutlinedTextField(registro, { registro = it }, label = { Text("Registro do Produto") })
            SettingsChoiceField("Regra de Valor", regra, listOf("titular" to "Titular", "dependente" to "Dependente", "agregado" to "Agregado", "fixo" to "Fixo", "manual" to "Manual"), onSelected = { regra = it })
            Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(ativo, { ativo = it }); Text("Ativo") }
        }
    }, confirmButton = { TextButton(onClick = { val parsed = id.toIntOrNull() ?: 0; if (parsed > 0 && nome.isNotBlank()) onSave(parsed, nome.trim(), registro.trim(), regra, ativo) }) { Text("Salvar") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } })
}

@Composable
private fun ParentescosEditor(state: AppUiState, viewModel: AppViewModel, canModify: Boolean, canDelete: Boolean) {
    val scope = rememberCoroutineScope(); var editing by remember { mutableStateOf<ParentescoMap?>(null) }; var creating by remember { mutableStateOf(false) }
    WebCard { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Parentesco", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        if (canModify) VendaButton(label = "Adicionar parentesco", onClick = { creating = true }, modifier = Modifier.fillMaxWidth())
        state.parentescosMap.forEach { item -> Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("${item.parentescoId} - ${item.label}")
                VendaStatusChip(
                    label = if (item.ativo) "Ativo" else "Inativo",
                    tone = if (item.ativo) VendaStatusTone.SUCCESS else VendaStatusTone.NEUTRAL,
                )
            }
            if (canModify) TextButton(onClick = { editing = item }) { Text("Editar") }
            if (canDelete) TextButton(onClick = { scope.launch { viewModel.deleteParentescoMap(item.id) } }) { Text("Excluir") }
        } }
        if (state.parentescosMap.isEmpty()) VendaEmptyState(title = "Nenhum parentesco cadastrado", message = "Os parentescos disponiveis para cadastro aparecerao aqui.")
    } }
    if (creating || editing != null) ParentescoDialog(editing, { creating = false; editing = null }) { id, label, ativo -> scope.launch {
        val payload = buildJsonObject { put("parentesco_id", id); put("label", label); put("ativo", ativo) }
        if (editing == null) viewModel.createParentescoMap(payload) else viewModel.updateParentescoMap(editing!!.id, payload)
        creating = false; editing = null
    } }
}

@Composable
private fun ParentescoDialog(item: ParentescoMap?, onDismiss: () -> Unit, onSave: (Int, String, Boolean) -> Unit) {
    var id by remember(item?.id) { mutableStateOf(item?.parentescoId?.toString().orEmpty()) }; var label by remember(item?.id) { mutableStateOf(item?.label.orEmpty()) }; var ativo by remember(item?.id) { mutableStateOf(item?.ativo ?: true) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (item == null) "Novo Parentesco" else "Editar Parentesco") }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(id, { id = it.filter(Char::isDigit) }, label = { Text("ID do Parentesco no ERP") }, enabled = item == null, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
        OutlinedTextField(label, { label = it }, label = { Text("Label para Exibicao") })
        Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(ativo, { ativo = it }); Text("Ativo") }
    } }, confirmButton = { TextButton(onClick = { val parsed = id.toIntOrNull() ?: 0; if (parsed > 0 && label.isNotBlank()) onSave(parsed, label.trim(), ativo) }) { Text("Salvar") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } })
}

@Composable
private fun StatusEditor(state: AppUiState, viewModel: AppViewModel) {
    val scope = rememberCoroutineScope(); var editing by remember { mutableStateOf<StatusAdesao?>(null) }; var creating by remember { mutableStateOf(false) }
    WebCard { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Status de Adesoes", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        VendaButton(label = "Adicionar status", onClick = { creating = true }, modifier = Modifier.fillMaxWidth())
        state.statusAdesoes.forEach { status ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        modifier = Modifier.padding(vertical = 4.dp),
                        shape = CircleShape,
                        color = settingsParseColor(status.cor),
                    ) { androidx.compose.foundation.layout.Spacer(modifier = Modifier.padding(7.dp)) }
                    Column {
                        Text(status.nome, fontWeight = FontWeight.Medium)
                        Text("${status.cor} | ordem ${status.ordem}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                TextButton(onClick = { editing = status }) { Text("Editar") }
                TextButton(onClick = { scope.launch { viewModel.deleteStatusAdesao(status.id) } }) { Text("Excluir") }
            }
        }
        if (state.statusAdesoes.isEmpty()) VendaEmptyState(title = "Nenhum status cadastrado", message = "Crie os estados operacionais usados nas adesoes.")
    } }
    if (creating || editing != null) StatusDialog(editing, { creating = false; editing = null }, state.statusAdesoes.maxOfOrNull { it.ordem } ?: 0) { nome, cor, ordem -> scope.launch {
        val payload = buildJsonObject { put("nome", nome); put("cor", cor); put("ordem", ordem) }
        if (editing == null) viewModel.createStatusAdesao(payload) else viewModel.updateStatusAdesao(editing!!.id, payload)
        creating = false; editing = null
    } }
}

@Composable
private fun StatusDialog(item: StatusAdesao?, onDismiss: () -> Unit, maxOrder: Int, onSave: (String, String, Int) -> Unit) {
    var nome by remember(item?.id) { mutableStateOf(item?.nome.orEmpty()) }; var cor by remember(item?.id) { mutableStateOf(item?.cor ?: "#6B7280") }; var ordem by remember(item?.id) { mutableStateOf((item?.ordem ?: maxOrder + 1).toString()) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (item == null) "Novo Status" else "Editar Status") }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(nome, { nome = it }, label = { Text("Nome do Status") }); OutlinedTextField(cor, { cor = it }, label = { Text("Cor (#RRGGBB)") }); OutlinedTextField(ordem, { ordem = it.filter(Char::isDigit) }, label = { Text("Ordem") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
    } }, confirmButton = { TextButton(onClick = { if (nome.isNotBlank()) onSave(nome.trim(), cor.trim().ifBlank { "#6B7280" }, ordem.toIntOrNull() ?: maxOrder + 1) }) { Text("Salvar") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } })
}

@Composable
private fun ApiLogsEditor(state: AppUiState, viewModel: AppViewModel) {
    var filter by rememberSaveable { mutableStateOf("all") }; var start by rememberSaveable { mutableStateOf("") }; var end by rememberSaveable { mutableStateOf("") }; var page by rememberSaveable { mutableStateOf(1) }; var selected by remember { mutableStateOf<ApiLogItem?>(null) }
    val size = 100
    fun load() {
        val success = when (filter) { "success" -> true; "error" -> false; else -> null }
        viewModel.loadApiLogs(success, start.takeIf { it.isNotBlank() }?.let { "${it}T00:00:00Z" }, end.takeIf { it.isNotBlank() }?.let { "${it}T23:59:59Z" }, size, (page - 1) * size)
    }
    LaunchedEffect(filter, start, end, page) { load() }
    WebCard { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Logs de API", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text("Investigue chamadas, latencia e erros sem sair do aplicativo.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        SettingsChoiceField("Status", filter, listOf("all" to "Todos", "success" to "Sucesso", "error" to "Erros"), onSelected = { filter = it; page = 1 })
        OutlinedTextField(start, { start = it; page = 1 }, label = { Text("Data Inicio (YYYY-MM-DD)") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(end, { end = it; page = 1 }, label = { Text("Data Fim (YYYY-MM-DD)") }, modifier = Modifier.fillMaxWidth())
        if (state.apiLogs.isEmpty()) {
            VendaEmptyState(title = "Nenhum log encontrado", message = "Nao ha chamadas correspondentes aos filtros selecionados.")
        } else {
            state.apiLogs.forEach { log ->
                Surface(
                    onClick = { selected = log },
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                    shape = MaterialTheme.shapes.medium,
                ) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text(log.endpoint, modifier = Modifier.weight(1f), fontWeight = FontWeight.Medium)
                            VendaStatusChip(
                                label = if (log.success) "Sucesso" else "Falha",
                                tone = if (log.success) VendaStatusTone.SUCCESS else VendaStatusTone.ERROR,
                            )
                        }
                        Text("${log.userEmail ?: "Anonimo"} | ${formatLogDate(log.createdAt)} | ${log.durationMs ?: 0}ms | HTTP ${log.statusCode ?: "-"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (!log.success) Text("Nao foi possivel concluir esta chamada. Toque para ver os detalhes tecnicos.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { TextButton(onClick = { if (page > 1) page-- }, enabled = page > 1) { Text("Anterior") }; Text("Pagina $page"); TextButton(onClick = { page++ }, enabled = state.apiLogs.size == size) { Text("Proxima") } }
    } }
    selected?.let { log -> AlertDialog(onDismissRequest = { selected = null }, title = { Text(log.endpoint) }, text = { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) { Text("Metodo: ${log.method}"); Text("Status: ${log.statusCode ?: "-"}"); Text("Usuario: ${log.userEmail ?: "Anonimo"}"); Text("Duracao: ${log.durationMs ?: 0}ms"); Text("Custo: ${log.cost ?: 0.0}"); log.errorMessage?.let { Text("Erro: $it") }; Text("Request: ${log.requestBody ?: "-"}", style = MaterialTheme.typography.bodySmall); Text("Response: ${log.responseBody ?: "-"}", style = MaterialTheme.typography.bodySmall) } }, confirmButton = { TextButton(onClick = { selected = null }) { Text("Fechar") } }) }
}

@Composable
private fun ConfigSwitchCard(title: String, description: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) { WebCard { Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { Column(modifier = Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold); Text(description, style = MaterialTheme.typography.bodySmall) }; Switch(checked, onCheckedChange) } } }

@Composable
private fun ConfigListEditorCard(title: String, description: String, value: String, onSave: (String) -> Unit) { var editing by remember { mutableStateOf(false) }; var text by remember(value) { mutableStateOf(value) }; WebCard { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold); Text(description, style = MaterialTheme.typography.bodySmall); if (editing) { OutlinedTextField(text, { text = it }, modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus()); Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { VendaButton(label = "Salvar", size = VendaButtonSize.SMALL, onClick = { onSave(text); editing = false }); VendaButton(label = "Cancelar", size = VendaButtonSize.SMALL, style = VendaButtonStyle.TERTIARY, onClick = { editing = false }) } } else { Text(value.ifBlank { "Nao configurado" }); TextButton(onClick = { editing = true }) { Text("Editar") } } } } }

private fun formatLogDate(value: String): String = runCatching { java.time.OffsetDateTime.parse(value).format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")) }.getOrDefault(value)


@Composable
private fun SettingsLoadingCard() {
    VendaLoadingState(
        title = "Carregando configuracoes",
        message = "Atualizando as regras operacionais do Venda+.",
    )
}

@Composable
private fun <T> SettingsChoiceField(
    label: String,
    value: String,
    options: List<Pair<T, String>>,
    onSelected: (T) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            options.take(5).forEach { (key, display) ->
                TextButton(onClick = { onSelected(key) }, modifier = Modifier.weight(1f)) {
                    Text(display, maxLines = 1)
                }
            }
        }
        if (options.size > 5) {
            options.drop(5).chunked(5).forEach { row ->
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    row.forEach { (key, display) ->
                        TextButton(onClick = { onSelected(key) }, modifier = Modifier.weight(1f)) {
                            Text(display, maxLines = 1)
                        }
                    }
                    repeat(5 - row.size) { androidx.compose.foundation.layout.Spacer(modifier = Modifier.weight(1f)) }
                }
            }
        }
    }
}

private fun settingsIntJsonArray(values: List<Int>) = kotlinx.serialization.json.buildJsonArray {
    values.forEach { add(kotlinx.serialization.json.JsonPrimitive(it)) }
}

private fun settingsStringJsonArray(values: List<String>) = kotlinx.serialization.json.buildJsonArray {
    values.forEach { add(kotlinx.serialization.json.JsonPrimitive(it)) }
}

@Composable
private fun settingsParseColor(value: String): androidx.compose.ui.graphics.Color {
    val fallback = MaterialTheme.colorScheme.primary
    val normalized = value.trim().removePrefix("#")
    if (!normalized.matches(Regex("^(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$"))) return fallback

    return runCatching {
        when (normalized.length) {
            6 -> androidx.compose.ui.graphics.Color(0xFF000000L or normalized.toLong(16))
            8 -> androidx.compose.ui.graphics.Color(normalized.toLong(16))
            else -> fallback
        }
    }.getOrElse { fallback }
}
