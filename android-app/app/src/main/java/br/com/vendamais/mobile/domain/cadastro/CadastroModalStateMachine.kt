package br.com.vendamais.mobile.domain.cadastro

enum class CadastroEntryPoint {
    CADASTRO_MODAL,
    INCLUSAO_DEPENDENTE_MODAL,
    CONTINUAR_INCLUSAO_DEPENDENTE_MODAL,
}

sealed interface CadastroOverlayIntent {
    data class EntryPoint(val entryPoint: CadastroEntryPoint) : CadastroOverlayIntent

    data class EmpresaNaoIdentificada(
        val required: Boolean,
    ) : CadastroOverlayIntent

    data class ObservacoesEmpresa(
        val empresaNome: String,
        val observacoes: String,
    ) : CadastroOverlayIntent

    data class EmpresaCancelada(
        val empresaNome: String,
    ) : CadastroOverlayIntent

    data class LemmitLimit(
        val limiteFormatado: String? = null,
        val consumoFormatado: String? = null,
        val saldoFormatado: String? = null,
        val isUnlimited: Boolean = false,
    ) : CadastroOverlayIntent

    data class LemmitError(
        val message: String,
    ) : CadastroOverlayIntent

    data object SelectStatus : CadastroOverlayIntent

    data class ParceiroInvalido(
        val message: String,
    ) : CadastroOverlayIntent

    data class DependenteAtivo(
        val details: List<String> = emptyList(),
    ) : CadastroOverlayIntent

    data class ExcluirCadastro(
        val cadastroId: String,
        val titularNome: String,
    ) : CadastroOverlayIntent

    data class AlreadyExists(
        val cpf: String,
        val summary: String,
    ) : CadastroOverlayIntent

    data class LinkQr(
        val linkId: String,
        val linkUrl: String,
    ) : CadastroOverlayIntent

    data class LinkAssociados(
        val linkId: String,
        val associados: List<String>,
    ) : CadastroOverlayIntent

    data class VisualizarArquivo(
        val arquivoPath: String,
    ) : CadastroOverlayIntent
}

sealed interface CadastroErpError {
    data class ParceiroInvalido(val message: String) : CadastroErpError
    data class DependenteAtivo(val details: List<String>) : CadastroErpError
}

data class CadastroModalSignal(
    val entryPoint: CadastroEntryPoint? = null,
    val empresaNaoIdentificada: Boolean = false,
    val empresaNaoIdentificadaRequired: Boolean = false,
    val empresaObservacaoNome: String? = null,
    val empresaObservacaoTexto: String? = null,
    val empresaCanceladaNome: String? = null,
    val lemmitLimit: CadastroOverlayIntent.LemmitLimit? = null,
    val lemmitErrorMessage: String? = null,
    val mustSelectStatus: Boolean = false,
    val erpError: CadastroErpError? = null,
    val excluirCadastroId: String? = null,
    val excluirCadastroTitular: String? = null,
    val alreadyExistsCpf: String? = null,
    val alreadyExistsSummary: String? = null,
    val linkQrId: String? = null,
    val linkQrUrl: String? = null,
    val linkAssociadosId: String? = null,
    val linkAssociados: List<String> = emptyList(),
    val visualizarArquivoPath: String? = null,
)

object CadastroModalStateMachine {
    fun resolve(signal: CadastroModalSignal): CadastroOverlayIntent? {
        signal.entryPoint?.let { return CadastroOverlayIntent.EntryPoint(it) }

        if (signal.empresaNaoIdentificada) {
            return CadastroOverlayIntent.EmpresaNaoIdentificada(
                required = signal.empresaNaoIdentificadaRequired,
            )
        }

        val observacaoTexto = signal.empresaObservacaoTexto?.trim().orEmpty()
        val observacaoNome = signal.empresaObservacaoNome?.trim().orEmpty()
        if (observacaoTexto.isNotBlank() && observacaoNome.isNotBlank()) {
            return CadastroOverlayIntent.ObservacoesEmpresa(
                empresaNome = observacaoNome,
                observacoes = observacaoTexto,
            )
        }

        val empresaCanceladaNome = signal.empresaCanceladaNome?.trim().orEmpty()
        if (empresaCanceladaNome.isNotBlank()) {
            return CadastroOverlayIntent.EmpresaCancelada(empresaCanceladaNome)
        }

        signal.lemmitLimit?.let { return it }

        val lemmitErrorMessage = signal.lemmitErrorMessage?.trim().orEmpty()
        if (lemmitErrorMessage.isNotBlank()) {
            return CadastroOverlayIntent.LemmitError(lemmitErrorMessage)
        }

        if (signal.mustSelectStatus) {
            return CadastroOverlayIntent.SelectStatus
        }

        when (val error = signal.erpError) {
            is CadastroErpError.ParceiroInvalido -> {
                return CadastroOverlayIntent.ParceiroInvalido(error.message)
            }

            is CadastroErpError.DependenteAtivo -> {
                return CadastroOverlayIntent.DependenteAtivo(error.details)
            }

            null -> Unit
        }

        val cadastroId = signal.excluirCadastroId?.trim().orEmpty()
        val cadastroTitular = signal.excluirCadastroTitular?.trim().orEmpty()
        if (cadastroId.isNotBlank() && cadastroTitular.isNotBlank()) {
            return CadastroOverlayIntent.ExcluirCadastro(
                cadastroId = cadastroId,
                titularNome = cadastroTitular,
            )
        }

        val existsCpf = signal.alreadyExistsCpf?.trim().orEmpty()
        val existsSummary = signal.alreadyExistsSummary?.trim().orEmpty()
        if (existsCpf.isNotBlank() && existsSummary.isNotBlank()) {
            return CadastroOverlayIntent.AlreadyExists(
                cpf = existsCpf,
                summary = existsSummary,
            )
        }

        val linkQrId = signal.linkQrId?.trim().orEmpty()
        val linkQrUrl = signal.linkQrUrl?.trim().orEmpty()
        if (linkQrId.isNotBlank() && linkQrUrl.isNotBlank()) {
            return CadastroOverlayIntent.LinkQr(
                linkId = linkQrId,
                linkUrl = linkQrUrl,
            )
        }

        val associadosId = signal.linkAssociadosId?.trim().orEmpty()
        if (associadosId.isNotBlank() && signal.linkAssociados.isNotEmpty()) {
            return CadastroOverlayIntent.LinkAssociados(
                linkId = associadosId,
                associados = signal.linkAssociados,
            )
        }

        val arquivoPath = signal.visualizarArquivoPath?.trim().orEmpty()
        if (arquivoPath.isNotBlank()) {
            return CadastroOverlayIntent.VisualizarArquivo(arquivoPath)
        }

        return null
    }
}
