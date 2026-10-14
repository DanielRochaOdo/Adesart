# Publicacao mobile via GitHub Actions

Existem tres fluxos independentes. O comando de build nao publica em nenhuma loja.

## 1. Gerar arquivos Android + iOS

Usa o workflow `mobile-release.yml`.

Exemplo:

```powershell
.\android-app\scripts\release-all.ps1 `
  -VersionName 1.0.143 `
  -VersionCode 143 `
  -IosExportMethod development
```

Esse fluxo gera APK, AAB e IPA e baixa os artefatos. Nao envia nada ao Google Play ou App Store Connect.

## 2. Criar e publicar Android no Google Play

Usa o workflow `android-store-release.yml`.

```powershell
.\android-app\scripts\release-android-store.ps1 `
  -VersionName 1.0.143 `
  -VersionCode 143
```

O workflow:

1. gera APK e AAB assinados;
2. guarda uma copia como artifact do GitHub Actions;
3. envia o AAB ao pacote `br.com.vendamais.mobile`;
4. publica no track `production` com status `completed`.

Requer o GitHub Secret:

- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`

A service account precisa ter permissao de release para o app no Google Play Console.

## 3. Criar e enviar iOS ao App Store Connect

Usa o workflow `ios-store-release.yml`.

```powershell
.\android-app\scripts\release-ios-store.ps1 `
  -VersionName 1.0.143 `
  -VersionCode 143
```

O workflow:

1. gera o archive iOS com Apple Distribution;
2. exporta o IPA como `app-store-connect`;
3. guarda uma copia como artifact do GitHub Actions;
4. valida o IPA com a App Store Connect API Key;
5. envia o IPA ao App Store Connect.

O upload do IPA nao elimina as etapas obrigatorias da Apple. O build ainda precisa ser processado e, quando aplicavel, associado a uma versao e submetido ao App Review antes de ficar publico.

Requer os GitHub Secrets de assinatura ja usados pelo build:

- `IOS_APPSTORE_CERTIFICATE_P12_BASE64`
- `IOS_APPSTORE_CERTIFICATE_PASSWORD`
- `IOS_APPSTORE_PROVISIONING_PROFILE_BASE64`
- `IOS_TEAM_ID`

E os novos Secrets de upload:

- `APPSTORE_CONNECT_API_KEY_P8_BASE64`
- `APPSTORE_CONNECT_KEY_ID`
- `APPSTORE_CONNECT_ISSUER_ID`

## Configurar credenciais de publicacao

O script `configure-store-publish-secrets.ps1` aceita Google Play, Apple ou ambos.

Google Play:

```powershell
.\android-app\scripts\configure-store-publish-secrets.ps1 `
  -GooglePlayServiceAccountJson "C:\caminho\service-account.json"
```

Apple:

```powershell
.\android-app\scripts\configure-store-publish-secrets.ps1 `
  -AppStoreConnectApiKeyP8 "C:\caminho\AuthKey_XXXXXXXXXX.p8" `
  -AppStoreConnectKeyId "XXXXXXXXXX" `
  -AppStoreConnectIssuerId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

As chaves locais nao devem ser adicionadas ao Git.
