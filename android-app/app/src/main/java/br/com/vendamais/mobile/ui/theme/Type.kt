package br.com.vendamais.mobile.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import br.com.vendamais.mobile.R

/**
 * O redesign do Figma foi especificado em Hanken Grotesk. O repositório Android
 * não contém o arquivo/licença dessa família; por isso o app mantém Sora, que é
 * o asset tipográfico oficial já embarcado, preservando pesos, escala e ritmo
 * do design sem introduzir uma dependência externa ou fonte não versionada.
 */
private val VendaFont = FontFamily(
    Font(R.font.sora_variable, weight = FontWeight.Normal),
    Font(R.font.sora_variable, weight = FontWeight.Medium),
    Font(R.font.sora_variable, weight = FontWeight.SemiBold),
    Font(R.font.sora_variable, weight = FontWeight.Bold),
)

val Typography = Typography(
    displayLarge = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.Bold, fontSize = 36.sp, lineHeight = 44.sp),
    displayMedium = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.Bold, fontSize = 32.sp, lineHeight = 40.sp),
    displaySmall = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.SemiBold, fontSize = 28.sp, lineHeight = 36.sp),
    headlineLarge = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 36.sp),
    headlineMedium = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 32.sp),
    headlineSmall = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 24.sp),
    titleMedium = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    titleSmall = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontFamily = VendaFont, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 15.sp),
)
