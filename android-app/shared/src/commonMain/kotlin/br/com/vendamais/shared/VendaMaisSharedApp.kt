package br.com.vendamais.shared

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
fun VendaMaisSharedApp(
    publicAppUrl: String = VendaMaisEnvironment.publicAppUrl,
) {
    MaterialTheme {
        PlatformWebView(
            url = publicAppUrl,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
expect fun PlatformWebView(
    url: String,
    modifier: Modifier = Modifier,
)
