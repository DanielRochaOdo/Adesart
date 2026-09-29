package br.com.vendamais.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import br.com.vendamais.mobile.data.models.EmpresaResumo
import br.com.vendamais.mobile.data.models.EmpresaSearchType
import br.com.vendamais.mobile.data.models.MobileProfile
import br.com.vendamais.mobile.data.models.TeamMemberOption
import br.com.vendamais.mobile.ui.CadastroWorkspaceState
import br.com.vendamais.mobile.ui.components.WebCard
import br.com.vendamais.mobile.ui.components.VendaButton
import br.com.vendamais.mobile.ui.components.VendaButtonSize
import br.com.vendamais.mobile.ui.components.VendaLoadingState
import br.com.vendamais.mobile.ui.components.bringIntoViewOnFocus
import br.com.vendamais.mobile.ui.theme.Emerald
import br.com.vendamais.mobile.ui.theme.EmeraldDark
import br.com.vendamais.mobile.ui.theme.EmeraldSoft
import kotlinx.coroutines.delay

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun CadastroOperationsCard(
    profile: MobileProfile?,
    workspace: CadastroWorkspaceState,
    vendedores: List<TeamMemberOption>,
    adesionistas: List<TeamMemberOption>,
    onSearchTypeChange: (EmpresaSearchType) -> Unit,
    onSearchValueChange: (String) -> Unit,
    onSearchEmpresa: () -> Unit,
    onSelectEmpresa: (EmpresaResumo) -> Unit,
    onClearEmpresa: () -> Unit,
    onCpfChange: (String) -> Unit,
    onSelectedVendedorChange: (String) -> Unit,
    onSelectedAdesionistaChange: (String) -> Unit,
    onConsultarCpf: () -> Unit,
) {
    val canChooseVendedor = profile?.role in setOf(
        "ADMINISTRADOR",
        "ADMIN",
        "GERENTE",
        "GESTOR",
        "SUPERVISOR",
        "CADASTRO",
        "ADESIONISTA",
    )
    val isVendedorProfile = profile?.role == "VENDEDOR"
    val canChooseAdesionista = profile?.role in setOf(
        "ADMINISTRADOR",
        "GERENTE",
        "GESTOR",
        "SUPERVISOR",
        "VENDEDOR",
        "CADASTRO",
    )

    var cpfFieldValue by remember { mutableStateOf(TextFieldValue("")) }
    var showSlowCpfLookup by remember { mutableStateOf(false) }
    val firstSearchResultBringIntoViewRequester = remember(workspace.empresaSearchResults) {
        BringIntoViewRequester()
    }
    val cpfDigitsFromState = workspace.cpfValue.filter(Char::isDigit).take(11)

    LaunchedEffect(cpfDigitsFromState) {
        if (cpfDigitsFromState != cpfFieldValue.text) {
            cpfFieldValue = TextFieldValue(
                text = cpfDigitsFromState,
                selection = TextRange(cpfDigitsFromState.length),
            )
        }
    }

    LaunchedEffect(workspace.operationLoading, workspace.selectedEmpresa?.id) {
        showSlowCpfLookup = false
        if (workspace.operationLoading && workspace.selectedEmpresa != null) {
            delay(3500)
            if (workspace.operationLoading) showSlowCpfLookup = true
        }
    }

    WebCard {
        Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "Nova adesao",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Selecione a empresa e consulte o CPF para iniciar.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            OperationStepHeader(
                number = "1",
                title = "Empresa",
                completed = workspace.selectedEmpresa != null,
            )

            if (workspace.selectedEmpresa == null) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SearchTypeRow(
                        selected = workspace.empresaSearchType,
                        onSelected = onSearchTypeChange,
                    )

                    OutlinedTextField(
                        value = workspace.empresaSearchValue,
                        onValueChange = onSearchValueChange,
                        modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                        label = {
                            Text(
                                when (workspace.empresaSearchType) {
                                    EmpresaSearchType.CODIGO -> "Codigo da empresa"
                                    EmpresaSearchType.CNPJ -> "CNPJ"
                                    EmpresaSearchType.NOME -> "Nome da empresa"
                                },
                            )
                        },
                        placeholder = {
                            Text(
                                when (workspace.empresaSearchType) {
                                    EmpresaSearchType.CODIGO -> "Digite o codigo"
                                    EmpresaSearchType.CNPJ -> "00.000.000/0000-00"
                                    EmpresaSearchType.NOME -> "Digite o nome da empresa"
                                },
                            )
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = when (workspace.empresaSearchType) {
                                EmpresaSearchType.CODIGO -> KeyboardType.Number
                                EmpresaSearchType.CNPJ -> KeyboardType.Number
                                EmpresaSearchType.NOME -> KeyboardType.Text
                            },
                            imeAction = ImeAction.Search,
                        ),
                        keyboardActions = KeyboardActions(
                            onSearch = { onSearchEmpresa() },
                            onDone = { onSearchEmpresa() },
                        ),
                        singleLine = true,
                        shape = MaterialTheme.shapes.small,
                    )

                    VendaButton(
                        label = "Buscar empresa",
                        onClick = onSearchEmpresa,
                        modifier = Modifier.fillMaxWidth(),
                        size = VendaButtonSize.MEDIUM,
                        enabled = !workspace.operationLoading && workspace.empresaSearchValue.isNotBlank(),
                        loading = workspace.operationLoading,
                        leadingIcon = Icons.Rounded.Search,
                    )

                    if (workspace.empresaSearchResults.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = "Resultados",
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = FontWeight.SemiBold,
                            )
                            workspace.empresaSearchResults.forEachIndexed { index, empresa ->
                                Surface(
                                    onClick = { onSelectEmpresa(empresa) },
                                    shape = MaterialTheme.shapes.small,
                                    color = MaterialTheme.colorScheme.surface,
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                                    modifier = if (index == 0) {
                                        Modifier
                                            .fillMaxWidth()
                                            .bringIntoViewRequester(firstSearchResultBringIntoViewRequester)
                                    } else {
                                        Modifier.fillMaxWidth()
                                    },
                                ) {
                                    Column(
                                        modifier = Modifier.padding(14.dp),
                                        verticalArrangement = Arrangement.spacedBy(4.dp),
                                    ) {
                                        Text(
                                            text = empresa.nomeFantasia.ifBlank { empresa.razaoSocial.ifBlank { "Empresa sem nome" } },
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                        if (empresa.razaoSocial.isNotBlank()) {
                                            Text(
                                                text = empresa.razaoSocial,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                style = MaterialTheme.typography.bodySmall,
                                            )
                                        }
                                        Text(
                                            text = buildString {
                                                append("Codigo ${empresa.id}")
                                                if (empresa.cnpj.isNotBlank()) append(" · ${empresa.cnpj}")
                                            },
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                }
                            }
                            LaunchedEffect(workspace.empresaSearchResults.firstOrNull()?.id) {
                                firstSearchResultBringIntoViewRequester.bringIntoView()
                            }
                        }
                    }
                }
            } else {
                SelectedEmpresaCard(
                    empresa = workspace.selectedEmpresa,
                    onClearEmpresa = onClearEmpresa,
                )
            }

            if (workspace.selectedEmpresa != null) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

                OperationStepHeader(
                    number = "2",
                    title = "Responsaveis e CPF",
                    completed = false,
                )

                if (canChooseVendedor) {
                    SelectionField(
                        label = "Vendedor",
                        value = vendedores
                            .firstOrNull { it.id == workspace.selectedVendedorId }
                            ?.toSelectionLabel()
                            ?: "Selecione um vendedor",
                        options = vendedores.map { it.id to it.toSelectionLabel() },
                        onSelected = onSelectedVendedorChange,
                    )
                    if (vendedores.isEmpty()) {
                        Text(
                            text = "Nenhum vendedor disponivel. Entre em contato com o administrador.",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                } else if (isVendedorProfile) {
                    OutlinedTextField(
                        value = buildString {
                            append(profile?.name.orEmpty())
                            append(" · Codigo ")
                            append(profile?.externalId?.takeIf { it.isNotBlank() } ?: "-")
                        },
                        onValueChange = {},
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Vendedor") },
                        enabled = false,
                        shape = MaterialTheme.shapes.small,
                    )
                }

                if (canChooseAdesionista) {
                    SelectionField(
                        label = "Adesionista",
                        value = adesionistas
                            .firstOrNull { it.id == workspace.selectedAdesionistaId }
                            ?.toSelectionLabel()
                            ?: "Selecione um adesionista",
                        options = listOf("" to "Nenhum adesionista") + adesionistas.map { it.id to it.toSelectionLabel() },
                        onSelected = onSelectedAdesionistaChange,
                    )
                }

                OutlinedTextField(
                    value = cpfFieldValue,
                    onValueChange = { value ->
                        val digits = value.text.filter(Char::isDigit).take(11)
                        cpfFieldValue = TextFieldValue(
                            text = digits,
                            selection = TextRange(digits.length),
                        )
                        onCpfChange(digits)
                    },
                    modifier = Modifier.fillMaxWidth().bringIntoViewOnFocus(),
                    label = { Text("CPF do associado") },
                    placeholder = { Text("000.000.000-00") },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Number,
                        imeAction = ImeAction.Search,
                    ),
                    keyboardActions = KeyboardActions(
                        onSearch = { onConsultarCpf() },
                        onDone = { onConsultarCpf() },
                    ),
                    visualTransformation = CpfVisualTransformation(),
                    singleLine = true,
                    shape = MaterialTheme.shapes.small,
                )

                VendaButton(
                    label = "Consultar CPF",
                    onClick = onConsultarCpf,
                    modifier = Modifier.fillMaxWidth(),
                    size = VendaButtonSize.LARGE,
                    enabled = !workspace.operationLoading && workspace.cpfValue.isNotBlank(),
                    loading = workspace.operationLoading,
                    leadingIcon = Icons.Rounded.Search,
                )

                if (workspace.operationLoading) {
                    VendaLoadingState(
                        title = "Buscando dados da pessoa",
                        message = "Estamos verificando as informacoes para adiantar seu cadastro.",
                        slowMessage = if (showSlowCpfLookup) {
                            "Esta demorando um pouco mais que o normal. Voce pode aguardar sem repetir a consulta."
                        } else {
                            null
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun OperationStepHeader(
    number: String,
    title: String,
    completed: Boolean,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            modifier = Modifier.size(30.dp),
            shape = MaterialTheme.shapes.small,
            color = if (completed) EmeraldSoft else MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Box(contentAlignment = Alignment.Center) {
                if (completed) {
                    Icon(
                        imageVector = Icons.Rounded.CheckCircle,
                        contentDescription = null,
                        tint = EmeraldDark,
                        modifier = Modifier.size(18.dp),
                    )
                } else {
                    Text(
                        text = number,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun SelectedEmpresaCard(
    empresa: EmpresaResumo,
    onClearEmpresa: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        color = EmeraldSoft.copy(alpha = 0.72f),
        border = BorderStroke(1.dp, Emerald.copy(alpha = 0.20f)),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Text(
                        text = "Empresa selecionada",
                        style = MaterialTheme.typography.labelMedium,
                        color = EmeraldDark,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = empresa.nomeFantasia.ifBlank { empresa.razaoSocial.ifBlank { "Empresa sem nome" } },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (empresa.razaoSocial.isNotBlank()) {
                        Text(
                            text = empresa.razaoSocial,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    Text(
                        text = buildString {
                            append("Codigo ${empresa.id}")
                            if (empresa.cnpj.isNotBlank()) append(" · ${empresa.cnpj}")
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                OutlinedButton(
                    onClick = onClearEmpresa,
                    shape = MaterialTheme.shapes.small,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Edit,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Text("Alterar", modifier = Modifier.padding(start = 6.dp))
                }
            }

            empresa.observacoesResolvidas
                ?.takeIf { it.isNotBlank() }
                ?.let { observacao ->
                    Text(
                        text = observacao,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
        }
    }
}

@Composable
private fun SearchTypeRow(
    selected: EmpresaSearchType,
    onSelected: (EmpresaSearchType) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SearchTypePill(
            modifier = Modifier.weight(1f),
            label = "Codigo",
            selected = selected == EmpresaSearchType.CODIGO,
            onClick = { onSelected(EmpresaSearchType.CODIGO) },
        )
        SearchTypePill(
            modifier = Modifier.weight(1f),
            label = "CNPJ",
            selected = selected == EmpresaSearchType.CNPJ,
            onClick = { onSelected(EmpresaSearchType.CNPJ) },
        )
        SearchTypePill(
            modifier = Modifier.weight(1f),
            label = "Nome",
            selected = selected == EmpresaSearchType.NOME,
            onClick = { onSelected(EmpresaSearchType.NOME) },
        )
    }
}

@Composable
private fun SearchTypePill(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = if (selected) EmeraldSoft else MaterialTheme.colorScheme.surface,
        border = BorderStroke(
            1.dp,
            if (selected) Emerald.copy(alpha = 0.28f) else MaterialTheme.colorScheme.outline,
        ),
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            color = if (selected) EmeraldDark else MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
        )
    }
}

private fun TeamMemberOption.toSelectionLabel(): String {
    val codigo = externalId?.takeIf { it.isNotBlank() } ?: "-"
    return "$name · Codigo $codigo"
}

private class CpfVisualTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val digits = text.text.filter(Char::isDigit).take(11)
        val originalToTransformed = IntArray(digits.length + 1)
        val formatted = buildString {
            originalToTransformed[0] = 0
            digits.forEachIndexed { index, char ->
                append(char)
                if (index == 2 && digits.length > 3) append('.')
                if (index == 5 && digits.length > 6) append('.')
                if (index == 8 && digits.length > 9) append('-')
                originalToTransformed[index + 1] = length
            }
        }
        val transformedToOriginal = IntArray(formatted.length + 1) { offset ->
            formatted.take(offset).count(Char::isDigit).coerceAtMost(digits.length)
        }

        val offsetMapping = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int {
                return originalToTransformed[offset.coerceIn(0, digits.length)]
            }

            override fun transformedToOriginal(offset: Int): Int {
                return transformedToOriginal[offset.coerceIn(0, formatted.length)]
            }
        }

        return TransformedText(AnnotatedString(formatted), offsetMapping)
    }
}
