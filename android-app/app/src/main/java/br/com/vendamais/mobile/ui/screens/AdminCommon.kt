package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.ui.components.VendaEmptyState
import br.com.vendamais.mobile.ui.components.VendaLoadingState
import br.com.vendamais.mobile.ui.theme.Emerald
import br.com.vendamais.mobile.ui.theme.EmeraldSoft
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray

@Composable
internal fun AdminLoadingCard() {
    VendaLoadingState(
        title = "Carregando dados",
        message = "Atualizando as informacoes administrativas.",
    )
}

@Composable
internal fun EmptyAdminCard(message: String) {
    VendaEmptyState(
        title = message,
        message = "Ajuste os filtros ou atualize os dados para tentar novamente.",
    )
}

@Composable
internal fun AdminBadge(label: String, bgColor: Color, textColor: Color) {
    Text(
        text = label,
        modifier = Modifier
            .background(bgColor, RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        color = textColor,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
    )
}

@Composable
internal fun <T> SelectionField(
    label: String,
    value: String,
    options: List<Pair<T, String>>,
    enabled: Boolean = true,
    highlighted: Boolean = false,
    onSelected: (T) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val fieldColor = if (highlighted) EmeraldSoft.copy(alpha = 0.55f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
    val fieldBorder = if (highlighted) {
        BorderStroke(1.dp, Emerald.copy(alpha = 0.35f))
    } else {
        BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f))
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled) { open = true },
            shape = RoundedCornerShape(12.dp),
            color = fieldColor,
            border = fieldBorder,
        ) {
            Text(
                text = value,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 16.dp),
                color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
            )
        }
    }

    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(label) },
            text = {
                LazyColumn(
                    modifier = Modifier.heightIn(max = 360.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(options) { option ->
                        val selected = option.second == value
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    onSelected(option.first)
                                    open = false
                                },
                            shape = RoundedCornerShape(12.dp),
                            color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                        ) {
                            Text(
                                text = option.second,
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 16.dp),
                                color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { open = false }) {
                    Text("Fechar")
                }
            },
        )
    }
}

internal fun String.roleLabel(): String = when (this) {
    "ADMINISTRADOR" -> "Administrador"
    "GERENTE" -> "Gerente"
    "CADASTRO" -> "Cadastro"
    "SUPERVISOR" -> "Supervisor"
    "VENDEDOR" -> "Vendedor"
    "ADESIONISTA" -> "Adesionista"
    else -> this
}

internal fun onlyDigits(value: String): String = value.filter(Char::isDigit)

internal fun formatPhone(value: String): String {
    val digits = onlyDigits(value).take(11)
    return when (digits.length) {
        in 0..2 -> digits
        in 3..7 -> "(${digits.take(2)}) ${digits.drop(2)}"
        8, 9, 10 -> "(${digits.take(2)}) ${digits.substring(2, digits.length - 4)}-${digits.takeLast(4)}"
        else -> "(${digits.take(2)}) ${digits.substring(2, 7)}-${digits.takeLast(4)}"
    }
}

internal fun roleOptions(canEditRole: Boolean): List<Pair<String, String>> {
    val base = mutableListOf(
        "VENDEDOR" to "Vendedor",
        "ADESIONISTA" to "Adesionista",
        "CADASTRO" to "Cadastro",
        "SUPERVISOR" to "Supervisor",
    )
    if (canEditRole) {
        base += listOf(
            "GERENTE" to "Gerente",
            "ADMINISTRADOR" to "Administrador",
        )
    }
    return base
}

internal fun intJsonArray(values: List<Int>) = buildJsonArray {
    values.forEach { add(JsonPrimitive(it)) }
}

internal fun stringJsonArray(values: List<String>) = buildJsonArray {
    values.forEach { add(JsonPrimitive(it)) }
}

internal fun parseColor(raw: String): Color {
    return runCatching { Color(android.graphics.Color.parseColor(raw)) }.getOrDefault(Emerald)
}
