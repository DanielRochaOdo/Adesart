package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.data.models.AdminTeam
import br.com.vendamais.mobile.data.models.AdminUser
import br.com.vendamais.mobile.ui.AppUiState
import br.com.vendamais.mobile.ui.AppViewModel
import br.com.vendamais.mobile.ui.components.ScreenHeading
import br.com.vendamais.mobile.ui.components.WebCard
import br.com.vendamais.mobile.ui.components.VendaButton
import br.com.vendamais.mobile.ui.components.VendaMetricCard
import br.com.vendamais.mobile.ui.components.bringIntoViewOnFocus
import br.com.vendamais.mobile.ui.theme.Amber100
import br.com.vendamais.mobile.ui.theme.Amber500
import br.com.vendamais.mobile.ui.theme.Emerald
import br.com.vendamais.mobile.ui.theme.EmeraldSoft
import br.com.vendamais.mobile.ui.theme.Slate100
import br.com.vendamais.mobile.ui.theme.Slate500
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.Locale

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun UsersScreen(
    state: AppUiState,
    viewModel: AppViewModel,
) {
    var searchTerm by rememberSaveable { mutableStateOf("") }
    var editingUser by remember { mutableStateOf<AdminUser?>(null) }
    var creatingUser by remember { mutableStateOf(false) }
    var userSubmitError by remember { mutableStateOf<String?>(null) }
    var userSubmitting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val teamNames = remember(state.adminTeams) { state.adminTeams.associateBy({ it.id }, { it.name }) }
    val filteredUsers = remember(state.adminUsers, searchTerm) {
        val normalized = searchTerm.trim().lowercase()
        state.adminUsers.filter { user ->
            normalized.isBlank() ||
                user.name.lowercase().contains(normalized) ||
                user.email.lowercase().contains(normalized)
        }
    }
    val canCreate = state.profile?.role in setOf("ADMINISTRADOR", "GERENTE", "SUPERVISOR")
    val canEditRole = state.profile?.role == "ADMINISTRADOR"
    val activeUsers = state.adminUsers.count { it.isActive }
    val commercialUsers = state.adminUsers.count {
        normalizeRole(it.role) in setOf("VENDEDOR", "ADESIONISTA", "SUPERVISOR")
    }

    LazyColumn(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            ScreenHeading(
                title = "Usuarios",
                subtitle = "Gerencie acesso, funcao, equipe e identificacao operacional de cada pessoa.",
            )
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                UserMetric(
                    value = state.adminUsers.size.toString(),
                    label = "Usuarios",
                    modifier = Modifier.weight(1f),
                )
                UserMetric(
                    value = activeUsers.toString(),
                    label = "Ativos",
                    modifier = Modifier.weight(1f),
                )
                UserMetric(
                    value = commercialUsers.toString(),
                    label = "Comerciais",
                    modifier = Modifier.weight(1f),
                )
            }
        }

        item {
            WebCard {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = searchTerm,
                        onValueChange = { searchTerm = it },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Buscar usuario") },
                        placeholder = { Text("Nome ou email") },
                        singleLine = true,
                    )
                    if (canCreate) {
                        VendaButton(
                            label = "Adicionar usuario",
                            onClick = {
                                userSubmitError = null
                                userSubmitting = false
                                creatingUser = true
                            },
                            modifier = Modifier.fillMaxWidth(),
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
                Text(
                    text = "Pessoas",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "${filteredUsers.size} resultado(s)",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (state.adminLoading && state.adminUsers.isEmpty()) {
            item { AdminLoadingCard() }
        } else if (filteredUsers.isEmpty()) {
            item { EmptyAdminCard("Nenhum usuario encontrado.") }
        } else {
            items(filteredUsers) { user ->
                WebCard(modifier = Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top,
                        ) {
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Text(
                                    text = user.name,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = user.email,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            AdminBadge(
                                if (user.isActive) "Ativo" else "Inativo",
                                if (user.isActive) EmeraldSoft else Slate100,
                                if (user.isActive) Emerald else Slate500,
                            )
                        }

                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            AdminBadge(user.role.roleLabel(), EmeraldSoft, Emerald)
                            teamNames[user.teamId]?.let { teamName ->
                                AdminBadge(teamName, Amber100, Amber500)
                            }
                            user.externalId?.takeIf { it.isNotBlank() }?.let { code ->
                                AdminBadge("ID $code", Slate100, Slate500)
                            }
                        }

                        user.telefone?.takeIf { it.isNotBlank() }?.let { phone ->
                            Text(
                                text = formatPhone(phone),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }

                        OutlinedButton(
                            onClick = {
                                userSubmitError = null
                                userSubmitting = false
                                editingUser = user
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Editar dados e acesso")
                        }
                    }
                }
            }
        }
    }

    if (creatingUser) {
        UserEditorSheet(
            title = "Novo Usuario",
            teams = state.adminTeams,
            canEditRole = canEditRole,
            submitError = userSubmitError,
            isSubmitting = userSubmitting,
            onDismiss = {
                userSubmitError = null
                userSubmitting = false
                creatingUser = false
            },
            onSubmit = { form ->
                scope.launch {
                    userSubmitError = null
                    userSubmitting = true
                    runCatching { viewModel.createUser(form.toCreatePayload()) }
                        .onSuccess { creatingUser = false }
                        .onFailure { throwable ->
                            userSubmitError = throwable.message ?: "Falha ao salvar usuario."
                        }
                    userSubmitting = false
                }
            },
        )
    }

    editingUser?.let { user ->
        UserEditorSheet(
            title = "Editar Usuario",
            teams = state.adminTeams,
            canEditRole = canEditRole,
            initialUser = user,
            submitError = userSubmitError,
            isSubmitting = userSubmitting,
            onDismiss = {
                userSubmitError = null
                userSubmitting = false
                editingUser = null
            },
            onSubmit = { form ->
                scope.launch {
                    userSubmitError = null
                    userSubmitting = true
                    runCatching { viewModel.updateUser(user.id, form.toUpdatePayload(canEditRole, user)) }
                        .onSuccess { editingUser = null }
                        .onFailure { throwable ->
                            userSubmitError = throwable.message ?: "Falha ao atualizar usuario."
                        }
                    userSubmitting = false
                }
            },
        )
    }
}

@Composable
private fun UserMetric(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
) {
    VendaMetricCard(
        value = value,
        label = label,
        modifier = modifier,
        contentColor = MaterialTheme.colorScheme.primary,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun UserEditorSheet(
    title: String,
    teams: List<AdminTeam>,
    canEditRole: Boolean,
    initialUser: AdminUser? = null,
    submitError: String? = null,
    isSubmitting: Boolean = false,
    onDismiss: () -> Unit,
    onSubmit: (UserFormState) -> Unit,
) {
    var form by remember(initialUser) { mutableStateOf(UserFormState.from(initialUser)) }
    val normalizedRole = normalizeRole(form.role)
    val requiresTeam = requiresTeamAndExternal(normalizedRole)
    val validationError = form.validationError(initialUser == null, initialUser)

    ModalBottomSheet(onDismissRequest = onDismiss) {
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
                    text = "Dados de acesso e vinculo operacional.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            LazyColumn(
                modifier = Modifier.heightIn(max = 520.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    OutlinedTextField(
                        value = form.name,
                        onValueChange = { form = form.copy(name = it) },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Nome") },
                        singleLine = true,
                    )
                }
                item {
                    OutlinedTextField(
                        value = form.email,
                        onValueChange = { form = form.copy(email = it) },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Email") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        singleLine = true,
                    )
                }
                if (initialUser == null) {
                    item {
                        OutlinedTextField(
                            value = form.password,
                            onValueChange = { form = form.copy(password = it) },
                            modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                            label = { Text("Senha inicial") },
                        )
                    }
                }
                item {
                    SelectionField(
                        label = "Funcao",
                        value = form.role.roleLabel(),
                        options = roleOptions(canEditRole),
                        enabled = initialUser == null || canEditRole,
                        onSelected = { form = form.copy(role = it) },
                    )
                }
                item {
                    OutlinedTextField(
                        value = form.telefone,
                        onValueChange = { form = form.copy(telefone = formatPhone(it)) },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Telefone") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        singleLine = true,
                    )
                }
                item {
                    OutlinedTextField(
                        value = form.lemmitLimite,
                        onValueChange = { form = form.copy(lemmitLimite = normalizeLemmitEditableInput(it)) },
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Limite Lemmit") },
                        prefix = { Text("R$ ") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                    )
                }
                if (requiresTeam) {
                    item {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            color = Amber100,
                        ) {
                            Text(
                                text = "Esta funcao exige ID Externo e Equipe para manter o vinculo com o ERP.",
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = Amber500,
                            )
                        }
                    }
                    item {
                        OutlinedTextField(
                            value = form.externalId,
                            onValueChange = { form = form.copy(externalId = it) },
                            modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                            label = { Text("ID Externo") },
                            singleLine = true,
                        )
                    }
                    item {
                        SelectionField(
                            label = "Equipe",
                            value = teams.firstOrNull { it.id == form.teamId }?.name ?: "Sem equipe",
                            options = listOf("" to "Sem equipe") + teams.map { it.id to it.name },
                            onSelected = { form = form.copy(teamId = it.ifBlank { null }) },
                        )
                    }
                }
                item {
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
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Acesso ativo", fontWeight = FontWeight.Medium)
                                Text(
                                    text = "Desative para impedir novos logins sem excluir o usuario.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Switch(
                                checked = form.isActive,
                                onCheckedChange = { form = form.copy(isActive = it) },
                            )
                        }
                    }
                }
                submitError?.takeIf { it.isNotBlank() }?.let { message ->
                    item {
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
                validationError?.let { message ->
                    item {
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = onDismiss,
                    enabled = !isSubmitting,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Cancelar")
                }
                Button(
                    enabled = !isSubmitting && validationError == null,
                    onClick = { onSubmit(form) },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(if (isSubmitting) "Salvando..." else "Salvar")
                }
            }
        }
    }
}

private data class UserFormState(
    val name: String = "",
    val email: String = "",
    val password: String = "",
    val telefone: String = "",
    val role: String = "VENDEDOR",
    val externalId: String = "",
    val teamId: String? = null,
    val isActive: Boolean = true,
    val lemmitLimite: String = "",
) {
    fun isValid(isCreate: Boolean, initialUser: AdminUser? = null): Boolean {
        return validationError(isCreate, initialUser) == null
    }

    fun validationError(isCreate: Boolean, initialUser: AdminUser? = null): String? {
        if (name.isBlank() || email.isBlank()) return "Nome e email são obrigatórios."
        if (isCreate && password.length < 6) return "A senha deve ter no mínimo 6 caracteres."
        if (lemmitLimite.isNotBlank() && parseLemmitLimite(lemmitLimite) == null) {
            return "Informe um valor válido para o limite Lemmit (ex: 300,00)."
        }
        val normalizedRole = normalizeRole(role)
        if (requiresTeamAndExternal(normalizedRole)) {
            val effectiveExternal = externalId.trim().ifBlank { initialUser?.externalId?.trim().orEmpty() }
            val effectiveTeamId = teamId?.takeIf { it.isNotBlank() } ?: initialUser?.teamId?.takeIf { it.isNotBlank() }
            if (effectiveExternal.isBlank()) return "ID Externo é obrigatório para esta função."
            if (effectiveTeamId.isNullOrBlank()) return "Equipe é obrigatória para esta função."
        }
        return null
    }

    fun toCreatePayload() = buildJsonObject {
        val normalizedRole = normalizeRole(role)
        put("name", name.trim())
        put("email", email.trim())
        put("password", password)
        put("role", normalizedRole)
        if (requiresTeamAndExternal(normalizedRole)) {
            put("external_id", externalId.trim())
            teamId?.takeIf { it.isNotBlank() }?.let { put("team_id", it) }
        }
    }

    fun toUpdatePayload(canEditRole: Boolean, initialUser: AdminUser? = null) = buildJsonObject {
        val normalizedRole = normalizeRole(role)
        val initialRole = initialUser?.role?.let(::normalizeRole)
        val shouldClearTeamAndExternal = canEditRole &&
            initialRole != null &&
            requiresTeamAndExternal(initialRole) &&
            !requiresTeamAndExternal(normalizedRole)

        put("name", name.trim())
        put("email", email.trim())
        val normalizedPhone = onlyDigits(telefone)
        if (normalizedPhone.isBlank()) {
            put("telefone", JsonNull)
        } else {
            put("telefone", normalizedPhone)
        }
        put("is_active", isActive)
        val normalizedLimit = parseLemmitLimite(lemmitLimite)
        if (lemmitLimite.isBlank()) {
            put("lemmit_limite_consultas", JsonNull)
        } else {
            normalizedLimit?.let { put("lemmit_limite_consultas", it) }
        }
        if (canEditRole) {
            put("role", normalizedRole)
        }
        if (requiresTeamAndExternal(normalizedRole)) {
            val effectiveExternal = externalId.trim().ifBlank { initialUser?.externalId?.trim().orEmpty() }
            val effectiveTeamId = teamId?.takeIf { it.isNotBlank() } ?: initialUser?.teamId?.takeIf { it.isNotBlank() }
            put("external_id", effectiveExternal)
            effectiveTeamId?.let { put("team_id", it) } ?: put("team_id", JsonNull)
        } else if (shouldClearTeamAndExternal) {
            put("external_id", JsonNull)
            put("team_id", JsonNull)
        }
    }

    companion object {
        fun from(user: AdminUser?) = UserFormState(
            name = user?.name.orEmpty(),
            email = user?.email.orEmpty(),
            telefone = formatPhone(user?.telefone.orEmpty()),
            role = user?.role ?: "VENDEDOR",
            externalId = user?.externalId.orEmpty(),
            teamId = user?.teamId,
            isActive = user?.isActive ?: true,
            lemmitLimite = user?.lemmitLimiteConsultas?.let(::formatLemmitEditableValue).orEmpty(),
        )
    }
}

private fun normalizeRole(role: String): String {
    return role.trim().uppercase(Locale.ROOT)
}

private fun requiresTeamAndExternal(role: String): Boolean {
    return role in setOf("SUPERVISOR", "VENDEDOR", "ADESIONISTA")
}

private fun parseLemmitLimite(rawValue: String): Double? {
    val sanitized = rawValue
        .trim()
        .replace("R$", "", ignoreCase = true)
        .replace("\u00A0", "")
        .replace(" ", "")
    if (sanitized.isBlank()) return null

    val cleaned = sanitized.filter { it.isDigit() || it == '.' || it == ',' }
    if (cleaned.isBlank()) return null

    val lastComma = cleaned.lastIndexOf(',')
    val lastDot = cleaned.lastIndexOf('.')
    val decimalSeparator = when {
        lastComma >= 0 && lastDot >= 0 -> if (lastComma > lastDot) ',' else '.'
        lastComma >= 0 -> ','
        lastDot >= 0 -> '.'
        else -> null
    }

    return if (decimalSeparator == null) {
        cleaned.filter(Char::isDigit).toDoubleOrNull()
    } else {
        val separatorIndex = cleaned.lastIndexOf(decimalSeparator)
        val integerPart = cleaned.substring(0, separatorIndex).filter(Char::isDigit).ifBlank { "0" }
        val decimalPart = cleaned.substring(separatorIndex + 1).filter(Char::isDigit)
        val numeric = if (decimalPart.isBlank()) integerPart else "$integerPart.$decimalPart"
        numeric.toDoubleOrNull()
    }
}

private fun normalizeLemmitEditableInput(rawValue: String): String {
    val sanitized = rawValue
        .replace("R$", "", ignoreCase = true)
        .replace("\u00A0", "")
        .replace(" ", "")
    if (sanitized.isBlank()) return ""

    val cleaned = sanitized.filter { it.isDigit() || it == '.' || it == ',' }
    if (cleaned.isBlank()) return ""

    val normalized = cleaned.replace('.', ',')
    val separatorIndex = normalized.indexOf(',')
    if (separatorIndex < 0) {
        val integerPart = normalized.filter(Char::isDigit).trimStart('0')
        return integerPart.ifBlank { "0" }
    }

    val integerPartRaw = normalized.substring(0, separatorIndex).filter(Char::isDigit)
    val integerPart = integerPartRaw.trimStart('0').ifBlank { "0" }
    val decimalPart = normalized.substring(separatorIndex + 1).filter(Char::isDigit).take(2)
    return "$integerPart,$decimalPart"
}

private fun formatLemmitEditableValue(value: Double): String {
    return String.format(Locale.US, "%.2f", value).replace('.', ',')
}
