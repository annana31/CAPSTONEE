/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./resources/**/*.{js,jsx,ts,tsx}",
    "./resources/views/**/*.blade.php",
  ],
  theme: {
    extend: {
      spacing: {
        '100': '25rem',  // ← adds mb-100, mt-100, p-100, etc.
      }
    },
  },
  plugins: [],
}