import java.net.URI
import java.util.Properties
import org.gradle.api.tasks.Copy
import org.gradle.api.tasks.Delete
import org.gradle.api.tasks.WriteProperties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use(::load)
    }
}

fun quoted(value: String): String = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

val defaultPublicAppUrl = "https://vendamais.odontoart.com"
val defaultPrivacyPolicyUrl = "https://odontoart.com/privacy-policy/"
val defaultDirectUpdateMetadataUrl = "https://odontoart.com/vendaMais/updates/android-update.json"

fun isLocalHost(host: String?): Boolean {
    val normalized = host?.trim()?.lowercase().orEmpty()
    return normalized == "localhost" || normalized == "127.0.0.1" || normalized == "::1"
}

fun normalizePublicAppUrl(raw: String?): String {
    val candidate = raw?.trim().orEmpty().removeSuffix("/")
    if (candidate.isBlank()) return defaultPublicAppUrl
    val host = runCatching { URI(candidate).host }.getOrNull()
    if (isLocalHost(host)) return defaultPublicAppUrl
    return candidate
}

fun resolvePublicAppHost(url: String): String {
    return runCatching { URI(url).host?.trim() }
        .getOrNull()
        ?.takeIf { it.isNotBlank() }
        ?: "vendamais.odontoart.com"
}

val releaseStoreFile = localProperties.getProperty("releaseStoreFile")?.takeIf { it.isNotBlank() }
val releaseStorePassword = localProperties.getProperty("releaseStorePassword")?.takeIf { it.isNotBlank() }
val releaseKeyAlias = localProperties.getProperty("releaseKeyAlias")?.takeIf { it.isNotBlank() }
val releaseKeyPassword = localProperties.getProperty("releaseKeyPassword")?.takeIf { it.isNotBlank() }
val hasReleaseSigningConfig = !releaseStoreFile.isNullOrBlank() &&
    !releaseStorePassword.isNullOrBlank() &&
    !releaseKeyAlias.isNullOrBlank() &&
    !releaseKeyPassword.isNullOrBlank()
val resolvedPublicAppUrl = normalizePublicAppUrl(localProperties.getProperty("publicAppUrl"))
val resolvedPublicAppHost = localProperties.getProperty("publicAppHost")
    ?.trim()
    ?.takeIf { it.isNotBlank() }
    ?: resolvePublicAppHost(resolvedPublicAppUrl)
data class AppVersion(
    val code: Int,
    val name: String,
)

fun parseVersionNameOrDefault(value: String?): String {
    val normalized = value?.trim().orEmpty()
    return if (Regex("""\d+\.\d+\.\d+""").matches(normalized)) normalized else "1.0.0"
}

fun bumpPatchVersionName(versionName: String): String {
    val parts = versionName.split(".")
    if (parts.size != 3) return "1.0.1"
    val major = parts[0].toIntOrNull() ?: return "1.0.1"
    val minor = parts[1].toIntOrNull() ?: return "1.0.1"
    val patch = parts[2].toIntOrNull() ?: return "1.0.1"
    return "$major.$minor.${patch + 1}"
}

val versionPropertiesFile = rootProject.file("version.properties")
val versionProperties = Properties().apply {
    if (versionPropertiesFile.exists()) {
        versionPropertiesFile.inputStream().use(::load)
    }
}

val baseVersionCode = versionProperties.getProperty("VERSION_CODE")?.toIntOrNull() ?: 1
val baseVersionName = parseVersionNameOrDefault(versionProperties.getProperty("VERSION_NAME"))
val releaseBuildRequested = gradle.startParameter.taskNames
    .map { it.substringAfterLast(':') }
    .any {
        it in setOf(
            "assembleStandardRelease",
            "bundleStandardRelease",
            "renameReleaseApk",
            "renameReleaseBundle",
            "playStoreReleaseBundle",
            "assembleDirectRelease",
            "bundleDirectRelease",
            "renameDirectReleaseApk",
            "renameDirectReleaseBundle",
        )
    }

