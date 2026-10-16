package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.AppConfig
import br.com.vendamais.mobile.R
import br.com.vendamais.mobile.ui.AppUiState
import br.com.vendamais.mobile.ui.components.VendaButton
import br.com.vendamais.mobile.ui.components.VendaButtonSize
import br.com.vendamais.mobile.ui.components.VendaFeedbackTone
import br.com.vendamais.mobile.ui.components.VendaInlineFeedback
import br.com.vendamais.mobile.ui.components.bringIntoViewOnFocus
import br.com.vendamais.mobile.ui.theme.VendaSpacing
import br.com.vendamais.mobile.ui.theme.White

private val LoginFieldBackground = Color(0xFF24334A)
private val LoginFieldBorder = Color(0xFF475569)

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
    var passwordVisible by remember { mutableStateOf(false) }
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = White,
        unfocusedTextColor = White,
        cursorColor = Color(0xFF34D399),
        focusedContainerColor = LoginFieldBackground,
        unfocusedContainerColor = LoginFieldBackground,
        focusedBorderColor = Color(0xFF10B981),
        unfocusedBorderColor = LoginFieldBorder,
        focusedLabelColor = Color(0xFF6EE7B7),
        unfocusedLabelColor = Color(0xFF94A3B8),
        focusedPlaceholderColor = Color(0xFF94A3B8),
        unfocusedPlaceholderColor = Color(0xFF94A3B8),
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF07111F))
            .drawBehind {
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(Color(0x2520D3A0), Color.Transparent),
                        center = Offset(size.width * 0.12f, size.height * 0.08f),
                        radius = size.maxDimension * 0.62f,
                    ),
                    radius = size.maxDimension * 0.62f,
                    center = Offset(size.width * 0.12f, size.height * 0.08f),
                )
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(Color(0x14059669), Color.Transparent),
                        center = Offset(size.width * 0.92f, size.height * 0.90f),
                        radius = size.maxDimension * 0.52f,
                    ),
                    radius = size.maxDimension * 0.52f,
                    center = Offset(size.width * 0.92f, size.height * 0.90f),
                )
            },
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
            Image(
                painter = androidx.compose.ui.res.painterResource(R.drawable.vendamais_logo_principal),
                contentDescription = "Venda+",
                modifier = Modifier.size(104.dp),
            )
            Spacer(modifier = Modifier.height(VendaSpacing.x3))
            Text(
                text = "Sistema de Gestão ERP",
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF94A3B8),
            )
            Spacer(modifier = Modifier.height(VendaSpacing.x8))

            Surface(
                modifier = Modifier.fillMaxWidth().widthIn(max = 448.dp),
                shape = RoundedCornerShape(16.dp),
                color = Color(0xE610192A),
                shadowElevation = 24.dp,
                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.10f)),
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 32.dp, vertical = 30.dp),
                    verticalArrangement = Arrangement.spacedBy(VendaSpacing.x4),
                ) {
                    Text(
                        text = "Entrar",
                        style = MaterialTheme.typography.headlineSmall,
                        color = Color(0xFFF1F5F9),
                        fontWeight = FontWeight.Bold,
                    )

                    Column(verticalArrangement = Arrangement.spacedBy(VendaSpacing.x1)) {
                        Text("Email *", style = MaterialTheme.typography.labelMedium, color = Color(0xFF94A3B8), fontWeight = FontWeight.SemiBold)
                        OutlinedTextField(
                            value = state.email,
                            onValueChange = onEmailChange,
                            modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                            placeholder = { Text("seu@email.com") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                            singleLine = true,
                            shape = RoundedCornerShape(8.dp),
                            colors = fieldColors,
                        )
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(VendaSpacing.x1)) {
                        Text("Senha *", style = MaterialTheme.typography.labelMedium, color = Color(0xFF94A3B8), fontWeight = FontWeight.SemiBold)
                        OutlinedTextField(
                            value = state.password,
                            onValueChange = onPasswordChange,
                            modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                            placeholder = { Text("Sua senha") },
                            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                            trailingIcon = {
                                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                    Icon(
                                        imageVector = if (passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                        contentDescription = if (passwordVisible) "Ocultar senha" else "Mostrar senha",
                                        tint = Color(0xFFCBD5E1),
                                    )
                                }
                            },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { if (!state.loading) onLogin() }),
                            singleLine = true,
                            shape = RoundedCornerShape(8.dp),
                            colors = fieldColors,
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(
                            checked = rememberConnected,
                            onCheckedChange = if (state.loading) null else onRememberConnectedChange,
                            colors = CheckboxDefaults.colors(
                                checkedColor = Color(0xFF10B981),
                                uncheckedColor = Color(0xFF94A3B8),
                                checkmarkColor = Color(0xFF07111F),
                            ),
                        )
                        Text(
                            text = "Manter conectado neste dispositivo",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFFCBD5E1),
                        )
                    }

                    state.errorMessage?.let { message ->
                        VendaInlineFeedback(
                            title = "Não foi possível entrar",
                            message = message,
                            tone = VendaFeedbackTone.ERROR,
                        )
                    }

                    if (state.configurationMissing) {
                        VendaInlineFeedback(
                            title = "Configuração do aplicativo incompleta",
                            message = "Contate o suporte responsável pelo Venda+ para liberar o acesso.",
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

            Spacer(modifier = Modifier.height(VendaSpacing.x2))
            TextButton(onClick = { uriHandler.openUri(AppConfig.privacyPolicyUrl) }) {
                Text("Política de Privacidade", color = Color(0xFFCBD5E1))
            }
            Spacer(modifier = Modifier.height(VendaSpacing.x1))
            Text(
                text = "Acesso restrito a usuários autorizados",
                style = MaterialTheme.typography.labelSmall,
                color = Color(0xFF8492A6),
            )
        }
    }
}
