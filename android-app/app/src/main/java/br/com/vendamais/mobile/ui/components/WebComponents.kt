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
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
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
import br.com.vendamais.mobile.ui.theme.LiquidGlassDark
import br.com.vendamais.mobile.ui.theme.LiquidGlassDarkStrong
import br.com.vendamais.mobile.ui.theme.LiquidGlassLight
import br.com.vendamais.mobile.ui.theme.LiquidGlassLightStrong
import kotlin.math.max

@Composable
fun ScreenBackground(content: @Composable () -> Unit) {
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val baseColor = if (dark) Color(0xFF08111F) else Color(0xFFE7EEEB)
    val greenGlow = if (dark) {
        Color(0xFF10B981).copy(alpha = 0.15f)
    } else {
        Color(0xFF10B981).copy(alpha = 0.14f)
    }
    val cyanGlow = if (dark) {
        Color(0xFF0E7490).copy(alpha = 0.08f)
    } else {
        Color(0xFF14B8A6).copy(alpha = 0.07f)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .drawWithCache {
                val largestSide = max(size.width, size.height)
                val greenBrush = Brush.radialGradient(
                    colors = listOf(greenGlow, Color.Transparent),
                    center = Offset(size.width * 0.10f, -size.height * 0.08f),
                    radius = largestSide * 0.70f,
                )
                val cyanBrush = Brush.radialGradient(
                    colors = listOf(cyanGlow, Color.Transparent),
                    center = Offset(size.width * 0.92f, size.height * 0.06f),
                    radius = largestSide * 0.58f,
                )
                val topWash = Brush.verticalGradient(
                    colors = listOf(
                        Color.White.copy(alpha = if (dark) 0.012f else 0.055f),
                        Color.Transparent,
                    ),
                    endY = size.height * 0.30f,
                )
                onDrawBehind {
                    drawRect(baseColor)
                    drawRect(greenBrush)
                    drawRect(cyanBrush)
                    drawRect(topWash)
                }
            },
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
    val shape = RoundedCornerShape(VendaRadius.xl)
    val baseColor = if (dark) LiquidGlassDark else LiquidGlassLight
    val highlightBrush = Brush.verticalGradient(
        colors = listOf(
            Color.White.copy(alpha = if (dark) 0.022f else 0.20f),
            Color.White.copy(alpha = if (dark) 0.006f else 0.015f),
        ),
    )
    Box(
        modifier = modifier
            .shadow(
                elevation = if (dark) 12.dp else 10.dp,
                shape = shape,
                ambientColor = if (dark) Color.Black.copy(alpha = 0.24f) else Color(0xFF0F172A).copy(alpha = 0.085f),
                spotColor = if (dark) Color.Black.copy(alpha = 0.26f) else Color(0xFF0F172A).copy(alpha = 0.07f),
            )
            .background(baseColor, shape)
            .background(highlightBrush, shape)
            .border(
                1.dp,
                if (dark) Color.White.copy(alpha = 0.075f) else Color(0xFF1E293B).copy(alpha = 0.14f),
                shape,
            ),
    ) {
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
    val heroColor = if (dark) LiquidGlassDarkStrong else LiquidGlassLightStrong
    val heroHighlight = Brush.verticalGradient(
        colors = listOf(
            Color.White.copy(alpha = if (dark) 0.025f else 0.26f),
            Color.Transparent,
        ),
    )
    Box(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = if (dark) 14.dp else 11.dp,
                shape = shape,
                ambientColor = if (dark) Color.Black.copy(alpha = 0.26f) else Color(0xFF0F172A).copy(alpha = 0.10f),
                spotColor = if (dark) Color.Black.copy(alpha = 0.28f) else Color(0xFF0F172A).copy(alpha = 0.08f),
            )
            .background(heroColor, shape)
            .background(heroHighlight, shape)
            .border(
                1.dp,
                if (dark) Color.White.copy(alpha = 0.075f) else Color(0xFF1E293B).copy(alpha = 0.14f),
                shape,
            ),
    ) {
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