if (releaseBuildRequested && !hasReleaseSigningConfig) {
    throw GradleException(
        "Release build bloqueado: configure releaseStoreFile, releaseStorePassword, " +
            "releaseKeyAlias e releaseKeyPassword em android-app/local.properties. " +
            "As versoes de producao devem usar sempre a mesma chave de assinatura.",
    )
}

val appVersion = if (releaseBuildRequested) {
    val bumped = AppVersion(
        code = baseVersionCode + 1,
        name = bumpPatchVersionName(baseVersionName),
    )
    versionProperties["VERSION_CODE"] = bumped.code.toString()
    versionProperties["VERSION_NAME"] = bumped.name
    versionPropertiesFile.outputStream().use { out ->
        versionProperties.store(out, "Auto-updated on release build")
    }
    println("Release version bump: $baseVersionName($baseVersionCode) -> ${bumped.name}(${bumped.code})")
    bumped
} else {
    AppVersion(baseVersionCode, baseVersionName)
}

fun resolveReleaseArtifactBaseUrl(): String {
    val configured = localProperties.getProperty("updateArtifactBaseUrl")
        ?.trim()
        ?.takeIf { it.isNotBlank() }
    if (configured != null) return configured.removeSuffix("/")

    val configuredUpdateApkUrl = localProperties.getProperty("updateApkUrl")
        ?.trim()
        ?.takeIf { it.isNotBlank() }
    if (configuredUpdateApkUrl != null) {
        return configuredUpdateApkUrl
            .substringBeforeLast('/')
            .removeSuffix("/")
    }

    return "https://odontoart.com/vendaMais/updates"
}

val resolvedUpdateMetadataUrl = localProperties.getProperty("updateMetadataUrl")
    ?.trim()
    ?.takeIf { it.isNotBlank() }
    ?: defaultDirectUpdateMetadataUrl
val releaseArtifactBaseUrl = resolveReleaseArtifactBaseUrl()
val resolvedDirectUpdateApkUrl = "$releaseArtifactBaseUrl/vendamais-mobile-direct-v${appVersion.name}.apk"

