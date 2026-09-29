# Venda+ — release para Google Play

## Artefato correto

A Google Play deve receber somente o flavor `standard`.

- applicationId: `br.com.vendamais.mobile`
- targetSdk: 36 (Android 16)
- compileSdk: 36
- JDK: 17
- updater por APK: desativado no flavor `standard`
- `REQUEST_INSTALL_PACKAGES`: somente no flavor privado `direct`
- politica de privacidade: https://odontoart.com/privacy-policy/

Nunca envie `directRelease` para a Google Play.

## Antes de gerar

Confirme que `android-app/local.properties` possui a configuracao do Supabase e a chave de upload/release.
Nao versione senhas, keystore ou chaves no Git.

A tarefa de release incrementa `version.properties` automaticamente. Execute a geracao final apenas uma vez para cada versao.

## Gerar o AAB da Play

```powershell
cd C:\Users\daniel.rocha\Documents\GitHub\vendamais-mobile\android-app
.\gradlew.bat clean playStoreReleaseBundle --stacktrace --no-daemon
Get-ChildItem .\app\build\outputs\release-artifacts\*.aab
```

O arquivo esperado e:

```text
app\build\outputs\release-artifacts\vendamais-mobile-vX.Y.Z.aab
```

## Play App Signing

Como a continuidade com instalacoes APK anteriores nao e requisito, a Google Play pode gerar a chave de assinatura do app no Play App Signing.
O keystore local atual pode ser mantido como chave de upload para assinar os AABs enviados ao Console.
Guarde o keystore e as senhas fora do repositorio e com backup seguro.

## Declaracoes no Play Console

- Nome: Venda+
- Categoria sugerida: Negocios
- Anuncios: nao ha SDK de anuncios no Android atual
- Politica de privacidade: https://odontoart.com/privacy-policy/
- Acesso ao app: fornecer uma conta de revisao funcional
- Seguranca dos dados: declarar os dados realmente tratados no fluxo de usuarios/cadastros/adesoes
- Publico-alvo: informar o publico real do produto
- Exclusao de conta/dados: o app oferece acesso a politica e canal de solicitacao em Meu Perfil

## Verificacao tecnica

O workflow `Android Play Readiness` valida compilacao, testes, API 36, ausencia de `REQUEST_INSTALL_PACKAGES` no standard e alinhamento de 16 KB.
Publique primeiro em Teste interno, instale pela propria Play e valide login, cadastro, links, anexos e logout antes de promover para producao.
