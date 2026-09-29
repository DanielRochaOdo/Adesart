package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
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
import br.com.vendamais.mobile.ui.theme.Emerald
import br.com.vendamais.mobile.ui.theme.EmeraldSoft
import br.com.vendamais.mobile.ui.theme.Slate100
import br.com.vendamais.mobile.ui.theme.Slate500
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun TeamsScreen(
    state: AppUiState,
    viewModel: AppViewModel,
) {
    val scope = rememberCoroutineScope()
    var creatingTeam by remember { mutableStateOf(false) }
    var editingTeam by remember { mutableStateOf<AdminTeam?>(null) }
    val usersByTeam = remember(state.adminUsers) { state.adminUsers.groupBy { it.teamId } }
    val activeTeams = state.adminTeams.count { it.isActive }
    val totalMembers = state.adminTeams.sumOf { team -> usersByTeam[team.id].orEmpty().size }
    val isSupervisor = state.profile?.role == "SUPERVISOR"

    LazyColumn(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            ScreenHeading(
                title = if (isSupervisor) "Minha Equipe" else "Equipes",
                subtitle = if (isSupervisor) {
                    "Acompanhe e organize vendedores e adesionistas da sua operacao."
                } else {
                    "Organize a estrutura comercial e os responsaveis por cada equipe."
                },
            )
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                TeamMetric(
                    value = state.adminTeams.size.toString(),
                    label = "Equipes",
                    modifier = Modifier.weight(1f),
                )
                TeamMetric(
                    value = activeTeams.toString(),
                    label = "Ativas",
                    modifier = Modifier.weight(1f),
                )
                TeamMetric(
                    value = totalMembers.toString(),
                    label = "Membros",
                    modifier = Modifier.weight(1f),
                )
            }
        }

        if (state.profile?.role == "ADMINISTRADOR") {
            item {
                VendaButton(
                    label = "Criar nova equipe",
                    onClick = { creatingTeam = true },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        if (state.adminLoading && state.adminTeams.isEmpty()) {
            item { AdminLoadingCard() }
        } else if (state.adminTeams.isEmpty()) {
            item { EmptyAdminCard("Nenhuma equipe encontrada.") }
        } else {
            items(state.adminTeams) { team ->
                val members = usersByTeam[team.id].orEmpty()
                val canEditTeam = state.profile?.role in setOf("ADMINISTRADOR", "GERENTE") ||
                    (isSupervisor && state.profile?.teamId == team.id)

                WebCard {
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
                                    text = team.name,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    text = "${members.size} membro(s) vinculados",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            AdminBadge(
                                if (team.isActive) "Ativa" else "Inativa",
                                if (team.isActive) EmeraldSoft else Slate100,
                                if (team.isActive) Emerald else Slate500,
                            )
                        }

                        if (members.isEmpty()) {
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                            ) {
                                Text(
                                    text = "Nenhum vendedor ou adesionista vinculado.",
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        } else {
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                members.take(6).forEach { member ->
                                    AdminBadge(member.name, Slate100, Slate500)
                                }
                                if (members.size > 6) {
                                    AdminBadge("+${members.size - 6}", EmeraldSoft, Emerald)
                                }
                            }
                        }

                        if (canEditTeam) {
                            OutlinedButton(
                                onClick = { editingTeam = team },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(if (isSupervisor) "Gerenciar membros" else "Editar equipe e membros")
                            }
                        }
                    }
                }
            }
        }
    }

    if (creatingTeam) {
        TeamEditorSheet(
            title = "Nova Equipe",
            allUsers = state.adminUsers,
            onDismiss = { creatingTeam = false },
            onSubmit = { name, _ ->
                scope.launch {
                    runCatching { viewModel.createTeam(name) }
                        .onSuccess { creatingTeam = false }
                }
            },
        )
    }

    editingTeam?.let { team ->
        TeamEditorSheet(
            title = if (isSupervisor) "Gerenciar membros" else "Editar Equipe",
            team = team,
            allUsers = state.adminUsers,
            onDismiss = { editingTeam = null },
            canEditName = state.profile?.role in setOf("ADMINISTRADOR", "GERENTE"),
            onSubmit = { name, selectedUsers ->
                scope.launch {
                    runCatching {
                        if (state.profile?.role in setOf("ADMINISTRADOR", "GERENTE")) {
                            viewModel.updateTeam(
                                team.id,
                                buildJsonObject {
                                    put("name", name)
                                    put("is_active", team.isActive)
                                },
                            )
                        }
                        val selectedIds = selectedUsers.map { it.id }.toSet()
                        val currentMembers = state.adminUsers.filter {
                            it.teamId == team.id && it.role in setOf("VENDEDOR", "ADESIONISTA")
                        }
                        selectedUsers
                            .filter { it.teamId != team.id }
                            .forEach { member ->
                                viewModel.updateTeamMemberAssignment(member.id, team.id)
                            }
                        currentMembers
                            .filter { it.id !in selectedIds }
                            .forEach { removed ->
                                viewModel.updateTeamMemberAssignment(removed.id, null)
                            }
                    }.onSuccess {
                        editingTeam = null
                    }
                }
            },
        )
    }
}

@Composable
private fun TeamMetric(
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
private fun TeamEditorSheet(
    title: String,
    allUsers: List<AdminUser>,
    team: AdminTeam? = null,
    canEditName: Boolean = true,
    onDismiss: () -> Unit,
    onSubmit: (String, List<AdminUser>) -> Unit,
) {
    var name by remember(team) { mutableStateOf(team?.name.orEmpty()) }
    val selectedIds = remember(team, allUsers) {
        mutableStateListOf<String>().apply {
            addAll(allUsers.filter { it.teamId == team?.id }.map { it.id })
        }
    }
    val eligibleUsers = remember(allUsers, team?.id) {
        allUsers.filter {
            it.role in setOf("VENDEDOR", "ADESIONISTA") &&
                it.isActive &&
                (it.teamId == team?.id || it.teamId.isNullOrBlank())
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = if (team == null) {
                        "Crie a equipe; os membros podem ser organizados depois."
                    } else {
                        "Selecione os vendedores e adesionistas que pertencem a esta equipe."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                label = { Text("Nome da equipe") },
                enabled = canEditName,
                singleLine = true,
            )

            if (team != null) {
                Text(
                    text = "Membros disponiveis",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                LazyColumn(
                    modifier = Modifier.heightIn(max = 360.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(eligibleUsers) { user ->
                        val selected = selectedIds.contains(user.id)
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    if (selected) selectedIds.remove(user.id) else selectedIds.add(user.id)
                                },
                            shape = RoundedCornerShape(12.dp),
                            color = if (selected) EmeraldSoft else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (selected) Emerald.copy(alpha = 0.35f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.45f),
                            ),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(
                                    modifier = Modifier.weight(1f),
                                    verticalArrangement = Arrangement.spacedBy(2.dp),
                                ) {
                                    Text(user.name, fontWeight = FontWeight.Medium)
                                    Text(
                                        text = user.role.roleLabel(),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Text(
                                    text = if (selected) "Incluido" else "Adicionar",
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (selected) Emerald else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Cancelar")
                }
                Button(
                    enabled = name.isNotBlank(),
                    onClick = {
                        onSubmit(
                            name.trim(),
                            eligibleUsers.filter { selectedIds.contains(it.id) },
                        )
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Salvar")
                }
            }
        }
    }
}