android {
    namespace = "br.com.vendamais.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "br.com.vendamais.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = appVersion.code
        versionName = appVersion.name

        buildConfigField("String", "SUPABASE_URL", quoted(localProperties.getProperty("supabaseUrl", "")))
        buildConfigField("String", "SUPABASE_ANON_KEY", quoted(localProperties.getProperty("supabaseAnonKey", "")))
        buildConfigField("String", "PUBLIC_APP_URL", quoted(resolvedPublicAppUrl))
        buildConfigField("String", "PRIVACY_POLICY_URL", quoted(localProperties.getProperty("privacyPolicyUrl", defaultPrivacyPolicyUrl)))
        buildConfigField("boolean", "DIRECT_UPDATE_ENABLED", "false")
        // The standard build intentionally has no APK self-installer. This removes the
        // high-risk REQUEST_INSTALL_PACKAGES surface from the default production APK.
        buildConfigField("String", "UPDATE_METADATA_URL", quoted(""))
        buildConfigField("String", "UPDATE_APK_URL", quoted(""))

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }

        manifestPlaceholders["publicAppHost"] = resolvedPublicAppHost
    }

    flavorDimensions += "distribution"
    productFlavors {
        create("standard") {
            dimension = "distribution"
        }
        create("direct") {
            dimension = "distribution"
            // Private/direct channel only. This variant keeps the explicit, user-driven
            // APK updater and therefore receives REQUEST_INSTALL_PACKAGES via src/direct.
            buildConfigField("boolean", "DIRECT_UPDATE_ENABLED", "true")
            buildConfigField("String", "UPDATE_METADATA_URL", quoted(resolvedUpdateMetadataUrl))
            buildConfigField("String", "UPDATE_APK_URL", quoted(resolvedDirectUpdateApkUrl))
        }
    }

    signingConfigs {
        if (hasReleaseSigningConfig) {
            create("release") {
                storeFile = rootProject.file(releaseStoreFile!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                isV1SigningEnabled = true
                isV2SigningEnabled = true
            }
        }
    }

    buildTypes {
        release {
            if (hasReleaseSigningConfig) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

tasks.register<Copy>("renameReleaseBundle") {
    dependsOn("bundleStandardRelease")
    from(layout.buildDirectory.file("outputs/bundle/standardRelease/app-standard-release.aab"))
    into(layout.buildDirectory.dir("outputs/release-artifacts"))
    rename { "vendamais-mobile-v${android.defaultConfig.versionName}.aab" }
}

tasks.register("playStoreReleaseBundle") {
    group = "distribution"
    description = "Gera o Android App Bundle standard assinado para envio ao Google Play."
    dependsOn("renameReleaseBundle")
}

tasks.register<Copy>("renameReleaseApk") {
    dependsOn("assembleStandardRelease")
    from(layout.buildDirectory.dir("outputs/apk/standard/release")) {
        include("*.apk")
        exclude("*.idsig")
    }
    into(layout.buildDirectory.dir("outputs/release-artifacts"))
    rename { "vendamais-mobile-v${android.defaultConfig.versionName}.apk" }
}

tasks.register<Copy>("renameDirectReleaseBundle") {
    dependsOn("bundleDirectRelease")
    from(layout.buildDirectory.file("outputs/bundle/directRelease/app-direct-release.aab"))
    into(layout.buildDirectory.dir("outputs/release-artifacts"))
    rename { "vendamais-mobile-direct-v${android.defaultConfig.versionName}.aab" }
}

tasks.register<Copy>("renameDirectReleaseApk") {
    dependsOn("assembleDirectRelease")
    from(layout.buildDirectory.dir("outputs/apk/direct/release")) {
        include("*.apk")
        exclude("*.idsig")
    }
    into(layout.buildDirectory.dir("outputs/release-artifacts"))
    rename { "vendamais-mobile-direct-v${android.defaultConfig.versionName}.apk" }
}

// Kept under the historical task name because deployment scripts may already call it.
// The generated metadata is only for the private/direct self-update channel.
tasks.register("generateReleaseUpdateJson") {
    doLast {
        val outputDir = layout.buildDirectory.dir("outputs/release-artifacts").get().asFile
        outputDir.mkdirs()
        val versionName = android.defaultConfig.versionName.orEmpty()
        val versionCode = android.defaultConfig.versionCode ?: 0
        val json = """
            {
              "versionCode": $versionCode,
              "versionName": "$versionName",
              "apkUrl": "$resolvedDirectUpdateApkUrl",
              "notes": "Atualizacao da versao $versionName"
            }
        """.trimIndent() + System.lineSeparator()
        file("${outputDir.absolutePath}/android-update.json").writeText(json)
        file("${outputDir.absolutePath}/android-update-v$versionName.json").writeText(json)
    }
}

tasks.named("renameDirectReleaseBundle") {
    dependsOn("generateReleaseUpdateJson")
}

tasks.named("renameDirectReleaseApk") {
    dependsOn("generateReleaseUpdateJson")
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")

    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.4")
    implementation("androidx.datastore:datastore-preferences:1.2.1")
    implementation("androidx.graphics:graphics-path:1.1.0")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("com.google.android.material:material:1.12.0")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("io.ktor:ktor-client-core:2.3.12")
    implementation("io.ktor:ktor-client-okhttp:2.3.12")
    implementation("io.ktor:ktor-client-content-negotiation:2.3.12")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.12")
    implementation("com.google.zxing:core:3.5.3")

    testImplementation("junit:junit:4.13.2")
    testImplementation("com.google.truth:truth:1.4.4")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")

    androidTestImplementation("androidx.test:core-ktx:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
