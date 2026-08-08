import { TextInput as RNTextInput, TextInputProps, StyleSheet } from 'react-native';

// Wraps RN's TextInput so every text field in the app always shows a visible
// cursor. None of the screens set `cursorColor`/`selectionColor` explicitly,
// so the caret fell back to the platform default, which can end up
// low-contrast (or invisible) against a given input's background. This
// derives the caret color from the input's own `color` style — the same
// color the typed text renders in, so it's guaranteed to be visible — unless
// the caller passes `cursorColor`/`selectionColor` explicitly.
// `cursorColor`/`selectionColor` are native-only RN props — react-native-web
// ignores them and instead expects the CSS `caretColor` property inside
// `style`, so it's added there too (web is the only platform this app is
// actually being tested on right now) or every search box's caret would
// stay invisible there regardless of this fix.
export function TextInput({ style, cursorColor, selectionColor, ...props }: TextInputProps) {
  const flattened = StyleSheet.flatten(style) as { color?: string } | undefined;
  const caret = cursorColor ?? flattened?.color ?? '#1A1A18';
  return (
    <RNTextInput
      style={[style, { caretColor: caret } as any]}
      cursorColor={caret}
      selectionColor={selectionColor ?? caret}
      {...props}
    />
  );
}
