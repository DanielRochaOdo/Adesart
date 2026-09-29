package br.com.vendamais.mobile.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.R
import br.com.vendamais.mobile.ui.theme.EmeraldDark
import br.com.vendamais.mobile.ui.theme.VendaRadius
import br.com.vendamais.mobile.ui.theme.VendaSpacing
import br.com.vendamais.mobile.ui.theme.White

/** Ícone oficial do produto Venda+, usado no shell autenticado. */
@Composable
fun VendaBrandIcon(
    modifier: Modifier = Modifier,
    showPlusBubble: Boolean = true,
) {
    val logoModifier = if (modifier == Modifier) Modifier.size(40.dp) else modifier
    Surface(
        modifier = logoModifier,
        shape = RoundedCornerShape(VendaRadius.md),
        color = EmeraldDark,
    ) {
        Image(
            painter = painterResource(id = R.drawable.vendamais_logo_odontoart),
            contentDescription = "Venda+",
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
        )
    }
}

/**
 * Marca institucional oficial da Odontoart. O Figma final desenha ODONTOART
 * como texto; o Android usa o asset oficial versionado no repositório.
 */
@Composable
fun OdontoartBrandMark(
    modifier: Modifier = Modifier,
) {
    Image(
        painter = painterResource(id = R.drawable.odontoart_logo_publica),
        contentDescription = "Odontoart Planos Odontologicos",
        modifier = modifier,
        contentScale = ContentScale.Fit,
    )
}

@Composable
fun VendaBrandWordmark(
    modifier: Modifier = Modifier,
    subtitle: String? = null,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(VendaSpacing.x2),
    ) {
        OdontoartBrandMark(
            modifier = Modifier
                .fillMaxWidth(0.72f)
                .widthIn(max = 280.dp)
                .height(82.dp),
        )
        Text(
            text = "VENDA+ OPERACIONAL",
            color = White,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
        )
        if (!subtitle.isNullOrBlank()) {
            Text(
                text = subtitle,
                color = White.copy(alpha = 0.84f),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
fun OdontoartBadge(modifier: Modifier = Modifier) {
    OdontoartBrandMark(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp),
    )
}
