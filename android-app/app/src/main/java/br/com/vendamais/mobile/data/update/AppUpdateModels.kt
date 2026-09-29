package br.com.vendamais.mobile.data.update

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AppUpdateInfo(
    @SerialName("versionCode")
    val versionCode: Int,
    @SerialName("versionName")
    val versionName: String,
    @SerialName("apkUrl")
    val apkUrl: String,
    @SerialName("notes")
    val notes: String? = null,
)
