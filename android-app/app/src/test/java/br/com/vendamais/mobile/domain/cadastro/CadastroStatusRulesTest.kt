package br.com.vendamais.mobile.domain.cadastro

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CadastroStatusRulesTest {

    @Test
    fun `isPendingCadastroStatus should accept only incompleto as pending status`() {
        assertThat(isPendingCadastroStatus("incompleto")).isTrue()
    }

    @Test
    fun `isPendingCadastroStatus should normalize casing and spaces`() {
        assertThat(isPendingCadastroStatus("  INCOMPLETO  ")).isTrue()
    }

    @Test
    fun `isPendingCadastroStatus should reject non pending statuses`() {
        assertThat(isPendingCadastroStatus("enviado")).isFalse()
        assertThat(isPendingCadastroStatus("cancelado")).isFalse()
        assertThat(isPendingCadastroStatus("erro_envio")).isFalse()
        assertThat(isPendingCadastroStatus("pendente")).isFalse()
        assertThat(isPendingCadastroStatus(null)).isFalse()
    }

    @Test
    fun `pendingCadastroStatusQueryValue should return in filter with pending statuses`() {
        assertThat(pendingCadastroStatusQueryValue())
            .isEqualTo("in.(incompleto)")
    }
}
