import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

// Theme — restated from theme.css because CodeMirror cannot read CSS
// variables. White primary / black secondary (monochrome). Keep in step with
// the tokens or the editor drifts off-palette.
const darkEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#1f1f1f',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    lineHeight: '1.5',
  },
  '.cm-content': {
    caretColor: '#000000',
    padding: '0',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#000000', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  '.cm-gutters': {
    backgroundColor: '#f2f2f2',
    color: '#5c5c5c',
    borderRight: '1px solid #e5e5e5',
  },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(0, 0, 0, 0.08)', color: '#1f1f1f' },
  '.cm-activeLine': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
  '.cm-foldPlaceholder': { backgroundColor: '#e5e5e5', border: 'none', color: '#5c5c5c' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(0, 0, 0, 0.16)', outline: '1px solid rgba(0, 0, 0, 0.4)' },
  '.cm-tooltip': {
    backgroundColor: '#ffffff',
    border: '1px solid #d9d9d9',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul': { fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' },
    '& > ul > li': { padding: 'var(--spacing-xs) var(--spacing-sm)' },
    '& > ul > li[aria-selected]': { backgroundColor: 'rgba(0, 0, 0, 0.12)', color: '#000000' },
  },
  '.cm-tooltip.cm-completionInfo': { padding: 'var(--spacing-sm)', maxWidth: '300px' },
  '.cm-completionDetail': { color: '#444444', fontStyle: 'italic', marginLeft: '0.5em' },
  '.cm-panels': { backgroundColor: '#f2f2f2', color: '#1f1f1f' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid #d9d9d9' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #d9d9d9' },
  '.cm-searchMatch': { backgroundColor: 'rgba(0, 0, 0, 0.16)', outline: '1px solid rgba(0, 0, 0, 0.4)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  '.cm-selectionMatch': { backgroundColor: 'rgba(0, 0, 0, 0.1)' },
}, { dark: false })

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: '#000000', fontWeight: '500' }, // YAML keys — black
  { tag: tags.string, color: '#0a734f' },               // strings — green
  { tag: tags.number, color: '#8a5d0b' },               // numbers — amber
  { tag: tags.bool, color: '#4a4a4a' },                 // booleans — gray
  { tag: tags.null, color: '#4a4a4a' },                 // null — gray
  { tag: tags.keyword, color: '#333333' },              // keywords — dark gray
  { tag: tags.comment, color: '#7a7a7a', fontStyle: 'italic' }, // comments — muted
  { tag: tags.meta, color: '#1f1f1f' },                 // directives
  { tag: tags.punctuation, color: '#444444' },          // colons, dashes
  { tag: tags.atom, color: '#b3261e' },                 // special values — red
  { tag: tags.labelName, color: '#000000', fontWeight: '500' }, // anchors/aliases
])

// Light theme — identical white primary / black secondary palette
const lightEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#1f1f1f',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    lineHeight: '1.5',
  },
  '.cm-content': {
    caretColor: '#000000',
    padding: '0',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#000000', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  '.cm-gutters': {
    backgroundColor: '#f2f2f2',
    color: '#5c5c5c',
    borderRight: '1px solid #e5e5e5',
  },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(0, 0, 0, 0.08)', color: '#1f1f1f' },
  '.cm-activeLine': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
  '.cm-foldPlaceholder': { backgroundColor: '#e5e5e5', border: 'none', color: '#5c5c5c' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(0, 0, 0, 0.16)', outline: '1px solid rgba(0, 0, 0, 0.4)' },
  '.cm-tooltip': {
    backgroundColor: '#ffffff',
    border: '1px solid #d9d9d9',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul': { fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' },
    '& > ul > li': { padding: 'var(--spacing-xs) var(--spacing-sm)' },
    '& > ul > li[aria-selected]': { backgroundColor: 'rgba(0, 0, 0, 0.12)', color: '#000000' },
  },
  '.cm-tooltip.cm-completionInfo': { padding: 'var(--spacing-sm)', maxWidth: '300px' },
  '.cm-completionDetail': { color: '#444444', fontStyle: 'italic', marginLeft: '0.5em' },
  '.cm-panels': { backgroundColor: '#f2f2f2', color: '#1f1f1f' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid #d9d9d9' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #d9d9d9' },
  '.cm-searchMatch': { backgroundColor: 'rgba(0, 0, 0, 0.16)', outline: '1px solid rgba(0, 0, 0, 0.4)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  '.cm-selectionMatch': { backgroundColor: 'rgba(0, 0, 0, 0.1)' },
})

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: '#000000', fontWeight: '500' }, // YAML keys — black
  { tag: tags.string, color: '#0a734f' },                // strings — green
  { tag: tags.number, color: '#8a5d0b' },                // numbers — amber
  { tag: tags.bool, color: '#4a4a4a' },                  // booleans — gray
  { tag: tags.null, color: '#4a4a4a' },                  // null — gray
  { tag: tags.keyword, color: '#333333' },               // keywords — dark gray
  { tag: tags.comment, color: '#7a7a7a', fontStyle: 'italic' }, // comments — muted
  { tag: tags.meta, color: '#1f1f1f' },                  // directives
  { tag: tags.punctuation, color: '#444444' },           // colons, dashes
  { tag: tags.atom, color: '#b3261e' },                  // special values — red
  { tag: tags.labelName, color: '#000000', fontWeight: '500' }, // anchors/aliases
])

export const darkTheme = [darkEditorTheme, syntaxHighlighting(darkHighlightStyle)]
export const lightTheme = [lightEditorTheme, syntaxHighlighting(lightHighlightStyle)]

export function getThemeExtension(theme) {
  return theme === 'light' ? lightTheme : darkTheme
}
