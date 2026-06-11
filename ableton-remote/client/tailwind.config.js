/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'bg-base':     '#0f0f0f',
        'bg-card':     '#1a1a2e',
        'bg-elevated': '#242438',
        'accent':      '#7c3aed',
        'accent-dim':  '#4c1d95',
        'accent-light':'#a78bfa',
        'text-primary':'#f1f0ff',
        'text-muted':  '#8b8ba0',
        'success':     '#10b981',
        'danger':      '#ef4444',
        'warning':     '#f59e0b',
      },
    },
  },
  plugins: [],
};
