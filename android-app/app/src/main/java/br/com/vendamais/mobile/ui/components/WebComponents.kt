package br.com.vendamais.mobile.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.shadow
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.ui.theme.VendaRadius
import br.com.vendamais.mobile.ui.theme.VendaSpacing

@Composable
fun ScreenBackground(content: @Composable () -> Unit) {
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val backgroundBrush = if (dark) {
        Brush.verticalGradient(
            listOf(
                Color(0xFF0B1625),
                MaterialTheme.colorScheme.background,
                Color(0xFF07101D),
            ),
        )
    } else {
        Brush.verticalGradient(
            listOf(
                Color(0xFFDDEBE4),
                MaterialTheme.colorScheme.background,
                Color(0xFFEAF1ED),
            ),
        )
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundBrush),
    ) {
        content()
    }
}

/**
 * Card operacional equivalente ao padrão `card` do Figma. A borda baixa
 * substitui sombras pesadas e mantém leitura boa durante uso prolongado.
 */
@Composable
fun WebCard(
    modifier: Modifier = Modifier,
    title: String? = null,
    contentPadding: PaddingValues = PaddingValues(VendaSpacing.x4),
    content: @Composable () -> Unit,
) {
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val shape = RoundedCornerShape(VendaRadius.lg)
    val surfaceBrush = if (dark) {
        Brush.verticalGradient(
            listOf(
                MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
                MaterialTheme.colorScheme.surface.copy(alpha = 0.76f),
            ),
        )
    } else {
        Brush.verticalGradient(
            listOf(
                Color(0xFFF8FBF9).copy(alpha = 0.96f),
                MaterialTheme.colorScheme.surface.copy(alpha = 0.84f),
            ),
        )
    }
    Column(
        modifier = modifier
            .shadow(
                elevation = if (dark) 8.dp else 6.dp,
                shape = shape,
                ambientColor = if (dark) Color.Black.copy(alpha = 0.35f) else Color(0xFF0F172A).copy(alpha = 0.12f),
                spotColor = if (dark) Color.Black.copy(alpha = 0.35f) else Color(0xFF0F172A).copy(alpha = 0.10f),
            )
            .background(surfaceBrush, shape)
            .border(
                1.dp,
                if (dark) Color.White.copy(alpha = 0.08f) else Color(0xFF334155).copy(alpha = 0.14f),
                shape,
            ),
    ) {
        if (title != null) {
            Column {
                Text(
                    text = title,
                    modifier = Modifier.padding(horizontal = VendaSpacing.x4, vertical = VendaSpacing.x3),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.72f))
            }
        }
        Box(modifier = Modifier.padding(contentPadding)) {
            content()
        }
    }
}

@Composable
fun ScreenHeading(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
) {
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val shape = RoundedCornerShape(VendaRadius.xl)
    val heroBrush = if (dark) {
        Brush.verticalGradient(
            listOf(
                Color(0xFF14273A).copy(alpha = 0.95f),
                Color(0xFF0F1A2C).copy(alpha = 0.86f),
            ),
        )
    } else {
        Brush.verticalGradient(
            listOf(
                Color(0xFFE4F3EC).copy(alpha = 0.98f),
                Color(0xFFF3F8F5).copy(alpha = 0.90f),
            ),
        )
    }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = if (dark) 8.dp else 7.dp,
                shape = shape,
                ambientColor = if (dark) Color.Black.copy(alpha = 0.32f) else Color(0xFF0F172A).copy(alpha = 0.10f),
                spotColor = if (dark) Color.Black.copy(alpha = 0.32f) else Color(0xFF0F172A).copy(alpha = 0.08f),
            )
            .background(heroBrush, shape)
            .border(
                1.dp,
                if (dark) Color.White.copy(alpha = 0.08f) else Color(0xFF059669).copy(alpha = 0.18f),
                shape,
            )
            .padding(horizontal = VendaSpacing.x4, vertical = VendaSpacing.x4),
        verticalArrangement = Arrangement.spacedBy(VendaSpacing.x1),
    ) {
        eyebrow?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = it.uppercase(),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
            )
        }
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
fun InfoRow(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(VendaSpacing.x1),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Medium,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun MetricBadge(
    label: String,
    value: String,
    bgColor: Color,
    textColor: Color,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .background(bgColor, RoundedCornerShape(VendaRadius.full))
            .padding(horizontal = VendaSpacing.x3, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = textColor,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.labelLarge,
            color = textColor,
            fontWeight = FontWeight.Bold,
        )
    }
}
