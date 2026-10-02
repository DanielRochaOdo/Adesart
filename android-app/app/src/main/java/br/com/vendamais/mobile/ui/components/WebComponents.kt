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
import br.com.vendamais.mobile.ui.theme.LiquidGlassDark
import br.com.vendamais.mobile.ui.theme.LiquidGlassDarkStrong
import br.com.vendamais.mobile.ui.theme.LiquidGlassLight
import br.com.vendamais.mobile.ui.theme.LiquidGlassLightStrong
import br.com.vendamais.mobile.ui.theme.LiquidGreenGlow
import br.com.vendamais.mobile.ui.theme.LiquidCyanGlow
import br.com.vendamais.mobile.ui.theme.LiquidSpecularDark
import br.com.vendamais.mobile.ui.theme.LiquidSpecularLight

@Composable
fun ScreenBackground(content: @Composable () -> Unit) {
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val backgroundBrush = if (dark) {
        Brush.verticalGradient(
            listOf(
                Color(0xFF06101D),
                Color(0xFF0A1525),
                Color(0xFF07111F),
            ),
        )
    } else {
        Brush.verticalGradient(
            listOf(
                Color(0xFFDCE8E2),
                Color(0xFFE8F0EC),
                Color(0xFFDFEAE4),
            ),
        )
    }
    val glowBrush = Brush.radialGradient(
        colors = listOf(
            if (dark) LiquidGreenGlow.copy(alpha = 0.52f) else LiquidGreenGlow.copy(alpha = 0.72f),
            LiquidCyanGlow.copy(alpha = if (dark) 0.34f else 0.46f),
            Color.Transparent,
        ),
    )
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
    val surfaceBrush = Brush.verticalGradient(
        listOf(
            if (dark) LiquidGlassDarkStrong else LiquidGlassLightStrong,
            if (dark) LiquidGlassDark else LiquidGlassLight,
        ),
    )
    val glowBrush = Brush.radialGradient(
        colors = listOf(
            MaterialTheme.colorScheme.primary.copy(alpha = if (dark) 0.13f else 0.16f),
            LiquidCyanGlow.copy(alpha = if (dark) 0.20f else 0.30f),
            Color.Transparent,
        ),
    )
    val specularBrush = Brush.linearGradient(
        colors = listOf(
            Color.Transparent,
            if (dark) LiquidSpecularDark else LiquidSpecularLight.copy(alpha = 0.62f),
            Color.Transparent,
        ),
    )
    Box(
        modifier = modifier
            .shadow(
                elevation = if (dark) 18.dp else 14.dp,
                shape = shape,
                ambientColor = if (dark) Color.Black.copy(alpha = 0.38f) else Color(0xFF0F172A).copy(alpha = 0.13f),
                spotColor = if (dark) Color.Black.copy(alpha = 0.42f) else Color(0xFF0F172A).copy(alpha = 0.10f),
            )
            .background(surfaceBrush, shape)
            .border(
                1.dp,
                if (dark) Color.White.copy(alpha = 0.13f) else Color.White.copy(alpha = 0.62f),
                shape,
            ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(glowBrush, shape),
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(specularBrush, shape),
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
    val heroBrush = Brush.verticalGradient(
        listOf(
            if (dark) LiquidGlassDarkStrong.copy(alpha = 0.90f) else LiquidGlassLightStrong.copy(alpha = 0.92f),
            if (dark) LiquidGlassDark.copy(alpha = 0.82f) else LiquidGlassLight.copy(alpha = 0.80f),
        ),
    )
    val heroGlow = Brush.radialGradient(
        colors = listOf(
            MaterialTheme.colorScheme.primary.copy(alpha = if (dark) 0.22f else 0.24f),
            LiquidCyanGlow.copy(alpha = if (dark) 0.22f else 0.34f),
            Color.Transparent,
        ),
    )
    val heroSpecular = Brush.linearGradient(
        colors = listOf(
            Color.Transparent,
            if (dark) LiquidSpecularDark else LiquidSpecularLight.copy(alpha = 0.58f),
            Color.Transparent,
        ),
    )
    Box(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = if (dark) 20.dp else 15.dp,
                shape = shape,
                ambientColor = if (dark) Color.Black.copy(alpha = 0.40f) else Color(0xFF0F172A).copy(alpha = 0.13f),
                spotColor = if (dark) Color.Black.copy(alpha = 0.42f) else Color(0xFF0F172A).copy(alpha = 0.10f),
            )
            .background(heroBrush, shape)
            .border(
                1.dp,
                if (dark) Color.White.copy(alpha = 0.13f) else Color.White.copy(alpha = 0.66f),
                shape,
            ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(heroGlow, shape),
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(heroSpecular, shape),
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
