import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors
        brand: {
          sky: '#87CEEB',      // Bleu ciel - primary/info elements
          night: '#0B1220',    // Bleu nuit - headers, dark backgrounds
          white: '#FFFFFF',    // Blanc - card backgrounds
          light: '#F1F5F9',    // Gris clair - secondary backgrounds
          green: '#16A34A',    // Vert - success elements
        },
        // Semantic aliases for easier usage
        primary: {
          50: '#E8F6FC',
          100: '#D1EDFA',
          200: '#A3DBF5',
          300: '#87CEEB',       // Main brand sky blue
          400: '#5CB8E0',
          500: '#3AA2D5',
          600: '#2E82AA',
          700: '#236180',
          800: '#174155',
          900: '#0B1220',       // Brand night blue
        },
        success: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',       // Brand green
          700: '#15803D',
          800: '#166534',
          900: '#14532D',
        },
      },
    },
  },
  plugins: [],
};

export default config;
