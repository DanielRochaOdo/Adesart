package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Assessment
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.HourglassEmpty
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.data.models.VendedorStats
import br.com.vendamais.mobile.ui.AppUiState
import br.com.vendamais.mobile.ui.DashboardMetricType
import br.com.vendamais.mobile.ui.components.ScreenHeading
import br.com.vendamais.mobile.ui.components.WebCard
import br.com.vendamais.mobile.ui.components.VendaMetricCard
import br.com.vendamais.mobile.ui.components.VendaStatusChip
import br.com.vendamais.mobile.ui.components.VendaStatusTone
import br.com.vendamais.mobile.ui.theme.Amber100
import br.com.vendamais.mobile.ui.theme.Amber500
import br.com.vendamais.mobile.ui.theme.Blue100
import br.com.vendamais.mobile.ui.theme.Blue500
import br.com.vendamais.mobile.ui.theme.Emerald
import br.com.vendamais.mobile.ui.theme.EmeraldDark
import br.com.vendamais.mobile.ui.theme.EmeraldSoft

@Composable
fun DashboardScreen(
    state: AppUiState,
    onOpenDrilldown: (String, DashboardMetricType) -> Unit,
    onCloseDrilldown: () -> Unit,
) {
    val profile = state.profile ?: return
    val canViewSystemOverview = profile.role in setOf("ADMINISTRADOR", "ADMIN", "GERENTE")
    val canOpenDrilldown = profile.role in setOf("ADMINISTRADOR", "ADMIN", "GERENTE", "SUPERVISOR")
    val totalMes = state.cadastroStats.cadastro_total + state.cadastroStats.inclusao_total
    val pendentesMes = state.cadastroStats.cadastro_incompletos + state.cadastroStats.inclusao_incompletos
    val enviadosMes = state.cadastroStats.cadastro_enviados + state.cadastroStats.inclusao_enviados

    LazyColumn(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            ScreenHeading(
                title = "Visao geral",
                subtitle = "Acompanhe a operacao do mes atual",
            )
        }

        item {
            WebCard {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = "Resumo do mes",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = "Cadastros e inclusoes de dependentes",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        VendaStatusChip(
                            label = "Atual",
                            tone = VendaStatusTone.SUCCESS,
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        SummaryMetric(
                            modifier = Modifier.weight(1f),
                            label = "Total",
                            value = totalMes,
                            container = Blue100,
                            content = Blue500,
                        )
                        SummaryMetric(
                            modifier = Modifier.weight(1f),
                            label = "Pendentes",
                            value = pendentesMes,
                            container = Amber100,
                            content = Amber500,
                        )
                        SummaryMetric(
                            modifier = Modifier.weight(1f),
                            label = "Enviados",
                            value = enviadosMes,
                            container = EmeraldSoft,
                            content = EmeraldDark,
                        )
                    }
                }
            }
        }

        item {
            MetricSection(
                title = "Cadastro",
                total = state.cadastroStats.cadastro_total,
                pendentes = state.cadastroStats.cadastro_incompletos,
                enviados = state.cadastroStats.cadastro_enviados,
                totalDetail = "${state.cadastroStats.cadastro_cadastros} cad. + ${state.cadastroStats.cadastro_dependentes} dep.",
                pendentesDetail = "${state.cadastroStats.cadastro_incompletos_cadastros} cad. + ${state.cadastroStats.cadastro_incompletos_dependentes} dep.",
                enviadosDetail = "${state.cadastroStats.cadastro_enviados_cadastros} cad. + ${state.cadastroStats.cadastro_enviados_dependentes} dep.",
                clickable = canOpenDrilldown,
                onMetricClick = { metricType -> onOpenDrilldown("cadastro", metricType) },
            )
        }

        item {
            MetricSection(
                title = "Inclusao de dependente",
                total = state.cadastroStats.inclusao_total,
                pendentes = state.cadastroStats.inclusao_incompletos,
                enviados = state.cadastroStats.inclusao_enviados,
                totalDetail = "${state.cadastroStats.inclusao_cadastros} cad. + ${state.cadastroStats.inclusao_dependentes} dep.",
                pendentesDetail = "${state.cadastroStats.inclusao_incompletos_cadastros} cad. + ${state.cadastroStats.inclusao_incompletos_dependentes} dep.",
                enviadosDetail = "${state.cadastroStats.inclusao_enviados_cadastros} cad. + ${state.cadastroStats.inclusao_enviados_dependentes} dep.",
                clickable = canOpenDrilldown,
                onMetricClick = { metricType -> onOpenDrilldown("inclusao_dependente", metricType) },
            )
        }

        if (state.dashboardDrilldownLoading) {
            item {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
        }

        item {
            WebCard(title = "Seu contexto") {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    OverviewLine(
                        icon = Icons.Rounded.Shield,
                        title = "Perfil",
                        value = profile.role,
                        detail = roleDescription(profile.role),
                        background = EmeraldSoft,
                        tint = EmeraldDark,
                    )
                    state.team?.let { team ->
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        OverviewLine(
                            icon = Icons.Rounded.Groups,
                            title = "Equipe",
                            value = team.name,
                            detail = if (team.isActive) "Equipe ativa" else "Equipe inativa",
                            background = Blue100,
                            tint = Blue500,
                        )
                    }
                }
            }
        }

        if (canViewSystemOverview) {
            item {
                WebCard(title = "Sistema") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        SystemMetric(
                            modifier = Modifier.weight(1f),
                            label = "Usuarios",
                            value = state.systemOverview.totalUsers,
                        )
                        SystemMetric(
                            modifier = Modifier.weight(1f),
                            label = "Ativos",
                            value = state.systemOverview.activeUsers,
                        )
                        SystemMetric(
                            modifier = Modifier.weight(1f),
                            label = "Equipes",
                            value = state.systemOverview.totalTeams,
                        )
                    }
                }
            }
        }
    }

    state.dashboardDrilldown?.let { drilldown ->
        StatsByVendedorSheet(
            title = drilldown.title,
            metricType = drilldown.metricType,
            stats = drilldown.items,
            onDismiss = onCloseDrilldown,
        )
    }
}

