package br.com.vendamais.mobile.domain.cadastro

import java.util.Locale

private val pendingCadastroStatuses = setOf(
    "incompleto",
)

fun isPendingCadastroStatus(status: String?): Boolean {
    val normalized = status?.trim()?.lowercase(Locale.ROOT).orEmpty()
    return normalized in pendingCadastroStatuses
}

fun pendingCadastroStatusQueryValue(): String {
    return "in.(${pendingCadastroStatuses.joinToString(",")})"
}
