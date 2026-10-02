# GitHub Actions — APK + AAB + IPA

O workflow `.github/workflows/mobile-release.yml` gera os tres artefatos mobile no GitHub:

- Android APK assinado;
- Android AAB assinado;
- iOS IPA assinado.

O build usa uma versao exata informada pelo comando. Ele nao depende do valor commitado em `version.properties` e nao faz bump adicional no CI.

## 1. Requisito local

Instale o GitHub CLI:

```powershell
winget install --id GitHub.cli
gh auth login
```

## 2. Secrets Android

O script consegue aproveitar o `android-app/local.properties` e o mesmo keystore de producao ja usado localmente:

```powershell
.\android-app\scripts\configure-release-secrets.ps1
```

Se o caminho do JKS nao estiver no `local.properties`:

```powershell
.\android-app\scripts\configure-release-secrets.ps1 -AndroidKeystore "H:\caminho\vendamais-prod-release.jks"
```

Secrets criados:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

A variavel `PUBLIC_APP_URL` tambem e criada quando existir em `local.properties`.

## 3. Secrets iOS

Para um IPA instalavel, a Apple exige assinatura. Exporte/obtenha:

- certificado Apple em `.p12`;
- provisioning profile `.mobileprovision`;
- Team ID da conta Apple Developer.

Depois:

```powershell
.\android-app\scripts\configure-release-secrets.ps1 `
  -IosCertificateP12 "C:\Apple\VendaMais.p12" `
  -IosProvisioningProfile "C:\Apple\VendaMais.mobileprovision" `
  -IosTeamId "SEU_TEAM_ID"
```

O script pede a senha do P12 sem grava-la no repositorio.

Secrets criados:

- `IOS_CERTIFICATE_P12_BASE64`
- `IOS_CERTIFICATE_PASSWORD`
- `IOS_PROVISIONING_PROFILE_BASE64`
- `IOS_TEAM_ID`

O Bundle Identifier usado pelo workflow e `br.com.vendamais.mobile`.

## 4. Gerar tudo pelo VS Code/PowerShell

Exemplo para 1.0.140 / build 140 e IPA de desenvolvimento:

```powershell
.\android-app\scripts\release-all.ps1 -VersionName 1.0.140 -VersionCode 140
```

Para Ad Hoc:

```powershell
.\android-app\scripts\release-all.ps1 -VersionName 1.0.140 -VersionCode 140 -IosExportMethod ad-hoc
```

Para App Store Connect/TestFlight:

```powershell
.\android-app\scripts\release-all.ps1 -VersionName 1.0.140 -VersionCode 140 -IosExportMethod app-store-connect
```

O script:

1. confirma que o codigo local esta no GitHub;
2. cria uma tag de release sobre o commit atual;
3. faz push da tag;
4. aguarda o GitHub Actions;
5. baixa APK, AAB e IPA automaticamente.

Saida padrao:

`android-app/release-downloads/v<VERSAO>-b<BUILD>/`

## Por que o script usa tag

Enquanto o workflow ainda estiver apenas nesta branch de laboratorio, `workflow_dispatch` depende de o workflow existir na branch default do repositorio. A tag permite disparar o workflow imediatamente usando exatamente o commit atual desta branch.

Depois que o workflow estiver presente na branch default, ele tambem pode ser executado manualmente pela aba Actions ou por `gh workflow run`.

## Observacao sobre perfis iOS

- `development`: perfil/certificado de desenvolvimento e dispositivos registrados.
- `ad-hoc`: perfil Ad Hoc com os dispositivos permitidos.
- `app-store-connect`: perfil/certificado de distribuicao para TestFlight/App Store.

O tipo de certificado/profile precisa corresponder ao metodo escolhido.
