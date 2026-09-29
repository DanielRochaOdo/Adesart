package br.com.vendamais.mobile.domain.cadastro

import br.com.vendamais.mobile.data.models.LemmitResponse

object LemmitAgePolicy {
    const val UNDERAGE_NOTICE =
        "Aviso: CPF identificado como menor de idade. Por esse motivo, os dados não serão retornados pela Lemit. Preencha as informações manualmente e siga normalmente com o cadastro."

    fun shouldShowUnderageNotice(response: LemmitResponse?): Boolean {
        val pessoa = response?.pessoa ?: return false
        val dataNascimentoRaw = pessoa.dataNascimento
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: pessoa.dataNascimentoAlternativa
                ?.trim()
                ?.takeIf { it.isNotBlank() }
        val dataNascimentoDigits = resolveLemmitDateDigits(dataNascimentoRaw)
        return dataNascimentoDigits != null && isUnder18(dataNascimentoDigits)
    }

    private fun resolveLemmitDateDigits(rawValue: String?): String? {
        val raw = rawValue?.trim().orEmpty()
        if (raw.isBlank()) return null

        val yyyyMmDd = Regex("""^\d{4}-\d{2}-\d{2}$""")
        if (yyyyMmDd.matches(raw)) return raw

        val digits = raw.filter(Char::isDigit)
        return when (digits.length) {
            8 -> {
                val day = digits.substring(0, 2).toIntOrNull() ?: return null
                val month = digits.substring(2, 4).toIntOrNull() ?: return null
                val year = digits.substring(4, 8).toIntOrNull() ?: return null
                if (day !in 1..31 || month !in 1..12 || year !in 1900..2100) return null
                "%04d-%02d-%02d".format(year, month, day)
            }
            10 -> if (raw.count { it == '-' } == 2) raw else null
            else -> null
        }
    }

    private fun isUnder18(isoDate: String): Boolean {
        return runCatching {
            val parsed = java.time.LocalDate.parse(isoDate)
            val today = java.time.LocalDate.now()
            java.time.Period.between(parsed, today).years < 18
        }.getOrDefault(false)
    }
}
