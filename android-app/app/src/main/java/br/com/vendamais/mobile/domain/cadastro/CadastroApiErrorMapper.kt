package br.com.vendamais.mobile.domain.cadastro

import java.text.Normalizer

object CadastroApiErrorMapper {
    private val parceiroRegex = Regex("\\bparceiro\\b.*\\binvalido\\b", RegexOption.IGNORE_CASE)
    private val dependenteAtivoRegex = Regex(
        "cadastrado\\s+e\\s+ativo\\s+no\\s+contrato|dependente(?:\\(s\\))?\\s+ja\\s+cadastrado(?:\\(s\\))?",
        RegexOption.IGNORE_CASE,
    )
    private const val pendingCadastroConstraintName = "cadastros_cadastro_incompleto_cpf_unique_idx"
    private const val pendingCadastroCanonicalMessage =
        "ja existe um cadastro pendente para este cpf. abra o pendente e continue por ele."
    private const val erpTechnicalFailureMessage =
        "O ERP retornou uma falha tecnica ao finalizar o cadastro. Verifique se o cadastro ja foi criado no ERP antes de reenviar."

    fun mapErpError(message: String?): CadastroErpError? {
        val normalized = normalize(message)
        if (normalized.isBlank()) return null

        if (parceiroRegex.containsMatchIn(normalized)) {
            return CadastroErpError.ParceiroInvalido(message.orEmpty().ifBlank { "Parceiro invalido." })
        }

        if (dependenteAtivoRegex.containsMatchIn(normalized)) {
            return CadastroErpError.DependenteAtivo(
                details = listOf(message.orEmpty().ifBlank { "Dependente ativo no contrato." }),
            )
        }

        return null
    }

    fun mapUserMessage(message: String?, fallback: String): String {
        val raw = message.orEmpty()
            .replace(Regex("\\s+"), " ")
            .trim()
        if (raw.isBlank()) return fallback

        val normalized = normalize(raw).lowercase()
        return when {
            normalized.contains("error in workflow") ->
                LemmitAgePolicy.UNDERAGE_NOTICE
            isPendingCadastroConstraintViolation(raw) ->
                "Ja existe um cadastro pendente para este CPF. Abra o pendente e continue por ele."
            isErpTechnicalFailure(raw) -> erpTechnicalFailureMessage
            else -> raw
        }
    }

    fun isPendingCadastroConstraintViolation(message: String?): Boolean {
        val normalized = normalize(message).lowercase()
        if (normalized.isBlank()) return false

        return normalized.contains(pendingCadastroConstraintName) ||
            normalized == pendingCadastroCanonicalMessage
    }

    private fun isErpTechnicalFailure(message: String?): Boolean {
        val normalized = normalize(message).lowercase()
        if (normalized.isBlank()) return false

        return normalized.contains("incorrect syntax near") ||
            (
                normalized.contains("\"codigo\":504") &&
                    normalized.contains("\"dados\":null")
                )
    }

    private fun normalize(value: String?): String {
        val raw = value.orEmpty().trim()
        if (raw.isBlank()) return ""
        return Normalizer.normalize(raw, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
    }
}
