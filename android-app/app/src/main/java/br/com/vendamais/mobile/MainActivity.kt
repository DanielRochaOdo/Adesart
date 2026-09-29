package br.com.vendamais.mobile

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.collectAsState
import br.com.vendamais.mobile.ui.AppViewModel
import br.com.vendamais.mobile.ui.VendaMaisApp
import br.com.vendamais.mobile.ui.theme.VendaMaisTheme

class MainActivity : ComponentActivity() {
    private val viewModel by viewModels<AppViewModel> {
        AppViewModel.factory(applicationContext)
    }
    private val deepLinkTokenState = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        deepLinkTokenState.value = extractAdesaoToken(intent)
        enableEdgeToEdge()
        setContent {
            val uiState by viewModel.uiState.collectAsState()
            VendaMaisTheme(darkTheme = uiState.darkModeEnabled) {
                VendaMaisApp(
                    viewModel = viewModel,
                    deepLinkToken = deepLinkTokenState.value,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deepLinkTokenState.value = extractAdesaoToken(intent)
    }

    private fun extractAdesaoToken(intent: Intent?): String? {
        val uri = intent?.data ?: return null
        val segments = uri.pathSegments
        if (segments.size >= 2) {
            val prefix = segments[segments.size - 2]
            if (prefix.equals("adesao", ignoreCase = true)) {
                return segments.lastOrNull()?.takeIf { it.isNotBlank() }
            }
        }
        if (segments.firstOrNull()?.equals("adesao", ignoreCase = true) == true) {
            return segments.getOrNull(1)?.takeIf { it.isNotBlank() }
        }
        return uri.getQueryParameter("token")
            ?.takeIf { it.isNotBlank() }
            ?: uri.lastPathSegment?.takeIf { it.isNotBlank() }
    }
}
