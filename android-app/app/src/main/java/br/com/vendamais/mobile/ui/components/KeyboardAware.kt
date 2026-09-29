package br.com.vendamais.mobile.ui.components

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.foundation.ExperimentalFoundationApi

private const val BRING_INTO_VIEW_DELAY_MS = 120L

@OptIn(ExperimentalFoundationApi::class)
fun Modifier.bringIntoViewOnFocus(
    enabled: Boolean = true,
    delayMillis: Long = BRING_INTO_VIEW_DELAY_MS,
): Modifier = composed {
    if (!enabled) return@composed this
    val requester = remember { BringIntoViewRequester() }
    val scope = rememberCoroutineScope()
    var bringIntoViewJob by remember { mutableStateOf<Job?>(null) }

    this
        .bringIntoViewRequester(requester)
        .onFocusChanged { focusState ->
            if (!focusState.isFocused) return@onFocusChanged
            bringIntoViewJob?.cancel()
            bringIntoViewJob = launchBringIntoView(scope, requester, delayMillis)
        }
}

@OptIn(ExperimentalFoundationApi::class)
private fun launchBringIntoView(
    scope: CoroutineScope,
    requester: BringIntoViewRequester,
    delayMillis: Long,
): Job {
    return scope.launch {
        if (delayMillis > 0) delay(delayMillis)
        runCatching { requester.bringIntoView() }
    }
}

@Immutable
data class KeyboardAwareFooterState(
    val contentBottomPadding: Dp,
    val containerModifier: Modifier,
    val footerModifier: Modifier,
)

@Composable
fun rememberKeyboardAwareFooterState(
    minBottomSpacing: Dp = 12.dp,
    extraContentSpacing: Dp = 12.dp,
): KeyboardAwareFooterState {
    var footerHeightPx by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current
    val navigationBottomInset = WindowInsets.navigationBars
        .asPaddingValues()
        .calculateBottomPadding()
    val footerHeightDp = with(density) { footerHeightPx.toDp() }

    val contentBottomPadding = footerHeightDp + navigationBottomInset + minBottomSpacing + extraContentSpacing

    return KeyboardAwareFooterState(
        contentBottomPadding = contentBottomPadding,
        containerModifier = Modifier
            .windowInsetsPadding(WindowInsets.navigationBars)
            .imePadding(),
        footerModifier = Modifier
            .onSizeChanged { size ->
                if (size.height > 0 && size.height != footerHeightPx) {
                    footerHeightPx = size.height
                }
            },
    )
}
