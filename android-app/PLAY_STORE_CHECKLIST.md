# Play Store Checklist

## Build

- Gerar o canal padrao com `renameReleaseBundle` (internamente `bundleStandardRelease`).
- Confirmar que o arquivo final e `vendamais-mobile-v<versao>.aab`.
- Validar a assinatura com a mesma keystore de producao usada em todas as versoes.
- Confirmar que o manifesto do canal `standard` NAO contem `REQUEST_INSTALL_PACKAGES`.
- O canal `direct` e exclusivo para distribuicao privada com autoatualizacao por APK e nao deve ser enviado ao Google Play.

## Versao

- Incrementar `VERSION_CODE` em cada envio.
- Manter `VERSION_NAME` coerente com o changelog.

## Console do Google Play

- Informar politica de privacidade publica.
- Preencher a ficha de Data Safety.
- Declarar o uso de conta, login e dados coletados.
- Confirmar que a app nativa nao expõe funcionalidades incompletas para review.

## Ambiente

- `supabaseUrl` e `supabaseAnonKey` devem apontar para producao.
- `publicAppUrl` deve apontar para a URL publica real.
- Validar deep links e login em dispositivo real.


## Play Protect

- O APK padrao de producao e o `standard`; ele nao solicita instalacao de outros APKs.
- Para distribuicao privada que realmente precise do atualizador interno, gerar `renameDirectReleaseApk`.
- Nao alternar a chave de assinatura entre versoes; a reputacao e a continuidade de update dependem do mesmo certificado.
- Antes de distribuir uma nova versao por sideload, validar a assinatura e testar o APK em um dispositivo com Play Protect ativo.
