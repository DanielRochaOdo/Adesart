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
                Color(0xFF08111F),
                Color(0xFF0A1524),
                Color(0xFF07101D),
            ),
        )
    } else {
        Brush.verticalGradient(
            listOf(
                Color(0xFFDCE8E2),
                Color(0xFFE7EEEB),
                Color(0xFFEAF1ED),
            ),
        )
    }
    val glowBrush = if (dark) {
        Brush.radialGradient(
            colors = listOf(
                Color(0xFF10B981).copy(alpha = 0.16f),
                Color.Transparent,
            ),
        )
    } else {
        Brush.radialGradient(
            colors = listOf(
                Color(0xFF10B981).copy(alpha = 0.13f),
                Color.Transparent,
            ),
        )
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundBrush),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(glowBrush),
        )
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
    val shape = RoundedCornerShape(VendaRadius.xl)
    val surfaceBrush = if (dark) {
        Brush.verticalGradient(
            listOf(
                Color(0xFF172338).copy(alpha = 0.84f),
                Color(0xFF0F1A2C).copy(alpha = 0.72f),
            ),
        )
    } else {
        Brush.verticalGradient(
            listOf(
                Color(0xFFF8FBF9).copy(alpha = 0.90f),
                Color(0xFFEFF6F2).copy(alpha = 0.76f),
            ),
        )
    }
    val glowBrush = Brush.radialGradient(
        colors = listOf(
            MaterialTheme.colorScheme.primary.copy(alpha = if (dark) 0.10f else 0.09f),
            Color.Transparent,
        ),
    )
    Box(
        modifier = modifier
            .shadow(
                elevation = if (dark) 14.dp else 10.dp,
                shape = shape,
                ambientColor = if (dark) Color.Black.copy(alpha = 0.38f) else Color(0xFF0F172A).copy(alpha = 0.13f),
                spotColor = if (dark) Color.Black.copy(alpha = 0.42f) else Color(0xFF0F172A).copy(alpha = 0.10f),
            )
            .background(surfaceBrush, shape)
            .border(
                1.dp,
                if (dark) Color.White.copy(alpha = 0.09f) else Color(0xFF334155).copy(alpha = 0.14f),
                shape,
            ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(glowBrush, shape),
        )
        Column {
            if (title != null) {
                Column {
                    Text(
                        text = title,
                        modifier = Modifier.padding(horizontal = VendaSpacing.x4, vertical = VendaSpacing.x3),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Bold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.58f))
                }
            }
            Box(modifier = Modifier.padding(contentPadding)) {
                content()
            }
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
    val shape = RoundedCornerShape(VendaRadius.xxl)
    val heroBrush = if (dark) {
        Brush.verticalGradient(
            listOf(
                Color(0xFF183047).copy(alpha = 0.94f),
                Color(0xFF0F1A2C).copy(alpha = 0.82f),
            ),
        )
    } else {
        Brush.verticalGradient(
            listOf(
                Color(0xFFE1F2E9).copy(alpha = 0.95f),
                Color(0xFFF4F8F6).copy(alpha = 0.84f),
            ),
        )
    }
    val heroGlow = Brush.radialGradient(
        colors = listOf(
            MaterialTheme.colorScheme.primary.copy(alpha = if (dark) 0.18f else 0.16f),
            Color.Transparent,
        ),
    )
    Box(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = if (dark) 15.dp else 11.dp,
                shape = shape,
                ambientColor = if (dark) Color.Black.copy(alpha = 0.40f) else Color(0xFF0F172A).copy(alpha = 0.13f),
                spotColor = if (dark) Color.Black.copy(alpha = 0.42f) else Color(0xFF0F172A).copy(alpha = 0.10f),
            )
            .background(heroBrush, shape)
            .border(
                1.dp,
                if (dark) Color.White.copy(alpha = 0.09f) else Color(0xFF059669).copy(alpha = 0.20f),
                shape,
            ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(heroGlow, shape),
        )
        Column(
            modifier = Modifier.padding(horizontal = VendaSpacing.x5, vertical = VendaSpacing.x5),
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
