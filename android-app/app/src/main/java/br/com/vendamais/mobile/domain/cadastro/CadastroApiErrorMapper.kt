package br.com.vendamais.mobile.domain.cadastro

import java.text.Normalizer

object CadastroApiErrorMapper {
    private val parceiroRegex = Regex("\\bparceiro\\b.*\\binvalido\\b", RegexOption.IGNORE_CASE)
    private const val pendingCadastroConstraintName = "cadastros_cadastro_incompleto_cpf_unique_idx"
    private const val pendingCadastroCanonicalMessage =
        "ja existe um cadastro pendente para este cpf. abra o pendente e continue por ele."
    private const val erpTechnicalFailureMessage =
        "Nao foi possivel concluir esta operacao no momento. Verifique se o cadastro ja foi atualizado antes de tentar novamente. Se o problema continuar, entre em contato com o suporte."

    fun mapErpError(message: String?): CadastroErpError? {
        val normalized = normalize(message)
        if (normalized.isBlank()) return null

        if (parceiroRegex.containsMatchIn(normalized)) {
            return CadastroErpError.ParceiroInvalido(message.orEmpty().ifBlank { "Parceiro invalido." })
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
            normalized.contains("the select list for the insert statement contains more items than the insert list") ||
            normalized.contains("the number of select values must match the number of insert columns") ||
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
