package br.com.vendamais.mobile.ui.theme

import androidx.compose.ui.graphics.Color

// Venda+ operational palette: sober, high-contrast and optimized for long sessions.
val Emerald = Color(0xFF064E3B)
val EmeraldDark = Color(0xFF043B2D)
val EmeraldSoft = Color(0xFFE8F3EE)
val BrandGreen = Color(0xFF0B7A5A)
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
val BackgroundDefault = Slate50
val BackgroundSubtle = Slate100
val BackgroundBrand = Emerald
val BackgroundElevated = White
val SurfaceDefault = White
val SurfaceElevated = White
val SurfaceBrandSubtle = EmeraldSoft

val TextPrimary = Slate900
val TextSecondary = Slate600
val TextDisabled = Slate400
val TextInverse = White
val TextBrand = Emerald

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
