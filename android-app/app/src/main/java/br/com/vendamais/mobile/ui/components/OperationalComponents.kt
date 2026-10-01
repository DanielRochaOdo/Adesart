package br.com.vendamais.mobile.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.HourglassEmpty
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.ui.theme.Amber100
import br.com.vendamais.mobile.ui.theme.Amber500
import br.com.vendamais.mobile.ui.theme.Blue100
import br.com.vendamais.mobile.ui.theme.Blue500
import br.com.vendamais.mobile.ui.theme.Emerald
import br.com.vendamais.mobile.ui.theme.EmeraldDark
import br.com.vendamais.mobile.ui.theme.EmeraldSoft
import br.com.vendamais.mobile.ui.theme.Red100
import br.com.vendamais.mobile.ui.theme.Red500
import br.com.vendamais.mobile.ui.theme.Slate100
import br.com.vendamais.mobile.ui.theme.Slate500
import br.com.vendamais.mobile.ui.theme.VendaRadius
import br.com.vendamais.mobile.ui.theme.VendaSizing
import br.com.vendamais.mobile.ui.theme.VendaSpacing

/** Estados visuais previstos pelo componente Button do Figma. */
enum class VendaButtonStyle { PRIMARY, SECONDARY, TERTIARY, DANGER }
enum class VendaButtonSize { SMALL, MEDIUM, LARGE }

@Composable
fun VendaButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: VendaButtonStyle = VendaButtonStyle.PRIMARY,
    size: VendaButtonSize = VendaButtonSize.MEDIUM,
    enabled: Boolean = true,
    loading: Boolean = false,
    leadingIcon: ImageVector? = null,
) {
    val height = when (size) {
        VendaButtonSize.SMALL -> VendaSizing.buttonSm
        VendaButtonSize.MEDIUM -> VendaSizing.buttonMd
        VendaButtonSize.LARGE -> VendaSizing.buttonLg
    }
    val content: @Composable () -> Unit = {
        AnimatedContent(
            targetState = loading,
            transitionSpec = { androidx.compose.animation.fadeIn(tween(120)) togetherWith androidx.compose.animation.fadeOut(tween(120)) },
            label = "venda_button_loading",
        ) { isLoading ->
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = when (style) {
                        VendaButtonStyle.PRIMARY, VendaButtonStyle.DANGER -> Color.White
                        else -> MaterialTheme.colorScheme.primary
                    },
                )
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(VendaSpacing.x2),
                ) {
                    leadingIcon?.let {
                        Icon(it, contentDescription = null, modifier = Modifier.size(VendaSizing.iconMd))
                    }
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }

    when (style) {
        VendaButtonStyle.PRIMARY -> Button(
            onClick = onClick,
            modifier = modifier.heightIn(min = height),
            enabled = enabled && !loading,
            shape = RoundedCornerShape(VendaRadius.md),
            colors = ButtonDefaults.buttonColors(
                containerColor = Emerald,
                contentColor = Color.White,
                disabledContainerColor = Emerald.copy(alpha = 0.28f),
                disabledContentColor = Color.White.copy(alpha = 0.72f),
            ),
            content = { content() },
        )

        VendaButtonStyle.SECONDARY -> OutlinedButton(
            onClick = onClick,
            modifier = modifier.heightIn(min = height),
            enabled = enabled && !loading,
            shape = RoundedCornerShape(VendaRadius.md),
            border = BorderStroke(1.dp, if (enabled) Emerald.copy(alpha = 0.5f) else MaterialTheme.colorScheme.outline),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Emerald),
            content = { content() },
        )

        VendaButtonStyle.TERTIARY -> TextButton(
            onClick = onClick,
            modifier = modifier.heightIn(min = height),
            enabled = enabled && !loading,
            shape = RoundedCornerShape(VendaRadius.md),
            colors = ButtonDefaults.textButtonColors(contentColor = Emerald),
            content = { content() },
        )

        VendaButtonStyle.DANGER -> Button(
            onClick = onClick,
            modifier = modifier.heightIn(min = height),
            enabled = enabled && !loading,
            shape = RoundedCornerShape(VendaRadius.md),
            colors = ButtonDefaults.buttonColors(
                containerColor = Red500,
                contentColor = Color.White,
                disabledContainerColor = Red500.copy(alpha = 0.28f),
                disabledContentColor = Color.White.copy(alpha = 0.72f),
            ),
            content = { content() },
        )
    }
}

enum class VendaStatusTone { SUCCESS, WARNING, ERROR, INFO, PENDING, PROCESSING, NEUTRAL }