@Composable
private fun SummaryMetric(
    label: String,
    value: Int,
    container: Color,
    content: Color,
    modifier: Modifier = Modifier,
) {
    VendaMetricCard(
        value = value.toString(),
        label = label,
        modifier = modifier,
        containerColor = container,
        contentColor = content,
    )
}

@Composable
private fun MetricSection(
    title: String,
    total: Int,
    pendentes: Int,
    enviados: Int,
    totalDetail: String,
    pendentesDetail: String,
    enviadosDetail: String,
    clickable: Boolean,
    onMetricClick: (DashboardMetricType) -> Unit,
) {
    WebCard(title = title) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MetricTile(
                modifier = Modifier.weight(1f),
                label = "Total",
                value = total,
                detail = totalDetail,
                clickable = clickable,
                container = Blue100,
                content = Blue500,
                icon = Icons.Rounded.Description,
                onClick = { onMetricClick(DashboardMetricType.TOTAL) },
            )
            MetricTile(
                modifier = Modifier.weight(1f),
                label = "Pendentes",
                value = pendentes,
                detail = pendentesDetail,
                clickable = clickable,
                container = Amber100,
                content = Amber500,
                icon = Icons.Rounded.HourglassEmpty,
                onClick = { onMetricClick(DashboardMetricType.PENDENTES) },
            )
            MetricTile(
                modifier = Modifier.weight(1f),
                label = "Enviados",
                value = enviados,
                detail = enviadosDetail,
                clickable = clickable,
                container = EmeraldSoft,
                content = EmeraldDark,
                icon = Icons.Rounded.CheckCircle,
                onClick = { onMetricClick(DashboardMetricType.CADASTRADOS) },
            )
        }
    }
}

@Composable
private fun MetricTile(
    label: String,
    value: Int,
    detail: String,
    clickable: Boolean,
    container: Color,
    content: Color,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .background(container.copy(alpha = 0.72f), MaterialTheme.shapes.small)
            .then(if (clickable) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Surface(
            modifier = Modifier.size(28.dp),
            shape = RoundedCornerShape(9.dp),
            color = content,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = Color.White,
                )
            }
        }
        Text(
            text = value.toString(),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = content,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = detail,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            minLines = 2,
            maxLines = 2,
        )
    }
}

@Composable
private fun OverviewLine(
    icon: ImageVector,
    title: String,
    value: String,
    detail: String,
    background: Color,
    tint: Color,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            modifier = Modifier.size(40.dp),
            shape = MaterialTheme.shapes.small,
            color = background,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = title,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelMedium,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = detail,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun SystemMetric(
    label: String,
    value: Int,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(
                imageVector = Icons.Rounded.Assessment,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = value.toString(),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StatsByVendedorSheet(
    title: String,
    metricType: DashboardMetricType,
    stats: List<VendedorStats>,
    onDismiss: () -> Unit,
) {
    val sortedStats = stats.sortedByDescending {
        when (metricType) {
            DashboardMetricType.TOTAL -> it.total
            DashboardMetricType.PENDENTES -> it.incompletos
            DashboardMetricType.CADASTRADOS -> it.enviados
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "Desempenho por vendedor",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                TextButton(onClick = onDismiss) { Text("Fechar") }
            }

            if (sortedStats.isEmpty()) {
                WebCard {
                    Text(
                        text = "Nenhum dado disponivel.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.heightIn(max = 520.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(sortedStats) { stat ->
                        WebCard {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(
                                    modifier = Modifier.weight(1f),
                                    verticalArrangement = Arrangement.spacedBy(3.dp),
                                ) {
                                    Text(stat.vendedorNome, fontWeight = FontWeight.SemiBold)
                                    Text(
                                        "Total ${stat.total} · Pendentes ${stat.incompletos} · Enviados ${stat.enviados}",
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                                Text(
                                    text = when (metricType) {
                                        DashboardMetricType.TOTAL -> stat.total.toString()
                                        DashboardMetricType.PENDENTES -> stat.incompletos.toString()
                                        DashboardMetricType.CADASTRADOS -> stat.enviados.toString()
                                    },
                                    color = Emerald,
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun roleDescription(role: String): String {
    return when (role) {
        "ADMINISTRADOR", "ADMIN" -> "Acesso total ao sistema"
        "GERENTE", "GESTOR" -> "Gerenciamento de equipes e usuarios"
        "SUPERVISOR" -> "Supervisao de equipe"
        "VENDEDOR" -> "Execucao de vendas"
        "ADESIONISTA" -> "Processos de adesao"
        "CADASTRO" -> "Operacao de cadastros"
        else -> ""
    }
}
