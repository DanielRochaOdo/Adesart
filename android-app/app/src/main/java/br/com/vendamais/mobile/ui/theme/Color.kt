package br.com.vendamais.mobile.ui.theme

import androidx.compose.ui.graphics.Color

// Venda+ Glass Lab palette: mesma identidade verde, com superfícies semânticas
// inspiradas na hierarquia visual aprovada no Web.
val Emerald = Color(0xFF059669)
val EmeraldDark = Color(0xFF047857)
val EmeraldSoft = Color(0xFFDDF3E9)
val BrandGreen = Color(0xFF0B8A63)
val BrandLime = Color(0xFF84B547)
val BrandDarkGreen = Color(0xFF064E3B)
val BrandOrange = Color(0xFFD97706)

val Slate900 = Color(0xFF0F172A)
val Slate800 = Color(0xFF1E293B)
val Slate700 = Color(0xFF334155)
val Slate600 = Color(0xFF475569)
val Slate500 = Color(0xFF64748B)
val Slate400 = Color(0xFF94A3B8)
val Slate300 = Color(0xFFCBD5E1)
val Slate200 = Color(0xFFE2E8F0)
val Slate100 = Color(0xFFF1F5F9)
val Slate50 = Color(0xFFF8FAFC)

val Blue500 = Color(0xFF2563EB)
val Blue100 = Color(0xFFDBEAFE)
val Amber500 = Color(0xFFB45309)
val Amber100 = Color(0xFFFEF3C7)
val Red500 = Color(0xFFB42318)
val Red100 = Color(0xFFFEE4E2)
val White = Color(0xFFFFFFFF)

// Semantic aliases mirrored from the final Figma collection. They keep UI code
// expressive and make future token synchronization independent from primitives.
val BackgroundDefault = Color(0xFFE7EEEB)
val BackgroundSubtle = Color(0xFFD8E3DD)
val BackgroundBrand = Emerald
val BackgroundElevated = Color(0xFFF7FAF8)
val SurfaceDefault = Color(0xFFF1F6F3)
val SurfaceElevated = Color(0xFFF8FBF9)
val SurfaceBrandSubtle = EmeraldSoft
val SurfaceSunken = Color(0xFFD8E3DD)
val SurfaceHover = Color(0xFFC9D9D0)

val TextPrimary = Color(0xFF162033)
val TextSecondary = Color(0xFF445469)
val TextDisabled = Color(0xFF7C8A9C)
val TextInverse = White
val TextBrand = Emerald

val GlassLight = Color(0xCCF1F7F4)
val GlassLightStrong = Color(0xEBF7FAF8)
val GlassDark = Color(0x99111B2C)
val GlassDarkStrong = Color(0xDB0F172A)
val GlassBorderLight = Color(0x26334155)
val GlassBorderDark = Color(0x22FFFFFF)

val ActionPrimary = Emerald
val ActionPrimaryPressed = EmeraldDark
val ActionPrimaryDisabled = Slate300
val ActionSecondary = BrandGreen
val ActionDanger = Red500
val ActionDangerPressed = Color(0xFF8F1C13)

val BorderDefault = Slate200
val BorderStrong = Slate400
val BorderBrand = Emerald
val BorderError = Red500

val StatusSuccess = BrandGreen
val StatusSuccessSubtle = EmeraldSoft
val StatusWarning = Amber500
val StatusWarningSubtle = Amber100
val StatusError = Red500
val StatusErrorSubtle = Red100
val StatusInfo = Blue500
val StatusInfoSubtle = Blue100
val StatusPending = Amber500
val StatusPendingSubtle = Amber100
