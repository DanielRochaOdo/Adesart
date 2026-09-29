package br.com.vendamais.mobile.domain.cadastro

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CadastroModalStateMachineTest {

    @Test
    fun `resolve should prioritize empresa nao identificada over other overlays`() {
        val overlay = CadastroModalStateMachine.resolve(
            CadastroModalSignal(
                empresaNaoIdentificada = true,
                empresaNaoIdentificadaRequired = true,
                empresaObservacaoNome = "Empresa A",
                empresaObservacaoTexto = "Observacao",
                empresaCanceladaNome = "Empresa B",
            ),
        )

        assertThat(overlay).isEqualTo(CadastroOverlayIntent.EmpresaNaoIdentificada(required = true))
    }

    @Test
    fun `resolve should return observacoes before empresa cancelada`() {
        val overlay = CadastroModalStateMachine.resolve(
            CadastroModalSignal(
                empresaObservacaoNome = "Empresa A",
                empresaObservacaoTexto = "Atenção",
                empresaCanceladaNome = "Empresa B",
            ),
        )

        assertThat(overlay).isEqualTo(
            CadastroOverlayIntent.ObservacoesEmpresa(
                empresaNome = "Empresa A",
                observacoes = "Atenção",
            ),
        )
    }

    @Test
    fun `resolve should map parceiro invalido erp error to overlay`() {
        val overlay = CadastroModalStateMachine.resolve(
            CadastroModalSignal(
                erpError = CadastroErpError.ParceiroInvalido("Parceiro invalido"),
            ),
        )

        assertThat(overlay).isEqualTo(
            CadastroOverlayIntent.ParceiroInvalido("Parceiro invalido"),
        )
    }

    @Test
    fun `resolve should return null when no signal is provided`() {
        val overlay = CadastroModalStateMachine.resolve(CadastroModalSignal())
        assertThat(overlay).isNull()
    }
}
