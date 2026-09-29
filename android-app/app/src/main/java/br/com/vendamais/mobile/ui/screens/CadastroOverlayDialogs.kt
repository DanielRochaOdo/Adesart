package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.domain.cadastro.CadastroOverlayIntent
import br.com.vendamais.mobile.ui.AppUiState
import br.com.vendamais.mobile.ui.AppViewModel
import br.com.vendamais.mobile.ui.components.VendaFeedbackTone
import br.com.vendamais.mobile.ui.components.VendaInlineFeedback
import br.com.vendamais.mobile.ui.components.bringIntoViewOnFocus

@Composable
fun CadastroOverlayDialogs(
    state: AppUiState,
    viewModel: AppViewModel,
) {
    when (val overlay = state.cadastroOverlay) {
        is CadastroOverlayIntent.ObservacoesEmpresa -> {
            AlertDialog(
                onDismissRequest = viewModel::dismissCadastroOverlay,
                title = { Text("Observacoes da empresa") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Empresa: ${overlay.empresaNome}")
                        Text(overlay.observacoes)
                    }
                },
                confirmButton = {
                    TextButton(onClick = viewModel::dismissCadastroOverlay) {
                        Text("Entendi")
                    }
                },
            )
        }

        is CadastroOverlayIntent.EmpresaCancelada -> {
            AlertDialog(
                onDismissRequest = viewModel::dismissCadastroOverlay,
                title = { Text("Empresa bloqueada") },
                text = {
                    VendaInlineFeedback(
                        title = "Cadastro indisponivel para esta empresa",
                        message = "A empresa ${overlay.empresaNome} esta com situacao bloqueada para novos cadastros.",
                        tone = VendaFeedbackTone.WARNING,
                    )
                },
                confirmButton = {
                    TextButton(onClick = viewModel::dismissCadastroOverlay) {
                        Text("Buscar outra")
                    }
                },
            )
        }

        is CadastroOverlayIntent.EmpresaNaoIdentificada -> {
            AlertDialog(
                onDismissRequest = viewModel::dismissCadastroOverlay,
                title = { Text("Empresa nao identificada") },
                text = {
                    Text(
                        if (overlay.required) {
                            "Para continuar inclusao de dependente, selecione uma empresa valida."
                        } else {
                            "A empresa nao foi identificada. Revise os dados antes de continuar."
                        },
                    )
                },
                confirmButton = {
                    TextButton(onClick = viewModel::dismissCadastroOverlay) {
                        Text("Entendi")
                    }
                },
            )
        }

        is CadastroOverlayIntent.LemmitLimit -> {
            AlertDialog(
                onDismissRequest = viewModel::dismissCadastroOverlay,
                title = { Text("Limite Lemmit") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("O limite de consultas Lemmit foi atingido para este usuario.")
                        overlay.limiteFormatado?.let { Text("Limite: $it") }
                        overlay.consumoFormatado?.let { Text("Consumo: $it") }
                        overlay.saldoFormatado?.let { Text("Saldo: $it") }
                    }
                },
                confirmButton = {
                    TextButton(onClick = viewModel::dismissCadastroOverlay) {
                        Text("Continuar sem Lemmit")
                    }
                },
            )
        }

        is CadastroOverlayIntent.LemmitError -> {
            AlertDialog(
                onDismissRequest = viewModel::dismissCadastroOverlay,
                title = { Text("Consulta indisponivel") },
                text = {
                    VendaInlineFeedback(
                        title = "Nao foi possivel preencher os dados automaticamente",
                        message = "Voce pode continuar o cadastro e preencher as informacoes manualmente.",
                        tone = VendaFeedbackTone.WARNING,
                    )
                },
                confirmButton = {
                    TextButton(onClick = viewModel::dismissCadastroOverlay) {
                        Text("Continuar")
                    }
                },
            )
        }

        is CadastroOverlayIntent.ParceiroInvalido -> {
            var vendedorCodigo by remember { mutableStateOf("") }
            var vendedorNome by remember { mutableStateOf("") }
            AlertDialog(
                onDismissRequest = viewModel::dismissCadastroOverlay,
                title = { Text("Parceiro invalido") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(overlay.message)
                        Text("Informe um vendedor valido para tentar novamente.")
                        OutlinedTextField(
                            value = vendedorCodigo,
                            onValueChange = { vendedorCodigo = it.filter(Char::isDigit) },
                            modifier = androidx.compose.ui.Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                            label = { Text("Codigo vendedor") },
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = vendedorNome,
                            onValueChange = { vendedorNome = it },
                            modifier = androidx.compose.ui.Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                            label = { Text("Nome vendedor") },
                            singleLine = true,
                        )
                    }
                },
                dismissButton = {
                    TextButton(onClick = viewModel::dismissCadastroOverlay) {
                        Text("Cancelar")
                    }
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            viewModel.retrySendSelectedCadastroWithVendedor(
                                vendedorCodigo = vendedorCodigo,
                                vendedorNome = vendedorNome,
                            )
                        },
                    ) {
                        Text("Reenviar")
                    }
                },
            )
        }

        is CadastroOverlayIntent.DependenteAtivo -> {
            AlertDialog(
                onDismissRequest = viewModel::dismissCadastroOverlay,
                title = { Text("Dependente ativo") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Existem dependentes ativos no contrato.")
                        if (overlay.details.isNotEmpty()) {
                            overlay.details.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = viewModel::dismissCadastroOverlay) {
                        Text("Fechar")
                    }
                },
            )
        }

        is CadastroOverlayIntent.ExcluirCadastro -> {
            var motivo by remember { mutableStateOf("") }
            AlertDialog(
                onDismissRequest = viewModel::dismissCadastroOverlay,
                title = { Text("Excluir cadastro") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Titular: ${overlay.titularNome}")
                        OutlinedTextField(
                            value = motivo,
                            onValueChange = { motivo = it },
                            modifier = androidx.compose.ui.Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                            label = { Text("Motivo exclusao") },
                        )
                    }
                },
                dismissButton = {
                    TextButton(onClick = viewModel::dismissCadastroOverlay) {
                        Text("Cancelar")
                    }
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            viewModel.deleteCadastroByOverlay(
                                cadastroId = overlay.cadastroId,
                                motivoExclusao = motivo.ifBlank { "Exclusao via app mobile" },
                            )
                        },
                    ) {
                        Text("Excluir")
                    }
                },
            )
        }

        is CadastroOverlayIntent.AlreadyExists -> {
            AlertDialog(
                onDismissRequest = viewModel::dismissCadastroOverlay,
                title = { Text("Cadastro ja existe") },
                text = { Text("CPF ${overlay.cpf}. ${overlay.summary}") },
                confirmButton = {
                    TextButton(onClick = viewModel::dismissCadastroOverlay) {
                        Text("Fechar")
                    }
                },
            )
        }

        is CadastroOverlayIntent.LinkQr -> {
            AlertDialog(
                onDismissRequest = viewModel::dismissCadastroOverlay,
                title = { Text("Link QR") },
                text = { Text(overlay.linkUrl) },
                confirmButton = {
                    TextButton(onClick = viewModel::dismissCadastroOverlay) {
                        Text("Fechar")
                    }
                },
            )
        }

        is CadastroOverlayIntent.LinkAssociados -> {
            AlertDialog(
                onDismissRequest = viewModel::dismissCadastroOverlay,
                title = { Text("Associados do link") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (overlay.associados.isEmpty()) {
                            Text("Nenhum associado.")
                        } else {
                            overlay.associados.forEach { Text(it) }
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = viewModel::dismissCadastroOverlay) {
                        Text("Fechar")
                    }
                },
            )
        }

        is CadastroOverlayIntent.VisualizarArquivo -> {
            AlertDialog(
                onDismissRequest = viewModel::dismissCadastroOverlay,
                title = { Text("Documento selecionado") },
                text = { Text("O documento esta pronto para visualizacao no fluxo atual.") },
                confirmButton = {
                    TextButton(onClick = viewModel::dismissCadastroOverlay) {
                        Text("Fechar")
                    }
                },
            )
        }

        CadastroOverlayIntent.SelectStatus -> {
            AlertDialog(
                onDismissRequest = viewModel::dismissCadastroOverlay,
                title = { Text("Status obrigatorio") },
                text = { Text("Selecione um status de adesao antes de fechar o fluxo.") },
                confirmButton = {
                    TextButton(onClick = viewModel::dismissCadastroOverlay) {
                        Text("OK")
                    }
                },
            )
        }

        is CadastroOverlayIntent.EntryPoint,
        null,
        -> Unit
    }
}
