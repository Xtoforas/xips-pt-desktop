import {
  Alert,
  Badge,
  Button,
  Input,
  InputWrapper,
  NativeSelect,
  MultiSelect,
  Table,
  TextInput,
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple
} from '@mantine/core';

const xipsBlue: MantineColorsTuple = [
  '#e7f5ff',
  '#d0ebff',
  '#a5d8ff',
  '#74c0fc',
  '#4dabf7',
  '#339af0',
  '#228be6',
  '#1c7ed6',
  '#1971c0',
  '#1864ab'
];

const fontFamily = '"IBM Plex Sans", "Trebuchet MS", sans-serif';

export const desktopTheme = createTheme({
  fontFamily,
  fontFamilyMonospace: fontFamily,
  headings: {
    fontFamily,
    sizes: {
      h1: { fontSize: '2.4rem', lineHeight: '1.05', fontWeight: '700' },
      h2: { fontSize: '1.86rem', lineHeight: '1.1', fontWeight: '700' },
      h3: { fontSize: '1.5rem', lineHeight: '1.14', fontWeight: '700' },
      h4: { fontSize: '1.26rem', lineHeight: '1.2', fontWeight: '700' },
      h5: { fontSize: '1.14rem', lineHeight: '1.24', fontWeight: '700' },
      h6: { fontSize: '1.02rem', lineHeight: '1.28', fontWeight: '700' }
    }
  },
  colors: {
    xipsBlue
  },
  primaryColor: 'xipsBlue',
  primaryShade: {
    dark: 6,
    light: 8
  },
  defaultRadius: 'xs',
  focusRing: 'auto',
  cursorType: 'pointer',
  other: {
    pageBgLight: '#f6f8fb',
    pageBgDark: '#0c1117',
    textMainLight: '#172130',
    textMainDark: '#edf4fc',
    textSoftLight: '#2a3748',
    textSoftDark: '#d8e7f8',
    textMutedLight: '#5f7085',
    textMutedDark: '#96a9bd',
    textPlaceholderLight: '#8395a9',
    textPlaceholderDark: '#8ea4bc',
    textLabelLight: '#42566e',
    textLabelDark: '#b4c8dd'
  },
  components: {
    Alert: Alert.extend({
      defaultProps: {
        variant: 'light'
      }
    }),
    Badge: Badge.extend({
      defaultProps: {
        variant: 'light',
        radius: 'xs'
      }
    }),
    Button: Button.extend({
      defaultProps: {
        radius: 'xs'
      }
    }),
    Input: Input.extend({
      styles: {
        input: {
          color: 'var(--mantine-color-text)',
          backgroundColor: 'var(--mantine-color-default)',
          borderColor: 'var(--mantine-color-default-border)'
        },
        section: {
          color: 'var(--text-label)'
        }
      }
    }),
    InputWrapper: InputWrapper.extend({
      styles: {
        label: {
          color: 'var(--text-soft)',
          fontWeight: '700'
        },
        description: {
          color: 'var(--mantine-color-dimmed)'
        },
        error: {
          color: 'var(--mantine-color-red-3)'
        }
      }
    }),
    NativeSelect: NativeSelect.extend({
      defaultProps: {
        radius: 'xs'
      }
    }),
    MultiSelect: MultiSelect.extend({
      defaultProps: {
        radius: 'xs'
      }
    }),
    Table: Table.extend({
      defaultProps: {
        horizontalSpacing: 'sm',
        verticalSpacing: 'xs'
      }
    }),
    TextInput: TextInput.extend({
      defaultProps: {
        radius: 'xs'
      }
    })
  }
});

export const desktopCssVariablesResolver: CSSVariablesResolver = (resolvedTheme) => ({
  variables: {
    '--font-display': resolvedTheme.headings.fontFamily
  },
  light: {
    '--page-bg': resolvedTheme.other.pageBgLight,
    '--text-main': resolvedTheme.other.textMainLight,
    '--text-soft': resolvedTheme.other.textSoftLight,
    '--text-muted': resolvedTheme.other.textMutedLight,
    '--text-label': resolvedTheme.other.textLabelLight,
    '--text-placeholder': resolvedTheme.other.textPlaceholderLight,
    '--mantine-color-text': 'var(--text-main)',
    '--mantine-color-dimmed': 'var(--text-muted)',
    '--mantine-color-placeholder': 'var(--text-placeholder)',
    '--mantine-color-body': 'var(--page-bg)',
    '--mantine-color-default': 'var(--field-bg)',
    '--mantine-color-default-hover': 'var(--field-bg-hover)',
    '--mantine-color-default-border': 'var(--field-border)'
  },
  dark: {
    '--page-bg': resolvedTheme.other.pageBgDark,
    '--text-main': resolvedTheme.other.textMainDark,
    '--text-soft': resolvedTheme.other.textSoftDark,
    '--text-muted': resolvedTheme.other.textMutedDark,
    '--text-label': resolvedTheme.other.textLabelDark,
    '--text-placeholder': resolvedTheme.other.textPlaceholderDark,
    '--mantine-color-text': 'var(--text-main)',
    '--mantine-color-dimmed': 'var(--text-muted)',
    '--mantine-color-placeholder': 'var(--text-placeholder)',
    '--mantine-color-body': 'var(--page-bg)',
    '--mantine-color-default': 'var(--field-bg)',
    '--mantine-color-default-hover': 'var(--field-bg-hover)',
    '--mantine-color-default-border': 'var(--field-border)'
  }
});