@Composable
fun VendaStatusChip(
    label: String,
    tone: VendaStatusTone,
    modifier: Modifier = Modifier,
) {
    val colors = when (tone) {
        VendaStatusTone.SUCCESS -> EmeraldSoft to EmeraldDark
        VendaStatusTone.WARNING -> Amber100 to Amber500
        VendaStatusTone.ERROR -> Red100 to Red500
        VendaStatusTone.INFO -> Blue100 to Blue500
        VendaStatusTone.PENDING -> Amber100 to Amber500
        VendaStatusTone.PROCESSING -> Blue100 to Blue500
        VendaStatusTone.NEUTRAL -> Slate100 to Slate500
    }
    val icon = when (tone) {
        VendaStatusTone.SUCCESS -> Icons.Rounded.CheckCircle
        VendaStatusTone.WARNING -> Icons.Rounded.WarningAmber
        VendaStatusTone.ERROR -> Icons.Rounded.ErrorOutline
        VendaStatusTone.INFO -> Icons.Rounded.Info
        VendaStatusTone.PENDING -> Icons.Rounded.HourglassEmpty
        VendaStatusTone.PROCESSING -> Icons.Rounded.HourglassEmpty
        VendaStatusTone.NEUTRAL -> Icons.Rounded.Info
    }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(VendaRadius.full),
        color = colors.first,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = VendaSpacing.x3, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(14.dp), tint = colors.second)
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = colors.second,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
fun VendaMetricCard(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    supportingText: String? = null,
    containerColor: Color = MaterialTheme.colorScheme.surface,
    contentColor: Color = MaterialTheme.colorScheme.onSurface,
    onClick: (() -> Unit)? = null,
) {
    Surface(
        modifier = modifier
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .animateContentSize(),
        shape = RoundedCornerShape(VendaRadius.lg),
        color = containerColor,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(
            modifier = Modifier.padding(VendaSpacing.x3),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = contentColor,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = contentColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            supportingText?.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

enum class VendaFeedbackTone { SUCCESS, WARNING, ERROR, INFO }

@Composable
fun VendaInlineFeedback(
    title: String,
    message: String? = null,
    modifier: Modifier = Modifier,
    tone: VendaFeedbackTone = VendaFeedbackTone.INFO,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    technicalActionLabel: String? = null,
    onTechnicalAction: (() -> Unit)? = null,
) {
    val palette = when (tone) {
        VendaFeedbackTone.SUCCESS -> Triple(EmeraldSoft, EmeraldDark, Icons.Rounded.CheckCircle)
        VendaFeedbackTone.WARNING -> Triple(Amber100, Amber500, Icons.Rounded.WarningAmber)
        VendaFeedbackTone.ERROR -> Triple(Red100, Red500, Icons.Rounded.ErrorOutline)
        VendaFeedbackTone.INFO -> Triple(Blue100, Blue500, Icons.Rounded.Info)
    }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(VendaRadius.lg),
        color = palette.first,
        border = BorderStroke(1.dp, palette.second.copy(alpha = 0.18f)),
    ) {
        Row(
            modifier = Modifier.padding(VendaSpacing.x4),
            horizontalArrangement = Arrangement.spacedBy(VendaSpacing.x3),
            verticalAlignment = Alignment.Top,
        ) {
            Surface(
                modifier = Modifier.size(32.dp),
                shape = CircleShape,
                color = palette.second.copy(alpha = 0.10f),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = palette.third,
                        contentDescription = null,
                        modifier = Modifier.size(VendaSizing.iconMd),
                        tint = palette.second,
                    )
                }
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(VendaSpacing.x1),
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = palette.second,
                )
                message?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (actionLabel != null && onAction != null) {
                    TextButton(onClick = onAction) { Text(actionLabel) }
                }
                if (technicalActionLabel != null && onTechnicalAction != null) {
                    TextButton(onClick = onTechnicalAction) { Text(technicalActionLabel) }
                }
            }
        }
    }
}

@Composable
fun VendaLoadingState(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    slowMessage: String? = null,
) {
    WebCard(modifier = modifier) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(VendaSpacing.x4),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(28.dp),
                strokeWidth = 3.dp,
                color = Emerald,
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(VendaSpacing.x1),
            ) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                slowMessage?.takeIf { it.isNotBlank() }?.let {
                    Spacer(Modifier.height(2.dp))
                    Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
fun VendaEmptyState(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    icon: ImageVector = Icons.Rounded.Info,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    WebCard(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = VendaSpacing.x3),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(VendaSpacing.x2),
        ) {
            Surface(
                modifier = Modifier.size(48.dp),
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surfaceVariant,
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            if (actionLabel != null && onAction != null) {
                VendaButton(
                    label = actionLabel,
                    onClick = onAction,
                    size = VendaButtonSize.SMALL,
                )
            }
        }
    }
}

@Composable
fun VendaWizardProgress(
    currentStep: Int,
    labels: List<String>,
    modifier: Modifier = Modifier,
) {
    if (labels.isEmpty()) return
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(VendaSpacing.x2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        labels.forEachIndexed { index, label ->
            val step = index + 1
            val active = step <= currentStep
            Column(
                modifier = Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(VendaSpacing.x1),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .background(
                            if (active) Emerald else MaterialTheme.colorScheme.outlineVariant,
                            RoundedCornerShape(VendaRadius.full),
                        ),
                )
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (active) Emerald else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = if (step == currentStep) FontWeight.Bold else FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
fun VendaSectionTabs(
    items: List<String>,
    selectedIndex: Int,
    onSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(VendaRadius.lg),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(VendaSpacing.x1),
            horizontalArrangement = Arrangement.spacedBy(VendaSpacing.x1),
        ) {
            items.forEachIndexed { index, label ->
                val selected = index == selectedIndex
                Surface(
                    modifier = Modifier
                        .widthIn(min = 88.dp)
                        .heightIn(min = 40.dp),
                    onClick = { onSelected(index) },
                    shape = RoundedCornerShape(VendaRadius.md),
                    color = if (selected) MaterialTheme.colorScheme.surface else Color.Transparent,
                    tonalElevation = if (selected) 1.dp else 0.dp,
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = label,
                            modifier = Modifier.padding(horizontal = VendaSpacing.x3, vertical = VendaSpacing.x2),
                            style = MaterialTheme.typography.labelMedium,
                            color = if (selected) Emerald else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Clip,
                        )
                    }
                }
            }
        }
    }
}

