# Android App

Aplicacao Android nativa em Kotlin + Jetpack Compose para substituir gradualmente o app web.

## Estado atual

- Login nativo com Supabase Auth.
- Sessao persistida com refresh de token.
- Dashboard nativo com indicadores do mes e drill-down por vendedor.
- Modulo de cadastros nativo com listagem, filtro e detalhe.
- Perfil do usuario e contexto do app.
- Build debug validado localmente.

## O que ainda depende de configuracao

Preencha `android-app/local.properties` com:

- `sdk.dir`
- `supabaseUrl`
- `supabaseAnonKey`
- `publicAppUrl`

Sem `supabaseUrl` e `supabaseAnonKey`, o app abre mas nao autentica.

## Build

Opcao 1:

```powershell
cd android-app
.\build-debug.ps1
```

Opcao 2:

```powershell
cd android-app
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat assembleDebug
```

APK de debug gerado em:

`android-app/app/build/outputs/apk/debug/app-debug.apk`

## Release para Play Store

Para publicar na Google Play, gere o bundle de release:

```powershell
cd android-app
.\gradlew.bat bundleRelease
```

Bundle gerado em:

`android-app/app/build/outputs/bundle/release/app-release.aab`

Antes do envio, confirme:

- `local.properties` com `releaseStoreFile`, `releaseStorePassword`, `releaseKeyAlias` e `releaseKeyPassword`
- `supabaseUrl`, `supabaseAnonKey` e `publicAppUrl` apontando para ambiente de producao
- `updateMetadataUrl` apontando para um JSON publico com os dados da versao
- `updateApkUrl` apontando para o APK publico de fallback
- `version.properties` com `VERSION_CODE` sempre maior que o envio anterior
- assinatura de release valida e testada
- politica de privacidade publica e ficha Data Safety preenchida no Console do Google Play

## Atualizacao propria

O app pode checar um JSON publico com este formato:

```json
{
  "versionCode": 85,
  "versionName": "1.0.85",
  "apkUrl": "https://seudominio.com/updates/vendamais-mobile-v1.0.85.apk",
  "notes": "Atualizacao da versao 1.0.85"
}
```

Se a `versionCode` for maior que a atual, o app mostra um aviso, baixa o APK e abre o instalador do Android.

### Hospedagem na HostGator

Use uma pasta publica dentro de `public_html`, por exemplo:

- `https://seudominio.com/updates/android-update.json`
- `https://seudominio.com/updates/vendamais-mobile-v1.0.85.apk`

No `android-app/local.properties`, configure:

```properties
updateMetadataUrl=https://seudominio.com/updates/android-update.json
updateApkUrl=https://seudominio.com/updates/vendamais-mobile-v1.0.85.apk
```

O ideal e manter `android-update.json` com URL fixa e trocar apenas o conteudo interno a cada versao.

## Estrategia de migracao

1. Manter autenticacao, dashboard e operacao principal de cadastros em Compose.
2. Reaproveitar RPCs e Edge Functions ja existentes no Supabase.
3. Evoluir criacao/edicao completa de cadastro e uploads em telas nativas incrementais.
