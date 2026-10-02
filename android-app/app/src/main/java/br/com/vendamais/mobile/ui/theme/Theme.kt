package br.com.vendamais.mobile.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Emerald,
    primaryContainer = EmeraldSoft,
    onPrimaryContainer = EmeraldDark,
    secondary = BrandGreen,
    secondaryContainer = EmeraldSoft,
    onSecondaryContainer = EmeraldDark,
    tertiary = Blue500,
    tertiaryContainer = Blue100,
    background = BackgroundDefault,
    surface = SurfaceDefault,
    surfaceVariant = BackgroundSubtle,
    surfaceContainer = SurfaceDefault,
    surfaceContainerHigh = SurfaceElevated,
    surfaceContainerHighest = SurfaceElevated,
    onPrimary = White,
    onSecondary = White,
    onTertiary = White,
    onBackground = TextPrimary,
    onSurface = TextPrimary,
    onSurfaceVariant = TextSecondary,
    outline = Color(0xFF9AA9A1),
    outlineVariant = Color(0xFFC0CEC7),
    error = Red500,
    errorContainer = Red100,
    onErrorContainer = Red500,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF6EE7B7),
    primaryContainer = Color(0xFF123F33),
    onPrimaryContainer = Color(0xFFC7F5E5),
    secondary = Color(0xFF83D7BB),
    secondaryContainer = Color(0xFF163E33),
    onSecondaryContainer = Color(0xFFC7F5E5),
    tertiary = Color(0xFF8FB0FF),
    tertiaryContainer = Color(0xFF1E335F),
    onTertiaryContainer = Color(0xFFDCE5FF),
    background = Color(0xFF08111F),
    surface = Color(0xFF0F1A2C),
    surfaceVariant = Color(0xFF162235),
    surfaceContainer = Color(0xFF0F1A2C),
    surfaceContainerHigh = Color(0xFF162235),
    surfaceContainerHighest = Color(0xFF1B2A3D),
    onPrimary = Color(0xFF042A20),
    onSecondary = Color(0xFF062B22),
    onTertiary = Color(0xFF10244E),
    onBackground = Color(0xFFF4F7FB),
    onSurface = Color(0xFFF4F7FB),
    onSurfaceVariant = Color(0xFFC8D2DF),
    outline = Color(0xFF3B4A5D),
    outlineVariant = Color(0xFF263547),
    error = Color(0xFFFF8A84),
    errorContainer = Color(0xFF4A1D1B),
    onErrorContainer = Color(0xFFFFDAD6),
)

private val VendaMaisShapes = Shapes(
    extraSmall = RoundedCornerShape(VendaRadius.sm),
    small = RoundedCornerShape(VendaRadius.md),
    medium = RoundedCornerShape(VendaRadius.lg),
    large = RoundedCornerShape(VendaRadius.xl),
    extraLarge = RoundedCornerShape(VendaRadius.xxl),
)

@Composable
fun VendaMaisTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = Typography,
        shapes = VendaMaisShapes,
        content = content,
    )
}
