package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.AppConfig
import br.com.vendamais.mobile.ui.AppUiState
import br.com.vendamais.mobile.ui.components.VendaBrandWordmark
import br.com.vendamais.mobile.ui.components.VendaButton
import br.com.vendamais.mobile.ui.components.VendaButtonSize
import br.com.vendamais.mobile.ui.components.VendaFeedbackTone
import br.com.vendamais.mobile.ui.components.VendaInlineFeedback
import br.com.vendamais.mobile.ui.components.bringIntoViewOnFocus
import br.com.vendamais.mobile.ui.theme.Emerald
import br.com.vendamais.mobile.ui.theme.VendaRadius
import br.com.vendamais.mobile.ui.theme.VendaSpacing
import br.com.vendamais.mobile.ui.theme.White

@Composable
fun LoginScreen(
    state: AppUiState,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    rememberConnected: Boolean,
    onRememberConnectedChange: (Boolean) -> Unit,
    onLogin: () -> Unit,
) {
    val uriHandler = LocalUriHandler.current

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Emerald),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom))
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = VendaSpacing.x5, vertical = VendaSpacing.x6),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // O prototipo usa ODONTOART como texto. Aqui a marca oficial versionada
            // no Android substitui esse tratamento, sem distorcer a identidade.
            VendaBrandWordmark()

            Spacer(modifier = Modifier.height(VendaSpacing.x5))

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.large,
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 0.dp,
                border = BorderStroke(1.dp, White.copy(alpha = 0.20f)),
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = VendaSpacing.x5, vertical = VendaSpacing.x6),
                    verticalArrangement = Arrangement.spacedBy(VendaSpacing.x4),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(VendaSpacing.x1)) {
                        Text(
                            text = "Acesse sua conta",
                            style = MaterialTheme.typography.headlineSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "Use suas credenciais do Venda+ para continuar",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    OutlinedTextField(
                        value = state.email,
                        onValueChange = onEmailChange,
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("E-mail") },
                        placeholder = { Text("seu.usuario@odontoart.com.br") },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next,
                        ),
                        singleLine = true,
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(VendaRadius.md),
                    )

                    OutlinedTextField(
                        value = state.password,
                        onValueChange = onPasswordChange,
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = { Text("Senha") },
                        placeholder = { Text("Sua senha secreta") },
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done,
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = { if (!state.loading) onLogin() },
                        ),
                        singleLine = true,
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(VendaRadius.md),
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(
                            checked = rememberConnected,
                            onCheckedChange = if (state.loading) null else onRememberConnectedChange,
                        )
                        Text(
                            text = "Manter conectado neste dispositivo",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    state.errorMessage?.let { message ->
                        VendaInlineFeedback(
                            title = "Nao foi possivel entrar",
                            message = message,
                            tone = VendaFeedbackTone.ERROR,
                        )
                    }

                    if (state.configurationMissing) {
                        VendaInlineFeedback(
                            title = "Configuracao do aplicativo incompleta",
                            message = "Contate o suporte responsavel pelo Venda+ para liberar o acesso.",
                            tone = VendaFeedbackTone.WARNING,
                        )
                    }

                    VendaButton(
                        label = "Entrar",
                        onClick = onLogin,
                        modifier = Modifier.fillMaxWidth(),
                        size = VendaButtonSize.LARGE,
                        enabled = !state.loading,
                        loading = state.loading,
                    )
                }
            }

            Spacer(modifier = Modifier.height(VendaSpacing.x3))
            TextButton(onClick = { uriHandler.openUri(AppConfig.privacyPolicyUrl) }) {
                Text(
                    text = "Politica de Privacidade",
                    color = White,
                )
            }
            Spacer(modifier = Modifier.height(VendaSpacing.x2))
            Text(
                text = "Acesso restrito a usuarios autorizados",
                style = MaterialTheme.typography.labelSmall,
                color = White.copy(alpha = 0.82f),
            )
        }
    }
}
