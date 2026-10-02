package br.com.vendamais.mobile.ui.theme

import androidx.compose.ui.unit.dp

/**
 * Tokens nativos derivados do design system final do Venda+ no Figma.
 *
 * O Figma usa uma grade base de 4 px. No Android esses valores são tratados
 * como dp para preservar a intenção visual em diferentes densidades.
 */
object VendaSpacing {
    val x1 = 4.dp
    val x2 = 8.dp
    val x3 = 12.dp
    val x4 = 16.dp
    val x5 = 20.dp
    val x6 = 24.dp
    val x8 = 32.dp
    val x10 = 40.dp
    val x12 = 48.dp
}

object VendaRadius {
    val none = 0.dp
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 20.dp
    val xxl = 24.dp
    val full = 999.dp
}

object VendaSizing {
    val iconSm = 16.dp
    val iconMd = 20.dp
    val iconLg = 24.dp
    val iconXl = 32.dp

    /** Área mínima de toque. O protótipo pode desenhar ícones menores, mas o Android mantém 48dp. */
    val touchTarget = 48.dp

    val avatarSm = 32.dp
    val avatarMd = 40.dp
    val avatarLg = 48.dp

    val buttonSm = 40.dp
    val buttonMd = 48.dp
    val buttonLg = 52.dp
    val inputHeight = 48.dp

    // Valores de referência visual. Insets do Android continuam sendo calculados pelo sistema.
    val bottomNavigation = 72.dp
    val topBar = 64.dp
}


/**
 * Intensidades globais do glassmorphism nativo.
 *
 * O Android não replica CSS/backdrop-filter literalmente. Em Compose a mesma
 * hierarquia visual é obtida combinando transparência, gradientes, borda
 * hairline, elevação e glow. Estes valores são compartilhados por todas as
 * telas para evitar variações entre módulos.
 */
object VendaGlass {
    const val lightSurfaceAlpha = 0.86f
    const val lightSurfaceStrongAlpha = 0.94f
    const val lightSunkenAlpha = 0.78f

    const val darkSurfaceAlpha = 0.74f
    const val darkSurfaceStrongAlpha = 0.88f
    const val darkSunkenAlpha = 0.66f

    const val lightBorderAlpha = 0.18f
    const val darkBorderAlpha = 0.10f
    const val lightHighlightAlpha = 0.62f
    const val darkHighlightAlpha = 0.035f

    val cardElevation = 10.dp
    val raisedElevation = 14.dp
    val modalElevation = 20.dp
}
